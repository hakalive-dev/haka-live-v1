import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Radius, Spacing } from '@/theme';
import { pkApi, type PkLiveRoom } from '@api/pk';
import { useToast } from '@components/Toast';

interface Props {
  visible: boolean;
  excludeRoomId: string;
  durationSecs: number;
  onDismiss: () => void;
}

export function PKInviteRoomSheet({ visible, excludeRoomId, durationSecs, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [rooms, setRooms]     = useState<PkLiveRoom[]>([]);
  const [query, setQuery]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    pkApi.getLiveRooms(excludeRoomId)
      .then((r) => setRooms((r.data as any)?.data ?? r.data ?? []))
      .catch(() => toast.show('Failed to load rooms', 'error'))
      .finally(() => setLoading(false));
  }, [visible, excludeRoomId]);

  const filtered = query.trim()
    ? rooms.filter((r) => r.host.displayName.toLowerCase().includes(query.toLowerCase()))
    : rooms;

  const handleInvite = async (room: PkLiveRoom) => {
    if (sending) return;
    setSending(room.id);
    try {
      await pkApi.sendInvite(room.id, room.host.id, durationSecs);
      toast.show('Invite sent!', 'success');
      onDismiss();
    } catch {
      toast.show('Failed to send invite', 'error');
    } finally {
      setSending(null);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onDismiss}>
      <TouchableOpacity style={styles.backdrop} onPress={onDismiss} activeOpacity={1} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.lg }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Invite a Room</Text>
        <TextInput
          style={styles.search}
          placeholder="Search by host name..."
          placeholderTextColor={Colors.textTertiary}
          value={query}
          onChangeText={setQuery}
        />
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: Spacing.xl }} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.row}>
                <Image
                  source={{ uri: item.host.avatar ?? undefined }}
                  style={styles.avatar}
                  contentFit="cover"
                />
                <View style={styles.info}>
                  <Text style={styles.hostName}>{item.host.displayName}</Text>
                  <Text style={styles.viewers}>● LIVE · {item.viewerCount} viewers</Text>
                </View>
                <TouchableOpacity
                  style={[styles.inviteBtn, sending === item.id && styles.inviteBtnDisabled]}
                  onPress={() => handleInvite(item)}
                  disabled={!!sending}
                  activeOpacity={0.8}
                >
                  <Text style={styles.inviteBtnText}>
                    {sending === item.id ? '...' : 'Invite'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            ListEmptyComponent={
              <Text style={styles.empty}>No live rooms found</Text>
            }
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'transparent' },
  sheet: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: Spacing.lg,
    maxHeight: '70%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: Colors.border, alignSelf: 'center', marginBottom: Spacing.md,
  },
  title: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700', marginBottom: Spacing.md },
  search: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  avatar: { width: 40, height: 40, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.border },
  info: { flex: 1 },
  hostName: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  viewers: { color: Colors.online, fontSize: 12 },
  inviteBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
  },
  inviteBtnDisabled: { opacity: 0.5 },
  inviteBtnText: { color: Colors.textInverse, fontSize: 13, fontWeight: '600' },
  empty: { color: Colors.textTertiary, textAlign: 'center', marginTop: Spacing.xl },
});
