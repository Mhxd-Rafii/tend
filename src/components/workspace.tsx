import { createContext, useContext, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { useStore } from '../lib/store'
import { isDuplicate } from '../lib/analytics'
import { logSchema } from '../lib/schemas'
import { newTemplate } from '../lib/seed'
import type { ActivityLog, ActivityTemplate } from '../lib/types'
import { Modal } from './ui/dialog'
import { QuickAdd } from './quick-add'
import { LogForm } from './log-form'
import { TemplateForm } from './template-form'

interface Actions {
  quickAdd: (date?: string) => void
  logDetails: (template: ActivityTemplate, date?: string) => void
  editLog: (log: ActivityLog) => void
  editTemplate: (template?: ActivityTemplate, habit?: boolean) => void
  instantLog: (template: ActivityTemplate, date: string) => Promise<void>
  deleteLog: (log: ActivityLog) => void
}
const Context = createContext<Actions | null>(null)
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { data, save, today } = useStore()
  const [quickDate, setQuickDate] = useState<string | null>(null)
  const [log, setLog] = useState<ActivityLog | null>(null)
  const [template, setTemplate] = useState<ActivityTemplate | null>(null)
  const busy = useRef(new Set<string>())
  const blankLog = (t: ActivityTemplate, date: string): ActivityLog => ({ id: crypto.randomUUID(), templateId: t.id, name: t.name, categoryId: t.categoryId, date, time: '', endTime: '', timeOfDay: '', status: date > today ? 'planned' : 'completed', notes: t.notes, unit: t.unit, relatedId: '', duplicate: false, fields: {}, photo: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
  const instantLog: Actions['instantLog'] = async (t, date) => {
    if (t.tracking !== 'checkbox') { setLog(blankLog(t, date)); return }
    const key = `${t.id}:${date}`
    if (busy.current.has(key)) return
    busy.current.add(key)
    const entry = logSchema.parse(blankLog(t, date))
    const ok = await save(d => { if (isDuplicate(d.logs, entry)) throw new Error('Already logged for this date. Use details to record a separate event.'); d.logs.push(entry) })
    busy.current.delete(key)
    if (ok) toast.success(`${t.name} ${entry.status === 'planned' ? 'planned' : 'logged'}`, { description: date, action: { label: 'Undo', onClick: () => { void save(d => { d.logs = d.logs.filter(l => l.id !== entry.id); d.logs.forEach(l => { if (l.relatedId === entry.id) l.relatedId = '' }) }) } } })
  }
  const deleteLog = (entry: ActivityLog) => {
    void save(d => { d.logs = d.logs.filter(l => l.id !== entry.id); d.logs.forEach(l => { if (l.relatedId === entry.id) l.relatedId = '' }) }).then(ok => {
      if (ok) toast.success('Activity deleted', { action: { label: 'Undo', onClick: () => { void save(d => { if (!d.logs.some(l => l.id === entry.id)) { const restored = { ...entry, relatedId: d.logs.some(l => l.id === entry.relatedId) ? entry.relatedId : '' }; d.logs.push(restored); const related = d.logs.find(l => l.id === restored.relatedId); if (related && !related.relatedId) related.relatedId = entry.id } }) } } })
    })
  }
  const actions: Actions = { quickAdd: (date = today) => setQuickDate(date), logDetails: (t, date = today) => setLog(blankLog(t, date)), editLog: setLog, editTemplate: (t, habit = false) => setTemplate(t ?? newTemplate({ kind: habit ? 'habit' : 'activity', startDate: habit ? today : '', order: data.templates.length })), instantLog, deleteLog }
  return <Context.Provider value={actions}>{children}
    <Modal title="Make a little progress" description="Pick an activity. One tap is all it takes." open={quickDate !== null} onOpenChange={v => !v && setQuickDate(null)} wide>{quickDate && <QuickAdd date={quickDate} onDateChange={setQuickDate} full />}</Modal>
    <Modal title={log && data.logs.some(l => l.id === log.id) ? 'Edit activity' : 'Activity details'} description="A place for the details you want to remember." open={!!log} onOpenChange={v => !v && setLog(null)} wide>{log && <LogForm key={log.id} initial={log} onClose={() => setLog(null)} />}</Modal>
    <Modal title={template && data.templates.some(t => t.id === template.id) ? 'Edit activity' : template?.kind === 'habit' ? 'Plant a new habit' : 'Create an activity'} description="Make it yours. You can change these details any time." open={!!template} onOpenChange={v => !v && setTemplate(null)} wide>{template && <TemplateForm key={template.id} initial={template} onClose={() => setTemplate(null)} />}</Modal>
  </Context.Provider>
}
export function useActions() { const c = useContext(Context); if (!c) throw new Error('WorkspaceProvider is required'); return c }
