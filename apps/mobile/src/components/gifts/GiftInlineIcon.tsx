import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { Colors } from '@/theme';
import {
  resolveDmGiftBubbleSource,
  resolveGiftIconSource,
  type GiftIconSource,
} from '@/utils/resolveGiftIconSource';

type Props = {
  giftIcon: string;
  giftImage?: string | null;
  size?: number;
  /** Prefer PNG from giftImage when present (DM bubbles). Default: icon-first (room notices). */
  preferImage?: boolean;
};

export function GiftInlineIcon({
  giftIcon,
  giftImage,
  size = 28,
  preferImage = false,
}: Props) {
  const source = useMemo(
    () =>
      preferImage
        ? resolveDmGiftBubbleSource(giftIcon, giftImage)
        : resolveGiftIconSource(giftIcon, giftImage),
    [giftIcon, giftImage, preferImage],
  );

  return <GiftInlineIconVisual source={source} size={size} />;
}

function GiftInlineIconVisual({ source, size }: { source: GiftIconSource; size: number }) {
  const imgStyle = { width: size, height: size };
  const emojiStyle = { fontSize: Math.round(size * 0.78), lineHeight: size };

  if (source.kind === 'bundled') {
    return <Image source={source.value} style={imgStyle} contentFit="contain" />;
  }
  if (source.kind === 'remote') {
    return (
      <Image
        source={{ uri: source.value }}
        style={imgStyle}
        contentFit="contain"
        cachePolicy="disk"
      />
    );
  }
  if (source.kind === 'emoji') {
    return <Text style={emojiStyle}>{source.value}</Text>;
  }
  return (
    <View style={[styles.fallback, { width: size, height: size }]}>
      <Ionicons name="gift" size={Math.round(size * 0.72)} color={Colors.gold} />
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
