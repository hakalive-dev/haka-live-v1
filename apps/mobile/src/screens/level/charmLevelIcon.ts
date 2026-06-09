import type { ImageSourcePropType } from 'react-native';

/**
 * Charm level-card badge art, in 5-level tiers (0, 5, … 100). Same scheme as
 * charmLevelBg: a user's charm level maps to the highest tier at or below it
 * (floored to the nearest 5, capped at 100).
 *
 * Source files: assets/charm_levels/big/tier_<tier>.png
 */
const CHARM_LEVEL_ICON: Record<number, ImageSourcePropType> = {
  0: require('../../../assets/charm_levels/big/tier_0.png'),
  5: require('../../../assets/charm_levels/big/tier_5.png'),
  10: require('../../../assets/charm_levels/big/tier_10.png'),
  15: require('../../../assets/charm_levels/big/tier_15.png'),
  20: require('../../../assets/charm_levels/big/tier_20.png'),
  25: require('../../../assets/charm_levels/big/tier_25.png'),
  30: require('../../../assets/charm_levels/big/tier_30.png'),
  35: require('../../../assets/charm_levels/big/tier_35.png'),
  40: require('../../../assets/charm_levels/big/tier_40.png'),
  45: require('../../../assets/charm_levels/big/tier_45.png'),
  50: require('../../../assets/charm_levels/big/tier_50.png'),
  55: require('../../../assets/charm_levels/big/tier_55.png'),
  60: require('../../../assets/charm_levels/big/tier_60.png'),
  65: require('../../../assets/charm_levels/big/tier_65.png'),
  70: require('../../../assets/charm_levels/big/tier_70.png'),
  75: require('../../../assets/charm_levels/big/tier_75.png'),
  80: require('../../../assets/charm_levels/big/tier_80.png'),
  85: require('../../../assets/charm_levels/big/tier_85.png'),
  90: require('../../../assets/charm_levels/big/tier_90.png'),
  95: require('../../../assets/charm_levels/big/tier_95.png'),
  100: require('../../../assets/charm_levels/big/tier_100.png'),
};

export function charmTier(level: number): number {
  return Math.min(100, Math.max(0, Math.floor((level || 0) / 5) * 5));
}

export function charmLevelIcon(level: number): ImageSourcePropType {
  const tier = charmTier(level);
  return CHARM_LEVEL_ICON[tier] ?? CHARM_LEVEL_ICON[0];
}
