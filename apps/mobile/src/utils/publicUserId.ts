/** Fields used to resolve the single public-facing ID shown in UI. */
export type PublicIdFields = {
  activeSpecialId?: string | null;
  hakaId?: string | null;
  username?: string | null;
};

/** Order: equipped special ID → display hakaId → username fallback. */
export function resolvePublicUserId(fields: PublicIdFields): string | null {
  const special = fields.activeSpecialId?.trim();
  if (special) return special;
  const haka = fields.hakaId?.trim();
  if (haka) return haka;
  const username = fields.username?.trim();
  if (username) return username;
  return null;
}

/** Remove a leading "ID:" label so CopyableId does not render "ID: ID: …". */
export function stripIdLabel(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const stripped = trimmed.replace(/^id:\s*/i, '').trim();
  return stripped || null;
}

export function normalizeIdForCompare(value: string | null | undefined): string {
  const stripped = stripIdLabel(value) ?? value?.trim() ?? '';
  return stripped.toLowerCase();
}

export function idsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const na = normalizeIdForCompare(a);
  const nb = normalizeIdForCompare(b);
  if (!na || !nb) return false;
  return na === nb;
}
