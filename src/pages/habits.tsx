import { useState } from 'react'
import { Flame, Pencil, Pause, Play, Archive, Check, CalendarDays, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { useStore } from '../lib/store'
import { useActions } from '../components/workspace'
import { ActivityIcon, PageHeading, CategoryPill, EmptyState, AddButton } from '../components/common'
import { Button } from '../components/ui/button'
import { eligible, habitStats, completedHabitDays, habitTargetReached } from '../lib/analytics'
import { dateRange, shiftDate, dateLabel } from '../lib/dates'
import type { ActivityTemplate } from '../lib/types'

export default function HabitsPage() {
  const { data, save, today } = useStore(), actions = useActions()
  const [state, setState] = useState('active'), [category, setCategory] = useState('')
  const habits = data.templates.filter(t => t.kind === 'habit' && (state === 'all' || t.state === state) && (!category || t.categoryId === category))
  async function changeState(t: ActivityTemplate, state: ActivityTemplate['state']) {
    if (await save(d => { const habit = d.templates.find(h => h.id === t.id)!; if (habit.state === 'active' && state !== 'active') habit.pauses.push({ start: today, end: '' }); if (state === 'active') habit.pauses.forEach(p => { if (!p.end) p.end = today }); habit.state = state })) toast.success(`Habit ${state === 'active' ? 'resumed' : state}`)
  }
  return <>
    <PageHeading eyebrow="SMALL STEPS, LASTING CHANGE" title="Your growing habits" description="Build a rhythm that fits your life. There’s no perfect pace." actions={<AddButton onClick={() => actions.editTemplate(undefined, true)}>Create habit</AddButton>} />
    <div className="habit-page-toolbar"><div className="text-tabs">{['active', 'paused', 'archived', 'all'].map(v => <button className={state === v ? 'active' : ''} key={v} onClick={() => setState(v)}>{v[0].toUpperCase() + v.slice(1)} <span>{data.templates.filter(t => t.kind === 'habit' && (v === 'all' || t.state === v)).length}</span></button>)}</div><select aria-label="Habit category" value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    {habits.length ? <div className="habit-grid">{habits.map(t => {
      const stats = habitStats(t, data.logs, today), done = habitTargetReached(t, data.logs, today), scheduled = eligible(t, today)
      const target = t.schedule.frequency === 'weekly' ? `${t.schedule.target} days / week` : t.schedule.frequency === 'monthly' ? `${t.schedule.target} days / month` : t.schedule.frequency === 'weekdays' ? t.schedule.days.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ') : t.schedule.frequency === 'custom' ? `${t.schedule.dates.length} scheduled dates` : 'Every day'
      return <section className="panel habit-card" key={t.id}><div className="habit-card-heading"><ActivityIcon name={t.icon} color={t.color} size={23} /><div><h2>{t.name}</h2><CategoryPill id={t.categoryId} /></div><Button variant="ghost" size="icon" aria-label={`Edit ${t.name}`} onClick={() => actions.editTemplate(t)}><Pencil size={15} /></Button></div><p className="habit-description">{t.description || 'A little commitment to yourself.'}</p><div className="habit-frequency"><CalendarDays size={14} />{target}{t.reminder && <span>· {t.reminder}</span>}</div>
      <div className="habit-week">{dateRange(shiftDate(today, -6), today).map(day => { const checked = completedHabitDays(t, data.logs).has(day); const due = eligible(t, day); return <button key={day} className={`${checked ? 'complete' : due ? 'due' : 'not-due'}`} aria-label={`${dateLabel(day, 'EEEE dd MMM')}: ${checked ? 'completed' : due ? 'scheduled' : 'not scheduled'}`} onClick={() => actions.logDetails(t, day)}><span>{dateLabel(day, 'EEEEE')}</span><i>{checked ? <Check size={14} /> : day === today ? '·' : ''}</i></button> })}</div>
      <div className="habit-progress-label"><span>Completion to date</span><strong>{stats.total ? `${stats.rate}%` : '—'}</strong></div><div className="progress-track"><div style={{ width: `${stats.rate}%`, background: t.color }} /></div><div className="habit-metrics"><div><strong><Flame size={15} />{stats.current}</strong><small>current streak</small></div><div><strong>{stats.longest}</strong><small>longest streak</small></div><div><strong>{stats.missed}</strong><small>missed to date</small></div></div>
      <div className="habit-card-footer">{t.state === 'active' ? <><Button size="sm" variant={done ? 'secondary' : 'default'} disabled={done || !scheduled} onClick={() => void actions.instantLog(t, today)}>{done ? <Check size={14} /> : <PlusIcon />}{done ? (['weekly', 'monthly'].includes(t.schedule.frequency) ? 'Target reached' : 'Logged today') : scheduled ? 'Log today' : 'Not scheduled today'}</Button><Button variant="ghost" size="icon" aria-label={`Pause ${t.name}`} onClick={() => void changeState(t, 'paused')}><Pause size={15} /></Button><Button variant="ghost" size="icon" aria-label={`Archive ${t.name}`} onClick={() => void changeState(t, 'archived')}><Archive size={15} /></Button></> : <Button size="sm" variant="outline" onClick={() => void changeState(t, 'active')}><Play size={14} />Resume habit</Button>}</div></section>
    })}</div> : <div className="panel"><EmptyState title={state === 'active' ? 'Every habit starts somewhere' : `No ${state === 'all' ? '' : state} habits yet`} description="Start with something small and meaningful. Your occasional activities will stay in Quick Add, without daily expectations." action={<Button onClick={() => actions.editTemplate(undefined, true)}>Plant your first habit <ArrowRight size={15} /></Button>} /></div>}
    <div className="notice gentle"><Flame size={18} /><p>Streaks follow your schedule. Days before you start, future dates, and paused periods don’t count as misses. Weekly and monthly targets use distinct completed days; their streaks count periods.</p></div>
  </>
}
function PlusIcon() { return <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> }
