import { z } from 'zod'
export interface ServerConfig { databaseURL: string; databaseToken?: string; sessionSecret: string; appURL: string; trustedOrigins: string[]; production: boolean; emailEnabled: boolean; resendKey?: string; emailFrom?: string }
export class ConfigurationError extends Error { constructor(public missing: string[]) { super(`Missing or invalid server configuration: ${missing.join(', ')}`); this.name = 'ConfigurationError' } }
export function getConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const missing: string[] = []
  const databaseURL = env.TURSO_DATABASE_URL || ''
  if (!/^libsql:\/\/[^\s/]+\.turso\.io(?:\/)?$/.test(databaseURL)) missing.push('TURSO_DATABASE_URL')
  if (!env.TURSO_AUTH_TOKEN?.trim()) missing.push('TURSO_AUTH_TOKEN')
  if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32 || /^(change|replace|your[-_])/i.test(env.SESSION_SECRET)) missing.push('SESSION_SECRET')
  const deployment = env.VERCEL_URL ? `https://${env.VERCEL_URL}` : ''
  const productionURL = env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : ''
  const production = env.NODE_ENV === 'production' || env.VERCEL === '1'
  const appURL = (env.VERCEL_ENV === 'preview' ? deployment : env.APP_URL || productionURL || deployment || 'http://localhost:5173').replace(/\/$/, '')
  if (!z.url().safeParse(appURL).success || production && !appURL.startsWith('https://')) missing.push('APP_URL (HTTPS in production)')
  if (missing.length) throw new ConfigurationError(missing)
  const trustedOrigins = [...new Set([appURL, deployment, productionURL, ...(env.APP_TRUSTED_ORIGINS || '').split(','), ...(!production ? ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'] : [])].filter(Boolean).map(s => s.trim()))]
  if (trustedOrigins.some(s => !z.url().safeParse(s).success || new URL(s).origin !== s)) throw new ConfigurationError(['APP_TRUSTED_ORIGINS'])
  return { databaseURL, databaseToken: env.TURSO_AUTH_TOKEN, sessionSecret: env.SESSION_SECRET!, appURL, trustedOrigins, production, emailEnabled: !!(env.RESEND_API_KEY && env.EMAIL_FROM), resendKey: env.RESEND_API_KEY, emailFrom: env.EMAIL_FROM }
}
