import { format, parseISO, addDays, eachDayOfInterval, startOfWeek, startOfMonth, endOfWeek, endOfMonth } from 'date-fns'
export function today(timezone = 'Asia/Kolkata'): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  return `${parts.find(p => p.type === 'year')!.value}-${parts.find(p => p.type === 'month')!.value}-${parts.find(p => p.type === 'day')!.value}`
}
export const dateLabel = (date: string, pattern = 'dd MMM yyyy') => format(parseISO(date), pattern)
export const dateKey = (date: Date) => format(date, 'yyyy-MM-dd')
export const shiftDate = (date: string, days: number) => dateKey(addDays(parseISO(date), days))
export function dateRange(from: string, to: string) { return from > to ? [] : eachDayOfInterval({ start: parseISO(from), end: parseISO(to) }).map(dateKey) }
export function period(date: string, frequency: 'weekly' | 'monthly') {
  const d = parseISO(date)
  return frequency === 'weekly' ? { start: dateKey(startOfWeek(d, { weekStartsOn: 1 })), end: dateKey(endOfWeek(d, { weekStartsOn: 1 })) } : { start: dateKey(startOfMonth(d)), end: dateKey(endOfMonth(d)) }
}
