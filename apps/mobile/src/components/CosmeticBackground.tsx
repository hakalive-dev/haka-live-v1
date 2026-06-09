import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { StoreItemMedia } from './StoreItemMedia';

interface Props {
  /** Primary fill asset — PNG bubble frame stretched to fit. */
  source: string | null | undefined;
  /** Optional animated SVGA layered on top of the fill asset. */
  animationSource?: string | null;
  /** Shown only while SVGA loads — avoids a blurry permanent PNG underlay. */
  fallbackSource?: string | null;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
  minHeight?: number;
  children: React.ReactNode;
}

/** Decorative store-item background (SVGA or image) behind arbitrary content. */
export function CosmeticBackground({
  source,
  animationSource = null,
  fallbackSource = null,
  style,
  contentStyle,
  minHeight = 36,
  children,
}: Props) {
  if (!source && !animationSource) {
    return <View style={style}>{children}</View>;
  }

  const hdMedia = {
    fillContainer: true as const,
    contentFit: 'fill' as const,
    highQuality: true as const,
  };

  return (
    <View style={[styles.wrap, { minHeight }, style]}>
      <View pointerEvents="none" style={styles.mediaLayer}>
        {source ? (
          <StoreItemMedia
            source={source}
            size={512}
            fallbackSource={fallbackSource ?? source}
            {...hdMedia}
          />
        ) : null}
        {animationSource ? (
          <StoreItemMedia
            source={animationSource}
            size={512}
            fallbackSource={fallbackSource}
            {...hdMedia}
          />
        ) : null}
      </View>
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    overflow: 'hidden',
  },
  mediaLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    position: 'relative',
  },
});
