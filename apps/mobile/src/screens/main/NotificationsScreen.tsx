import React, { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useStaleFocusReload } from '@hooks/useStaleFocusReload';
import { invalidateChatUnreadQueries } from '@hooks/useDMConnection';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { notificationsApi } from '@api/notifications';
import { Colors, Radius, Spacing } from '@/theme';
import { NotificationSkeleton } from '@components/Skeleton';
import type { AppNotification } from '@/types';
import { HAKA_TEAM_USER_ID } from '@/constants/haka-team';
import {
  WITHDRAWAL_MESSAGE_DISPLAY_NAME,
  WITHDRAWAL_MESSAGE_USER_ID,
} from '@/constants/withdrawal-message';
import { promptIncomingVideoCallFromPush } from '@/utils/incomingVideoCall';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '@navigation/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function iconForType(type: string): React.ComponentProps<typeof Ionicons>['name'] {
  switch (type) {
    case 'gift':
    case 'moment_gift':
      return 'gift-outline';
    case 'moment_like':
      return 'heart-outline';
    case 'moment_comment':
      return 'chatbubble-outline';
    case 'moment_share':
      return 'arrow-redo-outline';
    case 'follow':
      return 'person-add-outline';
    case 'room':
    case 'video_call':
      return 'videocam-outline';
    case 'voice_call':
      return 'call-outline';
    case 'chat':
    case 'dm':
      return 'chatbubble-outline';
    case 'seller_recharge_approved':
    case 'coin_transfer':
    case 'withdrawal_assigned':
    case 'payroll_agent_promoted':
      return 'wallet-outline';
    case 'support_reply':
    case 'face_verification_approved':
    case 'face_verification_rejected':
    case 'withdrawal_update':
      return 'chatbubble-outline';
    default:
      return 'notifications-outline';
  }
}

function openNotificationTarget(
  navigation: NativeStackNavigationProp<RootStackParamList>,
  item: AppNotification,
) {
  const data = (item.data ?? {}) as Record<string, string | undefined>;
  const type = item.type ?? data.type;

  if (type === 'withdrawal_update' || data.open === 'withdrawal_message_dm') {
    navigation.navigate('DMConversation', {
      userId: data.senderId ?? WITHDRAWAL_MESSAGE_USER_ID,
      displayName: WITHDRAWAL_MESSAGE_DISPLAY_NAME,
    });
    return;
  }

  if (
    type === 'seller_recharge_approved' ||
    type === 'coin_transfer' ||
    type === 'support_reply' ||
    type === 'dm' ||
    data.open === 'haka_team_dm'
  ) {
    navigation.navigate('DMConversation', {
      userId: data.senderId ?? HAKA_TEAM_USER_ID,
      displayName: 'Haka Team',
    });
    return;
  }

  if ((type === 'video_call' || type === 'voice_call') && data.callerId) {
    const callType = data.callType === 'voice' || type === 'voice_call' ? 'voice' : 'video';
    promptIncomingVideoCallFromPush(
      data.callerId,
      data.callerDisplayName ?? 'Someone',
      callType,
    );
    return;
  }

  if (
    type === 'withdrawal_assigned' ||
    type === 'payroll_agent_promoted' ||
    data.open === 'payroll'
  ) {
    navigation.navigate('Payroll');
    return;
  }

  if (
    type === 'moment_like' ||
    type === 'moment_comment' ||
    type === 'moment_share' ||
    type === 'moment_gift' ||
    data.open === 'actor_profile'
  ) {
    if (data.actorId) {
      navigation.navigate('PublicProfile', { userId: data.actorId });
    }
  }
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── NotificationItem ──────────────────────────────────────────────────────────

function NotificationItem({
  item,
  onPress,
}: {
  item: AppNotification;
  onPress: (id: string) => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.item, !item.isRead && styles.itemUnread]}
      onPress={() => onPress(item.id)}
      activeOpacity={0.7}
    >
      <View style={[styles.iconWrap, !item.isRead && styles.iconWrapUnread]}>
        <Ionicons
          name={iconForType(item.type)}
          size={20}
          color={item.isRead ? Colors.textSecondary : Colors.primary}
        />
      </View>
      <View style={styles.itemBody}>
        <Text style={styles.itemTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.itemDesc} numberOfLines={2}>{item.body}</Text>
        <Text style={styles.itemTime}>{timeAgo(item.createdAt)}</Text>
      </View>
      {!item.isRead && <View style={styles.dot} />}
    </TouchableOpacity>
  );
}

// ── NotificationsScreen ───────────────────────────────────────────────────────

export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();

  const [items, setItems]           = useState<AppNotification[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [page, setPage]             = useState(1);
  const [hasMore, setHasMore]       = useState(false);

  const load = useCallback(async (p = 1, replace = true): Promise<boolean> => {
    try {
      if (replace) setLoading(true);
      setError(null);
      const res = await notificationsApi.getAll(p);
      setItems((prev) => (replace ? res.items : [...prev, ...res.items]));
      setPage(p);
      setHasMore(res.hasMore);
      return replace;
    } catch {
      setError('Failed to load notifications');
      return false;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const { reload: focusReload, markLoaded } = useStaleFocusReload(
    async (force) => {
      if (await load(1, true)) markLoaded();
    },
    {
      staleMs: 30_000,
      onStaleSkip: () => setLoading(false),
      onReloadStart: () => setLoading(true),
    },
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void focusReload(true);
  }, [focusReload]);

  const onEndReached = useCallback(() => {
    if (hasMore && !loading) load(page + 1, false);
  }, [hasMore, loading, page, load]);

  const markRead = useCallback(
    async (id: string) => {
      const item = items.find((n) => n.id === id);
      if (!item) return;
      try {
        if (!item.isRead) {
          const updated = await notificationsApi.markRead(id);
          setItems((prev) => prev.map((n) => (n.id === id ? updated : n)));
          invalidateChatUnreadQueries(queryClient);
        }
        openNotificationTarget(navigation, item);
      } catch {
        // silent — don't interrupt UX for a read-status update
      }
    },
    [items, navigation, queryClient],
  );

  const markAllRead = useCallback(async () => {
    try {
      await notificationsApi.markAllRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      invalidateChatUnreadQueries(queryClient);
    } catch {
      Alert.alert('Error', 'Could not mark all as read');
    }
  }, [queryClient]);

  const hasUnread = items.some((n) => !n.isRead);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        {hasUnread ? (
          <TouchableOpacity onPress={markAllRead} hitSlop={8}>
            <Text style={styles.markAll}>Mark all read</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 80 }} />
        )}
      </View>

      {loading && items.length === 0 ? (
        <NotificationSkeleton rows={6} />
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load(1)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <NotificationItem item={item} onPress={markRead} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={Colors.primary}
            />
          }
          onEndReached={onEndReached}
          onEndReachedThreshold={0.3}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="notifications-off-outline" size={48} color={Colors.textTertiary} />
              <Text style={styles.emptyText}>No notifications yet</Text>
            </View>
          }
          contentContainerStyle={
            items.length === 0
              ? styles.emptyContainer
              : { paddingBottom: insets.bottom + Spacing.lg }
          }
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  markAll: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.primary,
    width: 80,
    textAlign: 'right',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyText: {
    fontSize: 15,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
  },
  errorText: {
    fontSize: 14,
    color: Colors.danger,
    marginTop: Spacing.xs,
  },
  retryBtn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
  },
  retryText: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.md,
  },
  itemUnread: {
    backgroundColor: Colors.primarySubtle,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapUnread: {
    backgroundColor: Colors.primarySubtle,
  },
  itemBody: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  itemDesc: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  itemTime: {
    fontSize: 11,
    color: Colors.textTertiary,
    marginTop: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
  },
});
