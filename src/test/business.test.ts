import { describe, it, expect } from 'vitest'
import { createSeed, newTemplate } from '../lib/seed'
import { dateRange, shiftDate, today } from '../lib/dates'
import { eligible, filterLogs, habitStats, habitTargetReached, isDuplicate, personalRecords, workoutVolume } from '../lib/analytics'
import { backupSchema, dateSchema, logSchema, templateSchema, validateField, workoutSchema } from '../lib/schemas'
import { csvCell, logsCSV } from '../lib/export'
import { mergeBackup, parseBackup } from '../lib/repository'
import type { ActivityLog, WorkoutSession } from '../lib/types'

const seed = createSeed()
const log = (templateId: string, date: string, extra: Partial<ActivityLog> = {}): ActivityLog => ({ ...seed.logs[0], id: crypto.randomUUID(), templateId, date, ...extra })
describe('supplied history and dates', () => {
  it('preserves all ten events without inventing clock times or attendance', () => {
    expect(seed.logs).toHaveLength(10); expect(seed.logs.every(l => !l.time && !l.endTime)).toBe(true)
    expect(seed.logs.filter(l => l.date === '2026-10-26' && l.templateId === 'hair-0')).toHaveLength(2)
    expect(seed.logs.filter(l => l.duplicate)).toHaveLength(2)
    expect(seed.workouts).toEqual([]); expect(seed.templates.some(t => t.kind === 'habit')).toBe(false)
    expect(backupSchema.safeParse(seed).success).toBe(true)
  })
  it('keeps overnight events on independent dates with reciprocal links', () => {
    const oil = seed.logs.find(l => l.id === 'seed-2')!, wash = seed.logs.find(l => l.id === oil.relatedId)!
    expect(oil.timeOfDay).toBe('Night'); expect(wash.date).toBe(shiftDate(oil.date, 1)); expect(wash.timeOfDay).toBe('Morning'); expect(wash.relatedId).toBe(oil.id)
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01'); expect(shiftDate('2028-02-28', 1)).toBe('2028-02-29')
  })
  it('rejects invalid calendar dates and retains date-only ranges', () => {
    expect(dateSchema.safeParse('2026-02-30').success).toBe(false); expect(dateSchema.safeParse('2028-02-29').success).toBe(true)
    expect(dateRange('2026-10-29', '2026-10-28')).toEqual([])
    expect(today('Asia/Kolkata')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
describe('habit eligibility and completion', () => {
  it('excludes dates before start, future dates and paused periods', () => {
    const t = newTemplate({ id: 'h', kind: 'habit', startDate: '2026-10-20', pauses: [{ start: '2026-10-22', end: '2026-10-24' }] })
    const stats = habitStats(t, ['20', '21', '24', '25', '29'].map(d => log(t.id, `2026-10-${d}`)), '2026-10-25')
    expect(eligible(t, '2026-10-19')).toBe(false); expect(stats.total).toBe(4); expect(stats.completed).toBe(4); expect(stats.rate).toBe(100); expect(stats.current).toBe(4); expect(stats.missed).toBe(0)
  })
  it('counts only selected weekdays and counts incomplete past scheduled days as misses', () => {
    const t = newTemplate({ id: 'h', kind: 'habit', startDate: '2026-10-19', schedule: { frequency: 'weekdays', days: [1, 3, 5], target: 3, dates: [] } })
    const stats = habitStats(t, [log(t.id, '2026-10-19'), log(t.id, '2026-10-23')], '2026-10-26')
    expect(stats.total).toBe(4); expect(stats.completed).toBe(2); expect(stats.missed).toBe(1); expect(stats.current).toBe(1); expect(stats.longest).toBe(1)
  })
  it('does not double count repeated logs or count plans and skips as completed', () => {
    const t = newTemplate({ id: 'h', kind: 'habit', startDate: '2026-10-20' })
    const stats = habitStats(t, [log(t.id, '2026-10-20'), log(t.id, '2026-10-20'), log(t.id, '2026-10-21', { status: 'planned' }), log(t.id, '2026-10-22', { status: 'skipped' })], '2026-10-22')
    expect(stats.completed).toBe(1); expect(stats.rate).toBe(33); expect(stats.missed).toBe(1)
  })
  it('requires the numeric or duration goal for a completed habit day', () => {
    const t = newTemplate({ id: 'h', kind: 'habit', startDate: '2026-10-20', tracking: 'duration', goal: 20 })
    const stats = habitStats(t, [log(t.id, '2026-10-20', { duration: 10 }), log(t.id, '2026-10-21', { duration: 20 })], '2026-10-21')
    expect(stats.completed).toBe(1); expect(stats.missed).toBe(1)
    expect(habitTargetReached(t, [log(t.id, '2026-10-21', { duration: 10 }), log(t.id, '2026-10-21', { duration: 10 })], '2026-10-21')).toBe(true)
  })
  it('uses distinct days and completed periods for weekly targets', () => {
    const t = newTemplate({ id: 'h', kind: 'habit', startDate: '2026-10-19', schedule: { frequency: 'weekly', target: 3, days: [], dates: [] } })
    const stats = habitStats(t, ['19', '19', '21', '23', '26'].map(d => log(t.id, `2026-10-${d}`)), '2026-10-26')
    expect(stats.total).toBe(4); expect(stats.completed).toBe(4); expect(stats.missed).toBe(0); expect(stats.current).toBe(1)
  })
  it('supports monthly and specific-date schedules without future misses', () => {
    const t = newTemplate({ id: 'h', kind: 'habit', startDate: '2026-10-01', schedule: { frequency: 'custom', target: 1, days: [], dates: ['2026-10-05', '2026-10-28', '2026-11-01'] } })
    expect(habitStats(t, [log(t.id, '2026-10-05')], '2026-10-28')).toMatchObject({ total: 2, completed: 1, missed: 0 })
    t.schedule = { ...t.schedule, frequency: 'monthly', target: 8 }
    expect(habitStats(t, [], '2026-10-28')).toMatchObject({ total: 8, completed: 0, missed: 0 })
  })
  it('validates habit start and schedules', () => {
    expect(templateSchema.safeParse(newTemplate({ name: 'Read', kind: 'habit' })).success).toBe(false)
    expect(templateSchema.safeParse(newTemplate({ name: 'Read', kind: 'habit', startDate: '2026-10-28', endDate: '2026-10-01' })).success).toBe(false)
  })
})
describe('logs, custom fields, filters and CSV', () => {
  it('prevents accidental duplicates but allows different times and excludes the edited row', () => {
    const entry = seed.logs[0]
    expect(isDuplicate(seed.logs, { ...entry, id: 'new' })).toBe(true)
    expect(isDuplicate(seed.logs, entry)).toBe(false)
    expect(isDuplicate(seed.logs, { ...entry, id: 'new', time: '13:00' })).toBe(false)
    expect(logSchema.safeParse({ ...entry, time: '22:00', endTime: '08:00' }).success).toBe(false)
  })
  it('validates metadata fields by type without schema changes', () => {
    expect(validateField({ name: 'Weight', type: 'number', options: [] }, 'abc')).toBeTruthy()
    expect(validateField({ name: 'Weight', type: 'number', options: [] }, 70)).toBeNull()
    expect(validateField({ name: 'Oil', type: 'select', options: ['Coconut'] }, 'Olive')).toBeTruthy()
    expect(validateField({ name: 'Time', type: 'duration', options: [] }, -2)).toBeTruthy()
    expect(validateField({ name: 'Done', type: 'checkbox', options: [] }, true)).toBeNull()
    expect(validateField({ name: 'Date', type: 'date', options: [] }, '2026-02-30')).toBeTruthy()
  })
  it('intersects search, date, category, activity and status filters and exports the same rows', () => {
    const filtered = filterLogs(seed.logs, { query: 'hair oil', from: '2026-10-23', to: '2026-10-26', category: 'hair', template: 'hair-0', status: 'completed' })
    expect(filtered).toHaveLength(3)
    const csv = logsCSV(filtered, seed); expect(csv.match(/"Hair oil applied"/g)).toHaveLength(3); expect(csv).not.toContain('AirPods')
    expect(csvCell('=HYPERLINK("a")')).toBe('"\'=HYPERLINK(""a"")"')
    expect(csvCell('a,"b"\nc')).toBe('"a,""b""\nc"')
  })
})
describe('workouts and backups', () => {
  const session: WorkoutSession = { id: 'w', date: '2026-10-28', time: '', type: 'Chest', notes: '', restDay: false, createdAt: new Date().toISOString(), exercises: [{ id: 'e', name: 'Bench press', sets: [{ id: 's1', weight: 50, reps: 10, duration: 0 }, { id: 's2', weight: 60, reps: 5, duration: 0 }] }] }
  it('validates exercise sets and calculates volume and personal records', () => {
    expect(workoutSchema.safeParse(session).success).toBe(true); expect(workoutVolume(session)).toBe(800)
    expect(personalRecords([session])).toEqual([{ name: 'Bench press', weight: 60, reps: 5, date: '2026-10-28' }])
    expect(workoutSchema.safeParse({ ...session, exercises: [] }).success).toBe(false)
    expect(workoutSchema.safeParse({ ...session, exercises: [], restDay: true }).success).toBe(true)
  })
  it('round-trips complete backups and rejects malformed references and unsupported versions', () => {
    expect(parseBackup(JSON.stringify(seed))).toEqual(seed)
    expect(() => parseBackup('{bad json')).toThrow()
    expect(() => parseBackup(JSON.stringify({ ...seed, schemaVersion: 2 }))).toThrow()
    expect(() => parseBackup(JSON.stringify({ ...seed, logs: [{ ...seed.logs[0], templateId: 'missing' }] }))).toThrow()
    expect(() => parseBackup(JSON.stringify({ ...seed, logs: [...seed.logs, seed.logs[0]] }))).toThrow()
  })
  it('merges idempotently and retains local edits on matching record IDs', () => {
    const local = createSeed(), imported = createSeed(); imported.logs[0].notes = 'Imported edit'; imported.logs.push({ ...seed.logs[0], id: 'new-event', notes: 'New' })
    mergeBackup(local, imported); mergeBackup(local, imported)
    expect(local.logs).toHaveLength(11); expect(local.logs[0].notes).toBe(''); expect(local.logs.find(l => l.id === 'new-event')?.notes).toBe('New')
  })
})
