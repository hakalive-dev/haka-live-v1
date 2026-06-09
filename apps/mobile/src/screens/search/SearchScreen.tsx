import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { useQuery, keepPreviousData } from '@tanstack/react-query';

import { searchApi, SearchResults } from '@api/search';
import { queryKeys } from '@api/queryKeys';
import { Colors, Radius, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import { UserAvatar } from '@components/UserAvatar';
import { UserIdBadge } from '@components/UserIdBadge';
import type { PublicUser, Room } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'Search'>;
type Tab = 'all' | 'users' | 'rooms';

const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'users', label: 'Users' },
  { key: 'rooms', label: 'Rooms' },
];

export function SearchScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState(route.params?.initialQuery ?? '');
  const [tab, setTab] = useState<Tab>('all');
  const [debouncedQuery, setDebouncedQuery] = useState((route.params?.initialQuery ?? '').trim());

  // Debounce the raw input, then let React Query cache results per (term, tab)
  // so repeating a search or flipping tabs paints instantly from cache.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 400);
    return () => clearTimeout(timer);
  }, [query]);

  const term = debouncedQuery;
  const active = term.length >= 2;
  const searchQuery = useQuery({
    queryKey: queryKeys.search.query(`${tab}:${term}`),
    queryFn: () => searchApi.globalSearch(term, tab),
    enabled: active,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const results: SearchResults =
    active && searchQuery.data
      ? { users: searchQuery.data.users ?? [], rooms: searchQuery.data.rooms ?? [] }
      : { users: [], rooms: [] };
  const loading = active && searchQuery.isLoading;
  const searched = active;

  // Auto-focus
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const handleUserPress = useCallback(
    (userId: string) => {
      navigation.navigate('PublicProfile', { userId });
    },
    [navigation],
  );

  const handleRoomPress = useCallback(
    (room: Room) => {
      navigation.navigate('RoomModal', {
        roomId: room.id,
        roomMode: room.roomMode ?? 'chat',
        isLocked: room.isLocked,
        hostId: room.hostId,
      });
    },
    [navigation],
  );

  const hasUsers = results.users.length > 0;
  const hasRooms = results.rooms.length > 0;
  const isEmpty = searched && !loading && !hasUsers && !hasRooms;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Search bar */}
      <View style={styles.searchBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={16} color="#999" />
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search users, rooms..."
            placeholderTextColor="#999"
            returnKeyType="search"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color="#999" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, tab === t.key && styles.tabActive]}
            onPress={() => setTab(t.key)}
          >
            <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ListRowSkeleton rows={5} />
      ) : isEmpty ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={48} color="#DDD" />
          <Text style={styles.emptyText}>No results found for "{query}"</Text>
        </View>
      ) : !searched ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={48} color="#DDD" />
          <Text style={styles.emptyText}>Search for users or live rooms</Text>
        </View>
      ) : (
        <FlatList
          data={[
            ...(tab !== 'rooms' && hasUsers ? [{ type: 'user-header' as const }] : []),
            ...(tab !== 'rooms' ? results.users.map((u) => ({ type: 'user' as const, data: u })) : []),
            ...(tab !== 'users' && hasRooms ? [{ type: 'room-header' as const }] : []),
            ...(tab !== 'users' ? results.rooms.map((r) => ({ type: 'room' as const, data: r })) : []),
          ]}
          keyExtractor={(item, i) => {
            if (item.type === 'user-header' || item.type === 'room-header') return item.type;
            if (item.type === 'user') return `u-${(item.data as PublicUser).id}`;
            return `r-${(item.data as Room).id}`;
          }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxxl }}
          renderItem={({ item }) => {
            if (item.type === 'user-header') {
              return <Text style={styles.sectionHeader}>Users</Text>;
            }
            if (item.type === 'room-header') {
              return <Text style={styles.sectionHeader}>Live Rooms</Text>;
            }
            if (item.type === 'user') {
              const user = item.data as PublicUser;
              return (
                <TouchableOpacity
                  style={styles.userRow}
                  onPress={() => handleUserPress(user.id)}
                >
                  <UserAvatar
                    user={{
                      displayName: user.displayName,
                      avatar: user.avatar,
                      equippedFrame: user.equippedFrame ?? null,
                    }}
                    size={48}
                    hideFrame
                  />
                  <View style={styles.userInfo}>
                    <Text style={styles.userName} numberOfLines={1}>
                      {user.displayName}
                    </Text>
                    {user.activeSpecialId && user.activeSpecialIdLevel ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {user.username ? <Text style={styles.userSub} numberOfLines={1}>@{user.username}</Text> : null}
                        <UserIdBadge
                          hakaId={user.hakaId ?? null}
                          activeSpecialId={user.activeSpecialId}
                          activeSpecialIdLevel={user.activeSpecialIdLevel}
                          width={86}
                          hidePlain
                        />
                      </View>
                    ) : (
                      <Text style={styles.userSub} numberOfLines={1}>
                        @{user.username} · {user.activeSpecialId ?? user.hakaId}
                      </Text>
                    )}
                  </View>
                  {user.role === 'host' && (
                    <View style={styles.hostBadge}>
                      <Text style={styles.hostBadgeText}>Host</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            }
            // Room
            const room = item.data as Room;
            return (
              <TouchableOpacity
                style={styles.roomRow}
                onPress={() => handleRoomPress(room)}
              >
                {room.coverImage ? (
                  <Image source={{ uri: room.coverImage }} style={styles.roomThumb} contentFit="cover" />
                ) : (
                  <View style={[styles.roomThumb, styles.roomThumbFallback]}>
                    <Ionicons name="mic" size={20} color="#999" />
                  </View>
                )}
                <View style={styles.roomInfo}>
                  <Text style={styles.roomTitle} numberOfLines={1}>
                    {room.title}
                  </Text>
                  <Text style={styles.roomSub} numberOfLines={1}>
                    {room.host.displayName} · {room.viewerCount ?? 0} listeners
                  </Text>
                </View>
                <View style={styles.liveBadge}>
                  <Text style={styles.liveBadgeText}>LIVE</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    height: 40,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#000',
  },

  // Tabs
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  tab: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#999',
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },

  // Section headers
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },

  // User rows
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
  },
  userInfo: {
    flex: 1,
    gap: 2,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  userSub: {
    fontSize: 12,
    color: '#999',
  },
  hostBadge: {
    backgroundColor: Colors.primarySubtle,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  hostBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.primary,
  },

  // Room rows
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  roomThumb: {
    width: 52,
    height: 52,
    borderRadius: Radius.md,
  },
  roomThumbFallback: {
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomInfo: {
    flex: 1,
    gap: 2,
  },
  roomTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  roomSub: {
    fontSize: 12,
    color: '#999',
  },
  liveBadge: {
    backgroundColor: Colors.live,
    borderRadius: Radius.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
  },
  liveBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
});
