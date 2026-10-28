import { config } from 'dotenv'
config({ path: '.env.local', quiet: true }); config({ quiet: true })
const { getDatabase } = await import('../server/db')
try {
  const client = getDatabase()
  try { const result = await client.execute("SELECT name FROM sqlite_master WHERE type='table'"); const foreignKeys = await client.execute('PRAGMA foreign_keys'); console.log(JSON.stringify({ connected: true, foreignKeysEnabled: Number(foreignKeys.rows[0]?.foreign_keys) === 1, tables: result.rows.map(row => row.name) })) } finally { client.close() }
} catch { console.error('Turso connection failed. Credentials and raw driver details were withheld.'); process.exitCode = 1 }
