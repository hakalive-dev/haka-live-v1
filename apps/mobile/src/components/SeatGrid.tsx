import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '../theme';
import type { EquippedCosmetic } from '@/types';
import { SpecialIdBadge } from './SpecialIdBadge';
import { UserAvatar, AVATAR_FRAME_SCALE } from './UserAvatar';

export type SeatUser = {
  id: string;
  displayName?: string | null;
  avatar?: string | null;
  hakaId?: string | null;
  equippedFrame?: EquippedCosmetic | null;
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
};

export type Seat = {
  position: number;
  userId: string | null;
  user?: SeatUser | null;
  isLocked?: boolean;
  isMuted?: boolean;
};

type MicConfig = 5 | 10 | 15 | 20;

type Props = {
  micConfig: MicConfig;
  seats: Seat[];
  hostId: string;
  onSeatPress?: (seat: Seat) => void;
};

const SEAT_SIZE: Record<MicConfig, number> = {
  5:  52,
  10: 52,
  15: 52,
  20: 52,
};

const COLUMNS: Record<MicConfig, number> = {
  5:  5,
  10: 5,
  15: 5,
  20: 5,
};

export function SeatGrid({ micConfig, seats, hostId, onSeatPress }: Props) {
  const size = SEAT_SIZE[micConfig];
  const cols = COLUMNS[micConfig];

  const byPosition = new Map(seats.map((s) => [s.position, s]));
  const rendered: Seat[] = Array.from({ length: micConfig }, (_, i) => {
    const pos = i + 1;
    return byPosition.get(pos) ?? { position: pos, userId: null };
  });

  const rows: Seat[][] = [];
  for (let i = 0; i < rendered.length; i += cols) {
    rows.push(rendered.slice(i, i + cols));
  }

  return (
    <View style={styles.grid}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((seat) => {
            const isHost = seat.userId === hostId;
            const avatarInner = size - 4;
            const cellExtent = seat.user
              ? Math.max(size, Math.ceil(avatarInner * AVATAR_FRAME_SCALE))
              : size;
            const seatInset = (cellExtent - size) / 2;
            const bubbleStyle = [
              styles.seat,
              { width: size, height: size, borderRadius: size / 2 },
              isHost && styles.hostSeat,
            ];
            return (
              <Pressable
                key={seat.position}
                style={styles.seatWrap}
                onPress={onSeatPress ? () => onSeatPress(seat) : undefined}
              >
                <View
                  style={{
                    width: cellExtent,
                    height: cellExtent,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {/* Circle bubble — background/border layer; avatar frame renders outside this ring */}
                  <View
                    style={[
                      bubbleStyle,
                      styles.seatBubbleBg,
                      { top: seatInset, left: seatInset },
                    ]}
                  />
                  {seat.user ? (
                    <UserAvatar
                      user={{
                        displayName: seat.user.displayName ?? '',
                        avatar: seat.user.avatar ?? null,
                        equippedFrame: seat.user.equippedFrame ?? null,
                      }}
                      size={avatarInner}
                    />
                  ) : (
                    <Ionicons
                      name={seat.isLocked ? 'lock-closed' : 'add'}
                      size={size * 0.4}
                      color={Colors.textTertiary}
                    />
                  )}
                  {seat.isMuted && (
                    <View
                      style={[styles.mutedOverlay, { bottom: seatInset, right: seatInset }]}
                    >
                      <Ionicons name="mic-off" size={10} color={Colors.textInverse} />
                    </View>
                  )}
                </View>
                {seat.user?.activeSpecialId && seat.user?.activeSpecialIdLevel ? (
                  <SpecialIdBadge
                    number={seat.user.activeSpecialId}
                    level={seat.user.activeSpecialIdLevel}
                    width={size + 20}
                  />
                ) : seat.user?.activeSpecialId ? (
                  <View style={styles.specialIdWrap} pointerEvents="none">
                    <Text style={styles.specialIdText} numberOfLines={1}>
                      {seat.user.activeSpecialId}
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.label} numberOfLines={1}>
                  {seat.user?.displayName ?? seat.position}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: Spacing.sm,
  },
  seatWrap: {
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  seat: {
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatBubbleBg: {
    position: 'absolute',
  },
  hostSeat: {
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  mutedOverlay: {
    position: 'absolute' as const,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.textPrimary,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    zIndex: 1000,
    elevation: 1000,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  label: {
    fontSize: 11,
    color: Colors.textSecondary,
    maxWidth: 72,
  },
  specialIdWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },
  specialIdText: {
    color: '#7B4FFF',
    fontSize: 9,
    fontWeight: '700',
  },
});
