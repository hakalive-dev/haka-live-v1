import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Colors } from '@/theme';
import { SpecialIdBadge } from './SpecialIdBadge';

interface UserIdBadgeProps {
  hakaId: string | null | undefined;
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
  width?: number;
  height?: number;
  style?: ViewStyle;
  /** When false, the plain Haka ID pill is rendered even without a special-id. */
  hidePlain?: boolean;
}

const DEFAULT_WIDTH = 96;
const DEFAULT_HEIGHT = 28;

export function UserIdBadge({
  hakaId,
  activeSpecialId,
  activeSpecialIdLevel,
  width = DEFAULT_WIDTH,
  height = DEFAULT_HEIGHT,
  style,
  hidePlain,
}: UserIdBadgeProps) {
  const displayId = activeSpecialId ?? hakaId;
  if (!displayId) return null;

  if (activeSpecialId && activeSpecialIdLevel) {
    return (
      <SpecialIdBadge
        number={activeSpecialId}
        level={activeSpecialIdLevel}
        width={width}
        style={style}
      />
    );
  }

  if (activeSpecialId) {
    return (
      <View style={[styles.specialPill, { height }, style]}>
        <Text style={styles.specialText} numberOfLines={1}>
          ID: {activeSpecialId}
        </Text>
      </View>
    );
  }

  if (hidePlain) return null;

  return (
    <View style={[styles.plainPill, { height }, style]}>
      <Text style={styles.plainText} numberOfLines={1}>
        ID: {hakaId}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  specialPill: {
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  specialText: {
    // Must stay readable on dark sheets (e.g. RoomScreen profile overlay)
    color: Colors.primaryLight,
    fontSize: 11,
    fontWeight: '700',
  },
  plainPill: {
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: Colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  plainText: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
});
