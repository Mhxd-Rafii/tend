import { config } from 'dotenv'
config({ path: '.env.local', quiet: true }); config({ quiet: true })
const { getDatabase } = await import('../server/db.js')
const { migrate } = await import('../server/migrate.js')
try { const client = getDatabase(); const applied = await migrate(client); console.log(applied.length ? `Applied ${applied.length} migration(s): ${applied.join(', ')}` : 'Database is already up to date.'); client.close() }
catch (error) { console.error(error instanceof Error && error.name === 'ConfigurationError' ? error.message : 'Migration failed. Credentials and raw database responses were withheld. Check access and database schema.'); process.exitCode = 1 }
