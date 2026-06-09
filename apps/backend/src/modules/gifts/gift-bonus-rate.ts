import { isGiftBonusProgramActive } from './gift-bonus-program';

/** Effective gift-bonus rate (0–1) from singleton, tiers, and optional agency override. */
export function resolveGiftBonusRateFromSetting(params: {
  globallyEnabled: boolean;
  agencyEnabled: boolean;
  fallbackBonusRate: number;
  tierRowCount: number;
  tierBonusRate: number | null | undefined;
  overrideRate: number | null;
  overrideActive: boolean;
}): number {
  if (!isGiftBonusProgramActive(params.globallyEnabled, params.agencyEnabled)) {
    return 0;
  }
  if (params.overrideActive && params.overrideRate != null) {
    return params.overrideRate;
  }
  if (params.tierRowCount === 0) {
    return params.fallbackBonusRate;
  }
  return params.tierBonusRate ?? 0;
}
