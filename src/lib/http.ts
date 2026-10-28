let expectedUser: string | null = null
export function setExpectedUser(userId: string | null) { expectedUser = userId }
export class ApiError extends Error {
  status: number; code: string; records: string[]
  constructor(status: number, code: string, message: string, records: string[] = []) { super(message); this.status = status; this.code = code; this.records = records; this.name = 'ApiError' }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(expectedUser && /^\/api\/(workspace|changes|photos|auth\/(sign-out|change-password|delete-user|update-user|list-sessions|revoke-))/.test(path) ? { 'X-Tend-Account': expectedUser } : {}), ...options.headers } })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('tend-session-expired'))
    throw new ApiError(response.status, body?.error?.code ?? body?.code ?? 'REQUEST_FAILED', typeof body?.error === 'string' ? body.error : body?.error?.message ?? body?.message ?? 'The server could not complete this request.', body?.error?.records)
  }
  return body as T
}
