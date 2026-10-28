import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowRight, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/http'
import { Button } from './ui/button'
const schema = z.object({ email: z.union([z.email('Enter a valid email address'), z.literal('')]), password: z.string().max(128), name: z.string().max(80), confirm: z.string() })
type Fields = z.infer<typeof schema>
export function AuthScreen({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const token = new URLSearchParams(location.search).get('token')
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>(location.pathname === '/reset-password' ? 'reset' : 'login'), [error, setError] = useState(''), [success, setSuccess] = useState('')
  const { data: config } = useQuery({ queryKey: ['public-config'], queryFn: () => api<{ passwordResetEnabled: boolean }>('/api/config'), retry: false })
  const { register, handleSubmit, formState: { isSubmitting, errors } } = useForm<Fields>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '', name: '', confirm: '' } })
  const submit = handleSubmit(async values => {
    setError(''); setSuccess('')
    if (mode !== 'reset' && !values.email) { setError('Enter your email address.'); return }
    if (['register', 'reset'].includes(mode) && (values.password.length < 12 || values.password !== values.confirm)) { setError('Use a password of at least 12 characters and make sure both passwords match.'); return }
    if (mode === 'login' && !values.password) { setError('Enter your password.'); return }
    try {
      if (mode === 'forgot') { await api('/api/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email: values.email, redirectTo: `${location.origin}/reset-password` }) }); setSuccess('If that account exists, a reset link will arrive by email.'); return }
      if (mode === 'reset') { if (!token) throw new Error('This reset link is missing its token. Request a new link.'); await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword: values.password }) }); history.replaceState({}, '', '/'); setMode('login'); setSuccess('Your password was changed. Sign in with your new password.'); return }
      await api(mode === 'register' ? '/api/auth/sign-up/email' : '/api/auth/sign-in/email', { method: 'POST', body: JSON.stringify({ email: values.email, password: values.password, ...(mode === 'register' ? { name: values.name.trim() || 'My space' } : {}) }) })
      await onSuccess()
    } catch (e) { setError(e instanceof Error ? e.message : 'Sign-in failed. Please try again.') }
  })
  function change(next: typeof mode) { setMode(next); setError(''); setSuccess('') }
  return <div className="auth-layout"><section className="auth-story"><a className="brand" href="/"><img src="/favicon.svg" alt="" /><span>tend.</span></a><div><span className="eyebrow">A LITTLE CARE, EVERY DAY</span><h1>Your everyday.<br />A little more intentional.</h1><p>Your habits, routines, and small victories — together in one thoughtful space, wherever your day takes you.</p><div className="auth-proof"><LockKeyhole size={17} /><span>Your own account. Your own progress.</span></div></div><small>Grow at your own pace.</small></section><section className="auth-form-wrap"><div className="auth-form-card"><span className="eyebrow">MAKE YOURSELF AT HOME</span><h2>{mode === 'register' ? 'Plant a new beginning.' : mode === 'forgot' ? 'Find your way back.' : mode === 'reset' ? 'A fresh start.' : 'Welcome back.'}</h2><p>{mode === 'register' ? 'Create an account to keep your journal with you.' : mode === 'forgot' ? 'We’ll email a secure password reset link.' : mode === 'reset' ? 'Choose a new password for your account.' : 'Sign in to your personal space.'}</p><form className="form-stack" onSubmit={submit}>
      {mode === 'register' && <label><span className="inline-label"><UserRound size={14} />Your name</span><input {...register('name')} autoComplete="given-name" placeholder="What should we call you?" /></label>}
      {mode !== 'reset' && <label><span className="inline-label"><Mail size={14} />Email address</span><input {...register('email')} type="email" required autoComplete="email" placeholder="you@example.com" /></label>}
      {mode !== 'forgot' && <label><span className="inline-label"><LockKeyhole size={14} />Password</span><input {...register('password')} type="password" required minLength={mode === 'login' ? undefined : 12} maxLength={128} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? 'Your password' : 'At least 12 characters'} /></label>}
      {['register', 'reset'].includes(mode) && <label>Confirm password<input {...register('confirm')} type="password" required autoComplete="new-password" /></label>}
      {(error || Object.keys(errors).length > 0) && <p className="form-error" role="alert">{error || Object.values(errors).map(e => e.message).join('. ')}</p>}{success && <div className="notice gentle" role="status">{success}</div>}
      <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'One moment…' : mode === 'register' ? 'Create my account' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Save new password' : 'Sign in'}<ArrowRight size={16} /></Button>
      {mode === 'login' && config?.passwordResetEnabled && <Button type="button" variant="ghost" onClick={() => change('forgot')}>Forgot your password?</Button>}
    </form><div className="auth-switch">{mode === 'login' ? <>New here? <button onClick={() => change('register')}>Create an account</button></> : <button onClick={() => change('login')}>Back to sign in</button>}</div><small className="muted">Your credentials are handled securely by the server.</small></div></section></div>
}
