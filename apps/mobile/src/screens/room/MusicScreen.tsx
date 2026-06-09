import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';
import { musicApi } from '@api/music';
import { roomsApi } from '@api/rooms';
import { pingBackend } from '@api/client';
import { useToast } from '@components/Toast';
import type { RoomStackScreenProps } from '@/navigation/types';
import type { UserMusicTrack } from '@/types';
import { bootstrapRoomMusicFromLibrary } from '@/utils/roomMusicBootstrap';

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

type Props = RoomStackScreenProps<'RoomMusic'>;

type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
};

type ListItem =
  | { kind: 'library'; track: UserMusicTrack }
  | { kind: 'pending'; file: PickedFile };

function formatFileMeta(file: PickedFile): string {
  const sizeLabel = file.size ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : '';
  return sizeLabel ? `<unknown> | ${sizeLabel}` : '<unknown>';
}

function AddPill({
  label = 'Add',
  onPress,
  disabled,
  loading,
  large,
}: {
  label?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  large?: boolean;
}) {
  return (
    <TouchableOpacity
      style={[
        large ? styles.addPillLarge : styles.addPill,
        (disabled || loading) && styles.addPillDisabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <Text style={[styles.addPillText, large && styles.addPillTextLarge]}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

export function MusicScreen({ route, navigation }: Props) {
  const { roomId, isHost: canManageMusic } = route.params;
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const [libraryTracks, setLibraryTracks] = useState<UserMusicTrack[]>([]);
  const [pendingFiles, setPendingFiles] = useState<PickedFile[]>([]);
  const [queuedUrls, setQueuedUrls] = useState<Set<string>>(new Set());
  const [queueLength, setQueueLength] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);

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

  const loadLibrary = useCallback(async () => {
    try {
      const result = await musicApi.getLibrary();
      setLibraryTracks(result.tracks);
      await refreshQueueMeta();
      return result.tracks;
    } catch {
      setLibraryTracks([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [refreshQueueMeta]);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  useEffect(() => {
    if (!canManageMusic || loading || bootstrapped) return;
    if (queueLength > 0) {
      setBootstrapped(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const boot = await bootstrapRoomMusicFromLibrary(roomId);
        if (cancelled || !boot?.played) return;
        navigation.goBack();
        toast.show(`Now playing "${boot.played.name}"`, 'success');
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapped, canManageMusic, loading, navigation, queueLength, roomId, toast]);

  const listItems = useMemo<ListItem[]>(
    () => [
      ...pendingFiles.map((file) => ({ kind: 'pending' as const, file })),
      ...libraryTracks.map((track) => ({ kind: 'library' as const, track })),
    ],
    [libraryTracks, pendingFiles],
  );

  const showEmpty = !loading && listItems.length === 0;

  const handlePickFromPhone = useCallback(async () => {
    if (!canManageMusic) {
      toast.show('Only the room owner or admin can manage music.', 'error');
      return;
    }
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        copyToCacheDirectory: true,
        multiple: Platform.OS === 'android',
      });
      if (result.canceled || !result.assets?.length) return;
      const newFiles: PickedFile[] = result.assets.map((a) => ({
        uri: a.uri,
        name: a.name ?? 'Unknown',
        mimeType: a.mimeType ?? 'audio/mpeg',
        size: a.size,
      }));
      setPendingFiles((prev) => {
        const existing = new Set(prev.map((f) => f.uri));
        return [...prev, ...newFiles.filter((f) => !existing.has(f.uri))];
      });
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Could not open file picker');
    }
  }, [canManageMusic, toast]);

  const addToRoom = useCallback(
    async (libraryTrackId: string, trackName: string) => {
      const queue = await refreshQueueMeta();
      const playNow = (queue?.tracks.length ?? queueLength) === 0;
      const { track: queued, queue: updatedQueue } = await roomsApi.addMusicFromLibrary(
        roomId,
        libraryTrackId,
        { playNow },
      );
      setQueuedUrls(new Set(updatedQueue.tracks.map((t) => t.url)));
      setQueueLength(updatedQueue.tracks.length);

      if (playNow) {
        navigation.goBack();
        toast.show(`Now playing "${queued.name}"`, 'success');
      } else {
        toast.show(`"${trackName}" added to queue`, 'success');
      }
    },
    [navigation, queueLength, refreshQueueMeta, roomId, toast],
  );

  const handleAddLibrary = useCallback(
    async (track: UserMusicTrack) => {
      if (!canManageMusic || busyKey) return;
      if (queuedUrls.has(track.url)) {
        toast.show('Already in the room queue', 'success');
        return;
      }
      setBusyKey(track.id);
      try {
        await addToRoom(track.id, track.name);
      } catch (e: unknown) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Could not add track');
      } finally {
        setBusyKey(null);
      }
    },
    [addToRoom, busyKey, canManageMusic, queuedUrls, toast],
  );

  const handleAddPending = useCallback(
    async (file: PickedFile) => {
      if (!canManageMusic || busyKey) return;
      setBusyKey(file.uri);
      try {
        pingBackend();
        const { track: libraryTrack } = await musicApi.uploadToLibrary(
          file.uri,
          file.mimeType,
          file.name,
        );
        setLibraryTracks((prev) => {
          if (prev.some((t) => t.id === libraryTrack.id)) return prev;
          return [libraryTrack, ...prev];
        });
        setPendingFiles((prev) => prev.filter((f) => f.uri !== file.uri));
        await addToRoom(libraryTrack.id, libraryTrack.name);
      } catch (e: unknown) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Could not add track');
      } finally {
        setBusyKey(null);
      }
    },
    [addToRoom, busyKey, canManageMusic],
  );

  const renderItem = useCallback(
    ({ item }: { item: ListItem }) => {
      const isPending = item.kind === 'pending';
      const key = isPending ? item.file.uri : item.track.id;
      const isBusy = busyKey === key;
      const title = isPending ? item.file.name : item.track.name;
      const inQueue = !isPending && queuedUrls.has(item.track.url);
      const meta = isPending ? formatFileMeta(item.file) : '<unknown>';

      if (isPending) {
        return (
          <View style={styles.trackRow}>
            <View style={styles.trackInfo}>
              <Text style={styles.trackName} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.trackMeta}>{meta}</Text>
            </View>
            <AddPill
              onPress={() => void handleAddPending(item.file)}
              disabled={!canManageMusic}
              loading={isBusy}
            />
          </View>
        );
      }

      return (
        <View style={styles.trackRow}>
          <View style={styles.trackInfo}>
            <Text style={styles.trackName} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.trackMeta}>{meta}</Text>
          </View>
          <AddPill
            onPress={() => void handleAddLibrary(item.track)}
            disabled={inQueue || !canManageMusic}
            loading={isBusy}
          />
        </View>
      );
    },
    [busyKey, canManageMusic, handleAddLibrary, handleAddPending, queuedUrls],
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Add Music</Text>
      {canManageMusic ? (
        <TouchableOpacity
          onPress={() => void handlePickFromPhone()}
          style={styles.headerAddBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={busyKey !== null}
        >
          <Text style={styles.headerAddText}>+ Add</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.headerAddBtn} />
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        {renderHeader()}
        <View style={styles.center}>
          <ActivityIndicator color={PURPLE} size="large" />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {renderHeader()}

      {!canManageMusic && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Only the room owner or admin can manage music.</Text>
        </View>
      )}

      {showEmpty ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyContent}>
            {vinylIcon ? (
              <Image source={vinylIcon} style={styles.vinyl} contentFit="contain" />
            ) : (
              <Ionicons name="disc" size={120} color={PURPLE} style={styles.vinylFallback} />
            )}
            <Text style={styles.emptyTitle}>You have no music now</Text>
            {canManageMusic && (
              <Text style={styles.emptyHint}>Use + Add above to upload audio</Text>
            )}
          </View>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item) => (item.kind === 'pending' ? item.file.uri : item.track.id)}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
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
  headerTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  notice: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  noticeText: { color: 'rgba(255,255,255,0.72)', fontSize: 12, textAlign: 'center' },
  addPill: {
    backgroundColor: PURPLE,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
    minWidth: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPillLarge: {
    backgroundColor: PURPLE,
    borderRadius: 28,
    paddingVertical: 14,
    paddingHorizontal: 28,
    minWidth: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPillDisabled: { opacity: 0.45 },
  addPillText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  addPillTextLarge: { fontSize: 15, fontWeight: '700' },
  listContent: { paddingBottom: 24 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER, marginLeft: 16 },
  trackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  trackInfo: { flex: 1, marginRight: 12 },
  trackName: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  trackMeta: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 },
});
