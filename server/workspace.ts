import type { Client, Transaction, InStatement, Row } from '@libsql/client'
import { createSeed, newTemplate } from '../src/lib/seed.js'
import { backupSchema } from '../src/lib/schemas.js'
import { applyOperations, fingerprint, type Mutation, type Operation } from '../src/lib/sync.js'
import { isDuplicate } from '../src/lib/analytics.js'
import { today } from '../src/lib/dates.js'
import type { ActivityLog, ActivityTemplate, AppData, WorkoutExercise, WorkoutSession } from '../src/lib/types.js'
type Reader = Pick<Transaction, 'batch' | 'execute'>
const decode = <T>(value: unknown): T => JSON.parse(String(value)) as T
const now = () => new Date().toISOString()
export class AppError extends Error { constructor(public status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503, public code: string, message: string) { super(message) } }
export async function loadWorkspace(reader: Reader, userId: string): Promise<AppData | null> {
  const tables = ['workspaces', 'categories', 'activity_templates', 'habits', 'activity_logs', 'custom_fields', 'custom_field_values', 'workout_templates', 'workout_sessions', 'exercises', 'workout_sets', 'preferences']
  const result = await reader.batch(tables.map(table => ({ sql: `SELECT * FROM tend_${table} WHERE user_id=?`, args: [userId] })))
  if (!result[0].rows.length) return null
  const rows = (i: number) => result[i].rows
  const habits = new Map(rows(3).map(row => [String(row.template_id), row]))
  const templates = rows(2).map(row => {
    const h = habits.get(String(row.id))
    return newTemplate({ ...decode<Partial<ActivityTemplate>>(row.data_json), id: String(row.id), name: String(row.name), categoryId: String(row.category_id), kind: row.kind as ActivityTemplate['kind'], state: row.state as ActivityTemplate['state'], ...(h ? { startDate: String(h.start_date), endDate: String(h.end_date), schedule: decode<ActivityTemplate['schedule']>(h.schedule_json), goal: Number(h.goal), reminder: String(h.reminder), pauses: decode<ActivityTemplate['pauses']>(h.pauses_json) } : {}) })
  })
  const fieldValues = new Map<string, ActivityLog['fields']>()
  rows(6).forEach(row => { const values = fieldValues.get(String(row.log_id)) ?? {}; values[String(row.field_id)] = decode(row.value_json); fieldValues.set(String(row.log_id), values) })
  const logs: ActivityLog[] = rows(4).map(row => ({ ...decode<Omit<ActivityLog, 'id' | 'templateId' | 'categoryId' | 'date' | 'status' | 'relatedId' | 'fields'>>(row.data_json), id: String(row.id), templateId: String(row.template_id), categoryId: String(row.category_id), date: String(row.date), status: row.status as ActivityLog['status'], relatedId: row.related_id ? String(row.related_id) : '', fields: fieldValues.get(String(row.id)) ?? {} }))
  const sets = rows(10), exercises = rows(9)
  const workouts: WorkoutSession[] = rows(8).map(row => ({ ...decode<Omit<WorkoutSession, 'id' | 'date' | 'type' | 'restDay' | 'exercises'>>(row.data_json), id: String(row.id), date: String(row.date), type: String(row.type), restDay: Boolean(row.rest_day), exercises: exercises.filter(e => e.session_id === row.id).sort((a, b) => Number(a.position) - Number(b.position)).map(e => ({ id: String(e.id), name: String(e.name), sets: sets.filter(s => s.session_id === row.id && s.exercise_id === e.id).sort((a, b) => Number(a.position) - Number(b.position)).map(s => ({ id: String(s.id), reps: Number(s.reps), weight: Number(s.weight), duration: Number(s.duration) })) })) }))
  return backupSchema.parse({ schemaVersion: 1, revision: Number(rows(0)[0].revision), categories: rows(1).map(row => ({ id: String(row.id), name: String(row.name), color: String(row.color), icon: String(row.icon) })), templates, logs, fields: rows(5).map(row => ({ id: String(row.id), name: String(row.name), type: row.type, options: decode(row.options_json) })), workoutTemplates: rows(7).map(row => ({ id: String(row.id), name: String(row.name), exercises: decode(row.exercises_json) })), workouts, preferences: rows(11).length ? decode(rows(11)[0].data_json) : createSeed().preferences })
}
const tableMap = { categories: 'categories', templates: 'activity_templates', logs: 'activity_logs', fields: 'custom_fields', workouts: 'workout_sessions', workoutTemplates: 'workout_templates' } as const
function writes(userId: string, data: AppData, operations: Operation[]): InStatement[] {
  const statements: InStatement[] = []
  const add = (sql: string, args: (string | number | null)[]) => statements.push({ sql, args })
  for (const op of operations) {
    if (op.collection === 'preferences') { add('INSERT INTO tend_preferences(user_id,data_json) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET data_json=excluded.data_json', [userId, JSON.stringify(data.preferences)]); continue }
    if (op.after === null) { add(`DELETE FROM tend_${tableMap[op.collection]} WHERE user_id=? AND id=?`, [userId, op.id]); continue }
    switch (op.collection) {
      case 'categories': { const c = data.categories.find(c => c.id === op.id)!; add('INSERT INTO tend_categories(user_id,id,name,color,icon) VALUES(?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,color=excluded.color,icon=excluded.icon', [userId, c.id, c.name, c.color, c.icon]); break }
      case 'templates': {
        const t = data.templates.find(t => t.id === op.id)!, { id, categoryId, name, kind, state, ...details } = t
        const { startDate, endDate, schedule, goal, reminder, pauses, ...habitless } = details
        add('INSERT INTO tend_activity_templates(user_id,id,category_id,name,kind,state,data_json) VALUES(?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET category_id=excluded.category_id,name=excluded.name,kind=excluded.kind,state=excluded.state,data_json=excluded.data_json', [userId, id, categoryId, name, kind, state, JSON.stringify(kind === 'habit' ? habitless : details)])
        if (kind === 'habit') add('INSERT INTO tend_habits(user_id,template_id,start_date,end_date,frequency,schedule_json,goal,reminder,pauses_json) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,template_id) DO UPDATE SET start_date=excluded.start_date,end_date=excluded.end_date,frequency=excluded.frequency,schedule_json=excluded.schedule_json,goal=excluded.goal,reminder=excluded.reminder,pauses_json=excluded.pauses_json', [userId, id, startDate, endDate, schedule.frequency, JSON.stringify(schedule), goal, reminder, JSON.stringify(pauses)])
        else add('DELETE FROM tend_habits WHERE user_id=? AND template_id=?', [userId, id])
        break
      }
      case 'fields': { const f = data.fields.find(f => f.id === op.id)!; add('INSERT INTO tend_custom_fields(user_id,id,name,type,options_json) VALUES(?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,type=excluded.type,options_json=excluded.options_json', [userId, f.id, f.name, f.type, JSON.stringify(f.options)]); break }
      case 'logs': {
        const l = data.logs.find(l => l.id === op.id)!, { id, templateId, categoryId, date, status, relatedId, fields, ...details } = l
        add('INSERT INTO tend_activity_logs(user_id,id,template_id,category_id,date,status,related_id,data_json) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET template_id=excluded.template_id,category_id=excluded.category_id,date=excluded.date,status=excluded.status,related_id=excluded.related_id,data_json=excluded.data_json', [userId, id, templateId, categoryId, date, status, relatedId || null, JSON.stringify(details)])
        add('DELETE FROM tend_custom_field_values WHERE user_id=? AND log_id=?', [userId, id])
        Object.entries(fields).forEach(([fieldId, value]) => add('INSERT INTO tend_custom_field_values(user_id,log_id,field_id,value_json) VALUES(?,?,?,?)', [userId, id, fieldId, JSON.stringify(value)]))
        break
      }
      case 'workoutTemplates': { const t = data.workoutTemplates.find(t => t.id === op.id)!; add('INSERT INTO tend_workout_templates(user_id,id,name,exercises_json) VALUES(?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,exercises_json=excluded.exercises_json', [userId, t.id, t.name, JSON.stringify(t.exercises)]); break }
      case 'workouts': {
        const w = data.workouts.find(w => w.id === op.id)!, { id, date, type, restDay, exercises, ...details } = w
        add('INSERT INTO tend_workout_sessions(user_id,id,date,type,rest_day,data_json) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,id) DO UPDATE SET date=excluded.date,type=excluded.type,rest_day=excluded.rest_day,data_json=excluded.data_json', [userId, id, date, type, Number(restDay), JSON.stringify(details)])
        add('DELETE FROM tend_exercises WHERE user_id=? AND session_id=?', [userId, id])
        exercises.forEach((e: WorkoutExercise, position) => { add('INSERT INTO tend_exercises(user_id,session_id,id,name,position) VALUES(?,?,?,?,?)', [userId, id, e.id, e.name, position]); e.sets.forEach((s, i) => add('INSERT INTO tend_workout_sets(user_id,session_id,exercise_id,id,position,reps,weight,duration) VALUES(?,?,?,?,?,?,?,?)', [userId, id, e.id, s.id, i, s.reps, s.weight, s.duration])) })
      }
    }
  }
  return statements
}
export async function initializeWorkspace(client: Client, userId: string, options: { seedHistory: boolean; name?: string; imported?: AppData }) {
  const tx = await client.transaction('write')
  try {
    if ((await tx.execute({ sql: 'SELECT user_id FROM tend_workspaces WHERE user_id=?', args: [userId] })).rows.length) throw new AppError(409, 'ALREADY_INITIALIZED', 'This account already has a journal. Import a backup from Settings to merge records.')
    const data = options.imported ? backupSchema.parse(options.imported) : createSeed()
    if (!options.imported && !options.seedHistory) data.logs = []
    data.revision = 0
    if (options.name && !data.preferences.name) data.preferences.name = options.name
    await tx.execute({ sql: 'INSERT INTO tend_workspaces(user_id,revision,schema_version,updated_at) VALUES(?,0,1,?)', args: [userId, now()] })
    const operations = Object.entries(tableMap).flatMap(([collection]) => data[collection as keyof typeof tableMap].map(item => ({ collection, id: item.id, before: null, after: item }))) as Operation[]
    operations.push({ collection: 'preferences', id: 'preferences', before: null, after: data.preferences })
    await tx.batch(writes(userId, data, operations)); await tx.commit(); return data
  } catch (error) { await tx.rollback().catch(() => {}); throw error } finally { tx.close() }
}
export async function mutateWorkspace(client: Client, userId: string, mutation: Mutation) {
  const tx = await client.transaction('write')
  try {
    const current = await loadWorkspace(tx, userId)
    if (!current) throw new AppError(409, 'INITIALIZATION_REQUIRED', 'Set up your journal first.')
    const requestHash = await fingerprint(mutation)
    const receipt = await tx.execute({ sql: 'SELECT request_hash FROM tend_mutation_receipts WHERE user_id=? AND mutation_id=?', args: [userId, mutation.mutationId] })
    if (receipt.rows.length) { if (receipt.rows[0].request_hash !== requestHash) throw new AppError(409, 'IDEMPOTENCY_CONFLICT', 'This request ID was already used for a different change.'); await tx.commit(); return current }
    const next = await applyOperations(current, mutation)
    for (const op of mutation.operations.filter(op => op.collection === 'logs' && op.after)) {
      const log = next.logs.find(l => l.id === op.id)!
      if (!log.duplicate && isDuplicate(next.logs, log)) throw new AppError(409, 'DUPLICATE_ACTIVITY', 'This activity is already recorded at this date and time. Keep a separate event explicitly or edit the original.')
      if (log.status === 'completed' && log.date > today(next.preferences.timezone)) throw new AppError(400, 'FUTURE_COMPLETION', 'Future activities must be planned.')
    }
    for (const op of mutation.operations.filter(op => op.collection === 'workouts' && op.after)) if (next.workouts.find(w => w.id === op.id)!.date > today(next.preferences.timezone)) throw new AppError(400, 'FUTURE_WORKOUT', 'Future gym visits belong in scheduled plans, not completed sessions.')
    const photoIds = [...new Set(next.logs.filter(l => l.photo).map(l => l.photo))]
    for (const uri of photoIds) {
      const id = /^\/api\/photos\/([a-f0-9-]{36})$/.exec(uri)?.[1]
      if (!id) throw new AppError(400, 'PHOTO_UPLOAD_REQUIRED', 'Upload photos before saving journal changes.')
      if (!(await tx.execute({ sql: 'SELECT id FROM tend_photos WHERE user_id=? AND id=?', args: [userId, id] })).rows.length) throw new AppError(403, 'PHOTO_ACCESS_DENIED', 'A photo does not belong to this account.')
    }
    next.revision = current.revision + 1
    await tx.batch([...writes(userId, next, mutation.operations), { sql: 'UPDATE tend_workspaces SET revision=?,updated_at=? WHERE user_id=?', args: [next.revision, now(), userId] }, { sql: 'INSERT INTO tend_mutation_receipts(user_id,mutation_id,request_hash,revision,created_at) VALUES(?,?,?,?,?)', args: [userId, mutation.mutationId, requestHash, next.revision, now()] }])
    await tx.commit(); return next
  } catch (error) { await tx.rollback().catch(() => {}); throw error } finally { tx.close() }
}
export async function resetWorkspace(client: Client, userId: string, revision: number) {
  const tx = await client.transaction('write')
  try {
    const current = await loadWorkspace(tx, userId)
    if (!current || current.revision !== revision) throw new AppError(409, 'SYNC_CONFLICT', 'The account changed on another device. Sync and review it before erasing.')
    const data = createSeed(); data.logs = []; data.revision = current.revision + 1
    const tables = ['custom_field_values', 'activity_logs', 'habits', 'activity_templates', 'categories', 'workout_sets', 'exercises', 'workout_sessions', 'workout_templates', 'custom_fields', 'preferences', 'mutation_receipts', 'photos', 'upload_parts']
    const operations = Object.keys(tableMap).flatMap(collection => data[collection as keyof typeof tableMap].map(item => ({ collection, id: item.id, before: null, after: item }))) as Operation[]
    operations.push({ collection: 'preferences', id: 'preferences', before: null, after: data.preferences })
    await tx.batch([...tables.map(table => ({ sql: `DELETE FROM tend_${table} WHERE user_id=?`, args: [userId] })), ...writes(userId, data, operations), { sql: 'UPDATE tend_workspaces SET revision=?,updated_at=? WHERE user_id=?', args: [data.revision, now(), userId] }]); await tx.commit(); return data
  } catch (error) { await tx.rollback().catch(() => {}); throw error } finally { tx.close() }
}
export function serializeRow(row: Row) { return Object.fromEntries(Object.entries(row)) }
