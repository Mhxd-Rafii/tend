import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useStore } from '../lib/store'
import { templateSchema } from '../lib/schemas'
import type { ActivityTemplate } from '../lib/types'
import { ActivityIcon, iconNames } from './common'
import { Button } from './ui/button'

export function TemplateForm({ initial, onClose }: { initial: ActivityTemplate; onClose: () => void }) {
  const { data, save, pending, today } = useStore()
  const { register, watch, setValue, handleSubmit, formState: { errors } } = useForm<ActivityTemplate>({ resolver: zodResolver(templateSchema), defaultValues: initial })
  const values = watch()
  const submit = handleSubmit(async values => { if (await save(d => {
    const previous = d.templates.find(t => t.id === values.id)
    values.pauses = previous ? structuredClone(previous.pauses) : values.pauses
    if (previous?.state === 'active' && values.state !== 'active' || !previous && values.state !== 'active') values.pauses.push({ start: today, end: '' })
    if (values.state === 'active') values.pauses.forEach(p => { if (!p.end) p.end = today })
    d.templates = [...d.templates.filter(t => t.id !== values.id), values]
  })) { toast.success('Activity saved'); onClose() } })
  const errorsList = Object.values(errors).flatMap(e => e?.message ? [String(e.message)] : e && typeof e === 'object' ? Object.values(e).flatMap(n => n && typeof n === 'object' && 'message' in n ? [String(n.message)] : []) : [])
  return <form onSubmit={submit} className="form-stack">
    <label>Activity name<input autoFocus {...register('name')} placeholder="e.g. Read for 20 minutes" maxLength={150} /></label>
    <div className="form-grid"><label>Category<select {...register('categoryId')}>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Activity type<select {...register('kind')}><option value="activity">Occasional activity</option><option value="habit">Scheduled habit</option></select></label><label>Tracking type<select {...register('tracking')}>{[['checkbox', 'Check off'], ['number', 'Numeric value'], ['duration', 'Duration'], ['rating', 'Rating (1–5)'], ['custom', 'Custom fields']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label><label>Default unit<input {...register('unit')} placeholder="e.g. ml, pages, kg" maxLength={40} /></label></div>
    <label>Icon<div className="icon-picker">{iconNames.map(name => <button type="button" key={name} aria-label={`Use ${name} icon`} aria-pressed={values.icon === name} className={values.icon === name ? 'selected' : ''} onClick={() => setValue('icon', name)}><ActivityIcon name={name} /></button>)}</div></label>
    <div className="form-grid"><label>Accent color<input type="color" {...register('color')} /></label><label>State<select {...register('state')}><option value="active">Active</option><option value="paused">Paused</option><option value="archived">Archived</option></select></label></div>
    <label>Description<textarea {...register('description')} rows={2} maxLength={1000} placeholder="Your reason for showing up." /></label>
    <label>Default log notes<textarea {...register('notes')} rows={2} maxLength={5000} placeholder="Optional details to prefill when logging." /></label>
    {values.kind === 'habit' && <fieldset><legend>Your rhythm</legend><div className="form-grid"><label>Starts on<input type="date" {...register('startDate')} /></label><label>Ends on <span className="optional">optional</span><input type="date" {...register('endDate')} /></label><label>Frequency<select {...register('schedule.frequency')}><option value="daily">Every day</option><option value="weekdays">Selected weekdays</option><option value="weekly">Weekly target</option><option value="monthly">Monthly target</option><option value="custom">Specific dates</option></select></label><label>Reminder time<input type="time" {...register('reminder')} /><small className="muted">Requires the app to be open and notifications enabled.</small></label>
    {['weekly', 'monthly'].includes(values.schedule.frequency) && <label>Days per {values.schedule.frequency === 'weekly' ? 'week' : 'month'}<input type="number" min="1" max={values.schedule.frequency === 'weekly' ? 7 : 31} {...register('schedule.target', { valueAsNumber: true })} /></label>}
    {values.tracking !== 'checkbox' && values.tracking !== 'custom' && <label>Daily goal {values.tracking === 'duration' ? '(minutes)' : values.unit}<input type="number" min="0.01" step="any" max={values.tracking === 'rating' ? 5 : undefined} {...register('goal', { valueAsNumber: true })} /></label>}</div>
    {values.schedule.frequency === 'weekdays' && <div className="weekday-picker">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, i) => <button type="button" key={i} aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][i]} aria-pressed={values.schedule.days.includes(i)} className={values.schedule.days.includes(i) ? 'selected' : ''} onClick={() => setValue('schedule.days', values.schedule.days.includes(i) ? values.schedule.days.filter(d => d !== i) : [...values.schedule.days, i])}>{label}</button>)}</div>}
    {values.schedule.frequency === 'custom' && <label>Dates (one per line, YYYY-MM-DD)<textarea rows={4} value={values.schedule.dates.join('\n')} onChange={e => setValue('schedule.dates', e.target.value.split('\n'))} placeholder="2026-11-01&#10;2026-11-05" /></label>}
    </fieldset>}
    <label className="check-line"><input type="checkbox" {...register('favorite')} />Add to favorites for faster logging</label>
    {!!errorsList.length && <div className="form-error" role="alert">{errorsList.join('. ')}</div>}
    <div className="form-actions"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save activity'}</Button></div>
  </form>
}
