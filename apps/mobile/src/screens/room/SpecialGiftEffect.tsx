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
  /** Recipient's seat view — when set, the gift flies there after the center zoom. */
  targetRef?: View | null;
  onComplete: () => void;
}

export const SpecialGiftEffect = React.memo(SpecialGiftEffectInner);
function SpecialGiftEffectInner({
  visible, giftIcon, giftImage, senderName, giftName, qty = 1, targetRef, onComplete,
}: Props) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const zoomScale      = useRef(new Animated.Value(0.2)).current;
  const imgOpacity     = useRef(new Animated.Value(0)).current;
  const flyX           = useRef(new Animated.Value(0)).current;
  const flyY           = useRef(new Animated.Value(0)).current;
  const flyScale       = useRef(new Animated.Value(1)).current;
  const textOpacity    = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(20)).current;
  const qtyScale       = useRef(new Animated.Value(0)).current;
  const qtyOpacity     = useRef(new Animated.Value(0)).current;

  const giftRef       = useRef<View | null>(null);
  const flyDeltaRef   = useRef<{ dx: number; dy: number } | null>(null);
  const animRunId     = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Measure the recipient seat relative to the gift image so the fly-out phase
  // knows its destination. Translate transforms haven't been applied yet, so the
  // measured centers are stable. If either measure fails, the fly phase is
  // skipped and the effect fades out in place.
  useEffect(() => {
    if (!visible || !targetRef) return;
    flyDeltaRef.current = null;
    const raf = requestAnimationFrame(() => {
      (giftRef.current as View | null)?.measureInWindow?.(
        (gx: number, gy: number, gw: number, gh: number) => {
          (targetRef as View).measureInWindow?.(
            (tx: number, ty: number, tw: number, th: number) => {
              flyDeltaRef.current = {
                dx: tx + tw / 2 - (gx + gw / 2),
                dy: ty + th / 2 - (gy + gh / 2),
              };
            },
          );
        },
      );
    });
    return () => cancelAnimationFrame(raf);
  }, [visible, targetRef]);

  useEffect(() => {
    if (!visible) return;
    const runId = ++animRunId.current;

    overlayOpacity.setValue(0);
    zoomScale.setValue(0.2);
    imgOpacity.setValue(0);
    flyX.setValue(0);
    flyY.setValue(0);
    flyScale.setValue(1);
    textOpacity.setValue(0);
    textTranslateY.setValue(20);
    qtyScale.setValue(0);
    qtyOpacity.setValue(0);

    const finish = ({ finished }: { finished: boolean }) => {
      if (finished && animRunId.current === runId) onCompleteRef.current();
    };

    // Phase 1: zoom in at the center, then hold while the sender text shows.
    Animated.sequence([
      Animated.parallel([
        Animated.timing(overlayOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(imgOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(zoomScale, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.delay(450),
          Animated.parallel([
            Animated.timing(textOpacity,    { toValue: 1, duration: 350, useNativeDriver: true }),
            Animated.timing(textTranslateY, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          ]),
        ]),
        qty > 1
          ? Animated.sequence([
              Animated.delay(500),
              Animated.parallel([
                Animated.spring(qtyScale,   { toValue: 1, friction: 3, tension: 220, useNativeDriver: true }),
                Animated.timing(qtyOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
              ]),
            ])
          : Animated.delay(0),
      ]),
      Animated.delay(1100),
    ]).start(({ finished }) => {
      if (!finished || animRunId.current !== runId) return;
      const delta = flyDeltaRef.current;
      if (delta) {
        // Phase 2a: shrink and fly to the recipient's seat.
        Animated.parallel([
          Animated.timing(flyX,     { toValue: delta.dx, duration: 550, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(flyY,     { toValue: delta.dy, duration: 550, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(flyScale, { toValue: 0.12, duration: 550, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(overlayOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.timing(textOpacity,    { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(qtyOpacity,     { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(400),
            Animated.timing(imgOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
          ]),
        ]).start(finish);
      } else {
        // Phase 2b: no seated recipient — fade out in place.
        Animated.parallel([
          Animated.timing(overlayOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
          Animated.timing(imgOpacity,     { toValue: 0, duration: 450, useNativeDriver: true }),
          Animated.timing(textOpacity,    { toValue: 0, duration: 400, useNativeDriver: true }),
          Animated.timing(qtyOpacity,     { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start(finish);
      }
    });
  }, [visible, qty, overlayOpacity, zoomScale, imgOpacity, flyX, flyY, flyScale, textOpacity, textTranslateY, qtyScale, qtyOpacity]);

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
        ref={giftRef}
        style={[
          styles.giftContainer,
          {
            opacity: imgOpacity,
            transform: [
              { translateX: flyX },
              { translateY: flyY },
              { scale: zoomScale },
              { scale: flyScale },
            ],
          },
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
