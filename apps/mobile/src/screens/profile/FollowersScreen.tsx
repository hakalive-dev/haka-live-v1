import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackScreenProps, RootStackParamList } from '@navigation/types';
import { usersApi } from '@api/users';
import { useFollowersQuery } from '@hooks/queries/useProfileQueries';
import { Colors, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import { UserCard, FollowButton } from '@components/UserCard';
import type { PublicUser } from '@/types';

type Props = RootStackScreenProps<'Followers'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function FollowersScreen({ route, navigation }: Props) {
  const { userId, displayName } = route.params;
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const followersQuery = useFollowersQuery(userId);
  const [users, setUsers] = useState<PublicUser[]>(followersQuery.data?.items ?? []);
  useEffect(() => {
    if (followersQuery.data) setUsers(followersQuery.data.items);
  }, [followersQuery.data]);
  const loading = users.length === 0 && followersQuery.isLoading;
  const [followLoading, setFollowLoading] = useState<string | null>(null);

  const handleFollow = useCallback(async (user: PublicUser) => {
    const wasFollowing = user.isFollowing;
    setFollowLoading(user.id);
    setUsers((prev) =>
      prev.map((u) =>
        u.id === user.id
          ? { ...u, isFollowing: !wasFollowing, followerCount: u.followerCount + (wasFollowing ? -1 : 1) }
          : u,
      ),
    );
    try {
      if (wasFollowing) await usersApi.unfollow(user.id);
      else await usersApi.follow(user.id);
    } catch (e: any) {
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, isFollowing: wasFollowing, followerCount: u.followerCount + (wasFollowing ? 1 : -1) }
            : u,
        ),
      );
      Alert.alert('Error', e?.message || 'Failed to update follow');
    } finally {
      setFollowLoading(null);
    }
  }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{displayName}'s Followers</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ListRowSkeleton rows={8} />
      ) : users.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No followers yet.</Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(u) => u.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.lg }}
          renderItem={({ item }) => (
            <UserCard
              user={item}
              onPress={() => nav.navigate('PublicProfile', { userId: item.id })}
              trailing={
                <FollowButton
                  isFollowing={item.isFollowing ?? false}
                  onPress={() => handleFollow(item)}
                  loading={followLoading === item.id}
                />
              }
            />
          )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  headerSpacer: {
    width: 24,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: Colors.textSecondary,
    fontSize: 15,
  },
});
