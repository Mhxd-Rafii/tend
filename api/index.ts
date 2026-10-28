import { createApp } from '../server/app'
import { getConfig } from '../server/config'
import { getDatabase } from '../server/db'
let application: ReturnType<typeof createApp> | undefined
export default {
  fetch(request: Request) {
    try { application ??= createApp(getDatabase(), getConfig()); return application.app.fetch(request) }
    catch { return Response.json({ error: { code: 'SERVER_NOT_CONFIGURED', message: 'The server is not configured. The owner must finish secure database setup.' } }, { status: 503, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } }) }
  },
}
