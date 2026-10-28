import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { createApp } from '../../server/app'
import { migrate } from '../../server/migrate'
import { getConfig } from '../../server/config'
import { createMutation } from '../../src/lib/sync'
import type { AppData } from '../../src/lib/types'
const origin = 'http://localhost:5173', password = 'Correct-horse-plant-2026!'
let client: Client, application: ReturnType<typeof createApp>
beforeEach(async () => {
  client = createClient({ url: 'file::memory:' })
  await client.execute('PRAGMA foreign_keys=ON'); await migrate(client)
  application = createApp(client, { databaseURL: 'file:test-only', sessionSecret: 'test-secret-with-at-least-32-characters-long', appURL: origin, trustedOrigins: [origin], production: false, emailEnabled: false })
})
afterEach(() => { client?.close() })
function request(path: string, cookie = '', method = 'GET', body?: unknown, extra: Record<string, string> = {}) { return application.app.request(`${origin}${path}`, { method, headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie, 'x-real-ip': '127.0.0.1', ...extra }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }) }
async function register(email = 'owner@example.test') {
  const response = await request('/api/auth/sign-up/email', '', 'POST', { email, name: 'Tester', password })
  expect(response.status).toBe(200)
  const body = await response.json()
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  expect(cookie).toBeTruthy(); return { cookie, userId: body.user.id as string, headers: response.headers }
}
async function workspace(cookie: string) { const response = await request('/api/workspace', cookie); expect(response.status).toBe(200); return (await response.json()).data as AppData }
async function initialize(cookie: string, seedHistory = true) { const response = await request('/api/workspace/initialize', cookie, 'POST', { seedHistory }); expect(response.status).toBe(200); return (await response.json()).data as AppData }
describe('Turso-compatible server integration', () => {
  it('applies migrations once and reports health without exposing secrets', async () => {
    expect(await migrate(client)).toEqual([])
    const response = await request('/api/health'); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ ok: true, database: 'connected', migrations: 'current' })
    expect(() => getConfig({})).toThrow(/TURSO_AUTH_TOKEN/)
  })
  it('hashes passwords, sets HttpOnly sessions and protects private APIs', async () => {
    expect((await request('/api/workspace')).status).toBe(401)
    const user = await register(), stored = await client.execute('SELECT password FROM tend_accounts')
    expect(stored.rows[0].password).not.toBe(password); expect(String(stored.rows[0].password).length).toBeGreaterThan(60)
    expect(user.headers.get('set-cookie')).toMatch(/HttpOnly/i); expect(user.headers.get('set-cookie')).toMatch(/SameSite=Lax/i)
    expect((await request('/api/session', user.cookie)).status).toBe(200)
    expect(await (await request('/api/workspace', user.cookie)).json()).toEqual({ initialized: false })
    const data = await initialize(user.cookie); expect(data.logs).toHaveLength(10); expect(data.logs.filter(l => l.duplicate)).toHaveLength(2)
    expect((await request('/api/workspace/initialize', user.cookie, 'POST', { seedHistory: false })).status).toBe(409)
    await request('/api/auth/sign-out', user.cookie, 'POST', {}); expect((await request('/api/workspace', user.cookie)).status).toBe(401)
  })
  it('persists record changes, deduplicates retries and rejects stale conflicting edits', async () => {
    const user = await register(), base = await initialize(user.cookie), next = structuredClone(base)
    next.logs[0].notes = "'); DROP TABLE tend_users; --"
    const mutation = await createMutation(base, next)
    expect((await request('/api/workspace', user.cookie, 'PATCH', mutation)).status).toBe(200)
    expect((await request('/api/workspace', user.cookie, 'PATCH', mutation)).status).toBe(200)
    const saved = await workspace(user.cookie); expect(saved.revision).toBe(1); expect(saved.logs.find(l => l.id === 'seed-1')!.notes).toBe(next.logs[0].notes)
    const stale = structuredClone(base); stale.logs[0].notes = 'Stale edit'
    expect((await request('/api/workspace', user.cookie, 'PATCH', await createMutation(base, stale))).status).toBe(409)
    expect((await client.execute('SELECT COUNT(*) AS count FROM tend_users')).rows[0].count).toBe(1)
  })
  it('merges edits to different records and prevents cross-user access', async () => {
    const a = await register(), base = await initialize(a.cookie), b = await register('second@example.test'); await initialize(b.cookie, false)
    const first = structuredClone(base), second = structuredClone(base); first.logs[0].notes = 'Device one'; second.logs[1].notes = 'Device two'
    expect((await request('/api/workspace', a.cookie, 'PATCH', await createMutation(base, first))).status).toBe(200)
    expect((await request('/api/workspace', a.cookie, 'PATCH', await createMutation(base, second))).status).toBe(200)
    const rows = await workspace(a.cookie); expect(rows.logs.find(l => l.id === 'seed-1')?.notes).toBe('Device one'); expect(rows.logs.find(l => l.id === 'seed-2')?.notes).toBe('Device two')
    expect((await request('/api/workspace', b.cookie, 'PATCH', await createMutation(base, first))).status).toBe(409)
    expect((await workspace(b.cookie)).logs).toEqual([])
    expect((await (await request(`/api/workspace?userId=${a.userId}`, b.cookie)).json()).data.logs).toEqual([])
  })
  it('stores typed fields, habit schedules, workouts, exercises and sets in owned tables', async () => {
    const user = await register(), base = await initialize(user.cookie), next = structuredClone(base)
    next.fields.push({ id: 'brand', name: 'Oil brand', type: 'text', options: [] }); next.logs[0].fields.brand = 'Coconut'
    next.templates[0] = { ...next.templates[0], kind: 'habit', startDate: '2026-10-01' }
    next.workouts.push({ id: 'workout-test', date: '2026-10-01', time: '', type: 'Chest', notes: '', restDay: false, createdAt: new Date().toISOString(), exercises: [{ id: 'bench', name: 'Bench press', sets: [{ id: 'set-1', weight: 40, reps: 10, duration: 0 }] }] })
    const response = await request('/api/workspace', user.cookie, 'PATCH', await createMutation(base, next)); expect(response.status).toBe(200)
    const saved = await workspace(user.cookie); expect(saved.logs.find(l => l.id === 'seed-1')?.fields.brand).toBe('Coconut'); expect(saved.workouts[0].exercises[0].sets[0].weight).toBe(40)
    for (const table of ['tend_habits', 'tend_custom_field_values', 'tend_workout_sessions', 'tend_exercises', 'tend_workout_sets']) expect((await client.execute(`SELECT COUNT(*) AS count FROM ${table}`)).rows[0].count).toBe(1)
  })
  it('requires a trusted origin, rejects bad data and rate limits login attempts', async () => {
    expect((await request('/api/auth/sign-in/email', '', 'POST', { email: 'x@example.test', password }, { Origin: 'https://evil.example' })).status).toBe(403)
    const user = await register(); await initialize(user.cookie)
    expect((await request('/api/workspace', user.cookie, 'PATCH', { userId: user.userId })).status).toBe(400)
    let status = 0
    for (let i = 0; i < 6; i++) status = (await request('/api/auth/sign-in/email', '', 'POST', { email: 'owner@example.test', password: 'wrong-password' })).status
    expect(status).toBe(429)
  })
  it('keeps photo access private and makes upload retries idempotent', async () => {
    const a = await register(), b = await register('other@example.test')
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
    const uploaded = await request('/api/photos', a.cookie, 'POST', { data: png }); expect(uploaded.status).toBe(200); const { photo } = await uploaded.json()
    expect((await (await request('/api/photos', a.cookie, 'POST', { data: png })).json()).photo).toBe(photo)
    expect((await request(photo, b.cookie)).status).toBe(404); expect((await request(photo)).status).toBe(401); expect((await request(photo, a.cookie)).headers.get('content-type')).toContain('image/png')
  })
  it('rejects a stale browser account header and erases only the owning journal', async () => {
    const a = await register(), b = await register('second@example.test'), original = await initialize(a.cookie); await initialize(b.cookie)
    expect((await request('/api/workspace', b.cookie, 'GET', undefined, { 'X-Tend-Account': a.userId })).status).toBe(401)
    expect((await request('/api/workspace/reset', a.cookie, 'POST', { confirmation: 'ERASE', revision: original.revision })).status).toBe(200)
    expect((await workspace(a.cookie)).logs).toHaveLength(0); expect((await workspace(b.cookie)).logs).toHaveLength(10)
    const deleted = await request('/api/auth/delete-user', a.cookie, 'POST', { password }); expect(deleted.status).toBe(200)
    expect((await client.execute({ sql: 'SELECT COUNT(*) AS count FROM tend_workspaces WHERE user_id=?', args: [a.userId] })).rows[0].count).toBe(0)
    expect((await workspace(b.cookie)).logs).toHaveLength(10)
  })
  it('returns sanitized errors when the database is unavailable', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(client, 'execute').mockRejectedValue(new Error('secret-database-token-and-raw-sql'))
    const response = await request('/api/health'); expect(response.status).toBe(503); expect(await response.text()).not.toContain('secret-database-token'); expect(JSON.stringify(logger.mock.calls)).not.toContain('secret-database-token')
  })
})
