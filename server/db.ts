import { createClient, type Client } from '@libsql/client'
import { getConfig } from './config'
let client: Client | undefined
export function getDatabase() { if (!client) { const config = getConfig(); client = createClient({ url: config.databaseURL, authToken: config.databaseToken }) } return client }
