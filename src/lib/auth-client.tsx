import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './http'
import { cachedSession, forgetAccount, type CachedSession } from './cache'
import { setRepositoryUser, pendingChanges } from './repository'
import { Button } from '../components/ui/button'
import { AuthScreen } from '../components/auth-screen'
interface AuthState { session: CachedSession; refresh: () => Promise<void>; signOut: () => Promise<void> }
const Context = createContext<AuthState | null>(null)
const authChannel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tend-auth') : null
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['session'], queryFn: async () => {
    if (!navigator.onLine) { const previous = await cachedSession(); if (previous && Date.parse(previous.expiresAt) > Date.now()) return previous; return null }
    const result = await api<CachedSession | null>('/api/session'); await cachedSession(result); return result
  }, retry: false, staleTime: 60000 })
  useEffect(() => { const update = () => { void client.invalidateQueries({ queryKey: ['session'] }) }; window.addEventListener('tend-session-expired', update); window.addEventListener('online', update); authChannel?.addEventListener('message', update); return () => { window.removeEventListener('tend-session-expired', update); window.removeEventListener('online', update); authChannel?.removeEventListener('message', update) } }, [client])
  if (query.isPending) return <div className="loading-screen"><img src="/favicon.svg" alt="" /><h1>Opening your space.</h1><div className="skeleton" /></div>
  if (query.error) return <div className="loading-screen"><h1>Your journal couldn’t connect.</h1><p>{query.error.message}</p><Button onClick={() => void query.refetch()}>Try again</Button></div>
  const refresh = async () => { await query.refetch(); await client.invalidateQueries({ queryKey: ['workspace'] }); authChannel?.postMessage('changed') }
  const session = query.data
  if (!session || window.location.pathname === '/reset-password') { setRepositoryUser(null); return <AuthScreen onSuccess={refresh} /> }
  setRepositoryUser(session.user.id)
  const signOut = async () => {
    if (!navigator.onLine) throw new Error('Reconnect to sign out securely.')
    if (await pendingChanges()) throw new Error('Sync or export and resolve your pending changes before signing out.')
    await api('/api/auth/sign-out', { method: 'POST', body: '{}' })
    await forgetAccount(session.user.id); setRepositoryUser(null); client.clear(); await refresh()
  }
  return <Context.Provider value={{ session, refresh, signOut }}>{children}</Context.Provider>
}
export function useAuth() { const state = useContext(Context); if (!state) throw new Error('Sign in to use this feature.'); return state }
