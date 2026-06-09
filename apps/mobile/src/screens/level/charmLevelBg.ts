import type { ImageSourcePropType } from 'react-native';

/**
 * Charm level-card background art, in 5-level tiers (0, 5, … 100). The source
 * set only ships a background every 5 levels, so a user's charm level maps to
 * the highest tier at or below it (floored to the nearest 5, capped at 100) —
 * e.g. Lv 99 → bg_95, Lv 100 → bg_100, Lv 1–4 → bg_0.
 *
 * Source files: assets/charm_level_bg/lwchat_big_ic_charm_bg_<tier>.{png,webp}
 * (Rich has no background set yet — Charm only for now.)
 */
const CHARM_LEVEL_BG: Record<number, ImageSourcePropType> = {
  0: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_0.webp'),
  5: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_5.png'),
  10: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_10.png'),
  15: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_15.png'),
  20: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_20.png'),
  25: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_25.png'),
  30: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_30.png'),
  35: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_35.png'),
  40: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_40.png'),
  45: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_45.webp'),
  50: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_50.webp'),
  55: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_55.webp'),
  60: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_60.webp'),
  65: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_65.webp'),
  70: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_70.webp'),
  75: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_75.webp'),
  80: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_80.webp'),
  85: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_85.webp'),
  90: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_90.webp'),
  95: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_95.webp'),
  100: require('../../../assets/charm_level_bg/lwchat_big_ic_charm_bg_100.webp'),
};

export function charmLevelBg(level: number): ImageSourcePropType {
  const tier = Math.min(100, Math.max(0, Math.floor((level || 0) / 5) * 5));
  return CHARM_LEVEL_BG[tier] ?? CHARM_LEVEL_BG[0];
}
