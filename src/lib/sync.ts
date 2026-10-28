import { z } from 'zod'
import { backupSchema } from './schemas.js'
import type { AppData } from './types.js'
export const collections = ['categories', 'templates', 'logs', 'fields', 'workouts', 'workoutTemplates'] as const
export type Collection = typeof collections[number]
export const operationSchema = z.object({ collection: z.enum([...collections, 'preferences']), id: z.string().min(1).max(150), before: z.string().regex(/^[a-f0-9]{64}$/).nullable(), after: z.unknown().nullable() }).strict()
export const mutationSchema = z.object({ mutationId: z.uuid(), baseRevision: z.number().int().nonnegative(), operations: z.array(operationSchema).min(1).max(220000) }).strict()
export type Operation = z.infer<typeof operationSchema>
export type Mutation = z.infer<typeof mutationSchema>
export function canonical(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  return `{${Object.keys(value).filter(k => (value as Record<string, unknown>)[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`).join(',')}}`
}
export async function fingerprint(value: unknown): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical(value)))
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('')
}
export async function createMutation(before: AppData, after: AppData): Promise<Mutation> {
  const operations: Operation[] = []
  for (const collection of collections) {
    const previous = new Map(before[collection].map(value => [value.id, value]))
    const next = new Map(after[collection].map(value => [value.id, value]))
    for (const id of new Set([...previous.keys(), ...next.keys()])) {
      const a = previous.get(id), b = next.get(id)
      if (canonical(a) !== canonical(b)) operations.push({ collection, id, before: a ? await fingerprint(a) : null, after: b ?? null })
    }
  }
  if (canonical(before.preferences) !== canonical(after.preferences)) operations.push({ collection: 'preferences', id: 'preferences', before: await fingerprint(before.preferences), after: after.preferences })
  return { mutationId: crypto.randomUUID(), baseRevision: before.revision, operations }
}
export const entitySchemas = { categories: backupSchema.shape.categories.element, templates: backupSchema.shape.templates.element, logs: backupSchema.shape.logs.element, fields: backupSchema.shape.fields.element, workouts: backupSchema.shape.workouts.element, workoutTemplates: backupSchema.shape.workoutTemplates.element, preferences: backupSchema.shape.preferences }
export async function applyOperations(data: AppData, mutation: Mutation) {
  const next = structuredClone(data), seen = new Set<string>()
  for (const op of mutation.operations) {
    const key = `${op.collection}:${op.id}`
    if (seen.has(key)) throw new Error('A request cannot edit the same record twice')
    seen.add(key)
    const current = op.collection === 'preferences' ? next.preferences : next[op.collection].find(r => r.id === op.id)
    const currentHash = current ? await fingerprint(current) : null
    if (currentHash !== op.before) throw new SyncConflict([key])
    if (op.collection === 'preferences') { if (op.after === null || op.id !== 'preferences') throw new Error('Preferences cannot be deleted'); next.preferences = entitySchemas.preferences.parse(op.after); continue }
    const list = next[op.collection] as { id: string }[]
    const index = list.findIndex(r => r.id === op.id)
    if (op.after === null) { if (index >= 0) list.splice(index, 1) }
    else { const value = entitySchemas[op.collection].parse(op.after); if (value.id !== op.id) throw new Error('Record ID mismatch'); if (index >= 0) list[index] = value; else list.push(value) }
  }
  return backupSchema.parse(next)
}
export class SyncConflict extends Error {
  records: string[]
  constructor(records: string[]) { super('These records changed on another device. Your changes were not uploaded.'); this.name = 'SyncConflict'; this.records = records }
}
