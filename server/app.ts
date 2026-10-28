import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { stream } from 'hono/streaming'
import { createHash, randomUUID } from 'node:crypto'
import { z, ZodError } from 'zod'
import type { Client } from '@libsql/client'
import type { ServerConfig } from './config.js'
import { createAuth } from './auth.js'
import { AppError, initializeWorkspace, loadWorkspace, mutateWorkspace, resetWorkspace } from './workspace.js'
import { mutationSchema, SyncConflict } from '../src/lib/sync.js'
import type { AppData } from '../src/lib/types.js'

type Session = { user: { id: string; name: string; email: string }; session: { id: string; expiresAt: Date } }
type Env = { Variables: { session: Session } }
export function createApp(client: Client, config: ServerConfig) {
  const auth = createAuth(client, config), app = new Hono<Env>()
  app.use('/api/*', async (c, next) => {
    c.header('Cache-Control', 'private, no-store'); c.header('Vary', 'Cookie'); c.header('X-Content-Type-Options', 'nosniff'); c.header('X-Frame-Options', 'DENY'); c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
      const origin = c.req.header('Origin')
      if (!origin || !config.trustedOrigins.includes(origin)) return c.json({ error: { code: 'INVALID_ORIGIN', message: 'This request did not originate from this application.' } }, 403)
      if (!c.req.header('Content-Type')?.startsWith('application/json')) return c.json({ error: { code: 'INVALID_CONTENT_TYPE', message: 'A JSON request is required.' } }, 415)
    }
    await next()
  })
  app.use('/api/*', bodyLimit({ maxSize: 3_500_000, onError: c => c.json({ error: { code: 'REQUEST_TOO_LARGE', message: 'This request is too large. Upload large imports in parts.' } }, 413) }))
  app.get('/api/health', async c => {
    await client.execute('SELECT 1')
    const result = await client.execute('SELECT version FROM tend_schema_migrations ORDER BY version DESC LIMIT 1')
    return c.json({ ok: true, service: 'tend-api', database: 'connected', migrations: result.rows.length ? 'current' : 'pending' })
  })
  app.get('/api/config', c => c.json({ passwordResetEnabled: config.emailEnabled }))
  app.on(['GET', 'POST'], '/api/auth/*', async (c): Promise<Response> => {
    const expected = c.req.header('X-Tend-Account')
    if (expected && (await auth.api.getSession({ headers: c.req.raw.headers }))?.user.id !== expected) return c.json({ error: { code: 'SESSION_CHANGED', message: 'The signed-in account changed. Reopen your journal.' } }, 401)
    if (!config.emailEnabled && ['/api/auth/request-password-reset', '/api/auth/forget-password'].includes(c.req.path)) return c.json({ error: { code: 'EMAIL_NOT_CONFIGURED', message: 'Password reset email has not been enabled by the app owner.' } }, 503)
    return auth.handler(c.req.raw)
  })
  app.get('/api/session', async c => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    return c.json(session ? { user: { id: session.user.id, email: session.user.email, name: session.user.name }, expiresAt: session.session.expiresAt.toISOString() } : null)
  })
  app.use('/api/*', async (c, next) => {
    const session = await auth.api.getSession({ headers: c.req.raw.headers })
    if (!session) return c.json({ error: { code: 'UNAUTHORIZED', message: 'Sign in to access your journal.' } }, 401)
    if (c.req.header('X-Tend-Account') && c.req.header('X-Tend-Account') !== session.user.id) return c.json({ error: { code: 'SESSION_CHANGED', message: 'The signed-in account changed. Reopen your journal.' } }, 401)
    c.set('session', session); await next()
  })
  // Streaming keeps a large metadata history below the serverless buffered-response ceiling.
  const workspaceResponse = (c: Context<Env>, data: AppData) => {
    c.header('Content-Type', 'application/json; charset=utf-8')
    return stream(c, async output => { const bytes = new TextEncoder().encode(JSON.stringify({ initialized: true, userId: c.get('session').user.id, data })); for (let i = 0; i < bytes.length; i += 16000) await output.write(bytes.slice(i, i + 16000)) })
  }
  app.get('/api/workspace', async c => { const data = await loadWorkspace(client, c.get('session').user.id); return data ? workspaceResponse(c, data) : c.json({ initialized: false }) })
  app.post('/api/workspace/initialize', async c => {
    const body = z.object({ seedHistory: z.boolean() }).strict().parse(await c.req.json())
    const user = c.get('session').user
    const data = await initializeWorkspace(client, user.id, { seedHistory: body.seedHistory, name: user.name })
    return workspaceResponse(c, data)
  })
  app.patch('/api/workspace', async c => {
    const mutation = mutationSchema.parse(await c.req.json())
    const data = await mutateWorkspace(client, c.get('session').user.id, mutation)
    return workspaceResponse(c, data)
  })
  app.post('/api/workspace/reset', async c => { const body = z.object({ confirmation: z.literal('ERASE'), revision: z.number().int().nonnegative() }).strict().parse(await c.req.json()); return workspaceResponse(c, await resetWorkspace(client, c.get('session').user.id, body.revision)) })
  app.post('/api/changes/:uploadId/parts', async c => {
    const uploadId = z.uuid().parse(c.req.param('uploadId')), body = z.object({ part: z.number().int().min(0).max(255), content: z.string().max(600000) }).strict().parse(await c.req.json()), userId = c.get('session').user.id
    const tx = await client.transaction('write')
    try {
      const previous = await tx.execute({ sql: 'SELECT content FROM tend_upload_parts WHERE user_id=? AND upload_id=? AND part=?', args: [userId, uploadId, body.part] })
      await tx.execute({ sql: 'DELETE FROM tend_upload_parts WHERE user_id=? AND created_at<?', args: [userId, new Date(Date.now() - 86400000).toISOString()] })
      if (previous.rows.length && previous.rows[0].content !== body.content) throw new AppError(409, 'UPLOAD_CONFLICT', 'A different upload already uses this part ID.')
      await tx.execute({ sql: 'INSERT INTO tend_upload_parts(user_id,upload_id,part,content,created_at) VALUES(?,?,?,?,?) ON CONFLICT(user_id,upload_id,part) DO NOTHING', args: [userId, uploadId, body.part, body.content, new Date().toISOString()] })
      await tx.commit()
    } catch (error) { await tx.rollback().catch(() => {}); throw error } finally { tx.close() }
    return c.json({ accepted: true, part: body.part })
  })
  app.post('/api/changes/:uploadId/commit', async c => {
    const uploadId = z.uuid().parse(c.req.param('uploadId')), body = z.object({ parts: z.number().int().min(1).max(256), requestHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(await c.req.json()), userId = c.get('session').user.id
    const receipt = await client.execute({ sql: 'SELECT request_hash FROM tend_mutation_receipts WHERE user_id=? AND mutation_id=?', args: [userId, uploadId] })
    if (receipt.rows.length) { if (receipt.rows[0].request_hash !== body.requestHash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'A different request already used this ID.'); const data = await loadWorkspace(client, userId); if (!data) throw new AppError(404, 'NOT_FOUND', 'Journal not found'); return workspaceResponse(c, data) }
    const result = await client.execute({ sql: 'SELECT part,content FROM tend_upload_parts WHERE user_id=? AND upload_id=? ORDER BY part', args: [userId, uploadId] })
    if (result.rows.length !== body.parts || result.rows.some((row, i) => Number(row.part) !== i)) throw new AppError(409, 'INCOMPLETE_UPLOAD', 'Some import parts are missing. Retry the upload.')
    const text = result.rows.map(row => String(row.content)).join('')
    const mutation = mutationSchema.parse(JSON.parse(text))
    const { fingerprint } = await import('../src/lib/sync.js')
    if (mutation.mutationId !== uploadId || await fingerprint(mutation) !== body.requestHash) throw new AppError(400, 'INVALID_UPLOAD', 'The import contents did not match their checksum.')
    const data = await mutateWorkspace(client, userId, mutation)
    await client.execute({ sql: 'DELETE FROM tend_upload_parts WHERE user_id=? AND upload_id=?', args: [userId, uploadId] })
    return workspaceResponse(c, data)
  })
  app.post('/api/photos', async c => {
    const { data: uri } = z.object({ data: z.string().max(2_900_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/) }).strict().parse(await c.req.json())
    const [header, content] = uri.split(','), bytes = Buffer.from(content, 'base64'), mime = header.slice(5, header.indexOf(';'))
    if (bytes.length > 2 * 1024 * 1024 || bytes.length < 12) throw new AppError(413, 'INVALID_PHOTO_SIZE', 'Photos must be valid images under 2 MB.')
    const valid = mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
    if (!valid) throw new AppError(400, 'INVALID_PHOTO', 'The photo contents do not match the image type.')
    const userId = c.get('session').user.id, sha = createHash('sha256').update(bytes).digest('hex'), id = randomUUID()
    await client.execute({ sql: 'INSERT INTO tend_photos(user_id,id,sha256,mime_type,bytes,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,sha256) DO NOTHING', args: [userId, id, sha, mime, bytes, new Date().toISOString()] })
    const result = await client.execute({ sql: 'SELECT id FROM tend_photos WHERE user_id=? AND sha256=?', args: [userId, sha] })
    return c.json({ photo: `/api/photos/${result.rows[0].id}` })
  })
  app.get('/api/photos/:id', async c => {
    const id = z.uuid().parse(c.req.param('id')), result = await client.execute({ sql: 'SELECT mime_type,bytes FROM tend_photos WHERE user_id=? AND id=?', args: [c.get('session').user.id, id] })
    if (!result.rows.length) throw new AppError(404, 'NOT_FOUND', 'Photo not found')
    c.header('Content-Type', String(result.rows[0].mime_type)); c.header('Content-Disposition', 'inline'); return c.body(new Uint8Array(result.rows[0].bytes as ArrayBuffer))
  })
  app.notFound(c => c.json({ error: { code: 'NOT_FOUND', message: 'API endpoint not found.' } }, 404))
  app.onError((error, c) => {
    if (error instanceof AppError) return c.json({ error: { code: error.code, message: error.message } }, error.status)
    if (error instanceof SyncConflict) return c.json({ error: { code: 'SYNC_CONFLICT', message: error.message, records: error.records } }, 409)
    if (error instanceof ZodError) return c.json({ error: { code: 'VALIDATION_ERROR', message: error.issues[0]?.message || 'Invalid request' } }, 400)
    if (error instanceof SyntaxError) return c.json({ error: { code: 'INVALID_JSON', message: 'The request is not valid JSON.' } }, 400)
    // Never log SQL, credentials, incoming bodies, password hashes, or raw driver errors.
    console.error(JSON.stringify({ event: 'api_failure', requestId: randomUUID(), area: c.req.path.startsWith('/api/auth/') ? 'auth' : 'api', category: 'backend_unavailable' }))
    return c.json({ error: { code: 'BACKEND_UNAVAILABLE', message: 'The server could not access your journal. Nothing was saved. Please retry.' } }, 503)
  })
  return { app, auth }
}
