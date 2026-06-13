import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Easing, Image, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/theme';

const { width: SW } = Dimensions.get('window');

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
  visible, giftImage, targetRef, onComplete,
}: Props) {
  const zoomScale = useRef(new Animated.Value(0.2)).current;
  const imgOpacity = useRef(new Animated.Value(0)).current;
  const flyX = useRef(new Animated.Value(0)).current;
  const flyY = useRef(new Animated.Value(0)).current;
  const flyScale = useRef(new Animated.Value(1)).current;

  const giftRef = useRef<View | null>(null);
  const flyDeltaRef = useRef<{ dx: number; dy: number } | null>(null);
  const animRunId = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

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

    zoomScale.setValue(0.2);
    imgOpacity.setValue(0);
    flyX.setValue(0);
    flyY.setValue(0);
    flyScale.setValue(1);

    const finish = ({ finished }: { finished: boolean }) => {
      if (finished && animRunId.current === runId) onCompleteRef.current();
    };

    Animated.sequence([
      Animated.parallel([
        Animated.timing(imgOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(zoomScale, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.back(1.4)),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(500),
    ]).start(({ finished }) => {
      if (!finished || animRunId.current !== runId) return;
      const delta = flyDeltaRef.current;
      if (delta) {
        Animated.parallel([
          Animated.timing(flyX, { toValue: delta.dx, duration: 550, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(flyY, { toValue: delta.dy, duration: 550, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.timing(flyScale, { toValue: 0.12, duration: 550, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
          Animated.sequence([
            Animated.delay(400),
            Animated.timing(imgOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
          ]),
        ]).start(finish);
      } else {
        Animated.timing(imgOpacity, { toValue: 0, duration: 450, useNativeDriver: true }).start(finish);
      }
    });
  }, [visible, zoomScale, imgOpacity, flyX, flyY, flyScale]);

  if (!visible) return null;

  const resolvedImage = giftImage ? GIFT_IMAGES[giftImage] : null;
  const remoteImage =
    !resolvedImage && typeof giftImage === 'string' && isHttpUrl(giftImage)
      ? giftImage
      : null;

  return (
    <View style={styles.container} pointerEvents="none">
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
  giftContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftImage: {
    width:  SW * 0.68,
    height: SW * 0.68,
  },
  giftIconFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
