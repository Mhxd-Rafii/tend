import { config } from 'dotenv'
import { serve } from '@hono/node-server'
config({ path: '.env.local', quiet: true }); config({ quiet: true })
const origin = process.argv.find(arg => arg.startsWith('--origin='))?.slice(9)
if (origin) process.env.APP_URL = origin
const { default: api } = await import('../api/index')
serve({ fetch: api.fetch, hostname: '127.0.0.1', port: 3001 }, () => console.log('Tend API listening at http://127.0.0.1:3001 (server credentials are never printed)'))
