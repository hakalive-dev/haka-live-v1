import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { CosmeticBackground } from './CosmeticBackground';
import { Radius, Spacing } from '@/theme';

export const COSMETIC_CHAT_AVATAR_SIZE = 28;

interface Props {
  fill: string | null;
  animation: string | null;
  fallback?: string | null;
  avatar: React.ReactNode;
  header: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
}

/** Chat bubble cosmetic with avatar + sender row embedded inside the frame. */
export function CosmeticChatBubbleShell({
  fill,
  animation,
  fallback = null,
  avatar,
  header,
  children,
  style,
}: Props) {
  return (
    <CosmeticBackground
      source={fill}
      animationSource={animation}
      fallbackSource={fallback}
      style={[styles.body, style]}
      contentStyle={styles.inner}
      minHeight={52}
    >
      <View style={styles.header}>
        {avatar}
        <View style={styles.headerMeta}>{header}</View>
      </View>
      <View
        style={[
          styles.message,
          { paddingLeft: COSMETIC_CHAT_AVATAR_SIZE + Spacing.sm },
        ]}
      >
        {children}
      </View>
    </CosmeticBackground>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  inner: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerMeta: {
    flex: 1,
    minWidth: 0,
  },
  message: {
    marginTop: Spacing.xs,
  },
});
