import { getDay, parseISO } from 'date-fns'
import { dateRange, period, shiftDate } from './dates'
import type { ActivityLog, ActivityTemplate, LogFilter, WorkoutSession } from './types'

export function eligible(t: ActivityTemplate, day: string) {
  if (t.kind !== 'habit' || !t.startDate || day < t.startDate || (t.endDate && day > t.endDate)) return false
  if (t.pauses.some(p => day >= p.start && (!p.end || day < p.end))) return false
  if (t.schedule.frequency === 'weekdays') return t.schedule.days.includes(getDay(parseISO(day)))
  if (t.schedule.frequency === 'custom') return t.schedule.dates.includes(day)
  return true
}
export function completedHabitDays(t: ActivityTemplate, logs: ActivityLog[]) {
  const values = new Map<string, number>()
  for (const l of logs.filter(l => l.templateId === t.id && l.status === 'completed')) {
    const value = t.tracking === 'duration' ? l.duration ?? 0 : l.quantity ?? 0
    values.set(l.date, t.tracking === 'rating' ? Math.max(values.get(l.date) ?? 0, value) : (values.get(l.date) ?? 0) + value)
  }
  return new Set(logs.filter(l => l.templateId === t.id && l.status === 'completed' && (!['number', 'duration', 'rating'].includes(t.tracking) || (values.get(l.date) ?? 0) >= t.goal)).map(l => l.date))
}
export function habitTargetReached(t: ActivityTemplate, logs: ActivityLog[], day: string) {
  const completed = completedHabitDays(t, logs)
  if (t.schedule.frequency === 'weekly' || t.schedule.frequency === 'monthly') {
    const p = period(day, t.schedule.frequency)
    return [...completed].filter(d => d >= p.start && d <= day && eligible(t, d)).length >= t.schedule.target
  }
  return completed.has(day)
}
export function habitStats(t: ActivityTemplate, logs: ActivityLog[], today: string) {
  const end = t.endDate && t.endDate < today ? t.endDate : today
  const days = t.startDate ? dateRange(t.startDate, end).filter(d => eligible(t, d)) : []
  const done = completedHabitDays(t, logs)
  let units: { key: string; goal: number; count: number; complete: boolean; ended: boolean }[]
  if (t.schedule.frequency === 'weekly' || t.schedule.frequency === 'monthly') {
    const freq = t.schedule.frequency
    const periods = new Map<string, { days: string[]; end: string }>()
    for (const day of days) { const p = period(day, freq); const group = periods.get(p.start) ?? { days: [], end: p.end }; group.days.push(day); periods.set(p.start, group) }
    units = [...periods].map(([key, p]) => {
      const count = Math.min(t.schedule.target, p.days.filter(d => done.has(d)).length)
      const fullGoal = Math.min(t.schedule.target, dateRange(key, p.end).filter(d => eligible(t, d)).length)
      return { key, goal: Math.min(t.schedule.target, p.days.length), count, complete: fullGoal > 0 && count >= fullGoal, ended: p.end < today || !!t.endDate && t.endDate < today && t.endDate <= p.end }
    })
  } else units = days.map(key => ({ key, goal: 1, count: Number(done.has(key)), complete: done.has(key), ended: key < today }))
  const total = units.reduce((n, u) => n + u.goal, 0), completed = units.reduce((n, u) => n + Math.min(u.count, u.goal), 0)
  let current = 0, longest = 0, run = 0
  for (const u of units) { if (u.complete) { run++; longest = Math.max(longest, run) } else if (u.ended) run = 0 }
  for (const u of [...units].reverse()) { if (u.complete) current++; else if (u.ended) break }
  return { total, completed, rate: total ? Math.round(completed / total * 100) : 0, missed: units.filter(u => u.ended).reduce((n, u) => n + Math.max(0, u.goal - u.count), 0), current, longest }
}
export function filterLogs(logs: ActivityLog[], f: LogFilter) {
  const query = f.query.toLowerCase().trim()
  return logs.filter(l => (!query || `${l.name} ${l.notes} ${Object.values(l.fields).join(' ')}`.toLowerCase().includes(query)) && (!f.category || l.categoryId === f.category) && (!f.template || l.templateId === f.template) && (!f.status || l.status === f.status) && (!f.from || l.date >= f.from) && (!f.to || l.date <= f.to))
}
export function isDuplicate(logs: ActivityLog[], entry: ActivityLog) {
  return logs.some(l => l.id !== entry.id && l.templateId === entry.templateId && l.date === entry.date && l.time === entry.time && l.timeOfDay === entry.timeOfDay && l.status === entry.status)
}
export function weeklyCounts(logs: ActivityLog[], end: string) {
  return dateRange(shiftDate(end, -6), end).map(date => ({ date, count: logs.filter(l => l.date === date && l.status === 'completed').length }))
}
export function workoutVolume(s: WorkoutSession) { return s.exercises.reduce((n, e) => n + e.sets.reduce((m, s) => m + s.weight * s.reps, 0), 0) }
export function personalRecords(sessions: WorkoutSession[]) {
  const records = new Map<string, { name: string; weight: number; reps: number; date: string }>()
  for (const s of sessions.filter(s => !s.restDay)) for (const e of s.exercises) for (const set of e.sets) { const key = e.name.trim().toLowerCase(), old = records.get(key); if (set.weight > 0 && (!old || set.weight > old.weight || set.weight === old.weight && set.reps > old.reps)) records.set(key, { name: e.name, weight: set.weight, reps: set.reps, date: s.date }) }
  return [...records.values()].sort((a, b) => b.weight - a.weight)
}
