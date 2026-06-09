import type { ImageSourcePropType } from 'react-native';

/**
 * Rich level-card badge art, in 5-level tiers (0, 5, … 100). Same scheme as
 * richLevelBg: a user's rich level maps to the highest tier at or below it
 * (floored to the nearest 5, capped at 100).
 *
 * Source files: assets/rich_levels/big/tier_<tier>.png
 */
const RICH_LEVEL_ICON: Record<number, ImageSourcePropType> = {
  0: require('../../../assets/rich_levels/big/tier_0.png'),
  5: require('../../../assets/rich_levels/big/tier_5.png'),
  10: require('../../../assets/rich_levels/big/tier_10.png'),
  15: require('../../../assets/rich_levels/big/tier_15.png'),
  20: require('../../../assets/rich_levels/big/tier_20.png'),
  25: require('../../../assets/rich_levels/big/tier_25.png'),
  30: require('../../../assets/rich_levels/big/tier_30.png'),
  35: require('../../../assets/rich_levels/big/tier_35.png'),
  40: require('../../../assets/rich_levels/big/tier_40.png'),
  45: require('../../../assets/rich_levels/big/tier_45.png'),
  50: require('../../../assets/rich_levels/big/tier_50.png'),
  55: require('../../../assets/rich_levels/big/tier_55.png'),
  60: require('../../../assets/rich_levels/big/tier_60.png'),
  65: require('../../../assets/rich_levels/big/tier_65.png'),
  70: require('../../../assets/rich_levels/big/tier_70.png'),
  75: require('../../../assets/rich_levels/big/tier_75.png'),
  80: require('../../../assets/rich_levels/big/tier_80.png'),
  85: require('../../../assets/rich_levels/big/tier_85.png'),
  90: require('../../../assets/rich_levels/big/tier_90.png'),
  95: require('../../../assets/rich_levels/big/tier_95.png'),
  100: require('../../../assets/rich_levels/big/tier_100.png'),
};

export function richTier(level: number): number {
  return Math.min(100, Math.max(0, Math.floor((level || 0) / 5) * 5));
}

export function richLevelIcon(level: number): ImageSourcePropType {
  const tier = richTier(level);
  return RICH_LEVEL_ICON[tier] ?? RICH_LEVEL_ICON[0];
}
