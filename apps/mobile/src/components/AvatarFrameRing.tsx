import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { StoreItemMedia } from './StoreItemMedia';

type Props = {
  /** Avatar (face) diameter in px — sized to the frame's transparent hole. */
  avatarSize: number;
  /** Outer frame canvas diameter in px (the full decorative box). */
  frameSize: number;
  frameSource: string;
  /** Optional store ring layered between avatar and frame. */
  ringSource?: string | null;
  ringSize?: number;
  replayOnFocus?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * Equipped frame as a border ring around the avatar. The avatar renders in the
 * frame's transparent center hole and the decorative art sits on top in the band
 * around it — so the face is fully visible (nothing in front of it) and the ring
 * lies beside the avatar's border (nothing clipped behind it). The avatar is
 * sized to each frame's hole via {@link frameHoleRatio} so the ring never spills
 * onto the face.
 */
export function AvatarFrameRing({
  avatarSize,
  frameSize,
  frameSource,
  ringSource,
  ringSize,
  replayOnFocus = false,
  style,
  children,
}: Props) {
  return (
    <View style={[styles.root, { width: frameSize, height: frameSize }, style]}>
      <View
        style={[
          styles.avatarHole,
          {
            width: avatarSize,
            height: avatarSize,
            borderRadius: avatarSize / 2,
          },
        ]}
      >
        {children}
      </View>
      {ringSource && ringSize ? (
        <View pointerEvents="none" style={styles.frameLayer}>
          <StoreItemMedia
            source={ringSource}
            size={ringSize}
            replayOnFocus={replayOnFocus}
          />
        </View>
      ) : null}
      <View pointerEvents="none" style={styles.frameLayer}>
        <StoreItemMedia
          source={frameSource}
          size={frameSize}
          replayOnFocus={replayOnFocus}
        />
      </View>
    </View>
  );
}

// Fraction of each frame canvas taken up by the transparent avatar hole, measured
// from the art (see assets/store/frames). The avatar is sized to this hole so the
// decorative ring lands exactly around the avatar's border.
const FRAME_HOLE_RATIOS: Record<string, number> = {
  '1': 0.61,
  '2': 0.54,
  '36': 0.76,
  '67': 0.68,
  '68': 0.67,
};
const DEFAULT_FRAME_HOLE_RATIO = 0.66;

/** Transparent-hole-to-canvas ratio for a frame source (default for unknown art). */
export function frameHoleRatio(source: string | null | undefined): number {
  if (!source) return DEFAULT_FRAME_HOLE_RATIO;
  const match = source.match(/frames\/([^./]+)\.svga/);
  if (match && FRAME_HOLE_RATIOS[match[1]] != null) {
    return FRAME_HOLE_RATIOS[match[1]];
  }
  return DEFAULT_FRAME_HOLE_RATIO;
}

/** Avatar (hole) diameter that fits inside a frame canvas of `frameSize`. */
export function frameAvatarSizeFromHole(
  frameSize: number,
  source: string | null | undefined,
): number {
  return Math.round(frameSize * frameHoleRatio(source));
}

/** Ring thickness (px per side) from frame scale relative to avatar diameter. */
export function frameRingWidthFromScale(avatarSize: number, frameScale: number): number {
  return Math.max(2, Math.round((avatarSize * (frameScale - 1)) / 2));
}

/** Outer frame canvas size for layout (avatar + ring band). */
export function frameOuterSizeFromScale(avatarSize: number, frameScale: number): number {
  const ring = frameRingWidthFromScale(avatarSize, frameScale);
  return avatarSize + ring * 2;
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHole: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Frame canvas fills the outer box and sits above the avatar; its transparent
  // center keeps the face visible while the border art rests on the avatar edge.
  frameLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
