import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import { parse } from 'dotenv'
const root = resolve('.'), cli = resolve('node_modules/vercel/dist/index.js'), stateFile = resolve('.deployment-state.json')
let state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {}
const values = existsSync('.env.local') ? parse(readFileSync('.env.local')) : {}
const credentials = Object.fromEntries(['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'SESSION_SECRET', 'RESEND_API_KEY', 'EMAIL_FROM'].map(name => [name, process.env[name] || values[name] || '']))
const privateValues = ['TURSO_AUTH_TOKEN', 'SESSION_SECRET', 'RESEND_API_KEY', 'VERCEL_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'].map(name => credentials[name] || process.env[name]).filter(Boolean)
const configurationHash = createHash('sha256').update(JSON.stringify(credentials)).digest('hex')
let revision = ''
const clean = text => privateValues.reduce((result, value) => result.replaceAll(value, '[redacted]'), text)
function saveState() { writeFileSync(stateFile, JSON.stringify(state, null, 2)) }
function run(args, { input, quiet = false, binary = process.execPath } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: root, env: process.env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk; if (!quiet && !input) process.stdout.write(clean(chunk.toString())) })
    child.stderr.on('data', chunk => { stderr += chunk; if (!quiet && !input) process.stderr.write(clean(chunk.toString())) })
    child.on('error', reject); child.on('close', status => status === 0 ? resolve({ stdout: clean(stdout), stderr: clean(stderr) }) : reject(new Error(clean(stderr || stdout).slice(-1200) || `Command failed (${status})`)))
    child.stdin.end(input || '')
  })
}
const vc = (args, options) => run([cli, ...args], options)
function json(text) { try { return JSON.parse(text) } catch { const start = text.indexOf('{'); if (start >= 0) return JSON.parse(text.slice(start)); throw new Error('The deployment CLI did not return usable metadata.') } }
async function verify(url) { const tsx = resolve('node_modules/tsx/dist/cli.mjs'); return run([tsx, 'scripts/verify-api.ts', url]) }
async function deployment(environment) {
  const prior = state[environment]
  const reusable = prior?.revision === revision && prior?.configurationHash === configurationHash && !['ERROR', 'CANCELED'].includes(prior?.status)
  if (reusable && prior?.url && prior.status === 'READY' && prior.verified) return prior
  let result
  if (reusable && prior?.url) result = json((await vc(['inspect', prior.url, '--wait', '--timeout', '3m', '--json'], { quiet: true })).stdout)
  else {
    const output = await vc(['deploy', '--yes', '--json', '--environment', environment], { quiet: true })
    result = json(output.stdout)
  }
  const rawURL = result.url || result.deployment?.url
  if (!rawURL) throw new Error('Vercel did not return a deployment URL.')
  const url = rawURL.startsWith('https://') ? rawURL : `https://${rawURL}`
  state[environment] = { id: result.id || result.deployment?.id, url, status: result.readyState || result.status || 'pending', revision, configurationHash, verified: false }; saveState()
  const inspected = json((await vc(['inspect', url, '--wait', '--timeout', '3m', '--json'], { quiet: true })).stdout)
  state[environment].status = inspected.readyState || inspected.status
  if (state[environment].status !== 'READY') { saveState(); throw new Error(`${environment} deployment is ${state[environment].status}.`) }
  // Deployment Protection is preserved; verification never creates bypass credentials.
  const aliases = inspected.alias || inspected.aliases || []
  const alias = environment === 'production' ? aliases.find(value => typeof value === 'string' && value.endsWith('.vercel.app')) : undefined
  const publicURL = alias ? `https://${alias.replace(/^https:\/\//, '')}` : url
  const probe = await fetch(`${publicURL}/api/health`, { redirect: 'manual' })
  const redirect = probe.headers.get('location')
  const vercelSignIn = redirect && new URL(redirect, publicURL).hostname === 'vercel.com'
  if (vercelSignIn || [401, 403].includes(probe.status) && !(probe.headers.get('content-type') || '').includes('application/json')) {
    state[environment].protected = true; state[environment].publicURL = publicURL; saveState(); console.log(`${environment} is READY but Vercel Deployment Protection prevents anonymous verification.`); return state[environment]
  }
  await verify(publicURL)
  state[environment].verified = true; state[environment].publicURL = publicURL; saveState(); return state[environment]
}
try {
  if (!credentials.TURSO_DATABASE_URL || !credentials.TURSO_AUTH_TOKEN || credentials.SESSION_SECRET.length < 32) throw new Error('Run npm run setup to configure server credentials before deployment.')
  await vc(['whoami'], { quiet: true }).catch(() => { throw new Error('Vercel is not signed in. Complete npm run vercel:login, then rerun npm run deploy.') })
  revision = (await run(['rev-parse', 'HEAD'], { binary: 'git', quiet: true })).stdout.trim()
  const dirty = (await run(['status', '--porcelain'], { binary: 'git', quiet: true })).stdout.trim()
  if (dirty) throw new Error('Commit your source changes before deployment so each release has a recorded Git revision. Run npm run launch to verify, commit and push them.')
  if (existsSync('.vercel/project.json')) {
    const linked = JSON.parse(readFileSync('.vercel/project.json', 'utf8'))
    if (!state.vercel?.projectId || state.vercel.projectId !== linked.projectId) throw new Error('This directory is linked to an unrecognized Vercel project. No settings were changed; review the project link first.')
  } else {
    const name = state.vercelAttempt?.name || `habit-tracker-${randomBytes(4).toString('hex')}`
    if (!state.vercelAttempt) { state.vercelAttempt = { name, createdAt: new Date().toISOString() }; saveState(); await vc(['project', 'create', name]) }
    else await vc(['project', 'inspect', name], { quiet: true })
    const originalEnv = existsSync('.env.local') ? readFileSync('.env.local') : null
    try { await vc(['link', '--yes', '--project', name]) } finally { if (originalEnv) writeFileSync('.env.local', originalEnv, { mode: 0o600 }) }
    const linked = JSON.parse(readFileSync('.vercel/project.json', 'utf8')); state.vercel = { name, projectId: linked.projectId, orgId: linked.orgId, environmentConfigured: false }; saveState()
  }
  if (state.vercel.configurationHash !== configurationHash) {
    for (const name of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'SESSION_SECRET', 'RESEND_API_KEY', 'EMAIL_FROM']) if (credentials[name]) {
      await vc(['env', 'add', name, '--environment', 'production,preview,development', '--sensitive', '--force', '--yes'], { input: credentials[name] + '\n', quiet: true }); console.log(`Configured ${name} as a server-only Vercel variable.`)
    }
    await vc(['env', 'add', 'APP_URL', '--environment', 'development', '--no-sensitive', '--force', '--yes'], { input: 'http://localhost:5173\n', quiet: true })
    state.vercel.environmentConfigured = true; state.vercel.configurationHash = configurationHash; saveState()
  }
  const preview = await deployment('preview'); console.log(`Preview: ${preview.url} (${preview.status}; API verification ${preview.verified ? 'passed' : 'blocked by deployment protection'})`)
  const production = await deployment('production'); console.log(`Production: ${production.publicURL || production.url} (${production.status}; API verification ${production.verified ? 'passed' : 'blocked by deployment protection'})`)
  if (state.github?.url && !state.vercel.gitConnected) {
    try { await vc(['git', 'connect', state.github.url, '--yes']); state.vercel.gitConnected = true; saveState() }
    catch { console.log('Deployment is live. Automatic Git deployments still need repository access enabled in Vercel.') }
  }
} catch (error) { console.error(clean(error instanceof Error ? error.message : 'Deployment failed.')); process.exitCode = 1 }
