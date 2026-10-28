import { z } from 'zod'
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a date').refine(s => { const d = new Date(`${s}T12:00:00Z`); return !isNaN(+d) && d.toISOString().slice(0, 10) === s }, 'Invalid calendar date')
const optionalDate = z.union([dateSchema, z.literal('')])
const time = z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal('')])
const id = z.string().min(1).max(150)
const numeric = z.number().finite().nonnegative().max(1e8)
export const categorySchema = z.object({ id, name: z.string().trim().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), icon: z.string().max(40) })
export const templateSchema = z.object({
  id, name: z.string().trim().min(1, 'Activity name is required').max(150), categoryId: id, icon: z.string().max(40), notes: z.string().max(5000), unit: z.string().max(40), tracking: z.enum(['checkbox', 'number', 'duration', 'rating', 'custom']), favorite: z.boolean(), order: z.number().finite(), kind: z.enum(['activity', 'habit']), state: z.enum(['active', 'paused', 'archived']), description: z.string().max(1000), color: z.string().regex(/^#[0-9a-fA-F]{6}$/), startDate: optionalDate, endDate: optionalDate,
  schedule: z.object({ frequency: z.enum(['daily', 'weekdays', 'weekly', 'monthly', 'custom']), days: z.array(z.number().int().min(0).max(6)).max(7), target: z.number().int().min(1).max(31), dates: z.array(dateSchema).max(10000) }), reminder: time, goal: z.number().positive().max(1e8), pauses: z.array(z.object({ start: dateSchema, end: optionalDate })),
}).refine(t => t.kind !== 'habit' || !!t.startDate, { message: 'Choose a start date', path: ['startDate'] }).refine(t => !t.endDate || !t.startDate || t.endDate >= t.startDate, { message: 'End date must follow the start date', path: ['endDate'] }).refine(t => t.kind !== 'habit' || t.schedule.frequency !== 'weekdays' || t.schedule.days.length > 0, { message: 'Choose at least one weekday', path: ['schedule', 'days'] }).refine(t => t.kind !== 'habit' || t.schedule.frequency !== 'custom' || t.schedule.dates.length > 0, { message: 'Add scheduled dates', path: ['schedule', 'dates'] }).refine(t => t.schedule.frequency !== 'weekly' || t.schedule.target <= 7, { message: 'Weekly target must be 1–7', path: ['schedule', 'target'] })
export const logSchema = z.object({ id, templateId: id, name: z.string().trim().min(1).max(150), categoryId: id, date: dateSchema, time, endTime: time, timeOfDay: z.string().max(40), status: z.enum(['completed', 'skipped', 'planned']), notes: z.string().max(5000), quantity: numeric.optional(), unit: z.string().max(40), duration: numeric.optional(), relatedId: z.string().max(150), duplicate: z.boolean(), fields: z.record(z.string().max(150), z.union([z.string().max(5000), z.number().finite(), z.boolean()])), photo: z.string().max(3_000_000).refine(s => !s || /^\/api\/photos\/[a-f0-9-]{36}$/.test(s) || /^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/.test(s), 'Use a PNG, JPEG, or WebP photo'), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() }).refine(l => !l.time || !l.endTime || l.endTime >= l.time, { message: 'Completion time must follow start time. Log overnight events separately.', path: ['endTime'] })
export const fieldSchema = z.object({ id, name: z.string().trim().min(1).max(80), type: z.enum(['text', 'number', 'date', 'select', 'checkbox', 'duration']), options: z.array(z.string().trim().min(1).max(100)).max(100) }).refine(f => f.type !== 'select' || f.options.length > 0, { message: 'Provide at least one option', path: ['options'] })
const setSchema = z.object({ id, reps: z.number().int().min(0).max(10000), weight: numeric, duration: numeric }).refine(s => s.reps > 0 || s.duration > 0, { message: 'Each set needs reps or duration' })
export const workoutSchema = z.object({ id, date: dateSchema, time, type: z.string().trim().min(1).max(80), notes: z.string().max(5000), bodyWeight: z.number().positive().max(1000).optional(), restDay: z.boolean(), exercises: z.array(z.object({ id, name: z.string().trim().min(1, 'Exercise name is required').max(150), sets: z.array(setSchema).min(1).max(100) })).max(100), createdAt: z.iso.datetime() }).refine(s => s.restDay || s.exercises.length > 0, { message: 'Add an exercise or choose rest day', path: ['exercises'] })
export const backupSchema = z.object({
  schemaVersion: z.literal(1), revision: z.number().int().nonnegative(), categories: z.array(categorySchema).min(1).max(100), templates: z.array(templateSchema).max(10000), logs: z.array(logSchema).max(100000), fields: z.array(fieldSchema).max(100), workouts: z.array(workoutSchema).max(100000), workoutTemplates: z.array(z.object({ id, name: z.string().min(1).max(80), exercises: z.array(z.string().min(1).max(150)).max(100) })).max(1000),
  preferences: z.object({ name: z.string().max(80), theme: z.enum(['light', 'dark', 'system']), timezone: z.string().refine(s => { try { new Intl.DateTimeFormat('en', { timeZone: s }); return true } catch { return false } }, 'Invalid timezone'), dateFormat: z.enum(['dd MMM yyyy', 'MM/dd/yyyy', 'dd/MM/yyyy']), notifications: z.boolean(), widgets: z.array(z.enum(['weekly', 'categories', 'recent', 'habits'])).max(4), hiddenColumns: z.array(z.string().max(150)).max(120), columnOrder: z.array(z.string().max(150)).max(120), columnSizes: z.record(z.string(), z.number().min(50).max(1000)), lastBackup: z.string().max(40) }),
}).superRefine((data, ctx) => {
  for (const list of [data.categories, data.templates, data.logs, data.fields, data.workouts, data.workoutTemplates]) if (new Set(list.map(x => x.id)).size !== list.length) ctx.addIssue({ code: 'custom', message: 'Backup contains duplicate record IDs' })
  const cats = new Set(data.categories.map(c => c.id)), templates = new Set(data.templates.map(t => t.id)), logs = new Set(data.logs.map(l => l.id))
  for (const t of data.templates) if (!cats.has(t.categoryId)) ctx.addIssue({ code: 'custom', message: 'Activity refers to a missing category' })
  for (const l of data.logs) {
    if (!cats.has(l.categoryId) || !templates.has(l.templateId) || l.relatedId && !logs.has(l.relatedId)) ctx.addIssue({ code: 'custom', message: 'Log refers to a missing activity, category, or related event' })
    for (const f of data.fields) { const error = validateField(f, l.fields[f.id]); if (error) ctx.addIssue({ code: 'custom', message: error }) }
    if (Object.keys(l.fields).some(id => !data.fields.some(f => f.id === id))) ctx.addIssue({ code: 'custom', message: 'Log refers to a missing custom field' })
    if (l.relatedId && (l.relatedId === l.id || data.logs.find(other => other.id === l.relatedId)?.relatedId !== l.id)) ctx.addIssue({ code: 'custom', message: 'Related activity links must be reciprocal and refer to different events' })
  }
  if (new Set(data.fields.map(f => f.name.toLowerCase())).size !== data.fields.length) ctx.addIssue({ code: 'custom', message: 'Custom field names must be unique' })
  for (const workout of data.workouts) {
    if (new Set(workout.exercises.map(e => e.id)).size !== workout.exercises.length || workout.exercises.some(e => new Set(e.sets.map(s => s.id)).size !== e.sets.length)) ctx.addIssue({ code: 'custom', message: 'Exercises and sets must have unique IDs within their session' })
  }
})
export function validateField(field: { name: string; type: string; options: string[] }, value: unknown): string | null {
  if (value === undefined || value === '') return null
  if (['number', 'duration'].includes(field.type) && (typeof value !== 'number' || !Number.isFinite(value) || field.type === 'duration' && value < 0)) return `${field.name} must be a valid ${field.type === 'duration' ? 'positive duration' : 'number'}`
  if (field.type === 'checkbox' && typeof value !== 'boolean') return `${field.name} must be checked or unchecked`
  if (field.type === 'select' && !field.options.includes(value as string)) return `Choose an option for ${field.name}`
  if (field.type === 'date' && !dateSchema.safeParse(value).success) return `${field.name} needs a valid date`
  if (field.type === 'text' && typeof value !== 'string') return `${field.name} must be text`
  return null
}
