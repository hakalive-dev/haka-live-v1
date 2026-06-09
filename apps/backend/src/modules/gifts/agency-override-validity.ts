/**
 * Manual agency overrides apply only when the gift (or "as of") timestamp
 * falls within the optional validUntil window (inclusive of validUntil).
 */

export function isCommissionOverrideActiveAt(params: {
  rateOverride: unknown;
  validUntil: Date | null;
  at: Date;
}): boolean {
  if (params.rateOverride == null) return false;
  if (params.validUntil == null) return true;
  return params.at.getTime() <= params.validUntil.getTime();
}

export function isGiftBonusOverrideActiveAt(params: {
  rateOverride: unknown;
  validUntil: Date | null;
  at: Date;
}): boolean {
  if (params.rateOverride == null) return false;
  if (params.validUntil == null) return true;
  return params.at.getTime() <= params.validUntil.getTime();
}
