import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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

import { chatApi } from '@api/chat';
import { UserAvatar } from '@components/UserAvatar';
import { Colors, Radius, Spacing } from '@/theme';
import type { DMConversation } from '@/types';

type Props = {
  visible: boolean;
  excludeUserId?: string;
  onClose: () => void;
  onSelect: (userId: string, displayName: string) => void;
};

export function DmForwardPicker({ visible, excludeUserId, onClose, onSelect }: Props) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [conversations, setConversations] = useState<DMConversation[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!visible) return;
    setLoading(true);
    setSearch('');
    chatApi
      .getConversations()
      .then(setConversations)
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [visible]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (excludeUserId && c.otherUser.id === excludeUserId) return false;
      if (!q) return true;
      const name = c.otherUser.displayName?.toLowerCase() ?? '';
      const hakaId = c.otherUser.hakaId?.toLowerCase() ?? '';
      const username = c.otherUser.username?.toLowerCase() ?? '';
      return name.includes(q) || hakaId.includes(q) || username.includes(q);
    });
  }, [conversations, excludeUserId, search]);

  const handleSelect = useCallback(
    (userId: string, displayName: string) => {
      onSelect(userId, displayName);
      onClose();
    },
    [onClose, onSelect],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={[styles.card, { paddingBottom: insets.bottom + Spacing.lg }]}>
          <View style={styles.header}>
            <View style={styles.headerSide} />
            <Text style={styles.title}>Forward to</Text>
            <TouchableOpacity hitSlop={8} onPress={onClose} style={styles.headerSide}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          <View style={styles.searchRow}>
            <Ionicons name="search" size={18} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search name or ID"
              placeholderTextColor={Colors.textTertiary}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.primary} style={styles.loader} />
          ) : (
            <FlatList
              data={filtered}
              keyExtractor={(item) => item.otherUser.id}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              ListEmptyComponent={
                <Text style={styles.empty}>No conversations found.</Text>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  activeOpacity={0.7}
                  onPress={() =>
                    handleSelect(item.otherUser.id, item.otherUser.displayName ?? 'User')
                  }
                >
                  <UserAvatar user={item.otherUser} size={40} hideFrame hideBorder />
                  <View style={styles.rowText}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.otherUser.displayName}
                    </Text>
                    {item.otherUser.hakaId ? (
                      <Text style={styles.sub} numberOfLines={1}>
                        ID: {item.otherUser.hakaId}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    maxHeight: '75%',
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    paddingTop: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  headerSide: {
    width: 28,
    alignItems: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  list: {
    paddingHorizontal: Spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  rowText: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  sub: {
    fontSize: 12,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  empty: {
    textAlign: 'center',
    color: Colors.textTertiary,
    paddingVertical: Spacing.xl,
  },
  loader: {
    paddingVertical: Spacing.xxl,
  },
});
