import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useCachedSvga } from '@/utils/svgaCache';
import type { SvgaPlayerRef } from '@jayming/svga-player-rn';

const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let SvgaPlayer: React.ComponentType<{
  source: string;
  style?: object;
  autoPlay?: boolean;
  loops?: number;
  clearsAfterStop?: boolean;
  align?: 'top' | 'bottom' | 'center';
  onLoaded?: () => void;
  ref?: React.Ref<SvgaPlayerRef>;
}> | null = null;

if (!IS_EXPO_GO) {
  try {
    SvgaPlayer = require('@jayming/svga-player-rn').SvgaPlayer;
  } catch {
    SvgaPlayer = null;
  }
}

interface Props {
  source: string;
  /** True while this seat's user is speaking — fades the wave in and plays it. */
  active: boolean;
  seatSize: number;
  wrapWidth?: number;
  cellHeight?: number;
}

// Fade timings: in slightly faster than out so the wave appears promptly when
// speech starts but lingers briefly on pauses instead of blinking off.
const FADE_IN_MS = 160;
const FADE_OUT_MS = 240;

/**
 * Looped mic voice-wave animation around a seat while the user is speaking.
 * Uses the equipped store item's remote SVGA URL.
 *
 * The player stays mounted for as long as the user has a wave equipped — it is
 * never unmounted on each speech burst. Instead `active` fades the wave in/out
 * and starts/stops the underlying SVGA animation via the player ref, so the
 * asset is decoded once (no reload flash, no frame-0 restart on every word) and
 * no CPU is spent rendering while the seat is silent.
 */
export const MicVoiceWaveEffect = React.memo(MicVoiceWaveEffectInner);

function MicVoiceWaveEffectInner({ source, active, seatSize, wrapWidth, cellHeight }: Props) {
  const { uri, ready } = useCachedSvga(source);
  const playerRef = useRef<SvgaPlayerRef>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  // The native player only accepts start/stop once its source has loaded.
  const [loaded, setLoaded] = useState(false);

  const W = wrapWidth ?? seatSize + 12;
  const H = cellHeight ?? seatSize;
  const size = Math.round(seatSize * 1.35);
  const left = (W - size) / 2;
  const top = (H - size) / 2;

  // Reset loaded state if the equipped wave source changes.
  useEffect(() => {
    setLoaded(false);
  }, [uri]);

  useEffect(() => {
    if (!loaded) return;
    if (active) {
      playerRef.current?.startAnimation();
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_IN_MS,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_OUT_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        // Only halt the render loop once fully faded so the user never sees it cut.
        if (finished) playerRef.current?.stopAnimation();
      });
    }
  }, [active, loaded, opacity]);

  if (!SvgaPlayer || !ready || !uri) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { width: size, height: size, left, top, opacity }]}
    >
      <SvgaPlayer
        ref={playerRef}
        source={uri}
        autoPlay={false}
        loops={0}
        clearsAfterStop={false}
        align="center"
        onLoaded={() => setLoaded(true)}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 15,
    elevation: 15,
  },
});
