import { Link2, Pencil, Trash2, AlertTriangle, ImageIcon } from 'lucide-react'
import { useStore } from '../lib/store'
import { useActions } from './workspace'
import { ActivityIcon, CategoryPill, StatusPill, EmptyState } from './common'
import { Button } from './ui/button'
import { dateLabel } from '../lib/dates'
import type { ActivityLog } from '../lib/types'

export function ActivityList({ logs, showDate = true, compact = false }: { logs: ActivityLog[]; showDate?: boolean; compact?: boolean }) {
  const { data } = useStore(), actions = useActions()
  if (!logs.length) return <EmptyState compact icon="leaf" title="A fresh page for your day" description="Log a small moment. It all adds up." action={<Button size="sm" variant="outline" onClick={() => actions.quickAdd()}>Log an activity</Button>} />
  return <div className={`activity-list ${compact ? 'list-compact' : ''}`}>{logs.map(log => {
    const template = data.templates.find(t => t.id === log.templateId), cat = data.categories.find(c => c.id === log.categoryId)
    return <div key={log.id} className="activity-row"><ActivityIcon name={template?.icon ?? cat?.icon} color={cat?.color} /><div className="activity-row-content"><strong>{log.name}</strong><div className="activity-meta">{showDate && <span>{dateLabel(log.date, 'dd MMM')}</span>}{(log.time || log.timeOfDay) && <span>{log.time || log.timeOfDay}</span>}<CategoryPill id={log.categoryId} />{log.relatedId && <span title="Linked to a related event"><Link2 size={12} /></span>}{log.duplicate && <span className="review-indicator" title="Potential duplicate — review this entry"><AlertTriangle size={12} />Review</span>}{log.photo && <ImageIcon size={12} />}</div>{!compact && log.notes && <p className="log-note">{log.notes}</p>}{log.quantity !== undefined && <small>{log.quantity} {log.unit}</small>}{log.duration !== undefined && <small>{log.duration} min</small>}</div><StatusPill status={log.status} /><div className="row-actions"><Button variant="ghost" size="icon" aria-label={`Edit ${log.name}`} onClick={() => actions.editLog(log)}><Pencil size={14} /></Button>{!compact && <Button variant="ghost" size="icon" aria-label={`Delete ${log.name}`} onClick={() => actions.deleteLog(log)}><Trash2 size={14} /></Button>}</div></div>
  })}</div>
}
