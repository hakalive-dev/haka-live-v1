import React from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, Spacing } from '@/theme';

const BANNER_SOURCE = require('../../../assets/lucky-gifts/lucky_gift_tab_banner.png');

interface Props {
  onPressRanking: () => void;
}

export function LuckyGiftBanner({ onPressRanking }: Props) {
  return (
    <View style={styles.wrap}>
      <Image source={BANNER_SOURCE} style={styles.bannerImage} contentFit="fill" />
      <Pressable
        style={styles.rankingHit}
        onPress={onPressRanking}
        accessibilityRole="button"
        accessibilityLabel="Lucky gift ranking"
      >
        <View style={styles.rankingBtn}>
          <Text style={styles.rankingText}>Ranking</Text>
        </View>
      </Pressable>
    </View>
  );
}

/** Native asset dimensions — keeps the banner proportional on all screen widths. */
const BANNER_ASPECT = 1024 / 166;

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    marginBottom: Spacing.xs,
    aspectRatio: BANNER_ASPECT,
    overflow: 'hidden',
    position: 'relative',
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  rankingHit: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: '18%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankingBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  rankingText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
