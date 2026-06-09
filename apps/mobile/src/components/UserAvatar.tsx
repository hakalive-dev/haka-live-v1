import React from 'react';
import { ImageSourcePropType, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Colors } from '@/theme';
import type { UserEquippedCosmetics } from '@/types';
import { StoreItemMedia } from './StoreItemMedia';
import {
  AvatarFrameRing,
  frameAvatarSizeFromHole,
  frameOuterSizeFromScale,
} from './AvatarFrameRing';

export interface AvatarUser extends UserEquippedCosmetics {
  displayName: string;
  avatar: string | null | undefined;
}

interface UserAvatarProps {
  user: AvatarUser;
  size?: number;
  /** Bundled image (e.g. app logo). Takes precedence over `user.avatar`. */
  localAvatar?: ImageSourcePropType;
  /** Disable equipped frame/ring overlays even if the user has them. */
  hideFrame?: boolean;
  /** Disable the default avatar border ring. */
  hideBorder?: boolean;
  /** Restart equipped frame/ring SVGA when the hosting screen regains focus. */
  replayFrameOnFocus?: boolean;
  /** Frame canvas scale relative to avatar diameter (default {@link AVATAR_FRAME_SCALE}). */
  frameScale?: number;
  style?: ViewStyle;
}

// Frame SVGAs are designed as a ring around the avatar — the frame canvas is
// ~1.35× the avatar circle, centered. Tweak here if assets change.
export const AVATAR_FRAME_SCALE = 1.38;
/** Store ring items sit tighter around the face than full frames. */
export const AVATAR_RING_SCALE = 1.18;

export function UserAvatar({
  user,
  size = 48,
  localAvatar,
  hideFrame,
  hideBorder,
  replayFrameOnFocus = false,
  frameScale = AVATAR_FRAME_SCALE,
  style,
}: UserAvatarProps) {
  const frameSource = !hideFrame && !localAvatar ? user.equippedFrame?.image ?? null : null;
  const ringSource = !hideFrame && !localAvatar ? user.equippedRing?.image ?? null : null;
  const frameSize = frameSource ? frameOuterSizeFromScale(size, frameScale) : size;
  const ringSize = ringSource ? Math.round(size * AVATAR_RING_SCALE) : size;
  const outerSize = frameSource ? frameSize : ringSource ? ringSize : size;
  const avatarSize = frameSource
    ? frameAvatarSizeFromHole(frameSize, frameSource)
    : size;
  const radius = avatarSize / 2;
  const borderWidth = hideBorder ? 0 : 2;
  const borderColor = hideBorder ? 'transparent' : Colors.border;

  const innerAvatar = localAvatar ? (
    <View
      style={{
        width: avatarSize,
        height: avatarSize,
        borderRadius: radius,
        borderWidth,
        borderColor,
        overflow: 'hidden',
      }}
    >
      <Image
        source={localAvatar}
        style={{
          width: avatarSize,
          height: avatarSize,
        }}
        contentFit="fill"
        cachePolicy="memory-disk"
      />
    </View>
  ) : user.avatar ? (
    <Image
      source={{ uri: user.avatar }}
      style={{
        width: avatarSize,
        height: avatarSize,
        borderRadius: radius,
        borderWidth,
        borderColor,
      }}
      contentFit="cover"
      cachePolicy="memory-disk"
    />
  ) : (
    <View
      style={[
        styles.fallback,
        { width: avatarSize, height: avatarSize, borderRadius: radius },
        hideBorder ? styles.fallbackNoBorder : null,
      ]}
    >
      <Text style={[styles.initial, { fontSize: avatarSize * 0.38 }]}>
        {(user.displayName[0] ?? '?').toUpperCase()}
      </Text>
    </View>
  );

  if (frameSource) {
    return (
      <AvatarFrameRing
        avatarSize={avatarSize}
        frameSize={frameSize}
        frameSource={frameSource}
        ringSource={ringSource}
        ringSize={ringSource ? ringSize : undefined}
        replayOnFocus={replayFrameOnFocus}
        style={[{ width: frameSize, height: frameSize }, style]}
      >
        {innerAvatar}
      </AvatarFrameRing>
    );
  }

  if (ringSource) {
    return (
      <View
        style={[
          styles.ringWrap,
          { width: outerSize, height: outerSize },
          style,
        ]}
      >
        <View
          style={[
            styles.ringAvatarHole,
            {
              width: avatarSize,
              height: avatarSize,
              borderRadius: radius,
            },
          ]}
        >
          {innerAvatar}
        </View>
        <View pointerEvents="none" style={styles.ringLayer}>
          <StoreItemMedia
            source={ringSource}
            size={ringSize}
            replayOnFocus={replayFrameOnFocus}
          />
        </View>
      </View>
    );
  }

  return <View style={[{ width: size, height: size }, style]}>{innerAvatar}</View>;
}

const styles = StyleSheet.create({
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringAvatarHole: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: {
    backgroundColor: Colors.surfaceHighlight,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackNoBorder: {
    borderWidth: 0,
    borderColor: 'transparent',
  },
  initial: {
    color: Colors.textSecondary,
    fontWeight: '600',
  },
});
