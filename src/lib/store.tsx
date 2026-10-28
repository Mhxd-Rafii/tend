import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { readData, mutateData, InitializationRequired, syncInfo, discardPending, pendingSnapshot, portableBackup } from './repository'
import { useAuth } from './auth-client'
import { Onboarding } from '../components/onboarding'
import { Button } from '../components/ui/button'
import { download } from './export'
import { today } from './dates'
import { eligible, habitTargetReached } from './analytics'
import type { AppData } from './types'

interface Store { data: AppData; save: (change: (draft: AppData) => void) => Promise<boolean>; pending: boolean; online: boolean; today: string; queued: number; syncError: string; syncNow: () => Promise<void> }
const Context = createContext<Store | null>(null)
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tend-updates') : null
export function StoreProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const { session } = useAuth(), queryKey = ['workspace', session.user.id]
  const { data, isPending, error, refetch } = useQuery({ queryKey, queryFn: readData, staleTime: 30000, refetchInterval: navigator.onLine ? 60000 : false, refetchOnWindowFocus: true, retry: (count, error) => !(error instanceof InitializationRequired) && count < 1 })
  const [sync, setSync] = useState({ queued: 0, error: '', syncedAt: '' })
  const [saving, setSaving] = useState(0), [online, setOnline] = useState(navigator.onLine)
  const [clock, setClock] = useState(Date.now())
  const notified = useRef(new Set<string>())
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    const sync = () => { void client.invalidateQueries({ queryKey: ['workspace'] }) }
    const state = () => { void syncInfo().then(setSync) }
    state()
    const tick = setInterval(() => setClock(Date.now()), 15000)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    window.addEventListener('online', sync); window.addEventListener('tend-sync-state', state)
    channel?.addEventListener('message', sync)
    return () => { clearInterval(tick); window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('online', sync); window.removeEventListener('tend-sync-state', state); channel?.removeEventListener('message', sync) }
  }, [client])
  useEffect(() => {
    if (!data) return
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.classList.toggle('dark', data.preferences.theme === 'dark' || data.preferences.theme === 'system' && media.matches)
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply)
  }, [data?.preferences.theme])
  useEffect(() => {
    if (!data?.preferences.notifications || !('Notification' in window) || Notification.permission !== 'granted') return
    const day = today(data.preferences.timezone)
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: data.preferences.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(clock))
    for (const t of data.templates.filter(t => t.state === 'active' && t.reminder && eligible(t, day))) {
      const key = `${day}:${t.id}`
      if (t.reminder === time && !notified.current.has(key) && !habitTargetReached(t, data.logs, day)) {
        notified.current.add(key)
        const title = `A little time for ${t.name.toLowerCase()}`, options = { body: 'Your Tend reminder. Open the app to log your activity.', icon: '/icon-192.png', tag: key }
        void (async () => { try { const registration = await navigator.serviceWorker?.getRegistration(); if (registration?.showNotification) await registration.showNotification(title, options); else new Notification(title, options) } catch { toast.info(title, { description: 'Your browser couldn’t show a system notification.' }) } })()
      }
    }
  }, [clock, data])
  if (isPending) return <div className="loading-screen"><img src="/favicon.svg" alt="" /><h1>Making room for your day.</h1><div className="skeleton" /><div className="skeleton short" /></div>
  if (error instanceof InitializationRequired) return <Onboarding onDone={() => void refetch()} />
  if (!data) return <div className="loading-screen"><h1>Your journal couldn’t open</h1><p>{error?.message || 'The server could not load this account’s journal.'}</p><Button onClick={() => void refetch()}>Try again</Button></div>
  const save: Store['save'] = async change => {
    setSaving(n => n + 1)
    try {
      const next = await mutateData(change)
      client.setQueryData<AppData>(queryKey, next)
      channel?.postMessage(next.revision)
      return true
    } catch (e) { toast.error(e instanceof Error ? e.message : 'The server did not confirm this change. Retry synchronization.'); return false }
    finally { setSaving(n => n - 1) }
  }
  const syncNow = async () => { await refetch() }
  return <Context.Provider value={{ data, save, pending: saving > 0, online, today: today(data.preferences.timezone), queued: sync.queued, syncError: sync.error, syncNow }}>
    {(sync.queued > 0 || error) && <div className="sync-banner" role="status"><span>{sync.error || error?.message || `${sync.queued} change(s) saved on this device, waiting for server confirmation.`}</span><Button size="sm" disabled={!online} onClick={() => void refetch()}>Retry sync</Button>{sync.error && <Button variant="outline" size="sm" disabled={!online} onClick={async () => { if (!confirm('Download a backup of your pending changes, then discard them and load the server version?')) return; try { const backup = await portableBackup(await pendingSnapshot()); download(JSON.stringify(backup, null, 2), `tend-pending-${Date.now()}.json`, 'application/json'); const next = await discardPending(); client.setQueryData(queryKey, next); await refetch() } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not resolve pending changes.') } }}>Back up & use server copy</Button>}</div>}{children}</Context.Provider>
}
export function useStore() { const context = useContext(Context); if (!context) throw new Error('StoreProvider is required'); return context }
