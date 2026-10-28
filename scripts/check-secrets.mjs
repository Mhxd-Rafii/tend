import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { parse } from 'dotenv'
const environment = existsSync('.env.local') ? parse(readFileSync('.env.local')) : {}
const secrets = ['TURSO_AUTH_TOKEN', 'SESSION_SECRET', 'RESEND_API_KEY', 'VERCEL_TOKEN', 'GH_TOKEN', 'GITHUB_TOKEN'].map(name => [name, process.env[name] || environment[name]]).filter(([, value]) => value?.length > 16)
const skip = new Set(['node_modules', '.git', '.tools', '.vercel', 'artifacts', 'coverage'])
function files(path) { return readdirSync(path).flatMap(name => skip.has(name) || name.startsWith('.env') || name === '.deployment-state.json' ? [] : statSync(join(path, name)).isDirectory() ? files(join(path, name)) : [join(path, name)]) }
const trackedResult = spawnSync('git', ['ls-files'], { encoding: 'utf8', windowsHide: true })
const tracked = trackedResult.status === 0 ? trackedResult.stdout.trim().split(/\r?\n/).filter(Boolean) : []
if (tracked.some(path => /(^|\/)(\.env(?:\..*)?|\.vercel|\.tools)(?:\/|$)/.test(path) && path !== '.env.example')) throw new Error('A private configuration file is tracked by Git. Remove it from the index before publishing.')
for (const file of files('.').filter(path => /\.(tsx?|m?js|json|html|css|sql|md|webmanifest)$/.test(path))) {
  const content = readFileSync(file, 'utf8')
  for (const [name, value] of secrets) if (content.includes(value)) throw new Error(`${name} was found in ${relative('.', file)}. Publishing is blocked; the value was withheld.`)
}
console.log('Secret scan passed: no configured private values in source or frontend build, and no private configuration tracked by Git.')
