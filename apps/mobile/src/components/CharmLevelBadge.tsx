import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { charmLevelBadgeBg } from '@screens/level/charmLevelBadgeBg';
import { charmLevelIcon } from '@screens/level/charmLevelIcon';

/**
 * Pill background is the container (Figma image 322: 178×69).
 * Gem + level label live inside the pill — icon left, label centered on pill.
 */
const PILL = { width: 178, height: 69 } as const;

/** Gem inset from the left inside the pill; height is a fraction of pill height. */
const ICON = {
  left: 10,
  heightRatio: 0.86,
} as const;

/** Label typography scaled from pill height (Figma: 64px on ~77px line box). */
const LABEL = {
  fontSizeRatio: 64 / PILL.height,
  lineHeightRatio: 77 / PILL.height,
} as const;

interface Props {
  level: number;
  /** Shown as the white label inside the pill (defaults to `level`). */
  label?: number;
  /** Pill height; tier rows use 26, hero card uses 36. */
  size?: number;
}

function scaleLayout(pillHeight: number) {
  const s = pillHeight / PILL.height;
  const iconHeight = pillHeight * ICON.heightRatio;
  return {
    pillWidth: PILL.width * s,
    pillHeight,
    icon: {
      left: ICON.left * s,
      width: iconHeight,
      height: iconHeight,
      top: (pillHeight - iconHeight) / 2,
    },
    label: {
      left: ICON.left * s + iconHeight,
      width: PILL.width * s - (ICON.left * s + iconHeight),
      fontSize: pillHeight * LABEL.fontSizeRatio,
      lineHeight: pillHeight * LABEL.lineHeightRatio,
    },
  };
}

/** Charm level pill — bg container with gem (left) + level (center). */
export function CharmLevelBadge({ level, label, size = 26 }: Props) {
  const displayLabel = String(label ?? level);
  const layout = useMemo(() => scaleLayout(size), [size]);

  return (
    <View
      style={[
        styles.pill,
        { width: layout.pillWidth, height: layout.pillHeight },
      ]}
    >
      <Image
        source={charmLevelBadgeBg(level)}
        style={StyleSheet.absoluteFill}
        contentFit="fill"
      />

      {/* Level number — centered in the pill area right of the gem */}
      <View
        style={[
          styles.labelLayer,
          {
            left: layout.label.left,
            width: layout.label.width,
          },
        ]}
        pointerEvents="none"
      >
        <Text
          style={[
            styles.label,
            {
              fontSize: layout.label.fontSize,
              lineHeight: layout.label.lineHeight,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.5}
        >
          {displayLabel}
        </Text>
      </View>

      {/* Gem — left inside the pill, vertically centered, never overflows */}
      <Image
        source={charmLevelIcon(level)}
        style={[
          styles.icon,
          {
            left: layout.icon.left,
            top: layout.icon.top,
            width: layout.icon.width,
            height: layout.icon.height,
          },
        ]}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    position: 'relative',
    overflow: 'hidden',
  },
  labelLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontFamily: 'Inter',
    fontWeight: '400',
    color: '#FFFFFF',
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  icon: {
    position: 'absolute',
  },
});
