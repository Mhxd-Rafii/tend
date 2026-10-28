import { useMemo, useState } from 'react'
import { Search, Plus, SlidersHorizontal, Star, Check } from 'lucide-react'
import { useStore } from '../lib/store'
import { useActions } from './workspace'
import { ActivityIcon } from './common'
import { Button } from './ui/button'

export function QuickAdd({ date, onDateChange, full = false }: { date: string; onDateChange?: (date: string) => void; full?: boolean }) {
  const { data, pending, today } = useStore(), actions = useActions()
  const [query, setQuery] = useState(''), [category, setCategory] = useState('all'), [tab, setTab] = useState('suggested')
  const recentIds = [...new Set([...data.logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.date.localeCompare(a.date) || b.time.localeCompare(a.time)).map(l => l.templateId))].slice(0, 12)
  const templates = useMemo(() => {
    const counts = new Map<string, number>(); data.logs.forEach(l => counts.set(l.templateId, (counts.get(l.templateId) || 0) + 1))
    return data.templates.filter(t => t.state === 'active' && (!query || t.name.toLowerCase().includes(query.toLowerCase())) && (category === 'all' || t.categoryId === category) && (tab !== 'favorites' || t.favorite) && (tab !== 'recent' || recentIds.includes(t.id))).sort((a, b) => Number(b.favorite) - Number(a.favorite) || (counts.get(b.id) || 0) - (counts.get(a.id) || 0) || a.order - b.order)
  }, [data.templates, data.logs, query, category, tab])
  return <div className={`quick-add ${full ? 'quick-full' : ''}`}>
    <div className="quick-search-row"><div className="search-input"><Search size={17} /><input aria-label="Search activity suggestions" placeholder="What did you do? Find an activity…" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && templates[0]) { e.preventDefault(); void actions.instantLog(templates[0], date) } }} /><kbd>↵</kbd></div>{onDateChange && <input aria-label="Logging date" type="date" value={date} onChange={e => e.target.value && onDateChange(e.target.value)} />}</div>
    <div className="quick-tabs"><div className="text-tabs">{[['suggested', 'For you'], ['recent', 'Recently used'], ['favorites', 'Favorites']].map(([id, label]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{id === 'favorites' && <Star size={12} />}{label}</button>)}</div><select aria-label="Suggestion category" value={category} onChange={e => setCategory(e.target.value)}><option value="all">All categories</option>{data.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
    <div className="suggestion-grid">{templates.slice(0, full || query || category !== 'all' ? 1000 : 6).map(t => {
      const cat = data.categories.find(c => c.id === t.categoryId)
      const logged = data.logs.some(l => l.templateId === t.id && l.date === date && l.status === 'completed')
      return <div className={`suggestion ${logged ? 'is-logged' : ''}`} key={t.id}><button disabled={pending} aria-label={`Log ${t.name}`} className="suggestion-main" onClick={() => void actions.instantLog(t, date)}><ActivityIcon name={t.icon} color={cat?.color} /><span><strong>{t.name}</strong><small>{cat?.name}</small></span>{logged ? <Check className="suggestion-plus" size={16} /> : <Plus className="suggestion-plus" size={16} />}</button><button className="suggestion-details" aria-label={`Details for ${t.name}`} onClick={() => actions.logDetails(t, date)}><SlidersHorizontal size={13} /></button></div>
    })}</div>
    {!templates.length && <p className="empty-inline">Nothing here yet. Create an activity to make it your own.</p>}
    <div className="quick-footer"><span><span className="tiny-dot" />{date > today ? 'Future activities are saved as planned' : 'Tap to log · use sliders for details'}</span><Button variant="ghost" size="sm" onClick={() => actions.editTemplate()}><Plus size={14} />Create activity</Button></div>
  </div>
}
