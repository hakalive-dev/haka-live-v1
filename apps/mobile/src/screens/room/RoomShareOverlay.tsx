import React, { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Linking,
  Modal,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useSelector } from 'react-redux';

import { usersApi } from '@api/users';
import { Colors, Radius, Spacing } from '@/theme';
import { ListRowSkeleton } from '@components/Skeleton';
import { UserAvatar } from '@components/UserAvatar';
import type { RootState } from '@store/index';
import type { PublicUser } from '@/types';
import { useToast } from '@components/Toast';

interface Props {
  visible: boolean;
  onClose: () => void;
  roomId: string;
  roomTitle?: string;
}

function getRoomLink(roomId: string) {
  return `https://haka.live/room/${roomId}`;
}

const SOCIAL = [
  {
    key: 'copy',
    label: 'Copy link',
    bg: '#7B4FFF',
    icon: 'link' as const,
  },
  {
    key: 'whatsapp',
    label: 'WhatsApp',
    bg: '#25D366',
    icon: 'logo-whatsapp' as const,
  },
  {
    key: 'facebook',
    label: 'Facebook',
    bg: '#1877F2',
    icon: 'logo-facebook' as const,
  },
  {
    key: 'twitter',
    label: 'X',
    bg: '#000000',
    icon: 'logo-twitter' as const,
  },
];

export function RoomShareOverlay({ visible, onClose, roomId, roomTitle }: Props) {
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [shared, setShared] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (visible && currentUser?.id) {
      usersApi.following(currentUser.id).then((res) => {
        setFriends(res.items);
      }).catch(() => {});
    }
    if (!visible) {
      setQuery('');
      setResults([]);
      setShared(new Set());
    }
  }, [visible, currentUser?.id]);

  const handleSearch = useCallback(async (text: string) => {
    setQuery(text);
    if (text.length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const data = await usersApi.search(text);
      setResults(data.items);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleShareToUser = useCallback(async (user: PublicUser) => {
    const link = getRoomLink(roomId);
    const message = roomTitle
      ? `Join me in "${roomTitle}" on Haka Live! ${link}`
      : `Join my room on Haka Live! ${link}`;
    try {
      await Share.share({ message });
      setShared((prev) => new Set(prev).add(user.id));
    } catch { /* user cancelled */ }
  }, [roomId, roomTitle]);

  const handleSocial = useCallback(async (key: string) => {
    const link = getRoomLink(roomId);
    const text = roomTitle
      ? `Join me in "${roomTitle}" on Haka Live! ${link}`
      : `Join my room on Haka Live! ${link}`;

    if (key === 'copy') {
      await Clipboard.setStringAsync(link);
      toast.show('Link copied!', 'success');
      return;
    }
    if (key === 'whatsapp') {
      Linking.openURL(`whatsapp://send?text=${encodeURIComponent(text)}`).catch(() =>
        toast.show('WhatsApp is not installed', 'error'),
      );
      return;
    }
    if (key === 'facebook') {
      Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`);
      return;
    }
    if (key === 'twitter') {
      Linking.openURL(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`);
      return;
    }
  }, [roomId, roomTitle, toast]);

  const displayList = query.length >= 2 ? results : friends;

  const renderUser = useCallback(({ item }: { item: PublicUser }) => {
    const alreadyShared = shared.has(item.id);
    return (
      <View style={styles.userRow}>
        <UserAvatar
          user={{
            displayName: item.displayName,
            avatar: item.avatar,
            equippedFrame: item.equippedFrame ?? null,
          }}
          size={44}
        />
        <Text style={styles.userName} numberOfLines={1}>
          {item.displayName || item.username}
        </Text>
        <TouchableOpacity
          style={[styles.shareBtn, alreadyShared && styles.shareBtnDone]}
          onPress={() => handleShareToUser(item)}
          disabled={alreadyShared}
        >
          <Text style={styles.shareBtnText}>{alreadyShared ? 'Shared' : 'Share'}</Text>
        </TouchableOpacity>
      </View>
    );
  }, [handleShareToUser, shared]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={[styles.panel, { paddingBottom: insets.bottom + Spacing.xxl }]}>
          <View style={styles.handle} />

          {/* Header row */}
          <View style={styles.header}>
            <Text style={styles.title}>Share to</Text>
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={15} color="#8E8E93" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search User ID"
                placeholderTextColor="#8E8E93"
                value={query}
                onChangeText={handleSearch}
                returnKeyType="search"
                autoCorrect={false}
              />
              {query.length > 0 && (
                <TouchableOpacity onPress={() => handleSearch('')}>
                  <Ionicons name="close-circle" size={15} color="#8E8E93" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* User list */}
          {loading ? (
            <ListRowSkeleton rows={5} />
          ) : (
            <FlatList
              data={displayList}
              keyExtractor={(item) => item.id}
              renderItem={renderUser}
              style={styles.list}
              ListEmptyComponent={
                <Text style={styles.emptyText}>
                  {query.length >= 2 ? 'No users found' : 'No friends yet'}
                </Text>
              }
            />
          )}

          {/* Social share row */}
          <View style={styles.socialDivider} />
          <View style={styles.socialRow}>
            {SOCIAL.map((s) => (
              <TouchableOpacity
                key={s.key}
                style={styles.socialItem}
                onPress={() => handleSocial(s.key)}
              >
                <View style={[styles.socialCircle, { backgroundColor: s.bg }]}>
                  <Ionicons name={s.icon} size={26} color="#FFFFFF" />
                </View>
                <Text style={styles.socialLabel}>{s.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    maxHeight: '80%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E5EA',
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0B0B14',
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    height: 36,
    maxWidth: 200,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0B0B14',
    marginLeft: 6,
  },
  list: {
    flexGrow: 0,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  userName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#0B0B14',
  },
  shareBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: 7,
    minWidth: 80,
    alignItems: 'center',
  },
  shareBtnDone: {
    backgroundColor: '#C7C7CC',
  },
  shareBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  emptyText: {
    fontSize: 14,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
  socialDivider: {
    height: 1,
    backgroundColor: Colors.primary,
    marginVertical: Spacing.md,
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingBottom: Spacing.sm,
  },
  socialItem: {
    alignItems: 'center',
    gap: Spacing.xs,
  },
  socialCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialLabel: {
    fontSize: 12,
    color: '#0B0B14',
    textAlign: 'center',
    marginTop: 4,
  },
});
