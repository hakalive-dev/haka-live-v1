import React from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { RICH, CHARM } from '@screens/level/LevelScreen';
import { Spacing } from '@/theme';

type Props = {
  richLevel?: number | null;
  charmLevel?: number | null;
  compact?: boolean;
  hideLevels?: boolean;
};

function clampLevel(level: number, min: number, max: number) {
  return Math.min(Math.max(level, min), max);
}

export function UserLevelBadges({
  richLevel = 0,
  charmLevel = 0,
  compact = false,
  hideLevels = false,
}: Props) {
  if (hideLevels) return null;

  const rich = richLevel ?? 0;
  const charm = charmLevel ?? 0;
  const iconSize = compact ? 18 : 22;

  return (
    <View style={styles.row}>
      {rich > 0 ? (
        <View style={styles.badge}>
          <Image
            source={RICH[clampLevel(rich, 1, 100)] ?? RICH[1]}
            style={{ width: iconSize, height: iconSize }}
            contentFit="contain"
          />
        </View>
      ) : null}
      {charm > 0 ? (
        <View style={styles.badge}>
          <Image
            source={CHARM[clampLevel(charm, 0, 100)] ?? CHARM[0]}
            style={{ width: iconSize, height: iconSize }}
            contentFit="contain"
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: 2,
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
