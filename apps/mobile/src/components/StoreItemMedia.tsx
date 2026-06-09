import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Asset } from 'expo-asset';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useCachedSvga } from '@/utils/svgaCache';
import type { SvgaPlayerRef } from '@jayming/svga-player-rn';

// In Expo Go the native RNSvgaPlayer module is not linked — attempting to
// render it raises "Unimplemented component: RNSvgaPlayer". Skip the player
// entirely when running in Expo Go and fall back to bundled PNG thumbnails.
const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

let SvgaPlayer: React.ComponentType<{
  source: string;
  style?: StyleProp<ViewStyle>;
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

const STORE_SVGA_ASSETS: Record<string, number> = {
  'store/frames/1.svga':  require('../../assets/store/frames/1.svga'),
  'store/frames/2.svga':  require('../../assets/store/frames/2.svga'),
  'store/frames/36.svga': require('../../assets/store/frames/36.svga'),
  'store/frames/67.svga': require('../../assets/store/frames/67.svga'),
  'store/frames/68.svga': require('../../assets/store/frames/68.svga'),
  'store/special-ids/SSS.svga': require('../../assets/store/special-ids/SSS.svga'),
  'store/special-ids/SS.svga':  require('../../assets/store/special-ids/SS.svga'),
  'store/special-ids/S.svga':   require('../../assets/store/special-ids/S.svga'),
  'store/special-ids/A.svga':   require('../../assets/store/special-ids/A.svga'),
  'store/special-ids/B.svga':   require('../../assets/store/special-ids/B.svga'),
};

// Fallback PNGs used in Expo Go (first-frame thumbnails extracted from SVGA).
const STORE_PNG_FALLBACKS: Record<string, number> = {
  'store/frames/1.svga':  require('../../assets/store/frames/1.png'),
  'store/frames/2.svga':  require('../../assets/store/frames/2.png'),
  'store/frames/36.svga': require('../../assets/store/frames/36.png'),
  'store/frames/67.svga': require('../../assets/store/frames/67.png'),
  'store/frames/68.svga': require('../../assets/store/frames/68.png'),
  'store/special-ids/SSS.svga': require('../../assets/store/special-ids/SSS.png'),
  'store/special-ids/SS.svga':  require('../../assets/store/special-ids/SS.png'),
  'store/special-ids/S.svga':   require('../../assets/store/special-ids/S.png'),
  'store/special-ids/A.svga':   require('../../assets/store/special-ids/A.png'),
  'store/special-ids/B.svga':   require('../../assets/store/special-ids/B.png'),
};

function isSvgaKey(src: string | null | undefined) {
  return typeof src === 'string' && src.endsWith('.svga') && src in STORE_SVGA_ASSETS;
}

/** Remote SVGA — uploaded to Supabase / storage, played directly via URL. */
function isRemoteSvga(src: string | null | undefined) {
  if (typeof src !== 'string' || !/^https?:/.test(src)) return false;
  try {
    return /\.svga$/i.test(new URL(src).pathname);
  } catch {
    return /\.svga(\?|$)/i.test(src);
  }
}

function isRemoteImage(src: string | null | undefined) {
  return typeof src === 'string' && /^(https?:|file:|data:)/.test(src);
}

interface Props {
  source: string | null | undefined;
  size: number;
  style?: ViewStyle;
  /** Restart SVGA when the hosting screen regains navigation focus. */
  replayOnFocus?: boolean;
  /** Stretch to fill the parent container instead of using a fixed square box. */
  fillContainer?: boolean;
  /** How static images fill their box — chat bubbles need `fill` to stretch 9-slice frames. */
  contentFit?: 'contain' | 'cover' | 'fill';
  /** PNG/JPG shown while remote SVGA downloads, or when SVGA playback is unavailable. */
  fallbackSource?: string | null;
  /** Render remote images at native resolution (no downscaling) for crisp chat-bubble frames. */
  highQuality?: boolean;
}

function SvgaPlayerLayer({
  uri,
  replayOnFocus,
}: {
  uri: string;
  replayOnFocus: boolean;
}) {
  const playerRef = useRef<SvgaPlayerRef>(null);
  const [playNonce, setPlayNonce] = useState(0);
  const skipNextFocusReplay = useRef(true);

  const restartPlayback = useCallback(() => {
    setPlayNonce((n) => n + 1);
    playerRef.current?.startAnimation();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!replayOnFocus) return;
      if (skipNextFocusReplay.current) {
        skipNextFocusReplay.current = false;
        return;
      }
      restartPlayback();
    }, [replayOnFocus, restartPlayback]),
  );

  if (!SvgaPlayer) return null;

  return (
    <SvgaPlayer
      key={`${uri}-${playNonce}`}
      ref={playerRef}
      source={uri}
      style={StyleSheet.absoluteFill}
      autoPlay
      loops={0}
      clearsAfterStop={false}
      align="center"
    />
  );
}

export function StoreItemMedia({
  source,
  size,
  style,
  replayOnFocus = false,
  fillContainer = false,
  contentFit = 'contain',
  fallbackSource = null,
  highQuality = false,
}: Props) {
  const [svgaUri, setSvgaUri] = useState<string | null>(null);

  const canUseSvga       = !!SvgaPlayer && isSvgaKey(source);
  const canUseRemoteSvga = !!SvgaPlayer && !IS_EXPO_GO && isRemoteSvga(source);
  const { uri: cachedRemoteSvga } = useCachedSvga(canUseRemoteSvga ? source! : null);
  const showFallback =
    !!fallbackSource &&
    isRemoteImage(fallbackSource) &&
    (!canUseRemoteSvga || !cachedRemoteSvga || IS_EXPO_GO || !SvgaPlayer);

  const hdImageProps = highQuality
    ? {
        allowDownscaling: false as const,
        priority: 'high' as const,
        cachePolicy: 'memory-disk' as const,
      }
    : {};

  useEffect(() => {
    if (!canUseSvga) { setSvgaUri(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const [asset] = await Asset.loadAsync(STORE_SVGA_ASSETS[source!]);
        let localUri = asset.localUri ?? null;
        if (!localUri) { await asset.downloadAsync(); localUri = asset.localUri ?? null; }
        if (!localUri) return;
        const uri = localUri.startsWith('file://') ? localUri : `file://${localUri}`;
        if (!cancelled) setSvgaUri(uri);
      } catch (e) {
        console.warn('[StoreItemMedia] svga load failed:', source, e);
      }
    })();
    return () => { cancelled = true; };
  }, [source, canUseSvga]);

  const box: ViewStyle = fillContainer
    ? StyleSheet.absoluteFillObject
    : { width: size, height: size };

  if (canUseSvga && SvgaPlayer) {
    return (
      <View style={[styles.wrap, box, style]}>
        {svgaUri ? (
          <SvgaPlayerLayer uri={svgaUri} replayOnFocus={replayOnFocus} />
        ) : null}
      </View>
    );
  }

  // Remote SVGA (uploaded via admin) — cache locally on first play, then feed
  // the local URI to the player so re-renders don't re-download the asset.
  if (canUseRemoteSvga && SvgaPlayer) {
    return (
      <View style={[styles.wrap, box, style]}>
        {showFallback ? (
          <Image
            source={{ uri: fallbackSource! }}
            style={StyleSheet.absoluteFill}
            contentFit={contentFit}
            {...hdImageProps}
          />
        ) : null}
        {cachedRemoteSvga ? (
          <SvgaPlayerLayer uri={cachedRemoteSvga} replayOnFocus={replayOnFocus} />
        ) : null}
      </View>
    );
  }

  // Expo Go fallback: prefer bundled PNG thumbnail when available.
  if (isSvgaKey(source) && STORE_PNG_FALLBACKS[source!]) {
    return (
      <View style={[styles.wrap, box, style]}>
        <Image source={STORE_PNG_FALLBACKS[source!]} style={StyleSheet.absoluteFill} contentFit="contain" />
      </View>
    );
  }

  if (isRemoteImage(source)) {
    return (
      <View style={[styles.wrap, box, style]}>
        <Image
          source={{ uri: source! }}
          style={StyleSheet.absoluteFill}
          contentFit={contentFit}
          {...hdImageProps}
        />
      </View>
    );
  }

  return (
    <View style={[styles.wrap, styles.placeholder, box, style]}>
      <Ionicons name="image-outline" size={Math.round(size * 0.3)} color="rgba(255,255,255,0.25)" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  placeholder: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
});
