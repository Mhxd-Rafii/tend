import { openDB } from 'idb'
import type { AppData } from './types'
import type { Mutation } from './sync'
export interface CachedJournal { data: AppData; queue: Mutation[]; syncedAt: string; conflict: string }
export interface CachedSession { user: { id: string; name: string; email: string }; expiresAt: string }
const database = () => openDB('tend-cloud-cache', 1, { upgrade(db) { db.createObjectStore('journals'); db.createObjectStore('session'); db.createObjectStore('photos') } })
export async function cacheRead(userId: string): Promise<CachedJournal | undefined> { const db = await database(); try { return await db.get('journals', userId) } finally { db.close() } }
export async function cacheWrite(userId: string, journal: CachedJournal) { const db = await database(); try { await db.put('journals', journal, userId) } finally { db.close() } window.dispatchEvent(new Event('tend-sync-state')) }
export async function cachedSession(value?: CachedSession | null): Promise<CachedSession | undefined> { const db = await database(); try { if (value === null) await db.delete('session', 'last'); else if (value) await db.put('session', value, 'last'); return await db.get('session', 'last') } finally { db.close() } }
export async function forgetAccount(userId: string) { const db = await database(); try { await db.delete('journals', userId); await db.clear('photos'); await db.clear('session') } finally { db.close() } }
export async function photoCache(userId: string, uri: string, value?: string): Promise<string | undefined> { const db = await database(); try { const key = `${userId}:${uri}`; if (value) await db.put('photos', value, key); return await db.get('photos', key) } finally { db.close() } }
// Reads the previous edition only when a user explicitly imports it. Never creates seed data.
export async function legacyJournal(): Promise<AppData | null> {
  const db = await openDB('tend-personal-tracker', 1)
  try { return db.objectStoreNames.contains('workspace') ? await db.get('workspace', 'data') ?? null : null } finally { db.close() }
}
