import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';

import { roomsApi } from '@api/rooms';
import { Colors, Radius, Spacing } from '@/theme';
import { CopyableId } from '@components/CopyableId';
import { UserAvatar } from '@components/UserAvatar';
import { UserIdBadge } from '@components/UserIdBadge';
import type { RootState } from '@store/index';
import type { RoomUser, Seat } from '@/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  seats: Seat[];
  roomUsers?: RoomUser[];
  targetSeatPosition?: number | null;
}

export function InviteOverlay({
  visible,
  onClose,
  roomId,
  seats,
  roomUsers = [],
  targetSeatPosition = null,
}: Props) {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [inviting, setInviting] = useState<string | null>(null);
  const [liveViewers, setLiveViewers] = useState<RoomUser[]>([]);

  const firstEmptySeat = seats.find((s) => !s.user && !s.isLocked && s.position !== 1);
  const inviteSeat =
    targetSeatPosition != null
      ? seats.find(
          (s) =>
            s.position === targetSeatPosition && !s.user && !s.isLocked && s.position !== 1,
        ) ?? firstEmptySeat
      : firstEmptySeat;

  // Fetch fresh room participants from the server each time the overlay opens
  useEffect(() => {
    if (!visible) {
      setQuery('');
      setInviting(null);
      return;
    }
    roomsApi.getViewers(roomId)
      .then((viewers) => setLiveViewers(viewers))
      .catch(() => { /* fall back to roomUsers prop */ });
  }, [visible, roomId]);

  // Use server-fresh list, fall back to socket-maintained prop
  const participants = liveViewers.length > 0 ? liveViewers : roomUsers;

  // Exclude already-seated users and self
  const seatedIds = new Set(seats.filter((s) => s.user).map((s) => s.user!.id));
  const availableRoomUsers = participants.filter(
    (u) => u.id !== currentUser?.id && !seatedIds.has(u.id),
  );

  const filteredRoomUsers = query.length >= 1
    ? availableRoomUsers.filter((u) =>
        u.displayName.toLowerCase().includes(query.toLowerCase()) ||
        (u.username ?? '').toLowerCase().includes(query.toLowerCase()) ||
        (u.hakaId ?? '').toLowerCase().includes(query.toLowerCase()),
      )
    : availableRoomUsers;

  const handleInvite = useCallback(async (user: RoomUser) => {
    if (!inviteSeat) return;
    setInviting(user.id);
    try {
      await roomsApi.inviteToSeat(roomId, user.id, inviteSeat.position);
      onClose();
    } catch (err) {
      Alert.alert('Invite Failed', err instanceof Error ? err.message : 'Could not send invite');
    } finally {
      setInviting(null);
    }
  }, [roomId, inviteSeat, onClose]);

  const displayList = filteredRoomUsers;
  const listTitle = 'People in This Room';

  const renderUser = useCallback(({ item }: { item: RoomUser }) => (
    <View style={styles.userRow}>
      <UserAvatar
        user={{
          displayName: item.displayName,
          avatar: item.avatar,
          equippedFrame: item.equippedFrame ?? null,
        }}
        size={44}
      />
      <View style={styles.userInfo}>
        <Text style={styles.userName} numberOfLines={1}>
          {item.displayName || item.username}
        </Text>
        {item.activeSpecialId && item.activeSpecialIdLevel ? (
          <UserIdBadge
            hakaId={item.hakaId}
            activeSpecialId={item.activeSpecialId}
            activeSpecialIdLevel={item.activeSpecialIdLevel}
            width={96}
            hidePlain
          />
        ) : (
          <CopyableId value={item.activeSpecialId ?? item.hakaId} textStyle={styles.userHakaId} />
        )}
      </View>
      <TouchableOpacity
        style={[styles.inviteBtn, !inviteSeat && styles.inviteBtnDisabled]}
        onPress={() => handleInvite(item)}
        disabled={inviting === item.id || !inviteSeat}
      >
        <Text style={styles.inviteBtnText}>Invite</Text>
      </TouchableOpacity>
    </View>
  ), [handleInvite, inviting, inviteSeat]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.panel, { paddingBottom: insets.bottom + Spacing.xxl }]}>
          {/* Handle */}
          <View style={styles.handle} />

          {/* Title */}
          <Text style={styles.title}>Invite to Seat</Text>

          {!inviteSeat && (
            <Text style={styles.noSeatWarning}>No empty seats available</Text>
          )}

          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={18} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by name or ID"
              placeholderTextColor={Colors.textTertiary}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={() => setQuery('')}>
                <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Section title */}
          <Text style={styles.sectionTitle}>{listTitle}</Text>

          {/* List */}
          <FlatList
            data={displayList}
            keyExtractor={(item) => item.id}
            renderItem={renderUser}
            style={styles.list}
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {availableRoomUsers.length === 0 ? 'No viewers in this room yet' : 'No match found'}
              </Text>
            }
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    maxHeight: '70%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.borderLight,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
  },
  noSeatWarning: {
    fontSize: 13,
    color: Colors.danger,
    marginBottom: Spacing.sm,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    height: 44,
    marginBottom: Spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    marginLeft: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
  },
  list: {
    flexGrow: 0,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceElevated,
  },
  avatarPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  userHakaId: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  inviteBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    minWidth: 70,
    alignItems: 'center',
  },
  inviteBtnDisabled: {
    backgroundColor: Colors.textTertiary,
  },
  inviteBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  loader: {
    marginTop: Spacing.xl,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textTertiary,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
});
