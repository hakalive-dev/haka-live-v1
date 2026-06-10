import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  Alert,
  BackHandler,
  Dimensions,
  Easing,
  FlatList,
  Image as RNImage,
  LayoutChangeEvent,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useKeyboardState } from "react-native-keyboard-controller";
import { KeyboardStickyFooter } from "@components/keyboard";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSelector } from "react-redux";

import { RoomStackScreenProps } from "@navigation/types";
import { safeGoBack } from "@/navigation/safeGoBack";
import { formatApiError } from "@api/client";
import { roomsApi } from "@api/rooms";
import { queryClient } from "@api/queryClient";
import { queryKeys } from "@api/queryKeys";
import { roomDetailQuery, roomMembershipQuery } from "@api/prefetch";
import { chatApi } from "@api/chat";
import { giftsApi } from "@api/gifts";
import { walletApi } from "@api/wallet";
import { usersApi } from "@api/users";
import { levelsApi } from "@api/levels";
import { invalidateUserLevels } from "@hooks/queries/useLevelQueries";
import { UserLevelBadges } from "@components/UserLevelBadges";
import { leaderboardApi } from "@api/leaderboard";
import { Colors, Radius, Spacing } from "@/theme";
import { DetailSkeleton } from "@components/Skeleton";
import { useToast } from "@components/Toast";
import { CopyableId } from "@components/CopyableId";
import { UserAvatar } from "@components/UserAvatar";
import { frameAvatarSizeFromHole } from "@components/AvatarFrameRing";
import { SpeakingSeatGlow } from "@components/SpeakingSeatGlow";
import { MicTimeTicker } from "@components/room/MicTimeTicker";
import { UserIdBadge } from "@components/UserIdBadge";
import { TagBadges } from "@components/TagBadges";
import { AgencyRoleBadge, RoleTagImage } from "@components/RoleTagImage";
import { ROLE_TAG_BADGE_HEIGHT } from "@components/tagBadgeAssets";
import { UsernameRoleBadges } from "@components/RoomRoleBadges";
import { canKickRoomMember, formatRoomKickBanMessage } from "@/utils/roomKick";
import { bootstrapRoomMusicFromLibrary } from "@/utils/roomMusicBootstrap";
import { normalizeSeatInvitationPayload } from "@/utils/seatInvitePayload";
import {
  isBagGiftCategory,
  isLuckyGiftCategory,
  mergeGiftEffectQueueSorted,
  normalizeGiftCoinCost,
  type GiftSpecialEffect,
} from "@components/gifts/GiftEffectOverlay";
import { GiftPanel } from "./GiftPanel";
import { preloadRemoteSvgaAssets } from "./SVGAGiftEffect";
import { useRoomSession } from "@/room/RoomSessionProvider";
import { RoomPasswordOverlay } from "./RoomPasswordOverlay";
import { InviteOverlay } from "./InviteOverlay";
import { InRoomSeatInviteBanner } from "./InRoomSeatInviteBanner";
import type { SeatInvitationPayload } from "@components/SeatInvitePrompt";
import { RoomShareOverlay } from "./RoomShareOverlay";
import { RoomPlayOverlay } from "./RoomPlayOverlay";
import { PhotoShareOverlay } from "./PhotoShareOverlay";
import { PhotoViewerModal } from "./PhotoViewerModal";
import { RICH, CHARM, getLevelColor } from "@screens/level/LevelScreen";
import PkIcon from "../../../assets/room-toolbar/pk.svg";
import AppsIcon from "../../../assets/room-toolbar/apps.svg";
import GameIcon from "../../../assets/room-toolbar/game.svg";
import GiftIcon from "../../../assets/room-toolbar/gift.svg";
import ChatBubbleIcon from "../../../assets/room-toolbar/chat-bubble.svg";
import FollowIcon from "../../../assets/room-toolbar/follow.svg";
import JoinedIcon from "../../../assets/room-toolbar/joined.svg";
import SeatIcon from "../../../assets/room-toolbar/seat.svg";
import ApplySeatIcon from "../../../assets/apply_seat.svg";
import EmojiIcon from "../../../assets/emoji.svg";
import SofaIcon from "../../../assets/seat-menu/sofa-outline.svg";
import LockIcon from "../../../assets/seat-menu/lock.svg";
import MicOffIcon from "../../../assets/seat-menu/microphone-off.svg";
import MicOnIcon from "../../../assets/seat-menu/microphone-on.svg";
import Svg, { Circle } from "react-native-svg";
const AnimatedCircle = Animated.createAnimatedComponent(Circle);
import { RoomPKOverlay, CalculatorOverlay } from "./RoomGameOverlays";
import { usePKBattle } from "@hooks/usePKBattle";
import { pkApi } from "@api/pk";
import { PKBattleOverlay } from "./components/PKBattleOverlay";
import { PKInviteModal } from "./components/PKInviteModal";
import { PKResultModal } from "./components/PKResultModal";
import { PKInviteRoomSheet } from "./components/PKInviteRoomSheet";
import { useNormalBattle } from "@hooks/useNormalBattle";
import { NormalBattleOverlay } from "./NormalBattleOverlay";
import { NormalBattleResultModal } from "./NormalBattleResultModal";
import { battleApi } from "@api/battle";
import { RoomGamesOverlay } from "./RoomGamesOverlay";
import { RoomInfoOverlay } from "./RoomInfoOverlay";
import { RoomDataOverlay } from "./RoomDataOverlay";
import { RoomAdminOverlay } from "./RoomAdminOverlay";
import { RoomThemeBackground } from "./RoomThemeBackground";
import { InboxOverlay } from "./InboxOverlay";
import { CalculatorResultModal } from "./components/CalculatorResultModal";
import { CalculatorContributorsModal } from "./components/CalculatorContributorsModal";
import { GiftNoticeRow } from "./GiftNoticeRow";
import { GiftToastStack, type GiftToastItem } from "./GiftToast";
import { SpecialGiftEffect } from "./SpecialGiftEffect";
import { SVGAGiftEffect, preloadSvgaAssets } from "./SVGAGiftEffect";
import { EntryEffectOverlay } from "./EntryEffectOverlay";
import { SeatSvgaEffect } from "./SeatSvgaEffect";
import {
  CosmeticChatBubbleShell,
  COSMETIC_CHAT_AVATAR_SIZE,
} from "@components/CosmeticChatBubbleShell";
import { MicVoiceWaveEffect } from "@components/MicVoiceWaveEffect";
import type { AvatarUser } from "@components/UserAvatar";
import {
  SEAT_ICON_SCALE,
  SEAT_ITEM_EXTRA_WIDTH,
  computeSeatLayout,
  computeSeatTopOffset,
  estimateSeatBlockBottomPx,
  getRoomSeatRows,
  getSeatCellExtent,
  getSeatHorizontalPad,
  isFlatMicGrid,
  SEAT_AVATAR_FRAME_SCALE,
} from "./seatLayout";
import { NORMAL_EMOJIS, SVIP_EMOJIS, SVGA_EMOJIS_BY_KEY } from "./svgaEmojis";
import type { RootState } from "@store/index";
import {
  getGenderPillGradient,
  getGenderPillBackground,
  getGenderSymbol,
} from "@/utils/genderDisplay";
import { normalizeSeatsUniqueOccupancy } from "@/utils/roomSeats";
import {
  enrichRoomChatMessage,
  getChatBubbleVisualSources,
  patchOwnRoomChatBubble,
} from "@/utils/chatCosmetics";
import { logDiagnostic } from "@/diagnostics/releaseDiagnostics";
import type {
  ChatMessage,
  CurrentMusicTrack,
  Gift,
  PublicUser,
  Room as RoomDetail,
  RoomUser,
  Seat,
  UserLevelInfo,
  ThemePayload,
} from "@/types";

/** Snapshot for one POST /gifts/send (panel send or debounced combo flush). */
type PendingGiftFlush = {
  qty: number;
  totalCost: number;
  gift: Gift;
  recipient: { id: string; displayName: string };
  roomId: string;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// Responsive toolbar button size — shrinks on narrow phones so all icons fit
const TOOLBAR_BTN_SIZE = SCREEN_WIDTH < 390 ? 30 : 34;
const TOOLBAR_GAP = SCREEN_WIDTH < 390 ? 5 : 8;
const TOOLBAR_ICON_LG = SCREEN_WIDTH < 390 ? 24 : 28; // large icons (gift, game)
/** Bottom toolbar row height excluding safe-area inset (chat field + padding). */
const ROOM_BOTTOM_TOOLBAR_HEIGHT = Spacing.sm + 38 + Spacing.xs;
/** Frosted composer bar when keyboard is open (matches reference layout). */
const ROOM_COMPOSER_BAR_HEIGHT = Spacing.sm + 44 + Spacing.sm;

// Set to true to re-enable the PK button in the toolbar
const SHOW_PK_BUTTON = false;

const unlockSeatImg = require("../../../assets/py_room_seat_normal.png");
const lockSeatImg = require("../../../assets/py_room_seat_lock.png");
const unmuteMicPng = require("../../../assets/unmute_mic.png");
type Props = RoomStackScreenProps<"Room">;

// ── Chat message colors (cycle through for different senders) ───────────────
const SENDER_COLORS = [
  "#22C97A",
  "#FF69B4",
  "#4DA6FF",
  "#E8A020",
  "#9D7FFF",
  "#FF4D4D",
];
// Module-level cache: same name always maps to the same color, no re-hashing per render.
const _senderColorCache = new Map<string, string>();
function senderColor(name: string): string {
  const cached = _senderColorCache.get(name);
  if (cached) return cached;
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const color = SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
  _senderColorCache.set(name, color);
  return color;
}

// ── Main screen ─────────────────────────────────────────────────────────────

export function RoomScreen({ route, navigation }: Props) {
  const isScreenFocused = useIsFocused();
  const {
    roomId,
    roomMode = "chat",
    isLocked: isLockedParam,
    hostId: hostIdParam,
  } = route.params;
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const chatMuted = useSelector((state: RootState) => state.auth.chatMuted);

  const [room, setRoom] = useState<RoomDetail | null>(null);
  const effectiveRoomMode = room?.roomMode ?? roomMode;
  const isLiveRoom = effectiveRoomMode === "live";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTheme, setActiveTheme] = useState<ThemePayload | null>(null);
  const [seatLoading, setSeatLoading] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  /** Clears in-room chat UI when leaving; backend resets per-user session on room:leave. */
  const clearRoomChat = useCallback(() => {
    setChatMessages([]);
  }, []);

  // If the user buys/equips a chat bubble while in a room, update their existing messages.
  useEffect(() => {
    if (!currentUser?.id) return;
    setChatMessages((prev) =>
      patchOwnRoomChatBubble(prev, currentUser.id, currentUser.equippedChatBubble ?? null),
    );
  }, [currentUser?.id, currentUser?.equippedChatBubble?.id]);
  const [joinBanners, setJoinBanners] = useState<
    {
      id: string;
      name: string;
      avatar: string | null;
      equippedFrame: import("@/types").EquippedCosmetic | null;
    }[]
  >([]);
  const [viewers, setViewers] = useState<import("@/types").RoomUser[]>([]);
  /** Persistent DB membership (RoomMember). Drives the Join/Joined icon and toggle on every visit. */
  const [hasJoined, setHasJoined] = useState(false);
  const [showJoinToast, setShowJoinToast] = useState(false);

  /**
   * Explicit unjoin: deletes the persistent RoomMember row (DELETE /rooms/:id/members).
   * Only call from explicit user actions (Join-toggle "Leave", kick alert).
   * Screen-leave / back-gesture must NOT call this — membership is sticky and persists
   * across screen exits until the user explicitly unjoins.
   */
  const patchMembershipCache = useCallback(
    (isMember: boolean, isRoomAdmin?: boolean) => {
      queryClient.setQueryData(
        queryKeys.rooms.membership(roomId),
        (prev: { isMember: boolean; isRoomAdmin: boolean } | undefined) => ({
          isMember,
          isRoomAdmin: isRoomAdmin ?? prev?.isRoomAdmin ?? false,
        }),
      );
    },
    [roomId],
  );

  const clearRoomMembership = useCallback(async () => {
    try {
      await roomsApi.unjoinRoom(roomId);
    } catch {
      /* best-effort: offline or no membership row */
    }
    patchMembershipCache(false);
    setHasJoined(false);
  }, [roomId, patchMembershipCache]);

  /** When true, the next `beforeRemove` skip runs cleanup — intentional exits already ran unjoin/seat/session. */
  const skipBeforeRemoveCleanupRef = useRef(false);
  /**
   * Set on every exit path before stopSession(). Blocks the foreground-session sync
   * effect from re-running setForegroundSession after stopSession (e.g. when the
   * seat.updated from our own leaveSeat lands during the nav-close window), which
   * would resurrect an invisible Agora session that nothing can ever tear down.
   */
  const sessionEndedRef = useRef(false);
  const roomSession = useRoomSession();
  const { setMusic, clearMusic, musicPlayerRef } = roomSession;

  const enterRoomBannerShownRef = useRef(false);
  /** Tracks whether the fallback password modal has already been auto-shown for the current room. */
  const passwordPromptShownRef = useRef(false);
  const [chatInput, setChatInput] = useState("");
  const chatListRef = useRef<FlatList<ChatMessage>>(null);
  const keyboardHeight = useKeyboardState((s) => s.height);
  const keyboardVisible = useKeyboardState((s) => s.isVisible);
  /** White composer chrome while the software keyboard is open (keeps UI in sync on reopen without a second onFocus). */
  const showChatComposer = keyboardVisible;
  const chatInputRef = useRef<TextInput>(null);
  const [giftPanelVisible, setGiftPanelVisible] = useState(false);
  const [giftRecipient, setGiftRecipient] = useState<{
    id: string;
    displayName: string;
  } | null>(null);
  const [coinBalance, setCoinBalance] = useState(0);
  const coinBalanceRef = useRef(0);
  const giftSvgaPreloadStartedRef = useRef(false);
  const recentGiftEventIdsRef = useRef<Map<string, number> | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiTab, setEmojiTab] = useState<"svga" | "text">("svga");
  const [seatEmojis, setSeatEmojis] = useState<
    Record<number, { key: string; animKey: number }>
  >({});
  const seatRefs = useRef<Record<number, View | null>>({});
  const [rtcUidByUserId, setRtcUidByUserId] = useState<Record<string, number>>({});
  const [flyingGifts, setFlyingGifts] = useState<
    { id: string; icon: string; image: string | null; targetPosition: number }[]
  >([]);
  const [comboState, setComboState] = useState<{
    gift: Gift;
    recipient: { id: string; displayName: string };
    seatPosition: number;
    count: number;
    step: number;
  } | null>(null);
  const comboTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const comboFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFlushRef = useRef<{
    qty: number;
    totalCost: number;
    gift: Gift;
    recipient: { id: string; displayName: string };
    roomId: string;
  } | null>(null);
  const dismissComboRef = useRef<() => void>(() => {});
  /** Serializes POST /gifts/send so rapid combo + send-to-all never race the wallet. */
  const giftSendTailRef = useRef(Promise.resolve());
  const comboProgress = useRef(new Animated.Value(1)).current;
  const comboScale = useRef(new Animated.Value(0)).current;

  // Auto-dismiss the join confirmation toast.
  useEffect(() => {
    if (!showJoinToast) return;
    const t = setTimeout(() => setShowJoinToast(false), 1600);
    return () => clearTimeout(t);
  }, [showJoinToast]);

  const getViewerCountFromPayload = useCallback((data: Record<string, any>) => {
    const candidates = [
      data.viewerCount,
      data.count,
      data.listenerCount,
      data.listenersCount,
      data.total,
    ];
    for (const c of candidates) {
      if (typeof c === "number" && Number.isFinite(c)) return c;
    }
    return undefined;
  }, []);
  // Effect queue — cheapest pending effect plays next; onComplete pops the front.
  const [specialEffectQueue, setSpecialEffectQueue] = useState<GiftSpecialEffect[]>(
    [],
  );
  const specialEffect = specialEffectQueue[0] ?? null;
  const advanceGiftEffectQueue = useCallback(() => {
    setSpecialEffectQueue((prev) => (prev.length > 0 ? prev.slice(1) : prev));
  }, []);
  // Entry effects (category `entry`) — their own queue so they don't interfere with
  // gift combo merging/sorting. Front item plays; onComplete pops it.
  const [entryEffectQueue, setEntryEffectQueue] = useState<
    { id: string; svga: string; name: string }[]
  >([]);
  const entryEffect = entryEffectQueue[0] ?? null;
  const advanceEntryEffectQueue = useCallback(() => {
    setEntryEffectQueue((prev) => (prev.length > 0 ? prev.slice(1) : prev));
  }, []);
  const [giftToasts, setGiftToasts] = useState<GiftToastItem[]>([]);
  const dismissGiftToast = useCallback((id: string) => {
    setGiftToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const pushGiftToast = useCallback(
    (t: Omit<GiftToastItem, "id" | "bump" | "combo"> & { combo?: number }) => {
      setGiftToasts((prev) => {
        const idx = prev.findIndex((x) => x.comboKey === t.comboKey);
        if (idx >= 0) {
          const existing = prev[idx];
          const merged: GiftToastItem = {
            ...existing,
            qty: existing.qty + t.qty,
            combo: Math.max(existing.combo + 1, t.combo ?? existing.combo + 1),
            bump: existing.bump + 1,
          };
          const next = prev.slice();
          next[idx] = merged;
          return next;
        }
        return [
          ...prev,
          {
            ...t,
            combo: t.combo ?? 1,
            bump: 0,
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          },
        ];
      });
    },
    [],
  );
  const [inviteOverlayVisible, setInviteOverlayVisible] = useState(false);
  const [inviteSeatPosition, setInviteSeatPosition] = useState<number | null>(null);
  const [pendingSeatInvite, setPendingSeatInvite] =
    useState<SeatInvitationPayload | null>(null);
  const [shareOverlayVisible, setShareOverlayVisible] = useState(false);
  const [roomPlayVisible, setRoomPlayVisible] = useState(false);
  const [photoShareAsset, setPhotoShareAsset] = useState<{
    uri: string;
    width: number;
    height: number;
    mimeType?: string;
    fileName?: string;
  } | null>(null);
  const [photoShareVisible, setPhotoShareVisible] = useState(false);
  const [photoViewerUri, setPhotoViewerUri] = useState<string | null>(null);
  const [pkVisible, setPkVisible] = useState(false);
  const [calcVisible, setCalcVisible] = useState(false);
  const [calculatorSession, setCalculatorSession] = useState<{
    sessionId: string;
    durationSeconds: number | null;
    startedAt: string;
  } | null>(null);
  const [seatScores, setSeatScores] = useState<
    Record<number, { userId: string; points: number }>
  >({});
  const [calcResultScores, setCalcResultScores] = useState<
    import("@/api/rooms").CalcScoreEntry[]
  >([]);
  const [calcResultVisible, setCalcResultVisible] = useState(false);
  const [calcContributorsVisible, setCalcContributorsVisible] = useState(false);
  const [calcRecipientUserId, setCalcRecipientUserId] = useState<string | null>(null);
  const [topSupporterIds, setTopSupporterIds] = useState<Set<string>>(new Set());
  const [pkInviteSheetDuration, setPkInviteSheetDuration] = useState<
    number | null
  >(null);
  const [isInPkQueue, setIsInPkQueue] = useState(false);
  const [pkQueueDuration, setPkQueueDuration] = useState(0);
  const [gamesVisible, setGamesVisible] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [roomDataVisible, setRoomDataVisible] = useState(false);
  const [roomAdminVisible, setRoomAdminVisible] = useState(false);
  const [inboxVisible, setInboxVisible] = useState(false);
  const [rankingVisible, setRankingVisible] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [seatMenu, setSeatMenu] = useState<{
    seat: Seat;
    x: number;
    y: number;
  } | null>(null);
  type KickTargetUser = {
    id: string;
    displayName: string;
    avatar: string | null;
    hakaId?: string | null;
    equippedFrame?: import("@/types").EquippedCosmetic | null;
    activeSpecialId?: string | null;
    activeSpecialIdLevel?: string | null;
  };

  const [kickTarget, setKickTarget] = useState<KickTargetUser | null>(null);
  const [applyingVisible, setApplyingVisible] = useState(false);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [roomAdminIds, setRoomAdminIds] = useState<Set<string>>(new Set());
  const [editInfoVisible, setEditInfoVisible] = useState(false);
  const [endModalVisible, setEndModalVisible] = useState(false);
  const [editTitleDraft, setEditTitleDraft] = useState("");
  const [editAnnouncementDraft, setEditAnnouncementDraft] = useState("");
  const [editCoverDraft, setEditCoverDraft] = useState<string>("");
  const [editSaving, setEditSaving] = useState(false);
  const [passwordOverlayVisible, setPasswordOverlayVisible] = useState(false);
  const [roomPassword, setRoomPassword] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordOverlayMode, setPasswordOverlayMode] = useState<
    "set" | "enter"
  >("enter");

  /** null = still checking GET /members/me for room-admin lock bypass */
  const [lockBypassForAdmin, setLockBypassForAdmin] = useState<boolean | null>(
    null,
  );
  const adminAutoJoinDoneRef = useRef(false);

  // Strict lock gate: navigated with `isLocked` metadata for a room I don't own.
  // Block all room loading + audio/socket connect until password or room-admin bypass.
  const isHostByParam =
    !!currentUser?.id && !!hostIdParam && currentUser.id === hostIdParam;
  const needsLockWall =
    !!isLockedParam && !isHostByParam && !roomPassword;
  const lockProbeLoading =
    needsLockWall && !!currentUser?.id && lockBypassForAdmin === null;
  const strictLockedGate =
    needsLockWall && !lockProbeLoading && lockBypassForAdmin !== true;

  useEffect(() => {
    if (!needsLockWall || !currentUser?.id) {
      setLockBypassForAdmin(false);
      return;
    }
    let cancelled = false;
    setLockBypassForAdmin(null);
    roomsApi
      .isMember(roomId)
      .then((r) => {
        if (!cancelled) setLockBypassForAdmin(!!r.isRoomAdmin);
      })
      .catch(() => {
        if (!cancelled) setLockBypassForAdmin(false);
      });
    return () => {
      cancelled = true;
    };
  }, [roomId, needsLockWall, currentUser?.id]);

  // Seat grid container width for responsive sizing.
  const [seatGridWidth, setSeatGridWidth] = useState(0);
  /** Bottom Y of seat block in `styles.screen` coords; null until first onLayout. */
  const [seatBlockBottomY, setSeatBlockBottomY] = useState<number | null>(null);

  useEffect(() => {
    setSeatBlockBottomY(null);
  }, [roomId, room?.micConfig]);

  const [rankingInitialTab, setRankingInitialTab] = useState<
    "online" | "contribution" | "game"
  >("online");

  // ── Room play tool toggles ─────────────────────────────────────────────────
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [giftEffectsEnabled, setGiftEffectsEnabled] = useState(true);
  // Mirror in a ref so handleWsEvent (which doesn't depend on this state) reads
  // the current value without a stale closure or re-subscribing the socket.
  const giftEffectsEnabledRef = useRef(giftEffectsEnabled);
  giftEffectsEnabledRef.current = giftEffectsEnabled;
  const [callEnabled, setCallEnabled] = useState(true);

  const isHost =
    room !== null && currentUser !== null && room.host.id === currentUser.id;
  /** Host before GET /rooms/:id returns (e.g. right after create / go-live). */
  const isHostEffective = isHost || isHostByParam;
  const mySeatedPosition =
    room?.seats?.find((s) => s.user?.id === currentUser?.id)?.position ?? null;
  const mySeatPositionRef = useRef<number | null>(null);
  const isHostRef = useRef(false);
  useEffect(() => {
    mySeatPositionRef.current = mySeatedPosition;
  }, [mySeatedPosition]);
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);
  const canPublish = isHostEffective || mySeatedPosition !== null;
  const mySeatMutedByHost = useMemo(() => {
    if (mySeatedPosition === null || !room?.seats) return false;
    const s = room.seats.find((x) => x.position === mySeatedPosition);
    return s?.isMuted === true;
  }, [mySeatedPosition, room?.seats]);
  const isRoomAdmin = !!currentUser && roomAdminIds.has(currentUser.id);
  /** Includes lock-screen probe so moderator UI works before `listAdmins` returns. */
  const isRoomAdminEffective = isRoomAdmin || lockBypassForAdmin === true;
  const isHostOrAdmin = isHost || isRoomAdminEffective;

  const applyMusicQueued = useCallback((queued: CurrentMusicTrack) => {
    setMusic({ autoPlay: false, visible: true, track: queued });
    setRoom((prev) => (prev ? { ...prev, bgMusicUrl: queued.url } : prev));
    setTimeout(() => musicPlayerRef.current?.expand(), 0);
  }, [setMusic, musicPlayerRef]);

  const applyMusicTrackPlayed = useCallback((played: CurrentMusicTrack) => {
    setMusic({ autoPlay: true, visible: true, track: played });
    setRoom((prev) => (prev ? { ...prev, bgMusicUrl: played.url } : prev));
    setTimeout(() => musicPlayerRef.current?.expand(), 0);
  }, [setMusic, musicPlayerRef]);

  const handleRoomPlayMusic = useCallback(async () => {
    if (!isHostOrAdmin) return;
    setRoomPlayVisible(false);
    setMusic({ visible: true });
    try {
      const { tracks, currentIndex } = await roomsApi.getMusicQueue(roomId);
      const t = tracks[currentIndex];
      if (t) {
        applyMusicQueued({
          url: t.url,
          name: t.name,
          trackId: t.id,
          index: currentIndex,
          total: tracks.length,
        });
      } else {
        const boot = await bootstrapRoomMusicFromLibrary(roomId);
        if (boot?.played) {
          applyMusicTrackPlayed(boot.played);
        } else {
          setTimeout(() => musicPlayerRef.current?.expand(), 0);
        }
      }
    } catch {
      setTimeout(() => musicPlayerRef.current?.expand(), 0);
    }
  }, [isHostOrAdmin, roomId, applyMusicQueued, applyMusicTrackPlayed, setMusic]);

  useEffect(() => {
    setMusic({ canControl: isHostOrAdmin });
  }, [isHostOrAdmin, setMusic]);

  const hasPendingSeatApplication = useMemo(
    () =>
      !!currentUser?.id &&
      applicants.some((a) => a.userId === currentUser.id),
    [currentUser?.id, applicants],
  );
  const seatedParticipantCount = useMemo(() => {
    const ids = new Set<string>();
    for (const seat of room?.seats ?? []) {
      if (seat.userId) ids.add(seat.userId);
    }
    return ids.size;
  }, [room?.seats]);

  const viewerCountDisplay = Math.max(
    typeof room?.viewerCount === "number" && Number.isFinite(room.viewerCount)
      ? room.viewerCount
      : 0,
    viewers.length,
    seatedParticipantCount,
  );

  const announcementText = useMemo(() => {
    const raw = typeof room?.description === "string" ? room.description : "";
    // Some backends/clients can accidentally store zero-width chars which render as "empty".
    const cleaned = raw.replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    return cleaned.length > 0
      ? cleaned
      : "Welcome everyone! Let's chat and have fun together!";
  }, [room?.description]);

  /** Raw chat top from onLayout / fallback (may overlap before clamp). */
  const chatAreaTopFromMeasure = useMemo(() => {
    if (isLiveRoom) {
      return insets.top + 72;
    }
    const gap = Spacing.md;
    if (seatBlockBottomY != null) return seatBlockBottomY + gap;
    return SCREEN_HEIGHT - (insets.bottom + 90) - 309;
  }, [isLiveRoom, seatBlockBottomY, insets.bottom, insets.top]);

  const handleSeatGridLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const { width, height, y } = e.nativeEvent.layout;
      setSeatGridWidth(width);
      const minBottom = insets.top + computeSeatTopOffset(SCREEN_HEIGHT) + 92;
      setSeatBlockBottomY(Math.max(y + height, minBottom));
    },
    [insets.top],
  );

  const chatAnnouncementHeader = useMemo(
    () => (
      <View style={styles.announcementListHeader} pointerEvents="none">
        <View style={styles.announcementCard}>
          <Text style={styles.announcementCardText} numberOfLines={3}>
            Announcement{"\n"}
            {announcementText}
          </Text>
        </View>
      </View>
    ),
    [announcementText],
  );

  // ── Preload top SVGA gift assets (remote) ──────────────────────────────────
  useEffect(() => {
    if (!room) return;
    if (giftSvgaPreloadStartedRef.current) return;
    giftSvgaPreloadStartedRef.current = true;

    // Fire-and-forget: warm the local cache for a few SVGA gifts so the first play
    // doesn't wait on a network download.
    giftsApi
      .catalogue()
      .then((catalogue) => {
        const urls = (catalogue ?? [])
          .filter((g) => typeof g?.svgaAsset === "string" && g.svgaAsset.trim().length > 0)
          .sort((a, b) => {
            // Prefer lucky-tier gifts first, then by order ascending.
            const aSpecial = isLuckyGiftCategory(a.category) ? 0 : 1;
            const bSpecial = isLuckyGiftCategory(b.category) ? 0 : 1;
            if (aSpecial !== bSpecial) return aSpecial - bSpecial;
            return (a.order ?? 0) - (b.order ?? 0);
          })
          .map((g) => String(g.svgaAsset));
        void preloadRemoteSvgaAssets(urls, { limit: 4 });
      })
      .catch(() => {});
  }, [room]);
  // Password gate: host or room admin (including lock-probe) skip realtime password
  const needsPassword =
    !!room && room.isLocked && !isHostOrAdmin && !roomPassword;
  // Room owner's current seat — follows the host wherever they sit (today
  // enforced at position 1, but look up by host.id so future seat-swap allowances
  // keep working). Falls back to 1 when the host isn't seated for any reason.
  const ownerSeatPosition = room
    ? (room.seats?.find((s) => s.user?.id === room.host.id)?.position ?? 1)
    : 1;

  // ── Gift animation ──────────────────────────────────────────────────────────

  const triggerGiftAnimation = useCallback(
    (
      icon: string,
      senderName: string,
      giftName: string,
      category?: string,
      animationType?: string,
      giftImage?: string | null,
      svgaAsset?: string | null,
      qty: number = 1,
      coinCost: number = 0,
    ) => {
      // Basic gifts only show the toast — unless the gift has an SVGA asset.
      const hasSvga =
        typeof svgaAsset === "string" && svgaAsset.trim().length > 0;
      if (isBagGiftCategory(category) && !hasSvga) return;
      if (!giftEffectsEnabled) return;
      const playCount = Math.max(1, Math.min(50, Math.floor(qty)));
      const baseId = Date.now();
      const normalizedCost = normalizeGiftCoinCost({ coinCost });
      const entries: GiftSpecialEffect[] = Array.from(
        { length: playCount },
        (_, i) => ({
          id: `${baseId}-${i}-${Math.random().toString(36).slice(2, 9)}`,
          animationType: animationType || "scale",
          giftIcon: icon,
          giftImage: giftImage ?? null,
          svgaAsset: svgaAsset ?? null,
          senderName,
          giftName,
          qty: 1,
          coinCost: normalizedCost,
        }),
      );
      setSpecialEffectQueue((prev) => mergeGiftEffectQueueSorted(prev, entries));
    },
    [giftEffectsEnabled],
  );

  // ── Coalesce high-frequency socket-driven renders ─────────────────────────
  // In busy rooms, WS events (seats, viewers, chat, gifts) arrive faster than the
  // frame rate. React 19 batches setStates within ONE callback but not across the
  // separate socket callbacks, so each event was its own render of this large
  // screen — saturating the JS thread and freezing the UI. We defer each event's
  // processing into a single requestAnimationFrame flush so every event that lands
  // in the same frame collapses into one render. Order is FIFO and functional
  // updaters still receive the latest state, so behavior is unchanged.
  const wsBatchQueueRef = useRef<Array<() => void>>([]);
  const wsBatchRafRef = useRef<number | null>(null);
  const batchWsState = useCallback((fn: () => void) => {
    wsBatchQueueRef.current.push(fn);
    if (wsBatchRafRef.current != null) return;
    wsBatchRafRef.current = requestAnimationFrame(() => {
      wsBatchRafRef.current = null;
      const queue = wsBatchQueueRef.current;
      wsBatchQueueRef.current = [];
      for (const run of queue) run();
    });
  }, []);
  useEffect(
    () => () => {
      if (wsBatchRafRef.current != null) {
        cancelAnimationFrame(wsBatchRafRef.current);
        wsBatchRafRef.current = null;
      }
    },
    [],
  );

  // ── Handle real-time WebSocket events ─────────────────────────────────────
  const handleWsEvent = useCallback(
    (wsMsg: { event: string; data: Record<string, any> }) =>
      batchWsState(() => {
      const { event, data } = wsMsg;

      if (event === "seat.invitation") {
        const normalized = normalizeSeatInvitationPayload(
          data as SeatInvitationPayload,
        );
        if (normalized && normalized.roomId === roomId) {
          setPendingSeatInvite(normalized);
        }
        return;
      }

      // De-dupe gift events — we can receive duplicates when socket handlers
      // are registered more than once (e.g. reconnect / re-mount edge cases).
      // Keep a small TTL cache to ignore replays.
      const now = Date.now();
      if (!recentGiftEventIdsRef.current)
        recentGiftEventIdsRef.current = new Map<string, number>();
      const isGiftEvent = event === "gift:received";
      const rawGiftTxId =
        (data as any)?.giftTxId ??
        (data as any)?.giftTransactionId ??
        null;
      const computedGiftKey =
        isGiftEvent
          ? String(rawGiftTxId ?? `${(data as any)?.senderId ?? (data as any)?.sender?.id ?? "?"}:${(data as any)?.giftId ?? "?"}:${(data as any)?.recipientId ?? (data as any)?.recipient?.id ?? "?"}:${(data as any)?.qty ?? "?"}:${(data as any)?.comboCount ?? "?"}`)
          : null;
      if (isGiftEvent && computedGiftKey) {
        // prune
        for (const [k, ts] of recentGiftEventIdsRef.current.entries()) {
          if (now - ts > 10_000) recentGiftEventIdsRef.current.delete(k);
        }
        const seenAt = recentGiftEventIdsRef.current.get(computedGiftKey);
        if (seenAt && now - seenAt < 10_000) {
          return;
        }
        recentGiftEventIdsRef.current.set(computedGiftKey, now);
      }

      if (event === "user.joined" || event === "user_joined") {
        const u = data.user ?? data;
        const name = u?.displayName ?? "Someone";
        const uid = u?.id ?? u?.userId ?? `${name}-${Date.now()}`;
        const bannerId = `${uid}-${Date.now()}`;
        const isSelf =
          typeof currentUser?.id === "string" &&
          typeof uid === "string" &&
          uid === currentUser.id;
        if (!isSelf) {
          setJoinBanners((prev) => [
            ...prev,
            {
              id: bannerId,
              name,
              avatar: u?.avatar ?? null,
              equippedFrame: u?.equippedFrame ?? null,
            },
          ]);
          setTimeout(() => {
            setJoinBanners((prev) => prev.filter((b) => b.id !== bannerId));
          }, 3500);
        }
        // Full-screen entry animation for users with an equipped entry effect.
        // Shown to everyone (including the entrant) when gift effects are on.
        const entrySvga =
          typeof u?.entryEffect?.svga === "string"
            ? u.entryEffect.svga.trim()
            : "";
        if (entrySvga && giftEffectsEnabledRef.current) {
          setEntryEffectQueue((prev) => [
            ...prev,
            { id: bannerId, svga: entrySvga, name },
          ]);
        }
        const hostId = room?.hostId ?? room?.host?.id;
        const isHostJoin =
          typeof hostId === "string" &&
          typeof uid === "string" &&
          uid === hostId;
        if (isHostJoin && hostId !== currentUser?.id) {
          void roomsApi.detail(roomId).then((data) => {
            setRoom((prev) =>
              prev ? { ...prev, hostRtcUid: data.hostRtcUid ?? null } : prev,
            );
          }).catch(() => {});
        }
        setViewers((prev) => {
          if (!uid || prev.some((v) => v.id === uid)) return prev;
          return [
            ...prev,
            {
              id: uid,
              displayName: name,
              avatar: u?.avatar ?? null,
              username: u?.username ?? null,
              hakaId: u?.hakaId ?? null,
              equippedFrame: u?.equippedFrame ?? null,
              activeSpecialId: u?.activeSpecialId ?? null,
              richLevel: u?.richLevel ?? 0,
              charmLevel: u?.charmLevel ?? 0,
            },
          ];
        });
        const nextCount = getViewerCountFromPayload(data);
        if (typeof nextCount === "number") {
          setRoom((prev) =>
            prev ? { ...prev, viewerCount: nextCount } : prev,
          );
        }
      } else if (event === "user.left" || event === "user_left") {
        const uid = data.id ?? data.userId;
        if (uid) {
          setViewers((prev) => prev.filter((v) => v.id !== uid));
          setRoom((prev) => {
            if (!prev) return prev;
            const seats = prev.seats ?? [];
            if (!seats.some((s) => s.user?.id === uid)) return prev;
            return {
              ...prev,
              seats: seats.map((s) =>
                s.user?.id === uid
                  ? { ...s, userId: null, user: null }
                  : s,
              ),
            };
          });
        }
        const nextCount = getViewerCountFromPayload(data);
        if (typeof nextCount === "number") {
          setRoom((prev) =>
            prev ? { ...prev, viewerCount: nextCount } : prev,
          );
        }
      } else if (event === "room.roster") {
        if (Array.isArray(data.viewers)) setViewers(data.viewers);
        const nextCount = getViewerCountFromPayload(data);
        if (typeof nextCount === "number") {
          setRoom((prev) => (prev ? { ...prev, viewerCount: nextCount } : prev));
        }
      } else if (event === "rtc.uid") {
        const uidUserId = data.userId as string | undefined;
        const rtcUid = data.uid as number | undefined;
        if (uidUserId && typeof rtcUid === "number" && rtcUid > 0) {
          setRtcUidByUserId((prev) => ({ ...prev, [uidUserId]: rtcUid }));
        }
      } else if (event === "rtc.uids.snapshot") {
        const snapshot = data.rtcUids as Record<string, number> | undefined;
        if (snapshot && typeof snapshot === "object") {
          setRtcUidByUserId((prev) => ({ ...prev, ...snapshot }));
        }
      } else if (event === "seat.updated") {
        setRoom((prev) => {
          if (!prev) return prev;
          const uid = data.userId ?? data.user?.id ?? null;
          const nextSeats = (prev.seats ?? []).map((s) => {
            if (s.position === data.position) {
              return {
                ...s,
                userId: data.userId ?? null,
                user: data.user ?? null,
                isLocked:
                  typeof data.isLocked === "boolean"
                    ? data.isLocked
                    : s.isLocked,
                isMuted:
                  typeof data.isMuted === "boolean"
                    ? data.isMuted
                    : s.isMuted,
              };
            }
            if (uid && (s.userId === uid || s.user?.id === uid)) {
              return { ...s, userId: null, user: null, isMuted: false };
            }
            return s;
          });
          return {
            ...prev,
            seats: normalizeSeatsUniqueOccupancy(nextSeats),
          };
        });
      } else if (event === "seats.snapshot") {
        // Authoritative full occupancy sent in the room:join ack. Reconcile every
        // seat by position in one pass so existing seated users appear even when
        // the HTTP room snapshot was stale and missed them.
        if (Array.isArray(data.seats)) {
          setRoom((prev) => {
            if (!prev) return prev;
            const byPosition = new Map<number, any>(
              data.seats.map((s: any) => [s.position, s]),
            );
            const nextSeats = (prev.seats ?? []).map((s) => {
              const snap = byPosition.get(s.position);
              if (!snap) return s;
              return {
                ...s,
                userId: snap.userId ?? null,
                user: snap.user ?? null,
                isLocked:
                  typeof snap.isLocked === "boolean" ? snap.isLocked : s.isLocked,
                isMuted:
                  typeof snap.isMuted === "boolean" ? snap.isMuted : s.isMuted,
              };
            });
            return { ...prev, seats: normalizeSeatsUniqueOccupancy(nextSeats) };
          });
        }
      } else if (event === "room.configUpdated") {
        const incomingSeats: Seat[] | null = Array.isArray(data.seats)
          ? data.seats
          : null;
        setRoom((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            micConfig: data.micConfig ?? prev.micConfig,
            chatLocked:
              data.chatLocked !== undefined ? data.chatLocked : prev.chatLocked,
            applyForMic:
              data.applyForMic !== undefined
                ? data.applyForMic
                : prev.applyForMic,
            roomMode: data.roomMode ?? prev.roomMode,
            publicMsgEnabled:
              data.publicMsgEnabled !== undefined
                ? data.publicMsgEnabled
                : prev.publicMsgEnabled,
            hdMicEnabled:
              data.hdMicEnabled !== undefined
                ? data.hdMicEnabled
                : prev.hdMicEnabled,
            bgMusicUrl:
              data.bgMusicUrl !== undefined ? data.bgMusicUrl : prev.bgMusicUrl,
            description:
              data.description !== undefined
                ? data.description
                : prev.description,
            seats: incomingSeats ?? prev.seats,
          };
        });
        if (
          isHostRef.current &&
          mySeatPositionRef.current === null &&
          incomingSeats
        ) {
          const firstFree = incomingSeats.find((s) => !s.user && !s.isLocked);
          if (firstFree) handleSeatPress(firstFree);
        }
      } else if (event === "music:changed") {
        const d = data as {
          url?: string;
          name?: string;
          trackId?: string;
          index?: number;
          total?: number;
        };
        if (d.url) {
          const name =
            d.name ??
            d.url.split("/").pop()?.split("?")[0] ??
            "Background Music";
          setMusic({
            visible: true,
            track: {
              url: d.url,
              name,
              trackId: d.trackId ?? "",
              index: typeof d.index === "number" ? d.index : 0,
              total: typeof d.total === "number" ? d.total : 1,
            },
          });
          setRoom((prev) => (prev ? { ...prev, bgMusicUrl: d.url } : prev));
        }
      } else if (event === "music:stopped") {
        void clearMusic();
        setRoom((prev) => (prev ? { ...prev, bgMusicUrl: null } : prev));
      } else if (event === "mic:hd_changed") {
        setRoom((prev) => {
          if (!prev) return prev;
          return { ...prev, hdMicEnabled: data.hdMicEnabled };
        });
      } else if (event === "room:theme:init") {
        setActiveTheme(data.activeTheme ?? null);
      } else if (event === "room:theme_changed") {
        setActiveTheme(data.theme ?? null);
      } else if (event === "listener.count" || event === "listener_updated") {
        const nextCount = getViewerCountFromPayload(data);
        setRoom((prev) =>
          prev && typeof nextCount === "number"
            ? { ...prev, viewerCount: nextCount }
            : prev,
        );
      } else if (event === "room_ended" || event === "room.ended") {
        const reason = (data as any)?.reason;
        const message =
          reason === "force_closed"
            ? "This room has been closed by an administrator."
            : reason === "host_banned"
              ? "This room has been closed by an administrator."
              : "The host has ended this room.";
        // Stop audio/socket immediately — the room is gone; waiting for OK would
        // keep playing whatever is still in the Agora channel.
        sessionEndedRef.current = true;
        roomSession.stopSession();
        Alert.alert("Room Ended", message, [
          {
            text: "OK",
            onPress: () => {
              skipBeforeRemoveCleanupRef.current = true;
              clearRoomChat();
              safeGoBack(navigation);
            },
          },
        ]);
      } else if (event === "room:join:error") {
        if (data.isLocked) {
          setPasswordError("Incorrect password");
          setRoomPassword(null);
          setPasswordOverlayMode("enter");
          setPasswordOverlayVisible(true);
        } else if (data.kicked) {
          sessionEndedRef.current = true;
          roomSession.stopSession();
          Alert.alert(
            "Cannot join",
            formatRoomKickBanMessage(data.cooldownMinutes),
            [
              {
                text: "OK",
                onPress: () => {
                  skipBeforeRemoveCleanupRef.current = true;
                  clearRoomChat();
                  void clearRoomMembership().finally(() =>
                    safeGoBack(navigation),
                  );
                },
              },
            ],
          );
        }
      } else if (event === "room:kicked") {
        const kickMsg =
          data.reason ??
          formatRoomKickBanMessage(data.cooldownMinutes);
        // Kicked users must stop hearing (and publishing to) the room at once.
        sessionEndedRef.current = true;
        roomSession.stopSession();
        Alert.alert(
          "Kicked",
          kickMsg,
          [
            {
              text: "OK",
              onPress: () => {
                skipBeforeRemoveCleanupRef.current = true;
                clearRoomChat();
                void clearRoomMembership().finally(() => safeGoBack(navigation));
              },
            },
          ],
        );
      } else if (event === "hand_raised") {
        Alert.alert("Hand Raised", `${data.displayName} wants to speak.`);
      } else if (event === "message.sent") {
        const incoming = enrichRoomChatMessage(
          data as ChatMessage,
          currentUser,
        ) as ChatMessage;
        setChatMessages((prev) =>
          prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming],
        );
      } else if (event === "chat:cleared") {
        setChatMessages([]);
      } else if (event === "seat.application.snapshot") {
        const list = Array.isArray(data.applicants)
          ? (data.applicants as Applicant[])
          : [];
        setApplicants(list);
      } else if (event === "seat.application.added") {
        const a = data.applicant as Applicant | undefined;
        if (!a) return;
        setApplicants((prev) =>
          prev.some((x) => x.userId === a.userId) ? prev : [...prev, a],
        );
        // Notify host/admin of new application
        if (isHostOrAdmin && a.userId !== currentUser?.id) {
          toast.show(`${a.displayName} applied for a seat`, "info");
        }
      } else if (event === "seat.application.removed") {
        const uid = data.userId as string | undefined;
        if (!uid) return;
        setApplicants((prev) => prev.filter((x) => x.userId !== uid));
      } else if (event === "seat.application.resolved") {
        const uid = data.userId as string | undefined;
        if (!uid) return;
        setApplicants((prev) => prev.filter((x) => x.userId !== uid));
        if (currentUser && uid === currentUser.id && data.approved) {
          setApplyingVisible(false);
          toast.show("You joined the seat", "success");
        }
      } else if (event === "emoji.received") {
        const pos =
          typeof data.seatPosition === "number" ? data.seatPosition : null;
        const key = typeof data.emojiKey === "string" ? data.emojiKey : null;
        if (pos !== null && key && SVGA_EMOJIS_BY_KEY[key]) {
          setSeatEmojis((prev) => ({
            ...prev,
            [pos]: { key, animKey: Date.now() },
          }));
        }
      } else if (event === "gift:received") {
        const icon = data.gift?.icon ?? "";
        const senderName =
          data.sender?.displayName ?? data.senderName ?? "Someone";
        const senderAvatar = data.sender?.avatar ?? null;
        const recipientName =
          data.recipient?.displayName ?? data.recipientName ?? "Host";
        const incomingQty =
          typeof data.qty === "number" && data.qty > 0 ? data.qty : 1;
        const comboKey = `${data.senderId ?? senderName}-${data.giftId ?? icon}-${data.recipientId ?? recipientName}`;
        pushGiftToast({
          comboKey,
          senderName,
          senderAvatar,
          recipientName,
          giftIcon: icon,
          giftImage: data.gift?.image ?? null,
          qty: incomingQty,
          combo:
            typeof data.comboCount === "number" ? data.comboCount : undefined,
        });

        // Flying gift animation for basic gifts (toward recipient's seat).
        // If the gift has an SVGA asset, we prioritize the full-screen SVGA effect instead.
        const hasSvga =
          typeof (data.gift?.svgaAsset ?? data.svgaKey) === "string" &&
          String(data.gift?.svgaAsset ?? data.svgaKey).trim().length > 0;
        const isBagGift = isBagGiftCategory(data.gift?.category);
        const recipientSeat = room?.seats?.find(
          (s) => s.user?.id === data.recipientId,
        );
        const rawSeatPos = (data as { recipientSeatPosition?: unknown })
          .recipientSeatPosition;
        const serverSeatPosition =
          typeof rawSeatPos === "number" && rawSeatPos >= 1
            ? rawSeatPos
            : null;
        const targetPosition =
          serverSeatPosition ?? recipientSeat?.position ?? undefined;
        const isSelfSend =
          currentUser &&
          (data.senderId === currentUser.id ||
            data.sender?.id === currentUser.id);
        if (isBagGift && !hasSvga && targetPosition != null) {
          const flyId = `fly-${Date.now()}-${Math.random()}`;
          if (!isSelfSend) {
            setFlyingGifts((prev) => [
              ...prev,
              {
                id: flyId,
                icon,
                image: data.gift?.image ?? null,
                targetPosition,
              },
            ]);
          }
        }

        // Skip full-screen effect for self-sent gifts — already fired optimistically
        // in handleSendGift to avoid the server round-trip delay.
        if (!isSelfSend) {
          triggerGiftAnimation(
            icon,
            senderName,
            data.gift?.name ?? "Gift",
            data.gift?.category,
            data.gift?.animationType,
            data.gift?.image ?? null,
            data.gift?.svgaAsset ?? data.svgaKey ?? null,
            1,
            normalizeGiftCoinCost({
              coinCost: data.gift?.coinCost ?? data.coinCost,
            }),
          );
        }
        // Refresh wallet if the current user is the recipient (beans were credited)
        if (
          currentUser &&
          (data.recipientId === currentUser.id ||
            data.recipient?.id === currentUser.id)
        ) {
          walletApi
            .getBalance()
            .then((bal) => setCoinBalance(bal.coinBalance))
            .catch(() => {});
        }

        const giftNoticeName = data.gift?.name ?? "Gift";
        const giftNoticeIcon = data.gift?.icon ?? "";
        const noticeContent = `Send ${giftNoticeName} ${recipientName} x${incomingQty}`;
        const noticeSender = data.sender ?? {
          id: data.senderId ?? "",
          username: null,
          displayName: senderName,
          avatar: senderAvatar ?? "",
          richLevel: 0,
          charmLevel: 0,
        };
        setChatMessages((prev) => [
          ...prev,
          {
            id: `gift-notice-${rawGiftTxId ?? Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            sender: noticeSender,
            content: noticeContent,
            createdAt: new Date().toISOString(),
            type: "gift_notice",
            giftNotice: {
              giftName: giftNoticeName,
              giftIcon: giftNoticeIcon,
              recipientName,
              qty: incomingQty,
              giftImageFallback: data.gift?.image ?? null,
            },
          },
        ]);
      } else if (event === "calculator:started") {
        setCalculatorSession({
          sessionId: data.sessionId,
          durationSeconds: data.durationSeconds,
          startedAt: data.startedAt,
        });
        setSeatScores({});
        toast.show("🔥 Calculator started!", "info");
      } else if (event === "calculator:score_update") {
        const scoreMap: Record<number, { userId: string; points: number }> = {};
        (data.scores as import("@/api/rooms").CalcScoreEntry[]).forEach((s) => {
          scoreMap[s.seatPosition] = { userId: s.userId, points: s.points };
        });
        setSeatScores(scoreMap);
      } else if (event === "calculator:ended") {
        setCalculatorSession(null);
        setSeatScores({});
        setCalcResultScores(data.scores);
        setCalcResultVisible(true);
      }
    }),
    [
      navigation,
      triggerGiftAnimation,
      pushGiftToast,
      currentUser,
      toast,
      room,
      getViewerCountFromPayload,
      clearRoomMembership,
      clearRoomChat,
      isHostOrAdmin,
      roomId,
      setMusic,
      clearMusic,
      batchWsState,
      roomSession,
    ],
  );

  // Socket bridge lives in RoomSessionProvider; sync latest handler whenever it changes
  // so seat.application.* and other events always hit the current RoomScreen closure.
  useLayoutEffect(() => {
    roomSession.syncRoomWsHandler(handleWsEvent);
  }, [roomSession, handleWsEvent]);

  // ── Room connection (shared) — supports background keep ────────────────────
  const {
    micEnabled,
    camEnabled,
    toggleMic,
    toggleCam,
    lkConnected,
    sendMessage,
    sendEmoji,
    muteSeat,
    applyForSeat,
    cancelSeatApplication,
    approveSeatApplicant,
    localUid,
    remoteUids,
    activeSpeakerRtcUids,
    localSpeaking,
    engine,
    isExpoGo,
    ws,
  } = roomSession.connection;

  // Connect Agora/WS as soon as the lock gate clears — do not wait for GET /rooms/:id.
  const realtimeEnabled = !strictLockedGate && (room ? !needsPassword : !needsLockWall);

  // Keep the shared room session in sync with current screen state.
  useEffect(() => {
    if (!realtimeEnabled) return;
    // Exiting (or kicked/ended): never re-establish the session. Without this,
    // a seat.updated arriving mid-exit flips canPublish, re-runs this effect
    // after stopSession() and resurrects an invisible, unstoppable session.
    if (sessionEndedRef.current) return;
    roomSession.setForegroundSession(
      {
        roomId,
        canPublish,
        enabled: realtimeEnabled,
        publishVideo: isHostEffective && isLiveRoom,
        subscribeVideo: isLiveRoom,
        roomPassword,
        seatMutedByHost: mySeatMutedByHost,
      },
      handleWsEvent,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    roomId,
    canPublish,
    realtimeEnabled,
    needsPassword,
    needsLockWall,
    roomPassword,
    isHostEffective,
    isLiveRoom,
    effectiveRoomMode,
    mySeatMutedByHost,
  ]);

  // Prefer API roomMode over stale navigation params (e.g. search used to omit roomMode).
  useEffect(() => {
    if (!room?.roomMode || room.roomMode === roomMode) return;
    navigation.setParams({ roomMode: room.roomMode });
  }, [room?.roomMode, roomMode, navigation]);

  const pk = usePKBattle({ ws: ws ?? null, myUserId: currentUser?.id ?? "" });

  const {
    activeBattle,
    result: battleResult,
    vote,
    cancelBattle,
    dismissResult: dismissBattleResult,
  } = useNormalBattle({ ws: ws ?? null });
  const lastBattleRef = useRef<{
    participantAId: string;
    participantBId: string;
  } | null>(null);
  useEffect(() => {
    if (activeBattle) {
      lastBattleRef.current = {
        participantAId: activeBattle.participantAId,
        participantBId: activeBattle.participantBId,
      };
    }
  }, [activeBattle]);

  useEffect(() => {
    if (!room) return;
    const fromRoom: Record<string, number> = {};
    if (room.hostRtcUid != null && room.hostRtcUid > 0 && room.host?.id) {
      fromRoom[room.host.id] = room.hostRtcUid;
    }
    for (const seat of room.seats ?? []) {
      const uid = seat.user?.rtcUid;
      if (seat.user?.id && typeof uid === "number" && uid > 0) {
        fromRoom[seat.user.id] = uid;
      }
    }
    if (Object.keys(fromRoom).length > 0) {
      setRtcUidByUserId((prev) => ({ ...prev, ...fromRoom }));
    }
  }, [room?.id, room?.hostRtcUid, room?.host?.id, room?.seats]);

  const rtcUidToUserId = useMemo(() => {
    const map = new Map<number, string>();
    if (room?.hostRtcUid != null && room.hostRtcUid > 0 && room.host?.id) {
      map.set(room.hostRtcUid, room.host.id);
    }
    for (const [userId, uid] of Object.entries(rtcUidByUserId)) {
      if (uid > 0) map.set(uid, userId);
    }
    if (localUid > 0 && currentUser?.id) {
      map.set(localUid, currentUser.id);
    }
    // Agora reports the local publisher as uid 0 in volume callbacks.
    if (currentUser?.id) {
      map.set(0, currentUser.id);
    }
    return map;
  }, [room?.hostRtcUid, room?.host?.id, rtcUidByUserId, localUid, currentUser?.id]);

  const speakingUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rtcUid of activeSpeakerRtcUids) {
      const userId = rtcUidToUserId.get(rtcUid);
      if (userId) ids.add(userId);
    }
    return ids;
  }, [activeSpeakerRtcUids, rtcUidToUserId]);

  const isSeatUserSpeaking = useCallback(
    (seat: Seat) => {
      if (!seat.user || seat.isMuted) return false;
      if (seat.user.id === currentUser?.id) {
        if (!micEnabled || mySeatMutedByHost) return false;
        return localSpeaking;
      }
      return speakingUserIds.has(seat.user.id);
    },
    [currentUser?.id, micEnabled, mySeatMutedByHost, localSpeaking, speakingUserIds],
  );

  // Enforce host-mute on the playback side for every listener. The muted user's
  // own client is supposed to stop publishing, but if that event is slow or never
  // arrives (reconnect, Expo Go, lost socket) the rest of the room would keep
  // hearing them. Locally muting the remote stream guarantees "Mute" silences a
  // seat for everyone — and keeps it consistent with the global voice toggle.
  useEffect(() => {
    if (isExpoGo || !engine || !room?.seats) return;
    for (const seat of room.seats) {
      const targetId = seat.user?.id;
      // The local publisher is governed by the mic toggle, not remote playback.
      if (!targetId || targetId === currentUser?.id) continue;
      const rtcUid = rtcUidByUserId[targetId];
      if (!rtcUid) continue;
      const shouldMute = seat.isMuted === true || !voiceEnabled;
      try {
        engine.muteRemoteAudioStream(rtcUid, shouldMute);
      } catch {
        // engine may be mid-teardown — ignore
      }
    }
  }, [engine, isExpoGo, room?.seats, rtcUidByUserId, currentUser?.id, voiceEnabled]);

  // Agora UID of the room host — from API (Redis mapping), with single-remote fallback
  const hostAgoraUid = useMemo(() => {
    if (!room) return 0;
    if (room.hostRtcUid != null && room.hostRtcUid > 0) return room.hostRtcUid;
    if (isLiveRoom && !isHostEffective && remoteUids.length === 1) {
      return remoteUids[0]!;
    }
    return 0;
  }, [room, room?.hostRtcUid, isLiveRoom, isHostEffective, remoteUids]);
  // Show live video background when:
  //   • I am the host and my camera is on (local preview), OR
  //   • The host is a remote participant and is streaming video
  const showHostVideo =
    isLiveRoom &&
    !isExpoGo &&
    ((isHostEffective && camEnabled) ||
      (!isHostEffective && hostAgoraUid > 0 && remoteUids.includes(hostAgoraUid)));

  // ── Data loading ──────────────────────────────────────────────────────────

  // React Navigation reuses this RoomScreen instance across room switches
  // (same component, different roomId param). Without a synchronous reset,
  // the previous room's chat (including a just-added "Public message is
  // disabled" system bubble) bleeds into the new room until the new data
  // finishes loading. Resetting during render discards the stale state
  // before it can paint.
  const prevRoomIdRef = useRef(roomId);
  const initialLoadDone = useRef(false);
  if (prevRoomIdRef.current !== roomId) {
    prevRoomIdRef.current = roomId;
    setChatMessages([]);
    setRoom(null);
    setRoomAdminIds(new Set());
    const cachedMembership = queryClient.getQueryData<{
      isMember: boolean;
      isRoomAdmin: boolean;
    }>(queryKeys.rooms.membership(roomId));
    setHasJoined(cachedMembership?.isMember ?? false);
    initialLoadDone.current = false;
    setRoomPassword(null);
    setPasswordOverlayVisible(false);
    setPasswordError(null);
    enterRoomBannerShownRef.current = false;
    passwordPromptShownRef.current = false;
    setLockBypassForAdmin(null);
    adminAutoJoinDoneRef.current = false;
    setRtcUidByUserId({});
  }

  const loadRoom = useCallback(async () => {
    try {
      // Strict locked-room gate: do not load any room content, chat, or session
      // until the correct password is supplied.
      if (strictLockedGate) {
        setLoading(false);
        setError(null);
        setRoom(null);
        return;
      }
      if (!initialLoadDone.current) setLoading(true);
      setError(null);

      // Room detail alone gates the skeleton. It's prefetched on room-card press
      // (deduped via fetchQuery) so it usually resolves instantly from cache —
      // paint the room structure right away and let chat history, admins, music
      // and calculator state stream in as non-blocking follow-ups below. This
      // keeps the first paint off the slowest of those secondary requests.
      const data = await queryClient.fetchQuery(roomDetailQuery(roomId));
      setRoom({
        ...data,
        seats: normalizeSeatsUniqueOccupancy(data.seats ?? []),
      });
      setActiveTheme((data as any)?.activeTheme ?? null);
      initialLoadDone.current = true;
      setLoading(false);

      // Membership is a permanent DB join, not a live socket viewer state.
      if (currentUser && data.host.id !== currentUser.id) {
        try {
          const membership = await queryClient.fetchQuery(
            roomMembershipQuery(roomId),
          );
          setHasJoined(!!membership.isMember);
        } catch {
          const cached = queryClient.getQueryData<{
            isMember: boolean;
          }>(queryKeys.rooms.membership(roomId));
          setHasJoined(cached?.isMember ?? false);
        }
      } else {
        setHasJoined(true);
      }

      // Chat history — non-blocking follow-up; renders into the chat list once back.
      chatApi
        .getRoomMessages(roomId)
        .then((msgs) =>
          setChatMessages(
            msgs.map((msg) => enrichRoomChatMessage(msg, currentUser) as ChatMessage),
          ),
        )
        .catch(() => setChatMessages([]));

      // Admins — non-blocking follow-up. Drives moderator UI + the music-queue
      // load (only managers fetch the queue).
      roomsApi
        .listAdmins(roomId)
        .then((admins) => {
          setRoomAdminIds(new Set(admins.map((a) => a.user.id)));
          const isManager =
            !!currentUser &&
            (data.host.id === currentUser.id ||
              admins.some((a) => a.user.id === currentUser.id));
          if (isManager) {
            roomsApi
              .getMusicQueue(roomId)
              .then(({ tracks, currentIndex }) => {
                const t = tracks[currentIndex];
                if (t) {
                  setMusic({
                    track: {
                      url: t.url,
                      name: t.name,
                      trackId: t.id,
                      index: currentIndex,
                      total: tracks.length,
                    },
                  });
                } else {
                  setMusic({ track: null });
                }
              })
              .catch(() => {
                if (data.bgMusicUrl) {
                  const name =
                    data.bgMusicUrl.split("/").pop()?.split("?")[0] ??
                    "Background Music";
                  setMusic({
                    track: {
                      url: data.bgMusicUrl,
                      name,
                      trackId: "",
                      index: 0,
                      total: 1,
                    },
                  });
                } else {
                  setMusic({ track: null });
                }
              });
          } else {
            setMusic({ track: null });
          }
        })
        .catch(() => setRoomAdminIds(new Set()));

      // Calculator session — non-blocking follow-up.
      roomsApi
        .getCalculator(roomId)
        .then(({ session, scores }) => {
          if (session) {
            setCalculatorSession({
              sessionId: session.id,
              durationSeconds: session.durationSeconds,
              startedAt: session.startedAt,
            });
            const scoreMap: Record<number, { userId: string; points: number }> =
              {};
            scores.forEach((s) => {
              scoreMap[s.seatPosition] = { userId: s.userId, points: s.points };
            });
            setSeatScores(scoreMap);
          }
        })
        .catch(() => undefined);
    } catch (e: unknown) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [roomId, currentUser, strictLockedGate]);

  useEffect(() => {
    loadRoom();
  }, [loadRoom]);

  // Drop cached room detail when leaving the room, so rejoining always refetches
  // current seats/config. Live state is socket-driven while open; the cache only
  // exists to let prefetch-on-press paint the initial structure instantly.
  useEffect(() => {
    return () => {
      queryClient.removeQueries({ queryKey: roomDetailQuery(roomId).queryKey });
    };
  }, [roomId]);

  // Keep ref in sync so handleComboTap reads the latest balance without stale closure.
  useEffect(() => {
    coinBalanceRef.current = coinBalance;
  }, [coinBalance]);

  // Pre-load SVGA gift assets in background so animations play instantly.
  useEffect(() => {
    void preloadSvgaAssets();
  }, []);

  useEffect(() => {
    setActiveTheme(null);
  }, [roomId]);

  // Fallback password gate: if room loaded as locked but we were navigated
  // without `isLocked` metadata (e.g. via SearchScreen), pop the password
  // overlay automatically. Audio/socket session stays disabled because
  // `needsPassword` is true until the user enters the correct password.
  useEffect(() => {
    if (!room || !currentUser) return;
    if (
      room.isLocked &&
      room.host.id !== currentUser.id &&
      !isHostOrAdmin &&
      !roomPassword &&
      !passwordPromptShownRef.current
    ) {
      passwordPromptShownRef.current = true;
      setPasswordOverlayMode("enter");
      setPasswordError(null);
      setPasswordOverlayVisible(true);
    }
  }, [room, currentUser, roomPassword, isHostOrAdmin]);

  // One-shot "{name} entered the room" when opening as viewer (before socket join).
  useEffect(() => {
    if (!room || !currentUser || isHost) return;
    if (enterRoomBannerShownRef.current) return;
    enterRoomBannerShownRef.current = true;
    const bannerId = `local-enter-${Date.now()}`;
    const name = currentUser.displayName ?? "Someone";
    setJoinBanners((prev) => [
      ...prev,
      {
        id: bannerId,
        name,
        avatar: currentUser.avatar ?? null,
        equippedFrame: currentUser.equippedFrame ?? null,
      },
    ]);
    setTimeout(() => {
      setJoinBanners((prev) => prev.filter((b) => b.id !== bannerId));
    }, 3500);
  }, [room, currentUser, isHost]);

  // Manual join only: no auto-join timer.

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => {
      loadRoom();
    });
    return unsub;
  }, [navigation, loadRoom]);

  // Room admins: permanent join + top-bar "joined" state without an extra tap
  useEffect(() => {
    if (!room || !currentUser?.id || isHost || !isRoomAdminEffective) return;
    if (adminAutoJoinDoneRef.current) return;
    adminAutoJoinDoneRef.current = true;
    void roomsApi
      .joinRoom(roomId)
      .then(() => {
        patchMembershipCache(true);
        setHasJoined(true);
      })
      .catch(() => {
        adminAutoJoinDoneRef.current = false;
      });
  }, [room?.id, currentUser?.id, isHost, isRoomAdminEffective, roomId, patchMembershipCache]);

  // Auto-take seat after accepting a mic invite. The SeatInvitePrompt navigates
  // here with `autoTakeSeat: position`; consume it once the room is loaded and
  // clear the param so it doesn't re-fire on screen re-focus.
  const autoTakeSeatPos = route.params.autoTakeSeat;
  useEffect(() => {
    if (autoTakeSeatPos === undefined || autoTakeSeatPos === null) return;
    if (!room || !currentUser?.id) return;
    if (strictLockedGate || needsPassword) return;
    if (mySeatedPosition === autoTakeSeatPos) {
      navigation.setParams({ autoTakeSeat: undefined });
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (room.host.id !== currentUser.id) {
          await roomsApi.joinRoom(roomId);
          if (!cancelled) {
            patchMembershipCache(true);
            setHasJoined(true);
          }
        }
        await roomsApi.takeSeat(roomId, autoTakeSeatPos);
      } catch (e: unknown) {
        if (!cancelled) {
          toast.show(
            e instanceof Error ? e.message : "Could not take that seat.",
            "error",
          );
        }
      } finally {
        if (!cancelled) navigation.setParams({ autoTakeSeat: undefined });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    autoTakeSeatPos,
    room?.id,
    room?.host.id,
    currentUser?.id,
    mySeatedPosition,
    roomId,
    navigation,
    toast,
    strictLockedGate,
    needsPassword,
    patchMembershipCache,
  ]);

  // ── Edit room info (host only) ────────────────────────────────────────────

  const handleOpenEditInfo = useCallback(() => {
    if (!room || !isHost) return;
    setEditTitleDraft(room.title ?? "");
    setEditCoverDraft(room.coverImage ?? "");
    setEditAnnouncementDraft(room.description ?? "");
    setEditInfoVisible(true);
  }, [room, isHost]);

  const handlePickEditCover = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Permission needed",
        "Allow photo access to upload a room picture.",
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setEditCoverDraft(result.assets[0].uri);
    }
  }, []);

  const handleSaveEditInfo = useCallback(async () => {
    const trimmed = editTitleDraft.trim();
    if (!trimmed) {
      Alert.alert("Title required", "Room title cannot be empty.");
      return;
    }
    try {
      setEditSaving(true);
      const payload: { title: string; description?: string; coverImage?: string } = {
        title: trimmed,
      };
      const nextAnnouncement = editAnnouncementDraft.trim();
      if (room && nextAnnouncement !== (room.description ?? "").trim()) {
        payload.description = nextAnnouncement;
      }
      if (editCoverDraft && editCoverDraft !== room?.coverImage) {
        payload.coverImage = editCoverDraft;
      }
      const updated = await roomsApi.update(roomId, payload);
      setRoom((prev) => (prev ? { ...prev, ...updated } : updated));
      setEditInfoVisible(false);
    } catch (e: unknown) {
      Alert.alert(
        "Update failed",
        e instanceof Error ? e.message : "Could not save changes.",
      );
    } finally {
      setEditSaving(false);
    }
  }, [editTitleDraft, editAnnouncementDraft, editCoverDraft, room, roomId]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleJoinToggle = useCallback(async () => {
    try {
      if (hasJoined) {
        await roomsApi.unjoinRoom(roomId);
        patchMembershipCache(false);
        setHasJoined(false);
        toast.show("Left room", "info");
      } else {
        await roomsApi.joinRoom(roomId);
        patchMembershipCache(true);
        setHasJoined(true);
        setShowJoinToast(true);
      }
    } catch (e: unknown) {
      toast.show(e instanceof Error ? e.message : "Could not update membership.", "error");
    }
  }, [hasJoined, roomId, toast, patchMembershipCache]);

  const handleOpenGifts = useCallback(async () => {
    try {
      const bal = await walletApi.getBalance();
      // Don't write NaN/undefined into state — a stale balance is safer than
      // crashing downstream toLocaleString() calls.
      if (typeof bal?.coinBalance === 'number' && Number.isFinite(bal.coinBalance)) {
        setCoinBalance(bal.coinBalance);
      } else {
        logDiagnostic('api_http', 'wallet_balance_invalid_shape', { bal: JSON.stringify(bal)?.slice(0, 200) });
      }
    } catch (e) {
      logDiagnostic('api_http', 'wallet_balance_failed', { error: String(e) });
    }
    setGiftPanelVisible(true);
  }, []);

  // ── Calculator supporters (top 3) — used for seat check badge ─────────────
  useEffect(() => {
    if (!room || !calculatorSession || !isScreenFocused) {
      setTopSupporterIds(new Set());
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const entries = await roomsApi.getCalculatorContributors(room.id);
        const top = entries
          .slice()
          .sort((a, b) => b.points - a.points)
          .slice(0, 3)
          .map((e) => e.senderId);
        if (!cancelled) setTopSupporterIds(new Set(top));
      } catch {
        if (!cancelled) setTopSupporterIds(new Set());
      }
    };

    load();
    const iv = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [room?.id, calculatorSession, isScreenFocused]);

  // ── Combo logic ─────────────────────────────────────────────────────────────
  const COMBO_TIMEOUT = 5000;

  const clearComboTimer = useCallback(() => {
    if (comboTimerRef.current) {
      clearTimeout(comboTimerRef.current);
      comboTimerRef.current = null;
    }
  }, []);

  const COMBO_FLUSH_DEBOUNCE = 400;

  const runGiftSend = useCallback((pending: PendingGiftFlush) => {
    const next = giftSendTailRef.current.catch(() => {}).then(async () => {
      try {
        await giftsApi.send({
          giftId: pending.gift.id,
          recipientId: pending.recipient.id,
          roomId: pending.roomId,
          qty: pending.qty,
        });
        invalidateUserLevels(currentUser?.id, pending.recipient.id);
        try {
          const bal = await walletApi.getBalance();
          setCoinBalance(bal.coinBalance);
          coinBalanceRef.current = bal.coinBalance;
        } catch {
          /* keep optimistic balance */
        }
      } catch (e: unknown) {
        try {
          const bal = await walletApi.getBalance();
          setCoinBalance(bal.coinBalance);
          coinBalanceRef.current = bal.coinBalance;
        } catch {
          setCoinBalance((prev) => prev + pending.totalCost);
          coinBalanceRef.current += pending.totalCost;
        }
        Alert.alert(formatApiError(e), undefined, [{ text: "OK" }]);
        dismissComboRef.current();
      }
    });
    giftSendTailRef.current = next.then(() => undefined).catch(() => undefined);
    return next;
  }, [currentUser?.id]);

  // Sends any accumulated combo taps as a single batched API call (serialized via runGiftSend).
  const flushPendingCombo = useCallback(() => {
    if (comboFlushTimerRef.current) {
      clearTimeout(comboFlushTimerRef.current);
      comboFlushTimerRef.current = null;
    }
    const pending = pendingFlushRef.current;
    if (!pending || pending.qty === 0) return;
    pendingFlushRef.current = null;
    void runGiftSend(pending);
  }, [runGiftSend]);

  const dismissCombo = useCallback(() => {
    flushPendingCombo();
    clearComboTimer();
    Animated.timing(comboScale, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setComboState(null);
    });
  }, [flushPendingCombo, clearComboTimer, comboScale]);

  // Keep the ref current so flushPendingCombo's error path can call dismissCombo.
  useEffect(() => {
    dismissComboRef.current = dismissCombo;
  }, [dismissCombo]);

  const resetComboTimer = useCallback(() => {
    clearComboTimer();
    comboProgress.setValue(1);
    Animated.timing(comboProgress, {
      toValue: 0,
      duration: COMBO_TIMEOUT,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();
    comboTimerRef.current = setTimeout(dismissCombo, COMBO_TIMEOUT);
  }, [clearComboTimer, comboProgress, dismissCombo]);

  const startCombo = useCallback(
    (
      gift: Gift,
      recipient: { id: string; displayName: string },
      seatPosition: number,
      initialCount = 1,
    ) => {
      setComboState((prev) =>
        prev?.gift.id === gift.id && prev.recipient.id === recipient.id
          ? {
              ...prev,
              seatPosition,
              count: prev.count + initialCount,
              step: initialCount,
            }
          : { gift, recipient, seatPosition, count: initialCount, step: initialCount },
      );
      comboScale.setValue(0);
      Animated.spring(comboScale, {
        toValue: 1,
        friction: 5,
        tension: 200,
        useNativeDriver: true,
      }).start();
      resetComboTimer();
    },
    [comboScale, resetComboTimer],
  );

  const handleComboTap = useCallback(() => {
    if (!comboState || !room) return;
    const { gift, recipient, seatPosition, step } = comboState;
    // Read from ref so rapid taps see the decremented balance without waiting for a re-render.
    if (coinBalanceRef.current < gift.coinCost * step) {
      Alert.alert(
        "Not enough coins",
        "You do not have enough coins to send this gift.",
      );
      dismissCombo();
      return;
    }
    coinBalanceRef.current = Math.max(
      0,
      coinBalanceRef.current - gift.coinCost * step,
    );

    // Optimistic: deduct balance, fire animation, update count, pulse — all before API.
    setCoinBalance((prev) => Math.max(0, prev - gift.coinCost * step));
    const hasSvga =
      typeof gift.svgaAsset === "string" && gift.svgaAsset.trim().length > 0;
    if (isBagGiftCategory(gift.category) && !hasSvga && seatPosition) {
      const flyId = `fly-${Date.now()}-${Math.random()}`;
      setFlyingGifts((prev) => [
        ...prev,
        {
          id: flyId,
          icon: gift.icon,
          image: gift.image,
          targetPosition: seatPosition,
        },
      ]);
    } else {
      triggerGiftAnimation(
        gift.icon,
        currentUser?.displayName ?? "You",
        gift.name,
        gift.category,
        gift.animationType,
        gift.image,
        gift.svgaAsset,
        1,
        gift.coinCost,
      );
    }
    setComboState((prev) => (prev ? { ...prev, count: prev.count + step } : null));
    Animated.sequence([
      Animated.timing(comboScale, {
        toValue: 1.25,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.spring(comboScale, {
        toValue: 1,
        friction: 4,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();
    resetComboTimer();

    // Accumulate taps and debounce the API call so rapid tapping sends one
    // batched request (qty=N) instead of N concurrent transactions.
    if (pendingFlushRef.current) {
      pendingFlushRef.current.qty += step;
      pendingFlushRef.current.totalCost += gift.coinCost * step;
    } else {
      pendingFlushRef.current = {
        qty: step,
        totalCost: gift.coinCost * step,
        gift,
        recipient,
        roomId: room.id,
      };
    }
    if (comboFlushTimerRef.current) clearTimeout(comboFlushTimerRef.current);
    comboFlushTimerRef.current = setTimeout(
      flushPendingCombo,
      COMBO_FLUSH_DEBOUNCE,
    );
  }, [
    comboState,
    room,
    comboScale,
    resetComboTimer,
    dismissCombo,
    triggerGiftAnimation,
    currentUser,
    flushPendingCombo,
  ]);

  // Cleanup combo timers on unmount
  useEffect(() => {
    return () => {
      if (comboTimerRef.current) clearTimeout(comboTimerRef.current);
      if (comboFlushTimerRef.current) clearTimeout(comboFlushTimerRef.current);
    };
  }, []);

  const handleSendGift = useCallback(
    async (
      gift: Gift,
      qty: number,
      recipient: { id: string; displayName: string },
    ) => {
      if (!room) return;
      const seated = (room.seats ?? []).find(
        (s) => s.user?.id === recipient.id,
      );
      if (!seated) return;

      const totalCost = gift.coinCost * qty;

      // Guard against combo spam after balance hits zero — without this, every
      // extra tap fires another POST /gifts/send that the server rejects with 400.
      if (coinBalanceRef.current < totalCost) {
        Alert.alert(
          'Not enough coins',
          'Top up your wallet to keep sending gifts.',
          [{ text: 'OK' }],
        );
        return;
      }

      coinBalanceRef.current = Math.max(0, coinBalanceRef.current - totalCost);

      // Optimistic deduction so the balance updates instantly
      setCoinBalance((prev) => Math.max(0, prev - totalCost));

      // Trigger animation immediately — no waiting for the server
      const hasSvga =
        typeof gift.svgaAsset === "string" && gift.svgaAsset.trim().length > 0;
      if (isBagGiftCategory(gift.category) && !hasSvga && seated.position) {
        const flyId = `fly-${Date.now()}-${Math.random()}`;
        setFlyingGifts((prev) => [
          ...prev,
          {
            id: flyId,
            icon: gift.icon,
            image: gift.image,
            targetPosition: seated.position,
          },
        ]);
      } else {
        // Premium/special gifts: fire the full-screen effect optimistically so
        // there's zero wait for the server round-trip.
        triggerGiftAnimation(
          gift.icon,
          currentUser?.displayName ?? "You",
          gift.name,
          gift.category,
          gift.animationType,
          gift.image,
          gift.svgaAsset,
          1,
          gift.coinCost,
        );
      }
      startCombo(gift, recipient, seated.position, qty);

      const pending: PendingGiftFlush = {
        qty,
        totalCost,
        gift,
        recipient,
        roomId: room.id,
      };
      if (comboFlushTimerRef.current) {
        clearTimeout(comboFlushTimerRef.current);
        comboFlushTimerRef.current = null;
      }
      return runGiftSend(pending);
    },
    [room, startCombo, triggerGiftAnimation, currentUser, runGiftSend],
  );

  const handleCalcBadgePress = useCallback((recipientUserId: string) => {
    setCalcRecipientUserId(recipientUserId);
    setCalcContributorsVisible(true);
  }, []);

  const openSessionContributors = useCallback(() => {
    setCalcRecipientUserId(null);
    setCalcContributorsVisible(true);
  }, []);

  const handleSendChat = useCallback(() => {
    const text = chatInput.trim();
    if (!text) return;
    sendMessage(text);
    setChatInput("");
  }, [chatInput, sendMessage]);

  const playSeatEmoji = useCallback(
    (seatPosition: number, emojiKey: string) => {
      setSeatEmojis((prev) => ({
        ...prev,
        [seatPosition]: { key: emojiKey, animKey: Date.now() },
      }));
    },
    [],
  );

  const clearSeatEmoji = useCallback(
    (seatPosition: number, animKey: number) => {
      setSeatEmojis((prev) => {
        const cur = prev[seatPosition];
        if (!cur || cur.animKey !== animKey) return prev;
        const next = { ...prev };
        delete next[seatPosition];
        return next;
      });
    },
    [],
  );

  const handleEmojiOnSeat = useCallback(
    (seatPosition: number, emojiKey: string) => {
      if (!SVGA_EMOJIS_BY_KEY[emojiKey]) return;
      playSeatEmoji(seatPosition, emojiKey);
      sendEmoji(seatPosition, emojiKey);
      setShowEmoji(false);
    },
    [playSeatEmoji, sendEmoji],
  );

  const handleLeave = useCallback(async () => {
    skipBeforeRemoveCleanupRef.current = true;
    clearRoomChat();
    if (mySeatedPosition !== null) {
      try {
        await roomsApi.leaveSeat(roomId, mySeatedPosition);
      } catch (e) {
        logDiagnostic('api_http', 'leaveSeat_failed', { roomId, error: String(e) });
      }
    }
    safeGoBack(navigation);
  }, [roomId, mySeatedPosition, navigation, clearRoomChat]);

  const handleRandomMatch = useCallback(
    async (durationSecs: number) => {
      try {
        await pkApi.joinQueue(durationSecs);
        setPkQueueDuration(durationSecs);
        setIsInPkQueue(true);
      } catch {
        toast.show("Failed to join PK queue", "error");
      }
    },
    [toast],
  );

  const handleStartBattle = useCallback(
    async (
      participantAId: string,
      participantBId: string,
      mode: "coins" | "votes",
      durationSecs: number,
    ) => {
      if (!room) return;
      try {
        await battleApi.start(room.id, {
          participantAId,
          participantBId,
          mode,
          durationSecs,
        });
      } catch {
        toast.show("Failed to start battle", "error");
      }
    },
    [room, toast],
  );

  const handleCancelQueue = useCallback(async () => {
    try {
      await pkApi.leaveQueue(pkQueueDuration);
    } catch (e) {
      logDiagnostic('api_http', 'pk_leaveQueue_failed', { duration: pkQueueDuration, error: String(e) });
    }
    setIsInPkQueue(false);
  }, [pkQueueDuration]);

  const handleInviteRoom = useCallback((durationSecs: number) => {
    setPkInviteSheetDuration(durationSecs);
  }, []);

  const handleHostClosePress = useCallback(() => {
    setEndModalVisible(true);
  }, []);

  const handleKeepRoom = useCallback(async () => {
    if (!room) return;
    skipBeforeRemoveCleanupRef.current = true;
    setEndModalVisible(false);
    const theme = activeTheme ?? room.activeTheme ?? null;
    const bgUrl = theme?.backgroundImageUrl?.trim() || null;
    const cover =
      room.coverImage?.trim() || room.host.avatar?.trim() || null;
    roomSession.keepInBackground({
      preservePublishing: mySeatedPosition !== null,
      display: {
        title: room.title,
        coverUrl: cover,
        backgroundImageUrl: bgUrl,
        gradientFrom: theme?.gradientFrom,
        gradientTo: theme?.gradientTo,
        roomMode: room.roomMode,
        isLocked: room.isLocked,
        hostId: room.host.id,
        seatPosition: mySeatedPosition,
      },
    });
    safeGoBack(navigation);
  }, [navigation, room, roomSession, mySeatedPosition, activeTheme]);

  // Host exit: clear mic + socket presence for others, then leave screen.
  const handleHostExitRoom = useCallback(async () => {
    skipBeforeRemoveCleanupRef.current = true;
    sessionEndedRef.current = true;
    setEndModalVisible(false);
    clearRoomChat();
    const pos = mySeatedPosition ?? mySeatPositionRef.current;
    if (pos !== null) {
      try {
        await roomsApi.leaveSeat(roomId, pos);
      } catch {
        /* best-effort */
      }
    }
    roomSession.stopSession();
    safeGoBack(navigation);
  }, [
    navigation,
    roomSession,
    clearRoomChat,
    roomId,
    mySeatedPosition,
  ]);

  const handleGuestKeep = useCallback(async () => {
    if (!room) return;
    skipBeforeRemoveCleanupRef.current = true;
    setEndModalVisible(false);
    const theme = activeTheme ?? room.activeTheme ?? null;
    const bgUrl = theme?.backgroundImageUrl?.trim() || null;
    const cover =
      room.coverImage?.trim() || room.host.avatar?.trim() || null;
    roomSession.keepInBackground({
      preservePublishing: mySeatedPosition !== null,
      display: {
        title: room.title,
        coverUrl: cover,
        backgroundImageUrl: bgUrl,
        gradientFrom: theme?.gradientFrom,
        gradientTo: theme?.gradientTo,
        roomMode: room.roomMode,
        isLocked: room.isLocked,
        hostId: room.host.id,
        seatPosition: mySeatedPosition,
      },
    });
    safeGoBack(navigation);
  }, [mySeatedPosition, navigation, room, roomSession, activeTheme]);

  const handleGuestExit = useCallback(async () => {
    skipBeforeRemoveCleanupRef.current = true;
    sessionEndedRef.current = true;
    setEndModalVisible(false);
    clearRoomChat();
    if (mySeatedPosition !== null) {
      try {
        await roomsApi.leaveSeat(roomId, mySeatedPosition);
      } catch (e) {
        logDiagnostic('api_http', 'leaveSeat_guestExit_failed', { roomId, error: String(e) });
      }
    }
    roomSession.stopSession();
    safeGoBack(navigation);
  }, [roomId, mySeatedPosition, navigation, roomSession, clearRoomChat]);

  // Gesture-dismiss / stack pop without using Exit: clear ephemeral mic presence only.
  // RoomMember (persistent join) is intentionally NOT cleared — it persists until the
  // user explicitly taps the Join pill to leave.
  useEffect(() => {
    const unsub = navigation.addListener("beforeRemove", () => {
      if (skipBeforeRemoveCleanupRef.current) {
        skipBeforeRemoveCleanupRef.current = false;
        return;
      }
      sessionEndedRef.current = true;
      clearRoomChat();
      void (async () => {
        const pos = mySeatPositionRef.current;
        if (pos !== null && !isHostRef.current) {
          try {
            await roomsApi.leaveSeat(roomId, pos);
          } catch {
            /* best-effort */
          }
        }
        roomSession.stopSession();
      })();
    });
    return unsub;
  }, [navigation, roomId, roomSession, clearRoomChat]);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!isScreenFocused) return false;
      setEndModalVisible(true);
      return true;
    });
    return () => sub.remove();
  }, [isScreenFocused]);

  const handleSeatPress = useCallback(
    async (seat: Seat) => {
      if (seatLoading || !room || !currentUser) return;

      // Leave own seat
      if (seat.user?.id === currentUser.id) {
        setProfileUserId(seat.user.id);
        return;
      }
      if (seat.isLocked || seat.user) return;

      // Apply-for-mic mode: non-host users who are not yet seated go through the queue.
      // Already-seated users can freely move to another empty seat (backend releases old seat atomically).
      if (!isHostOrAdmin && room.applyForMic && mySeatedPosition === null) {
        const res = await applyForSeat(seat.position);
        if (res?.error) {
          Alert.alert("Seat Unavailable", res.error);
        } else if (res?.queued) {
          setApplyingVisible(true);
        }
        return;
      }

      // Optimistically claim the seat and release the previous one.
      // Capture only the original values of the two affected seats so the revert
      // is a targeted functional update — it won't clobber other seats that may
      // have been updated by socket events between the optimistic write and failure.
      const origNew =
        room.seats?.find((s) => s.position === seat.position) ?? null;
      const origOld =
        mySeatedPosition !== null
          ? (room.seats?.find((s) => s.position === mySeatedPosition) ?? null)
          : null;

      const optimisticUser: import("@/types").RoomUser = {
        id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.displayName,
        avatar: currentUser.avatar,
        hakaId: currentUser.hakaId,
        equippedFrame: currentUser.equippedFrame ?? null,
        activeSpecialId: currentUser.activeSpecialId ?? null,
        activeSpecialIdLevel: currentUser.activeSpecialIdLevel ?? null,
      };
      setRoom(
        (prev) =>
          prev && {
            ...prev,
            seats: (prev.seats ?? []).map((s) => {
              if (s.position === seat.position)
                return { ...s, userId: currentUser.id, user: optimisticUser };
              if (s.position === mySeatedPosition)
                return { ...s, userId: null, user: null, isMuted: false };
              return s;
            }),
          },
      );

      setSeatLoading(true);
      try {
        await roomsApi.takeSeat(roomId, seat.position);
      } catch (e: unknown) {
        // Revert only the two seats we touched; leave any other socket-driven
        // updates that arrived during the API round-trip intact.
        setRoom(
          (prev) =>
            prev && {
              ...prev,
              seats: (prev.seats ?? []).map((s) => {
                if (s.position === seat.position && origNew) return origNew;
                if (
                  mySeatedPosition !== null &&
                  s.position === mySeatedPosition &&
                  origOld
                )
                  return origOld;
                return s;
              }),
            },
        );
        Alert.alert(
          "Seat Unavailable",
          e instanceof Error ? e.message : "Could not take this seat",
        );
      } finally {
        setSeatLoading(false);
      }
    },
    [
      seatLoading,
      room,
      currentUser,
      roomId,
      isHost,
      isHostOrAdmin,
      applyForSeat,
      mySeatedPosition,
    ],
  );

  const handleApplyForSeat = useCallback(async () => {
    if (!room) return;
    if (mySeatedPosition !== null) {
      Alert.alert(
        "Already Seated",
        "You are already on a seat. Leave your current seat first.",
      );
      return;
    }
    const res = await applyForSeat(null);
    if (res?.error) {
      Alert.alert("Seat Unavailable", res.error);
    } else if (res?.approved) {
      toast.show("You joined a seat", "success");
      setApplyingVisible(false);
    }
  }, [room, applyForSeat, toast, mySeatedPosition]);

  const handleCancelApplication = useCallback(async () => {
    await cancelSeatApplication();
  }, [cancelSeatApplication]);

  const handleApproveApplicant = useCallback(
    async (applicantUserId: string) => {
      const res = await approveSeatApplicant(applicantUserId);
      if (res?.error) Alert.alert("Could not approve", res.error);
    },
    [approveSeatApplicant],
  );

  const handleKickUserFromRoom = useCallback(
    (target: { id: string } & Partial<Omit<KickTargetUser, "id">>) => {
      if (
        !room ||
        !canKickRoomMember({
          isHost,
          isRoomAdmin,
          targetUserId: target.id,
          hostId: room.host.id,
          roomAdminIds,
          currentUserId: currentUser?.id,
        })
      ) {
        return;
      }

      const viewer =
        viewers.find((v) => v.id === target.id) ??
        (room.seats ?? [])
          .map((s) => s.user)
          .find((u): u is NonNullable<typeof u> => !!u && u.id === target.id);

      setKickTarget({
        id: target.id,
        displayName:
          target.displayName ??
          viewer?.displayName ??
          (target.id === room.host.id ? room.host.displayName : "User"),
        avatar: target.avatar ?? viewer?.avatar ?? null,
        hakaId: target.hakaId ?? viewer?.hakaId ?? null,
        equippedFrame: target.equippedFrame ?? viewer?.equippedFrame ?? null,
        activeSpecialId: target.activeSpecialId ?? viewer?.activeSpecialId ?? null,
        activeSpecialIdLevel:
          target.activeSpecialIdLevel ?? viewer?.activeSpecialIdLevel ?? null,
      });
    },
    [room, isHost, isRoomAdmin, roomAdminIds, currentUser?.id, viewers],
  );

  const handleSeatTap = useCallback(
    (seat: Seat, evt?: { nativeEvent: { pageX: number; pageY: number } }) => {
      // Host tapping their own host seat → show own profile overlay
      if (isHost && seat.position === 1 && seat.user?.id === currentUser?.id) {
        setProfileUserId(seat.user.id);
        return;
      }
      // Host/admin: moderation menu on empty seats, or profile for other users' seats.
      // Host on empty seat 1 takes the mic directly; room admin gets the same menu as on other seats.
      if (isHostOrAdmin && seat.user?.id !== currentUser?.id) {
        if (seat.user) {
          setProfileUserId(seat.user.id);
          return;
        }
        if (seat.position === 1 && isHost) {
          handleSeatPress(seat);
          return;
        }
        setSeatMenu({
          seat,
          x: evt?.nativeEvent.pageX ?? 0,
          y: evt?.nativeEvent.pageY ?? 0,
        });
        return;
      }
      // Non-host tapping occupied seat → profile overlay
      if (seat.user && seat.user.id !== currentUser?.id) {
        setProfileUserId(seat.user.id);
        return;
      }
      // Otherwise: take or leave seat
      handleSeatPress(seat);
    },
    [isHost, isHostOrAdmin, currentUser, handleSeatPress],
  );

  const handleSeatLongPress = useCallback(
    (seat: Seat) => {
      if (!isHostOrAdmin || seat.position === 1) return;
      Alert.alert(
        seat.isLocked ? "Unlock Seat" : "Lock Seat",
        seat.isLocked
          ? `Unlock seat ${seat.position}?`
          : `Lock seat ${seat.position}?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: seat.isLocked ? "Unlock" : "Lock",
            onPress: async () => {
              const newLocked = !seat.isLocked;
              // Optimistic update
              setRoom((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  seats: (prev.seats ?? []).map((s) =>
                    s.position === seat.position
                      ? { ...s, isLocked: newLocked }
                      : s,
                  ),
                };
              });
              try {
                await roomsApi.lockSeat(roomId, seat.position, newLocked);
              } catch (e: unknown) {
                // Revert on failure
                setRoom((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    seats: (prev.seats ?? []).map((s) =>
                      s.position === seat.position
                        ? { ...s, isLocked: !newLocked }
                        : s,
                    ),
                  };
                });
                Alert.alert("Error", e instanceof Error ? e.message : "Failed");
              }
            },
          },
        ],
      );
    },
    [isHostOrAdmin, roomId, loadRoom],
  );

  // ── Derived / memoized values (hooks — must live before any early return) ──

  // Stable bubble background style — only re-computes when the active theme changes.
  // Per-user chat bubble cosmetics override this via CosmeticChatBubbleShell.
  const chatBubbleBgStyle = useMemo(
    () =>
      activeTheme?.chatBubbleColor
        ? ({ backgroundColor: `${activeTheme.chatBubbleColor}CC` as const })
        : ({ backgroundColor: "transparent" as const }),
    [activeTheme],
  );

  const seatLayout = useMemo(() => {
    const mic = room?.micConfig ?? 10;
    return computeSeatLayout(mic, seatGridWidth, SCREEN_HEIGHT);
  }, [room?.micConfig, seatGridWidth]);

  const roomSeatRows = useMemo(() => {
    const mic = room?.micConfig ?? 10;
    return getRoomSeatRows(mic, seatLayout.cols);
  }, [room?.micConfig, seatLayout.cols]);

  const seatRowGap = seatLayout.rowGap;
  const flatSeatGrid = isFlatMicGrid(room?.micConfig ?? 10);
  const seatHorizontalPad = getSeatHorizontalPad(room?.micConfig ?? 10);

  /** Y of first pixel below seat icons (geometry floor) — chat never starts above this. */
  const estimatedSeatBlockBottomPx = useMemo(() => {
    const mic = room?.micConfig ?? 10;
    return estimateSeatBlockBottomPx(
      seatLayout.seatSize,
      mic,
      roomSeatRows,
      insets.top,
      SCREEN_HEIGHT,
    );
  }, [
    insets.top,
    room?.micConfig,
    roomSeatRows,
    seatLayout.seatSize,
  ]);

  // O(1) seat lookup map — rebuilds only when the seats array reference changes.
  const seatMap = useMemo(
    () => new Map((room?.seats ?? []).map((s) => [s.position, s])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room?.seats],
  );

  /** Chat top: max(measured, geometry floor) so comments never sit under seat icons. */
  const chatAreaTop = useMemo(() => {
    if (isLiveRoom) return chatAreaTopFromMeasure;
    const gap = Spacing.md;
    return Math.max(chatAreaTopFromMeasure, estimatedSeatBlockBottomPx + gap);
  }, [isLiveRoom, chatAreaTopFromMeasure, estimatedSeatBlockBottomPx]);

  const chatAreaBottom = useMemo(() => {
    if (keyboardVisible && keyboardHeight > 0) {
      return keyboardHeight + ROOM_COMPOSER_BAR_HEIGHT;
    }
    return insets.bottom + 90;
  }, [keyboardVisible, keyboardHeight, insets.bottom]);

  useEffect(() => {
    if (!keyboardVisible) return;
    const t = setTimeout(() => {
      chatListRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [keyboardVisible, keyboardHeight]);

  if (lockProbeLoading) {
    return (
      <View style={styles.centered}>
        <DetailSkeleton />
      </View>
    );
  }

  // ── Strict locked-room gate ───────────────────────────────────────────────
  // When navigated with `isLocked: true` for a room I don't own, render only the
  // password overlay. The room is not loaded and the audio/socket session is not
  // started, so the user cannot listen until the correct password is entered.
  if (strictLockedGate) {
    return (
      <View style={styles.screen}>
        <RoomThemeBackground theme={null} />
        <RoomPasswordOverlay
          visible
          mode="enter"
          error={passwordError}
          onClose={() => safeGoBack(navigation)}
          onSubmit={(pwd) => {
            setPasswordError(null);
            setRoomPassword(pwd);
            setLoading(true);
            // Re-trigger room load now that we have a password to send.
            void loadRoom();
          }}
        />
      </View>
    );
  }

  // ── Loading / Error states ────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <DetailSkeleton />
      </View>
    );
  }

  if (error || !room) {
    return (
      <View style={styles.centered}>
        <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
        <Text style={styles.errorText}>{error ?? "Room not found"}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadRoom}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            skipBeforeRemoveCleanupRef.current = true;
            clearRoomChat();
            safeGoBack(navigation);
          }}
          style={styles.goBackLink}
        >
          <Text style={styles.goBackText}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const seatSize = seatLayout.seatSize;
  const hostSeat = seatMap.get(1);
  const coHostSeat = seatMap.get(2);

  return (
    <View style={styles.screen}>
      {/* ── Background: host live video OR theme background ── */}
      {showHostVideo ? (
        <AgoraVideoView
          uid={isHostEffective ? 0 : hostAgoraUid}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <RoomThemeBackground theme={activeTheme} />
      )}
      {/* Overlay gradient — live rooms only: keeps UI readable over camera feed */}
      {isLiveRoom && (
        <LinearGradient
          colors={["rgba(0,0,0,0.25)", "transparent", "rgba(0,0,0,0.75)"]}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}

      {pendingSeatInvite ? (
        <InRoomSeatInviteBanner
          payload={pendingSeatInvite}
          onDismiss={() => setPendingSeatInvite(null)}
        />
      ) : null}

      {/* ── Top bar ── */}
      <View style={[styles.topBar, { top: insets.top + Spacing.xs }]}>
        <View style={styles.topLeft}>
          <View style={styles.hostInfoCol}>
          <View style={styles.hostInfoCard}>
            <TouchableOpacity
              style={styles.hostInfoMain}
              activeOpacity={0.7}
              onPress={() => setInfoVisible(true)}
            >
              <View
                style={{
                  width: 36,
                  height: 36,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <UserAvatar
                  user={{
                    displayName: room.host.displayName,
                    avatar: room.coverImage || room.host.avatar,
                    equippedFrame: null,
                  }}
                  size={36}
                  hideFrame
                />
              </View>
              <View style={styles.hostTextCol}>
                <View style={styles.hostNameRow}>
                  <Text style={styles.hostDisplayName} numberOfLines={1}>
                    {room.title?.trim() || room.host.displayName}
                  </Text>
                  {isLiveRoom && (
                    <View style={styles.liveModeBadge}>
                      <Text style={styles.liveModeBadgeText}>LIVE</Text>
                    </View>
                  )}
                  {isHost && (
                    <Ionicons
                      name="create-outline"
                      size={12}
                      color="rgba(255,255,255,0.85)"
                      style={{ marginLeft: 4 }}
                    />
                  )}
                </View>
                <CopyableId
                  value={room.roomCode || room.id.slice(0, 6)}
                  label="Room ID"
                  textStyle={styles.hostId}
                  iconColor="rgba(255,255,255,0.6)"
                  iconSize={12}
                />
              </View>
            </TouchableOpacity>

            {isHost ? null : (
              <TouchableOpacity
                onPress={handleJoinToggle}
                style={styles.joinBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                {hasJoined ? (
                  <JoinedIcon width={32} height={32} />
                ) : (
                  <FollowIcon width={32} height={32} />
                )}
              </TouchableOpacity>
            )}
          </View>
          {(isHostByParam || isHost) && canPublish && (
            <View style={styles.micTickerWrap}>
              <MicTimeTicker />
            </View>
          )}
          </View>
        </View>

        <View style={styles.topActions}>
          <TouchableOpacity
            style={styles.viewerBadge}
            onPress={() => setRankingVisible(true)}
          >
            <Ionicons name="people" size={13} color="#FFFFFF" />
            <Text style={styles.viewerText}>{viewerCountDisplay}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleHostClosePress}
          >
            <Ionicons name="close" size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Seat grid — chat rooms only (live = full-screen video, no seats) ── */}
      {!isLiveRoom && (
      <View
        style={[
          styles.seatGridContainer,
          flatSeatGrid && styles.seatGridContainerFlat,
          {
            top: insets.top + computeSeatTopOffset(SCREEN_HEIGHT),
            paddingHorizontal: seatHorizontalPad,
            gap: seatRowGap,
          },
        ]}
        onLayout={handleSeatGridLayout}
      >
        {/* Top row: host + co-host (only when not using unified 5/10 layout) */}
        {roomSeatRows.showDedicatedHostRow && (
          <View style={[styles.topSeatRow, { gap: seatRowGap }]}>
              <SeatItem
                seat={
                  hostSeat ??
                  ({ position: 1, user: null, isLocked: false } as Seat)
                }
                size={seatSize}
                isHostSeat
                isSpeaking={hostSeat ? isSeatUserSpeaking(hostSeat) : false}
                isRoomOwner={!!hostSeat?.user?.id && hostSeat.user.id === room.host.id}
                isMySeat={hostSeat?.user?.id === currentUser?.id}
                activeEmoji={seatEmojis[1] ?? null}
                onEmojiDone={clearSeatEmoji}
                onPress={(e) =>
                  handleSeatTap(
                    hostSeat ??
                      ({ position: 1, user: null, isLocked: false } as Seat),
                    e,
                  )
                }
                onLongPress={() =>
                  handleSeatLongPress(
                    hostSeat ??
                      ({ position: 1, user: null, isLocked: false } as Seat),
                  )
                }
                seatRef={(ref) => {
                  seatRefs.current[1] = ref;
                }}
                calculatorPoints={seatScores[1]?.points}
                onCalcBadgePress={
                  calculatorSession ? handleCalcBadgePress : undefined
                }
                isTopSupporter={
                  !!hostSeat?.user?.id && topSupporterIds.has(hostSeat.user.id)
                }
              />
              <SeatItem
                seat={
                  coHostSeat ??
                  ({ position: 2, user: null, isLocked: false } as Seat)
                }
                size={seatSize}
                isHostSeat={false}
                isSpeaking={coHostSeat ? isSeatUserSpeaking(coHostSeat) : false}
                isRoomOwner={
                  !!coHostSeat?.user?.id && coHostSeat.user.id === room.host.id
                }
                isMySeat={coHostSeat?.user?.id === currentUser?.id}
                isAdmin={
                  !!coHostSeat?.user?.id && roomAdminIds.has(coHostSeat.user.id)
                }
                activeEmoji={seatEmojis[2] ?? null}
                onEmojiDone={clearSeatEmoji}
                onPress={(e) =>
                  handleSeatTap(
                    coHostSeat ??
                      ({ position: 2, user: null, isLocked: false } as Seat),
                    e,
                  )
                }
                onLongPress={() =>
                  handleSeatLongPress(
                    coHostSeat ??
                      ({ position: 2, user: null, isLocked: false } as Seat),
                  )
                }
                seatRef={(ref) => {
                  seatRefs.current[2] = ref;
                }}
                calculatorPoints={seatScores[2]?.points}
                onCalcBadgePress={
                  calculatorSession ? handleCalcBadgePress : undefined
                }
                isTopSupporter={
                  !!coHostSeat?.user?.id &&
                  topSupporterIds.has(coHostSeat.user.id)
                }
              />
            </View>
        )}

        {/* Seat rows */}
        {roomSeatRows.rows.map((row) => (
          <View
            key={`seat-row-${row[0]}`}
            style={[
              styles.seatRow,
              flatSeatGrid ? styles.seatRowFlat : { gap: seatRowGap },
              isLiveRoom && !flatSeatGrid && styles.seatRowLive,
            ]}
          >
            {row.map((pos) => {
                const seat = seatMap.get(pos);
                const fallback =
                  seat ??
                  ({ position: pos, user: null, isLocked: false } as Seat);
                return (
                  <SeatItem
                    key={pos}
                    seat={fallback}
                    size={seatSize}
                    isHostSeat={pos === 1}
                    isSpeaking={seat ? isSeatUserSpeaking(seat) : false}
                    isRoomOwner={
                      !!seat?.user?.id && seat.user.id === room.host.id
                    }
                    isMySeat={seat?.user?.id === currentUser?.id}
                    isAdmin={!!seat?.user?.id && roomAdminIds.has(seat.user.id)}
                    isTopSupporter={
                      !!seat?.user?.id && topSupporterIds.has(seat.user.id)
                    }
                    activeEmoji={seatEmojis[pos] ?? null}
                    onEmojiDone={clearSeatEmoji}
                    onPress={(e) => handleSeatTap(fallback, e)}
                    onLongPress={() => handleSeatLongPress(fallback)}
                    seatRef={(ref) => {
                      seatRefs.current[pos] = ref;
                    }}
                    calculatorPoints={seatScores[pos]?.points}
                    onCalcBadgePress={
                      calculatorSession ? handleCalcBadgePress : undefined
                    }
                  />
                );
            })}
          </View>
        ))}
      </View>
      )}

      {/* ── Calculator timer pill — floating left, vertically centered ── */}
      {calculatorSession && (
        <View style={[styles.timerPillWrap, { bottom: insets.bottom + 340 }]}>
          <CalculatorTimerPill
            session={calculatorSession}
            onExpired={
              isHost
                ? () => roomsApi.endCalculator(room!.id).catch(() => {})
                : undefined
            }
          />
          <TouchableOpacity
            style={styles.supportersBtn}
            onPress={openSessionContributors}
            activeOpacity={0.8}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Ionicons name="trophy" size={14} color="#FFD700" />
          </TouchableOpacity>
        </View>
      )}

      {/* Push content to bottom */}
      <View style={styles.spacer} pointerEvents="none" />

      {/* ── Chat messages (top anchored below seat grid) ── */}
      <View
        style={[
          styles.chatArea,
          { top: chatAreaTop, bottom: chatAreaBottom },
        ]}
      >
        <FlatList
          ref={chatListRef}
          data={chatMessages}
          keyExtractor={(item) => item.id}
          style={styles.chatListView}
          bounces={false}
          overScrollMode="never"
          onContentSizeChange={() =>
            chatListRef.current?.scrollToEnd({ animated: false })
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.chatList}
          maxToRenderPerBatch={15}
          windowSize={21}
          removeClippedSubviews
          ListHeaderComponent={chatAnnouncementHeader}
          renderItem={({ item }) => {
            if (item.type === "gift_notice") {
              const gn = item.giftNotice;
              return (
                <GiftNoticeRow
                  sender={item.sender}
                  giftName={gn?.giftName ?? "Gift"}
                  giftIcon={gn?.giftIcon ?? ""}
                  giftImageFallback={gn?.giftImageFallback}
                  recipientName={gn?.recipientName ?? ""}
                  qty={gn?.qty ?? 1}
                  onPressSender={
                    item.sender?.id
                      ? () => setProfileUserId(item.sender.id)
                      : undefined
                  }
                />
              );
            }
            if (item.type === "system" || item.kind === "system") {
              return (
                <View style={styles.systemRow}>
                  <View style={styles.systemAvatar}>
                    <Ionicons
                      name="megaphone"
                      size={14}
                      color={Colors.textInverse}
                    />
                  </View>
                  <View style={styles.systemBody}>
                    <Text style={styles.systemName}>System</Text>
                    <View style={styles.systemBubble}>
                      <Text style={styles.systemBubbleText}>
                        {item.content ?? ""}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            }
            const name = item.sender?.displayName ?? "User";
            const color = senderColor(name);
            const senderIsRoomOwner =
              !!item.sender?.id && item.sender.id === room.host.id;
            const senderIsRoomAdmin =
              !!item.sender?.id &&
              !senderIsRoomOwner &&
              roomAdminIds.has(item.sender.id);

            if (item.type === "image" && item.mediaUrl) {
              const bubbleVisuals = getChatBubbleVisualSources(
                item.sender,
                item.sender?.id === currentUser?.id ? currentUser : null,
              );
              const hasBubble = !!(bubbleVisuals.fill || bubbleVisuals.animation);
              const avatarUser = toAvatarUser(
                name,
                item.sender?.avatar ?? null,
                item.sender,
              );
              const openSenderProfile = () => {
                if (item.sender?.id) setProfileUserId(item.sender.id);
              };
              const senderHeader = (
                <View style={styles.chatSenderRow}>
                  <UsernameRoleBadges
                    isRoomOwner={senderIsRoomOwner}
                    isRoomAdmin={senderIsRoomAdmin}
                  />
                  <Text style={[styles.chatSender, { color }]}>@ {name}</Text>
                </View>
              );
              const imageContent = (
                <>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setPhotoViewerUri(item.mediaUrl ?? null)}
                    style={styles.chatImageWrap}
                  >
                    <Image
                      source={{ uri: item.mediaUrl }}
                      style={styles.chatImage}
                      contentFit="cover"
                    />
                  </TouchableOpacity>
                  {item.content && item.content.length > 0 ? (
                    <Text style={styles.chatImageCaption}>
                      {item.content}
                    </Text>
                  ) : null}
                </>
              );

              if (hasBubble) {
                return (
                  <View style={styles.chatBubbleCosmeticWrap}>
                    <CosmeticChatBubbleShell
                      fill={bubbleVisuals.fill}
                      animation={bubbleVisuals.animation}
                      fallback={bubbleVisuals.fallback}
                      avatar={
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={openSenderProfile}
                        >
                          <UserAvatar
                            user={avatarUser}
                            size={COSMETIC_CHAT_AVATAR_SIZE}
                            hideFrame
                          />
                        </TouchableOpacity>
                      }
                      header={senderHeader}
                    >
                      {imageContent}
                    </CosmeticChatBubbleShell>
                  </View>
                );
              }

              return (
                <View style={styles.chatBubble}>
                  <TouchableOpacity activeOpacity={0.7} onPress={openSenderProfile}>
                    <UserAvatar
                      user={avatarUser}
                      size={COSMETIC_CHAT_AVATAR_SIZE}
                      hideFrame
                    />
                  </TouchableOpacity>
                  <View style={[styles.chatBubbleBody, chatBubbleBgStyle, { flex: 1 }]}>
                    {senderHeader}
                    {imageContent}
                  </View>
                </View>
              );
            }

            const bubbleVisuals = getChatBubbleVisualSources(
              item.sender,
              item.sender?.id === currentUser?.id ? currentUser : null,
            );
            const hasBubble = !!(bubbleVisuals.fill || bubbleVisuals.animation);
            const avatarUser = toAvatarUser(
              name,
              item.sender?.avatar ?? null,
              item.sender,
            );
            const openSenderProfile = () => {
              if (item.sender?.id) setProfileUserId(item.sender.id);
            };
            const senderHeader = (
              <View style={styles.chatSenderRow}>
                <UsernameRoleBadges
                  isRoomOwner={senderIsRoomOwner}
                  isRoomAdmin={senderIsRoomAdmin}
                />
                <Text style={[styles.chatSender, { color }]}>@ {name}</Text>
              </View>
            );

            if (hasBubble) {
              return (
                <View style={styles.chatBubbleCosmeticWrap}>
                  <CosmeticChatBubbleShell
                    fill={bubbleVisuals.fill}
                    animation={bubbleVisuals.animation}
                    fallback={bubbleVisuals.fallback}
                    avatar={
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={openSenderProfile}
                      >
                        <UserAvatar
                          user={avatarUser}
                          size={COSMETIC_CHAT_AVATAR_SIZE}
                          hideFrame
                        />
                      </TouchableOpacity>
                    }
                    header={senderHeader}
                  >
                    <Text style={styles.chatBubbleCosmeticMessage}>
                      {item.content ?? ""}
                    </Text>
                  </CosmeticChatBubbleShell>
                </View>
              );
            }

            const textBody = (
              <View style={styles.chatContentRow}>
                <UsernameRoleBadges
                  isRoomOwner={senderIsRoomOwner}
                  isRoomAdmin={senderIsRoomAdmin}
                />
                <Text style={styles.chatContent}>
                  <Text style={[styles.chatSender, { color }]}>@ {name} </Text>
                  {item.content ?? ""}
                </Text>
              </View>
            );
            return (
              <View style={styles.chatBubble}>
                <TouchableOpacity activeOpacity={0.7} onPress={openSenderProfile}>
                  <UserAvatar
                    user={avatarUser}
                    size={COSMETIC_CHAT_AVATAR_SIZE}
                    hideFrame
                  />
                </TouchableOpacity>
                <View style={[styles.chatBubbleBody, chatBubbleBgStyle, { flex: 1 }]}>
                  {textBody}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={styles.chatEmpty}>Be the first to say something!</Text>
          }
        />
      </View>

      {/* ── Floating "X entered the room" banners (pass-through touches) ── */}
      {joinBanners.length > 0 && (
        <View pointerEvents="box-none" style={styles.joinBannerOverlay}>
          <View pointerEvents="none" style={styles.joinBannerStack}>
            {joinBanners.map((b) => (
              <JoinBanner
                key={b.id}
                name={b.name}
                avatar={b.avatar}
                equippedFrame={b.equippedFrame}
              />
            ))}
          </View>
        </View>
      )}

      {/* ── Joiner-only toast (pass-through touches) ── */}
      {showJoinToast && (
        <View pointerEvents="box-none" style={styles.joinToastOverlay}>
          <View pointerEvents="none" style={styles.joinToastWrap}>
            <View style={styles.joinToast}>
              <Text style={styles.joinToastText}>Room joined, have fun 🎉</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Gift toast stack (left center, pass-through touches) ── */}
      {giftToasts.length > 0 && (
        <View pointerEvents="box-none" style={styles.giftToastOverlay}>
          <View pointerEvents="none" style={styles.giftToastAnchor}>
            <GiftToastStack items={giftToasts} onDismiss={dismissGiftToast} />
          </View>
        </View>
      )}

      {/* ── Flying gift animations (basic gifts) ── */}
      {flyingGifts.map((fg) => (
        <FlyingGift
          key={fg.id}
          icon={fg.icon}
          image={fg.image}
          targetRef={seatRefs.current[fg.targetPosition] ?? null}
          onComplete={() =>
            setFlyingGifts((prev) => prev.filter((g) => g.id !== fg.id))
          }
        />
      ))}

      {/* Gift effects are now all full-screen via SVGAGiftEffect / SpecialGiftEffect */}

      {/* ── Bottom bar (sticks above keyboard) ── */}
      <KeyboardStickyFooter
        style={styles.bottomBarDock}
        barBackgroundColor={
          showChatComposer ? Colors.background : "transparent"
        }
        safeBottomPadding={insets.bottom + Spacing.xs}
        flushWhenOpen
      >
        <View style={showChatComposer ? styles.chatComposerBar : undefined}>
        <View
          style={showChatComposer ? styles.chatComposerRow : styles.bottomBar}
        >
          {!showChatComposer &&
          !isLiveRoom &&
          !isHost &&
          mySeatedPosition === null &&
          room &&
          (!hasJoined || room.applyForMic) ? (
            <TouchableOpacity
              style={styles.bottomCircleBtn}
              onPress={handleApplyForSeat}
              accessibilityRole="button"
              accessibilityLabel="Apply for seat"
            >
              <ApplySeatIcon width={22} height={21} />
            </TouchableOpacity>
          ) : !showChatComposer ? (
            <>
              {isLiveRoom && isHostEffective && (
                <TouchableOpacity
                  style={[
                    styles.bottomCircleBtn,
                    !camEnabled && styles.bottomCircleBtnOff,
                  ]}
                  onPress={toggleCam}
                  disabled={isExpoGo || !lkConnected}
                  accessibilityRole="button"
                  accessibilityLabel={camEnabled ? "Turn camera off" : "Turn camera on"}
                >
                  <Ionicons
                    name={camEnabled ? "videocam" : "videocam-off"}
                    size={22}
                    color="#FFFFFF"
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.bottomCircleBtn,
                  (isHostEffective || mySeatedPosition !== null) &&
                    (!micEnabled || mySeatMutedByHost) &&
                    styles.bottomCircleBtnOff,
                  !isHostEffective &&
                    mySeatedPosition === null &&
                    styles.bottomCircleBtnOff,
                ]}
                onPress={
                  isHostEffective || mySeatedPosition !== null
                    ? toggleMic
                    : undefined
                }
                disabled={
                  (isHostEffective || mySeatedPosition !== null) &&
                  !isExpoGo &&
                  !lkConnected
                }
                accessibilityRole="button"
                accessibilityLabel={
                  (isHostEffective || mySeatedPosition !== null) &&
                  (!micEnabled || mySeatMutedByHost)
                    ? "Microphone muted"
                    : "Microphone"
                }
              >
                <View style={styles.bottomMicIconWrap} pointerEvents="none">
                  <RNImage
                    source={unmuteMicPng}
                    style={styles.bottomMicPng}
                    resizeMode="contain"
                  />
                  {(isHostEffective || mySeatedPosition !== null) &&
                    (!micEnabled || mySeatMutedByHost) && (
                    <View style={styles.bottomMicSlash} />
                  )}
                </View>
              </TouchableOpacity>
            </>
          ) : null}

          <View
            style={
              showChatComposer
                ? styles.chatComposerInputWrap
                : styles.chatInputWrap
            }
          >
            <TextInput
              ref={chatInputRef}
              style={[
                showChatComposer ? styles.chatComposerInput : styles.chatInput,
                ((room?.chatLocked && !isHostOrAdmin) || chatMuted) &&
                  (showChatComposer
                    ? styles.chatComposerInputLocked
                    : styles.chatInputLocked),
              ]}
              underlineColorAndroid="transparent"
              value={chatInput}
              onChangeText={setChatInput}
              placeholder={
                chatMuted
                  ? "You are muted"
                  : room?.chatLocked && !isHostOrAdmin
                  ? "Chat is disabled"
                  : showChatComposer
                  ? "Type something..."
                  : "Hi..."
              }
              placeholderTextColor={
                showChatComposer ? "#AAAAAA" : "rgba(255,255,255,0.4)"
              }
              selectionColor={Colors.primary}
              maxLength={300}
              returnKeyType="send"
              onSubmitEditing={handleSendChat}
              onFocus={() => {
                setShowEmoji(false);
                requestAnimationFrame(() => {
                  chatListRef.current?.scrollToEnd({ animated: true });
                });
              }}
              editable={!chatMuted && !(room?.chatLocked && !isHostOrAdmin)}
            />
          </View>

          {showChatComposer ? (
            <TouchableOpacity
              style={[
                styles.chatComposerSendBtn,
                (!chatInput.trim() ||
                  chatMuted ||
                  (room?.chatLocked && !isHostOrAdmin)) &&
                  styles.chatComposerSendBtnDisabled,
              ]}
              onPress={handleSendChat}
              disabled={
                !chatInput.trim() ||
                chatMuted ||
                (room?.chatLocked && !isHostOrAdmin)
              }
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              <Ionicons name="send" size={17} color="#FFFFFF" />
            </TouchableOpacity>
          ) : (
            <>
            {!showChatComposer && mySeatedPosition !== null && (
              <TouchableOpacity
                style={styles.emojiInlineBtn}
                onPress={() => {
                  setShowEmoji((v) => !v);
                  if (showEmoji) chatInputRef.current?.focus();
                  else chatInputRef.current?.blur();
                }}
              >
                <EmojiIcon width={28} height={28} />
              </TouchableOpacity>
            )}
            {!showChatComposer && chatInput.trim().length > 0 && (
              <TouchableOpacity style={styles.sendBtn} onPress={handleSendChat}>
                <Ionicons name="send" size={14} color="#FFFFFF" />
              </TouchableOpacity>
            )}
            </>
          )}

          {!showChatComposer && (
          <TouchableOpacity
            style={styles.bottomCircleBtn}
            onPress={() => setRoomPlayVisible(true)}
          >
            <AppsIcon width={22} height={22} />
            {isHostOrAdmin && applicants.length > 0 && (
              <View style={styles.applicantBadge}>
                <Text style={styles.applicantBadgeText}>
                  {applicants.length}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          )}

          {!showChatComposer && SHOW_PK_BUTTON && (
            <TouchableOpacity
              style={styles.pkBtn}
              onPress={() => setPkVisible(true)}
            >
              <PkIcon width={48} height={48} />
            </TouchableOpacity>
          )}

          {!showChatComposer && (
          <TouchableOpacity
            style={styles.bottomCircleBtn}
            onPress={() => setInboxVisible(true)}
          >
            <ChatBubbleIcon width={22} height={22} />
          </TouchableOpacity>
          )}

          {!showChatComposer && (
          <TouchableOpacity
            style={styles.bottomCircleBtn}
            onPress={() => setGamesVisible(true)}
          >
            <GameIcon width={TOOLBAR_ICON_LG} height={TOOLBAR_ICON_LG} />
          </TouchableOpacity>
          )}

          {!showChatComposer && (
          <TouchableOpacity style={styles.giftBtn} onPress={handleOpenGifts}>
            <GiftIcon width={TOOLBAR_ICON_LG} height={TOOLBAR_ICON_LG} />
          </TouchableOpacity>
          )}
        </View>
        </View>
      </KeyboardStickyFooter>

      {/* ── Emoji picker (overlaps bottom bar — matches GiftPanel dimensions) ── */}
      {showEmoji && mySeatedPosition !== null && (
        <View
          style={[
            styles.emojiPanel,
            { paddingBottom: insets.bottom + Spacing.md },
          ]}
        >
          <View style={styles.emojiTabs}>
            <TouchableOpacity
              style={styles.emojiTab}
              onPress={() => setEmojiTab("svga")}
            >
              <Text
                style={[
                  styles.emojiTabText,
                  emojiTab === "svga" && styles.emojiTabTextActive,
                ]}
              >
                Emoji
              </Text>
              {emojiTab === "svga" && <View style={styles.emojiTabUnderline} />}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.emojiTab}
              onPress={() => setEmojiTab("text")}
            >
              <Text
                style={[
                  styles.emojiTabText,
                  emojiTab === "text" && styles.emojiTabTextActive,
                ]}
              >
                SVIP Emoji
              </Text>
              {emojiTab === "text" && <View style={styles.emojiTabUnderline} />}
            </TouchableOpacity>
          </View>
          {(() => {
            const list = emojiTab === "svga" ? NORMAL_EMOJIS : SVIP_EMOJIS;
            if (list.length === 0) {
              return (
                <View style={styles.emojiComingSoon}>
                  <Text style={styles.emojiComingSoonText}>Coming soon</Text>
                </View>
              );
            }
            return (
              <FlatList
                style={styles.emojiScroll}
                data={list}
                keyExtractor={(e) => e.key}
                numColumns={4}
                showsVerticalScrollIndicator={false}
                removeClippedSubviews
                maxToRenderPerBatch={12}
                windowSize={5}
                renderItem={({ item: e }) => (
                  <TouchableOpacity
                    style={styles.svgaEmojiBtn}
                    onPress={() => handleEmojiOnSeat(mySeatedPosition!, e.key)}
                  >
                    <Image
                      source={e.thumb}
                      style={styles.svgaEmojiThumb}
                      contentFit="contain"
                    />
                    <Text style={styles.svgaEmojiLabel} numberOfLines={1}>
                      {e.label}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            );
          })()}
        </View>
      )}

      {/* ── Ranking overlay ── */}
      <RankingOverlay
        visible={rankingVisible}
        room={room}
        roomAdminIds={roomAdminIds}
        viewerCount={viewerCountDisplay}
        viewers={viewers}
        initialTab={rankingInitialTab}
        onClose={() => {
          setRankingVisible(false);
          setRankingInitialTab("online");
        }}
      />

      {/* ── User profile overlay ── */}
      {profileUserId && (
        <UserProfileOverlay
          userId={profileUserId}
          currentUserId={currentUser?.id}
          room={room}
          roomAdminIds={roomAdminIds}
          isHost={isHost}
          isRoomAdmin={isRoomAdmin}
          onClose={() => setProfileUserId(null)}
          onKick={() => {
            const s = (room.seats ?? []).find(
              (x) => x.user?.id === profileUserId,
            );
            if (s?.user) {
              setKickTarget({
                id: s.user.id,
                displayName: s.user.displayName,
                avatar: s.user.avatar ?? null,
                hakaId: s.user.hakaId ?? null,
                equippedFrame: s.user.equippedFrame ?? null,
                activeSpecialId: s.user.activeSpecialId ?? null,
                activeSpecialIdLevel: s.user.activeSpecialIdLevel ?? null,
              });
            } else if (profileUserId) {
              handleKickUserFromRoom({ id: profileUserId });
            }
            setProfileUserId(null);
          }}
          onSendGift={(u: { id: string; displayName: string }) => {
            setProfileUserId(null);
            setGiftRecipient({ id: u.id, displayName: u.displayName });
            handleOpenGifts();
          }}
          onChat={(u: { id: string; displayName: string }) => {
            setProfileUserId(null);
            (
              navigation.getParent() as
                | { navigate: (r: string, p: object) => void }
                | undefined
            )?.navigate("DMConversation", {
              userId: u.id,
              displayName: u.displayName,
            });
          }}
          onMention={(u: { id: string; displayName: string }) => {
            setProfileUserId(null);
            setChatInput((prev) => `${prev}@${u.displayName} `);
            chatInputRef.current?.focus();
          }}
        />
      )}

      {/* ── Seat action menu (host / room admin on empty seat) ── */}
      {seatMenu && (
        <SeatActionsMenu
          seat={seatMenu.seat}
          anchorX={seatMenu.x}
          anchorY={seatMenu.y}
          onClose={() => setSeatMenu(null)}
          onInvite={() => {
            setSeatMenu(null);
            setInviteSeatPosition(seatMenu.seat.position);
            setInviteOverlayVisible(true);
          }}
          onToggleLock={async () => {
            const s = seatMenu.seat;
            const newLocked = !s.isLocked;
            setSeatMenu(null);
            setRoom((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                seats: (prev.seats ?? []).map((seat) =>
                  seat.position === s.position
                    ? { ...seat, isLocked: newLocked }
                    : seat,
                ),
              };
            });
            try {
              await roomsApi.lockSeat(roomId, s.position, newLocked);
            } catch (e) {
              setRoom((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  seats: (prev.seats ?? []).map((seat) =>
                    seat.position === s.position
                      ? { ...seat, isLocked: !newLocked }
                      : seat,
                  ),
                };
              });
              Alert.alert("Error", e instanceof Error ? e.message : "Failed");
            }
          }}
          onToggleMute={async () => {
            const s = seatMenu.seat;
            const newMuted = !s.isMuted;
            setSeatMenu(null);
            setRoom((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                seats: (prev.seats ?? []).map((seat) =>
                  seat.position === s.position
                    ? { ...seat, isMuted: newMuted }
                    : seat,
                ),
              };
            });
            try {
              await muteSeat(s.position, newMuted);
            } catch (e) {
              setRoom((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  seats: (prev.seats ?? []).map((seat) =>
                    seat.position === s.position
                      ? { ...seat, isMuted: !newMuted }
                      : seat,
                  ),
                };
              });
              Alert.alert("Error", e instanceof Error ? e.message : "Failed");
            }
          }}
          onTake={async () => {
            const s = seatMenu.seat;
            setSeatMenu(null);
            if (!room || !currentUser) return;

            const origNew =
              room.seats?.find((x) => x.position === s.position) ?? null;
            const origOld =
              mySeatedPosition !== null
                ? room.seats?.find((x) => x.position === mySeatedPosition) ??
                  null
                : null;

            const optimisticUser: import("@/types").RoomUser = {
              id: currentUser.id,
              username: currentUser.username,
              displayName: currentUser.displayName,
              avatar: currentUser.avatar,
              hakaId: currentUser.hakaId,
              equippedFrame: currentUser.equippedFrame ?? null,
              activeSpecialId: currentUser.activeSpecialId ?? null,
              activeSpecialIdLevel: currentUser.activeSpecialIdLevel ?? null,
            };
            setRoom((prev) =>
              prev && {
                ...prev,
                seats: (prev.seats ?? []).map((seat) => {
                  if (seat.position === s.position) {
                    return {
                      ...seat,
                      userId: currentUser.id,
                      user: optimisticUser,
                    };
                  }
                  if (
                    mySeatedPosition !== null &&
                    seat.position === mySeatedPosition
                  ) {
                    return {
                      ...seat,
                      userId: null,
                      user: null,
                      isMuted: false,
                    };
                  }
                  return seat;
                }),
              },
            );

            setSeatLoading(true);
            try {
              await roomsApi.takeSeat(roomId, s.position);
            } catch (e: unknown) {
              setRoom((prev) =>
                prev && {
                  ...prev,
                  seats: (prev.seats ?? []).map((seat) => {
                    if (seat.position === s.position && origNew) return origNew;
                    if (
                      mySeatedPosition !== null &&
                      seat.position === mySeatedPosition &&
                      origOld
                    )
                      return origOld;
                    return seat;
                  }),
                },
              );
              Alert.alert(
                "Seat Unavailable",
                e instanceof Error ? e.message : "Could not take this seat",
              );
            } finally {
              setSeatLoading(false);
            }
          }}
        />
      )}

      {/* ── Kick-out reason modal ── */}
      {kickTarget && (
        <KickReasonModal
          target={kickTarget}
          onClose={() => setKickTarget(null)}
          onConfirm={async (reason) => {
            const t = kickTarget;
            setKickTarget(null);
            try {
              await roomsApi.kickUserFromRoom(roomId, t.id, reason);
              setViewers((prev) => prev.filter((u) => u.id !== t.id));
              setApplicants((prev) => prev.filter((a) => a.userId !== t.id));
            } catch (e) {
              Alert.alert(
                "Error",
                e instanceof Error ? e.message : "Failed to kick",
              );
            }
          }}
        />
      )}

      {/* ── Applying users overlay ── */}
      {applyingVisible && (
        <ApplyingOverlay
          onClose={() => setApplyingVisible(false)}
          applicants={applicants}
          currentUserId={currentUser?.id ?? null}
          isHostOrAdmin={isHostOrAdmin}
          isSeated={mySeatedPosition !== null}
          onApply={handleApplyForSeat}
          onCancel={handleCancelApplication}
          onApprove={handleApproveApplicant}
        />
      )}

      {/* ── Gift panel ── */}
      {room && (
        <GiftPanel
          visible={giftPanelVisible}
          onClose={() => setGiftPanelVisible(false)}
          onSend={handleSendGift}
          coinBalance={coinBalance}
          seatedUsers={(room.seats ?? [])
            .filter((s) => !!s.user)
            .map((s) => ({
              id: s.user!.id,
              displayName: s.user!.displayName,
              avatar: s.user!.avatar ?? null,
              seatPosition: s.position,
              equippedFrame: s.user!.equippedFrame ?? null,
            }))}
          initialRecipientId={giftRecipient?.id ?? null}
        />
      )}

      {room && (
        <InviteOverlay
          visible={inviteOverlayVisible}
          onClose={() => {
            setInviteOverlayVisible(false);
            setInviteSeatPosition(null);
          }}
          roomId={roomId}
          seats={room.seats ?? []}
          roomUsers={viewers}
          targetSeatPosition={inviteSeatPosition}
        />
      )}

      <RoomShareOverlay
        visible={shareOverlayVisible}
        onClose={() => setShareOverlayVisible(false)}
        roomId={roomId}
        roomTitle={room?.title}
      />

      <PhotoShareOverlay
        visible={photoShareVisible}
        asset={photoShareAsset}
        roomId={roomId}
        onClose={() => {
          setPhotoShareVisible(false);
          setPhotoShareAsset(null);
        }}
        onSent={(msg) =>
          setChatMessages((prev) => {
            const enriched = enrichRoomChatMessage(msg, currentUser) as ChatMessage;
            return prev.some((m) => m.id === enriched.id) ? prev : [...prev, enriched];
          })
        }
      />

      <PhotoViewerModal
        visible={!!photoViewerUri}
        uri={photoViewerUri}
        onClose={() => setPhotoViewerUri(null)}
      />

      <RoomPlayOverlay
        visible={roomPlayVisible}
        onClose={() => setRoomPlayVisible(false)}
        isHost={isHost}
        isHostOrAdmin={isHostOrAdmin}
        hasPendingSeatApplication={hasPendingSeatApplication}
        toolStates={{
          voice: voiceEnabled,
          effects: giftEffectsEnabled,
          call: callEnabled,
          publicmsg: !(room?.chatLocked ?? false),
          calculator: !!calculatorSession,
        }}
        onAction={async (key) => {
          if (key === "photo") {
            try {
              const perm =
                await ImagePicker.requestMediaLibraryPermissionsAsync();
              if (!perm.granted) {
                toast.show("Allow photo access to share images", "error");
                return;
              }
              // Keep the Play overlay open during the picker call. On iOS the
              // picker needs a live presenting VC — closing the Modal first
              // destroys that VC before the picker can attach. OVER_FULL_SCREEN
              // lets PHPickerViewController present over the RN Modal window.
              const picked = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ["images"],
                allowsEditing: false,
                quality: 0.85,
                ...(Platform.OS === "ios" && {
                  presentationStyle:
                    ImagePicker.UIImagePickerPresentationStyle.OVER_FULL_SCREEN,
                }),
              });
              // Close Play overlay now that picker is done, then wait for the
              // native dismiss animation before opening the share sheet so both
              // Modals are never animating simultaneously.
              setRoomPlayVisible(false);
              if (picked.canceled || !picked.assets?.[0]) return;
              await new Promise<void>((resolve) => setTimeout(resolve, 400));
              const a = picked.assets[0];
              setPhotoShareAsset({
                uri: a.uri,
                width: a.width ?? 1,
                height: a.height ?? 1,
                mimeType: a.mimeType,
                fileName: a.fileName ?? undefined,
              });
              setPhotoShareVisible(true);
            } catch (err: any) {
              toast.show(
                err?.message ?? "Failed to open photo picker",
                "error",
              );
            }
            return;
          }
          if (key === "voice") {
            const next = !voiceEnabled;
            setVoiceEnabled(next);
            try {
              engine?.muteAllRemoteAudioStreams(!next);
            } catch {
              /* no-op in Expo Go */
            }
            return;
          }
          if (key === "effects") {
            setGiftEffectsEnabled((v) => !v);
            return;
          }
          if (key === "call") {
            setCallEnabled((v) => !v);
            return;
          }
          if (key === "publicmsg") {
            const locked = !(room?.chatLocked ?? false);
            try {
              await roomsApi.toggleChatLock(roomId, locked);
              setRoom((prev) =>
                prev ? { ...prev, chatLocked: locked } : prev,
              );
            } catch (e: any) {
              toast.show(
                e?.message ?? "Failed to update chat setting",
                "error",
              );
            }
            return;
          }
          if (key === "clean") {
            setRoomPlayVisible(false);
            try {
              await roomsApi.clearChat(roomId);
            } catch (e: any) {
              toast.show(e?.message ?? "Failed to clear chat", "error");
            }
            return;
          }
          setRoomPlayVisible(false);
          if (key === "applyer") setApplyingVisible(true);
          else if (key === "message") setInboxVisible(true);
          else if (key === "room-pk") setPkVisible(true);
          else if (key === "calculator") {
            if (calculatorSession) {
              try {
                const result = await roomsApi.endCalculator(room!.id);
                setCalculatorSession(null);
                setSeatScores({});
                setCalcResultScores(result.scores);
                setCalcResultVisible(true);
              } catch {
                // socket calculator:ended will handle cleanup if API call fails
              }
            } else {
              setCalcVisible(true);
            }
          }
          else if (key === "share") setShareOverlayVisible(true);
          else if (key === "music") void handleRoomPlayMusic();
          else if (key === "room_data") setRoomDataVisible(true);
          else if (key === "setting") {
            if (isHostOrAdmin) {
              (
                navigation as { navigate: (r: string, p: object) => void }
              ).navigate("RoomSettings", { roomId });
            }
          }
          else toast.comingSoon("This action");
        }}
      />

      <RoomPKOverlay
        visible={pkVisible}
        onClose={() => setPkVisible(false)}
        onRandomMatch={(durationSecs) => {
          handleRandomMatch(durationSecs);
          setPkVisible(false);
        }}
        onInviteRoom={(durationSecs) => {
          handleInviteRoom(durationSecs);
          setPkVisible(false);
        }}
        isInQueue={isInPkQueue}
        onCancelQueue={handleCancelQueue}
      />

      {pk.activeMatch && (
        <PKBattleOverlay
          match={pk.activeMatch}
          myUserId={currentUser?.id ?? ""}
          hostAAvatar={null}
          hostBAvatar={null}
          onForfeit={pk.forfeit}
        />
      )}

      {activeBattle && (
        <NormalBattleOverlay
          battle={activeBattle}
          myUserId={currentUser?.id ?? ""}
          isHost={isHost}
          onVote={vote}
          onCancel={cancelBattle}
          roomId={roomId}
        />
      )}

      <PKInviteModal
        invite={pk.pendingInvite}
        onAccepted={pk.dismissInvite}
        onDismiss={pk.dismissInvite}
      />

      <PKResultModal
        result={pk.result}
        hostAId={pk.result?.winnerId ?? ""}
        hostAName={room?.host?.displayName ?? "Host A"}
        hostBId=""
        hostBName="Host B"
        onDismiss={pk.dismissResult}
      />

      {battleResult && lastBattleRef.current && (
        <NormalBattleResultModal
          result={battleResult}
          participantAId={lastBattleRef.current.participantAId}
          participantBId={lastBattleRef.current.participantBId}
          onDismiss={dismissBattleResult}
        />
      )}

      <PKInviteRoomSheet
        visible={pkInviteSheetDuration !== null}
        excludeRoomId={roomId}
        durationSecs={pkInviteSheetDuration ?? 300}
        onDismiss={() => setPkInviteSheetDuration(null)}
      />

      <CalculatorOverlay
        visible={calcVisible}
        onClose={() => setCalcVisible(false)}
        onStart={async (durationSeconds) => {
          try {
            const session = await roomsApi.startCalculator(
              room!.id,
              durationSeconds,
            );
            // Show timer immediately for the host — socket event will arrive shortly
            // and is a no-op since calculatorSession is already set.
            setCalculatorSession({
              sessionId: session.id,
              durationSeconds: session.durationSeconds,
              startedAt: session.startedAt,
            });
            setSeatScores({});
          } catch {
            // ignore — if it fails the socket event won't fire either
          }
          setCalcVisible(false);
        }}
      />

      <CalculatorResultModal
        visible={calcResultVisible}
        scores={calcResultScores}
        onDismiss={() => setCalcResultVisible(false)}
      />

      <CalculatorContributorsModal
        visible={calcContributorsVisible}
        roomId={roomId}
        recipientUserId={calcRecipientUserId}
        onDismiss={() => {
          setCalcContributorsVisible(false);
          setCalcRecipientUserId(null);
        }}
      />

      <InboxOverlay
        visible={inboxVisible}
        onClose={() => setInboxVisible(false)}
        currentUserId={currentUser?.id}
      />

      <RoomInfoOverlay
        visible={infoVisible}
        onClose={() => setInfoVisible(false)}
        room={room}
        seats={room.seats ?? []}
        viewers={viewers}
        isHost={isHost}
        isRoomAdmin={isRoomAdmin}
        canManageRoom={isHostOrAdmin}
        currentUserId={currentUser?.id}
        onChatHost={() => {
          setInfoVisible(false);
          (
            navigation.getParent() as
              | { navigate: (r: string, p: object) => void }
              | undefined
          )?.navigate("DMConversation", {
            userId: room.host.id,
            displayName: room.host.displayName,
            avatar: room.host.avatar,
          });
        }}
        onOpenSettings={
          isHostOrAdmin
            ? () => {
                setInfoVisible(false);
                (
                  navigation as { navigate: (r: string, p: object) => void }
                ).navigate("RoomSettings", { roomId });
              }
            : undefined
        }
        onOpenEditInfo={
          isHost
            ? () => {
                setInfoVisible(false);
                handleOpenEditInfo();
              }
            : undefined
        }
        onOpenRoomData={() => {
          setInfoVisible(false);
          setRoomDataVisible(true);
        }}
        onOpenRoomAdmin={() => {
          setInfoVisible(false);
          setRoomAdminVisible(true);
        }}
        onOpenPassword={() => {
          setInfoVisible(false);
          setPasswordOverlayMode("set");
          setPasswordError(null);
          setPasswordOverlayVisible(true);
        }}
        onOpenTheme={() => {
          setInfoVisible(false);
          (navigation.getParent() as any)?.navigate("StoreModal", {
            initialCategory: "theme",
            initialTab: "mine",
            roomId: room.id,
            activeThemeId: activeTheme?.id ?? room.activeTheme?.id ?? null,
          });
        }}
        onShare={() => {
          setInfoVisible(false);
          setShareOverlayVisible(true);
        }}
        onMemberPress={(userId) => {
          setInfoVisible(false);
          (navigation.getParent() as any)?.navigate("PublicProfile", { userId });
        }}
        onKickMember={(member) => handleKickUserFromRoom(member)}
      />

      <RoomDataOverlay
        visible={roomDataVisible}
        onClose={() => setRoomDataVisible(false)}
        room={room}
      />

      <RoomAdminOverlay
        visible={roomAdminVisible}
        onClose={() => setRoomAdminVisible(false)}
        roomId={room.id}
        seats={room.seats ?? []}
        isHost={isHost}
      />

      <RoomPasswordOverlay
        visible={passwordOverlayVisible}
        onClose={() => {
          setPasswordOverlayVisible(false);
          setPasswordError(null);
        }}
        mode={passwordOverlayMode}
        hasPassword={room.isLocked}
        error={passwordError}
        onSubmit={(pw) => {
          setPasswordError(null);
          if (passwordOverlayMode === "set") {
            // Host setting password
            roomsApi
              .update(roomId, { password: pw })
              .then((updated) => {
                setRoom((prev) =>
                  prev
                    ? {
                        ...prev,
                        isLocked: updated.isLocked,
                        password: updated.password,
                      }
                    : prev,
                );
                setPasswordOverlayVisible(false);
                toast.show("Room password set", "success");
              })
              .catch(() => setPasswordError("Failed to set password"));
          } else {
            setRoomPassword(pw);
            setPasswordOverlayVisible(false);
            roomsApi
              .joinRoom(roomId)
              .then(() => {
                patchMembershipCache(true);
                setHasJoined(true);
                setShowJoinToast(true);
              })
              .catch((e: unknown) => {
                toast.show(
                  e instanceof Error ? e.message : "Could not update membership.",
                  "error",
                );
              });
          }
        }}
        onDelete={() => {
          // Host deleting password
          roomsApi
            .update(roomId, { password: null })
            .then((updated) => {
              setRoom((prev) =>
                prev ? { ...prev, isLocked: false, password: null } : prev,
              );
              setPasswordOverlayVisible(false);
              toast.show("Room password removed", "success");
            })
            .catch(() => setPasswordError("Failed to remove password"));
        }}
      />

      <RoomGamesOverlay
        visible={gamesVisible}
        onClose={() => setGamesVisible(false)}
        onStart={(key) => {
          setGamesVisible(false);
          toast.comingSoon(key);
        }}
      />

      {/* ── Special gift full-screen effect — rendered LAST so it sits above all
           siblings.  SVGAGiftEffect uses absolute positioning (not Modal) to
           avoid the iOS modal-over-modal + WKWebView canvas compositing bug. ── */}
      {specialEffect && specialEffect.svgaAsset ? (
        <SVGAGiftEffect
          key={specialEffect.id}
          visible
          svgaAsset={specialEffect.svgaAsset}
          giftImage={specialEffect.giftImage}
          giftIcon={specialEffect.giftIcon}
          senderName={specialEffect.senderName}
          giftName={specialEffect.giftName}
          qty={specialEffect.qty}
          onComplete={advanceGiftEffectQueue}
        />
      ) : specialEffect ? (
        <SpecialGiftEffect
          key={specialEffect.id}
          visible
          animationType={specialEffect.animationType}
          giftIcon={specialEffect.giftIcon}
          giftImage={specialEffect.giftImage}
          senderName={specialEffect.senderName}
          giftName={specialEffect.giftName}
          qty={specialEffect.qty}
          onComplete={advanceGiftEffectQueue}
        />
      ) : null}

      {/* ── Entry effect (category `entry`) — play-once full-screen SVGA on room join ── */}
      {entryEffect ? (
        <EntryEffectOverlay
          key={entryEffect.id}
          visible
          svga={entryEffect.svga}
          name={entryEffect.name}
          onComplete={advanceEntryEffectQueue}
        />
      ) : null}

      {/* ── Combo button ── */}
      {comboState && (
        <View style={[styles.comboWrap, { bottom: insets.bottom + 70 }]}>
          {/* Only the circle button scales on each tap; the count badge is outside so it updates instantly */}
          <Animated.View style={{ transform: [{ scale: comboScale }] }}>
            <TouchableOpacity
              style={styles.comboBtn}
              activeOpacity={0.7}
              onPress={handleComboTap}
            >
              {/* Progress ring */}
              <Svg width={82} height={82} style={StyleSheet.absoluteFill}>
                <Circle
                  cx={41}
                  cy={41}
                  r={38}
                  stroke="rgba(255,255,255,0.15)"
                  strokeWidth={3}
                  fill="none"
                />
                <AnimatedCircle
                  cx={41}
                  cy={41}
                  r={38}
                  stroke={Colors.gold}
                  strokeWidth={3}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 38}`}
                  strokeDashoffset={comboProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [2 * Math.PI * 38, 0],
                  })}
                  transform="rotate(-90 41 41)"
                />
              </Svg>
              {/* Gift icon */}
              {comboState.gift.image ? (
                <Image
                  source={{ uri: comboState.gift.image }}
                  style={styles.comboGiftIcon}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                />
              ) : (
                <Ionicons name="gift" size={36} color={Colors.gold} />
              )}
            </TouchableOpacity>
          </Animated.View>
          {/* Combo label + count — outside the scale animation so the number updates immediately */}
          <TouchableOpacity activeOpacity={0.7} onPress={handleComboTap}>
            <View style={styles.comboLabelRow}>
              <Text style={styles.comboText}>Combo</Text>
              <View style={styles.comboBadge}>
                <Text style={styles.comboBadgeText}>×{comboState.count}</Text>
              </View>
            </View>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Exit choice modal (Keep / Exit) ── */}
      <Modal
        visible={endModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setEndModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.endModalOverlay}
          activeOpacity={1}
          onPress={() => setEndModalVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[
              styles.endModalCard,
              { marginTop: insets.top + Spacing.sm },
            ]}
          >
            <TouchableOpacity
              style={styles.endModalOption}
              activeOpacity={0.7}
              onPress={isHost ? handleKeepRoom : handleGuestKeep}
            >
              <View style={styles.endModalCircle}>
                <View style={styles.keepIconWrap}>
                  <MaterialCommunityIcons
                    name="arrow-bottom-right"
                    size={14}
                    color="#FFFFFF"
                    style={styles.keepIconTL}
                  />
                  <MaterialCommunityIcons
                    name="arrow-top-left"
                    size={14}
                    color="#FFFFFF"
                    style={styles.keepIconBR}
                  />
                </View>
              </View>
              <Text style={styles.endModalLabel}>Keep</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.endModalOption}
              activeOpacity={0.7}
              onPress={isHost ? handleHostExitRoom : handleGuestExit}
            >
              <View style={styles.endModalCircle}>
                <Ionicons name="power" size={22} color="#FFFFFF" />
              </View>
              <Text style={styles.endModalLabel}>Exit</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── Edit Room Info modal (host only) ── */}
      <Modal
        visible={editInfoVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setEditInfoVisible(false)}
      >
        <TouchableOpacity
          style={styles.editInfoOverlay}
          activeOpacity={1}
          onPress={() => setEditInfoVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.editInfoPanel}>
            <Text style={styles.editInfoTitle}>Edit Room Info</Text>

            <TouchableOpacity
              style={styles.editInfoAvatarWrap}
              onPress={handlePickEditCover}
            >
              {editCoverDraft ? (
                <Image
                  source={{ uri: editCoverDraft }}
                  style={styles.editInfoAvatar}
                  contentFit="cover"
                />
              ) : (
                <View
                  style={[styles.editInfoAvatar, styles.editInfoAvatarFallback]}
                >
                  <Ionicons
                    name="image-outline"
                    size={28}
                    color="rgba(0,0,0,0.4)"
                  />
                </View>
              )}
              <View style={styles.editInfoCameraBadge}>
                <Ionicons name="camera-outline" size={12} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
            <Text style={styles.editInfoCoverLabel}>
              Tap to upload room picture
            </Text>

            <Text style={styles.editInfoFieldLabel}>Room Title</Text>
            <TextInput
              style={styles.editInfoInput}
              value={editTitleDraft}
              onChangeText={setEditTitleDraft}
              placeholder="Enter room title..."
              placeholderTextColor="rgba(0,0,0,0.35)"
              maxLength={100}
            />

            <Text style={styles.editInfoFieldLabel}>Announcement</Text>
            <TextInput
              style={[styles.editInfoInput, styles.editInfoTextarea]}
              value={editAnnouncementDraft}
              onChangeText={setEditAnnouncementDraft}
              placeholder="Enter announcement..."
              placeholderTextColor="rgba(0,0,0,0.35)"
              multiline
              textAlignVertical="top"
              maxLength={240}
            />

            <TouchableOpacity
              style={[styles.editInfoSubmitBtn, editSaving && { opacity: 0.6 }]}
              onPress={handleSaveEditInfo}
              disabled={editSaving}
            >
              <LinearGradient
                colors={["#9D7FFF", "#7B4FFF"]}
                style={styles.editInfoSubmitGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.editInfoSubmitText}>Save</Text>
              </LinearGradient>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

    </View>
  );
}

// ── AgoraVideoView ───────────────────────────────────────────────────────────
// Renders an Agora RtcSurfaceView; falls back to null in Expo Go where native
// modules are unavailable.  uid=0 means the local camera track.

function AgoraVideoView({ uid, style }: { uid: number; style?: any }) {
  try {
    const { RtcSurfaceView, VideoSourceType } = require("react-native-agora");
    return (
      <RtcSurfaceView
        style={style ?? StyleSheet.absoluteFill}
        canvas={{
          uid,
          sourceType:
            uid === 0
              ? VideoSourceType.VideoSourceCamera
              : VideoSourceType.VideoSourceRemote,
        }}
      />
    );
  } catch {
    return null;
  }
}

// ── Flying Gift Animation ──────────────────────────────────────────────────

const FlyingGift = React.memo(FlyingGiftInner);
function FlyingGiftInner({
  icon,
  image,
  targetRef,
  onComplete,
}: {
  icon: string;
  image: string | null;
  targetRef: View | null;
  onComplete: () => void;
}) {
  const phase = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!targetRef) {
      onCompleteRef.current();
      return;
    }
    (targetRef as any).measureInWindow?.(
      (x: number, y: number, w: number, h: number) => {
        setTarget({ x: x + w / 2, y: y + h / 2 });
      },
    );
  }, [targetRef]);

  useEffect(() => {
    if (!target) return;
    // Phase 0→0.5: bottom → center (zoom in, ease out)
    // Phase 0.5→0.5: brief hold at center
    // Phase 0.5→1: center → seat (zoom out, ease in)
    Animated.sequence([
      // Fade in
      Animated.timing(opacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
      // Phase 1: rise to center + scale up
      Animated.timing(phase, {
        toValue: 0.5,
        duration: 450,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // Brief hold at center
      Animated.delay(120),
      // Phase 2: fly to seat + scale down
      Animated.timing(phase, {
        toValue: 1,
        duration: 400,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      // Fade out
      Animated.timing(opacity, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start(() => onCompleteRef.current());
  }, [target, phase, opacity]);

  if (!target) return null;

  const SIZE = 40;
  const halfSize = SIZE / 2;
  const startX = SCREEN_WIDTH / 2 - halfSize;
  const startY = SCREEN_HEIGHT - 100;
  const centerX = SCREEN_WIDTH / 2 - halfSize;
  const centerY = SCREEN_HEIGHT / 2 - halfSize;
  const endX = target.x - halfSize;
  const endY = target.y - halfSize;

  const translateX = phase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [startX, centerX, endX],
  });
  const translateY = phase.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [startY, centerY, endY],
  });
  const scale = phase.interpolate({
    inputRange: [0, 0.25, 0.5, 0.75, 1],
    outputRange: [0.4, 1.0, 1.5, 1.0, 0.5],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: SIZE,
        height: SIZE,
        zIndex: 10000,
        elevation: 40,
        opacity,
        transform: [{ translateX }, { translateY }, { scale }],
      }}
    >
      {image ? (
        <Image
          source={{ uri: image }}
          style={{ width: SIZE, height: SIZE }}
          contentFit="contain"
        />
      ) : (
        <View style={{ width: SIZE, height: SIZE, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="gift" size={28} color="#FFD84D" />
        </View>
      )}
    </Animated.View>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function toAvatarUser(
  displayName: string,
  avatar: string | null | undefined,
  sender?: RoomUser | null,
): AvatarUser {
  return {
    displayName,
    avatar,
    equippedFrame: sender?.equippedFrame ?? null,
    equippedRing: sender?.equippedRing ?? null,
    equippedChatBubble: sender?.equippedChatBubble ?? null,
    equippedMicVoiceWave: sender?.equippedMicVoiceWave ?? null,
    equippedProfileCard: sender?.equippedProfileCard ?? null,
    equippedDynamicProfile: sender?.equippedDynamicProfile ?? null,
  };
}

interface SeatItemProps {
  seat: Seat;
  size: number;
  isHostSeat: boolean;
  isSpeaking?: boolean;
  isRoomOwner?: boolean;
  isMySeat: boolean;
  isAdmin?: boolean;
  isTopSupporter?: boolean;
  calculatorPoints?: number;
  onCalcBadgePress?: (userId: string) => void;
  activeEmoji?: { key: string; animKey: number } | null;
  onEmojiDone?: (seatPosition: number, animKey: number) => void;
  onPress: (event: import("react-native").GestureResponderEvent) => void;
  onLongPress?: () => void;
  seatRef?: (ref: View | null) => void;
}

const SeatItem = React.memo(function SeatItem({
  seat,
  size,
  isHostSeat,
  isSpeaking = false,
  isRoomOwner = false,
  isMySeat,
  isAdmin,
  isTopSupporter,
  calculatorPoints,
  onCalcBadgePress,
  activeEmoji,
  onEmojiDone,
  onPress,
  onLongPress,
  seatRef,
}: SeatItemProps) {
  const isOccupied = seat.user !== null;
  const avatarInnerSize = size - 4;
  // Cell reserves the full frame footprint so the equipped ring renders at full
  // size without overlapping the username label or the row below. The seat circle,
  // avatar and empty chair all center within this box, so empty and occupied seats
  // share the same center and stay aligned on the grid.
  const cellExtent = getSeatCellExtent(size);
  const itemWidth = cellExtent + SEAT_ITEM_EXTRA_WIDTH;
  const seatIconSize = Math.round(size * SEAT_ICON_SCALE);
  const labelFontSize = size < 48 ? 9 : 10;
  // When a frame is equipped the avatar shrinks to the frame's transparent hole
  // (so the decorative ring lands around its border); the seat-circle ring + glow
  // hug that avatar instead of the bare seat circle so everything stays concentric.
  const frameSource = seat.user?.equippedFrame?.image ?? null;
  const seatCircleDiam = frameSource
    ? frameAvatarSizeFromHole(cellExtent, frameSource)
    : size;
  const seatInset = (cellExtent - seatCircleDiam) / 2;

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={500}
      style={[styles.seatItemWrap, { width: itemWidth, position: "relative" }]}
    >
      <View
        ref={seatRef}
        style={{
          width: cellExtent,
          height: cellExtent,
          alignItems: "center",
          justifyContent: "center",
          overflow: "visible",
        }}
      >
        {isOccupied && seat.user ? (
          <>
            <SpeakingSeatGlow
              size={seatCircleDiam}
              active={isSpeaking && !seat.user.equippedMicVoiceWave?.image}
              inset={seatInset}
            />
            {isSpeaking && seat.user.equippedMicVoiceWave?.image ? (
              <MicVoiceWaveEffect
                source={seat.user.equippedMicVoiceWave.image}
                seatSize={size}
                wrapWidth={itemWidth}
                cellHeight={cellExtent}
              />
            ) : null}
            <UserAvatar
              user={toAvatarUser(
                seat.user.displayName,
                seat.user.avatar,
                seat.user,
              )}
              size={avatarInnerSize}
              hideBorder
              frameScale={SEAT_AVATAR_FRAME_SCALE}
            />
            {isTopSupporter && (
              <View
                style={[
                  styles.supporterBadge,
                  { top: seatInset - 4, right: seatInset - 4 },
                ]}
                pointerEvents="none"
              >
                <Ionicons name="checkmark-circle" size={14} color={Colors.gold} />
              </View>
            )}
          </>
        ) : seat.isLocked ? (
          <Image
            source={lockSeatImg}
            style={{ width: seatIconSize, height: seatIconSize }}
            contentFit="contain"
          />
        ) : (
          <Image
            source={unlockSeatImg}
            style={{ width: seatIconSize, height: seatIconSize }}
            contentFit="contain"
          />
        )}
      </View>
      {isOccupied && seat.user ? (
        <View style={[styles.seatNameRow, { maxWidth: itemWidth }]}>
          <UsernameRoleBadges
            isRoomOwner={isRoomOwner}
            isRoomAdmin={isAdmin && !isRoomOwner}
            size={10}
          />
          <Text
            style={[styles.seatLabel, { fontSize: labelFontSize }]}
            numberOfLines={1}
          >
            {seat.user.displayName}
          </Text>
        </View>
      ) : (
        <Text
          style={[styles.seatLabel, { fontSize: labelFontSize, maxWidth: itemWidth }]}
          numberOfLines={1}
        >
          {`No. ${seat.position}`}
        </Text>
      )}
      {calculatorPoints !== undefined && calculatorPoints > 0 && (
        <TouchableOpacity
          style={styles.calcBadge}
          onPress={
            seat.user && onCalcBadgePress
              ? () => onCalcBadgePress(seat.user!.id)
              : undefined
          }
          activeOpacity={onCalcBadgePress ? 0.7 : 1}
        >
          <Text style={styles.calcBadgeText}>
            {"🔥 " +
              (calculatorPoints >= 1000
                ? `${(calculatorPoints / 1000).toFixed(1)}k`
                : String(calculatorPoints))}
          </Text>
        </TouchableOpacity>
      )}
      {activeEmoji && isOccupied ? (
        <SeatSvgaEffect
          key={activeEmoji.animKey}
          emojiKey={activeEmoji.key}
          seatSize={size}
          wrapWidth={itemWidth}
          cellHeight={cellExtent}
          animationKey={activeEmoji.animKey}
          onComplete={() => onEmojiDone?.(seat.position, activeEmoji.animKey)}
        />
      ) : null}
      {seat.isMuted && (
        <View
          pointerEvents="none"
          style={[
            styles.mutedOverlay,
            {
              top: seatInset + size - 14,
              right: (itemWidth - cellExtent) / 2 + seatInset,
            },
          ]}
        >
          <MicOffIcon width={10} height={10} />
        </View>
      )}
    </TouchableOpacity>
  );
});

// ── Calculator Timer Pill ───────────────────────────────────────────────────

function CalculatorTimerPill({
  session,
  onExpired,
}: {
  session: {
    sessionId: string;
    durationSeconds: number | null;
    startedAt: string;
  };
  onExpired?: () => void;
}) {
  const { durationSeconds, startedAt } = session;
  const onExpiredRef = useRef(onExpired);
  onExpiredRef.current = onExpired;

  const [remaining, setRemaining] = useState<number | null>(() => {
    if (durationSeconds === null) return null;
    const elapsed = Math.floor(
      (Date.now() - new Date(startedAt).getTime()) / 1000,
    );
    return Math.max(0, durationSeconds - elapsed);
  });

  useEffect(() => {
    if (durationSeconds === null) return;
    const startMs = new Date(startedAt).getTime();
    const tick = () => {
      const elapsed = Math.floor((Date.now() - startMs) / 1000);
      const rem = Math.max(0, durationSeconds - elapsed);
      setRemaining(rem);
      if (rem === 0) onExpiredRef.current?.();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [durationSeconds, startedAt]);

  const formatTime = (secs: number): string => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <View style={styles.timerPill}>
      <Ionicons name="flame" size={13} color="#FF6B00" />
      <Text style={styles.timerPillText}>
        {remaining === null ? "∞" : formatTime(remaining)}
      </Text>
    </View>
  );
}

// ── Ranking Overlay ─────────────────────────────────────────────────────────

type RankingTab = "online" | "contribution" | "game";
type RankingPeriod = "daily" | "weekly";

interface RankingEntry {
  id: string;
  displayName: string;
  avatar: string | null;
  score: number;
  rank: number;
  equippedFrame?: import("@/types").EquippedCosmetic | null;
  richLevel?: number;
  charmLevel?: number;
}

function RankingOverlay({
  visible,
  room,
  roomAdminIds,
  viewerCount,
  viewers,
  initialTab = "online",
  onClose,
}: {
  visible: boolean;
  room: RoomDetail;
  roomAdminIds: Set<string>;
  viewerCount: number;
  viewers: import("@/types").RoomUser[];
  initialTab?: RankingTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<RankingTab>(initialTab);
  const [period, setPeriod] = useState<RankingPeriod>("daily");
  const [contributions, setContributions] = useState<RankingEntry[]>([]);
  const [gameRanking, setGameRanking] = useState<RankingEntry[]>([]);
  const [loadingContrib, setLoadingContrib] = useState(false);
  const [loadingGame, setLoadingGame] = useState(false);
  const insets = useSafeAreaInsets();

  // Online users: room roster (listeners + host + seated), driven by socket events.
  const onlineUsers: RankingEntry[] = viewers.map((u, index) => ({
    id: u.id,
    displayName: u.displayName,
    avatar: u.avatar ?? null,
    equippedFrame: u.equippedFrame ?? null,
    richLevel: u.richLevel ?? 0,
    charmLevel: u.charmLevel ?? 0,
    score: 0,
    rank: index + 1,
  }));

  // Fetch contribution data
  useEffect(() => {
    if (!visible || tab !== "contribution") return;
    let cancelled = false;
    setLoadingContrib(true);
    roomsApi
      .getContributions(room.id, period)
      .then((data) => {
        if (cancelled) return;
        // Overwrite only when fresh data arrives (no empty flash).
        setContributions(
          data.map((c) => ({
            id: c.user.id,
            displayName: c.user.displayName,
            avatar: c.user.avatar,
            score: c.score,
            rank: c.rank,
            equippedFrame: c.user.equippedFrame ?? null,
            richLevel: c.user.richLevel ?? 0,
            charmLevel: c.user.charmLevel ?? 0,
          })),
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingContrib(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, tab, room.id, period]);

  // Fetch game ranking data
  useEffect(() => {
    if (!visible || tab !== "game") return;
    let cancelled = false;
    setLoadingGame(true);
    leaderboardApi
      .getGifters(period)
      .then((data) => {
        if (cancelled) return;
        setGameRanking(
          data.map((entry) => ({
            id: entry.id,
            displayName: entry.displayName,
            avatar: entry.avatar,
            score: entry.score,
            rank: entry.rank,
            equippedFrame: entry.equippedFrame ?? null,
            richLevel: entry.richLevel ?? 0,
            charmLevel: entry.charmLevel ?? 0,
          })),
        );
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingGame(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, tab, period]);

  const listData: RankingEntry[] =
    tab === "online"
      ? onlineUsers
      : tab === "contribution"
        ? contributions
        : gameRanking;

  const isLoading =
    (tab === "contribution" && loadingContrib) ||
    (tab === "game" && loadingGame);

  const TABS: { key: RankingTab; label: string }[] = [
    { key: "online", label: "Online Users" },
    { key: "contribution", label: "Contribution" },
    { key: "game", label: "Game Ranking" },
  ];

  const headerIcon = tab === "contribution" ? "trophy" : "game-controller";
  const headerCount =
    tab === "contribution"
      ? contributions.reduce((sum, c) => sum + (c.score ?? 0), 0)
      : gameRanking.reduce((sum, g) => sum + (g.score ?? 0), 0);

  if (!visible) return null;

  return (
    <View style={overlayStyles.container}>
      <TouchableOpacity
        style={overlayStyles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View
        style={[
          overlayStyles.sheet,
          { paddingBottom: insets.bottom + Spacing.md },
        ]}
      >
        {/* Tabs */}
        <View style={overlayStyles.tabRow}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setTab(t.key)}
              style={overlayStyles.tabBtn}
            >
              <Text
                style={[
                  overlayStyles.tabText,
                  tab === t.key && overlayStyles.tabTextActive,
                ]}
              >
                {t.label}
              </Text>
              {tab === t.key && <View style={overlayStyles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>

        {/* Period toggle + header icon count (contrib/game) */}
        {tab !== "online" ? (
          <View style={overlayStyles.periodRow}>
            <View style={overlayStyles.periodPill}>
              {(["daily", "weekly"] as RankingPeriod[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[
                    overlayStyles.periodSeg,
                    period === p && overlayStyles.periodSegActive,
                  ]}
                  onPress={() => setPeriod(p)}
                >
                  <Text
                    style={[
                      overlayStyles.periodText,
                      period === p && overlayStyles.periodTextActive,
                    ]}
                  >
                    {p === "daily" ? "Daily" : "Weekly"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={overlayStyles.headerIconRow}>
              <Ionicons
                name={headerIcon}
                size={16}
                color={tab === "contribution" ? "#F9A825" : "#B49AFF"}
              />
              <Text style={overlayStyles.headerCountText}>{headerCount}</Text>
            </View>
          </View>
        ) : (
          <Text style={overlayStyles.onlineCount}>
            Online User: {viewerCount}
          </Text>
        )}

        {/* Rows */}
        {isLoading ? (
          <View style={overlayStyles.loadingWrap}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : listData.length === 0 ? (
          <View style={overlayStyles.loadingWrap}>
            <Text style={overlayStyles.loadingText}>
              {tab === "online" ? "No users online" : "No data yet"}
            </Text>
          </View>
        ) : (
          <FlatList
            data={listData}
            keyExtractor={(u) => u.id}
            showsVerticalScrollIndicator={false}
            maxToRenderPerBatch={10}
            windowSize={5}
            ItemSeparatorComponent={() => (
              <View style={overlayStyles.rowDivider} />
            )}
            renderItem={({ item }) => (
              <View style={overlayStyles.userRow}>
                <UserAvatar
                  user={{
                    displayName: item.displayName,
                    avatar: item.avatar,
                    equippedFrame: item.equippedFrame ?? null,
                  }}
                  size={40}
                />

                <View style={overlayStyles.userInfo}>
                  <View style={overlayStyles.userNameRow}>
                    <UsernameRoleBadges
                      isRoomOwner={item.id === room.host.id}
                      isRoomAdmin={
                        item.id !== room.host.id && roomAdminIds.has(item.id)
                      }
                    />
                    <Text style={overlayStyles.userName} numberOfLines={1}>
                      {item.displayName}
                    </Text>
                  </View>
                  <UserLevelBadges
                    richLevel={item.richLevel}
                    charmLevel={item.charmLevel}
                    compact
                  />
                </View>

                {tab !== "online" ? (
                  <View style={overlayStyles.scoreCell}>
                    <View style={overlayStyles.coinDot}>
                      <Text style={overlayStyles.coinDotText}>$</Text>
                    </View>
                    <Text style={overlayStyles.scoreValue}>
                      {(item.score ?? 0).toLocaleString()}
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
          />
        )}
      </View>
    </View>
  );
}

// ── User Profile Overlay ────────────────────────────────────────────────────

function UserProfileOverlay({
  userId,
  currentUserId,
  room,
  roomAdminIds,
  isHost,
  isRoomAdmin,
  onClose,
  onKick,
  onSendGift,
  onChat,
  onMention,
}: {
  userId: string;
  currentUserId?: string;
  room: RoomDetail;
  roomAdminIds: Set<string>;
  isHost: boolean;
  isRoomAdmin: boolean;
  onClose: () => void;
  onKick: () => void;
  onSendGift: (u: { id: string; displayName: string }) => void;
  onChat: (u: { id: string; displayName: string }) => void;
  onMention: (u: { id: string; displayName: string }) => void;
}) {
  const toast = useToast();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const authUser = useSelector((state: RootState) => state.auth.user);
  const isSelf = !!currentUserId && userId === currentUserId;
  const [profile, setProfile] = useState<PublicUser | null>(null);
  const [levels, setLevels] = useState<UserLevelInfo | null>(null);
  const [isFollowing, setIsFollowing] = useState(false);

  const seatUser = (room.seats ?? []).find((s) => s.user?.id === userId)?.user;
  const isRoomOwner = room.host.id === userId;
  const targetIsRoomAdmin = !isRoomOwner && roomAdminIds.has(userId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, l] = await Promise.all([
        usersApi.profile(userId).catch(() => null),
        levelsApi.getUserLevel(userId).catch(() => null),
      ]);
      if (cancelled) return;
      if (p) {
        setProfile(p);
        setIsFollowing(p.isFollowing ?? false);
      }
      if (l) setLevels(l);
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const displayName = profile?.displayName ?? seatUser?.displayName ?? "User";
  const avatar = profile?.avatar ?? seatUser?.avatar ?? null;
  const hakaId = profile?.hakaId ?? seatUser?.hakaId ?? null;
  const country = profile?.country ?? "";
  const equippedFrame =
    profile?.equippedFrame ?? seatUser?.equippedFrame ?? null;
  const activeSpecialId =
    profile?.activeSpecialId ?? seatUser?.activeSpecialId ?? null;
  const activeSpecialIdLevel =
    profile?.activeSpecialIdLevel ?? seatUser?.activeSpecialIdLevel ?? null;
  const richLevel = levels?.richLevel ?? 0;
  const charmLevel = levels?.charmLevel ?? 0;
  const followerCount = profile?.followerCount ?? 0;
  const followingCount = profile?.followingCount ?? 0;

  const handleFollow = async () => {
    const wasFollowing = isFollowing;
    setIsFollowing(!wasFollowing);
    try {
      if (wasFollowing) await usersApi.unfollow(userId);
      else await usersApi.follow(userId);
    } catch (e: any) {
      setIsFollowing(wasFollowing);
      Alert.alert("Error", e?.message || "Failed to update follow");
    }
  };

  const friendCount = (profile as any)?.friendCount ?? 0;
  const visitorCount = (profile as any)?.visitorCount ?? 0;
  const ageRaw = (profile as any)?.age;
  const age: number | null =
    typeof ageRaw === "number" && ageRaw > 0 ? ageRaw : null;
  const genderRaw = isSelf
    ? (authUser?.gender ?? (profile as PublicUser | null)?.gender)
    : (profile as PublicUser | null)?.gender;
  const genderSymbol = getGenderSymbol(genderRaw);
  const genderGradient = getGenderPillGradient(genderRaw);

  return (
    <View style={overlayStyles.container}>
      <TouchableOpacity
        style={overlayStyles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={pStyles.sheetWrapper}>
        {/* Avatar overlapping above the sheet */}
        <TouchableOpacity
          style={pStyles.avatarFloating}
          activeOpacity={0.8}
          onPress={() => {
            onClose();
            navigation.navigate("PublicProfile", { userId });
          }}
        >
          <UserAvatar user={{ displayName, avatar, equippedFrame }} size={88} />
        </TouchableOpacity>
        <View style={[pStyles.sheet, { paddingBottom: insets.bottom + Spacing.xl }]}>
          {/* Top bar: @ (left) and report shield (right) */}
          <View style={pStyles.topBar}>
            <TouchableOpacity
              style={pStyles.topIconBtn}
              onPress={() => onMention({ id: userId, displayName })}
            >
              <Ionicons name="at" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <TouchableOpacity
              style={pStyles.topIconBtn}
              onPress={() => Alert.alert("Report", "Report this user?")}
            >
              <Ionicons name="shield" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Name + verified */}
          <View style={pStyles.nameRow}>
            <UsernameRoleBadges
              isRoomOwner={isRoomOwner}
              isRoomAdmin={targetIsRoomAdmin}
              size={16}
            />
            <Text style={pStyles.displayName} numberOfLines={1}>
              {displayName}
            </Text>
            {(profile as any)?.isVerified && (
              <Ionicons
                name="checkmark-circle"
                size={18}
                color="#3BA0F5"
                style={{ marginLeft: 6 }}
              />
            )}
          </View>
          {!(isSelf && isRoomOwner) && (
            <View style={pStyles.idCenter}>
              {activeSpecialId ? (
                <UserIdBadge
                  hakaId={hakaId}
                  activeSpecialId={activeSpecialId}
                  activeSpecialIdLevel={activeSpecialIdLevel}
                  width={120}
                  height={32}
                  hidePlain
                  style={{ alignSelf: "center" }}
                />
              ) : (
                <CopyableId value={hakaId} textStyle={pStyles.idText} />
              )}
            </View>
          )}

          {/* Badges row */}
          <View style={pStyles.badgesRow}>
            {(genderSymbol || age !== null) && (
              <LinearGradient
                colors={genderGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={pStyles.badgePill}
              >
                {genderSymbol ? (
                  <Text style={pStyles.badgePillText}>{genderSymbol}</Text>
                ) : null}
                {age !== null ? (
                  <Text style={pStyles.badgePillText}>{age}</Text>
                ) : null}
              </LinearGradient>
            )}
            {country && country.length >= 2 ? (
              <View style={pStyles.flagWrap}>
                <Image
                  source={{
                    uri: `https://flagcdn.com/w80/${country.slice(0, 2).toLowerCase()}.png`,
                  }}
                  style={pStyles.flagImg}
                  contentFit="cover"
                />
              </View>
            ) : null}
            {richLevel > 0 && (
              <View style={pStyles.levelBadge}>
                <Image
                  source={
                    RICH[Math.min(Math.max(richLevel, 1), 100)] ?? RICH[1]
                  }
                  style={pStyles.levelIcon}
                  contentFit="contain"
                />
              </View>
            )}
            {charmLevel > 0 && (
              <View style={pStyles.levelBadge}>
                <Image
                  source={
                    CHARM[Math.min(Math.max(charmLevel, 0), 100)] ?? CHARM[0]
                  }
                  style={pStyles.levelIcon}
                  contentFit="contain"
                />
              </View>
            )}
          </View>
          {profile?.tags && profile.tags.length > 0 && (
            <View style={pStyles.tagsRow}>
              <TagBadges tags={profile.tags} size="sm" />
            </View>
          )}

          {/* Stats */}
          <View style={pStyles.statsRow}>
            <StatInline value={friendCount} label="Friends" />
            <StatInline value={followingCount} label="Following" />
            <StatInline value={followerCount} label="Followers" />
            <StatInline value={visitorCount} label="Visitors" />
          </View>

          {/* Kick out (host or room admin; server enforces protected users) */}
          {canKickRoomMember({
            isHost,
            isRoomAdmin,
            targetUserId: userId,
            hostId: room.host.id,
            roomAdminIds,
            currentUserId,
          }) && (
            <TouchableOpacity style={pStyles.kickBlock} onPress={onKick}>
              <Ionicons
                name="person-remove-outline"
                size={24}
                color="#FFFFFF"
              />
              <Text style={pStyles.kickLabel}>Kick out</Text>
            </TouchableOpacity>
          )}

          {/* Action buttons */}
          <View style={pStyles.actionsRow}>
            <TouchableOpacity style={pStyles.actionBtn} onPress={handleFollow}>
              <View
                style={[
                  pStyles.actionIconWrap,
                  { backgroundColor: "rgba(255,107,157,0.15)" },
                ]}
              >
                <Ionicons
                  name={isFollowing ? "person-remove" : "person-add"}
                  size={20}
                  color="#FF6B9D"
                />
              </View>
              <Text style={pStyles.actionLabel}>
                {isFollowing ? "Unfollow" : "Follow"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={pStyles.actionBtn}
              onPress={() => onChat({ id: userId, displayName })}
            >
              <View
                style={[
                  pStyles.actionIconWrap,
                  { backgroundColor: "rgba(77,166,255,0.15)" },
                ]}
              >
                <Ionicons name="chatbubble" size={20} color="#4DA6FF" />
              </View>
              <Text style={pStyles.actionLabel}>Chat</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={pStyles.actionBtn}
              onPress={() => onSendGift({ id: userId, displayName })}
            >
              <View
                style={[
                  pStyles.actionIconWrap,
                  { backgroundColor: "rgba(255,204,0,0.15)" },
                ]}
              >
                <Ionicons name="gift" size={20} color="#FFCC00" />
              </View>
              <Text style={pStyles.actionLabel}>Send Gift</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={pStyles.actionBtn}
              onPress={() => toast.comingSoon("Voice calls")}
            >
              <View
                style={[
                  pStyles.actionIconWrap,
                  { backgroundColor: "rgba(255,107,157,0.15)" },
                ]}
              >
                <Ionicons name="call" size={20} color="#FF6B9D" />
              </View>
              <Text style={pStyles.actionLabel}>Call</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const StatInline = React.memo(function StatInline({
  value,
  label,
}: {
  value: number;
  label: string;
}) {
  return (
    <View style={pStyles.statInline}>
      <Text style={pStyles.statValue}>{value}</Text>
      <Text style={pStyles.statLabel}>{label}</Text>
    </View>
  );
});

const AVATAR_SIZE = 88;
const AVATAR_OVERLAP = AVATAR_SIZE / 2;

const pStyles = StyleSheet.create({
  sheetWrapper: {
    alignItems: "center",
  },
  avatarFloating: {
    zIndex: 10,
    marginBottom: -AVATAR_OVERLAP,
  },
  sheet: {
    backgroundColor: "#1E1A3C",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: AVATAR_OVERLAP + Spacing.sm,
    width: "100%",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    marginTop: -AVATAR_OVERLAP + Spacing.xs,
  },
  topLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  topIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.25)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#2A2550",
  },
  avatarImg: { width: "100%", height: "100%" },
  avatarFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },

  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.sm,
  },
  tagsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 4,
    marginTop: 4,
  },
  displayName: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  idText: {
    textAlign: "center",
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
    marginTop: 2,
  },

  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },
  badgePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    paddingHorizontal: 6,
    height: 16,
    borderRadius: Radius.full,
  },
  badgePillDark: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    height: 16,
    borderRadius: Radius.full,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  levelBadge: {
    alignItems: "center",
    justifyContent: "center",
    height: 16,
  },
  levelIcon: {
    width: 40,
    height: 18,
  },
  idCenter: {
    alignItems: "center",
    marginTop: 2,
  },
  badgePillText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  flagWrap: {
    width: 16,
    height: 16,
    borderRadius: 8,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  flagImg: { width: 30, height: 22 },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.xl,
  },
  statInline: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  statValue: { fontSize: 16, fontWeight: "800", color: "#FFFFFF" },
  statLabel: { fontSize: 12, color: "rgba(255,255,255,0.6)" },

  kickBlock: {
    alignItems: "center",
    marginTop: Spacing.xl,
    gap: 4,
  },
  kickLabel: {
    fontSize: 12,
    color: "#FFFFFF",
    fontWeight: "500",
  },

  actionsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  actionBtn: { alignItems: "center", gap: 6 },
  actionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: "500",
    color: "#FFFFFF",
  },
});

// ── Applying Users Overlay ──────────────────────────────────────────────────

export interface Applicant {
  userId: string;
  displayName: string;
  avatar: string | null;
  username: string | null;
  seatPosition: number | null;
  richLevel?: number;
  charmLevel?: number;
  role?: string;
  hostType?: string;
  isVerified?: boolean;
  gender?: string;
  age?: number | null;
  country?: string;
  tags?: {
    name: string;
    displayName: string;
    color: string;
    iconUrl: string;
  }[];
  createdAt: number;
  equippedFrame?: import("@/types").EquippedCosmetic | null;
  activeSpecialId?: string | null;
}

function ApplicantBadges({ applicant }: { applicant: Applicant }) {
  const role = applicant.role;
  const tags = applicant.tags ?? [];
  const genderIcon = getGenderSymbol(applicant.gender);
  const age =
    typeof applicant.age === "number" && applicant.age > 0
      ? applicant.age
      : null;
  const country =
    applicant.country && applicant.country.length >= 2 ? applicant.country : "";

  const hasAnything =
    !!genderIcon ||
    !!country ||
    role === "host" ||
    role === "agent" ||
    role === "admin" ||
    role === "super_admin" ||
    tags.length > 0;

  if (!hasAnything) return null;

  return (
    <View style={overlayStyles.applyBadgeRow}>
      {country ? (
        <View style={overlayStyles.applyFlagWrap}>
          <Image
            source={{
              uri: `https://flagcdn.com/w80/${country.slice(0, 2).toLowerCase()}.png`,
            }}
            style={overlayStyles.applyFlagIcon}
            contentFit="cover"
          />
        </View>
      ) : null}
      {genderIcon && (
        <View
          style={[
            overlayStyles.applyGenderPill,
            { backgroundColor: getGenderPillBackground(applicant.gender) },
          ]}
        >
          <Text style={overlayStyles.applyGenderText}>{genderIcon}</Text>
          {age !== null && (
            <Text style={overlayStyles.applyGenderText}> {age}</Text>
          )}
        </View>
      )}
      {role === "host" && (
        <RoleTagImage roleKey="coin_seller" tags={tags} height={ROLE_TAG_BADGE_HEIGHT} />
      )}
      {role === "agent" && <AgencyRoleBadge height={ROLE_TAG_BADGE_HEIGHT} />}
      {role === "super_admin" && (
        <RoleTagImage roleKey="super_admin" tags={tags} height={ROLE_TAG_BADGE_HEIGHT} />
      )}
      {role === "admin" && (
        <RoleTagImage roleKey="admin" tags={tags} height={ROLE_TAG_BADGE_HEIGHT} />
      )}
      {tags.length > 0 && <TagBadges tags={tags} size="sm" />}
    </View>
  );
}

function ApplyingOverlay({
  onClose,
  applicants,
  currentUserId,
  isHostOrAdmin,
  isSeated,
  onApply,
  onCancel,
  onApprove,
}: {
  onClose: () => void;
  applicants: Applicant[];
  currentUserId: string | null;
  isHostOrAdmin: boolean;
  isSeated: boolean;
  onApply: () => void;
  onCancel: () => void;
  onApprove: (userId: string) => void;
}) {
  const iAmApplying =
    !!currentUserId && applicants.some((a) => a.userId === currentUserId);

  return (
    <View style={overlayStyles.container}>
      <TouchableOpacity
        style={overlayStyles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      />
      <View style={overlayStyles.applySheet}>
        <View style={overlayStyles.applyHeader}>
          <Text style={overlayStyles.applyTitle}>
            Applying User: {applicants.length}
          </Text>
          <TouchableOpacity onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={20} color="#55556A" />
          </TouchableOpacity>
        </View>

        {applicants.length === 0 ? (
          <View style={overlayStyles.applyEmpty}>
            <View style={overlayStyles.applyEmptyIcon}>
              <Ionicons
                name="chatbubble-ellipses-outline"
                size={40}
                color="#9090AA"
              />
            </View>
            <Text style={overlayStyles.applyEmptyText}>No applying yet</Text>
          </View>
        ) : (
          <ScrollView
            style={overlayStyles.applyList}
            contentContainerStyle={overlayStyles.applyListContent}
          >
            {applicants.map((a) => (
              <View key={a.userId} style={overlayStyles.applyRow}>
                <UserAvatar
                  user={{
                    displayName: a.displayName,
                    avatar: a.avatar,
                    equippedFrame: a.equippedFrame ?? null,
                  }}
                  size={40}
                />
                <View style={overlayStyles.applyRowInfo}>
                  <Text style={overlayStyles.applyName} numberOfLines={1}>
                    {a.displayName}
                  </Text>
                  <ApplicantBadges applicant={a} />
                </View>
                {isHostOrAdmin && (
                  <TouchableOpacity
                    style={overlayStyles.applyAcceptBtn}
                    onPress={() => onApprove(a.userId)}
                  >
                    <Text style={overlayStyles.applyAcceptText}>Accept</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </ScrollView>
        )}

        {!isHostOrAdmin &&
          !isSeated &&
          (iAmApplying ? (
            <TouchableOpacity
              style={overlayStyles.applyCancelBtn}
              onPress={onCancel}
            >
              <Text style={overlayStyles.applyCancelText}>
                Click to cancel the application
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={overlayStyles.applyBtn} onPress={onApply}>
              <Text style={overlayStyles.applyBtnText}>Apply for seat</Text>
            </TouchableOpacity>
          ))}
      </View>
    </View>
  );
}

// ── Overlay Styles ──────────────────────────────────────────────────────────

const overlayStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  sheet: {
    backgroundColor: "#1E1A3C",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: SCREEN_HEIGHT * 0.75,
    paddingTop: Spacing.lg,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: Spacing.lg,
    gap: 24,
    paddingBottom: Spacing.sm,
  },
  tabBtn: { paddingBottom: 6 },
  tabText: { fontSize: 14, fontWeight: "500", color: "rgba(255,255,255,0.55)" },
  tabTextActive: { color: "#FFFFFF", fontWeight: "800" },
  tabUnderline: {
    position: "absolute",
    left: "30%",
    right: "30%",
    bottom: 0,
    height: 2,
    backgroundColor: "#FFFFFF",
    borderRadius: 1,
  },

  periodRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  periodPill: {
    flexDirection: "row",
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    borderRadius: Radius.full,
    padding: 3,
  },
  periodSeg: {
    paddingHorizontal: 16,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  periodSegActive: { backgroundColor: "rgba(255,255,255,0.15)" },
  periodText: {
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(255,255,255,0.6)",
  },
  periodTextActive: { color: "#FFFFFF", fontWeight: "700" },
  headerIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  headerCountText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },

  onlineCount: {
    fontSize: 12,
    color: "rgba(255,255,255,0.55)",
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },

  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(255,255,255,0.08)",
    marginLeft: Spacing.lg,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: Spacing.lg,
    paddingVertical: 10,
    gap: 12,
  },
  userAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  userAvatarImg: { width: 44, height: 44, borderRadius: 22 },
  userInfo: { flex: 1, gap: 4, justifyContent: "center" },
  userNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    flexShrink: 1,
  },
  userName: { flexShrink: 1, fontSize: 15, fontWeight: "800", color: "#FFFFFF" },
  levelPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    alignSelf: "flex-start",
    backgroundColor: "#5F22D9",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  levelPillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#FFFFFF",
    fontStyle: "italic",
  },

  scoreCell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minWidth: 92,
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.06)",
    height: 64,
  },
  coinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#F9A825",
    alignItems: "center",
    justifyContent: "center",
  },
  coinDotText: { fontSize: 12, fontWeight: "900", color: "#FFFFFF" },
  scoreValue: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },

  loadingWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxxl,
  },
  loadingText: { fontSize: 13, color: "rgba(255,255,255,0.55)" },
  profileSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  applySheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  applyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  applyTitle: { fontSize: 15, fontWeight: "700", color: "#0B0B14" },
  applyEmpty: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxxl,
    gap: Spacing.md,
  },
  applyEmptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#F2F2F5",
    alignItems: "center",
    justifyContent: "center",
  },
  applyEmptyText: { fontSize: 14, color: "#9090AA" },

  applyList: { flexGrow: 0 },
  applyListContent: { paddingBottom: Spacing.md },
  applyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  applyAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#F2F2F5",
  },
  applyAvatarFallback: { alignItems: "center", justifyContent: "center" },
  applyRowInfo: { flex: 1, gap: 4 },
  applyName: { fontSize: 15, fontWeight: "600", color: "#0B0B14" },
  applyBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  applyFlagWrap: {
    width: 20,
    height: 14,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: "#F2F2F5",
  },
  applyFlagIcon: { width: "100%", height: "100%" },
  applyGenderPill: {
    flexDirection: "row",
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  applyGenderText: { fontSize: 11, color: "#FFFFFF", fontWeight: "700" },
  applyAcceptBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    height: 34,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  applyAcceptText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },

  applyBtn: {
    backgroundColor: Colors.primary,
    height: 48,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
  },
  applyBtnText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
  applyCancelBtn: {
    backgroundColor: "#FF66A1",
    height: 48,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.md,
  },
  applyCancelText: { fontSize: 15, fontWeight: "700", color: "#FFFFFF" },
});

// ── Main Styles ─────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0D0620" },
  centered: {
    flex: 1,
    backgroundColor: "#0D0620",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.md,
  },
  errorText: {
    color: Colors.textSecondary,
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },
  retryBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
    marginTop: Spacing.sm,
  },
  retryBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  goBackLink: { marginTop: Spacing.xs },
  goBackText: { color: Colors.textSecondary, fontSize: 13 },

  // ── Top bar ───────────────────────────────────────────────────────────────
  topBar: {
    position: "absolute",
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 10,
  },
  topLeft: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  hostInfoCol: { flexDirection: "column", alignItems: "flex-start", gap: Spacing.xs },
  micTickerWrap: { marginLeft: Spacing.xs },
  hostInfoCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: Radius.full,
    paddingVertical: 4,
    paddingRight: Spacing.sm,
    paddingLeft: 4,
    gap: Spacing.xl,
    maxWidth: SCREEN_WIDTH * 0.65,
  },
  hostInfoMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    flexShrink: 1,
  },
  hostTextCol: { gap: 1, flexShrink: 1 },
  hostNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  liveModeBadge: {
    backgroundColor: Colors.live,
    borderRadius: Radius.xs,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveModeBadgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  hostDisplayName: {
    fontSize: 13,
    fontWeight: "700",
    color: "#FFFFFF",
    flexShrink: 1,
  },
  hostId: { fontSize: 10, color: "rgba(255,255,255,0.6)" },
  crownBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(232,160,32,0.25)",
    alignItems: "center",
    justifyContent: "center",
  },
  crownEmoji: { fontSize: 14 },
  joinBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  topActions: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  viewerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.full,
  },
  viewerText: { fontSize: 12, fontWeight: "600", color: "#FFFFFF" },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },

  // ── Host exit choice modal ────────────────────────────────────────────────
  endModalOverlay: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "flex-start",
    paddingHorizontal: Spacing.lg,
  },
  endModalCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingVertical: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
    columnGap: Spacing.xxxl + 100,
    backgroundColor: "#1F1F2A",
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: "#2A2A40",
  },
  endModalOption: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  endModalCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#3A3A4A",
    alignItems: "center",
    justifyContent: "center",
  },
  keepIconWrap: {
    width: 22,
    height: 22,
  },
  keepIconTL: {
    position: "absolute",
    top: 0,
    left: 0,
  },
  keepIconBR: {
    position: "absolute",
    bottom: 0,
    right: 0,
  },
  endModalLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
  },

  // ── Seat grid ─────────────────────────────────────────────────────────────
  seatGridContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 30,
    elevation: 30,
  },
  seatGridContainerLive: {
    alignItems: "center",
  },
  seatGridContainerFlat: {
    alignItems: "stretch",
  },
  topSeatRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: Spacing.xxl,
    marginBottom: Spacing.sm,
  },
  seatRow: { flexDirection: "row", justifyContent: "center" },
  seatRowFlat: {
    width: "100%",
    justifyContent: "space-between",
  },
  seatRowLive: { alignSelf: "flex-end" },
  seatItemWrap: { alignItems: "center", gap: 1 },
  seatCircle: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  seatInitial: { fontWeight: "700", color: "#FFFFFF" },
  seatLabel: {
    flexShrink: 1,
    fontSize: 10,
    fontWeight: "500",
    color: "#FFFFFF",
    textAlign: "center",
  },
  mutedOverlay: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.textPrimary,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    elevation: 1000,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  supporterBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  calcBadge: {
    backgroundColor: "#FF6B00",
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 2,
    alignSelf: "center",
  },
  calcBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },

  // ── Calculator timer pill ─────────────────────────────────────────────────
  timerPillWrap: {
    position: "absolute" as const,
    left: Spacing.md,
    zIndex: 20,
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  supportersBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    borderWidth: 1,
    borderColor: "rgba(255,215,0,0.4)",
  },
  timerPill: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 5,
  },
  timerPillText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700" as const,
  },

  // ── Spacer ────────────────────────────────────────────────────────────────
  spacer: { flex: 1 },

  // ── Announcement (FlatList header) ───────────────────────────────────────
  // Inset from `chatList`; small left nudge only (horizontal alignment tweak).
  announcementListHeader: {
    paddingBottom: 14,
    marginLeft: -Spacing.xs,
  },
  announcementCard: {
    alignSelf: "stretch",
    height: 83,
    padding: Spacing.sm + Spacing.xs,
    borderRadius: 20,
    backgroundColor: "rgba(73, 56, 88, 0.5)",
    justifyContent: "center",
    overflow: "hidden",
  },
  announcementCardText: {
    alignSelf: "stretch",
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 21,
    fontFamily: "Poppins",
    fontWeight: "400",
  },
  floatingInviteBtn: {
    position: "absolute",
    right: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#000000",
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    zIndex: 100,
    elevation: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  floatingInviteBtnText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  floatingInviteMicPng: { width: 18, height: 18 },

  // ── Chat messages ─────────────────────────────────────────────────────────
  chatArea: {
    width: 263,
    position: "absolute",
    left: 12,
    zIndex: 4,
    elevation: 4,
    overflow: "hidden",
  },
  chatListView: { flex: 1 },

  joinBannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 30,
  },
  joinBannerStack: {
    position: "absolute",
    left: 8,
    bottom: "22%",
    alignItems: "flex-start",
    gap: 6,
  },
  joinBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(123,79,255,0.85)",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    maxWidth: SCREEN_WIDTH * 0.55,
  },
  joinBannerAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  joinBannerText: { color: "#FFFFFF", fontSize: 12, flexShrink: 1 },
  joinBannerName: { fontWeight: "700" },

  joinToastOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 30,
  },
  joinToastWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  joinToast: {
    backgroundColor: "rgba(0,0,0,0.8)",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
  },
  joinToastText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  giftToastOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 30,
  },
  giftToastAnchor: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: "25%",
    height: 200,
    zIndex: 9999,
    elevation: 30,
  },
  comboWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 9998,
    elevation: 28,
  },
  comboBtn: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: "rgba(15,15,30,0.85)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  comboGiftIcon: {
    width: 40,
    height: 40,
  },
  comboLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
    gap: 4,
  },
  comboText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.gold,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  comboBadge: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.full,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  comboBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#000000",
  },
  chatList: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    gap: 4,
  },
  chatBubble: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.sm,
    paddingVertical: 2,
  },
  chatBubbleCosmeticWrap: {
    paddingVertical: 2,
  },
  chatBubbleCosmeticMessage: {
    fontSize: 13,
    color: "#FFFFFF",
    lineHeight: 18,
  },
  chatBubbleBody: {
    borderRadius: Radius.md,
    overflow: "hidden",
    minHeight: 28,
  },
  chatBubbleBodyInner: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  chatAvatar: { width: 28, height: 28, borderRadius: 14 },
  chatAvatarFallback: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  chatAvatarInitial: { fontSize: 11, fontWeight: "700", color: "#FFFFFF" },
  chatSender: { fontSize: 12, fontWeight: "600" },
  chatSenderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chatContentRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 4,
  },
  chatContent: {
    flex: 1,
    fontSize: 13,
    color: "#FFFFFF",
    lineHeight: 18,
    flexShrink: 1,
  },
  seatNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    flexShrink: 1,
  },
  chatImageWrap: {
    marginTop: 4,
    width: 160,
    height: 160,
    borderRadius: Radius.md,
    overflow: "hidden",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  chatImage: { width: "100%", height: "100%" },
  chatImageCaption: {
    marginTop: 4,
    color: "#FFFFFF",
    fontSize: 13,
  },
  chatEmpty: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 13,
    textAlign: "center",
    marginTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  systemRow: {
    flexDirection: "row",
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
    alignItems: "flex-start",
  },
  systemAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.gold,
    alignItems: "center",
    justifyContent: "center",
  },
  systemBody: { flex: 1, gap: 2 },
  systemName: { fontSize: 11, fontWeight: "600", color: Colors.gold },
  systemBubble: {
    alignSelf: "flex-start",
    backgroundColor: Colors.goldSubtle,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.gold,
    maxWidth: "90%",
  },
  systemBubbleText: { fontSize: 13, color: Colors.gold, fontWeight: "500" },

  // ── Emoji panel ───────────────────────────────────────────────────────────
  emojiPanel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: "50%",
    maxHeight: "60%",
    backgroundColor: "#1A1A22",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    zIndex: 100,
    elevation: 100,
  },
  emojiScroll: {
    flex: 1,
  },
  emojiComingSoon: {
    paddingVertical: Spacing.xxl,
    alignItems: "center",
    justifyContent: "center",
  },
  emojiComingSoonText: {
    fontSize: 13,
    fontWeight: "500",
    color: "rgba(255,255,255,0.55)",
    letterSpacing: 0.3,
  },
  emojiTabs: {
    flexDirection: "row",
    gap: Spacing.xl,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.xs,
  },
  emojiTab: {
    paddingVertical: 8,
    alignItems: "center",
  },
  emojiTabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "rgba(255,255,255,0.55)",
  },
  emojiTabTextActive: { color: "#FFFFFF" },
  emojiTabUnderline: {
    position: "absolute",
    bottom: 0,
    left: "15%",
    right: "15%",
    height: 2,
    borderRadius: 1,
    backgroundColor: "#FF5A3C",
  },
  svgaEmojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: Spacing.md,
  },
  svgaEmojiBtn: {
    width: "25%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xs,
  },
  svgaEmojiThumb: { width: 40, height: 40 },
  svgaEmojiLabel: {
    marginTop: 4,
    fontSize: 11,
    fontWeight: "500",
    color: "rgba(255,255,255,0.85)",
    textAlign: "center",
    maxWidth: 72,
  },

  // ── Chat composer (keyboard open — white bar on top of keyboard) ───────────
  chatComposerBar: {
    backgroundColor: Colors.background,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E5E5",
  },
  chatComposerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  chatComposerInputWrap: {
    flex: 1,
    minHeight: 44,
    borderRadius: Radius.full,
    backgroundColor: "#F2F2F7",
    paddingHorizontal: Spacing.lg,
    justifyContent: "center",
  },
  chatComposerInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    paddingVertical: Platform.OS === "ios" ? 10 : 8,
  },
  chatComposerInputLocked: {
    color: Colors.textTertiary,
  },
  chatComposerSendBtn: {
    width: 48,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FF2D55",
    alignItems: "center",
    justifyContent: "center",
  },
  chatComposerSendBtnDisabled: {
    opacity: 0.45,
  },

  // ── Bottom bar ────────────────────────────────────────────────────────────
  bottomBarDock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingTop: Spacing.sm,
    gap: TOOLBAR_GAP,
  },
  bottomCircleBtn: {
    width: TOOLBAR_BTN_SIZE,
    height: TOOLBAR_BTN_SIZE,
    borderRadius: TOOLBAR_BTN_SIZE / 2,
    backgroundColor: "rgba(15,15,30,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  toolbarIcon: { width: 22, height: 22 },
  bottomCircleBtnOff: {
    backgroundColor: "rgba(15,15,30,0.85)",
    borderColor: "rgba(255,255,255,0.15)",
  },
  bottomMicIconWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  bottomMicPng: {
    width: 22,
    height: 22,
  },
  bottomMicSlash: {
    position: "absolute",
    width: 28,
    height: 3,
    borderRadius: 1,
    backgroundColor: Colors.textInverse,
    transform: [{ rotate: "-45deg" }],
  },
  applicantBadge: {
    position: "absolute",
    top: -4,
    right: -4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 3,
  },
  applicantBadgeText: { fontSize: 10, fontWeight: "700", color: "#FFFFFF" },
  chatInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.35)",
    borderRadius: Radius.full,
    height: 38,
    paddingLeft: Spacing.md,
    paddingRight: 4,
  },
  chatInput: {
    flex: 1,
    backgroundColor: "transparent",
    color: "#FFFFFF",
    fontSize: 13,
    height: 38,
    paddingVertical: 0,
  },
  chatInputLocked: { color: "rgba(255,255,255,0.35)" },
  emojiInlineBtn: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 2,
  },
  sendBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  pkBtn: {
    width: TOOLBAR_BTN_SIZE,
    height: TOOLBAR_BTN_SIZE,
    borderRadius: TOOLBAR_BTN_SIZE / 2,
    backgroundColor: "rgba(15,15,30,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  giftBtn: {
    width: TOOLBAR_BTN_SIZE,
    height: TOOLBAR_BTN_SIZE,
    borderRadius: TOOLBAR_BTN_SIZE / 2,
    backgroundColor: "rgba(15,15,30,0.85)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },

  // Edit Room Info modal
  editInfoOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  editInfoPanel: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: Spacing.lg,
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxxl,
    alignItems: "center",
  },
  editInfoTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#000000",
    marginBottom: Spacing.lg,
  },
  editInfoAvatarWrap: {
    width: 88,
    height: 88,
    marginTop: Spacing.xs,
  },
  editInfoAvatar: {
    width: 88,
    height: 88,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  editInfoAvatarFallback: {
    backgroundColor: "#F2F0F7",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    borderStyle: "dashed",
  },
  editInfoCameraBadge: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#7B4FFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  editInfoCoverLabel: {
    fontSize: 12,
    color: "rgba(0,0,0,0.5)",
    marginTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  editInfoFieldLabel: {
    alignSelf: "flex-start",
    fontSize: 13,
    fontWeight: "600",
    color: "rgba(0,0,0,0.7)",
    marginBottom: Spacing.xs,
  },
  editInfoInput: {
    width: "100%",
    backgroundColor: "#F5F4F9",
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    fontSize: 15,
    color: "#000000",
    marginBottom: Spacing.lg,
  },
  editInfoTextarea: {
    minHeight: 96,
  },
  editInfoSubmitBtn: {
    width: "100%",
    borderRadius: Radius.full,
    overflow: "hidden",
    marginTop: Spacing.sm,
  },
  editInfoSubmitGradient: {
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  editInfoSubmitText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});

// ── Seat Actions Menu (host / room admin → empty seat) ─────────────────────

function SeatActionsMenu({
  seat,
  anchorX,
  anchorY,
  onClose,
  onInvite,
  onToggleLock,
  onToggleMute,
  onTake,
}: {
  seat: Seat;
  anchorX: number;
  anchorY: number;
  onClose: () => void;
  onInvite: () => void;
  onToggleLock: () => void;
  onToggleMute: () => void;
  onTake: () => void;
}) {
  const MENU_W = 280;
  const MENU_H = 80;
  const { width: winW, height: winH } =
    require("react-native").Dimensions.get("window");
  const left = Math.min(Math.max(anchorX - MENU_W / 2, 8), winW - MENU_W - 8);
  const top = Math.min(Math.max(anchorY - MENU_H - 12, 8), winH - MENU_H - 8);
  const items = [
    {
      key: "invite",
      Icon: SofaIcon,
      label: "Invite to mic",
      onPress: onInvite,
    },
    {
      key: "lock",
      Icon: LockIcon,
      label: seat.isLocked ? "Unlock" : "Lock",
      onPress: onToggleLock,
    },
    {
      key: "off",
      Icon: seat.isMuted ? MicOnIcon : MicOffIcon,
      label: seat.isMuted ? "Unmute" : "Mute",
      onPress: onToggleMute,
    },
    { key: "take", Icon: MicOnIcon, label: "Take mic", onPress: onTake },
  ] as const;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <TouchableOpacity
        style={seatMenuStyles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={[seatMenuStyles.menu, { position: "absolute", left, top }]}
        >
          {items.map((it) => (
            <TouchableOpacity
              key={it.key}
              style={seatMenuStyles.item}
              onPress={it.onPress}
            >
              <View style={seatMenuStyles.iconWrap}>
                <it.Icon width={28} height={28} />
              </View>
              <Text style={seatMenuStyles.label}>{it.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const seatMenuStyles = StyleSheet.create({
  backdrop: { flex: 1 },
  menu: {
    flexDirection: "row",
    backgroundColor: "#1A1530",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.sm,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  item: {
    alignItems: "center",
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    width: 64,
  },
  iconWrap: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  label: { fontSize: 11, color: "#FFFFFF", fontWeight: "500" },
});

// ── Kick-out Reason Modal ───────────────────────────────────────────────────

const KICK_REASONS = [
  "Abusing on mic/text",
  "Nude picture send in room",
  "Religious / Political comment",
  "Promote other application",
  "Illegal profile photo / name",
  "Argument",
];

function KickReasonModal({
  target,
  onClose,
  onConfirm,
}: {
  target: {
    id: string;
    displayName: string;
    avatar: string | null;
    hakaId?: string | null;
    equippedFrame?: import("@/types").EquippedCosmetic | null;
    activeSpecialId?: string | null;
    activeSpecialIdLevel?: string | null;
  };
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState<string | null>(null);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <TouchableOpacity
        style={kickStyles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={kickStyles.sheet}
          onPress={() => {}}
        >
          <Text style={kickStyles.title}>Kick out</Text>

          <View style={kickStyles.targetRow}>
            <Text style={kickStyles.targetLabel}>Sure to kick out </Text>
            <UserAvatar
              user={{
                displayName: target.displayName ?? "User",
                avatar: target.avatar ?? null,
                equippedFrame: target.equippedFrame ?? null,
              }}
              size={22}
            />
            <Text style={kickStyles.targetName} numberOfLines={1}>
              {target.displayName ?? "User"}
            </Text>
            {target.hakaId ? (
              <CopyableId
                value={target.activeSpecialId ?? target.hakaId}
                textStyle={kickStyles.targetId}
              />
            ) : null}
          </View>

          <Text style={kickStyles.sectionLabel}>Reason</Text>

          <View style={kickStyles.reasonList}>
            {KICK_REASONS.map((r) => {
              const active = reason === r;
              return (
                <TouchableOpacity
                  key={r}
                  style={kickStyles.reasonRow}
                  onPress={() => setReason(r)}
                >
                  <View
                    style={[kickStyles.radio, active && kickStyles.radioActive]}
                  >
                    {active && <View style={kickStyles.radioDot} />}
                  </View>
                  <Text style={kickStyles.reasonText}>{r}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[kickStyles.confirmBtn, !reason && { opacity: 0.5 }]}
            disabled={!reason}
            onPress={() => {
              if (!reason) return;
              onConfirm(reason);
            }}
          >
            <Text style={kickStyles.confirmText}>Kick out</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const kickStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#1E1A3C",
    borderRadius: 20,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xl,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#FFFFFF",
    textAlign: "center",
    marginBottom: Spacing.lg,
  },
  targetRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: Spacing.xl,
  },
  targetLabel: { fontSize: 14, color: "#FFFFFF" },
  targetAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginHorizontal: 6,
  },
  targetName: { fontSize: 14, fontWeight: "600", color: "#FF4D6D" },
  targetId: { fontSize: 14, color: "#FF4D6D", marginLeft: 4 },
  sectionLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: Spacing.md,
  },
  reasonList: { gap: 4, marginBottom: Spacing.xl },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.6)",
    marginRight: Spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  radioActive: { borderColor: "#9D7FFF" },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#9D7FFF",
  },
  reasonText: { fontSize: 14, color: "#FFFFFF", flex: 1 },
  confirmBtn: {
    backgroundColor: "#7B4FFF",
    borderRadius: Radius.full,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: Spacing.sm,
  },
  confirmText: { fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
});

const JoinBanner = React.memo(function JoinBanner({
  name,
  avatar,
  equippedFrame,
}: {
  name: string;
  avatar: string | null;
  equippedFrame: import("@/types").EquippedCosmetic | null;
}) {
  const tx = useRef(new Animated.Value(-320)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(tx, { toValue: 0, duration: 320, useNativeDriver: true }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
    ]).start();
    const out = setTimeout(() => {
      Animated.parallel([
        Animated.timing(tx, {
          toValue: -320,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
    }, 3000);
    return () => clearTimeout(out);
  }, [tx, opacity]);
  return (
    <Animated.View
      style={[styles.joinBanner, { transform: [{ translateX: tx }], opacity }]}
    >
      <UserAvatar
        user={{ displayName: name, avatar, equippedFrame }}
        size={22}
      />
      <Text style={styles.joinBannerText} numberOfLines={1}>
        <Text style={styles.joinBannerName}>{name}</Text> entered the room
      </Text>
    </Animated.View>
  );
});
