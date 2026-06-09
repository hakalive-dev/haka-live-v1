import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/theme';
import { roomsApi, type RoomAdmin } from '@api/rooms';
import { UserAvatar } from '@components/UserAvatar';
import type { Seat } from '@/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  seats: Seat[];
  isHost?: boolean;
  maxAdmins?: number;
}

export function RoomAdminOverlay({
  visible, onClose, roomId, seats, isHost, maxAdmins = 5,
}: Props) {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<RoomAdmin[]>([]);

  const load = useCallback(async () => {
    try {
      const admins = await roomsApi.listAdmins(roomId);
      setList(admins);
    } catch {}
  }, [roomId]);

  useEffect(() => { if (visible) load(); }, [visible, load]);

  const handleRemove = useCallback(async (userId: string) => {
    try {
      await roomsApi.removeAdmin(roomId, userId);
      await load();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to remove admin');
    }
  }, [roomId, load]);

  const handleAdd = useCallback(() => {
    const candidates = seats.filter((s) => s.user && s.position !== 1 && !list.some((a) => a.user.id === s.user!.id));
    if (candidates.length === 0) {
      Alert.alert('No candidates', 'No seated users available to promote.');
      return;
    }
    Alert.alert(
      'Add admin',
      'Choose a seated user to promote.',
      [
        ...candidates.slice(0, 5).map((s) => ({
          text: s.user!.displayName,
          onPress: async () => {
            try {
              await roomsApi.addAdmin(roomId, s.user!.id);
              await load();
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to add admin');
            }
          },
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ],
    );
  }, [seats, list, roomId, load]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.backBtn}>
              <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Room Admin</Text>
            <View style={styles.backBtn} />
          </View>

          <Text style={styles.countLabel}>
            Room Admin Number: {list.length}/{maxAdmins}
          </Text>

          <TouchableOpacity style={styles.upgradeCard} activeOpacity={0.85}>
            <Text style={styles.upgradeText}>Upgrade room members, you can set</Text>
            <Ionicons name="chevron-forward" size={16} color="rgba(255,255,255,0.8)" />
          </TouchableOpacity>

          <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl, paddingTop: Spacing.md }}>
            {list.map((a) => (
              <View key={a.user.id} style={styles.row}>
                <UserAvatar
                  user={{
                    displayName: a.user.displayName,
                    avatar: a.user.avatar,
                    equippedFrame: a.user.equippedFrame ?? null,
                  }}
                  size={44}
                />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={styles.name}>{a.user.displayName}</Text>
                  <View style={styles.roleBadge}>
                    <Ionicons name="person" size={10} color="#FFFFFF" />
                    <Text style={styles.roleText}>Room Admin</Text>
                  </View>
                </View>
                {isHost && (
                  <TouchableOpacity style={styles.removeBtn} onPress={() => handleRemove(a.user.id)}>
                    <Ionicons name="close-circle" size={14} color="rgba(255,255,255,0.7)" />
                    <Text style={styles.removeText}>Remove</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {isHost && list.length < maxAdmins && (
              <TouchableOpacity style={styles.addRow} onPress={handleAdd}>
                <View style={styles.addIcon}>
                  <Ionicons name="add" size={22} color="rgba(255,255,255,0.6)" />
                </View>
                <Text style={styles.addText}>Add admin</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const BG = '#1A1530';

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    height: '55%', overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },

  countLabel: {
    color: 'rgba(255,255,255,0.7)', fontSize: 13,
    paddingHorizontal: Spacing.lg, marginTop: Spacing.xs,
  },
  upgradeCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: Spacing.lg, marginTop: Spacing.md,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.md,
    borderRadius: Radius.md,
  },
  upgradeText: { color: '#FFFFFF', fontSize: 13 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.08)' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  name: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  roleBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2,
    marginTop: 4,
  },
  roleText: { color: '#FFFFFF', fontSize: 10, fontWeight: '600' },
  removeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: Spacing.md, paddingVertical: 6,
    borderRadius: 999,
  },
  removeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '500' },

  addRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  addIcon: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)',
  },
  addText: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginLeft: Spacing.md },
});
