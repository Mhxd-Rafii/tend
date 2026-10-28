import { Component, Suspense, lazy, useEffect, useRef, useState, type ReactNode } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { LayoutDashboard, CalendarDays, ListChecks, Sprout, Dumbbell, Sparkles, ChartNoAxesCombined, Settings, Search, Plus, ChevronRight, Menu, X, Check, WifiOff, Moon, Sun, HardDrive } from 'lucide-react'
import { StoreProvider, useStore } from './lib/store'
import { WorkspaceProvider, useActions } from './components/workspace'
import { PwaProvider } from './components/pwa'
import { Button } from './components/ui/button'
import { dateLabel } from './lib/dates'
import { AuthProvider, useAuth } from './lib/auth-client'
import './auth.css'

const Dashboard = lazy(() => import('./pages/dashboard'))
const Calendar = lazy(() => import('./pages/calendar'))
const ActivityLog = lazy(() => import('./pages/activity-log'))
const Habits = lazy(() => import('./pages/habits'))
const Gym = lazy(() => import('./pages/gym'))
const Suggestions = lazy(() => import('./pages/suggestions'))
const SettingsPage = lazy(() => import('./pages/settings'))
const Reports = lazy(() => import('./pages/reports'))
const client = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } })
const navigation = [
  { to: '/', label: 'Overview', Icon: LayoutDashboard, group: 'YOUR SPACE' },
  { to: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { to: '/log', label: 'Activity journal', Icon: ListChecks },
  { to: '/habits', label: 'My habits', Icon: Sprout, group: 'YOUR GROWTH' },
  { to: '/gym', label: 'Gym & workouts', Icon: Dumbbell },
  { to: '/suggestions', label: 'Activity library', Icon: Sparkles },
  { to: '/reports', label: 'Insights & reports', Icon: ChartNoAxesCombined },
]
class ErrorBoundary extends Component<{ children: ReactNode }, { error: boolean }> {
  state = { error: false }
  static getDerivedStateFromError() { return { error: true } }
  render() { return this.state.error ? <div className="loading-screen"><img src="/favicon.svg" alt="Tend" /><h1>This page needs a fresh start.</h1><p>Your confirmed journal is stored in your account.</p><Button onClick={() => window.location.reload()}>Reload Tend</Button></div> : this.props.children }
}
function Shell() {
  const { data, save, pending, online, today, queued } = useStore(), actions = useActions(), location = useLocation(), navigate = useNavigate()
  const { session } = useAuth()
  const [menu, setMenu] = useState(false), [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const current = navigation.find(n => n.to === location.pathname)?.label || (location.pathname === '/settings' ? 'Settings' : 'Your space')
  useEffect(() => { setMenu(false); window.scrollTo(0, 0) }, [location.pathname])
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest('input, textarea, select, [contenteditable="true"]')
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); searchRef.current?.focus() }
      if (!typing && e.key.toLowerCase() === 'n' && !document.querySelector('[role="dialog"]')) { e.preventDefault(); actions.quickAdd() }
      if (e.key === 'Escape') setMenu(false)
    }
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard)
  }, [actions])
  return <div className="app-shell"><a className="skip-link" href="#main">Skip to content</a>{menu && <button className="sidebar-overlay" aria-label="Close navigation" onClick={() => setMenu(false)} />}
    <aside className={`sidebar ${menu ? 'sidebar-open' : ''}`}><NavLink className="brand" to="/" aria-label="Tend home"><img src="/favicon.svg" alt="" /><span>tend<span className="brand-period">.</span></span></NavLink><button className="sidebar-close" aria-label="Close menu" onClick={() => setMenu(false)}><X size={20} /></button><div className="brand-tagline">A little care, every day.</div><nav aria-label="Main navigation" className="main-nav">{navigation.map(({ to, label, Icon, group }) => <div key={to}>{group && <div className="nav-group-label">{group}</div>}<NavLink to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Icon size={18} strokeWidth={1.7} /><span>{label}</span>{to === '/habits' && data.templates.some(t => t.kind === 'habit' && t.state === 'active') && <span className="nav-count">{data.templates.filter(t => t.kind === 'habit' && t.state === 'active').length}</span>}</NavLink></div>)}</nav><div className="sidebar-bottom"><div className="sidebar-note"><Sprout size={24} strokeWidth={1.4} /><h3>Little by little,<br />a little becomes a lot.</h3><span>YOUR PACE. YOUR PROGRESS.</span></div><NavLink to="/settings" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><Settings size={18} strokeWidth={1.7} />Settings</NavLink><button className="local-profile" onClick={() => navigate('/settings')}><span className="avatar">{data.preferences.name?.[0]?.toUpperCase() || 'Y'}</span><span><strong>{data.preferences.name || session.user.name || 'Your personal space'}</strong><small><i />Synced to your account</small></span><ChevronRight size={14} /></button></div></aside>
    <div className="app-main"><header className="topbar"><button className="mobile-menu-toggle" aria-label="Open navigation" aria-expanded={menu} onClick={() => setMenu(v => !v)}><Menu size={21} /></button><div className="breadcrumb"><span>Your space</span><ChevronRight size={12} /><strong>{current}</strong></div><form className="global-search" onSubmit={e => { e.preventDefault(); navigate(`/log?q=${encodeURIComponent(query)}`) }}><Search size={15} /><input ref={searchRef} aria-label="Search all activities" placeholder="Search your journal…" value={query} onChange={e => setQuery(e.target.value)} /><kbd>Ctrl K</kbd></form><div className={`storage-status ${!online ? 'offline' : ''}`}>{!online ? <WifiOff size={13} /> : pending ? <span className="saving-dot" /> : <Check size={13} />}<span>{pending ? 'Saving…' : queued ? queued + ' pending changes' : online ? 'Synced to your account' : 'Offline · cached journal'}</span></div><div className="topbar-divider" /><Button variant="ghost" size="icon" aria-label="Toggle color theme" onClick={() => { void save(d => { d.preferences.theme = document.documentElement.classList.contains('dark') ? 'light' : 'dark' }) }}>{document.documentElement.classList.contains('dark') ? <Sun size={18} /> : <Moon size={18} />}</Button><Button className="top-add" size="sm" onClick={() => actions.quickAdd()}><Plus size={15} />Quick add</Button></header>
    <main id="main" className="page-content"><Suspense fallback={<div className="route-skeleton"><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></div>}><Routes><Route path="/" element={<Dashboard />} /><Route path="/calendar" element={<Calendar />} /><Route path="/log" element={<ActivityLog key={location.search} />} /><Route path="/habits" element={<Habits />} /><Route path="/gym" element={<Gym />} /><Route path="/suggestions" element={<Suggestions />} /><Route path="/settings" element={<SettingsPage />} /><Route path="/reports" element={<Reports />} /><Route path="*" element={<div className="empty-state"><h1>A little off the path</h1><p>This page isn’t in your journal.</p><Button onClick={() => navigate('/')}>Back to your overview</Button></div>} /></Routes></Suspense><footer className="app-footer"><span><img src="/favicon.svg" alt="" />A little more intentional, every day.</span><span>{dateLabel(today, 'EEEE, dd MMM yyyy')}<span className="footer-local"><HardDrive size={11} />Private account</span></span></footer></main></div>
    <nav className="mobile-bottom-nav" aria-label="Mobile navigation"><NavLink to="/" end><LayoutDashboard size={20} /><span>Overview</span></NavLink><NavLink to="/calendar"><CalendarDays size={20} /><span>Calendar</span></NavLink><button className="mobile-quick" aria-label="Quick add activity" onClick={() => actions.quickAdd()}><span><Plus size={25} /></span><small>Quick add</small></button><NavLink to="/log"><ListChecks size={20} /><span>Journal</span></NavLink><button className={menu ? 'active' : ''} onClick={() => setMenu(v => !v)} aria-label="More pages" aria-expanded={menu}><Menu size={20} /><span>More</span></button></nav>
  </div>
}
export default function App() { return <ErrorBoundary><QueryClientProvider client={client}><PwaProvider><BrowserRouter><AuthProvider><StoreProvider><WorkspaceProvider><Shell /></WorkspaceProvider></StoreProvider></AuthProvider></BrowserRouter></PwaProvider><Toaster position="bottom-right" richColors closeButton toastOptions={{ className: 'tend-toast' }} /></QueryClientProvider></ErrorBoundary> }
