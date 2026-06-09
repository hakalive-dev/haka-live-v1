import type { ImageSourcePropType } from 'react-native';

import { charmTier } from './charmLevelIcon';

/**
 * Charm badge pill background art, in 5-level tiers (0, 5, … 100).
 * Layered behind the tier gem icon in CharmLevelBadge.
 *
 * Source files: assets/charm_levels/badge/tier_<tier>.png
 */
const CHARM_LEVEL_BADGE_BG: Record<number, ImageSourcePropType> = {
  0: require('../../../assets/charm_levels/badge/tier_0.png'),
  5: require('../../../assets/charm_levels/badge/tier_5.png'),
  10: require('../../../assets/charm_levels/badge/tier_10.png'),
  15: require('../../../assets/charm_levels/badge/tier_15.png'),
  20: require('../../../assets/charm_levels/badge/tier_20.png'),
  25: require('../../../assets/charm_levels/badge/tier_25.png'),
  30: require('../../../assets/charm_levels/badge/tier_30.png'),
  35: require('../../../assets/charm_levels/badge/tier_35.png'),
  40: require('../../../assets/charm_levels/badge/tier_40.png'),
  45: require('../../../assets/charm_levels/badge/tier_45.png'),
  50: require('../../../assets/charm_levels/badge/tier_50.png'),
  55: require('../../../assets/charm_levels/badge/tier_55.png'),
  60: require('../../../assets/charm_levels/badge/tier_60.png'),
  65: require('../../../assets/charm_levels/badge/tier_65.png'),
  70: require('../../../assets/charm_levels/badge/tier_70.png'),
  75: require('../../../assets/charm_levels/badge/tier_75.png'),
  80: require('../../../assets/charm_levels/badge/tier_80.png'),
  85: require('../../../assets/charm_levels/badge/tier_85.png'),
  90: require('../../../assets/charm_levels/badge/tier_90.png'),
  95: require('../../../assets/charm_levels/badge/tier_95.png'),
  100: require('../../../assets/charm_levels/badge/tier_100.png'),
};

export function charmLevelBadgeBg(level: number): ImageSourcePropType {
  const tier = charmTier(level);
  return CHARM_LEVEL_BADGE_BG[tier] ?? CHARM_LEVEL_BADGE_BG[0];
}
