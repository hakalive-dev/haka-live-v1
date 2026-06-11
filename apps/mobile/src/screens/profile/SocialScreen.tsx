import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDispatch, useSelector } from 'react-redux';

import { usersApi } from '@api/users';
import { setPendingVisitor } from '../../store/profileSlice';
import { Colors, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import { UserAvatar } from '@components/UserAvatar';
import { RichLevelBadge } from '@components/RichLevelBadge';
import { CharmLevelBadge } from '@components/CharmLevelBadge';
import type { PublicUser, VisitorEntry, SpecialAttentionEntry } from '@/types';
import type { RootStackScreenProps } from '@navigation/types';
import type { RootState } from '@store/index';

type Props = RootStackScreenProps<'Social'>;

const TABS = ['Friends', 'Following', 'Followers', 'Visitors'] as const;
type Tab = (typeof TABS)[number];

const FOLLOWING_SUBTABS = ['Following', 'Special Attention'] as const;
type FollowingSubTab = (typeof FOLLOWING_SUBTABS)[number];

// Figma palette
const TAB_ACTIVE = '#5F22D9';

export function SocialScreen({ route, navigation }: Props) {
  const { userId, displayName, initialTab } = route.params;
  const insets = useSafeAreaInsets();
  const dispatch = useDispatch();
  const currentUser = useSelector((s: RootState) => s.auth.user);
  const pendingVisitor = useSelector((s: RootState) => s.profile.pendingVisitor);
  const isMe = currentUser?.id === userId;

  const [activeTab, setActiveTab] = useState<Tab>(initialTab ?? 'Friends');
  const [followingSubTab, setFollowingSubTab] = useState<FollowingSubTab>('Following');

  // Data states
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [following, setFollowing] = useState<PublicUser[]>([]);
  const [specialAttention, setSpecialAttention] = useState<PublicUser[]>([]);
  const [followers, setFollowers] = useState<PublicUser[]>([]);
  const [visitors, setVisitors] = useState<PublicUser[]>([]);

  // Counts
  const [friendsCount, setFriendsCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);
  const [followersCount, setFollowersCount] = useState(0);
  const [visitorsCount, setVisitorsCount] = useState(0);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Load data for current tab
  const loadTab = useCallback(
    async (tab: Tab) => {
      setLoading(true);
      try {
        if (tab === 'Friends') {
          const res = await usersApi.friends(userId);
          setFriends(res.items);
          setFriendsCount(res.total);
        } else if (tab === 'Following') {
          const [followingRes, saRes] = await Promise.allSettled([
            usersApi.following(userId),
            isMe ? usersApi.mySpecialAttention() : Promise.resolve({ items: [], total: 0, page: 1, limit: 20, hasMore: false }),
          ]);
          if (followingRes.status === 'fulfilled') {
            setFollowing(followingRes.value.items);
            setFollowingCount(followingRes.value.total);
          }
          if (saRes.status === 'fulfilled') {
            const saData = saRes.value.items as (SpecialAttentionEntry | PublicUser)[];
            setSpecialAttention(
              saData.map((item: any) => ('user' in item ? item.user : item)),
            );
          }
        } else if (tab === 'Followers') {
          const res = await usersApi.followers(userId);
          setFollowers(res.items);
          setFollowersCount(res.total);
        } else if (tab === 'Visitors') {
          if (isMe) {
            const res = await usersApi.myVisitors();
            setVisitors(res.items.map((v: VisitorEntry) => v.user));
            setVisitorsCount(res.total);
          }
        }
      } catch {}
      setLoading(false);
    },
    [userId, isMe],
  );

  useEffect(() => {
    loadTab(activeTab);
  }, [activeTab, loadTab]);

  useEffect(() => {
    if (!pendingVisitor || !isMe || activeTab !== 'Visitors') return;
    const id = pendingVisitor.user.id;
    let isNewVisitor = false;
    setVisitors((prev) => {
      const had = prev.some((u) => u.id === id);
      isNewVisitor = !had;
      const filtered = prev.filter((u) => u.id !== id);
      return [pendingVisitor.user, ...filtered];
    });
    if (isNewVisitor) setVisitorsCount((c) => c + 1);
    dispatch(setPendingVisitor(null));
  }, [pendingVisitor, isMe, activeTab, dispatch]);

  const handleFollow = useCallback(
    async (user: PublicUser) => {
      const wasFollowing = user.isFollowing;
      setActionLoading(user.id);
      const apply = (val: boolean) => {
        const update = (prev: PublicUser[]) =>
          prev.map((u) => (u.id === user.id ? { ...u, isFollowing: val } : u));
        setFriends(update);
        setFollowing(update);
        setFollowers(update);
        setSpecialAttention(update);
      };
      apply(!wasFollowing);
      try {
        if (wasFollowing) await usersApi.unfollow(user.id);
        else await usersApi.follow(user.id);
        void loadTab(activeTab);
      } catch (e: any) {
        apply(wasFollowing ?? false);
        Alert.alert('Error', e?.message || 'Failed to update follow');
      }
      setActionLoading(null);
    },
    [activeTab, loadTab],
  );

  const handleSpecialAttention = useCallback(
    async (user: PublicUser) => {
      setActionLoading(user.id);
      try {
        if (user.isSpecialAttention) {
          await usersApi.removeSpecialAttention(user.id);
          const update = (prev: PublicUser[]) =>
            prev.map((u) =>
              u.id === user.id ? { ...u, isSpecialAttention: false } : u,
            );
          setFollowing(update);
          setSpecialAttention(update);
        } else {
          await usersApi.addSpecialAttention(user.id);
          const update = (prev: PublicUser[]) =>
            prev.map((u) =>
              u.id === user.id ? { ...u, isSpecialAttention: true } : u,
            );
          setFollowing(update);
          setSpecialAttention(update);
        }
      } catch {}
      setActionLoading(null);
    },
    [],
  );

  // Determine list data
  let listData: PublicUser[] = [];
  if (activeTab === 'Friends') listData = friends;
  else if (activeTab === 'Following')
    listData = followingSubTab === 'Special Attention' ? specialAttention : following;
  else if (activeTab === 'Followers') listData = followers;
  else if (activeTab === 'Visitors') listData = visitors;

  // Tab title with count
  const tabTitle = () => {
    if (activeTab === 'Friends') return `Friends (${friendsCount})`;
    if (activeTab === 'Following') return `Following (${followingCount})`;
    if (activeTab === 'Followers') return `Followers (${followersCount})`;
    return `Visitors (${visitorsCount})`;
  };

  const renderUserRow = ({ item }: { item: PublicUser }) => (
    <TouchableOpacity
      style={styles.userRow}
      onPress={() => navigation.navigate('PublicProfile', { userId: item.id })}
      activeOpacity={0.7}
    >
      {/* Avatar */}
      <UserAvatar
        user={{
          displayName: item.displayName,
          avatar: item.avatar,
          equippedFrame: item.equippedFrame ?? null,
        }}
        size={48}
        hideFrame
      />

      {/* Info */}
      <View style={styles.userInfo}>
        <Text style={styles.userName} numberOfLines={1}>
          {item.displayName}
        </Text>
        <View style={styles.levelPillRow}>
          {(item.richLevel ?? 0) > 0 ? (
            <RichLevelBadge level={item.richLevel as number} size={14} />
          ) : null}
          {(item.charmLevel ?? 0) > 0 ? (
            <CharmLevelBadge level={item.charmLevel as number} size={14} />
          ) : null}
        </View>
      </View>

      {/* Action buttons */}
      <View style={styles.actionArea}>
        {activeTab === 'Friends' ? (
          <TouchableOpacity
            hitSlop={8}
            onPress={() => navigation.navigate('PublicProfile', { userId: item.id })}
          >
            <Ionicons name="swap-horizontal" size={22} color="#999" />
          </TouchableOpacity>
        ) : activeTab === 'Following' || activeTab === 'Followers' ? (
          <View style={styles.actionRow}>
            {/* Heart (follow/unfollow) */}
            <TouchableOpacity
              hitSlop={8}
              onPress={() => handleFollow(item)}
              disabled={actionLoading === item.id}
            >
              <Ionicons
                name={item.isFollowing ? 'heart' : 'heart-outline'}
                size={22}
                color={item.isFollowing ? '#FF3B6B' : '#999'}
              />
            </TouchableOpacity>
            {/* Checkmark (special attention) — only on Following tab */}
            {activeTab === 'Following' && item.isFollowing && (
              <TouchableOpacity
                hitSlop={8}
                onPress={() => handleSpecialAttention(item)}
                disabled={actionLoading === item.id}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={item.isSpecialAttention ? '#22C97A' : '#CCC'}
                />
              </TouchableOpacity>
            )}
          </View>
        ) : activeTab === 'Visitors' ? (
          <TouchableOpacity
            style={styles.addBtn}
            hitSlop={8}
            onPress={() => handleFollow(item)}
            disabled={actionLoading === item.id}
          >
            {item.isFollowing ? (
              <Ionicons name="checkmark" size={18} color={Colors.primary} />
            ) : (
              <Ionicons name="add" size={18} color={Colors.primary} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  const emptyMessage = () => {
    if (activeTab === 'Friends') return 'No friends yet.';
    if (activeTab === 'Following') {
      if (followingSubTab === 'Special Attention')
        return "You haven't added anyone to special attention.";
      return "You haven't followed yet, come to follow.";
    }
    if (activeTab === 'Followers') return 'No followers yet.';
    return 'No visitors yet.';
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{tabTitle()}</Text>
        <TouchableOpacity
          hitSlop={8}
          onPress={() => navigation.navigate('Search', {})}
        >
          <Ionicons name="search" size={22} color="#000" />
        </TouchableOpacity>
      </View>

      {/* Top tabs */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={styles.tab}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Following sub-tabs — pill switch (figma) */}
      {activeTab === 'Following' && isMe && (
        <View style={styles.subTabBarWrap}>
          <View style={styles.subTabBar}>
            {FOLLOWING_SUBTABS.map((sub) => {
              const isActive = followingSubTab === sub;
              return (
                <TouchableOpacity
                  key={sub}
                  style={[styles.subTab, isActive && styles.subTabActive]}
                  onPress={() => setFollowingSubTab(sub)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.subTabText,
                      isActive && styles.subTabTextActive,
                    ]}
                  >
                    {sub}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* List */}
      {loading ? (
        <ListRowSkeleton rows={6} />
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(u) => u.id}
          renderItem={renderUserRow}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={
            listData.length === 0
              ? styles.emptyContainer
              : { paddingBottom: insets.bottom + Spacing.lg }
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{emptyMessage()}</Text>
            </View>
          }
          ListFooterComponent={
            listData.length > 0 ? (
              <Text style={styles.noMoreData}>No more data</Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },

  // Top tabs — centered, no underline, purple active (figma)
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 30,
    paddingVertical: 14,
  },
  tab: {
    alignItems: 'center',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '400',
    color: '#000',
  },
  tabTextActive: {
    color: TAB_ACTIVE,
    fontWeight: '600',
  },

  // Following sub-tabs — pill switch (figma)
  subTabBarWrap: {
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  subTabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.1)',
    borderRadius: 40,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 22,
    width: 250,
  },
  subTab: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subTabActive: {
    backgroundColor: '#FFFFFF',
    borderColor: TAB_ACTIVE,
  },
  subTabText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#000',
  },
  subTabTextActive: {
    fontWeight: '600',
  },

  // User row (figma)
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 10,
    gap: 10,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  avatarFallback: {
    backgroundColor: '#E8E8E8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 22,
    fontWeight: '600',
    color: '#999',
  },
  userInfo: {
    flex: 1,
    gap: 3,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  levelPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  // Actions
  actionArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Empty / loading
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    alignItems: 'center',
    paddingTop: 60,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  noMoreData: {
    textAlign: 'center',
    color: '#CCC',
    fontSize: 12,
    paddingVertical: Spacing.xl,
  },
});
