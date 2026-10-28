import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from './ui/button'
import { toast } from 'sonner'
interface InstallEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
const Context = createContext<{ install: () => Promise<void>; canInstall: boolean; installed: boolean }>({ install: async () => {}, canInstall: false, installed: false })
export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null), [installed, setInstalled] = useState(matchMedia('(display-mode: standalone)').matches)
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({ onOfflineReady() { toast.success('Ready for your offline days', { description: 'The app is cached. Your records always save on this device.' }) }, onRegisterError(error) { console.error('Offline shell registration failed', error) } })
  useEffect(() => { const before = (e: Event) => { e.preventDefault(); setPrompt(e as InstallEvent) }; const done = () => { setInstalled(true); setPrompt(null) }; window.addEventListener('beforeinstallprompt', before); window.addEventListener('appinstalled', done); return () => { window.removeEventListener('beforeinstallprompt', before); window.removeEventListener('appinstalled', done) } }, [])
  const install = async () => { if (prompt) { await prompt.prompt(); await prompt.userChoice; setPrompt(null) } }
  return <Context.Provider value={{ install, canInstall: !!prompt, installed }}>{children}{needRefresh && <div className="update-banner"><span>A fresh version of Tend is ready. Finish any open form before updating.</span><Button size="sm" onClick={() => void updateServiceWorker(true)}>Update</Button><Button variant="ghost" size="sm" onClick={() => setNeedRefresh(false)}>Later</Button></div>}</Context.Provider>
}
export const usePwa = () => useContext(Context)
