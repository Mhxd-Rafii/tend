import { Sparkles, Droplet, Heart, Dumbbell, Leaf, Headphones, Sun, Moon, Zap, BookOpen, Coffee, Brain, Footprints, Plus, Check, Clock, ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useStore } from '../lib/store'
import { Button } from './ui/button'
export const iconNames = ['sparkles', 'droplet', 'heart', 'dumbbell', 'leaf', 'headphones', 'sun', 'moon', 'zap', 'book', 'coffee', 'brain', 'walking']
const icons = { sparkles: Sparkles, droplet: Droplet, heart: Heart, dumbbell: Dumbbell, leaf: Leaf, headphones: Headphones, sun: Sun, moon: Moon, zap: Zap, book: BookOpen, coffee: Coffee, brain: Brain, walking: Footprints }
export function ActivityIcon({ name = 'sparkles', size = 19, color, className = '' }: { name?: string; size?: number; color?: string; className?: string }) { const Icon = icons[name as keyof typeof icons] || Sparkles; return <span className={`activity-icon ${className}`} style={color ? { color, backgroundColor: `${color}16` } : {}}><Icon size={size} strokeWidth={1.8} /></span> }
export function CategoryPill({ id }: { id: string }) { const { data } = useStore(); const cat = data.categories.find(c => c.id === id); return cat ? <span className="category-pill"><i style={{ background: cat.color }} />{cat.name}</span> : null }
export function StatusPill({ status }: { status: string }) { return <span className={`status-pill ${status}`}>{status === 'completed' ? <Check size={12} /> : <Clock size={12} />}{status}</span> }
export function EmptyState({ icon = 'leaf', title, description, action, compact = false }: { icon?: string; title: string; description: string; action?: ReactNode; compact?: boolean }) { return <div className={`empty-state ${compact ? 'compact' : ''}`}><ActivityIcon name={icon} size={26} /><h3>{title}</h3><p>{description}</p>{action}</div> }
export function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) { return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{actions}</div></div> }
export function SectionHeading({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) { return <div className="section-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div> }
export function AddButton({ children = 'Add activity', onClick }: { children?: ReactNode; onClick: () => void }) { return <Button onClick={onClick}><Plus size={17} />{children}</Button> }
export function ViewAll({ onClick }: { onClick: () => void }) { return <Button variant="ghost" size="sm" onClick={onClick}>View all <ArrowRight size={14} /></Button> }
