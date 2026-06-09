/** Global + per-agency gates for the gift-bonus program (payouts, tasks, rankings). */
export function isGiftBonusProgramActive(
  globalEnabled: boolean,
  agencyEnabled: boolean,
): boolean {
  return globalEnabled && agencyEnabled;
}
