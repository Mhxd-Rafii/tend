import { createApp } from '../server/app.js'
import { getConfig } from '../server/config.js'
import { getDatabase } from '../server/db.js'
let application: ReturnType<typeof createApp> | undefined
export default {
  fetch(request: Request) {
    try { application ??= createApp(getDatabase(), getConfig()); return application.app.fetch(request) }
    catch { return Response.json({ error: { code: 'SERVER_NOT_CONFIGURED', message: 'The server is not configured. The owner must finish secure database setup.' } }, { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }) }
  },
}
