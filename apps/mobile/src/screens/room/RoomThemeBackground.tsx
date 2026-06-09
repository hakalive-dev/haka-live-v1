import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { SvgaPlayer } from '@jayming/svga-player-rn';
import { useCachedSvga } from '@/utils/svgaCache';
import type { ThemePayload } from '@/types';

interface Props {
  theme: ThemePayload | null;
}

export function RoomThemeBackground({ theme }: Props) {
  const { uri: cachedSvgaUri, ready: svgaReady } = useCachedSvga(theme?.svgaUrl ?? null);

  if (!theme) {
    return (
      <LinearGradient
        colors={['#2D1B69', '#1A0E3A', '#0D0620']}
        style={StyleSheet.absoluteFill}
      />
    );
  }

  if (theme.svgaUrl) {
    const gradient = (
      <LinearGradient
        colors={['#2D1B69', '#1A0E3A', '#0D0620']}
        style={StyleSheet.absoluteFill}
      />
    );
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {gradient}
        {svgaReady && cachedSvgaUri && (
          <SvgaPlayer
            source={cachedSvgaUri}
            autoPlay
            loops={0}
            style={StyleSheet.absoluteFill}
          />
        )}
      </View>
    );
  }

  if (theme.backgroundImageUrl) {
    return (
      <View style={StyleSheet.absoluteFill}>
        <Image
          source={{ uri: theme.backgroundImageUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        <LinearGradient
          colors={[theme.gradientFrom + '66', theme.gradientTo + 'CC'] as [string, string]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      </View>
    );
  }

  return (
    <LinearGradient
      colors={[theme.gradientFrom, theme.gradientTo]}
      style={StyleSheet.absoluteFill}
    />
  );
}
