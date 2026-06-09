import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import TopBadgeSvg from '../../assets/top_badge.svg';
import { Colors } from '@/theme';

/** Design size from `top_badge.svg` viewBox (0 0 90 29). */
const BADGE_W = 90;
const BADGE_H = 29;
/** Crown + art occupy ~x 0–26; label area is the rest of the pill. */
const CROWN_RIGHT = 26;

export interface RegionalRankBadgeProps {
  /** Country display name (e.g. India, United Kingdom). */
  label: string;
  /** 1-based daily regional earner rank for the city shard. */
  rank: number;
  style?: StyleProp<ViewStyle>;
}

/** e.g. `India No 1` */
export function formatRegionalRankBadgeText(label: string, rank: number): string {
  const place = label.trim();
  return place.length > 0 ? `${place} No ${rank}` : `No ${rank}`;
}

/**
 * City-shard daily earner rank on live room cards — `top_badge.svg` with
 * `{Country} No {rank}` beside the crown inside the pill.
 */
export function RegionalRankBadge({ label, rank, style }: RegionalRankBadgeProps) {
  const badgeText = formatRegionalRankBadgeText(label, rank);

  return (
    <View style={[styles.badgeBox, style]}>
      <TopBadgeSvg width={BADGE_W} height={BADGE_H} />
      <View style={styles.labelSlot} pointerEvents="none">
        <Text
          style={styles.badgeText}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
          maxFontSizeMultiplier={1.2}
        >
          {badgeText}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badgeBox: {
    width: BADGE_W,
    height: BADGE_H,
    position: 'relative',
  },
  labelSlot: {
    position: 'absolute',
    left: CROWN_RIGHT,
    right: 4,
    top: 4,
    bottom: 5,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingLeft: 1,
  },
  badgeText: {
    color: Colors.textPrimary,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
    textAlign: 'left',
    width: '100%',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 1.5,
  },
});
