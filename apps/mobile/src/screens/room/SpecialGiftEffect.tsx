import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '@/theme';

const { width: SW, height: SH } = Dimensions.get('window');

const GIFT_IMAGES: Record<string, ReturnType<typeof require>> = {
  'gifts/86.png':  require('../../../assets/gifts/86.png'),
  'gifts/93.png':  require('../../../assets/gifts/93.png'),
  'gifts/116.png': require('../../../assets/gifts/116.png'),
  'gifts/121.png': require('../../../assets/gifts/121.png'),
};

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

interface Props {
  visible: boolean;
  animationType: string;
  giftIcon: string;
  giftImage: string | null;
  senderName: string;
  giftName: string;
  qty?: number;
  onComplete: () => void;
}

export const SpecialGiftEffect = React.memo(SpecialGiftEffectInner);
function SpecialGiftEffectInner({
  visible, giftIcon, giftImage, senderName, giftName, qty = 1, onComplete,
}: Props) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const imgTranslateY  = useRef(new Animated.Value(-SH * 0.7)).current;
  const imgOpacity     = useRef(new Animated.Value(0)).current;
  const textOpacity    = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(20)).current;
  const qtyScale       = useRef(new Animated.Value(0)).current;
  const qtyOpacity     = useRef(new Animated.Value(0)).current;

  const animRunId     = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!visible) return;
    const runId = ++animRunId.current;

    overlayOpacity.setValue(0);
    imgTranslateY.setValue(-SH * 0.7);
    imgOpacity.setValue(0);
    textOpacity.setValue(0);
    textTranslateY.setValue(20);
    qtyScale.setValue(0);
    qtyOpacity.setValue(0);

    Animated.sequence([
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(imgOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(imgTranslateY, {
          toValue: 0,
          duration: 900,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(700),
          Animated.parallel([
            Animated.timing(textOpacity,    { toValue: 1, duration: 350, useNativeDriver: true }),
            Animated.timing(textTranslateY, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
        ]),
        qty > 1
          ? Animated.sequence([
              Animated.delay(750),
              Animated.parallel([
                Animated.spring(qtyScale,   { toValue: 1, friction: 3, tension: 220, useNativeDriver: true }),
                Animated.timing(qtyOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
              ]),
            ])
          : Animated.delay(0),
      ]),
      Animated.delay(1200),
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        Animated.timing(imgOpacity,     { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.timing(textOpacity,    { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.timing(qtyOpacity,     { toValue: 0, duration: 400, useNativeDriver: true }),
      ]),
    ]).start(({ finished }) => {
      if (finished && animRunId.current === runId) onCompleteRef.current();
    });
  }, [visible, qty, overlayOpacity, imgTranslateY, imgOpacity, textOpacity, textTranslateY, qtyScale, qtyOpacity]);

  if (!visible) return null;

  const resolvedImage = giftImage ? GIFT_IMAGES[giftImage] : null;
  const remoteImage =
    !resolvedImage && typeof giftImage === 'string' && isHttpUrl(giftImage)
      ? giftImage
      : null;

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]} />

      <Animated.View
        style={[
          styles.giftContainer,
          { opacity: imgOpacity, transform: [{ translateY: imgTranslateY }] },
        ]}
      >
        {resolvedImage ? (
          <Image source={resolvedImage} style={styles.giftImage} resizeMode="contain" />
        ) : remoteImage ? (
          <Image source={{ uri: remoteImage }} style={styles.giftImage} resizeMode="contain" />
        ) : (
          <View style={[styles.giftImage, styles.giftIconFallback]}>
            <Ionicons name="gift" size={96} color={Colors.gold} />
          </View>
        )}
      </Animated.View>

      <Animated.View
        style={[
          styles.textContainer,
          { opacity: textOpacity, transform: [{ translateY: textTranslateY }] },
        ]}
      >
        <View style={styles.textBg}>
          <Text style={styles.senderName} numberOfLines={1}>{senderName}</Text>
          <Text style={styles.giftLabel}>sent {giftName}</Text>
        </View>
      </Animated.View>

      {qty > 1 ? (
        <Animated.View
          style={[
            styles.qtyBadge,
            { opacity: qtyOpacity, transform: [{ scale: qtyScale }] },
          ]}
        >
          <Text style={styles.qtyBadgeText}>×{qty}</Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  giftContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  giftImage: {
    width:  SW * 0.68,
    height: SW * 0.68,
  },
  giftIconFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textContainer: {
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  textBg: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 50,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    gap: 2,
  },
  senderName: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    letterSpacing: 0.5,
  },
  giftLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  qtyBadge: {
    position: 'absolute',
    top: SH * 0.22,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 999,
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  qtyBadgeText: {
    fontSize: 44,
    fontWeight: '900',
    color: Colors.textPrimary,
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
});
