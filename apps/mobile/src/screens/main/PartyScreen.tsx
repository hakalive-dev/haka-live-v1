import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, CompositeNavigationProp } from '@react-navigation/native';
import { usePartyRoomsQuery } from '@hooks/queries/usePartyRoomsQuery';
import { useRefetchOnFocusIfStale } from '@hooks/useRefetchOnFocusIfStale';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';

import { useSelector } from 'react-redux';
import { roomsApi } from '@api/rooms';
import { prefetchRoomDetail } from '@api/prefetch';
import { Colors, Spacing, Radius } from '@/theme';
import type { RootState } from '@store/index';
import type { Room } from '@/types';
import type { RootStackParamList, MainTabParamList } from '@navigation/types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Live'>,
  NativeStackNavigationProp<RootStackParamList>
>;

type SubTab = 'party' | 'following';

// ── Country data ─────────────────────────────────────────────────────────────

interface CountryItem {
  code: string;
  name: string;
  flag: string;
}

const HOT_COUNTRIES: CountryItem[] = [
  { code: 'IN', name: 'India',   flag: '🇮🇳' },
  { code: 'NG', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'US', name: 'USA',     flag: '🇺🇸' },
  { code: 'AE', name: 'Dubai',   flag: '🇦🇪' },
  { code: 'CA', name: 'Canada',  flag: '🇨🇦' },
  { code: 'GB', name: 'UK',      flag: '🇬🇧' },
];

const ALL_COUNTRIES: CountryItem[] = [
  ...HOT_COUNTRIES,
  { code: 'PH', name: 'Philippines', flag: '🇵🇭' },
  { code: 'PK', name: 'Pakistan',    flag: '🇵🇰' },
  { code: 'BD', name: 'Bangladesh',  flag: '🇧🇩' },
  { code: 'GH', name: 'Ghana',       flag: '🇬🇭' },
  { code: 'KE', name: 'Kenya',       flag: '🇰🇪' },
  { code: 'EG', name: 'Egypt',       flag: '🇪🇬' },
];

// ── Category tag colors ──────────────────────────────────────────────────────

const TAG_COLORS: Record<string, string> = {
  Funny:    '#FF6B9D',
  Chatting: '#4CAF50',
  Dancing:  '#FF9800',
  Singing:  '#9C27B0',
  Party:    '#E91E63',
  Gaming:   '#2196F3',
  Music:    '#673AB7',
  Talent:   '#00BCD4',
  'Make friends': '#8BC34A',
};

function getTagColor(tag: string): string {
  return TAG_COLORS[tag] ?? '#FF6B9D';
}

function formatViewerCount(n: number): string {
  const safe = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1)}M`;
  if (safe >= 1_000) return `${(safe / 1_000).toFixed(1)}K`;
  return String(safe);
}

// ── PartyScreen ──────────────────────────────────────────────────────────────

export function PartyScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const currentUser = useSelector((s: RootState) => s.auth.user);
  const [subTab, setSubTab] = useState<SubTab>('party');
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [myRoom, setMyRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [menuVisible, setMenuVisible] = useState(false);

  const partyQuery = usePartyRoomsQuery(subTab === 'following');
  useRefetchOnFocusIfStale(
    () => partyQuery.refetch(),
    partyQuery.isStale,
    !partyQuery.isLoading,
  );

  useEffect(() => {
    if (!partyQuery.data) return;
    setMyRoom(partyQuery.data.myRoom);
    setRooms(partyQuery.data.rooms);
    setLoading(false);
    setRefreshing(false);
  }, [partyQuery.data]);

  useEffect(() => {
    if (partyQuery.isFetching && !partyQuery.data) {
      setLoading(true);
    }
  }, [partyQuery.isFetching, partyQuery.data]);

  useEffect(() => {
    setLoading(true);
    void partyQuery.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch when sub-tab changes
  }, [subTab]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void partyQuery.refetch();
  }, [partyQuery]);

  const handleJoinRoom = useCallback(async (room: Room) => {
    try {
      prefetchRoomDetail(room.id);
      navigation.navigate('RoomModal', {
        roomId: room.id,
        roomMode: room.roomMode ?? 'chat',
        isLocked: room.isLocked,
        hostId: room.hostId,
      });
    } catch (e: unknown) {
      Alert.alert('Cannot Join', e instanceof Error ? e.message : 'Failed to join room');
    }
  }, [navigation]);

  const handlePartyPress = useCallback(() => {
    navigation.navigate('CreateRoom');
  }, [navigation]);

  return (
    <LinearGradient
      colors={['#FF98A8', '#FFFFFF']}
      locations={[0.04, 1]}
      style={[styles.screen, { paddingTop: insets.top }]}
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.subTabRow}>
          <TouchableOpacity onPress={() => setSubTab('party')}>
            <Text style={[styles.subTabText, subTab === 'party' && styles.subTabTextActive]}>
              Party
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setSubTab('following')}>
            <Text style={[styles.subTabText, subTab === 'following' && styles.subTabTextActive]}>
              Following
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity hitSlop={8} onPress={() => navigation.navigate('Search', {})}>
            <Ionicons name="search" size={20} color="#000000" />
          </TouchableOpacity>
          <TouchableOpacity hitSlop={8} onPress={() => setMenuVisible(true)}>
            <Ionicons name="menu" size={22} color="#000000" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Country filter row ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.countryScroll}
        contentContainerStyle={styles.countryRow}
      >
        {HOT_COUNTRIES.map((c) => {
          const isActive = selectedCountry === c.code;
          return (
            <TouchableOpacity
              key={c.code}
              style={[styles.countryPill, isActive && styles.countryPillActive]}
              onPress={() => setSelectedCountry(isActive ? null : c.code)}
            >
              <Text style={styles.countryFlag}>{c.flag}</Text>
              <Text style={[styles.countryName, isActive && styles.countryNameActive]}>
                {c.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Room list ── */}
      <FlatList
        data={rooms}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 100 }]}
        ListHeaderComponent={
          myRoom && myRoom.host ? (
            <RoomListItem room={myRoom} onPress={() => handleJoinRoom(myRoom)} isMine />
          ) : null
        }
        renderItem={({ item }) => (
          <RoomListItem room={item} onPress={() => handleJoinRoom(item)} />
        )}
        ListEmptyComponent={
          !myRoom ? (
            <View style={styles.emptyCenter}>
              <Ionicons name="radio-outline" size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No live rooms right now</Text>
            </View>
          ) : null
        }
      />

      {/* ── Party FAB (hidden when user already has an active room) ── */}
      {!myRoom && (
        <TouchableOpacity
          style={[styles.partyFab, { bottom: 86 + insets.bottom + Spacing.md }]}
          activeOpacity={0.85}
          onPress={handlePartyPress}
        >
          <Ionicons name="videocam" size={20} color="#FFFFFF" />
          <Text style={styles.partyFabText}>Party</Text>
        </TouchableOpacity>
      )}

      {/* ── Country Menu Modal ── */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.menuPanel}>
            <View style={styles.menuHandle} />

            <Text style={styles.menuSectionTitle}>HOT</Text>
            <View style={styles.menuGrid}>
              {HOT_COUNTRIES.map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={[
                    styles.menuCountryItem,
                    selectedCountry === c.code && styles.menuCountryItemActive,
                  ]}
                  onPress={() => {
                    setSelectedCountry(selectedCountry === c.code ? null : c.code);
                    setMenuVisible(false);
                  }}
                >
                  <Text style={styles.menuCountryFlag}>{c.flag}</Text>
                  <Text style={styles.menuCountryName}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.menuCountryHeader}>
              <Text style={styles.menuSectionTitle}>COUNTRY</Text>
            </View>
            <View style={styles.menuGrid}>
              {ALL_COUNTRIES.map((c) => (
                <TouchableOpacity
                  key={c.code}
                  style={[
                    styles.menuCountryItem,
                    selectedCountry === c.code && styles.menuCountryItemActive,
                  ]}
                  onPress={() => {
                    setSelectedCountry(selectedCountry === c.code ? null : c.code);
                    setMenuVisible(false);
                  }}
                >
                  <Text style={styles.menuCountryFlag}>{c.flag}</Text>
                  <Text style={styles.menuCountryName}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </LinearGradient>
  );
}

// ── Room List Item ───────────────────────────────────────────────────────────

function RoomListItem({ room, onPress, isMine }: { room: Room; onPress: () => void; isMine?: boolean }) {
  const categoryTag = room.category === 'general' ? 'Party' : 'Chatting';
  const tagColor = getTagColor(categoryTag);

  return (
    <TouchableOpacity style={styles.roomItem} onPress={onPress} activeOpacity={0.8}>
      {/* Mine badge — upper right corner */}
      {isMine && (
        <View style={styles.mineBadge}>
          <Ionicons name="home" size={8} color="#FFFFFF" />
          <Text style={styles.mineBadgeText}>Mine</Text>
        </View>
      )}

      {/* Host avatar */}
      <View style={styles.roomAvatarWrap}>
        {room.coverImage ? (
          <Image source={{ uri: room.coverImage }} style={styles.roomAvatar} contentFit="cover" />
        ) : room.host.avatar ? (
          <Image source={{ uri: room.host.avatar }} style={styles.roomAvatar} contentFit="cover" />
        ) : (
          <LinearGradient colors={['#7B4FFF', '#5B2FD4']} style={styles.roomAvatar}>
            <Text style={styles.roomAvatarInitial}>
              {(room.host.displayName?.[0] ?? '?').toUpperCase()}
            </Text>
          </LinearGradient>
        )}
      </View>

      {/* Info */}
      <View style={styles.roomInfo}>
        <View style={styles.roomNameRow}>
          <Text style={styles.roomHostName} numberOfLines={1}>{room.host.displayName}</Text>
          <Text style={styles.roomFlag}>🇮🇳</Text>
        </View>
        <View style={styles.roomTagRow}>
          <View style={[styles.roomTag, { backgroundColor: tagColor }]}>
            <Text style={styles.roomTagText}>{categoryTag}</Text>
          </View>
        </View>
      </View>

      {/* Listener avatars stack */}
      <View style={styles.listenerStack}>
        {Array.from({ length: Math.min(Math.max(0, room.viewerCount ?? 0), 5) }, (_, i) => (
          <View
            key={i}
            style={[
              styles.listenerDot,
              { marginLeft: i === 0 ? 0 : -13, zIndex: 5 - i },
            ]}
          >
            <Ionicons name="person" size={12} color="rgba(255,255,255,0.6)" />
          </View>
        ))}
      </View>

      {/* Listener count */}
      <View style={styles.listenerCountWrap}>
        <Ionicons name="cellular" size={12} color={Colors.textTertiary} />
        <Text style={styles.listenerCountText}>
          {formatViewerCount(room.viewerCount ?? 0)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
  },
  subTabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  subTabText: {
    fontSize: 16,
    fontWeight: '600',
    lineHeight: 24,
    color: 'rgba(0,0,0,0.5)',
  },
  subTabTextActive: {
    color: '#000000',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },

  // Country filter
  countryScroll: {
    flexGrow: 0,
    paddingHorizontal: Spacing.lg,
    marginBottom: 2,
  },
  countryRow: {
    gap: 6,
    alignItems: 'center',
  },
  countryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(95,34,217,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  countryPillActive: {
    backgroundColor: '#5F22D9',
  },
  countryFlag: {
    fontSize: 18,
  },
  countryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  countryNameActive: {
    color: '#FFFFFF',
  },

  // Mine badge
  mineBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FF2D55',
    borderRadius: Radius.full,
    paddingHorizontal: 5,
    paddingVertical: 2,
    zIndex: 10,
  },
  mineBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Room list
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  roomItem: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 20,
    paddingHorizontal: 8,
    gap: 12,
    backgroundColor: 'rgba(95,34,217,0.1)',
    borderRadius: 15,
    marginBottom: 6,
  },
  roomAvatarWrap: {
    width: 80,
    height: 80,
    borderRadius: 10,
    overflow: 'hidden',
  },
  roomAvatar: {
    width: 80,
    height: 80,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomAvatarInitial: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  roomInfo: {
    flex: 1,
    gap: 5,
    alignSelf: 'center',
  },
  roomNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  roomHostName: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    color: '#000000',
    flexShrink: 1,
  },
  roomFlag: {
    fontSize: 14,
  },
  roomTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  roomTag: {
    paddingHorizontal: 10,
    paddingVertical: 0,
    height: 21,
    justifyContent: 'center',
    backgroundColor: 'rgba(209,114,58,0.5)',
    borderRadius: 10,
  },
  roomTagText: {
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    color: '#D1723A',
  },

  // Listener stack
  listenerStack: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
  },
  listenerDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#7B4FFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },

  // Listener count
  listenerCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  listenerCountText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textTertiary,
  },

  // Empty
  emptyCenter: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxxl * 2,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textTertiary,
  },

  // Party FAB
  partyFab: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#F9467D',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 40,
    shadowColor: '#F9467D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  partyFabText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Country menu modal
  menuOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  menuPanel: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    maxHeight: '70%',
  },
  menuHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E0E0E0',
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  menuSectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000000',
    marginBottom: Spacing.md,
  },
  menuCountryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.lg,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  menuCountryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  menuCountryItemActive: {
    borderColor: '#7B4FFF',
    backgroundColor: 'rgba(123,79,255,0.1)',
  },
  menuCountryFlag: {
    fontSize: 18,
  },
  menuCountryName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333333',
  },
});
