import { config } from 'dotenv'
import { randomBytes, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { createMutation } from '../src/lib/sync.js'
import { createSeed } from '../src/lib/seed.js'
import type { AppData } from '../src/lib/types.js'
config({ path: '.env.local', quiet: true }); config({ quiet: true })
export async function verifyAPI(origin: string, fetcher: (request: Request) => Promise<Response> = fetch) {
  let cookie = '', registered = false, userId = ''
  const email = `tend-qa-${randomUUID()}@example.invalid`, password = randomBytes(24).toString('base64url'), checks: string[] = []
  const request = async (path: string, method = 'GET', body?: unknown) => {
    const protectedPath = !path.startsWith('/api/auth/') || /^\/api\/auth\/(sign-out|change-password|delete-user|update-user|list-sessions|revoke-)/.test(path)
    return fetcher(new Request(`${origin}${path}`, { method, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'x-real-ip': '127.0.0.1', ...(userId && protectedPath ? { 'X-Tend-Account': userId } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }))
  }
  const captureCookie = (response: Response) => { cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ') }
  const workspace = async () => { const response = await request('/api/workspace'); assert.equal(response.status, 200, 'Read journal failed'); return (await response.json()).data as AppData }
  try {
    const health = await request('/api/health'); assert.equal(health.status, 200, 'Health check failed'); assert.equal((await health.json()).database, 'connected'); checks.push('database-health')
    assert.equal((await request('/api/workspace')).status, 401, 'Private API accepted anonymous access'); checks.push('unauthorized-rejection')
    const signup = await request('/api/auth/sign-up/email', 'POST', { name: 'Temporary verification account', email, password }); assert.equal(signup.status, 200, 'Sign-up verification failed'); captureCookie(signup); userId = (await signup.json()).user.id; registered = true
    const init = await request('/api/workspace/initialize', 'POST', { seedHistory: false }); assert.equal(init.status, 200, 'Journal initialization failed')
    const base = await workspace(), next = structuredClone(base), entry = { ...createSeed().logs[0], id: randomUUID(), date: '2026-10-18', notes: 'Temporary automated persistence verification', fields: { 'qa-field': 'Verified' } }
    next.fields.push({ id: 'qa-field', name: 'QA field', type: 'text', options: [] }); next.logs.push(entry)
    next.workouts.push({ id: 'qa-workout', date: '2026-10-18', time: '', type: 'QA session', restDay: false, notes: 'Temporary verification', createdAt: new Date().toISOString(), exercises: [{ id: 'qa-exercise', name: 'QA exercise', sets: [{ id: 'qa-set', reps: 10, weight: 10, duration: 0 }] }] })
    let response = await request('/api/workspace', 'PATCH', await createMutation(base, next)); assert.equal(response.status, 200, 'Create records failed')
    let saved = await workspace(); assert.equal(saved.logs.find(l => l.id === entry.id)?.fields['qa-field'], 'Verified'); assert.equal(saved.workouts[0].exercises[0].sets[0].weight, 10); checks.push('activity-custom-field-workout-persistence')
    const edited = structuredClone(saved); edited.logs.find(l => l.id === entry.id)!.notes = 'Verified edit'; response = await request('/api/workspace', 'PATCH', await createMutation(saved, edited)); assert.equal(response.status, 200, 'Edit failed'); saved = await workspace(); assert.equal(saved.logs.find(l => l.id === entry.id)?.notes, 'Verified edit'); checks.push('historical-edit')
    const removed = structuredClone(saved); removed.logs = []; removed.workouts = []; removed.fields = []; response = await request('/api/workspace', 'PATCH', await createMutation(saved, removed)); assert.equal(response.status, 200, 'Delete failed'); assert.equal((await workspace()).logs.length, 0); checks.push('record-deletion')
    assert.equal((await request('/api/auth/sign-out', 'POST', {})).status, 200); assert.equal((await request('/api/workspace')).status, 401)
    const login = await request('/api/auth/sign-in/email', 'POST', { email, password }); assert.equal(login.status, 200, 'Login failed'); captureCookie(login); assert.equal((await request('/api/workspace')).status, 200); checks.push('login-logout-session-revocation')
    const deleted = await request('/api/auth/delete-user', 'POST', { password }); assert.equal(deleted.status, 200, 'Temporary account cleanup failed'); registered = false; assert.equal((await request('/api/workspace')).status, 401); checks.push('account-deletion')
    return { ok: true, origin, checks }
  } finally {
    if (registered) {
      let cleanup = await request('/api/auth/delete-user', 'POST', { password }).catch(() => null)
      if (cleanup?.status !== 200) {
        const login = await request('/api/auth/sign-in/email', 'POST', { email, password }).catch(() => null)
        if (login?.status === 200) { captureCookie(login); cleanup = await request('/api/auth/delete-user', 'POST', { password }).catch(() => null) }
      }
      if (cleanup?.status !== 200) console.error(JSON.stringify({ event: 'qa_cleanup_required', userId }))
    }
  }
}
if (process.argv[1]?.replaceAll('\\', '/').endsWith('/verify-api.ts')) {
  try {
    if (process.argv.includes('--direct')) {
      const { getDatabase } = await import('../server/db.js'), { getConfig } = await import('../server/config.js'), { createApp } = await import('../server/app.js')
      const client = getDatabase(), config = getConfig(), { app } = createApp(client, config)
      try { console.log(JSON.stringify(await verifyAPI(config.appURL, request => Promise.resolve(app.fetch(request))))) } finally { client.close() }
    } else { const url = process.argv[2]; if (!url || !/^https?:\/\//.test(url)) throw new Error('Pass a deployed URL, or use --direct for the configured Turso database.'); console.log(JSON.stringify(await verifyAPI(new URL(url).origin))) }
  } catch (error) { console.error(error instanceof Error ? error.message : 'API verification failed.'); process.exitCode = 1 }
}
