import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { roomsApi } from '@api/rooms';
import type { SeatInvitationPayload } from '@components/SeatInvitePrompt';
import { Colors, Radius, Spacing } from '@/theme';

const COUNTDOWN_SECONDS = 10;

type Props = {
  payload: SeatInvitationPayload;
  onDismiss: () => void;
};

export function InRoomSeatInviteBanner({ payload, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const [remaining, setRemaining] = useState(COUNTDOWN_SECONDS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => {
      setRemaining((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (remaining === 0) onDismiss();
  }, [remaining, onDismiss]);

  const handleReject = useCallback(() => {
    if (busy) return;
    onDismiss();
  }, [busy, onDismiss]);

  const handleAccept = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await roomsApi.joinRoom(payload.roomId).catch(() => {});
      await roomsApi.takeSeat(payload.roomId, payload.position);
    } catch {
      /* RoomScreen surfaces errors */
    } finally {
      onDismiss();
    }
  }, [busy, payload, onDismiss]);

  const inviterName = payload.fromUser?.displayName ?? 'Someone';
  const avatarUri = payload.fromUser?.avatar ?? null;

  return (
    <View style={[styles.wrap, { top: insets.top + Spacing.sm }]} pointerEvents="box-none">
      <View style={styles.card}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarInitial}>{inviterName.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.textCol}>
          <Text style={styles.title} numberOfLines={1}>
            {inviterName} invited you to the mic
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            Seat {payload.position} · {payload.roomTitle}
          </Text>
        </View>
        <Pressable style={styles.rejectBtn} onPress={handleReject} disabled={busy}>
          <Text style={styles.rejectText}>Decline</Text>
        </Pressable>
        <Pressable style={styles.acceptBtn} onPress={handleAccept} disabled={busy}>
          <Text style={styles.acceptText}>Join ({remaining}s)</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: Spacing.lg,
    right: Spacing.lg,
    zIndex: 200,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceHighlight,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: Colors.textSecondary,
    fontWeight: '700',
    fontSize: 16,
  },
  textCol: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  rejectBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  rejectText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  acceptBtn: {
    backgroundColor: Colors.success,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  acceptText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
