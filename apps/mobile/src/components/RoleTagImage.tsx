import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import {
  getRoleTagAsset,
  ROLE_TAG_BADGE_HEIGHT,
  tagBadgeRenderSize,
  userHasStaffTag,
  type RoleTagKey,
  type TagSummary,
} from './tagBadgeAssets';

const AGENCY_GRADIENT: [string, string] = ['#5BB7FF', '#2A8DFF'];

export function RoleTagImage({
  roleKey,
  tags,
  height = ROLE_TAG_BADGE_HEIGHT,
}: {
  roleKey: RoleTagKey;
  tags?: TagSummary[];
  height?: number;
}) {
  if ((roleKey === 'super_admin' || roleKey === 'admin') && userHasStaffTag(tags, roleKey)) {
    return null;
  }

  const asset = getRoleTagAsset(roleKey);
  if (asset?.kind === 'png') {
    const { width, height: h } = tagBadgeRenderSize(asset, height);
    return (
      <Image
        source={asset.source}
        style={{ width, height: h, backgroundColor: 'transparent' }}
        contentFit="contain"
        allowDownscaling
        accessibilityLabel={roleKey === 'coin_seller' ? 'Coin Seller' : roleKey}
      />
    );
  }

  if (asset?.kind === 'svg') {
    const { Component } = asset;
    const { width, height: h } = tagBadgeRenderSize(asset, height);
    // Keep the baked label white even where react-native-svg drops the SVG's
    // own `fill` (e.g. the in-room profile overlay) — see TagBadges.
    return <Component width={width} height={h} color="#FFFFFF" />;
  }

  return null;
}

/** Interim gradient pill until Agency art is provided. */
export function AgencyRoleBadge({ height = ROLE_TAG_BADGE_HEIGHT }: { height?: number }) {
  const fontSize = Math.max(10, Math.round(height * 0.42));
  const iconSize = Math.max(8, Math.round(height * 0.38));
  return (
    <LinearGradient
      colors={AGENCY_GRADIENT}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.agencyPill, { height, paddingHorizontal: height * 0.35 }]}
    >
      <View style={[styles.agencyIconWrap, { width: iconSize + 6, height: iconSize + 6, borderRadius: (iconSize + 6) / 2 }]}>
        <Ionicons name="briefcase" size={iconSize} color="#FFFFFF" />
      </View>
      <Text style={[styles.agencyLabel, { fontSize, lineHeight: fontSize + 2 }]}>Agency</Text>
    </LinearGradient>
  );
}

/** Legacy ribbon badges (mock `badges[]` strings) — unchanged gradient style. */
export function LegacyRibbonBadge({
  label,
  height = ROLE_TAG_BADGE_HEIGHT,
}: {
  label: string;
  height?: number;
}) {
  const fontSize = Math.max(10, Math.round(height * 0.42));
  const iconSize = Math.max(8, Math.round(height * 0.38));
  return (
    <LinearGradient
      colors={['#9D7FFF', '#7B4FFF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.agencyPill, { height, paddingHorizontal: height * 0.35 }]}
    >
      <View style={[styles.agencyIconWrap, { width: iconSize + 6, height: iconSize + 6, borderRadius: (iconSize + 6) / 2 }]}>
        <Ionicons name="ribbon" size={iconSize} color="#FFFFFF" />
      </View>
      <Text style={[styles.agencyLabel, { fontSize, lineHeight: fontSize + 2 }]} numberOfLines={1}>
        {label}
      </Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  agencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    gap: 4,
  },
  agencyIconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  agencyLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
