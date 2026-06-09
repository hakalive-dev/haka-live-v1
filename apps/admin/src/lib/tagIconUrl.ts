import { apiOrigin } from '@/lib/apiUrl'

/** Resolve a tag icon path from the API for use in admin <img src>. */
export function resolveTagIconUrl(iconUrl: string | undefined | null): string {
  const trimmed = iconUrl?.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  const base = apiOrigin();
  return `${base}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}
