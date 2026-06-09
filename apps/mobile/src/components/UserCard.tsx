import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/theme';
import type { PublicUser } from '@/types';
import { UserAvatar } from './UserAvatar';

export { UserAvatar };

interface UserCardProps {
  user: PublicUser;
  onPress?: () => void;
  trailing?: React.ReactNode;
}

export function UserCard({ user, onPress, trailing }: UserCardProps) {
  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <UserAvatar user={user} size={48} />

      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.displayName} numberOfLines={1}>
            {user.displayName}
          </Text>
          {(user as any).isVerified && (
            <Ionicons name="checkmark-circle" size={14} color={Colors.info} />
          )}
          {user.role !== 'normal_user' && (
            <View style={styles.roleBadge}>
              <Text style={styles.roleBadgeText}>
                {user.role === 'host' ? 'HOST' : 'AGENT'}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.username} numberOfLines={1}>
          @{user.username}
        </Text>
      </View>

      {trailing}
    </TouchableOpacity>
  );
}

interface FollowButtonProps {
  isFollowing: boolean;
  onPress: () => void;
  loading?: boolean;
}

export function FollowButton({ isFollowing, onPress, loading }: FollowButtonProps) {
  return (
    <TouchableOpacity
      style={[styles.followBtn, isFollowing && styles.followingBtn]}
      onPress={onPress}
      disabled={loading}
      hitSlop={8}
    >
      <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
        {isFollowing ? 'Following' : 'Follow'}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  info: {
    flex: 1,
    gap: 3,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  displayName: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
  },
  username: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  roleBadge: {
    backgroundColor: Colors.primarySubtle,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: Radius.full,
  },
  roleBadgeText: {
    color: Colors.primaryLight,
    fontSize: 9,
    fontWeight: '700',
  },
  followBtn: {
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    height: 30,
    borderRadius: Radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followingBtn: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  followBtnText: {
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  followingBtnText: {
    color: '#FFFFFF',
  },
});
