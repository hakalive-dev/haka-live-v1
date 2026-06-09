const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Full Haka ID or UUID → lookup-parent-agent only (may auto-provision agency). */
export function isExactParentLookupQuery(q: string): boolean {
  const t = q.trim();
  if (!t || t.includes(' ')) return false;
  if (UUID_REGEX.test(t)) return true;
  if (/^\d{6,15}$/.test(t)) return true;
  if (/^HK[A-Z0-9]+$/i.test(t)) return true;
  return false;
}
