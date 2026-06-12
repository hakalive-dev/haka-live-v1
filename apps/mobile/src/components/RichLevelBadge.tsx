import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { scaleLevelPillLayout } from '@components/levelPillLayout';
import { richLevelBadgeBg } from '@screens/level/richLevelBadgeBg';
import { richLevelIcon } from '@screens/level/richLevelIcon';

interface Props {
  level: number;
  label?: number;
  /** Pill height; tier rows use 26, hero card uses 36. */
  size?: number;
}

/** Rich level pill — bg container with gem (left) + level (right of gem). */
export function RichLevelBadge({ level, label, size = 26 }: Props) {
  const displayLabel = String(label ?? level);
  const layout = useMemo(() => scaleLevelPillLayout(size), [size]);

  return (
    <View
      style={[
        styles.pill,
        { width: layout.pillWidth, height: layout.pillHeight },
      ]}
    >
      <Image
        source={richLevelBadgeBg(level)}
        style={StyleSheet.absoluteFill}
        contentFit="fill"
      />

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
          allowFontScaling={false}
          style={[
            styles.label,
            {
              fontSize: layout.label.fontSize,
              lineHeight: layout.label.lineHeight,
            },
          ]}
          numberOfLines={1}
        >
          {displayLabel}
        </Text>
      </View>

      <Image
        source={richLevelIcon(level)}
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
    alignItems: 'flex-start',
  },
  label: {
    fontFamily: 'Inter',
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'left',
    fontVariant: ['tabular-nums'],
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
  },
  icon: {
    position: 'absolute',
  },
});
