import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, ArrowRight, Plus, ChevronLeft, ChevronRight, CalendarDays, CheckCheck, Flame, Sprout, Settings2, Link2 } from 'lucide-react'
import { useStore } from '../lib/store'
import { useActions } from '../components/workspace'
import { ActivityIcon, SectionHeading, ViewAll, EmptyState } from '../components/common'
import { ActivityList } from '../components/activity-list'
import { QuickAdd } from '../components/quick-add'
import { ActivityChart, CategoryChart } from '../components/charts'
import { Button } from '../components/ui/button'
import { dateLabel, shiftDate, dateRange } from '../lib/dates'
import { eligible, habitStats, habitTargetReached } from '../lib/analytics'

export default function Dashboard() {
  const { data, today } = useStore(), actions = useActions(), navigate = useNavigate()
  const [day, setDay] = useState(today), [range, setRange] = useState('week')
  const start = range === 'week' ? shiftDate(day, -6) : `${day.slice(0, 7)}-01`
  const logs = data.logs.filter(l => l.status === 'completed' && l.date >= start && l.date <= day && l.date <= today)
  const monthLogs = data.logs.filter(l => l.status === 'completed' && l.date.startsWith(day.slice(0, 7)) && l.date <= today)
  const habits = data.templates.filter(t => t.kind === 'habit' && t.state === 'active')
  const stats = habits.map(t => habitStats(t, data.logs, today)), longest = Math.max(0, ...stats.map(s => s.longest))
  const scheduled = habits.filter(t => eligible(t, day))
  const widget = (id: string) => {
    if (id === 'weekly') return <section className="panel" key={id}><SectionHeading title="Your activity, at a glance" subtitle={range === 'week' ? 'Small actions, across the week.' : 'Your rhythm throughout the month.'} action={<div className="segmented"><button className={range === 'week' ? 'active' : ''} onClick={() => setRange('week')}>Week</button><button className={range === 'month' ? 'active' : ''} onClick={() => setRange('month')}>Month</button></div>} /><div className="chart-summary"><strong>{logs.length}</strong><span>activities completed <span className="chart-range">· {dateLabel(start, 'dd MMM')} – {dateLabel(day, 'dd MMM')}</span></span><span className="chart-key"><i />Activities</span></div><ActivityChart points={dateRange(start, day).map(date => ({ date, count: logs.filter(l => l.date === date).length }))} monthly={range === 'month'} /></section>
    if (id === 'categories') return <section className="panel" key={id}><SectionHeading title="A little of everything" subtitle="Where your care went this period." /><CategoryChart counts={data.categories.map(c => ({ ...c, count: logs.filter(l => l.categoryId === c.id).length }))} /></section>
    if (id === 'recent') return <section className="panel recent-panel" key={id}><SectionHeading title="Recently logged" subtitle="The little things you showed up for." action={<ViewAll onClick={() => navigate('/log')} />} /><ActivityList logs={[...data.logs].filter(l => l.date <= today).sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5)} compact /></section>
    if (id === 'habits') return <section className="panel habits-panel" key={id}><SectionHeading title={day === today ? 'On your list today' : `On your list · ${dateLabel(day, 'dd MMM')}`} subtitle="A little structure. Plenty of room to grow." action={<Button variant="ghost" size="icon" aria-label="Create a habit" onClick={() => actions.editTemplate(undefined, true)}><Plus size={17} /></Button>} />{scheduled.length ? <div className="scheduled-list">{scheduled.map(t => { const s = habitStats(t, data.logs, today), done = habitTargetReached(t, data.logs, day); return <div key={t.id} className="scheduled-row"><button className={`habit-check ${done ? 'done' : ''}`} aria-label={`Log ${t.name}`} onClick={() => void actions.instantLog(t, day)}>{done ? '✓' : ''}</button><div><strong>{t.name}</strong><small>{t.reminder || t.schedule.frequency} · {s.current} period streak</small></div><span>{s.rate}%</span></div> })}</div> : <EmptyState compact icon="sprout" title="Make room for a new routine" description="Create a scheduled habit. Occasional activities can stay wonderfully occasional." action={<Button variant="outline" size="sm" onClick={() => actions.editTemplate(undefined, true)}><Plus size={14} />Create a habit</Button>} />}<button className="panel-bottom-link" onClick={() => navigate('/habits')}>Your habits, your pace <ArrowRight size={15} /></button></section>
    return null
  }
  return <>
    <div className="page-heading dashboard-heading"><div><div className="eyebrow"><span className="tiny-dot" /> YOUR PERSONAL SPACE</div><h1>A little care, every day<span className="heading-dot">.</span></h1><p>{data.preferences.name ? `Welcome back, ${data.preferences.name}. ` : ''}Keep track of the small things that make a difference.</p></div><div className="date-navigator"><Button variant="ghost" size="icon" aria-label="Previous day" onClick={() => setDay(d => shiftDate(d, -1))}><ChevronLeft size={16} /></Button><label><CalendarDays size={15} /><span>{day === today ? 'Today' : dateLabel(day, 'EEE')}, {dateLabel(day, 'dd MMM')}</span><input type="date" aria-label="Dashboard date" value={day} onChange={e => e.target.value && setDay(e.target.value)} /></label><Button variant="ghost" size="icon" aria-label="Next day" onClick={() => setDay(d => shiftDate(d, 1))}><ChevronRight size={16} /></Button></div></div>
    <section className="welcome-banner"><div className="welcome-copy"><span className="mini-eyebrow"><Sprout size={14} />GROW AT YOUR OWN PACE</span><h2>Good things start<br />with a little tending.</h2><p>A workout. A moment of care. A routine that sticks.<br className="desktop-only" /> Every small action deserves a place.</p><Button variant="secondary" onClick={() => actions.quickAdd(day)}>Log a little progress <ArrowUpRight size={17} /></Button></div><div className="banner-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="art-leaf leaf-one" /><div className="art-leaf leaf-two" /><div className="art-leaf leaf-three" /><div className="art-stem" /><div className="art-pot" /><span className="art-spark s1">✦</span><span className="art-spark s2">✧</span><div className="floating-chip chip-one"><ActivityIcon name="sparkles" color="#8b9e65" /><span>A moment for you</span><span className="chip-check">✓</span></div><div className="floating-chip chip-two"><ActivityIcon name="leaf" color="#7b9470" /><span>Little by little.</span></div></div><div className="banner-counter">01 / YOUR EVERYDAY, INTENTIONALLY</div></section>
    <div className="stats-grid">{[
      { label: 'Activities this month', value: monthLogs.length, sub: 'Every little action counts', icon: CheckCheck, color: 'green' },
      { label: 'Days you showed up', value: new Set(monthLogs.map(l => l.date)).size, sub: `in ${dateLabel(day, 'MMMM')}`, icon: CalendarDays, color: 'gold' },
      { label: 'Longest habit streak', value: longest || '—', sub: longest ? 'scheduled periods in a row' : 'Your next chapter starts here', icon: Flame, color: 'rose' },
      { label: 'Active habits', value: habits.length, sub: habits.length ? `${stats.reduce((n, s) => n + s.completed, 0)} eligible completions` : 'Build a rhythm that fits you', icon: Sprout, color: 'purple' },
    ].map(s => <div className="stat-card" key={s.label}><div><span className="stat-label">{s.label}</span><strong>{s.value}</strong><small>{s.sub}</small></div><span className={`stat-icon ${s.color}`}><s.icon size={19} strokeWidth={1.7} /></span></div>)}</div>
    <section className="panel quick-panel"><SectionHeading title="What have you been up to?" subtitle={`Quick add to ${day === today ? 'today' : dateLabel(day, 'dd MMM')}. Your familiar activities, one tap away.`} action={<Button variant="ghost" size="sm" onClick={() => navigate('/suggestions')}>Manage activities <ArrowUpRight size={14} /></Button>} /><QuickAdd date={day} /></section>
    <div className="dashboard-widgets">{data.preferences.widgets.map(widget)}</div>
    <div className="dashboard-footnote"><span><Link2 size={13} />Your journal follows your account. Keep a backup for peace of mind.</span><Button variant="ghost" size="sm" onClick={() => navigate('/settings')}><Settings2 size={14} />Make this space yours</Button></div>
  </>
}
