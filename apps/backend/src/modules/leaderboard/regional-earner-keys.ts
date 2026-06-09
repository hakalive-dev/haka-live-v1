/**
 * Pure helpers for regional earner Redis keys — safe to import from Prisma seed
 * scripts without loading app config (env, redis client, prisma).
 */

export type Period = 'daily' | 'weekly' | 'monthly';

/** Redis sorted sets: regional (city-sharded) earner beans, same periods as global earners. */
export function regionalEarnerKeyPrefix(period: Period): string {
  return `leaderboard:region:earners:${period}:`;
}

export function regionalEarnerRedisKey(period: Period, regionKey: string): string {
  return `${regionalEarnerKeyPrefix(period)}${regionKey}`;
}

function slugPart(s: string, maxLen: number): string {
  const stripped = s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, maxLen);
  return stripped || 'xx';
}

/** ISO 3166-1 alpha-2 → display name for regional earner badges. */
const ISO_COUNTRY_DISPLAY: Record<string, string> = {
  AE: 'UAE',
  AU: 'Australia',
  BD: 'Bangladesh',
  BR: 'Brazil',
  CA: 'Canada',
  CI: "Côte d'Ivoire",
  CM: 'Cameroon',
  CN: 'China',
  DE: 'Germany',
  EG: 'Egypt',
  ES: 'Spain',
  ET: 'Ethiopia',
  FR: 'France',
  GB: 'United Kingdom',
  GH: 'Ghana',
  ID: 'Indonesia',
  IN: 'India',
  IT: 'Italy',
  JP: 'Japan',
  KE: 'Kenya',
  KR: 'South Korea',
  KW: 'Kuwait',
  MY: 'Malaysia',
  MX: 'Mexico',
  NG: 'Nigeria',
  NL: 'Netherlands',
  PH: 'Philippines',
  PK: 'Pakistan',
  QA: 'Qatar',
  RU: 'Russia',
  RW: 'Rwanda',
  SA: 'Saudi Arabia',
  SG: 'Singapore',
  SN: 'Senegal',
  TR: 'Turkey',
  TZ: 'Tanzania',
  UG: 'Uganda',
  US: 'United States',
  ZA: 'South Africa',
};

/** Host `country` field → badge label (e.g. `GB` → `United Kingdom`). */
export function displayCountryName(country: string): string {
  const raw = country.trim();
  if (!raw) return '';
  if (raw.length === 2) return ISO_COUNTRY_DISPLAY[raw.toUpperCase()] ?? raw.toUpperCase();
  return raw;
}

/** Stable Redis shard id from country + city (ASCII). Returns null if city is blank. */
export function buildRegionKeyFromUserCountryCity(country: string, city: string): string | null {
  const cityTrim = city.trim();
  if (!cityTrim) return null;
  const countrySlug = slugPart((country || '').trim() || 'unknown', 24);
  const citySlug = slugPart(cityTrim, 40);
  return `${countrySlug}_${citySlug}`;
}
