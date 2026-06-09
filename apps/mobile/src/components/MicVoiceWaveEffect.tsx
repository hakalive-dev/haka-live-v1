import React from 'react';
import { StyleSheet, View } from 'react-native';
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
  seatSize: number;
  wrapWidth?: number;
  cellHeight?: number;
}

/**
 * Looped mic voice-wave animation around a seat while the user is speaking.
 * Uses the equipped store item's remote SVGA URL.
 */
export const MicVoiceWaveEffect = React.memo(MicVoiceWaveEffectInner);

function MicVoiceWaveEffectInner({ source, seatSize, wrapWidth, cellHeight }: Props) {
  const { uri, ready } = useCachedSvga(source);
  const W = wrapWidth ?? seatSize + 12;
  const H = cellHeight ?? seatSize;
  const size = Math.round(seatSize * 1.35);
  const left = (W - size) / 2;
  const top = (H - size) / 2;

  if (!SvgaPlayer || !ready || !uri) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { width: size, height: size, left, top }]}
    >
      <SvgaPlayer
        source={uri}
        autoPlay
        loops={0}
        clearsAfterStop={false}
        align="center"
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 15,
    elevation: 15,
  },
});
