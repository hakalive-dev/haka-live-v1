import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Asset } from 'expo-asset';
import { Image } from 'expo-image';
import { SvgaPlayer, type SvgaPlayerRef } from '@jayming/svga-player-rn';
import { SVGA_EMOJIS_BY_KEY } from './svgaEmojis';

interface Props {
  emojiKey: string;
  seatSize: number;
  /** Row item width (e.g. cellExtent + 12). Defaults to seatSize + 12. */
  wrapWidth?: number;
  /** Vertical extent of the seat graphic for centering the effect. Defaults to seatSize. */
  cellHeight?: number;
  animationKey: number;
  onComplete: () => void;
}

const MAX_DURATION_MS = 4000;

/**
 * Per-seat animation layer. Rendered as an absolutely-positioned sibling
 * to the seat avatar (NOT inside seatCircle) so the effect can spill past the
 * circle. A 4s fallback clears the effect even if
 * the native player never fires onFinished.
 *
 * Supports both SVGA (native player) and animated WebP (expo-image).
 */
export const SeatSvgaEffect = React.memo(SeatSvgaEffectInner);
function SeatSvgaEffectInner({
  emojiKey,
  seatSize,
  wrapWidth,
  cellHeight,
  animationKey,
  onComplete,
}: Props) {
  const entry = SVGA_EMOJIS_BY_KEY[emojiKey];
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const playerRef = useRef<SvgaPlayerRef>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!entry) { onCompleteRef.current(); return; }

    // WebP: expo-image plays animated WebP directly from the require() number.
    // No URI resolution needed.
    if (entry.type === 'webp') return;

    // SVGA: resolve a file:// URI for the native player.
    let cancelled = false;
    setSourceUri(null);
    (async () => {
      try {
        const [asset] = await Asset.loadAsync(entry.asset);
        let localUri = asset.localUri ?? null;
        if (!localUri) {
          await asset.downloadAsync();
          localUri = asset.localUri ?? null;
        }
        if (!localUri) throw new Error('localUri unavailable');
        const uri = localUri.startsWith('file://') ? localUri : `file://${localUri}`;
        if (!cancelled) setSourceUri(uri);
      } catch (e) {
        console.warn('[SeatSVGA] asset resolve failed:', e);
        if (!cancelled) onCompleteRef.current();
      }
    })();
    return () => { cancelled = true; };
  }, [emojiKey, animationKey, entry]);

  useEffect(() => {
    const t = setTimeout(() => onCompleteRef.current(), MAX_DURATION_MS);
    return () => clearTimeout(t);
  }, [animationKey]);

  if (!entry) return null;

  // Responsive sizing: scale the emoji effect from the actual seat dimension
  // so it tracks the live seat/avatar size and overlaps it. Each asset keeps
  // its own feel via an optional `seatScale`; otherwise we fall back to a
  // tier-based default (SVIP effects are larger/more theatrical).
  const defaultScale = entry.tier === 'svip' ? 1.4 : 1.2;
  const rawScale = entry.seatScale ?? defaultScale;
  // Clamp so it stays at least the seat size (never smaller than the icon it
  // overlays) and never grows past a sane overlap envelope.
  const MIN_SCALE = 1.0;
  const MAX_SCALE = 1.7;
  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, rawScale));
  const size = Math.round(seatSize * scale);
  const W = wrapWidth ?? seatSize + 12;
  const H = cellHeight ?? seatSize;
  const left = (W - size) / 2;
  const top = (H - size) / 2;

  if (entry.type === 'webp') {
    return (
      <View
        pointerEvents="none"
        style={[styles.wrap, { width: size, height: size, left, top }]}
      >
        <Image
          key={animationKey}
          source={entry.asset}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          autoplay
          cachePolicy="memory-disk"
        />
      </View>
    );
  }

  if (!sourceUri) return null;

  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { width: size, height: size, left, top }]}
    >
      <SvgaPlayer
        ref={playerRef}
        source={sourceUri}
        autoPlay
        loops={1}
        clearsAfterStop
        align="center"
        style={StyleSheet.absoluteFill}
        onFinished={() => onCompleteRef.current()}
        onError={(e) => {
          console.warn('[SeatSVGA] native error:', e?.error);
          onCompleteRef.current();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    zIndex: 20,
    elevation: 20,
  },
});
