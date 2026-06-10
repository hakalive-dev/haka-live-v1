import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardStickyFooter } from '@components/keyboard';
import { useKeyboardState } from 'react-native-keyboard-controller';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import EmojiPicker from 'rn-emoji-keyboard';
import { useSelector } from 'react-redux';

import { agencyApi } from '@api/agency';
import { chatApi } from '@api/chat';
import { dmMessagesQuery } from '@api/prefetch';
import { queryKeys } from '@api/queryKeys';
import { formatApiError } from '@api/client';
import { logDiagnostic } from '@/diagnostics/releaseDiagnostics';
import { roomsApi } from '@api/rooms';
import { usersApi } from '@api/users';
import { walletApi } from '@api/wallet';
import { Colors, Radius, Spacing } from '@/theme';
import { ChatBubbleSkeleton } from '@components/Skeleton';
import { DmImageBubble } from '@components/chat/DmImageBubble';
import { DmMessageRow, dmMessageBubbleStyles } from '@components/chat/DmMessageRow';
import { DmDeletedBubble } from '@components/chat/DmDeletedBubble';
import { DmForwardPicker } from '@components/chat/DmForwardPicker';
import { DmMessageActionSheet } from '@components/chat/DmMessageActionSheet';
import { UserAvatar } from '@components/UserAvatar';
import { WithdrawalMessageCard } from '@components/chat/WithdrawalMessageCard';
import { DmGiftMessageBubble } from '@components/gifts/DmGiftMessageBubble';
import { DmGiftPopEffect, type DmGiftPopItem } from '@components/gifts/DmGiftPopEffect';
import {
  GiftEffectOverlay,
  isBagGiftCategory,
  mergeDmGiftPopQueueSorted,
  normalizeGiftCoinCost,
} from '@components/gifts/GiftEffectOverlay';
import { giftsApi } from '@api/gifts';
import { invalidateChatUnreadQueries, useDMConnection } from '@hooks/useDMConnection';
import { useDmMessageActions } from '@hooks/useDmMessageActions';
import { useQueryClient } from '@tanstack/react-query';
import { useGiftEffectPlayback } from '@hooks/useGiftEffectPlayback';
import { invalidateUserLevels } from '@hooks/queries/useLevelQueries';
import { GiftPanel, type GiftRecipient } from '../room/GiftPanel';
import { PhotoViewerModal } from '../room/PhotoViewerModal';
import { DMPhotoShareOverlay } from './DMPhotoShareOverlay';
import type { RootState } from '@store/index';
import type { RootStackScreenProps } from '@navigation/types';
import { getActiveRoomIdFromNavigation } from '@navigation/roomNavigation';
import { useRoomSession } from '@/room/RoomSessionProvider';
import type { DirectMessage, Gift, TeamAnnouncementPayload } from '@/types';
import {
  coinTransferDmBody,
  parseLegacyDmJson,
  resolveStructuredDmCard,
  sellerRechargeApprovedDmBody,
  supportReplyDmBody,
  withdrawalUpdateDmPayload,
} from '@/utils/dmContent';
import { HAKA_LOGO_MARK } from '@/constants/app-logo';
import { isHakaTeamUserId } from '@/constants/haka-team';
import {
  isWithdrawalMessageUserId,
  WITHDRAWAL_MESSAGE_AVATAR,
} from '@/constants/withdrawal-message';
import { startVideoCall } from '@/utils/videoCall';

type Props = RootStackScreenProps<'DMConversation'>;

const HAKA_OFFICIAL_BADGE = require('../../../assets/official_badge.png');

// 30s is enough for the online/last-seen header and join banner; 10s tripled
// the request volume of every open DM with no real UX benefit.
const PRESENCE_POLL_MS = 30_000;

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
}

function formatLastSeen(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function parseAgencyDmPayload(content: string): { kind: string } & Record<string, unknown> | null {
  try {
    const o = JSON.parse(content) as { kind?: string } & Record<string, unknown>;
    if (o?.kind === 'agent_application' || o?.kind === 'sub_agent_invite') return o as { kind: string } & Record<string, unknown>;
    return null;
  } catch {
    return null;
  }
}

function joinBannerText(gender: string | null | undefined): string {
  const g = (gender ?? '').toLowerCase();
  if (g === 'male') return 'He is chatting now. Join and have fun!';
  if (g === 'female') return 'She is chatting now. Join and have fun!';
  return "They're chatting now. Join and have fun!";
}

function shouldShowTimestamp(messages: DirectMessage[], index: number): boolean {
  if (index === 0) return true;
  const curr = new Date(messages[index].createdAt);
  const prev = new Date(messages[index - 1].createdAt);
  // Show timestamp if more than 5 minutes apart
  return curr.getTime() - prev.getTime() > 5 * 60 * 1000;
}

export function DMConversationScreen({ route, navigation }: Props) {
  const { userId, displayName } = route.params;
  const insets = useSafeAreaInsets();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const hakaPeer = isHakaTeamUserId(userId);
  const withdrawalPeer = isWithdrawalMessageUserId(userId);
  const systemPeer = hakaPeer || withdrawalPeer;

  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [giftVisible, setGiftVisible] = useState(false);
  const [coinBalance, setCoinBalance] = useState(0);
  const [teamAnnouncement, setTeamAnnouncement] = useState<TeamAnnouncementPayload | null>(null);
  const [agencyActionId, setAgencyActionId] = useState<string | null>(null);
  /** Hide Approve/Reject after success (DM body does not update when application is approved server-side). */
  const [settledAgentApplicationIds, setSettledAgentApplicationIds] = useState<Record<string, true>>({});
  const [settledSubAgentInviteIds, setSettledSubAgentInviteIds] = useState<Record<string, true>>({});
  const [presence, setPresence] = useState<{
    isOnline: boolean;
    lastSeenAt: string | null;
    activeRoom: {
      id: string;
      roomMode: 'chat' | 'live';
      isLocked: boolean;
      hostId: string;
      title?: string;
    } | null;
  }>({
    isOnline: false,
    lastSeenAt: null,
    activeRoom: null,
  });
  const [peerGender, setPeerGender] = useState<string | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [selection, setSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [photoShareVisible, setPhotoShareVisible] = useState(false);
  const [photoShareAsset, setPhotoShareAsset] = useState<{
    uri: string;
    width: number;
    height: number;
    mimeType?: string;
    fileName?: string;
  } | null>(null);
  const [photoViewerUri, setPhotoViewerUri] = useState<string | null>(null);
  const listRef = useRef<FlatList<DirectMessage>>(null);
  const [footerHeight, setFooterHeight] = useState(0);
  const keyboardHeight = useKeyboardState((s) => s.height);
  const keyboardVisible = useKeyboardState((s) => s.isVisible);
  const composerSafePad = insets.bottom + Spacing.sm;
  const [popQueue, setPopQueue] = useState<DmGiftPopItem[]>([]);
  const activePop = popQueue[0] ?? null;
  const [joinBusy, setJoinBusy] = useState(false);

  const { specialEffect, advanceGiftEffectQueue, playGiftEffect } = useGiftEffectPlayback();
  const giftCatalogueRef = useRef<Gift[]>([]);

  const queryClient = useQueryClient();
  const { dmEvent, teamAnnouncementRevision } = useDMConnection();
  const roomSession = useRoomSession();

  const {
    actionSheetVisible,
    forwardPickerVisible,
    availability,
    openActions,
    closeActionSheet,
    onActionSelect,
    setForwardPickerVisible,
    handleForwardSelect,
  } = useDmMessageActions({
    currentUserId: currentUser?.id,
    threadPartnerId: userId,
    messages,
    setMessages,
  });

  const otherSender = useMemo(() => {
    const match = messages.find((m) => m.sender.id === userId);
    return {
      avatar: match?.sender.avatar ?? null,
      hakaId: match?.sender.hakaId ?? null,
    };
  }, [messages, userId]);

  const giftRecipient: GiftRecipient = {
    id: userId,
    displayName,
    avatar: otherSender.avatar,
  };

  useEffect(() => {
    giftsApi
      .catalogue()
      .then((data) => {
        giftCatalogueRef.current = data;
      })
      .catch(() => {});
  }, []);

  const openGifts = useCallback(async () => {
    try {
      const bal = await walletApi.getBalance();
      setCoinBalance(bal.coinBalance ?? 0);
    } catch {}
    setGiftVisible(true);
  }, []);

  const openEmojiPicker = useCallback(() => {
    Keyboard.dismiss();
    setEmojiOpen(true);
  }, []);

  const handleEmojiSelected = useCallback(
    ({ emoji }: { emoji: string }) => {
      setText((prev) => {
        const start = Math.min(selection.start, prev.length);
        const end = Math.min(selection.end, prev.length);
        const next = prev.slice(0, start) + emoji + prev.slice(end);
        const caret = start + emoji.length;
        setSelection({ start: caret, end: caret });
        return next;
      });
    },
    [selection.start, selection.end],
  );

  const handleSelectionChange = useCallback(
    (e: { nativeEvent: { selection: { start: number; end: number } } }) => {
      setSelection(e.nativeEvent.selection);
    },
    [],
  );

  const launchPicker = useCallback(
    async (source: 'camera' | 'library') => {
      try {
        if (source === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permission needed', 'Allow camera access to take a photo.');
            return;
          }
        } else {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('Permission needed', 'Allow photo access to share a photo.');
            return;
          }
        }

        const picked =
          source === 'camera'
            ? await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                quality: 0.85,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.85,
                ...(Platform.OS === 'ios' && {
                  presentationStyle:
                    ImagePicker.UIImagePickerPresentationStyle.OVER_FULL_SCREEN,
                }),
              });

        if (picked.canceled || !picked.assets?.[0]) return;
        const a = picked.assets[0];
        setPhotoShareAsset({
          uri: a.uri,
          width: a.width ?? 1,
          height: a.height ?? 1,
          mimeType: a.mimeType,
          fileName: a.fileName ?? undefined,
        });
        setPhotoShareVisible(true);
      } catch (err: unknown) {
        Alert.alert('Error', err instanceof Error ? err.message : 'Failed to open photo picker');
      }
    },
    [],
  );

  const handleAttachPress = useCallback(() => {
    Keyboard.dismiss();
    Alert.alert('Share Photo', undefined, [
      { text: 'Take Photo', onPress: () => launchPicker('camera') },
      { text: 'Choose from Library', onPress: () => launchPicker('library') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [launchPicker]);

  const enqueuePop = useCallback((gift: Gift, qty: number) => {
    const playCount = Math.max(1, Math.min(50, Math.floor(qty)));
    const baseId = Date.now();
    const coinCost = normalizeGiftCoinCost(gift);
    const entries: DmGiftPopItem[] = Array.from({ length: playCount }, (_, i) => ({
      id: `${baseId}-${i}-${Math.random().toString(36).slice(2, 9)}`,
      giftIcon: gift.icon,
      giftImage: gift.image ?? null,
      coinCost,
    }));
    setPopQueue((prev) => mergeDmGiftPopQueueSorted(prev, entries));
  }, []);

  const advancePop = useCallback(() => {
    setPopQueue((prev) => (prev.length > 0 ? prev.slice(1) : prev));
  }, []);

  const playGiftAnimation = useCallback(
    (gift: Gift, qty: number, senderName: string) => {
      const hasSvga =
        typeof gift.svgaAsset === 'string' && gift.svgaAsset.trim().length > 0;
      if (isBagGiftCategory(gift.category) && !hasSvga) {
        enqueuePop(gift, qty);
      } else {
        playGiftEffect(gift, qty, senderName);
      }
    },
    [enqueuePop, playGiftEffect],
  );

  const playSenderGiftAnimation = useCallback(
    (gift: Gift, qty: number) => {
      playGiftAnimation(gift, qty, currentUser?.displayName ?? 'You');
    },
    [playGiftAnimation, currentUser?.displayName],
  );

  const resolveGiftFromMessage = useCallback((msg: DirectMessage): Gift => {
    const fromCatalogue = msg.giftId
      ? giftCatalogueRef.current.find((g) => g.id === msg.giftId)
      : undefined;
    if (fromCatalogue) return fromCatalogue;
    return {
      id: msg.giftId ?? '',
      name: msg.giftName ?? 'Gift',
      icon: msg.giftIcon ?? '',
      image: msg.giftImage ?? null,
      svgaAsset: null,
      coinCost: normalizeGiftCoinCost({ coinCost: msg.giftCoinCost }),
      beanValue: 0,
      category: 'bag',
      animationType: '',
      soundKey: '',
      order: 0,
    };
  }, []);

  const playIncomingGiftAnimation = useCallback(
    (msg: DirectMessage) => {
      const gift = resolveGiftFromMessage(msg);
      const senderName = msg.sender.displayName ?? msg.sender.username ?? 'User';
      playGiftAnimation(gift, msg.giftQty ?? 1, senderName);
    },
    [playGiftAnimation, resolveGiftFromMessage],
  );

  const handleSendGift = useCallback(
    async (gift: Gift, qty: number, recipient: GiftRecipient) => {
      playSenderGiftAnimation(gift, qty);
      try {
        const dm = await chatApi.sendGiftDM(recipient.id, gift.id, qty);
        setMessages((prev) => [...prev, dm]);
        setCoinBalance((b) => Math.max(0, b - gift.coinCost * qty));
        invalidateUserLevels(currentUser?.id, recipient.id);
      } catch {}
    },
    [playSenderGiftAnimation, currentUser?.id],
  );

  // Load message history. Sources from fetchQuery so an inbox-row prefetch is
  // reused (deduped) and a prefetched thread opens with messages already on
  // screen; and surfaces failures (with retry) instead of silently rendering an
  // empty thread — a 429/network/SSL error used to look identical to "no msgs".
  const loadMessages = useCallback(() => {
    setLoading(true);
    setLoadError(null);
    queryClient
      .fetchQuery(dmMessagesQuery(userId))
      .then(({ items }) => {
        setMessages(items);
        setLoading(false);
      })
      .catch((err: unknown) => {
        logDiagnostic('api_http', 'dm_history_load_failed', {
          peerId: userId,
          message: err instanceof Error ? err.message : String(err),
        });
        setLoadError(formatApiError(err));
        setLoading(false);
      });
  }, [userId, queryClient]);

  // Load message history + mark as read
  useEffect(() => {
    loadMessages();
    chatApi
      .markAsRead(userId)
      .then(() => invalidateChatUnreadQueries(queryClient))
      .catch((err: unknown) =>
        logDiagnostic('api_http', 'dm_mark_read_failed', {
          peerId: userId,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
  }, [loadMessages, userId, queryClient]);

  // Drop the cached thread on unmount: realtime/optimistic messages live in
  // local state (not the cache), so a quick revisit must refetch fresh rather
  // than serve a stale snapshot missing the latest messages. Prefetch-on-press
  // repopulates it instantly on the next open.
  useEffect(() => {
    return () => {
      queryClient.removeQueries({ queryKey: queryKeys.chat.dmMessages(userId) });
    };
  }, [userId, queryClient]);

  // Load pinned team announcement (Haka Team chat only)
  useEffect(() => {
    if (!hakaPeer) return;
    chatApi
      .getTeamAnnouncement()
      .then((r) => setTeamAnnouncement(r.announcement))
      .catch((err: unknown) => {
        logDiagnostic('api_http', 'dm_team_announcement_failed', {
          message: err instanceof Error ? err.message : String(err),
        });
        setTeamAnnouncement(null);
      });
  }, [hakaPeer, teamAnnouncementRevision]);

  // Render announcement as a normal chat message and mark as read once shown.
  const announcementDm = useMemo<DirectMessage | null>(() => {
    if (!hakaPeer || !teamAnnouncement) return null;
    const current = currentUser;
    if (!current?.id) return null;
    return {
      id: `team-announcement-${teamAnnouncement.id}`,
      sender: {
        id: userId,
        username: null,
        displayName,
        avatar: otherSender.avatar ?? null,
        hakaId: otherSender.hakaId ?? null,
      } as unknown as DirectMessage['sender'],
      recipient: {
        id: current.id,
        username: current.username ?? null,
        displayName: current.displayName ?? 'You',
        avatar: current.avatar ?? null,
        hakaId: current.hakaId ?? null,
      } as unknown as DirectMessage['recipient'],
      content: `${teamAnnouncement.title}\n\n${teamAnnouncement.body}`,
      isRead: true,
      createdAt: teamAnnouncement.publishedAt,
      messageType: 'system_notice',
    } as unknown as DirectMessage;
  }, [
    hakaPeer,
    teamAnnouncement,
    currentUser,
    userId,
    displayName,
    otherSender.avatar,
    otherSender.hakaId,
  ]);

  const displayedMessages = useMemo(() => {
    if (!announcementDm) return messages;
    const has = messages.some((m) => m.id === announcementDm.id);
    return has ? messages : [announcementDm, ...messages];
  }, [announcementDm, messages]);

  useEffect(() => {
    if (!hakaPeer || !teamAnnouncement || teamAnnouncement.isRead) return;
    void chatApi
      .markTeamAnnouncementRead(teamAnnouncement.id)
      .then(() => setTeamAnnouncement((a) => (a ? { ...a, isRead: true } : a)))
      .catch(() => {});
  }, [hakaPeer, teamAnnouncement]);

  useEffect(() => {
    if (systemPeer) return;
    usersApi
      .profile(userId)
      .then((u) => setPeerGender(u.gender ?? null))
      .catch((err: unknown) =>
        logDiagnostic('api_http', 'dm_peer_profile_failed', {
          peerId: userId,
          message: err instanceof Error ? err.message : String(err),
        }),
      );
  }, [userId, systemPeer]);

  // Presence is polled every 10s; intentionally not logged on failure to avoid
  // flooding the capped diagnostic buffer. It is non-critical (drives only the
  // online/last-seen line and join banner) and self-heals on the next tick.
  const loadPresence = useCallback(() => {
    if (systemPeer) return;
    usersApi
      .presence(userId)
      .then((p) => setPresence(p))
      .catch(() => {});
  }, [userId, systemPeer]);

  const peerActiveRoom = presence.activeRoom;
  const myActiveRoomId =
    getActiveRoomIdFromNavigation() ?? roomSession.session?.roomId ?? undefined;
  const showPeerJoinBanner = useMemo(
    () =>
      !systemPeer &&
      !!peerActiveRoom &&
      myActiveRoomId !== peerActiveRoom.id,
    [systemPeer, peerActiveRoom, myActiveRoomId],
  );

  // Poll peer presence while this screen is open (faster refresh for join banner).
  useEffect(() => {
    if (systemPeer) return;
    loadPresence();
    const iv = setInterval(loadPresence, PRESENCE_POLL_MS);
    return () => clearInterval(iv);
  }, [systemPeer, loadPresence]);

  useFocusEffect(
    useCallback(() => {
      loadPresence();
    }, [loadPresence]),
  );

  const navigateToPeerRoom = useCallback(
    (room: NonNullable<typeof peerActiveRoom>) => {
      navigation.navigate('RoomModal', {
        screen: 'Room',
        params: {
          roomId: room.id,
          roomMode: room.roomMode ?? 'chat',
          isLocked: room.isLocked,
          hostId: room.hostId,
        },
      });
    },
    [navigation],
  );

  const handleJoinPeerRoom = useCallback(async () => {
    const room = peerActiveRoom;
    if (!room || joinBusy) return;

    const alreadyHere =
      getActiveRoomIdFromNavigation() === room.id ||
      roomSession.session?.roomId === room.id;
    if (alreadyHere) {
      navigateToPeerRoom(room);
      return;
    }

    if (roomSession.session?.roomId && roomSession.session.roomId !== room.id) {
      roomSession.stopSession();
    }

    setJoinBusy(true);
    try {
      await roomsApi.joinRoom(room.id);
    } catch {
      /* RoomScreen still allows manual join */
    } finally {
      setJoinBusy(false);
    }

    navigateToPeerRoom(room);
  }, [peerActiveRoom, joinBusy, roomSession, navigateToPeerRoom]);

  // Receive live incoming DMs
  useEffect(() => {
    if (!dmEvent || dmEvent.event !== 'new_dm') return;
    const msg = dmEvent.data as unknown as DirectMessage;
    if (msg.sender.id !== userId && msg.recipient.id !== userId) return;
    setMessages((prev) => [...prev, msg]);
    if (msg.messageType === 'gift' && msg.sender.id === userId) {
      playIncomingGiftAnimation(msg);
    }
    if (!systemPeer) loadPresence();
  }, [dmEvent, userId, systemPeer, loadPresence, playIncomingGiftAnimation]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setText('');
    setSending(true);
    try {
      const sent = await chatApi.sendDM(userId, trimmed);
      setMessages((prev) => [...prev, sent]);
    } catch {}
    setSending(false);
  }, [text, sending, userId]);

  const otherUserAvatar = otherSender.avatar;

  /** Minimum chrome: input row + inputBar top pad + nav safe area (before onLayout). */
  const minFooterHeight = useMemo(
    () => 40 + Spacing.md + composerSafePad,
    [composerSafePad],
  );

  const listPaddingBottom = useMemo(() => {
    const chrome = Math.max(footerHeight, minFooterHeight);
    const messageGap = Spacing.lg;
    if (keyboardVisible) {
      return chrome + keyboardHeight + messageGap;
    }
    return chrome + messageGap;
  }, [footerHeight, minFooterHeight, keyboardVisible, keyboardHeight]);

  const listFooterSpacer = useMemo(
    () => <View style={{ height: listPaddingBottom }} />,
    [listPaddingBottom],
  );

  const handleFooterLayout = useCallback(
    (e: { nativeEvent: { layout: { height: number } } }) => {
      const h = e.nativeEvent.layout.height;
      if (h > 0) setFooterHeight((prev) => (Math.abs(prev - h) < 1 ? prev : h));
    },
    [],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: keyboardVisible });
    }, 50);
    return () => clearTimeout(t);
  }, [keyboardVisible, keyboardHeight, listPaddingBottom]);

  const screenBody = (
    <>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        {hakaPeer ? (
          <View style={styles.headerCenter}>
            <View style={styles.headerAvatarWrap}>
              <UserAvatar
                user={{
                  displayName,
                  avatar: otherUserAvatar,
                }}
                localAvatar={HAKA_LOGO_MARK}
                hideFrame
                hideBorder
                size={36}
              />
            </View>
            <View>
              <View style={styles.headerNameRow}>
                <Text style={styles.headerName}>{displayName}</Text>
                <Image
                  source={HAKA_OFFICIAL_BADGE}
                  style={styles.hakaOfficialPill}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              </View>
              <Text style={styles.headerOffline}>One-way messages from Haka Team</Text>
            </View>
          </View>
        ) : withdrawalPeer ? (
          <View style={styles.headerCenter}>
            <View style={styles.headerAvatarWrap}>
              <UserAvatar
                user={{
                  displayName,
                  avatar: otherUserAvatar,
                }}
                localAvatar={WITHDRAWAL_MESSAGE_AVATAR}
                hideFrame
                hideBorder
                size={36}
              />
            </View>
            <View>
              <Text style={styles.headerName}>{displayName}</Text>
              <Text style={styles.headerOffline}>Withdrawal updates</Text>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.headerCenter}
            onPress={() => navigation.navigate('PublicProfile', { userId })}
          >
            <View style={styles.headerAvatarWrap}>
              <UserAvatar
                user={{
                  displayName,
                  avatar: otherUserAvatar,
                }}
                hideFrame
                hideBorder
                size={36}
              />
            </View>
            <View>
              <View style={styles.headerNameRow}>
                <Text style={styles.headerName}>{displayName}</Text>
              </View>
              <Text style={[styles.headerOnline, !presence.isOnline && styles.headerOffline]}>
                {presence.isOnline
                  ? 'Online'
                  : presence.lastSeenAt
                  ? `Last seen ${formatLastSeen(presence.lastSeenAt)}`
                  : 'Offline'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        {!systemPeer ? (
          <View style={styles.headerActions}>
            <TouchableOpacity
              hitSlop={8}
              style={styles.headerVideoBtn}
              onPress={() => void startVideoCall(userId, displayName)}
            >
              <Ionicons name="videocam" size={22} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              hitSlop={8}
              style={styles.profileLink}
              onPress={() => navigation.navigate('PublicProfile', { userId })}
            >
              <Text style={styles.profileLinkText}>Profile</Text>
              <Ionicons name="chevron-forward" size={14} color="#666" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ width: 56 }} />
        )}
      </View>

      {/* Join room banner — peer is in a live room and viewer is not already there */}
      {showPeerJoinBanner && peerActiveRoom ? (
        <View style={styles.joinBanner}>
          <Ionicons name="mic" size={16} color={Colors.primary} />
          <Text style={styles.joinBannerText} numberOfLines={1}>
            {joinBannerText(peerGender)}
          </Text>
          <TouchableOpacity
            style={[styles.joinBtn, joinBusy && styles.joinBtnDisabled]}
            onPress={() => void handleJoinPeerRoom()}
            disabled={joinBusy}
          >
            <Text style={styles.joinBtnText}>Join {'>'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.listFlex}>
      {loading ? (
        <ChatBubbleSkeleton rows={6} />
      ) : loadError ? (
        <View style={styles.errorBox}>
          <Ionicons name="cloud-offline-outline" size={32} color="#999" />
          <Text style={styles.errorText}>Couldn't load messages</Text>
          <Text style={styles.errorSubtext}>{loadError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadMessages}>
            <Ionicons name="refresh" size={16} color="#FFF" />
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={displayedMessages}
          keyExtractor={(m) => m.id}
          style={styles.listFlex}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={listFooterSpacer}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          maxToRenderPerBatch={15}
          windowSize={21}
          removeClippedSubviews
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>No messages yet. Say hi!</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const isMine = item.sender.id === currentUser?.id;
            const showTime = shouldShowTimestamp(displayedMessages, index);
            const mineUser = {
              displayName: currentUser?.displayName ?? 'You',
              avatar: currentUser?.avatar ?? null,
            };
            const theirsUser = {
              displayName: item.sender.displayName,
              avatar: item.sender.avatar ?? null,
            };

            const structuredCard = resolveStructuredDmCard(item.messageType, item.content);
            const bubbleMaxWidthRatio =
              structuredCard === 'withdrawal_update'
                ? 0.64
                : item.messageType === 'agent_application' ||
                    item.messageType === 'sub_agent_invite' ||
                    structuredCard === 'coin_transfer' ||
                    structuredCard === 'seller_recharge_approved' ||
                    structuredCard === 'support_reply'
                  ? 0.92
                  : undefined;

            const bubbleContent = item.isDeleted ? (
              <DmDeletedBubble isMine={isMine} />
            ) : resolveStructuredDmCard(item.messageType, item.content) === 'coin_transfer' ? (
                (() => {
                  const parsed = coinTransferDmBody(item.content);
                  const legacy = parseLegacyDmJson(item.content);
                  const cardTitle =
                    legacy?.source === 'offline_recharge'
                      ? 'Transfer complete'
                      : 'Coins received';
                  const label =
                    parsed?.label ??
                    (item.content.trim().startsWith('{')
                      ? 'Coins were added to your balance.'
                      : item.content);
                  return (
                    <View style={[styles.bubble, styles.bubbleAgencyCard]}>
                      <Text style={styles.bubbleAgencyTitle}>{cardTitle}</Text>
                      <Text style={styles.bubbleAgencyBody}>{label}</Text>
                    </View>
                  );
                })()
              ) : resolveStructuredDmCard(item.messageType, item.content) ===
                'seller_recharge_approved' ? (
                <View style={[styles.bubble, styles.bubbleAgencyCard]}>
                  <Text style={styles.bubbleAgencyTitle}>Recharge approved</Text>
                  <Text style={styles.bubbleAgencyBody}>
                    {sellerRechargeApprovedDmBody(item.content)}
                  </Text>
                </View>
              ) : resolveStructuredDmCard(item.messageType, item.content) === 'support_reply' ? (
                <View style={[styles.bubble, styles.bubbleAgencyCard]}>
                  <Text style={styles.bubbleAgencyTitle}>Support reply</Text>
                  <Text style={styles.bubbleAgencyBody}>
                    {supportReplyDmBody(item.content)}
                  </Text>
                </View>
              ) : resolveStructuredDmCard(item.messageType, item.content) === 'withdrawal_update' ? (
                (() => {
                  const payload = withdrawalUpdateDmPayload(item.content);
                  if (!payload) {
                    return (
                      <View style={[styles.bubble, styles.bubbleAgencyCard]}>
                        <Text style={styles.bubbleAgencyBody}>Withdrawal update</Text>
                      </View>
                    );
                  }
                  return (
                    <View style={styles.withdrawalCardWrap}>
                      <WithdrawalMessageCard
                        payload={payload}
                        onFooterPress={() =>
                          navigation.navigate('WithdrawalDetail', {
                            withdrawalId: payload.withdrawalId,
                          })
                        }
                      />
                    </View>
                  );
                })()
              ) : item.messageType === 'gift' ? (
                <DmGiftMessageBubble
                  giftIcon={item.giftIcon}
                  giftImage={item.giftImage}
                  giftName={item.giftName}
                  giftQty={item.giftQty ?? 1}
                  isMine={isMine}
                />
              ) : item.messageType === 'image' && item.mediaUrl ? (
                <DmImageBubble
                  mediaUrl={item.mediaUrl}
                  caption={item.content}
                  isMine={isMine}
                  onPress={() => setPhotoViewerUri(item.mediaUrl ?? null)}
                />
              ) : item.messageType === 'agent_application' || item.messageType === 'sub_agent_invite' ? (
                (() => {
                  const payload = parseAgencyDmPayload(item.content);
                  const isAgentApp = item.messageType === 'agent_application';
                  const applicationId =
                    isAgentApp && typeof payload?.applicationId === 'string'
                      ? String(payload.applicationId)
                      : '';
                  const invitationId =
                    item.messageType === 'sub_agent_invite' && typeof payload?.invitationId === 'string'
                      ? String(payload.invitationId)
                      : '';
                  const agentAppSettled = applicationId ? settledAgentApplicationIds[applicationId] : false;
                  const inviteSettled = invitationId ? settledSubAgentInviteIds[invitationId] : false;
                  const canActAgentApp =
                    isAgentApp &&
                    currentUser?.id === item.recipient?.id &&
                    applicationId &&
                    !agentAppSettled;
                  const canActInvite =
                    item.messageType === 'sub_agent_invite' &&
                    currentUser?.id === item.recipient?.id &&
                    invitationId &&
                    !inviteSettled;
                  const busy = agencyActionId === item.id;
                  const markAgentAppSettled = () => {
                    if (applicationId) {
                      setSettledAgentApplicationIds((p) => ({ ...p, [applicationId]: true }));
                    }
                  };
                  const markInviteSettled = () => {
                    if (invitationId) {
                      setSettledSubAgentInviteIds((p) => ({ ...p, [invitationId]: true }));
                    }
                  };
                  const isAlreadyHandledError = (e: unknown) => {
                    const msg = e instanceof Error ? e.message : String(e);
                    return /no longer pending/i.test(msg);
                  };
                  return (
                    <View style={[styles.bubble, styles.bubbleAgencyCard]}>
                      <Text style={styles.bubbleAgencyTitle}>
                        {isAgentApp ? 'Sub-agent application' : 'Sub-agent invitation'}
                      </Text>
                      <Text style={styles.bubbleAgencyBody}>
                        {isAgentApp
                          ? `${String(payload?.applicantName ?? 'Someone')} wants to create agency “${String(payload?.proposedName ?? '')}”.`
                          : `${String(payload?.inviterName ?? 'An agency')} invited you under “${String(payload?.agencyName ?? '')}” (ID ${String(payload?.agencyId ?? '').slice(0, 8)}…).`}
                      </Text>
                      {agentAppSettled || inviteSettled ? (
                        <Text style={styles.agencySettledHint}>Handled</Text>
                      ) : null}
                      {canActAgentApp ? (
                        <View style={styles.agencyBtnRow}>
                          <TouchableOpacity
                            style={[styles.agencyApproveBtn, busy && styles.agencyBtnDisabled]}
                            disabled={busy}
                            onPress={() => {
                              setAgencyActionId(item.id);
                              agencyApi
                                .approveAgentApplication(applicationId, '')
                                .then(() => {
                                  markAgentAppSettled();
                                  return chatApi.getDMMessages(userId).then(({ items }) => setMessages(items));
                                })
                                .catch((e: unknown) => {
                                  if (isAlreadyHandledError(e)) {
                                    markAgentAppSettled();
                                    void chatApi.getDMMessages(userId).then(({ items }) => setMessages(items));
                                    return;
                                  }
                                  Alert.alert('Error', e instanceof Error ? e.message : 'Request failed');
                                })
                                .finally(() => setAgencyActionId(null));
                            }}
                          >
                            <Text style={styles.agencyApproveBtnText}>Approve</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.agencyRejectBtn, busy && styles.agencyBtnDisabled]}
                            disabled={busy}
                            onPress={() => {
                              setAgencyActionId(item.id);
                              agencyApi
                                .rejectAgentApplication(applicationId, 'Rejected')
                                .then(() => {
                                  markAgentAppSettled();
                                  return chatApi.getDMMessages(userId).then(({ items }) => setMessages(items));
                                })
                                .catch((e: unknown) => {
                                  if (isAlreadyHandledError(e)) {
                                    markAgentAppSettled();
                                    void chatApi.getDMMessages(userId).then(({ items }) => setMessages(items));
                                    return;
                                  }
                                  Alert.alert('Error', e instanceof Error ? e.message : 'Request failed');
                                })
                                .finally(() => setAgencyActionId(null));
                            }}
                          >
                            <Text style={styles.agencyRejectBtnText}>Reject</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      {canActInvite ? (
                        <View style={styles.agencyBtnRow}>
                          <TouchableOpacity
                            style={[styles.agencyApproveBtn, busy && styles.agencyBtnDisabled]}
                            disabled={busy}
                            onPress={() => {
                              setAgencyActionId(item.id);
                              agencyApi
                                .acceptSubAgentInvitation(invitationId)
                                .then(() => {
                                  markInviteSettled();
                                  return chatApi.getDMMessages(userId).then(({ items }) => setMessages(items));
                                })
                                .catch((e: unknown) => {
                                  if (isAlreadyHandledError(e)) {
                                    markInviteSettled();
                                    void chatApi.getDMMessages(userId).then(({ items }) => setMessages(items));
                                    return;
                                  }
                                  Alert.alert('Error', e instanceof Error ? e.message : 'Request failed');
                                })
                                .finally(() => setAgencyActionId(null));
                            }}
                          >
                            <Text style={styles.agencyApproveBtnText}>Accept</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.agencyRejectBtn, busy && styles.agencyBtnDisabled]}
                            disabled={busy}
                            onPress={() => {
                              setAgencyActionId(item.id);
                              agencyApi
                                .declineSubAgentInvitation(invitationId)
                                .then(() => {
                                  markInviteSettled();
                                  return chatApi.getDMMessages(userId).then(({ items }) => setMessages(items));
                                })
                                .catch((e: unknown) => {
                                  if (isAlreadyHandledError(e)) {
                                    markInviteSettled();
                                    void chatApi.getDMMessages(userId).then(({ items }) => setMessages(items));
                                    return;
                                  }
                                  Alert.alert('Error', e instanceof Error ? e.message : 'Request failed');
                                })
                                .finally(() => setAgencyActionId(null));
                            }}
                          >
                            <Text style={styles.agencyRejectBtnText}>Decline</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  );
                })()
              ) : (
                <View
                  style={[
                    styles.bubble,
                    isMine ? dmMessageBubbleStyles.bubbleMine : dmMessageBubbleStyles.bubbleTheirs,
                  ]}
                >
                  <Text
                    style={[
                      dmMessageBubbleStyles.bubbleText,
                      isMine
                        ? dmMessageBubbleStyles.bubbleTextMine
                        : dmMessageBubbleStyles.bubbleTextTheirs,
                    ]}
                  >
                    {item.content}
                  </Text>
                </View>
              );

            return (
              <View>
                {showTime && (
                  <Text style={styles.timestampSeparator}>
                    {formatMessageTime(item.createdAt)}
                  </Text>
                )}

                <DmMessageRow
                  isMine={isMine}
                  mineUser={mineUser}
                  theirsUser={theirsUser}
                  isRead={item.isRead}
                  maxWidthRatio={bubbleMaxWidthRatio}
                  onBubbleLongPress={item.isDeleted ? undefined : () => openActions(item)}
                  avatarAtTop={
                    !isMine && withdrawalPeer && structuredCard === 'withdrawal_update'
                  }
                  peerLocalAvatar={
                    !isMine && hakaPeer
                      ? HAKA_LOGO_MARK
                      : !isMine && withdrawalPeer
                        ? WITHDRAWAL_MESSAGE_AVATAR
                        : undefined
                  }
                >
                  {bubbleContent}
                </DmMessageRow>
              </View>
            );
          }}
        />
      )}
      </View>

      {/* Input bar — hidden for system one-way channels */}
      {systemPeer ? (
        <KeyboardStickyFooter
          flushWhenOpen
          safeBottomPadding={insets.bottom + Spacing.sm}
          onChromeLayout={handleFooterLayout}
        >
          <View style={styles.oneWayBar}>
            <Ionicons name="information-circle-outline" size={20} color={Colors.textSecondary} />
            <Text style={styles.oneWayBarText}>
              {hakaPeer
                ? 'You cannot reply to Haka Team. For help, use Support in your profile.'
                : 'You cannot reply to Withdrawal Message. Open a card to confirm or view details.'}
            </Text>
          </View>
        </KeyboardStickyFooter>
      ) : (
        <KeyboardStickyFooter
          flushWhenOpen
          safeBottomPadding={insets.bottom + Spacing.sm}
          onChromeLayout={handleFooterLayout}
        >
          <View style={styles.inputBar}>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              onSelectionChange={handleSelectionChange}
              placeholder="Write a message"
              placeholderTextColor="#999"
              multiline
              returnKeyType="send"
              onSubmitEditing={handleSend}
            />
            <TouchableOpacity hitSlop={8} style={styles.inputIcon} onPress={openEmojiPicker}>
              <Ionicons name="happy-outline" size={22} color="#999" />
            </TouchableOpacity>
            <TouchableOpacity hitSlop={8} style={styles.inputIcon} onPress={handleAttachPress}>
              <Ionicons name="attach" size={22} color="#999" />
            </TouchableOpacity>
            <TouchableOpacity hitSlop={8} style={styles.inputIcon} onPress={openGifts}>
              <Ionicons name="gift" size={22} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!text.trim() || sending}
            >
              <Ionicons name="send" size={16} color="#FFF" />
            </TouchableOpacity>
          </View>
        </KeyboardStickyFooter>
      )}

      {activePop ? (
        <DmGiftPopEffect item={activePop} onComplete={advancePop} />
      ) : null}
      <GiftEffectOverlay effect={specialEffect} onComplete={advanceGiftEffectQueue} />

      <GiftPanel
        visible={giftVisible && !systemPeer}
        onClose={() => setGiftVisible(false)}
        onSend={handleSendGift}
        coinBalance={coinBalance}
        seatedUsers={[giftRecipient]}
        initialRecipientId={userId}
        hideMic
      />

      <EmojiPicker
        open={emojiOpen}
        onClose={() => setEmojiOpen(false)}
        onEmojiSelected={handleEmojiSelected}
        enableRecentlyUsed
        enableSearchBar
      />

      <DMPhotoShareOverlay
        visible={photoShareVisible}
        asset={photoShareAsset}
        userId={userId}
        onClose={() => {
          setPhotoShareVisible(false);
          setPhotoShareAsset(null);
        }}
        onSent={(dm) =>
          setMessages((prev) => (prev.some((m) => m.id === dm.id) ? prev : [...prev, dm]))
        }
      />

      <PhotoViewerModal
        visible={!!photoViewerUri}
        uri={photoViewerUri}
        onClose={() => setPhotoViewerUri(null)}
      />

      <DmMessageActionSheet
        visible={actionSheetVisible}
        availability={availability}
        onClose={closeActionSheet}
        onSelect={onActionSelect}
      />
      <DmForwardPicker
        visible={forwardPickerVisible}
        excludeUserId={userId}
        onClose={() => setForwardPickerVisible(false)}
        onSelect={(recipientId) => void handleForwardSelect(recipientId)}
      />
    </>
  );

  if (withdrawalPeer) {
    return (
      <LinearGradient
        colors={['#FFFFFF', '#F5F0FA', '#F3E8FF']}
        style={[styles.screen, { paddingTop: insets.top }]}
      >
        {screenBody}
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {screenBody}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  listFlex: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    gap: Spacing.xs,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerCenter: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginLeft: Spacing.sm,
  },
  headerAvatarWrap: {},
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  headerAvatarFallback: {
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatarInitial: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  headerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#000',
  },
  headerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hakaOfficialPill: {
    width: 72,
    height: 18,
    alignSelf: 'center',
  },
  headerOnline: {
    fontSize: 11,
    color: '#22C97A',
    fontWeight: '500',
  },
  headerOffline: {
    color: '#999',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerVideoBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primarySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  profileLinkText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666',
  },

  // Join banner
  joinBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(123,79,255,0.08)',
    marginHorizontal: Spacing.md,
    marginTop: Spacing.sm,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  joinBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#666',
  },
  joinBtn: {
    backgroundColor: '#22C97A',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  joinBtnDisabled: {
    opacity: 0.5,
  },
  joinBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFF',
  },

  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBox: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: '#999',
    fontSize: 14,
  },
  errorBox: {
    paddingTop: 60,
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  errorText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '600',
  },
  errorSubtext: {
    color: '#999',
    fontSize: 13,
    textAlign: 'center',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  retryBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // Timestamp
  timestampSeparator: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginVertical: Spacing.xs,
  },

  bubble: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  bubbleAgencyCard: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E8E0F5',
    paddingVertical: Spacing.md,
  },
  withdrawalCardWrap: {
    alignSelf: 'flex-start',
  },
  bubbleAgencyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: Spacing.xs,
  },
  bubbleAgencyBody: {
    fontSize: 13,
    color: '#333',
    lineHeight: 19,
    marginBottom: Spacing.sm,
  },
  agencyBtnRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  agencyApproveBtn: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  agencyApproveBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  agencyRejectBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CCC',
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  agencyRejectBtnText: { color: '#C00', fontSize: 13, fontWeight: '600' },
  agencyBtnDisabled: { opacity: 0.5 },
  agencySettledHint: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#F5F5F5',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: 14,
    color: '#000',
  },
  inputIcon: {
    height: 40,
    justifyContent: 'center',
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  oneWayBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  oneWayBarText: {
    flex: 1,
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});
