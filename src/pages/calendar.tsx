import { useState } from 'react'
import { addMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addWeeks, addDays, parseISO, isSameMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, CalendarDays, Clock } from 'lucide-react'
import { useStore } from '../lib/store'
import { useActions } from '../components/workspace'
import { PageHeading, SectionHeading, ActivityIcon } from '../components/common'
import { ActivityList } from '../components/activity-list'
import { Button } from '../components/ui/button'
import { dateKey, dateLabel, dateRange } from '../lib/dates'
import { eligible } from '../lib/analytics'

export default function CalendarPage() {
  const { data, today } = useStore(), actions = useActions()
  const [selected, setSelected] = useState(today), [anchor, setAnchor] = useState(today), [view, setView] = useState('month'), [category, setCategory] = useState(''), [habit, setHabit] = useState('')
  const d = parseISO(anchor)
  const from = view === 'month' ? dateKey(startOfWeek(startOfMonth(d), { weekStartsOn: 1 })) : view === 'week' ? dateKey(startOfWeek(d, { weekStartsOn: 1 })) : anchor
  const to = view === 'month' ? dateKey(endOfWeek(endOfMonth(d), { weekStartsOn: 1 })) : view === 'week' ? dateKey(endOfWeek(d, { weekStartsOn: 1 })) : anchor
  const days = dateRange(from, to)
  const all = data.logs.filter(l => (!category || l.categoryId === category) && (!habit || l.templateId === habit))
  const selectedLogs = all.filter(l => l.date === selected).sort((a, b) => a.time.localeCompare(b.time))
  const schedules = data.templates.filter(t => t.kind === 'habit' && t.state === 'active' && eligible(t, selected) && (!category || t.categoryId === category) && (!habit || t.id === habit) && !selectedLogs.some(l => l.templateId === t.id && l.status === 'completed'))
  function move(n: number) { const next = dateKey(view === 'month' ? addMonths(d, n) : view === 'week' ? addWeeks(d, n) : addDays(d, n)); setAnchor(next); if (view === 'day') setSelected(next) }
  return <>
    <PageHeading eyebrow="ONE DAY AT A TIME" title="Your days, in view" description="Find your rhythm. Revisit a moment. Plan a little ahead." actions={<Button onClick={() => actions.quickAdd(selected)}><Plus size={16} />Add activity</Button>} />
    <div className="calendar-layout"><section className="panel calendar-panel"><div className="calendar-toolbar"><div className="calendar-navigation"><Button variant="ghost" size="icon" aria-label="Previous calendar period" onClick={() => move(-1)}><ChevronLeft size={18} /></Button><h2>{dateLabel(anchor, view === 'day' ? 'dd MMMM yyyy' : 'MMMM yyyy')}</h2><Button variant="ghost" size="icon" aria-label="Next calendar period" onClick={() => move(1)}><ChevronRight size={18} /></Button></div><Button variant="outline" size="sm" onClick={() => { setAnchor(today); setSelected(today) }}>Today</Button><div className="segmented">{['day', 'week', 'month'].map(v => <button key={v} className={view === v ? 'active' : ''} onClick={() => { setView(v); setAnchor(selected) }}>{v}</button>)}</div></div>
    <div className="calendar-filters"><select aria-label="Calendar category" value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><select aria-label="Calendar activity" value={habit} onChange={e => setHabit(e.target.value)}><option value="">All activities</option>{data.templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></div>
    {view !== 'day' && <div className="calendar-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span key={day}>{day}</span>)}</div>}
    <div className={`calendar-grid view-${view}`}>{days.map(day => {
      const entries = all.filter(l => l.date === day), completed = entries.filter(l => l.status === 'completed').length
      const planned = entries.filter(l => l.status === 'planned').length
      const scheduled = data.templates.filter(t => t.kind === 'habit' && t.state === 'active' && eligible(t, day) && (!category || t.categoryId === category) && (!habit || t.id === habit))
      return <button className={`calendar-day ${selected === day ? 'selected' : ''} ${day === today ? 'is-today' : ''} ${!isSameMonth(parseISO(day), d) && view === 'month' ? 'outside-month' : ''}`} key={day} aria-label={`${dateLabel(day, 'dd MMMM yyyy')}: ${completed} completed, ${planned} planned, ${scheduled.length} scheduled habits`} aria-pressed={selected === day} onClick={() => setSelected(day)}><span className="day-number">{dateLabel(day, 'd')}{day === today && <small>Today</small>}</span>{completed > 0 && <span className="day-count">{completed} <span>activit{completed === 1 ? 'y' : 'ies'}</span></span>}<div className="day-dots">{[...new Set(entries.filter(l => l.status === 'completed').map(l => l.categoryId))].map(id => <i key={id} style={{ background: data.categories.find(c => c.id === id)?.color }} />)}{(planned > 0 || day > today && scheduled.length > 0) && <span className="scheduled-dot" title="Planned or scheduled" />}</div>{view !== 'month' && entries.slice(0, 5).map(l => <span className={`calendar-entry ${l.status}`} key={l.id}>{l.name}</span>)}</button>
    })}</div><div className="calendar-legend"><span><i className="tiny-dot" />Recorded activity</span><span><i className="scheduled-dot" />Planned / scheduled</span><small>Blank days are untracked.</small></div></section>
    <aside className="panel calendar-detail"><div className="selected-day-label"><CalendarDays size={16} />{selected === today ? 'TODAY' : dateLabel(selected, 'EEEE').toUpperCase()}</div><SectionHeading title={dateLabel(selected, 'dd MMMM')} subtitle={`${selectedLogs.filter(l => l.status === 'completed').length} completed activities`} action={<Button variant="ghost" size="icon" aria-label="Add to selected date" onClick={() => actions.quickAdd(selected)}><Plus size={18} /></Button>} /><ActivityList logs={selectedLogs} showDate={false} compact />{!!schedules.length && <div className="calendar-schedules"><h3><Clock size={14} />{selected > today ? 'Coming up' : 'Scheduled habits'}</h3>{schedules.map(t => <div key={t.id}><ActivityIcon name={t.icon} color={t.color} /><span><strong>{t.name}</strong><small>{t.reminder || t.schedule.frequency}</small></span><Button variant="ghost" size="sm" onClick={() => actions.logDetails(t, selected)}>{selected > today ? 'Plan' : 'Log'}</Button></div>)}</div>}<Button variant="outline" className="full-width" onClick={() => actions.quickAdd(selected)}><Plus size={15} />Add to this day</Button></aside></div>
  </>
}
