import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SW, height: SH } = Dimensions.get('window');

const GIFT_IMAGES: Record<string, ReturnType<typeof require>> = {
  'gifts/86.png': require('../../../assets/gifts/86.png'),
  'gifts/93.png': require('../../../assets/gifts/93.png'),
  'gifts/116.png': require('../../../assets/gifts/116.png'),
  'gifts/121.png': require('../../../assets/gifts/121.png'),
};

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

const SIZE = 56;

import type { DmGiftPopItem } from '@components/gifts/GiftEffectOverlay';

export type { DmGiftPopItem } from '@components/gifts/GiftEffectOverlay';

interface Props {
  item: DmGiftPopItem;
  onComplete: () => void;
}

/** Bottom-to-center zoom for basic DM gifts (sender-only). */
export function DmGiftPopEffect({ item, onComplete }: Props) {
  const phase = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    phase.setValue(0);
    opacity.setValue(0);

    Animated.sequence([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(phase, {
        toValue: 1,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.delay(200),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) onCompleteRef.current();
    });
  }, [item.id, phase, opacity]);

  const halfSize = SIZE / 2;
  const startX = SW / 2 - halfSize;
  const startY = SH - 100;
  const centerX = SW / 2 - halfSize;
  const centerY = SH / 2 - halfSize;

  const translateX = phase.interpolate({
    inputRange: [0, 1],
    outputRange: [startX, centerX],
  });
  const translateY = phase.interpolate({
    inputRange: [0, 1],
    outputRange: [startY, centerY],
  });
  const scale = phase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.4, 1.5, 1.5],
  });

  const resolvedImage = item.giftImage ? GIFT_IMAGES[item.giftImage] : null;
  const remoteImage =
    !resolvedImage &&
    typeof item.giftImage === 'string' &&
    isHttpUrl(item.giftImage)
      ? item.giftImage
      : null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          opacity,
          transform: [{ translateX }, { translateY }, { scale }],
        },
      ]}
    >
      {resolvedImage ? (
        <Image source={resolvedImage} style={styles.giftImage} resizeMode="contain" />
      ) : remoteImage ? (
        <Image source={{ uri: remoteImage }} style={styles.giftImage} resizeMode="contain" />
      ) : item.giftIcon ? (
        <Text style={styles.emojiIcon}>{item.giftIcon}</Text>
      ) : (
        <View style={styles.iconFallback}>
          <Ionicons name="gift" size={36} color="#FFD84D" />
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: SIZE,
    height: SIZE,
    zIndex: 10000,
    elevation: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftImage: {
    width: SIZE,
    height: SIZE,
  },
  emojiIcon: {
    fontSize: 48,
    lineHeight: 56,
    textAlign: 'center',
  },
  iconFallback: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
