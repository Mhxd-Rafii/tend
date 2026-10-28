import type { AppData, ActivityLog } from './types'
import { backupSchema } from './schemas'
import { api, ApiError, setExpectedUser } from './http'
import { cacheRead, cacheWrite, photoCache, type CachedJournal } from './cache'
import { createMutation, fingerprint, type Mutation } from './sync'
let userId: string | null = null
let serial: Promise<unknown> = Promise.resolve()
export function setRepositoryUser(id: string | null) { userId = id; setExpectedUser(id) }
function account() { if (!userId) throw new Error('Sign in to open your journal.'); return userId }
function lock<T>(operation: () => Promise<T>): Promise<T> { const result = serial.then(operation, operation); serial = result.catch(() => {}); return result }
export class InitializationRequired extends Error { constructor() { super('Choose how to start your account journal.'); this.name = 'InitializationRequired' } }
type Response = { initialized: boolean; userId: string; data?: AppData }
function assertOwner(result: Response) { if (result.userId !== account()) { window.dispatchEvent(new Event('tend-session-expired')); throw new ApiError(401, 'SESSION_CHANGED', 'The signed-in account changed. Reopen your journal.') } }
async function fetchServer(): Promise<AppData> { const result = await api<Response>('/api/workspace'); if (!result.initialized || !result.data) throw new InitializationRequired(); assertOwner(result); return backupSchema.parse(result.data) }
async function sendMutation(mutation: Mutation): Promise<AppData> {
  const content = JSON.stringify(mutation)
  let result: Response
  if (new TextEncoder().encode(content).length <= 3_000_000) result = await api('/api/workspace', { method: 'PATCH', body: content })
  else {
    const size = 500000, parts = Math.ceil(content.length / size)
    if (parts > 256) throw new Error('This import is too large. Use a smaller backup.')
    for (let part = 0; part < parts; part++) await api(`/api/changes/${mutation.mutationId}/parts`, { method: 'POST', body: JSON.stringify({ part, content: content.slice(part * size, (part + 1) * size) }) })
    result = await api(`/api/changes/${mutation.mutationId}/commit`, { method: 'POST', body: JSON.stringify({ parts, requestHash: await fingerprint(mutation) }) })
  }
  if (!result.data) throw new Error('The server did not confirm the journal change.')
  assertOwner(result)
  return backupSchema.parse(result.data)
}
async function normalizePhotos(id: string, cached: CachedJournal) {
  const queue = structuredClone(cached.queue), uris = new Map<string, string>(), hashes = new Map<string, string>()
  for (const mutation of queue) for (const op of mutation.operations) {
    if (op.before && hashes.has(op.before)) op.before = hashes.get(op.before)!
    if (op.collection !== 'logs' || !op.after) continue
    const log = op.after as ActivityLog
    if (!log.photo.startsWith('data:image/')) continue
    const oldHash = await fingerprint(log), original = log.photo
    if (!uris.has(original)) { const upload = await api<{ photo: string }>('/api/photos', { method: 'POST', body: JSON.stringify({ data: original }) }); uris.set(original, upload.photo); await photoCache(id, upload.photo, original) }
    log.photo = uris.get(original)!
    hashes.set(oldHash, await fingerprint(log))
  }
  const data = structuredClone(cached.data); data.logs.forEach(l => { if (uris.has(l.photo)) l.photo = uris.get(l.photo)! })
  const next = { ...cached, data, queue }; await cacheWrite(id, next); return next
}
async function flush(id: string): Promise<AppData | undefined> {
  let cached = await cacheRead(id)
  if (!cached?.queue.length) return cached?.data
  cached = await normalizePhotos(id, cached)
  let confirmed: AppData | undefined
  while (cached.queue.length) {
    try {
      confirmed = await sendMutation(cached.queue[0])
      cached = { ...cached, queue: cached.queue.slice(1), conflict: '', syncedAt: new Date().toISOString() }
      if (!cached.queue.length) cached.data = confirmed
      await cacheWrite(id, cached)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Changes could not sync.'
      await cacheWrite(id, { ...cached, conflict: message })
      throw error
    }
  }
  return confirmed
}
export function readData(): Promise<AppData> {
  const id = account()
  return lock(async () => {
    if (!navigator.onLine) { const cached = await cacheRead(id); if (!cached) throw new Error('Connect once to load this account’s journal before using it offline.'); return cached.data }
    await flush(id)
    const data = await fetchServer(); await cacheWrite(id, { data, queue: [], syncedAt: new Date().toISOString(), conflict: '' }); return data
  })
}
export function mutateData(change: (draft: AppData) => void): Promise<AppData> {
  const id = account()
  return lock(async () => {
    if (navigator.onLine) await flush(id)
    const cached = await cacheRead(id)
    if (!cached) throw new Error('Load your journal before making changes.')
    const draft = structuredClone(cached.data); change(draft)
    const parsed = backupSchema.parse(draft), mutation = await createMutation(cached.data, parsed)
    if (!mutation.operations.length) return cached.data
    if (!navigator.onLine && mutation.operations.some(op => op.collection !== 'logs')) throw new Error('Reconnect to change habits, templates, workouts, fields, or preferences. Activity entries can be queued offline.')
    await cacheWrite(id, { ...cached, data: parsed, queue: [...cached.queue, mutation], conflict: '' })
    if (!navigator.onLine) return parsed
    const confirmed = await flush(id); if (!confirmed) throw new Error('The server did not confirm this save.'); return confirmed
  })
}
export async function initialize(seedHistory: boolean) { const id = account(); const response = await api<Response>('/api/workspace/initialize', { method: 'POST', body: JSON.stringify({ seedHistory }) }); if (!response.data) throw new Error('Initialization was not confirmed.'); await cacheWrite(id, { data: response.data, queue: [], conflict: '', syncedAt: new Date().toISOString() }); return response.data }
export async function resetJournal() { const id = account(), cached = await cacheRead(id); if (!cached || cached.queue.length) throw new Error('Sync or resolve pending changes before erasing the account journal.'); const response = await api<Response>('/api/workspace/reset', { method: 'POST', body: JSON.stringify({ confirmation: 'ERASE', revision: cached.data.revision }) }); if (!response.data) throw new Error('The server did not confirm the reset.'); await cacheWrite(id, { data: response.data, queue: [], conflict: '', syncedAt: new Date().toISOString() }) }
export async function pendingChanges() { return userId ? (await cacheRead(userId))?.queue.length ?? 0 : 0 }
export async function pendingSnapshot() { const cached = await cacheRead(account()); if (!cached) throw new Error('No cached journal.'); return cached.data }
export async function syncInfo() { const cached = userId ? await cacheRead(userId) : undefined; return { queued: cached?.queue.length ?? 0, error: cached?.conflict ?? '', syncedAt: cached?.syncedAt ?? '' } }
export async function discardPending() {
  const id = account()
  return lock(async () => { if (!navigator.onLine) throw new Error('Reconnect to load the server version.'); const data = await fetchServer(); await cacheWrite(id, { data, queue: [], conflict: '', syncedAt: new Date().toISOString() }); return data })
}
export function parseBackup(text: string): AppData { return backupSchema.parse(JSON.parse(text)) }
export function mergeBackup(current: AppData, imported: AppData) {
  for (const key of ['categories', 'templates', 'logs', 'fields', 'workouts', 'workoutTemplates'] as const) { const existing = new Set(current[key].map(x => x.id)); (current[key] as { id: string }[]).push(...imported[key].filter(x => !existing.has(x.id))) }
  backupSchema.parse(current)
}
function asDataURI(blob: Blob): Promise<string> { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob) }) }
export async function resolvePhoto(uri: string): Promise<string> {
  if (!uri.startsWith('/api/photos/')) return uri
  const id = account(), cached = await photoCache(id, uri)
  if (!navigator.onLine) return cached ?? ''
  const response = await fetch(uri, { credentials: 'same-origin', cache: 'no-store' })
  if (!response.ok) { if (cached) return cached; throw new ApiError(response.status, 'PHOTO_UNAVAILABLE', 'Photo unavailable') }
  const data = await asDataURI(await response.blob()); await photoCache(id, uri, data); return data
}
export async function portableBackup(data: AppData) { const copy = structuredClone(data); for (const log of copy.logs) if (log.photo) { const photo = await resolvePhoto(log.photo); if (!photo) throw new Error('Connect to download the photos needed for a complete backup.'); log.photo = photo } return copy }
