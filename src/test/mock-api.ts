import { vi } from 'vitest'
import { createSeed } from '../lib/seed'
import { applyOperations, type Mutation } from '../lib/sync'
import { setRepositoryUser } from '../lib/repository'
import { cacheWrite } from '../lib/cache'
import type { AppData } from '../lib/types'
export const testAccount = { id: 'test-account', name: 'Tester', email: 'tester@example.test' }
export async function mockApi() {
  let data = createSeed(), fail = false, loseReply = false
  const receipts = new Set<string>()
  const fetch = vi.fn(async (input: RequestInfo | URL, options: RequestInit = {}) => {
    const path = String(input), method = options.method || 'GET'
    const json = (body: unknown, status = 200) => Response.json(body, { status })
    if (fail) return json({ error: { code: 'BACKEND_UNAVAILABLE', message: 'Database unavailable. Nothing was confirmed.' } }, 503)
    if (path === '/api/session') return json({ user: testAccount, expiresAt: new Date(Date.now() + 86400000).toISOString() })
    if (path === '/api/workspace' && method === 'GET') return json({ initialized: true, userId: testAccount.id, data })
    if (path === '/api/workspace' && method === 'PATCH') {
      const mutation = JSON.parse(options.body as string) as Mutation
      if (!receipts.has(mutation.mutationId)) { try { data = await applyOperations(data, mutation); data.revision++; receipts.add(mutation.mutationId) } catch { return json({ error: { code: 'SYNC_CONFLICT', message: 'Changed on another device.' } }, 409) } }
      if (loseReply) { loseReply = false; throw new TypeError('Network connection interrupted after commit') }
      return json({ initialized: true, userId: testAccount.id, data })
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Unknown test endpoint' } }, 404)
  })
  vi.stubGlobal('fetch', fetch); setRepositoryUser(testAccount.id)
  await cacheWrite(testAccount.id, { data, queue: [], syncedAt: new Date().toISOString(), conflict: '' })
  return { fetch, get data() { return structuredClone(data) }, fail: (value: boolean) => { fail = value }, loseReply: () => { loseReply = true }, replace: (value: AppData) => { data = structuredClone(value) } }
}
