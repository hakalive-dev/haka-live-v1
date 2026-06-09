import React, { useState, useCallback } from 'react';
import {
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Image } from 'expo-image';
import { useSelector } from 'react-redux';

import { roomsApi } from '@api/rooms';
import { KeyboardAwareScroll } from '@components/keyboard';
import { Colors, Spacing, Radius } from '@/theme';
import type { RootStackParamList } from '@navigation/types';
import type { RootState } from '@store/index';
import type { MicConfig } from '@/types';
import { getRoomSeatRows, SEAT_ICON_SCALE } from '@/screens/room/seatLayout';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MIC_OPTIONS: MicConfig[] = [5, 10, 15, 20, 25, 30];
/** Live-room create preview: three co-host slots on the right (API still uses micConfig 5). */
const LIVE_PREVIEW_SEATS = [1, 2, 3] as const;
const LIVE_ROOM_MIC_CONFIG: MicConfig = 5;

type RoomMode = 'live' | 'chat';

// ── Topic tags ───────────────────────────────────────────────────────────────

const ALL_TOPICS = [
  'Chatting', 'Making friends', 'Connect with people',
  'Music', 'Gaming', 'Chill', 'Q&A', 'Dating',
];

// ── Game data ────────────────────────────────────────────────────────────────

interface GameItem {
  id: string;
  name: string;
  image: ReturnType<typeof require>;
}

const GAMES: GameItem[] = [
  { id: 'ludo', name: 'Ludo', image: require('../../../assets/games/ludo.png') },
  { id: 'fishing', name: 'Fishing Star', image: require('../../../assets/games/fishing_star.png') },
  { id: 'royal', name: 'Royal Battle', image: require('../../../assets/games/royal_battle.png') },
  { id: 'win_go', name: 'Win Go', image: require('../../../assets/games/win_go.png') },
  { id: 'bounty', name: 'Bounty Racer', image: require('../../../assets/games/bounty_racer.png') },
  { id: 'tiger', name: 'Lion Vs Tiger', image: require('../../../assets/games/tiger_vs_lion.png') },
  { id: 'lucky', name: 'Lucky Wheel', image: require('../../../assets/games/lucky_wheel.png') },
];

function getSeatRows(micConfig: MicConfig): number[][] {
  return getRoomSeatRows(micConfig).rows;
}

// ── Preview seat icon ────────────────────────────────────────────────────────

const unlockSeatImg = require('../../../assets/py_room_seat_normal.png');

function PreviewSeat({ position, size }: { position: number; size: number }) {
  const iconSize = Math.round(size * SEAT_ICON_SCALE);
  return (
    <View style={[pStyles.seatWrap, { width: size + 12 }]}>
      <Image source={unlockSeatImg} style={{ width: iconSize, height: iconSize }} contentFit="contain" />
      <Text style={pStyles.seatLabel} numberOfLines={1}>No. {position}</Text>
    </View>
  );
}

const pStyles = StyleSheet.create({
  seatWrap: { alignItems: 'center', gap: 3 },
  seatLabel: { fontSize: 11, fontWeight: '500', color: '#FFFFFF', textAlign: 'center' },
});

// ── Main screen ──────────────────────────────────────────────────────────────

export function CreateRoomScreen() {
  const navigation = useNavigation<Nav>();
  const insets = useSafeAreaInsets();
  const currentUser = useSelector((state: RootState) => state.auth.user);

  const [roomMode, setRoomMode] = useState<RoomMode>('live');
  const [micConfig, setMicConfig] = useState<MicConfig>(LIVE_ROOM_MIC_CONFIG);
  const [title, setTitle] = useState('');
  const [announcement, setAnnouncement] = useState('Welcome everyone! Let\'s chat and have fun together');
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>(['Chatting', 'Making friends', 'Connect with people']);
  const [showSettings, setShowSettings] = useState(false);
  const [showEditInfo, setShowEditInfo] = useState(false);
  const [editNameDraft, setEditNameDraft] = useState('');
  const [editAnnouncementDraft, setEditAnnouncementDraft] = useState('');
  const [editCoverDraft, setEditCoverDraft] = useState<string | null>(null);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isLive = roomMode === 'live';
  const seatRows = getSeatRows(micConfig);
  const hostName = currentUser?.displayName ?? 'Host';
  const hostAvatar = currentUser?.avatar;
  const displayTitle = title.trim() || 'Live Stream title';

  const handleModeChange = useCallback((mode: RoomMode) => {
    setRoomMode(mode);
    if (mode === 'live') setMicConfig(LIVE_ROOM_MIC_CONFIG);
    if (mode === 'chat' && micConfig < 10) setMicConfig(10);
  }, [micConfig]);

  const handleOpenEditInfo = useCallback(() => {
    setEditNameDraft(title || hostName);
    setEditAnnouncementDraft(announcement);
    setEditCoverDraft(coverImage);
    setShowEditInfo(true);
  }, [title, announcement, coverImage, hostName]);

  const handlePickCover = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setEditCoverDraft(result.assets[0].uri);
    }
  }, []);

  const handleSaveEditInfo = useCallback(() => {
    if (editNameDraft.trim()) setTitle(editNameDraft.trim());
    setAnnouncement(editAnnouncementDraft.trim());
    setCoverImage(editCoverDraft);
    setShowEditInfo(false);
  }, [editNameDraft, editAnnouncementDraft, editCoverDraft]);

  const handleGoLive = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const room = await roomsApi.create({
        title: title.trim() || 'My Room',
        micConfig: isLive ? LIVE_ROOM_MIC_CONFIG : micConfig,
        type: 'public',
        roomMode,
      });
      await roomsApi.start(room.id);
      navigation.navigate('RoomModal', { roomId: room.id, roomMode, isLocked: room.isLocked, hostId: room.hostId });
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create room');
    } finally {
      setLoading(false);
    }
  }, [loading, title, micConfig, roomMode, navigation, isLive]);

  const topSeatSize = micConfig <= 10 ? 56 : 48;
  const smallSeatSize = micConfig <= 10 ? 48 : 40;

  return (
    <View style={styles.screen}>
      {/* ── Background ── */}
      {hostAvatar ? (
        <>
          <Image
            source={{ uri: hostAvatar }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={20}
          />
          <LinearGradient
            colors={['rgba(20,10,50,0.55)', 'rgba(40,20,90,0.45)', 'rgba(60,30,120,0.35)', 'rgba(80,40,150,0.45)']}
            style={StyleSheet.absoluteFill}
          />
        </>
      ) : (
        <LinearGradient
          colors={isLive
            ? ['#FF6B8A', '#FF98A8', '#FFC4D0', '#FFE8ED']
            : ['#C4ADFF', '#9D7FFF', '#B49AFF', '#D4C4FF']}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* ── Close button ── */}
      <TouchableOpacity
        style={[styles.closeBtn, { top: insets.top + 12 }]}
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="close" size={20} color="#FFFFFF" />
      </TouchableOpacity>

      {/* ── Room info card ── */}
      <TouchableOpacity
        style={[styles.roomInfoCard, { top: insets.top + 8 }]}
        onPress={handleOpenEditInfo}
        activeOpacity={0.85}
      >
        {/* Thumbnail */}
        <View style={styles.roomThumbnail}>
          {(coverImage || hostAvatar) ? (
            <Image
              source={{ uri: coverImage ?? hostAvatar! }}
              style={styles.roomThumbnailImg}
              contentFit="cover"
            />
          ) : (
            <LinearGradient
              colors={['#7B4FFF', '#5B2FD4']}
              style={styles.roomThumbnailImg}
            >
              <Ionicons name="radio" size={20} color="rgba(255,255,255,0.8)" />
            </LinearGradient>
          )}
        </View>

        {/* Title + tags */}
        <View style={styles.roomInfoText}>
          <View style={styles.roomTitleRow}>
            <Text style={styles.roomTitle} numberOfLines={1}>{displayTitle}</Text>
            <Ionicons name="create-outline" size={13} color="rgba(255,255,255,0.8)" style={{ marginLeft: 4 }} />
            <Text style={styles.roomEditLink}>Edit</Text>
          </View>
          <View style={styles.topicRow}>
            {selectedTopics.slice(0, 3).map((topic) => (
              <View key={topic} style={styles.topicPill}>
                <Text style={styles.topicPillText}>{topic}</Text>
              </View>
            ))}
          </View>
        </View>
      </TouchableOpacity>

      {/* ── Seat preview: live = 3 slots on the right; chat = full mic grid ── */}
      {isLive ? (
        <View style={[styles.liveSeatGrid, { top: insets.top + 100 }]}>
          {LIVE_PREVIEW_SEATS.map((pos) => (
            <PreviewSeat key={pos} position={pos} size={48} />
          ))}
        </View>
      ) : (
        <View style={styles.chatSeatGrid}>
          {seatRows.map((row, rowIdx) => (
            <View key={rowIdx} style={styles.seatRow}>
              {row.map((pos) => (
                <PreviewSeat
                  key={pos}
                  position={pos}
                  size={row.length === 1 ? topSeatSize : smallSeatSize}
                />
              ))}
            </View>
          ))}
        </View>
      )}

      {/* ── Bottom area ── */}
      <View style={[styles.bottomArea, { paddingBottom: insets.bottom + 16 }]}>
        {/* Tool icons row */}
        <View style={styles.toolRow}>
          <TouchableOpacity style={styles.toolBtn}>
            <MaterialCommunityIcons name="shimmer" size={28} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => setShowSettings(true)}>
            <MaterialCommunityIcons name="sofa-outline" size={28} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => setShowSettings(true)}>
            <Ionicons name="game-controller-outline" size={28} color="rgba(255,255,255,0.85)" />
          </TouchableOpacity>
        </View>

        {/* Go button */}
        <TouchableOpacity
          style={styles.goBtn}
          onPress={handleGoLive}
          disabled={loading}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={['#9D7FFF', '#7B4FFF']}
            style={styles.goBtnGradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.goBtnText}>
                {isLive ? 'Go to Live' : 'Go to Chat'}
              </Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* Live / Chat toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeTab, isLive && styles.modeTabActive]}
            onPress={() => handleModeChange('live')}
          >
            <Text style={[styles.modeTabText, isLive && styles.modeTabTextActive]}>
              Live
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeTab, !isLive && styles.modeTabActive]}
            onPress={() => handleModeChange('chat')}
          >
            <Text style={[styles.modeTabText, !isLive && styles.modeTabTextActive]}>
              Chat
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Edit Info modal ── */}
      <Modal
        visible={showEditInfo}
        transparent
        animationType="slide"
        onRequestClose={() => setShowEditInfo(false)}
      >
        <TouchableOpacity
          style={styles.editInfoOverlay}
          activeOpacity={1}
          onPress={() => setShowEditInfo(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.editInfoPanel}>
            <KeyboardAwareScroll
              style={{ maxHeight: '85%' }}
              contentContainerStyle={{ paddingBottom: Spacing.xl }}
            >
            <Text style={styles.editInfoTitle}>Edit Info</Text>

            {/* Cover image — circular */}
            <TouchableOpacity style={styles.editInfoAvatarWrap} onPress={handlePickCover}>
              {(editCoverDraft || hostAvatar) ? (
                <Image
                  source={{ uri: editCoverDraft ?? hostAvatar! }}
                  style={styles.editInfoAvatar}
                  contentFit="cover"
                />
              ) : (
                <View style={[styles.editInfoAvatar, styles.editInfoAvatarFallback]}>
                  <Ionicons name="image-outline" size={28} color={Colors.textTertiary} />
                </View>
              )}
              <View style={styles.editInfoCameraBadge}>
                <Ionicons name="camera-outline" size={12} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <Text style={styles.editInfoCoverLabel}>Edit Room Info</Text>

            {/* Room Name */}
            <Text style={styles.editInfoFieldLabel}>Room Name</Text>
            <TextInput
              style={styles.editInfoInput}
              value={editNameDraft}
              onChangeText={setEditNameDraft}
              placeholder="Enter room name..."
              placeholderTextColor={Colors.textTertiary}
              maxLength={80}
            />

            {/* Announcement */}
            <Text style={styles.editInfoFieldLabel}>Announcement</Text>
            <TextInput
              style={[styles.editInfoInput, styles.editInfoTextArea]}
              value={editAnnouncementDraft}
              onChangeText={setEditAnnouncementDraft}
              placeholder="Enter announcement..."
              placeholderTextColor={Colors.textTertiary}
              maxLength={200}
              multiline
              textAlignVertical="top"
            />

            {/* Submit */}
            <TouchableOpacity style={styles.editInfoSubmitBtn} onPress={handleSaveEditInfo}>
              <LinearGradient
                colors={['#9D7FFF', '#7B4FFF']}
                style={styles.editInfoSubmitGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.editInfoSubmitText}>Submit</Text>
              </LinearGradient>
            </TouchableOpacity>
            </KeyboardAwareScroll>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Settings modal ── */}
      <Modal
        visible={showSettings}
        transparent
        animationType="slide"
        onRequestClose={() => setShowSettings(false)}
      >
        <TouchableOpacity
          style={styles.settingsOverlay}
          activeOpacity={1}
          onPress={() => setShowSettings(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.settingsPanel}>
            <View style={styles.settingsHandle} />

            {/* Room Type */}
            <Text style={styles.settingsSectionTitle}>Room Type</Text>
            <View style={styles.settingsRow}>
              <TouchableOpacity
                style={[styles.typePill, isLive && styles.typePillActiveLive]}
                onPress={() => handleModeChange('live')}
              >
                <Ionicons
                  name="radio"
                  size={14}
                  color={isLive ? '#FFFFFF' : Colors.textSecondary}
                />
                <Text style={[styles.typePillText, isLive && styles.typePillTextActive]}>
                  Live Room
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.typePill, !isLive && styles.typePillActiveChat]}
                onPress={() => handleModeChange('chat')}
              >
                <Ionicons
                  name="chatbubbles"
                  size={14}
                  color={!isLive ? '#FFFFFF' : Colors.textSecondary}
                />
                <Text style={[styles.typePillText, !isLive && styles.typePillTextActive]}>
                  Chat Room
                </Text>
              </TouchableOpacity>
            </View>

            {/* Mic config — chat rooms only (live uses fixed 3-slot preview) */}
            {!isLive && (
              <View style={styles.micRow}>
                {MIC_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.micPill, opt === micConfig && styles.micPillActive]}
                    onPress={() => setMicConfig(opt)}
                  >
                    <Text style={[styles.micPillText, opt === micConfig && styles.micPillTextActive]}>
                      {opt} Mic
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Apply Mode */}
            <Text style={styles.settingsSectionTitle}>Apply Mode</Text>
            <View style={styles.applyModeDivider} />
            <Text style={styles.applyModeLabel}>Apply Mode</Text>

            {/* Games grid with None option */}
            <ScrollView showsVerticalScrollIndicator={false} style={styles.gamesScroll}>
              <View style={styles.gamesGrid}>
                {/* None option */}
                <TouchableOpacity
                  style={styles.gameItem}
                  onPress={() => setSelectedGame(null)}
                >
                  <View style={[styles.gameIcon, styles.gameNoneIcon, !selectedGame && styles.gameIconSelected]}>
                    <Ionicons name="close-outline" size={32} color={Colors.textSecondary} />
                  </View>
                  <Text style={[styles.gameName, !selectedGame && styles.gameNameActive]}>None</Text>
                </TouchableOpacity>

                {GAMES.map((game) => {
                  const active = selectedGame === game.id;
                  return (
                    <TouchableOpacity
                      key={game.id}
                      style={styles.gameItem}
                      onPress={() => setSelectedGame(game.id)}
                    >
                      <View style={active ? styles.gameIconSelected : undefined}>
                        <Image source={game.image} style={styles.gameIcon} contentFit="cover" />
                      </View>
                      <Text style={[styles.gameName, active && styles.gameNameActive]} numberOfLines={1}>{game.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {/* Apply Settings */}
            <TouchableOpacity style={styles.applyBtn} onPress={() => setShowSettings(false)} activeOpacity={0.85}>
              <LinearGradient colors={['#7B4FFF', '#5B2FD4']} style={styles.applyBtnGradient}>
                <Text style={styles.applyBtnText}>Apply Settings</Text>
              </LinearGradient>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },

  // Close button
  closeBtn: {
    position: 'absolute',
    left: Spacing.lg,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },

  // Room info card
  roomInfoCard: {
    position: 'absolute',
    left: 60,
    right: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    gap: Spacing.md,
    zIndex: 10,
  },
  roomThumbnail: {
    width: 48,
    height: 48,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  roomThumbnailImg: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roomInfoText: {
    flex: 1,
    gap: 5,
  },
  roomTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  roomTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
  },
  roomEditLink: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  topicRow: {
    flexDirection: 'row',
    gap: 5,
    flexWrap: 'wrap',
  },
  topicPill: {
    backgroundColor: 'rgba(123,79,255,0.45)',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  topicPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },

  // Live mode: three seat slots in a vertical column on the right
  liveSeatGrid: {
    position: 'absolute',
    right: Spacing.xl,
    gap: Spacing.md,
    alignItems: 'center',
  },

  // Chat mode: centered seat grid
  chatSeatGrid: {
    position: 'absolute',
    top: '18%',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: Spacing.lg,
  },
  seatRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.md,
  },

  // Bottom area
  bottomArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xl,
  },

  // Tool icons row
  toolRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xxxl,
  },
  toolBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(0,0,0,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Go button
  goBtn: {
    width: SCREEN_WIDTH - Spacing.xl * 2,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 8,
  },
  goBtnGradient: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.xl,
  },
  goBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xxl,
  },
  modeTab: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  modeTabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#FFFFFF',
  },
  modeTabText: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.5)',
  },
  modeTabTextActive: {
    color: '#FFFFFF',
  },

  // Edit Info modal
  editInfoOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  editInfoPanel: {
    backgroundColor: Colors.surfaceElevated,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  editInfoTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: Spacing.xs,
  },

  // Circular avatar
  editInfoAvatarWrap: {
    position: 'relative',
    width: 72,
    height: 72,
  },
  editInfoAvatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: Colors.border,
  },
  editInfoAvatarFallback: {
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editInfoCameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.surfaceElevated,
  },
  editInfoCoverLabel: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: Spacing.xs,
  },
  editInfoFieldLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    alignSelf: 'flex-start',
  },
  editInfoInput: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.md,
    height: 50,
    paddingHorizontal: Spacing.lg,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  editInfoTextArea: {
    height: 88,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
  },
  editInfoSubmitBtn: {
    width: '100%',
    borderRadius: Radius.lg,
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  editInfoSubmitGradient: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
  },
  editInfoSubmitText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Settings modal
  settingsOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  settingsPanel: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
    maxHeight: '85%',
    gap: Spacing.lg,
  },
  settingsHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.border,
    alignSelf: 'center',
  },
  settingsSectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  settingsRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  typePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    height: 40,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  typePillActiveLive: {
    backgroundColor: '#FF4444',
    borderColor: '#FF4444',
  },
  typePillActiveChat: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typePillText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  typePillTextActive: {
    color: '#FFFFFF',
  },
  micRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  micPill: {
    flex: 1,
    height: 34,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micPillActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  micPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  micPillTextActive: {
    color: '#FFFFFF',
  },
  applyModeDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginBottom: Spacing.xs,
  },
  applyModeLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  gamesScroll: {
    maxHeight: 200,
  },
  gamesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  gameItem: {
    width: (SCREEN_WIDTH - Spacing.xl * 2 - Spacing.md * 3) / 4,
    alignItems: 'center',
    gap: 4,
  },
  gameIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.md,
    overflow: 'hidden',
  },
  gameNoneIcon: {
    backgroundColor: Colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  gameIconSelected: {
    borderWidth: 2,
    borderColor: '#22C97A',
    borderRadius: Radius.md + 2,
    overflow: 'hidden',
  },
  gameName: {
    fontSize: 10,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  gameNameActive: {
    color: Colors.textPrimary,
  },
  applyBtn: {
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  applyBtnGradient: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.lg,
  },
  applyBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
