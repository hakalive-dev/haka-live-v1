import React from 'react';
import { StyleSheet, View } from 'react-native';

import { CharmLevelBadge } from '@components/CharmLevelBadge';
import { RichLevelBadge } from '@components/RichLevelBadge';
import { Spacing } from '@/theme';

type Props = {
  richLevel?: number | null;
  charmLevel?: number | null;
  compact?: boolean;
  hideLevels?: boolean;
};

export function UserLevelBadges({
  richLevel = 0,
  charmLevel = 0,
  compact = false,
  hideLevels = false,
}: Props) {
  if (hideLevels) return null;

  const rich = richLevel ?? 0;
  const charm = charmLevel ?? 0;
  const pillSize = compact ? 16 : 20;

  return (
    <View style={styles.row}>
      {rich > 0 ? (
        <RichLevelBadge level={rich} size={pillSize} />
      ) : null}
      {charm > 0 ? (
        <CharmLevelBadge level={charm} size={pillSize} />
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
});
