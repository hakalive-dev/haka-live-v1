import React, { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackScreenProps, RootStackParamList } from '@navigation/types';
import { usersApi } from '@api/users';
import { useFollowingQuery } from '@hooks/queries/useProfileQueries';
import { Colors, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import { UserCard, FollowButton } from '@components/UserCard';
import type { PublicUser } from '@/types';

type Props = RootStackScreenProps<'Following'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function FollowingScreen({ route, navigation }: Props) {
  const { userId, displayName } = route.params;
  const insets = useSafeAreaInsets();
  const nav = useNavigation<Nav>();

  const followingQuery = useFollowingQuery(userId);
  const [users, setUsers] = useState<PublicUser[]>(followingQuery.data?.items ?? []);
  useEffect(() => {
    if (followingQuery.data) setUsers(followingQuery.data.items);
  }, [followingQuery.data]);
  const loading = users.length === 0 && followingQuery.isLoading;
  const [followLoading, setFollowLoading] = useState<string | null>(null);

  const handleUnfollow = useCallback(async (user: PublicUser) => {
    setFollowLoading(user.id);
    const snapshot = users;
    setUsers((prev) => prev.filter((u) => u.id !== user.id));
    try {
      await usersApi.unfollow(user.id);
    } catch (e: any) {
      setUsers(snapshot);
      Alert.alert('Error', e?.message || 'Failed to unfollow');
    } finally {
      setFollowLoading(null);
    }
  }, [users]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>{displayName} is Following</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <ListRowSkeleton rows={8} />
      ) : users.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>Not following anyone yet.</Text>
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
                  onPress={() => handleUnfollow(item)}
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
