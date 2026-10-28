import { betterAuth } from 'better-auth/minimal'
import { drizzleAdapter } from '@better-auth/drizzle-adapter'
import { drizzle } from 'drizzle-orm/libsql'
import type { Client } from '@libsql/client'
import type { ServerConfig } from './config.js'
import * as schema from './auth-schema.js'
export function createAuth(client: Client, config: ServerConfig) {
  return betterAuth({
    appName: 'Tend', baseURL: config.appURL, basePath: '/api/auth', secret: config.sessionSecret, trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(drizzle(client, { schema }), { provider: 'sqlite', schema, transaction: true }),
    emailAndPassword: { enabled: true, minPasswordLength: 12, maxPasswordLength: 128, revokeSessionsOnPasswordReset: true,
      ...(config.emailEnabled ? { sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
        const response = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from: config.emailFrom, to: user.email, subject: 'Reset your Tend password', text: `Reset your Tend password using this link: ${url}\n\nIf you did not request this, ignore this email.` }) })
        if (!response.ok) throw new Error('Password reset email delivery failed')
      } } : {}),
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24, freshAge: 60 * 60, cookieCache: { enabled: false } },
    user: { deleteUser: { enabled: true } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60, customRules: { '/sign-in/email': { window: 60, max: 5 }, '/sign-up/email': { window: 3600, max: 5 }, '/request-password-reset': { window: 600, max: 3 }, '/reset-password': { window: 600, max: 5 } } },
    advanced: { useSecureCookies: config.production, defaultCookieAttributes: { httpOnly: true, secure: config.production, sameSite: 'lax', path: '/' }, database: { generateId: 'uuid' }, ipAddress: { ipAddressHeaders: ['x-vercel-forwarded-for', 'x-real-ip'] } },
    logger: { disabled: true },
  })
}
export type Auth = ReturnType<typeof createAuth>
