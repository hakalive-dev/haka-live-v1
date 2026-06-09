import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Spacing } from '@/theme';
import { roomsApi } from '@api/rooms';
import { useToast } from '@components/Toast';
import { RoomPasswordOverlay } from './RoomPasswordOverlay';
import type { Room, ThemePayload } from '@/types';
import type { RoomStackScreenProps } from '@/navigation/types';

const BG = '#1A1530';
const ROW_BG = '#26223F';
const BORDER = 'rgba(255,255,255,0.06)';

type Props = RoomStackScreenProps<'RoomSettings'>;

export function RoomSettingsScreen({ route, navigation }: Props) {
  const { roomId } = route.params;
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [room, setRoom] = useState<Room | null>(null);
  const [saving, setSaving] = useState(false);

  // Local editable fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [micConfig, setMicConfig] = useState<5 | 10 | 15 | 20 | 25 | 30>(10);
  const [roomMode, setRoomMode] = useState<'chat' | 'live'>('chat');
  const [applyForMic, setApplyForMic] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [publicMsgEnabled, setPublicMsgEnabled] = useState(true);
  const [hdMicEnabled, setHdMicEnabled] = useState(false);
  const [musicQueueLabel, setMusicQueueLabel] = useState('None');

  // Sub-modals
  const [editing, setEditing] = useState<null | 'title' | 'description'>(null);
  const [showMicPicker, setShowMicPicker] = useState(false);
  const [showRoomModePicker, setShowRoomModePicker] = useState(false);
  const [passwordOverlayVisible, setPasswordOverlayVisible] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [availableThemes, setAvailableThemes] = useState<ThemePayload[]>([]);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [applyingTheme, setApplyingTheme] = useState(false);

  useEffect(() => {
    roomsApi.detail(roomId).then((r) => {
      setRoom(r);
      setTitle(r.title ?? '');
      setDescription(r.description ?? '');
      setMicConfig((r.micConfig as 5 | 10 | 15 | 20 | 25 | 30) ?? 10);
      setRoomMode(r.roomMode === 'live' ? 'live' : 'chat');
      setApplyForMic(r.applyForMic ?? false);
      setHasPassword(!!r.isLocked);
      setPublicMsgEnabled(r.publicMsgEnabled ?? true);
      setHdMicEnabled(r.hdMicEnabled ?? false);
    }).catch((e) => Alert.alert('Failed to load room', String(e)));
    roomsApi.getMusicQueue(roomId)
      .then((q) => {
        if (q.tracks.length === 0) setMusicQueueLabel('None');
        else setMusicQueueLabel(`${q.tracks.length} track${q.tracks.length === 1 ? '' : 's'}`);
      })
      .catch(() => {
        setMusicQueueLabel('None');
      });
    roomsApi.getAvailableThemes().then(setAvailableThemes).catch(() => {});
  }, [roomId]);

  const save = useCallback(async (patch: Parameters<typeof roomsApi.update>[1]) => {
    if (!room) return;
    setSaving(true);
    try {
      const updated = await roomsApi.update(roomId, patch);
      setRoom(updated);
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  }, [room, roomId]);

  const commitTitle = () => { save({ title }); setEditing(null); };
  const commitDescription = () => { save({ description }); setEditing(null); };

  const applyTheme = useCallback(async (themeId: string | null) => {
    setApplyingTheme(true);
    setShowThemePicker(false);
    try {
      if (themeId) {
        const res = await roomsApi.applyTheme(roomId, themeId);
        setRoom((prev) => prev ? ({ ...prev, activeTheme: res.theme } as any) : prev);
        toast.show('Theme applied!', 'success');
      } else {
        await roomsApi.resetTheme(roomId);
        setRoom((prev) => prev ? ({ ...prev, activeTheme: null } as any) : prev);
        toast.show('Theme reset', 'success');
      }
    } catch (e: any) {
      Alert.alert('Failed', e?.message ?? 'Could not apply theme');
    } finally {
      setApplyingTheme(false);
    }
  }, [roomId, toast]);

  const pickMic = (n: 5 | 10 | 15 | 20 | 25 | 30) => {
    setMicConfig(n);
    setShowMicPicker(false);
    save({ micConfig: n });
  };

  const pickRoomMode = (mode: 'chat' | 'live') => {
    setShowRoomModePicker(false);
    if (mode === roomMode) return;
    const goingLive = mode === 'live';
    Alert.alert(
      goingLive ? 'Switch to Live?' : 'Switch to Chat?',
      goingLive
        ? 'The room will become a video live stream and viewers will see your camera.'
        : 'The room will return to a voice chat party with mic seats.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: goingLive ? 'Go Live' : 'Switch',
          onPress: () => {
            setRoomMode(mode);
            save({ roomMode: mode });
          },
        },
      ],
    );
  };

  const toggleApply = (v: boolean) => {
    setApplyForMic(v);
    save({ applyForMic: v });
  };

  const handleTogglePublicMsg = async (v: boolean) => {
    setPublicMsgEnabled(v);
    try { await roomsApi.togglePublicMsg(roomId); }
    catch (e: any) { setPublicMsgEnabled(!v); Alert.alert('Failed', e?.message ?? 'Could not update'); }
  };

  const handleToggleHdMic = async (v: boolean) => {
    setHdMicEnabled(v);
    try { await roomsApi.toggleHdMic(roomId); }
    catch (e: any) { setHdMicEnabled(!v); Alert.alert('Failed', e?.message ?? 'Could not update'); }
  };

  const comingSoon = () => toast.comingSoon('This feature');

  const handlePickCover = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const mime = asset.mimeType || (asset.uri.endsWith('.png') ? 'image/png' : 'image/jpeg');
    const name = asset.fileName || `cover.${mime === 'image/png' ? 'png' : 'jpg'}`;
    setSaving(true);
    try {
      const res = await roomsApi.uploadCover(roomId, asset.uri, mime, name);
      setRoom(res.room);
      toast.show('Room cover updated', 'success');
    } catch (e: any) {
      Alert.alert('Upload failed', e?.message ?? 'Unknown error');
    } finally {
      setSaving(false);
    }
  }, [roomId]);

  if (!room) {
    return (
      <SafeAreaView style={[styles.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={styles.value}>Loading…</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Room Settings</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: Spacing.lg, gap: Spacing.lg }}>
        <SectionCard>
          <Row label="Room Cover" onPress={handlePickCover}>
            {room.coverImage ? (
              <Image source={{ uri: room.coverImage }} style={styles.coverThumb} />
            ) : (
              <View style={[styles.coverThumb, styles.coverFallback]}>
                <Ionicons name="image" size={18} color="rgba(255,255,255,0.4)" />
              </View>
            )}
          </Row>
          <Divider />
          <Row label="Room Name" onPress={() => setEditing('title')}>
            <Text style={styles.value} numberOfLines={1}>{title || '—'}</Text>
          </Row>
          <Divider />
          <Row label="Announcement" onPress={() => setEditing('description')} stacked>
            <Text style={styles.valueMuted} numberOfLines={2}>
              {description || 'Tap to add an announcement'}
            </Text>
          </Row>
        </SectionCard>

        <SectionCard>
          <Row label="Room Type" onPress={() => setShowRoomModePicker(true)}>
            <Text style={styles.value}>{roomMode === 'live' ? 'Live' : 'Chat'}</Text>
          </Row>
          <Divider />
          <Row label="Number of Mic" onPress={() => setShowMicPicker(true)}>
            <Text style={styles.value}>{micConfig}</Text>
          </Row>
          <Divider />
          <Row label="Apply For Mic" noChevron>
            <Switch
              value={applyForMic}
              onValueChange={toggleApply}
              trackColor={{ true: '#7B4FFF', false: 'rgba(255,255,255,0.2)' }}
              thumbColor="#FFFFFF"
            />
          </Row>
          <Divider />
          <Row label="Game Type" onPress={comingSoon}>
            <Text style={styles.valueMuted}>{room.gameType || ''}</Text>
          </Row>
          <Divider />
          <Row label="Public Messages" noChevron>
            <Switch
              value={publicMsgEnabled}
              onValueChange={handleTogglePublicMsg}
              trackColor={{ true: '#7B4FFF', false: 'rgba(255,255,255,0.2)' }}
              thumbColor="#FFFFFF"
            />
          </Row>
          <Divider />
          <Row label="HD Mic" noChevron>
            <Switch
              value={hdMicEnabled}
              onValueChange={handleToggleHdMic}
              trackColor={{ true: '#7B4FFF', false: 'rgba(255,255,255,0.2)' }}
              thumbColor="#FFFFFF"
            />
          </Row>
        </SectionCard>

        <SectionCard>
          <Row label="Theme" onPress={applyingTheme ? undefined : () => setShowThemePicker(true)}>
            <Text style={styles.valueMuted}>
              {applyingTheme ? 'Applying…' : (room.activeTheme?.id ? 'Custom' : 'Default')}
            </Text>
          </Row>
          <Divider />
          <Row label="Room Admin" onPress={comingSoon} />
          <Divider />
          <Row label="Password" onPress={() => {
            setPasswordError(null);
            setPasswordOverlayVisible(true);
          }}>
            <Text style={styles.valueMuted}>{hasPassword ? '••••••' : ''}</Text>
          </Row>
          <Divider />
          <Row label="Fan Badge" onPress={comingSoon}>
            <Text style={styles.valueMuted}>{room.fanBadge || ''}</Text>
          </Row>
          <Divider />
          <Row label="Background Music" onPress={() => navigation.navigate('RoomMusic', { roomId, isHost: true })}>
            <Text style={styles.valueMuted} numberOfLines={1}>{musicQueueLabel}</Text>
          </Row>
        </SectionCard>

        {saving && <Text style={styles.savingText}>Saving…</Text>}
      </ScrollView>

      {/* Text input modal (title / description) */}
      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {editing === 'title' ? 'Room Name' : 'Announcement'}
            </Text>
            <TextInput
              style={[styles.input, editing === 'description' && { height: 90, textAlignVertical: 'top' }]}
              multiline={editing === 'description'}
              value={editing === 'title' ? title : description}
              onChangeText={(t) => {
                if (editing === 'title') setTitle(t);
                else setDescription(t);
              }}
              placeholderTextColor="rgba(255,255,255,0.35)"
              autoFocus
              maxLength={editing === 'description' ? 300 : 100}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setEditing(null)} style={[styles.modalBtn, styles.modalBtnCancel]}>
                <Text style={styles.modalBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (editing === 'title') commitTitle();
                  else commitDescription();
                }}
                style={[styles.modalBtn, styles.modalBtnSave]}
              >
                <Text style={styles.modalBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Room Password overlay (6-digit input) */}
      <RoomPasswordOverlay
        visible={passwordOverlayVisible}
        onClose={() => {
          setPasswordOverlayVisible(false);
          setPasswordError(null);
        }}
        mode="set"
        hasPassword={hasPassword}
        error={passwordError}
        loading={saving}
        onSubmit={(pw) => {
          setPasswordError(null);
          setSaving(true);
          roomsApi.update(roomId, { password: pw }).then((updated) => {
            setRoom(updated);
            setHasPassword(true);
            setPasswordOverlayVisible(false);
            toast.show('Room password set', 'success');
          }).catch((e) => {
            setPasswordError(e?.message ?? 'Failed to set password');
          }).finally(() => setSaving(false));
        }}
        onDelete={() => {
          setSaving(true);
          roomsApi.update(roomId, { password: null }).then((updated) => {
            setRoom(updated);
            setHasPassword(false);
            setPasswordOverlayVisible(false);
            toast.show('Room password removed', 'success');
          }).catch((e) => {
            setPasswordError(e?.message ?? 'Failed to remove password');
          }).finally(() => setSaving(false));
        }}
      />

      {/* Mic picker */}
      <Modal visible={showMicPicker} transparent animationType="fade" onRequestClose={() => setShowMicPicker(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowMicPicker(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Number of Mic</Text>
            {[5, 10, 15, 20, 25, 30].map((n) => (
              <TouchableOpacity
                key={n}
                style={styles.pickerOption}
                onPress={() => pickMic(n as 5 | 10 | 15 | 20 | 25 | 30)}
              >
                <Text style={styles.value}>{n}</Text>
                {micConfig === n && <Ionicons name="checkmark" size={18} color="#7B4FFF" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Room type picker */}
      <Modal visible={showRoomModePicker} transparent animationType="fade" onRequestClose={() => setShowRoomModePicker(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowRoomModePicker(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Room Type</Text>
            {([
              { value: 'chat' as const, label: 'Chat', sub: 'Voice party with mic seats' },
              { value: 'live' as const, label: 'Live', sub: 'Video live stream' },
            ]).map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={styles.pickerOption}
                onPress={() => pickRoomMode(opt.value)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.value}>{opt.label}</Text>
                  <Text style={styles.valueMuted}>{opt.sub}</Text>
                </View>
                {roomMode === opt.value && <Ionicons name="checkmark" size={18} color="#7B4FFF" />}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Theme picker modal */}
      <Modal visible={showThemePicker} transparent animationType="slide" onRequestClose={() => setShowThemePicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={[styles.pickerSheet, { paddingBottom: 20 + insets.bottom }]}>
            <Text style={styles.pickerTitle}>Choose Theme</Text>
            <ScrollView>
              <TouchableOpacity style={styles.pickerItem} onPress={() => applyTheme(null)}>
                <LinearGradient colors={['#1E1A3C', '#2A2550']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.themeSwatch} />
                <View style={styles.pickerItemText}>
                  <Text style={styles.pickerItemLabel}>Default</Text>
                  <Text style={styles.pickerItemSub}>Reset to default</Text>
                </View>
              </TouchableOpacity>
              {availableThemes.map((t) => (
                <TouchableOpacity key={t.id} style={styles.pickerItem} onPress={() => applyTheme(t.id)}>
                  <LinearGradient colors={[t.gradientFrom, t.gradientTo] as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.themeSwatch} />
                  <View style={styles.pickerItemText}>
                    <Text style={styles.pickerItemLabel}>{t.name}</Text>
                    <Text style={styles.pickerItemSub}>{t.gradientFrom} → {t.gradientTo}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.pickerCancel} onPress={() => setShowThemePicker(false)}>
              <Text style={styles.pickerCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View style={styles.section}>{children}</View>;
}

function Row({
  label, children, onPress, noChevron, stacked,
}: {
  label: string;
  children?: React.ReactNode;
  onPress?: () => void;
  noChevron?: boolean;
  stacked?: boolean;
}) {
  const Wrapper: any = onPress ? TouchableOpacity : View;
  return (
    <Wrapper onPress={onPress} style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {stacked && <View style={{ marginTop: 6 }}>{children}</View>}
      </View>
      {!stacked && <View style={styles.rowRight}>{children}</View>}
      {!noChevron && onPress && (
        <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.4)" style={{ marginLeft: 6 }} />
      )}
    </Wrapper>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  section: {
    backgroundColor: ROW_BG,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    minHeight: 54,
  },
  rowRight: { flexDirection: 'row', alignItems: 'center', maxWidth: '55%' },
  label: { color: '#FFFFFF', fontSize: 14 },
  value: { color: '#FFFFFF', fontSize: 14 },
  valueMuted: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: BORDER },

  coverThumb: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },

  savingText: { color: 'rgba(255,255,255,0.6)', fontSize: 12, textAlign: 'center' },

  modalBackdrop: {
    flex: 1,
    alignItems: 'center', justifyContent: 'center', padding: Spacing.xl,
  },
  modalCard: {
    backgroundColor: '#26223F',
    borderRadius: 14,
    padding: Spacing.lg,
    width: '100%',
  },
  modalTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginBottom: Spacing.md },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#FFFFFF',
    fontSize: 14,
  },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.sm, marginTop: Spacing.md },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
  modalBtnCancel: { backgroundColor: 'rgba(255,255,255,0.08)' },
  modalBtnSave: { backgroundColor: '#7B4FFF' },
  modalBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  pickerOverlay: { flex: 1, justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#1A1530', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '70%' },
  pickerTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 16 },
  pickerItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' },
  themeSwatch: { width: 52, height: 52, borderRadius: 10 },
  pickerItemText: { flex: 1 },
  pickerItemLabel: { fontSize: 14, fontWeight: '600', color: '#fff' },
  pickerItemSub: { fontSize: 11, color: '#9090AA', marginTop: 2 },
  pickerCancel: { marginTop: 16, alignItems: 'center', paddingVertical: 12 },
  pickerCancelText: { color: '#9090AA', fontSize: 14 },
});
