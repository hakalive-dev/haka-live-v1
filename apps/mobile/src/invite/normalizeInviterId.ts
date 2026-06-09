/** Public Haka IDs are 9-digit numeric strings starting at 500000001. */
const PUBLIC_HAKA_ID_RE = /^[0-9]{9}$/;

export function normalizeInviterId(raw: string): string {
  return raw.trim().replace(/\s/g, "");
}

/**
 * Client-side check before submit; backend still validates via resolveUserId.
 */
export function isValidPublicHakaId(value: string): boolean {
  const n = normalizeInviterId(value);
  if (!PUBLIC_HAKA_ID_RE.test(n)) return false;
  const num = Number(n);
  return num >= 500_000_001 && num <= 999_999_999;
}
