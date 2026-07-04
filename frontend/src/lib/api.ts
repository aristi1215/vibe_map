const RAW_API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:3001'
// Strip any trailing slash so `${API_BASE}${path}` never produces a double slash.
const API_BASE = RAW_API_BASE.replace(/\/+$/, '')

type TokenGetter = () => Promise<string | null>

let getToken: TokenGetter = async () => null

/** Wired up once from the Clerk context at app mount */
export function setTokenGetter(fn: TokenGetter) {
  getToken = fn
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken()
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}
