import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { Spacing } from '@/theme';
import {
  getTagAsset,
  resolveRemoteTagIconUrl,
  sortTagsForDisplay,
  TAG_BADGE_HEIGHT_MD,
  TAG_BADGE_HEIGHT_SM,
  tagBadgeRenderSize,
  type TagSummary,
} from './tagBadgeAssets';

export type { TagSummary } from './tagBadgeAssets';

export function TagBadges({
  tags,
  size = 'sm',
  style,
  leading,
  trailing,
}: {
  tags: TagSummary[];
  size?: 'sm' | 'md';
  style?: ViewStyle;
  /** Rendered before the tag chips, inside the same wrapping row (e.g. gender pill, flag). */
  leading?: React.ReactNode;
  /** Rendered after the tag chips, inside the same wrapping row (e.g. role badges). */
  trailing?: React.ReactNode;
}) {
  const targetH = size === 'md' ? TAG_BADGE_HEIGHT_MD : TAG_BADGE_HEIGHT_SM;
  const ordered = sortTagsForDisplay(tags ?? []);
  if (!ordered.length && !leading && !trailing) return null;

  return (
    <View style={[styles.row, style]}>
      {leading}
      {ordered.map((t) => (
        <TagBadgeItem key={t.name} tag={t} targetH={targetH} />
      ))}
      {trailing}
    </View>
  );
}

function TagBadgeItem({ tag, targetH }: { tag: TagSummary; targetH: number }) {
  const asset = getTagAsset(tag.name);

  if (asset?.kind === 'png') {
    const { width, height } = tagBadgeRenderSize(asset, targetH);
    return (
      <Image
        source={asset.source}
        style={{ width, height, backgroundColor: 'transparent' }}
        contentFit="contain"
        allowDownscaling
        accessibilityLabel={tag.displayName || tag.name}
      />
    );
  }

  if (asset?.kind === 'svg') {
    const { Component } = asset;
    const { width, height } = tagBadgeRenderSize(asset, targetH);
    // Force white as the inherited `currentColor` so the badge label stays
    // white even when react-native-svg fails to honor the baked `fill` in
    // some render contexts (e.g. the in-room profile overlay).
    return <Component width={width} height={height} color="#FFFFFF" />;
  }

  const remote = resolveRemoteTagIconUrl(tag.iconUrl);
  if (remote) {
    const aspect = 3.5;
    const height = targetH;
    const width = Math.round(height * aspect);
    return (
      <Image
        source={{ uri: remote }}
        style={{ width, height, backgroundColor: 'transparent' }}
        contentFit="contain"
        accessibilityLabel={tag.displayName || tag.name}
      />
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        {
          backgroundColor: tag.color || '#7B4FFF',
          height: targetH,
          paddingHorizontal: targetH * 0.4,
        },
      ]}
    >
      <Text style={[styles.fallbackLabel, { fontSize: targetH * 0.4 }]} numberOfLines={1}>
        {tag.displayName || tag.name}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.xs },
  fallback: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#E8A020',
  },
  fallbackLabel: { color: '#FFF', fontWeight: '700', letterSpacing: 0.3 },
});
