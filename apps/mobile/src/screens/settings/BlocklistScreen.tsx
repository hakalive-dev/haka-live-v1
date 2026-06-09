import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Radius, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import { UserAvatar } from '@components/UserAvatar';
import { UserIdBadge } from '@components/UserIdBadge';
import { settingsApi, BlockedUserEntry } from '@api/settings';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'Blocklist'>;

export function BlocklistScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [searchText, setSearchText] = useState('');
  const [blocklist, setBlocklist] = useState<BlockedUserEntry[]>([]);
  const [searchResults, setSearchResults] = useState<Array<{ id: string; displayName: string; avatar: string | null; hakaId: string; activeSpecialId?: string | null; activeSpecialIdLevel?: string | null; equippedFrame?: import('@/types').EquippedCosmetic | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      settingsApi.getBlocklist()
        .then(setBlocklist)
        .catch(() => {})
        .finally(() => setLoading(false));
    }, []),
  );

  const handleSearch = useCallback(async () => {
    const q = searchText.trim();
    if (!q) return;
    setSearching(true);
    try {
      const results = await settingsApi.searchUsersToBlock(q);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchText]);

  const handleBlock = useCallback(async (userId: string) => {
    try {
      const entry = await settingsApi.blockUser(userId);
      setBlocklist((prev) => [entry, ...prev]);
      setSearchResults((prev) => prev.filter((u) => u.id !== userId));
      Alert.alert('Blocked', 'User has been blocked.');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to block user.');
    }
  }, []);

  const handleUnblock = useCallback(async (blockedId: string) => {
    Alert.alert('Unblock', 'Are you sure you want to unblock this user?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unblock',
        onPress: async () => {
          try {
            await settingsApi.unblockUser(blockedId);
            setBlocklist((prev) => prev.filter((b) => b.blocked_id !== blockedId));
          } catch (e: unknown) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to unblock.');
          }
        },
      },
    ]);
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocklist</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Search */}
      <View style={styles.searchRow}>
        <View style={styles.searchInput}>
          <Ionicons name="search" size={16} color="#999" />
          <TextInput
            style={styles.searchField}
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Please search the recipient's ID"
            placeholderTextColor="#999"
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} disabled={searching}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Search results */}
      {searchResults.length > 0 && (
        <View style={styles.resultsSection}>
          <Text style={styles.resultsTitle}>Search Results</Text>
          {searchResults.map((user) => (
            <View key={user.id} style={styles.resultRow}>
              <UserAvatar
                user={{
                  displayName: user.displayName,
                  avatar: user.avatar,
                  equippedFrame: user.equippedFrame ?? null,
                }}
                size={44}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.resultName}>{user.displayName}</Text>
                {user.activeSpecialId && user.activeSpecialIdLevel ? (
                  <UserIdBadge hakaId={user.hakaId} activeSpecialId={user.activeSpecialId} activeSpecialIdLevel={user.activeSpecialIdLevel} width={86} hidePlain />
                ) : (
                  <Text style={styles.resultId}>{user.activeSpecialId ?? user.hakaId}</Text>
                )}
              </View>
              <TouchableOpacity style={styles.blockBtn} onPress={() => handleBlock(user.id)}>
                <Text style={styles.blockBtnText}>Block</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Blocklist */}
      {loading ? (
        <ListRowSkeleton rows={6} />
      ) : blocklist.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="ban-outline" size={48} color="#DDD" />
          <Text style={styles.emptyText}>No blocked users</Text>
        </View>
      ) : (
        <FlatList
          data={blocklist}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.blockRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.blockName}>{item.displayName}</Text>
                {item.activeSpecialId && item.activeSpecialIdLevel ? (
                  <UserIdBadge hakaId={item.hakaId} activeSpecialId={item.activeSpecialId} activeSpecialIdLevel={item.activeSpecialIdLevel} width={86} hidePlain />
                ) : (
                  <Text style={styles.blockId}>{item.activeSpecialId ?? item.hakaId}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => handleUnblock(item.blocked_id)}>
                <Text style={styles.unblockText}>Unblock</Text>
              </TouchableOpacity>
            </View>
          )}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xl }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
  },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: '600', color: '#000', textAlign: 'center' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, gap: Spacing.sm,
  },
  searchInput: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F5F5F5', borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, height: 40, gap: Spacing.sm,
  },
  searchField: { flex: 1, fontSize: 13, color: '#000' },
  searchBtn: {
    backgroundColor: '#F5F5F5', borderRadius: Radius.md,
    paddingHorizontal: Spacing.md, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBtnText: { fontSize: 13, fontWeight: '500', color: '#000' },

  resultsSection: { paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  resultsTitle: { fontSize: 12, fontWeight: '600', color: '#999', marginBottom: Spacing.sm },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.sm, borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  resultAvatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { backgroundColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center' },
  avatarInitial: { fontSize: 14, fontWeight: '600', color: '#666' },
  resultName: { fontSize: 14, fontWeight: '500', color: '#000' },
  resultId: { fontSize: 11, color: '#999' },
  blockBtn: {
    backgroundColor: '#FF4D4D', borderRadius: Radius.sm,
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
  },
  blockBtnText: { fontSize: 12, fontWeight: '600', color: '#FFF' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  emptyText: { fontSize: 14, color: '#999' },

  blockRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg, paddingVertical: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: '#F5F5F5',
  },
  blockName: { fontSize: 14, fontWeight: '500', color: '#000' },
  blockId: { fontSize: 11, color: '#999' },
  unblockText: { fontSize: 13, color: '#FF4D4D' },
});
