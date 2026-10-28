import { useEffect, useState } from 'react'
import { Sprout, Upload, BookOpen, ArrowRight } from 'lucide-react'
import { initialize, mutateData, parseBackup } from '../lib/repository'
import { legacyJournal } from '../lib/cache'
import type { AppData } from '../lib/types'
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [legacy, setLegacy] = useState<AppData | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  useEffect(() => { void legacyJournal().then(setLegacy).catch(() => {}) }, [])
  async function start(seed: boolean, imported?: AppData) {
    setBusy(true); setError('')
    try { const base = await initialize(seed); if (imported) await mutateData(d => { Object.assign(d, imported, { revision: base.revision }) }); onDone() }
    catch (e) { setError(e instanceof Error ? e.message : 'Your journal could not be initialized.'); setBusy(false) }
  }
  return <div className="onboarding"><img src="/favicon.svg" alt="Tend" /><span className="eyebrow">YOUR NEXT CHAPTER</span><h1>Bring your progress along.</h1><p>Your account keeps the same journal on your phone and desktop. Choose how you’d like to begin.</p><div className="onboarding-options"><button disabled={busy} onClick={() => void start(true)}><BookOpen size={23} /><strong>Use my October history</strong><span>Import the 10 supplied events, including linked overnight routines and review flags.</span><ArrowRight size={18} /></button><button disabled={busy} onClick={() => void start(false)}><Sprout size={23} /><strong>Start a fresh journal</strong><span>Keep all suggestions and workout templates. Add your own activity history.</span><ArrowRight size={18} /></button>{legacy && <button disabled={busy} onClick={() => void start(false, legacy)}><Upload size={23} /><strong>Import this device’s journal</strong><span>Bring {legacy.logs.length} activities and {legacy.workouts.length} workouts from the previous browser-storage edition.</span><ArrowRight size={18} /></button>}</div><label className="file-label"><Upload size={16} />Or restore a JSON backup<input disabled={busy} type="file" accept=".json,application/json" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; try { await start(false, parseBackup(await file.text())) } catch { setError('This backup is invalid. Choose a Tend version-1 JSON backup.') } }} /></label>{busy && <p role="status">Setting up your account journal…</p>}{error && <p className="form-error" role="alert">{error}</p>}</div>
}
