import React, { useEffect, useState } from 'react';
import {
  Alert,
  Clipboard,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius, Spacing } from '@/theme';
import { roomsApi, type MemberEntry, type RoomAdmin } from '@api/rooms';
import { UserAvatar } from '@components/UserAvatar';
import { CopyIcon } from '@components/CopyIcon';
import { RoomAdminBadge, RoomOwnerBadge } from '@components/RoomRoleBadges';
import type { Room, Seat, EquippedCosmetic } from '@/types';
import { useToast } from '@components/Toast';
import { canKickRoomMember } from '@/utils/roomKick';

const RoomDataIconPng = require('../../../assets/room-toolbar/room_data.png');
const customizationIconImageStyle = { width: 34, height: 34 } as const;
const customizationIconImageRawStyle = { width: 64, height: 64 } as const;
const SettingIconPng = require('../../../assets/room-toolbar/setting.png');

const TOOL_CIRCLE_GRADIENT_START = { x: 0.9841828847, y: 0.3752324797 } as const;
const TOOL_CIRCLE_GRADIENT_END = { x: 0.0158171153, y: 0.6247675203 } as const;
const TOOL_CIRCLE_GRADIENT_COLORS = [
  'rgba(57, 196, 11, 0.126)',
  'rgba(255, 255, 255, 0.0468)',
] as const;

interface Viewer {
  id: string;
  displayName: string;
  avatar: string | null;
  username?: string | null;
  hakaId?: string | null;
  equippedFrame?: EquippedCosmetic | null;
  activeSpecialId?: string | null;
  activeSpecialIdLevel?: string | null;
}

type MemberListItem = Viewer & { joinedAt?: string };

interface Props {
  visible: boolean;
  onClose: () => void;
  room: Room;
  seats: Seat[];
  viewers?: Viewer[];
  isHost?: boolean;
  /** True when the viewer is a room admin (not necessarily the host). */
  isRoomAdmin?: boolean;
  canManageRoom?: boolean;
  currentUserId?: string;
  onChatHost?: () => void;
  onOpenSettings?: () => void;
  onOpenEditInfo?: () => void;
  onOpenRoomData?: () => void;
  onOpenRoomAdmin?: () => void;
  onOpenPassword?: () => void;
  onOpenTheme?: () => void;
  onShare?: () => void;
  onMemberPress?: (userId: string) => void;
  onKickMember?: (member: MemberListItem) => void;
}

const CUSTOMIZATION_ACTIONS: { key: string; label: string; icon: React.ReactNode }[] = [
  { key: 'setting',   label: 'Setting',    icon: <Image source={SettingIconPng} style={customizationIconImageRawStyle} contentFit="contain" /> },
  { key: 'edit',      label: 'Edit',       icon: <MaterialCommunityIcons name="pencil-outline"       size={34} color="#FFFFFF" /> },
  { key: 'theme',     label: 'Theme',      icon: <MaterialCommunityIcons name="shape-outline"        size={34} color="#FFFFFF" /> },
  { key: 'password',  label: 'Password',   icon: <MaterialCommunityIcons name="lock-outline"         size={34} color="#FFFFFF" /> },
  { key: 'room_data', label: 'Room data',  icon: <Image source={RoomDataIconPng} style={customizationIconImageRawStyle} contentFit="contain" /> },
  { key: 'fan_badge', label: 'Fan Badge',  icon: <MaterialCommunityIcons name="medal-outline"        size={34} color="#FFFFFF" /> },
  { key: 'admin',     label: 'Room Admin', icon: <MaterialCommunityIcons name="account-key-outline"  size={34} color="#FFFFFF" /> },
];

type Tab = 'profile' | 'member';

export function RoomInfoOverlay({
  visible,
  onClose,
  room,
  viewers = [],
  isHost,
  isRoomAdmin = false,
  canManageRoom,
  currentUserId,
  onChatHost,
  onOpenSettings,
  onOpenEditInfo,
  onOpenRoomData,
  onOpenRoomAdmin,
  onOpenPassword,
  onOpenTheme,
  onShare,
  onMemberPress,
  onKickMember,
}: Props) {
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('profile');
  const [adminIds, setAdminIds] = useState<Set<string>>(new Set());
  const [roomAdmins, setRoomAdmins] = useState<RoomAdmin[]>([]);
  const [permanentMembers, setPermanentMembers] = useState<MemberEntry[]>([]);
  const [fetchedViewers, setFetchedViewers] = useState<Viewer[]>([]);

  useEffect(() => {
    if (!visible) {
      setPermanentMembers([]);
      setFetchedViewers([]);
      return;
    }
  }, [visible, room.id]);

  useEffect(() => {
    if (!visible) return;
    let cancel = false;
    roomsApi.listAdmins(room.id)
      .then((admins) => {
        if (cancel) return;
        setRoomAdmins(admins);
        setAdminIds(new Set(admins.map((a) => a.user.id)));
      })
      .catch(() => {});
    return () => { cancel = true; };
  }, [visible, room.id]);

  useEffect(() => {
    if (!visible || tab !== 'member') return;
    let cancel = false;
    roomsApi
      .listMembers(room.id)
      .then((data) => {
        if (!cancel) setPermanentMembers(data);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [visible, tab, room.id]);

  useEffect(() => {
    if (!visible || tab !== 'member' || viewers.length > 0) return;
    let cancel = false;
    roomsApi
      .getViewers(room.id)
      .then((data) => {
        if (!cancel) setFetchedViewers(data);
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [visible, tab, room.id, viewers.length]);

  const liveRoster: Viewer[] = viewers.length > 0 ? viewers : fetchedViewers;

  const roomIdDisplay = room.roomCode || room.id.slice(0, 6);
  const showManagementActions = canManageRoom ?? isHost;
  const customizationActions = isHost
    ? CUSTOMIZATION_ACTIONS
    : CUSTOMIZATION_ACTIONS.filter((action) =>
        ['setting', 'room_data', 'admin'].includes(action.key),
      );

  const ownerEntry: MemberListItem = {
    id: room.host.id,
    displayName: room.host.displayName,
    avatar: room.host.avatar,
    username: room.host.username ?? null,
    hakaId: room.host.hakaId ?? null,
    equippedFrame: room.host.equippedFrame ?? null,
    activeSpecialId: room.host.activeSpecialId ?? null,
    activeSpecialIdLevel: room.host.activeSpecialIdLevel ?? null,
  };

  const adminsAsMembers: MemberListItem[] = roomAdmins.map((a) => ({
    id: a.user.id,
    displayName: a.user.displayName,
    avatar: a.user.avatar,
    username: a.user.username ?? null,
    hakaId: a.user.hakaId ?? null,
    equippedFrame: a.user.equippedFrame ?? null,
    activeSpecialId: a.user.activeSpecialId ?? null,
    activeSpecialIdLevel: null,
  }));

  const membersOnly: MemberListItem[] = permanentMembers.map((m) => ({
    id: m.id,
    displayName: m.displayName,
    avatar: m.avatar,
    username: null,
    hakaId: m.hakaId ?? null,
    equippedFrame: m.equippedFrame ?? null,
    activeSpecialId: m.activeSpecialId ?? null,
    activeSpecialIdLevel: m.activeSpecialIdLevel ?? null,
    joinedAt: m.joinedAt,
  }));

  const seenIds = new Set<string>();
  const memberList: MemberListItem[] = [];
  const pushUnique = (m: MemberListItem) => {
    if (!m?.id || seenIds.has(m.id)) return;
    seenIds.add(m.id);
    memberList.push(m);
  };

  const viewersAsMembers: MemberListItem[] = liveRoster.map((v) => ({
    id: v.id,
    displayName: v.displayName,
    avatar: v.avatar,
    username: v.username ?? null,
    hakaId: v.hakaId ?? null,
    equippedFrame: v.equippedFrame ?? null,
    activeSpecialId: v.activeSpecialId ?? null,
    activeSpecialIdLevel: v.activeSpecialIdLevel ?? null,
  }));

  // Owner + admins first, then permanent fan joins, then live socket roster.
  pushUnique(ownerEntry);
  adminsAsMembers.forEach(pushUnique);
  membersOnly.forEach(pushUnique);
  viewersAsMembers.forEach(pushUnique);

  const copyRoomId = () => {
    try {
      Clipboard.setString(roomIdDisplay);
    } catch {}
    Alert.alert('Copied', 'Room ID copied to clipboard');
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.xxl }]} onPress={() => {}}>
          <View style={styles.tabRow}>
            <TouchableOpacity onPress={() => setTab('profile')} style={styles.tabBtn}>
              <Text style={[styles.tabText, tab === 'profile' && styles.tabActive]}>Profile</Text>
              {tab === 'profile' && <View style={styles.tabBar} />}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTab('member')} style={styles.tabBtn}>
              <Text style={[styles.tabText, tab === 'member' && styles.tabActive]}>Member</Text>
              {tab === 'member' && <View style={styles.tabBar} />}
            </TouchableOpacity>
          </View>

          {tab === 'profile' ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: Spacing.md }}
              showsVerticalScrollIndicator={false}
            >
              {/* Header with host avatar + title */}
              <View style={styles.headerRow}>
                <UserAvatar
                  user={{
                    displayName: room.host.displayName,
                    avatar: room.coverImage || room.host.avatar,
                    equippedFrame: room.coverImage ? null : (room.host.equippedFrame ?? null),
                  }}
                  size={64}
                  hideFrame
                />
                <View style={{ flex: 1, marginLeft: Spacing.md }}>
                  <Text style={styles.titleText} numberOfLines={1}>
                    {room.title || room.host.displayName}
                  </Text>
                  {onChatHost && (
                    <TouchableOpacity style={styles.chatPill} onPress={onChatHost}>
                      <Ionicons name="chatbubble" size={12} color="#FFFFFF" />
                      <Text style={styles.chatPillText}>Chat</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.roomIdRow}>
                    <Text style={styles.roomIdText}>
                      Room ID: {roomIdDisplay}
                    </Text>
                    <TouchableOpacity onPress={copyRoomId} style={{ marginLeft: 6 }}>
                      <CopyIcon size={13} color="rgba(255,255,255,0.7)" />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Owner card */}
              <View style={styles.ownerCard}>
                <UserAvatar
                  user={{
                    displayName: room.host.displayName,
                    avatar: room.host.avatar,
                    equippedFrame: room.host.equippedFrame ?? null,
                  }}
                  size={36}
                  hideFrame
                />
                <View style={{ marginLeft: Spacing.md, flex: 1 }}>
                  <Text style={styles.ownerName}>{room.host.displayName}</Text>
                  <Text style={styles.ownerRole}>Room Owner</Text>
                </View>
              </View>

              {/* Announcement */}
              <Text style={styles.sectionLabel}>Announcement</Text>
              <Text style={styles.announcement}>
                {room.description?.trim() ? room.description : 'No announcement yet.'}
              </Text>

              {/* Room Customization — host/admin controls */}
              {showManagementActions && (
                <>
                  <Text style={[styles.sectionLabel, { marginTop: Spacing.lg, color: '#FFFFFF', fontWeight: '700' }]}>
                    Room Customization
                  </Text>
                  <View style={styles.grid}>
                    {customizationActions.map((a) => (
                      <TouchableOpacity
                        key={a.key}
                        style={styles.gridItem}
                        onPress={() => {
                          if (a.key === 'setting' && onOpenSettings) onOpenSettings();
                          else if (a.key === 'edit' && onOpenEditInfo) onOpenEditInfo();
                          else if (a.key === 'room_data' && onOpenRoomData) onOpenRoomData();
                          else if (a.key === 'admin' && onOpenRoomAdmin) onOpenRoomAdmin();
                          else if (a.key === 'password' && onOpenPassword) onOpenPassword();
                          else if (a.key === 'theme' && onOpenTheme) onOpenTheme();
                          else toast.comingSoon(a.label);
                        }}
                      >
                        {(a.key === 'setting' || a.key === 'room_data') ? (
                          <View style={[styles.gridIcon, styles.gridIconRaw]}>
                            {a.icon}
                          </View>
                        ) : (
                          <LinearGradient
                            colors={[...TOOL_CIRCLE_GRADIENT_COLORS]}
                            start={TOOL_CIRCLE_GRADIENT_START}
                            end={TOOL_CIRCLE_GRADIENT_END}
                            style={styles.gridIcon}
                          >
                            {a.icon}
                          </LinearGradient>
                        )}
                        <Text style={styles.gridLabel}>{a.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </ScrollView>
          ) : (
            <FlatList
              data={memberList}
              keyExtractor={(m) => m.id}
              contentContainerStyle={{ paddingTop: Spacing.md }}
              ListEmptyComponent={<Text style={styles.empty}>No members yet.</Text>}
              renderItem={({ item }) => {
                const isOwner = item.id === room.host.id;
                const isAdmin = !isOwner && adminIds.has(item.id);
                const canKick =
                  showManagementActions &&
                  canKickRoomMember({
                    isHost: !!isHost,
                    isRoomAdmin,
                    targetUserId: item.id,
                    hostId: room.host.id,
                    roomAdminIds: adminIds,
                    currentUserId,
                  });
                return (
                  <TouchableOpacity
                    style={styles.memberRow}
                    onPress={() => onMemberPress?.(item.id)}
                    activeOpacity={0.8}
                  >
                    <UserAvatar
                      user={{
                        displayName: item.displayName,
                        avatar: item.avatar,
                        equippedFrame: item.equippedFrame ?? null,
                      }}
                      size={32}
                      hideFrame
                    />
                    <View style={{ flex: 1, marginLeft: Spacing.md }}>
                      <Text style={styles.ownerName} numberOfLines={1}>
                        {item.displayName}
                      </Text>
                    </View>
                    {isOwner ? (
                      <View style={[styles.rolePill, styles.rolePillOwner]}>
                        <RoomOwnerBadge size={10} />
                        <Text style={styles.rolePillText}>Room Owner</Text>
                      </View>
                    ) : isAdmin ? (
                      <View style={[styles.rolePill, styles.rolePillAdmin]}>
                        <RoomAdminBadge size={10} />
                        <Text style={styles.rolePillText}>Room Admin</Text>
                      </View>
                    ) : null}
                    {canKick ? (
                      <TouchableOpacity
                        style={styles.kickBtn}
                        onPress={() => onKickMember?.(item)}
                      >
                        <Ionicons name="person-remove-outline" size={13} color="#FFFFFF" />
                        <Text style={styles.kickText}>Kick</Text>
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                );
              }}
            />
          )}

          {/* Footer — hidden when management grid replaces it */}
          {!showManagementActions && <View style={styles.footer}>
            <View style={[styles.footerBtn, styles.footerBtnDisabled]}>
              <Ionicons name="settings-outline" size={20} color="rgba(255,255,255,0.35)" />
              <Text style={[styles.footerText, { color: 'rgba(255,255,255,0.35)' }]}>Settings</Text>
            </View>
            <TouchableOpacity style={styles.footerBtn} onPress={onShare}>
              <Ionicons name="arrow-redo-outline" size={20} color="#FFFFFF" />
              <Text style={styles.footerText}>Share</Text>
            </TouchableOpacity>
          </View>}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const SHEET_BG = '#1A1530';

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    maxHeight: '70%',
    minHeight: '65%',
  },

  tabRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.xl,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
  },
  tabBtn: { alignItems: 'center' },
  tabText: { color: 'rgba(255,255,255,0.55)', fontSize: 15, fontWeight: '600' },
  tabActive: { color: '#FFFFFF' },
  tabBar: {
    height: 2, width: 26, backgroundColor: '#FFFFFF',
    borderRadius: 1, marginTop: 4,
  },

  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.lg },
  headerAvatar: { width: 64, height: 64, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.08)' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  titleText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  chatPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#7B4FFF',
    borderRadius: 999,
    paddingHorizontal: 10, paddingVertical: 3,
    marginTop: 4,
  },
  chatPillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  roomIdRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  roomIdText: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },

  ownerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  ownerAvatar: { width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  ownerName: { flexShrink: 1, color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  ownerRole: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },

  sectionLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 6 },
  announcement: { color: '#FFFFFF', fontSize: 14, lineHeight: 20 },

  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)' },
  miniPill: {
    flexDirection: 'row', alignItems: 'center',
    height: 16, borderRadius: 8,
    paddingHorizontal: 5, gap: 2,
  },
  miniPillText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  miniFlagWrap: {
    width: 18, height: 18, borderRadius: 9,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  miniFlagImg: { width: 26, height: 18 },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: Spacing.sm,
  },
  rolePillOwner: { backgroundColor: '#E8A020' },
  rolePillAdmin: { backgroundColor: Colors.primary },
  rolePillText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  kickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderRadius: Radius.full,
    paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: Colors.danger,
    marginLeft: Spacing.sm,
  },
  kickText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  empty: { color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center', marginTop: Spacing.xl },

  footer: {
    flexDirection: 'row', justifyContent: 'space-around',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: Spacing.md, marginTop: Spacing.md,
  },
  footerBtn: { alignItems: 'center', gap: 4 },
  footerBtnDisabled: { opacity: 0.5 },
  footerText: { color: '#FFFFFF', fontSize: 12 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: Spacing.sm },
  gridItem: { width: '25%', alignItems: 'center', marginBottom: Spacing.lg },
  gridIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(217, 217, 217, 0.27)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  gridIconRaw: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  gridLabel: { color: '#FFFFFF', fontSize: 11, marginTop: 6, textAlign: 'center' },
});
