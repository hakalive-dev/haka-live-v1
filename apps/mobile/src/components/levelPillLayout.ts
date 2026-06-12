/**
 * Shared layout for Rich/Charm level pill badges.
 * Calibrated against badge assets (108×42) — gem left, level label right.
 */
const PILL = { width: 108, height: 42 } as const;

const ICON = {
  left: 5,
  /** Gem render box — nearly full pill height; label size is independent. */
  heightRatio: 1,
} as const;

/** Gem tier art (big/tier_*.png) — 96×84 canvas with trailing transparent padding. */
const GEM_ASSET = {
  width: 96,
  height: 84,
  /** Opaque content edge (~80px on mid tiers) — avoids gap before the label. */
  contentRightRatio: 80 / 96,
} as const;

const LABEL = {
  /** ~16px at default size 26; ~10px at compact size 16. */
  fontSizeRatio: 0.62,
  lineHeightRatio: 1.0,
  /** ~3px at reference pill height 42 — small gap after the gem. */
  paddingLeft: 6,
} as const;

export type LevelPillLayout = {
  pillWidth: number;
  pillHeight: number;
  icon: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  label: {
    left: number;
    width: number;
    fontSize: number;
    lineHeight: number;
  };
};

export function scaleLevelPillLayout(pillHeight: number): LevelPillLayout {
  const s = pillHeight / PILL.height;
  const fontSize = pillHeight * LABEL.fontSizeRatio;
  const iconHeight = pillHeight * ICON.heightRatio;
  const iconWidth = iconHeight * (GEM_ASSET.width / GEM_ASSET.height);
  const iconLeft = ICON.left * s;
  const labelLeft =
    iconLeft +
    iconWidth * GEM_ASSET.contentRightRatio +
    LABEL.paddingLeft * s;

  return {
    pillWidth: PILL.width * s,
    pillHeight,
    icon: {
      left: iconLeft,
      width: iconWidth,
      height: iconHeight,
      top: (pillHeight - iconHeight) / 2,
    },
    label: {
      left: labelLeft,
      width: PILL.width * s - labelLeft,
      fontSize,
      lineHeight: pillHeight * LABEL.lineHeightRatio,
    },
  };
}
