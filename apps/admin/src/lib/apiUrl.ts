const PRODUCTION_API = 'https://api.hakalive.com'

function isLocalDevUrl(url: string): boolean {
  return /localhost|127\.0\.0\.1/i.test(url)
}

/** Backend origin for REST + Socket.io. Empty in dev (Vite proxies /api). */
export function apiOrigin(): string {
  const fromEnv = (import.meta.env.VITE_API_URL ?? '').trim()
  if (fromEnv) {
    const origin = fromEnv.replace(/\/$/, '')
    // .env.local can leak into production builds — never call localhost from a prod bundle.
    if (!import.meta.env.DEV && isLocalDevUrl(origin)) return PRODUCTION_API
    return origin
  }
  if (import.meta.env.DEV) return ''
  return PRODUCTION_API
}

export function adminApiBase(): string {
  return `${apiOrigin()}/api/v1/admin`
}
