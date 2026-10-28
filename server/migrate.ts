import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import type { Client } from '@libsql/client'
export async function migrate(client: Client, directory = fileURLToPath(new URL('../migrations/', import.meta.url))) {
  const existing = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'tend_%'")
  if (existing.rows.length && !existing.rows.some(row => row.name === 'tend_schema_migrations')) throw new Error('Existing Tend tables have no migration ledger. No changes were applied; review this database before initializing it.')
  await client.execute('CREATE TABLE IF NOT EXISTS tend_schema_migrations (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)')
  const applied: string[] = []
  for (const filename of (await readdir(directory)).filter(n => /^\d+_[a-z0-9_]+\.sql$/.test(n)).sort()) {
    const source = (await readFile(join(directory, filename), 'utf8')).replaceAll('\r\n', '\n'), checksum = createHash('sha256').update(source).digest('hex')
    const tx = await client.transaction('write')
    try {
      const previous = await tx.execute({ sql: 'SELECT checksum FROM tend_schema_migrations WHERE version=?', args: [filename] })
      if (previous.rows.length) { if (previous.rows[0].checksum !== checksum) throw new Error(`Applied migration ${filename} has changed; restore it and add a new migration.`); await tx.commit(); continue }
      await tx.executeMultiple(source)
      await tx.execute({ sql: 'INSERT INTO tend_schema_migrations(version,checksum,applied_at) VALUES(?,?,?)', args: [filename, checksum, new Date().toISOString()] })
      await tx.commit(); applied.push(filename)
    } catch (error) { await tx.rollback().catch(() => {}); throw error } finally { tx.close() }
  }
  return applied
}
