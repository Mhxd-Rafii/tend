import type { ActivityLog, AppData } from './types'
export function csvCell(value: unknown) {
  let text = String(value ?? '')
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
export function logsCSV(logs: ActivityLog[], data: AppData) {
  const headings = ['Date', 'Activity', 'Category', 'Status', 'Start time', 'Completion time', 'Time of day', 'Quantity', 'Unit', 'Duration (min)', 'Notes', 'Related event', 'Duplicate review', ...data.fields.map(f => f.name)]
  return '\uFEFF' + [headings, ...logs.map(l => [l.date, l.name, data.categories.find(c => c.id === l.categoryId)?.name, l.status, l.time, l.endTime, l.timeOfDay, l.quantity, l.unit, l.duration, l.notes, l.relatedId, l.duplicate ? 'Needs review' : '', ...data.fields.map(f => l.fields[f.id])])].map(row => row.map(csvCell).join(',')).join('\r\n')
}
export function download(content: string, name: string, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
