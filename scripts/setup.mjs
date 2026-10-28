import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { parse } from 'dotenv'

const path = '.env.local'
const existing = existsSync(path) ? parse(readFileSync(path)) : {}
const values = { ...existing, TURSO_DATABASE_URL: process.env.TURSO_DATABASE_URL || existing.TURSO_DATABASE_URL || 'libsql://habittracker-mhxd-rafii.aws-ap-south-1.turso.io', SESSION_SECRET: process.env.SESSION_SECRET || existing.SESSION_SECRET || randomBytes(48).toString('base64url'), APP_URL: existing.APP_URL || 'http://localhost:5173' }
async function hidden(prompt) {
  if (!process.stdin.isTTY) throw new Error('Open a terminal and run npm run setup to enter your rotated token privately. No token will be displayed.')
  process.stdout.write(prompt)
  process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8')
  return new Promise((resolve, reject) => {
    let answer = ''
    const handler = data => {
      for (const c of data) {
        if (c === '\u0003') { finish(); reject(new Error('Setup cancelled')); return }
        if (c === '\r' || c === '\n') { finish(); resolve(answer.trim()); return }
        if (c === '\u007f' || c === '\b') answer = answer.slice(0, -1)
        else if (c >= ' ') answer += c
      }
    }
    const finish = () => { process.stdin.off('data', handler); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n') }
    process.stdin.on('data', handler)
  })
}
try {
  values.TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN || existing.TURSO_AUTH_TOKEN || ''
  if (!values.TURSO_AUTH_TOKEN || process.argv.includes('--rotate-token')) values.TURSO_AUTH_TOKEN = await hidden('New Turso database token (hidden; do not paste it into chat): ')
  if (!values.TURSO_AUTH_TOKEN) throw new Error('A valid Turso token is required. No local data fallback is used.')
  if (values.SESSION_SECRET.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.')
  const content = '# Server-only credentials. Never commit this file.\n' + Object.entries(values).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n'
  writeFileSync(path, content, { mode: 0o600 }); try { chmodSync(path, 0o600) } catch { /* Windows uses the user profile ACL. */ }
  console.log('Configured server credentials in ignored .env.local. Values were not printed. Run npm run launch for checks, migration, preview, and production deployment.')
} catch (error) { console.error(error instanceof Error ? error.message : 'Setup failed'); process.exitCode = 1 }
