import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';

type Props = {
  size: number;
  active: boolean;
  color?: string;
  inset?: number;
};

// Number of concentric ripples and how far each expands at its peak.
const RIPPLE_COUNT = 3;
const RIPPLE_DURATION = 1500;
const MAX_SCALE = 1.7;

export function SpeakingSeatGlow({
  size,
  active,
  color = '#FFFFFF',
  inset = 0,
}: Props) {
  // One driver per ripple, staggered so the waves emanate continuously.
  const progress = useMemo(
    () => Array.from({ length: RIPPLE_COUNT }, () => new Animated.Value(0)),
    [],
  );
  // Steady inner glow that sits on the avatar edge while speaking.
  const coreOpacity = useRef(new Animated.Value(0)).current;
  const loopsRef = useRef<Animated.CompositeAnimation[]>([]);
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const stopAll = () => {
      loopsRef.current.forEach((l) => l.stop());
      loopsRef.current = [];
      timeoutsRef.current.forEach((t) => clearTimeout(t));
      timeoutsRef.current = [];
    };

    stopAll();

    if (!active) {
      Animated.timing(coreOpacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }).start();
      progress.forEach((p) => p.setValue(0));
      return;
    }

    Animated.timing(coreOpacity, {
      toValue: 0.6,
      duration: 200,
      useNativeDriver: true,
    }).start();

    const stagger = RIPPLE_DURATION / RIPPLE_COUNT;
    progress.forEach((p, i) => {
      const loop = Animated.loop(
        Animated.timing(p, {
          toValue: 1,
          duration: RIPPLE_DURATION,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      );
      loopsRef.current.push(loop);
      // Phase-shift each ripple so they fan out one after another.
      timeoutsRef.current.push(setTimeout(() => loop.start(), i * stagger));
    });

    return stopAll;
  }, [active, coreOpacity, progress]);

  const ringSize = size + 4;
  const offset = inset - 2;

  return (
    <>
      {/* Expanding shockwave ripples */}
      {progress.map((p, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            styles.ripple,
            {
              top: offset,
              left: offset,
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              borderColor: color,
              shadowColor: color,
              opacity: p.interpolate({
                inputRange: [0, 0.15, 1],
                outputRange: [0, 0.7, 0],
              }),
              transform: [
                {
                  scale: p.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, MAX_SCALE],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
      {/* Steady core glow on the avatar edge */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.core,
          {
            top: offset,
            left: offset,
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderColor: color,
            shadowColor: color,
            opacity: coreOpacity,
          },
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  ripple: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 6,
  },
  core: {
    position: 'absolute',
    borderWidth: 2,
    backgroundColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 10,
  },
});
