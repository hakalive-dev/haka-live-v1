import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { musicApi } from '@api/music';
import { roomsApi } from '@api/rooms';
import { pingBackend } from '@api/client';
import { useToast } from '@components/Toast';
import type { RoomStackScreenProps } from '@/navigation/types';
import { toCurrentMusicTrack } from '@/utils/roomMusicBootstrap';

const BG = '#1A1530';
const PURPLE = '#7B4FFF';
const BORDER = 'rgba(255,255,255,0.08)';

type Props = RoomStackScreenProps<'AddMusic'>;

type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
  size?: number;
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMessage?: string;
};

export function AddMusicScreen({ route, navigation }: Props) {
  const { roomId, onAdded, onTrackPlayed } = route.params;
  const toast = useToast();

  const [files, setFiles] = useState<PickedFile[]>([]);
  const [queueLength, setQueueLength] = useState(0);
  const [processing, setProcessing] = useState(false);

  const refreshQueueLength = useCallback(async () => {
    try {
      const queue = await roomsApi.getMusicQueue(roomId);
      setQueueLength(queue.tracks.length);
      return queue.tracks.length;
    } catch {
      setQueueLength(0);
      return 0;
    }
  }, [roomId]);

  const processFile = useCallback(
    async (file: PickedFile) => {
      setFiles((prev) =>
        prev.map((f) => (f.uri === file.uri ? { ...f, status: 'uploading' as const } : f)),
      );
      try {
        pingBackend();
        const { track: libraryTrack } = await musicApi.uploadToLibrary(
          file.uri,
          file.mimeType,
          file.name,
        );
        const len = await refreshQueueLength();
        const playNow = len === 0;
        const { track: queued, queue: updatedQueue } = await roomsApi.addMusicFromLibrary(
          roomId,
          libraryTrack.id,
          { playNow },
        );
        setQueueLength(updatedQueue.tracks.length);
        onAdded?.();

        setFiles((prev) =>
          prev.map((f) => (f.uri === file.uri ? { ...f, status: 'done' as const } : f)),
        );

        if (playNow) {
          const played = toCurrentMusicTrack(queued, updatedQueue);
          onTrackPlayed?.(played);
          navigation.goBack();
          toast.show(`Now playing "${libraryTrack.name}"`, 'success');
        } else {
          toast.show(`"${file.name}" added to library and queue`, 'success');
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : 'Upload failed';
        setFiles((prev) =>
          prev.map((f) =>
            f.uri === file.uri ? { ...f, status: 'error' as const, errorMessage: msg } : f,
          ),
        );
        toast.show(msg, 'error');
      }
    },
    [navigation, onAdded, onTrackPlayed, refreshQueueLength, roomId, toast],
  );

  const pickAndProcess = useCallback(async () => {
    if (processing) return;
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'audio/*',
        multiple: true,
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const picked: PickedFile[] = result.assets.map((a) => ({
        uri: a.uri,
        name: a.name ?? 'Unknown',
        mimeType: a.mimeType ?? 'audio/mpeg',
        size: a.size,
        status: 'pending' as const,
      }));
      setFiles((prev) => {
        const existing = new Set(prev.map((f) => f.uri));
        return [...prev, ...picked.filter((p) => !existing.has(p.uri))];
      });

      setProcessing(true);
      for (const file of picked) {
        await processFile(file);
      }
    } catch {
      toast.show('Could not pick files', 'error');
    } finally {
      setProcessing(false);
    }
  }, [processFile, processing, toast]);

  const renderItem = useCallback(({ item }: { item: PickedFile }) => {
    const sizeLabel = item.size ? `${(item.size / 1024 / 1024).toFixed(1)} MB` : '';
    const isUploading = item.status === 'uploading';
    const done = item.status === 'done';
    const failed = item.status === 'error';
    return (
      <View style={styles.row}>
        <View style={styles.rowInfo}>
          <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.fileMeta}>
            {failed
              ? item.errorMessage ?? 'Upload failed'
              : done
                ? 'In library and queue'
                : `<unknown>${sizeLabel ? ` | ${sizeLabel}` : ''}`}
          </Text>
        </View>
        {isUploading ? (
          <ActivityIndicator size="small" color={PURPLE} />
        ) : done ? (
          <Ionicons name="checkmark-circle" size={24} color="#22C97A" />
        ) : failed ? (
          <TouchableOpacity onPress={() => void processFile(item)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="refresh" size={22} color={PURPLE} />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }, [processFile]);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="chevron-back" size={26} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Add Music</Text>
        <TouchableOpacity onPress={() => void pickAndProcess()} disabled={processing}>
          <Text style={[styles.browseText, processing && styles.browseTextDisabled]}>Browse</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={files}
        keyExtractor={(item) => item.uri}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={files.length === 0 ? styles.emptyContainer : undefined}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="folder-open-outline" size={52} color="rgba(255,255,255,0.2)" />
            <Text style={styles.emptyText}>No files selected</Text>
            <TouchableOpacity style={styles.pickBtn} onPress={() => void pickAndProcess()} disabled={processing}>
              {processing ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.pickBtnText}>Browse Files</Text>
              )}
            </TouchableOpacity>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 17, fontWeight: '700', color: '#FFFFFF' },
  browseText: { fontSize: 14, fontWeight: '600', color: PURPLE },
  browseTextDisabled: { opacity: 0.45 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowInfo: { flex: 1, marginRight: 12 },
  fileName: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },
  fileMeta: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginTop: 2 },
  separator: { height: 1, backgroundColor: BORDER, marginLeft: 16 },
  emptyContainer: { flexGrow: 1 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 60, gap: 16 },
  emptyText: { color: 'rgba(255,255,255,0.4)', fontSize: 15 },
  pickBtn: { backgroundColor: PURPLE, borderRadius: 24, paddingHorizontal: 28, paddingVertical: 12, minWidth: 140, alignItems: 'center' },
  pickBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
