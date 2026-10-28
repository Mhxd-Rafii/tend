import { useEffect, useState, type FormEvent } from 'react'
import { Link2, ImagePlus, Trash2, Save, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { useStore } from '../lib/store'
import { isDuplicate } from '../lib/analytics'
import { logSchema, validateField } from '../lib/schemas'
import { shiftDate } from '../lib/dates'
import { resolvePhoto } from '../lib/repository'
import type { ActivityLog, FieldValue } from '../lib/types'
import { Button } from './ui/button'
import { CategoryPill } from './common'

export function LogForm({ initial, onClose }: { initial: ActivityLog; onClose: () => void }) {
  const { data, save, pending, today } = useStore()
  const [entry, setEntry] = useState<ActivityLog>(initial), [error, setError] = useState(''), [allowDuplicate, setAllowDuplicate] = useState(false), [overnight, setOvernight] = useState(false)
  const [photoPreview, setPhotoPreview] = useState('')
  useEffect(() => { let active = true; setPhotoPreview(''); if (entry.photo) void resolvePhoto(entry.photo).then(photo => { if (active) setPhotoPreview(photo) }).catch(() => {}); return () => { active = false } }, [entry.photo])
  const editing = data.logs.some(l => l.id === initial.id), template = data.templates.find(t => t.id === entry.templateId)
  const update = <K extends keyof ActivityLog>(key: K, value: ActivityLog[K]) => setEntry(e => ({ ...e, [key]: value }))
  async function submit(e: FormEvent) {
    e.preventDefault(); setError('')
    const result = logSchema.safeParse({ ...entry, updatedAt: new Date().toISOString() })
    if (!result.success) { setError(result.error.issues.map(i => i.message).join('. ')); return }
    if (entry.status === 'completed' && entry.date > today) { setError('Future activities must be planned. Mark them complete when the date arrives.'); return }
    if (template?.tracking === 'number' && entry.quantity === undefined || template?.tracking === 'duration' && entry.duration === undefined) { setError('Enter a value for this activity.'); return }
    if (template?.tracking === 'rating' && (!entry.quantity || entry.quantity < 1 || entry.quantity > 5)) { setError('Choose a rating between 1 and 5.'); return }
    for (const field of data.fields) { const msg = validateField(field, entry.fields[field.id]); if (msg) { setError(msg); return } }
    const next = result.data
    let addedRelated: ActivityLog | undefined
    if (overnight) {
      const wash = data.templates.find(t => t.id === 'hair-1')
      if (wash) { const date = shiftDate(next.date, 1); addedRelated = { ...next, id: crypto.randomUUID(), templateId: wash.id, name: wash.name, categoryId: wash.categoryId, date, time: '', endTime: '', timeOfDay: 'Morning', status: date > today ? 'planned' : 'completed', relatedId: next.id, notes: '', fields: {}, photo: '', quantity: undefined, duration: undefined }; next.relatedId = addedRelated.id }
    }
    const ok = await save(d => {
      const duplicate = isDuplicate(d.logs, next)
      if (duplicate && !allowDuplicate) throw new Error('This activity is already logged. Check “Keep as a separate event” to save another.')
      if (addedRelated && isDuplicate(d.logs, addedRelated) && !allowDuplicate) throw new Error('The following morning’s wash is already recorded. Link that existing event instead, or allow a separate event.')
      const previous = d.logs.find(l => l.id === next.id)
      if (previous?.relatedId && previous.relatedId !== next.relatedId) { const old = d.logs.find(l => l.id === previous.relatedId); if (old?.relatedId === next.id) old.relatedId = '' }
      next.duplicate = duplicate || next.duplicate
      d.logs = [...d.logs.filter(l => l.id !== next.id), next]
      if (addedRelated) d.logs.push(addedRelated)
      const related = d.logs.find(l => l.id === next.relatedId)
      if (related) { if (related.relatedId && related.relatedId !== next.id) throw new Error('That event is already linked to another activity.'); related.relatedId = next.id }
    })
    if (ok) { toast.success(editing ? 'Activity updated' : 'Activity saved', { action: !editing ? { label: 'Undo', onClick: () => { void save(d => { const ids = [next.id, addedRelated?.id]; d.logs = d.logs.filter(l => !ids.includes(l.id)); d.logs.forEach(l => { if (ids.includes(l.relatedId)) l.relatedId = '' }) }) } } : undefined }); onClose() }
  }
  const setField = (id: string, value: FieldValue) => setEntry(e => ({ ...e, fields: { ...e.fields, [id]: value } }))
  return <form onSubmit={submit} className="form-stack">
    <div className="form-activity"><h3>{entry.name}</h3><CategoryPill id={entry.categoryId} /></div>
    {entry.duplicate && <div className="notice warning"><AlertTriangle size={17} /><div>Potential overlap with another entry. The original events have been preserved.<label className="check-line"><input type="checkbox" checked={!entry.duplicate} onChange={() => update('duplicate', false)} />I reviewed this; keep both events</label></div></div>}
    <div className="form-grid"><label>Date<input type="date" required value={entry.date} onChange={e => { update('date', e.target.value); if (e.target.value > today) update('status', 'planned') }} /></label><label>Status<select value={entry.status} onChange={e => update('status', e.target.value as ActivityLog['status'])}><option value="completed">Completed</option><option value="planned">Planned</option><option value="skipped">Skipped</option></select></label>
    <label>Category<select value={entry.categoryId} onChange={e => update('categoryId', e.target.value)}>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Start time <span className="optional">optional</span><input type="time" value={entry.time} onChange={e => update('time', e.target.value)} /></label><label>Completion time <span className="optional">optional</span><input type="time" value={entry.endTime} onChange={e => update('endTime', e.target.value)} /></label>
    <label>Time of day<select value={entry.timeOfDay} onChange={e => update('timeOfDay', e.target.value)}><option value="">Unspecified</option>{['Morning', 'Afternoon', 'Evening', 'Night'].map(v => <option key={v}>{v}</option>)}</select></label>
    <label>{template?.tracking === 'rating' ? 'Rating (1–5)' : 'Quantity'}<input type="number" min="0" step={template?.tracking === 'rating' ? '1' : 'any'} max={template?.tracking === 'rating' ? '5' : undefined} value={entry.quantity ?? ''} onChange={e => update('quantity', e.target.value === '' ? undefined : Number(e.target.value))} /></label><label>Unit<input value={entry.unit} maxLength={40} placeholder="e.g. ml, kg, glasses" onChange={e => update('unit', e.target.value)} /></label><label>Duration (minutes)<input type="number" min="0" step="any" value={entry.duration ?? ''} onChange={e => update('duration', e.target.value === '' ? undefined : Number(e.target.value))} /></label></div>
    <label>Notes<textarea value={entry.notes} maxLength={5000} rows={3} placeholder="Anything you’d like to remember…" onChange={e => update('notes', e.target.value)} /></label>
    {!!data.fields.length && <fieldset><legend>Custom details</legend><div className="form-grid">{data.fields.map(f => <label key={f.id}>{f.name}{f.type === 'select' ? <select value={String(entry.fields[f.id] ?? '')} onChange={e => setField(f.id, e.target.value)}><option value="">Choose…</option>{f.options.map(o => <option key={o}>{o}</option>)}</select> : f.type === 'checkbox' ? <input type="checkbox" checked={Boolean(entry.fields[f.id])} onChange={e => setField(f.id, e.target.checked)} /> : <input type={f.type === 'date' ? 'date' : ['number', 'duration'].includes(f.type) ? 'number' : 'text'} step="any" min={f.type === 'duration' ? 0 : undefined} value={String(entry.fields[f.id] ?? '')} onChange={e => setField(f.id, ['number', 'duration'].includes(f.type) && e.target.value ? Number(e.target.value) : e.target.value)} />}</label>)}</div></fieldset>}
    <label><span className="inline-label"><Link2 size={14} />Related activity</span><select value={entry.relatedId} onChange={e => { update('relatedId', e.target.value); setOvernight(false) }}><option value="">No linked event</option>{[...data.logs].filter(l => l.id !== entry.id && (!l.relatedId || l.relatedId === entry.id || l.id === entry.relatedId)).sort((a, b) => b.date.localeCompare(a.date)).map(l => <option key={l.id} value={l.id}>{l.date} · {l.name} {l.timeOfDay}</option>)}</select></label>
    {!editing && ['hair-0', 'hair-2'].includes(entry.templateId) && !entry.relatedId && <label className="check-line"><input type="checkbox" checked={overnight} onChange={e => setOvernight(e.target.checked)} />Also record a linked hair wash the next morning ({shiftDate(entry.date || today, 1)})</label>}
    <div><label className="file-label"><ImagePlus size={17} />{entry.photo ? 'Change photo' : 'Attach a photo (up to 2 MB)'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 2 * 1024 * 1024) { setError('Photo must be smaller than 2 MB.'); return } const reader = new FileReader(); reader.onload = () => update('photo', String(reader.result)); reader.readAsDataURL(file) }} /></label>{entry.photo && <div className="attachment-preview"><img src={photoPreview || undefined} alt="Activity attachment (available after loading online)" /><Button type="button" variant="ghost" size="icon" aria-label="Remove photo" onClick={() => update('photo', '')}><Trash2 size={16} /></Button></div>}</div>
    <label className="check-line"><input type="checkbox" checked={allowDuplicate} onChange={e => setAllowDuplicate(e.target.checked)} />Keep as a separate event if already logged on this date</label>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="form-actions"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}><Save size={16} />{pending ? 'Saving…' : editing ? 'Save changes' : 'Save activity'}</Button></div>
  </form>
}
