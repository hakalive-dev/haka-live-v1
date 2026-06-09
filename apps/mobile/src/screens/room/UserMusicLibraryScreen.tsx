import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import { musicApi } from '@api/music';
import { roomsApi } from '@api/rooms';
import { pingBackend } from '@api/client';
import { useToast } from '@components/Toast';
import type { RoomStackScreenProps } from '@/navigation/types';
import type { CurrentMusicTrack, UserMusicTrack } from '@/types';
import { bootstrapRoomMusicFromLibrary, toCurrentMusicTrack } from '@/utils/roomMusicBootstrap';

const vinylIcon = (() => {
  try {
    return require('../../../assets/room-play/vinyl_record.png');
  } catch {
    return null;
  }
})();

const BG = '#1A1530';
const PURPLE = '#7B4FFF';
const BORDER = 'rgba(255,255,255,0.08)';
const INPUT_BG = 'rgba(255,255,255,0.06)';

type Props = RoomStackScreenProps<'UserMusicLibrary'>;

function AddPill({
  onPress,
  disabled,
  loading,
}: {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[styles.addPill, (disabled || loading) && styles.addPillDisabled]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <Text style={styles.addPillText}>Add</Text>
      )}
    </TouchableOpacity>
  );
}

type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
};

export function UserMusicLibraryScreen({ route, navigation }: Props) {
  const { roomId, onTrackPlayed } = route.params;
  const toast = useToast();

  const [tracks, setTracks] = useState<UserMusicTrack[]>([]);
  const [queuedUrls, setQueuedUrls] = useState<Set<string>>(new Set());
  const [queueLength, setQueueLength] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const bootstrapAttemptedRef = useRef(false);

  const refreshQueueMeta = useCallback(async () => {
    try {
      const queue = await roomsApi.getMusicQueue(roomId);
      setQueuedUrls(new Set(queue.tracks.map((t) => t.url)));
      setQueueLength(queue.tracks.length);
      return queue;
    } catch {
      setQueuedUrls(new Set());
      setQueueLength(0);
      return null;
    }
  }, [roomId]);

  const loadLibrary = useCallback(async (q?: string) => {
    try {
      const result = await musicApi.getLibrary(q);
      setTracks(result.tracks);
      await refreshQueueMeta();
      return result.tracks;
    } catch {
      setTracks([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [refreshQueueMeta]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  useFocusEffect(
    useCallback(() => {
      if (bootstrapAttemptedRef.current) return;
      bootstrapAttemptedRef.current = true;

      let cancelled = false;
      (async () => {
        const queue = await refreshQueueMeta();
        if (cancelled || (queue?.tracks.length ?? 0) > 0) return;
        const lib = await musicApi.getLibrary();
        if (cancelled || lib.tracks.length === 0) return;
        try {
          const boot = await bootstrapRoomMusicFromLibrary(roomId);
          if (cancelled || !boot?.played) return;
          onTrackPlayed?.(boot.played);
          navigation.goBack();
        } catch {
          /* user can pick manually */
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [navigation, onTrackPlayed, refreshQueueMeta, roomId]),
  );

  const handleSearch = useCallback(
    (text: string) => {
      setSearch(text);
      setLoading(true);
      loadLibrary(text.trim() || undefined);
    },
    [loadLibrary],
  );

  const enqueueTrack = useCallback(
    async (track: UserMusicTrack) => {
      if (busyId || uploading || queuedUrls.has(track.url)) {
        if (queuedUrls.has(track.url)) {
          toast.show('Already in the room queue', 'success');
        }
        return;
      }
      setBusyId(track.id);
      try {
        const queue = await refreshQueueMeta();
        const playNow = (queue?.tracks.length ?? queueLength) === 0;
        const { track: queued, queue: updatedQueue } = await roomsApi.addMusicFromLibrary(
          roomId,
          track.id,
          { playNow },
        );
        setQueuedUrls(new Set(updatedQueue.tracks.map((t) => t.url)));
        setQueueLength(updatedQueue.tracks.length);

        if (playNow) {
          const played = toCurrentMusicTrack(queued, updatedQueue);
          onTrackPlayed?.(played);
          navigation.goBack();
          toast.show(`Now playing "${track.name}"`, 'success');
        } else {
          toast.show(`"${track.name}" added to queue`, 'success');
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Failed to add track';
        Alert.alert('Error', msg);
      } finally {
        setBusyId(null);
      }
    },
    [busyId, navigation, onTrackPlayed, queueLength, queuedUrls, refreshQueueMeta, roomId, toast, uploading],
  );

  const handleDelete = useCallback(
    async (track: UserMusicTrack) => {
      Alert.alert('Remove from library', `Remove "${track.name}" from your library?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await musicApi.deleteFromLibrary(track.id);
              setTracks((prev) => prev.filter((t) => t.id !== track.id));
              toast.show('Track removed', 'success');
            } catch {
              toast.show('Failed to remove track', 'error');
            }
          },
        },
      ]);
    },
    [toast],
  );

  const uploadAndEnqueue = useCallback(
    async (file: PickedFile) => {
      setUploading(true);
      try {
        pingBackend();
        const { track: libraryTrack } = await musicApi.uploadToLibrary(
          file.uri,
          file.mimeType,
          file.name,
        );
        setTracks((prev) => {
          if (prev.some((t) => t.id === libraryTrack.id)) return prev;
          return [libraryTrack, ...prev];
        });

        const queue = await refreshQueueMeta();
        const playNow = (queue?.tracks.length ?? queueLength) === 0;
        const { track: queued, queue: updatedQueue } = await roomsApi.addMusicFromLibrary(
          roomId,
          libraryTrack.id,
          { playNow },
        );
        setQueuedUrls(new Set(updatedQueue.tracks.map((t) => t.url)));
        setQueueLength(updatedQueue.tracks.length);

        if (playNow) {
          const played = toCurrentMusicTrack(queued, updatedQueue);
          onTrackPlayed?.(played);
          navigation.goBack();
          toast.show(`Now playing "${libraryTrack.name}"`, 'success');
        } else {
          toast.show(`"${libraryTrack.name}" added to library and queue`, 'success');
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Upload failed';
        Alert.alert('Error', msg);
      } finally {
        setUploading(false);
      }
    },
    [navigation, onTrackPlayed, queueLength, refreshQueueMeta, roomId, toast],
  );

  const pickFromPhone = useCallback(async () => {
    if (uploading || busyId) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
        multiple: Platform.OS === 'android',
      });
      if (result.canceled || !result.assets?.length) return;
      for (const asset of result.assets) {
        await uploadAndEnqueue({
          uri: asset.uri,
          name: asset.name ?? 'Unknown',
          mimeType: asset.mimeType ?? 'audio/mpeg',
        });
      }
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not open file picker');
    }
  }, [busyId, uploadAndEnqueue, uploading]);

  const renderItem = useCallback(
    ({ item }: { item: UserMusicTrack }) => {
      const inQueue = queuedUrls.has(item.url);
      const isBusy = busyId === item.id;
      return (
        <View style={styles.row}>
          <TouchableOpacity
            style={styles.rowInfo}
            onLongPress={() => handleDelete(item)}
            activeOpacity={1}
            disabled={isBusy || uploading}
          >
            <Text style={styles.trackName} numberOfLines={1}>
              {item.name}
            </Text>
          </TouchableOpacity>
          <AddPill
            onPress={() => void enqueueTrack(item)}
            disabled={inQueue}
            loading={isBusy}
          />
        </View>
      );
    },
    [busyId, enqueueTrack, handleDelete, queuedUrls, uploading],
  );

  const showEmpty = !loading && tracks.length === 0;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Add Music</Text>
        <TouchableOpacity
          onPress={() => void pickFromPhone()}
          style={styles.headerAddBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={busyId !== null || uploading}
        >
          <Text style={styles.headerAddText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {!showEmpty && (
        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color="rgba(255,255,255,0.45)" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search Music"
            placeholderTextColor="rgba(255,255,255,0.35)"
            value={search}
            onChangeText={handleSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <Ionicons name="close" size={16} color="rgba(255,255,255,0.45)" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {loading ? (
        <ActivityIndicator style={styles.loader} color={PURPLE} />
      ) : showEmpty ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyContent}>
            {vinylIcon ? (
              <Image source={vinylIcon} style={styles.vinyl} contentFit="contain" />
            ) : (
              <Ionicons name="disc" size={120} color={PURPLE} style={styles.vinylFallback} />
            )}
            <Text style={styles.emptyTitle}>You have no music now</Text>
            <Text style={styles.emptyHint}>Use + Add above to upload audio</Text>
          </View>
        </View>
      ) : (
        <>
          <Text style={styles.totalLabel}>Total {tracks.length} songs</Text>
          <FlatList
            data={tracks}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            contentContainerStyle={styles.listContent}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAddBtn: {
    width: 56,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  headerAddText: { fontSize: 15, fontWeight: '600', color: PURPLE },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: INPUT_BG,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: BORDER,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 14 },
  totalLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowInfo: { flex: 1, marginRight: 12 },
  trackName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  addPill: {
    backgroundColor: PURPLE,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPillDisabled: { opacity: 0.45 },
  addPillText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginLeft: 16 },
  listContent: { paddingBottom: 24 },
  loader: { marginTop: 40 },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  emptyContent: {
    alignItems: 'center',
    width: '100%',
  },
  vinyl: {
    width: 200,
    height: 200,
    marginBottom: 32,
  },
  vinylFallback: {
    marginBottom: 32,
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyHint: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 13,
    textAlign: 'center',
  },
});
