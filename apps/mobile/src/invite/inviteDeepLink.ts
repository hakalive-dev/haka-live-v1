/**
 * Parse inviter id from universal links, custom schemes, or raw query strings.
 * Public Haka IDs are 9 digits; legacy random codes are A–Z0–9 (4–16 chars).
 */

/** Normalize a bare invite code / Haka ID; returns null if it's not a valid code. */
export function normalizeInviteCode(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const c = raw.trim().replace(/\s/g, "");
  if (/^[0-9]{9}$/.test(c)) return c;
  const upper = c.toUpperCase();
  return /^[A-Z0-9]{4,16}$/.test(upper) ? upper : null;
}

export function extractInviteCodeFromUrl(
  urlString: string | null | undefined,
): string | null {
  if (!urlString) return null;

  try {
    const u = new URL(urlString);
    const fromParam = u.searchParams.get("code");
    if (fromParam) {
      const n = normalizeInviteCode(fromParam);
      if (n) return n;
    }
  } catch {
    // e.g. exp+hakalive://invite?code=ABCD1234
  }

  const m = urlString.match(/(?:[?&])code=([^&]+)/i);
  if (m?.[1]) {
    try {
      return normalizeInviteCode(decodeURIComponent(m[1]));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Extract an invite code from arbitrary text (clipboard / install referrer):
 * accepts a full invite URL, a `code=…` fragment, or a bare Haka ID / code.
 */
export function extractInviteCodeFromText(
  text: string | null | undefined,
): string | null {
  return extractInviteCodeFromUrl(text) ?? normalizeInviteCode(text);
}
