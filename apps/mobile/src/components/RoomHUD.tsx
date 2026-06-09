import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, Radius } from '../theme';

type Props = {
  isLive: boolean;
  viewerCount: number;
  coinBalance?: number;
  beanBalance?: number;
};

export function RoomHUD({ isLive, viewerCount, coinBalance, beanBalance }: Props) {
  return (
    <View style={styles.row}>
      {isLive && (
        <View style={styles.liveBadge}>
          <Text style={styles.liveText}>LIVE</Text>
        </View>
      )}
      <View style={styles.pill}>
        <Ionicons name="eye" size={12} color={Colors.textInverse} />
        <Text style={styles.pillText}>{formatCount(viewerCount)}</Text>
      </View>
      {coinBalance !== undefined && (
        <View style={[styles.pill, styles.coinPill]}>
          <Ionicons name="ellipse" size={10} color={Colors.coin} />
          <Text style={styles.pillText}>{formatCount(coinBalance)}</Text>
        </View>
      )}
      {beanBalance !== undefined && (
        <View style={[styles.pill, styles.beanPill]}>
          <Ionicons name="leaf" size={12} color={Colors.bean} />
          <Text style={styles.pillText}>{formatCount(beanBalance)}</Text>
        </View>
      )}
    </View>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  liveBadge: {
    backgroundColor: Colors.live,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: Radius.xs,
  },
  liveText: {
    color: Colors.textInverse,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  coinPill: {
    backgroundColor: Colors.goldSubtle,
  },
  beanPill: {
    backgroundColor: Colors.beanSubtle,
  },
  pillText: {
    color: Colors.textInverse,
    fontSize: 11,
    fontWeight: '600',
  },
});
