/**
 * Parse inviter id from universal links, custom schemes, or raw query strings.
 * Public Haka IDs are 9 digits; legacy random codes are A–Z0–9 (4–16 chars).
 */
export function extractInviteCodeFromUrl(
  urlString: string | null | undefined,
): string | null {
  if (!urlString) return null;
  const normalize = (raw: string) => {
    const c = raw.trim().replace(/\s/g, "");
    if (/^[0-9]{9}$/.test(c)) return c;
    const upper = c.toUpperCase();
    return /^[A-Z0-9]{4,16}$/.test(upper) ? upper : null;
  };

  try {
    const u = new URL(urlString);
    const fromParam = u.searchParams.get("code");
    if (fromParam) {
      const n = normalize(fromParam);
      if (n) return n;
    }
  } catch {
    // e.g. exp+hakalive://invite?code=ABCD1234
  }

  const m = urlString.match(/(?:[?&])code=([^&]+)/i);
  if (m?.[1]) {
    try {
      return normalize(decodeURIComponent(m[1]));
    } catch {
      return null;
    }
  }
  return null;
}
