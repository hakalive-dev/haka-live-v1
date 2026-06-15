import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Linking,
  Modal,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type ViewToken,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';

import { Colors, Radius, Spacing } from '@/theme';
import { MomentGridSkeleton, Skeleton } from '@components/Skeleton';
import { UserAvatar } from '@components/UserAvatar';
import { CopyIcon } from '@components/CopyIcon';
import { computeAgeFromBirthday } from '@/utils/age';
import { formatMomentPostTime } from '@/utils/formatMomentTime';
import { getGenderPillBackground, getGenderSymbol } from '@/utils/genderDisplay';
import type { RootStackParamList } from '@navigation/types';
import { useInfiniteQuery, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useSelector } from 'react-redux';

import { momentsApi } from '@api/moments';
import { queryKeys } from '@api/queryKeys';
import { giftsApi } from '@api/gifts';
import { chatApi } from '@api/chat';
import { usersApi } from '@api/users';
import { invalidateUserLevels } from '@hooks/queries/useLevelQueries';
import { onOutboundDmSent } from '@hooks/useDMConnection';
import { MomentVideoCard, type MomentVideoPost } from '@screens/main/MomentVideoCard';
import { VideoFeedPlayer } from '@screens/main/VideoFeedPlayer';
import { ErrorBoundary } from '@components/ErrorBoundary';
import { useToast } from '@components/Toast';
import { logDiagnostic } from '@/diagnostics/releaseDiagnostics';
import { isPlayableVideoUrl } from '@/utils/videoUrl';
import type { RootState } from '../../store';
import type {
  MomentPost as ApiMomentPost,
  MomentComment as ApiComment,
  Gift,
  PublicUser,
} from '@/types';

const MOMENT_CAMERA_ICON = require('../../../assets/discover/moment_camera_icon.png');
const MOMENT_CAMERA_BTN_SIZE = 60;

const GIFT_CATALOG_IMAGES: Record<string, ReturnType<typeof require>> = {
  'gifts/86.png': require('../../../assets/gifts/86.png'),
  'gifts/93.png': require('../../../assets/gifts/93.png'),
  'gifts/116.png': require('../../../assets/gifts/116.png'),
  'gifts/121.png': require('../../../assets/gifts/121.png'),
};

function isGiftHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

// ── Figma proportions (all relative to the 180px reference card width) ────────
//   card height : card width  = 210 / 180
//   overflow    : card width  =  30 / 180
//   image size  : card width  = 120 / 180
//   image gap   : card width  =  40 / 180
// These ratios are applied at runtime to whatever cardW is computed to be.

const GRID_H_PAD   = 20;          // horizontal padding of the grid (Figma: left 20px)
const GRID_GAP     = 20;          // gap between cards in a row (Figma: gap 20px)
const ROW_SEP      = 19;          // gap between rows (Figma: gap 19px)
const CARD_H_RATIO = 210 / 180;   // card height proportional to width
const OVERFLOW_R   = 30  / 180;   // overflow proportional to card width
const IMG_R        = 120 / 180;   // image size proportional to card width
const IMG_GAP_R    = 40  / 180;   // image-to-text gap proportional to card width

/** Pick column count based on screen width */
function numColumns(screenW: number): number {
  if (screenW >= 1024) return 4;
  if (screenW >= 600)  return 3;
  return 2;
}

/** All derived card dimensions, recomputed whenever screen width changes */
function useCardDims(screenW: number) {
  return useMemo(() => {
    const cols   = numColumns(screenW);
    const cardW  = (screenW - GRID_H_PAD * 2 - GRID_GAP * (cols - 1)) / cols;
    const cardH  = Math.round(cardW * CARD_H_RATIO);
    const over   = Math.round(cardW * OVERFLOW_R);
    const imgW   = Math.round(cardW * IMG_R);
    const imgLeft= Math.round((cardW - imgW) / 2);
    const imgGap = Math.round(cardW * IMG_GAP_R);
    return { cols, cardW, cardH, over, imgW, imgLeft, imgGap };
  }, [screenW]);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type DiscoverTab = 'game' | 'moment' | 'video';

type Game = {
  id: string;
  name: string;
  gradient: [string, string];
  image: ReturnType<typeof require>;
};

type MomentPost = {
  id: string;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatar: string | null;
    country: string;
    gender: string;
    age: number | null;
  };
  coverImage: string | null;
  cover_color: string;
  hashtag: string;
  caption: string;
  likes: number;
  comments: number;
  shares: number;
  gifts: number;
  live_viewers: number;   // shown in the pink badge on avatar
  default_liked: boolean; // initial liked state
  createdAt: string;
};

// ── Static data ───────────────────────────────────────────────────────────────

const GAMES: Game[] = [
  { id: '1', name: 'Russian Roulette', gradient: ['#F8BF5B', '#FFD193'], image: require('../../../assets/games/russian_roulette.png') },
  { id: '2', name: 'Lucky Wheel',      gradient: ['#5BEDF8', '#1AB7BD'], image: require('../../../assets/games/lucky_wheel.png')      },
  { id: '3', name: 'Tiger Vs Lion',    gradient: ['#F4A2F2', '#E18BDB'], image: require('../../../assets/games/tiger_vs_lion.png')    },
  { id: '4', name: 'Bounty Racer',     gradient: ['#92D5E3', '#64C2E4'], image: require('../../../assets/games/bounty_racer.png')     },
  { id: '5', name: 'Royal Battle',     gradient: ['#C0F254', '#60AE00'], image: require('../../../assets/games/royal_battle.png')     },
  { id: '6', name: 'Ludo',             gradient: ['#71E9B9', '#00B353'], image: require('../../../assets/games/ludo.png')             },
  { id: '7', name: 'Fishing Star',     gradient: ['#6DCAEC', '#0F6C8E'], image: require('../../../assets/games/fishing_star.png')     },
  { id: '8', name: 'Win Go',           gradient: ['#F8D05B', '#E8A020'], image: require('../../../assets/games/win_go.png')           },
];


const SEARCH_HISTORY  = ['#NovaVibes', '#StarLife', '#DJRhythm', '#HakaLive', '#LuckyWheel'];
const RECOMMENDED     = ['#Trending', '#NewHosts', '#LuckyWheel', '#GiftRain', '#BattleRoyale', '#LiveMusic', '#Gaming', '#Moments'];
const SOCIAL_PLATFORMS: { id: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }[] = [
  { id: 'copy',      label: 'Copy',      icon: 'copy-outline',           color: '#666666'  },
  { id: 'whatsapp',  label: 'WhatsApp',  icon: 'logo-whatsapp',          color: '#25D366'  },
  { id: 'facebook',  label: 'Facebook',  icon: 'logo-facebook',          color: '#1877F2'  },
  { id: 'twitter',   label: 'X',         icon: 'logo-twitter',           color: '#000000'  },
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram',         color: '#E1306C'  },
  { id: 'messenger', label: 'Messenger', icon: 'chatbubble-ellipses',    color: '#0099FF'  },
  { id: 'more',      label: 'More apps', icon: 'share-outline',          color: '#7B4FFF'  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function MomentCameraButton({
  size = MOMENT_CAMERA_BTN_SIZE,
  onPress,
  style,
}: {
  size?: number;
  onPress?: () => void;
  style?: object;
}) {
  const iconSize = Math.round(size * 0.4);
  const circle = (
    <View
      style={[
        styles.momentCameraCircle,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Image
        source={MOMENT_CAMERA_ICON}
        style={{ width: iconSize, height: iconSize }}
        contentFit="contain"
      />
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={style} onPress={onPress} activeOpacity={0.85}>
        {circle}
      </TouchableOpacity>
    );
  }

  return <View style={style}>{circle}</View>;
}

function resolveAuthorAge(user: ApiMomentPost['user']): number | null {
  const fromBirthday = computeAgeFromBirthday(user.date_of_birth);
  if (fromBirthday != null) return fromBirthday;
  if (typeof user.age === 'number' && user.age > 0) return user.age;
  return null;
}

function apiToMoment(p: ApiMomentPost): MomentPost {
  return {
    id: p.id,
    user: {
      id: p.user.id,
      username: p.user.username,
      displayName: p.user.displayName,
      avatar: p.user.avatar,
      country: p.user.country ?? '',
      gender: p.user.gender ?? '',
      age: resolveAuthorAge(p.user),
    },
    coverImage: p.media_url,
    cover_color: '#E0E0E0',
    hashtag: p.hashtag,
    caption: p.caption,
    likes: p.likes_count,
    comments: p.comments_count,
    shares: p.shares_count,
    gifts: p.gifts_count,
    live_viewers: 0,
    default_liked: p.is_liked,
    createdAt: p.created_at,
  };
}

function apiToVideo(p: ApiMomentPost): MomentVideoPost {
  const mediaUrl = p.media_url ?? '';
  return {
    id: p.id,
    user: {
      id: p.user.id,
      displayName: p.user.displayName,
      avatar: p.user.avatar,
      country_flag: p.user.country ?? '',
      gender: p.user.gender ?? '',
      level: p.user.rich_level,
    },
    video_url: mediaUrl,
    poster_url: p.poster_url ?? (isPlayableVideoUrl(mediaUrl) ? null : mediaUrl || null),
    description: p.caption,
    likes: p.likes_count,
    comments: p.comments_count,
    shares: p.shares_count,
    gifts: p.gifts_count,
    default_liked: p.is_liked,
  };
}

function getMomentShareLink(postId: string) {
  return `https://haka.live/moment/${postId}`;
}

type DiscoverCountField = 'comments' | 'shares' | 'gifts';

function bumpDiscoverPostCount(
  queryClient: QueryClient,
  postId: string,
  field: DiscoverCountField,
) {
  queryClient.setQueryData<MomentPost[]>(queryKeys.discover.moments(), (prev) =>
    prev?.map((p) => (p.id === postId ? { ...p, [field]: p[field] + 1 } : p)),
  );
  queryClient.setQueryData<MomentVideoPost[]>(queryKeys.discover.videos(), (prev) =>
    prev?.map((p) => (p.id === postId ? { ...p, [field]: p[field] + 1 } : p)),
  );
}

// ── Game card ─────────────────────────────────────────────────────────────────
//
// Structure (mirrors Figma exactly):
//   [group container: CARD_W × (CARD_H + OVERFLOW)]
//     [gradient rect]: absolute, left:0, top:OVERFLOW, CARD_W × CARD_H, borderRadius:20
//     [content col]:   absolute, left:IMG_LEFT, top:0, IMG_W wide
//       [image]:       IMG_W × IMG_W, borderRadius:15
//       [40px gap]
//       [name + pill]: IMG_W wide, gap:4

type CardDims = ReturnType<typeof useCardDims>;

const GameCard = React.memo(function GameCard({ game, dims }: { game: Game; dims: CardDims }) {
  const { cardW, cardH, over, imgW, imgLeft, imgGap } = dims;
  // padding inside the gradient that pushes name/pill below the overlapping image
  const textPaddingTop = imgW - over + imgGap;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={{ width: cardW, height: cardH + over }}
    >
      {/* ── 1. Gradient card (contains name + pill — no z-order issue) ── */}
      <LinearGradient
        colors={game.gradient}
        style={{
          position: 'absolute',
          left: 0,
          top: over,
          width: cardW,
          height: cardH,
          borderRadius: 20,
          alignItems: 'center',
          paddingTop: textPaddingTop,
          paddingBottom: 16,
        }}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        <Text style={[styles.gameName, { width: imgW }]} numberOfLines={2}>
          {game.name}
        </Text>
        <View style={{ height: 4 }} />
        <View style={[styles.gameplayPill, { width: imgW }]}>
          <Text style={styles.gameplayText}>Gameplay</Text>
        </View>
      </LinearGradient>

      {/* ── 2. Game image — rendered AFTER gradient → paints on top ── */}
      <Image
        source={game.image}
        style={{
          position: 'absolute',
          top: 0,
          left: imgLeft,
          width: imgW,
          height: imgW,
          borderRadius: 15,
          backgroundColor: '#D9D9D9',
        }}
        contentFit="cover"
      />
    </TouchableOpacity>
  );
});

// ── Post card (Moment & Video) ────────────────────────────────────────────────
//
// Figma layout (all measurements from card origin):
//   Card:          width:380(scaled), height:500, TL:50 TR:0 BR:15 BL:0 radius
//   Avatar:        80×80 circle, left:10, top:18
//   Follow btn:    20×20 circle, purple #5F22D9, absolute bottom-right of avatar
//   Name row:      left:109, top:38  — display_name 16px/600/black + flag
//   Live badge:    left:109, top:68  — pink #F9467D pill, heart•count 10px/600/white
//   Cover image:   full width, height:300, top:113
//   Camera btn:    video only, 60×60 circle bottom-right of cover rgba(223,223,223,0.5)
//   Hashtag:       left:10, top:426 (#5F22D9, 14px/600)
//   Action row:    left:10, top:461, gap:20 between items (24px icons, 14px/600/black counts)
//   Timestamp:     right-aligned, top:466 (14px/600/black)

const POST_AVATAR_SIZE = 56;

const PostCard = React.memo(function PostCard({
  post,
  isVideo,
  onComment,
  onShare,
  onGift,
  onProfilePress,
}: {
  post: MomentPost;
  isVideo: boolean;
  onComment: () => void;
  onShare: () => void;
  onGift: () => void;
  onProfilePress: () => void;
}) {
  const [liked,     setLiked]     = useState(post.default_liked);
  const [likeCount, setLikeCount] = useState(post.likes);

  const handleLike = useCallback(async () => {
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((c) => (nextLiked ? c + 1 : c - 1));
    try {
      await momentsApi.toggleLike(post.id);
    } catch {
      // revert on failure
      setLiked(!nextLiked);
      setLikeCount((c) => (nextLiked ? c - 1 : c + 1));
    }
  }, [liked, post.id]);

  const genderSymbol = getGenderSymbol(post.user.gender);
  const countryCode = post.user.country?.trim().slice(0, 2).toLowerCase() ?? '';

  return (
    <View style={styles.postCard}>

      {/* ── Header: avatar + user info ── */}
      <View style={styles.postHeader}>
        <View style={styles.postAvatarWrap}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onProfilePress}
            accessibilityRole="button"
            accessibilityLabel={`View ${post.user.displayName}'s profile`}
          >
            <UserAvatar
              user={{
                displayName: post.user.displayName,
                avatar: post.user.avatar,
                equippedFrame: null,
              }}
              size={POST_AVATAR_SIZE}
              hideFrame
            />
          </TouchableOpacity>
          {/* Follow / + button — bottom-right of avatar */}
          <TouchableOpacity style={styles.postFollowBtn}>
            <Ionicons name="add" size={11} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.postUserCol}
          activeOpacity={0.8}
          onPress={onProfilePress}
          accessibilityRole="button"
          accessibilityLabel={`View ${post.user.displayName}'s profile`}
        >
          <View style={styles.postNameRow}>
            <Text style={styles.postDisplayName} numberOfLines={1}>{post.user.displayName}</Text>
            {countryCode.length === 2 ? (
              <View style={styles.postFlagWrap}>
                <Image
                  source={{ uri: `https://flagcdn.com/w80/${countryCode}.png` }}
                  style={styles.postFlagIcon}
                  contentFit="cover"
                />
              </View>
            ) : null}
          </View>
          {(genderSymbol || (post.user.age != null && post.user.age > 0)) ? (
            <View
              style={[
                styles.postGenderPill,
                { backgroundColor: getGenderPillBackground(post.user.gender) },
              ]}
            >
              {genderSymbol ? (
                <Text style={styles.postGenderText}>{genderSymbol}</Text>
              ) : null}
              {post.user.age != null && post.user.age > 0 ? (
                <Text style={styles.postGenderText}>
                  {genderSymbol ? ` ${post.user.age}` : String(post.user.age)}
                </Text>
              ) : null}
            </View>
          ) : null}
        </TouchableOpacity>
      </View>

      {/* ── Cover image / video (height 300px) ── */}
      <View style={[styles.postCover, { backgroundColor: post.cover_color }]}>
        {post.coverImage && (
          <Image
            source={{ uri: post.coverImage }}
            style={styles.postCoverImage}
            contentFit="cover"
          />
        )}
        {isVideo && (
          <View style={styles.playBtnCenter}>
            <Ionicons name="play-circle" size={52} color="rgba(255,255,255,0.9)" />
          </View>
        )}
        {/* Camera / record button — video tab only, bottom-right of cover */}
        {isVideo && <MomentCameraButton style={styles.postCameraBtn} />}
      </View>

      {/* ── Hashtag ── */}
      <Text style={styles.postHashtag}>{post.hashtag}</Text>

      {/* ── Action row ── */}
      <View style={styles.postActions}>
        {/* Like */}
        <TouchableOpacity style={styles.postAction} onPress={handleLike}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={24}
            color={liked ? '#FF2D55' : '#000000'}
          />
          <Text style={styles.postActionCount}>{fmtCount(likeCount)}</Text>
        </TouchableOpacity>
        {/* Comment */}
        <TouchableOpacity style={styles.postAction} onPress={onComment}>
          <Ionicons name="chatbubble-outline" size={24} color="#000000" />
          <Text style={styles.postActionCount}>{fmtCount(post.comments)}</Text>
        </TouchableOpacity>
        {/* Share */}
        <TouchableOpacity style={styles.postAction} onPress={onShare}>
          <Ionicons name="arrow-redo-outline" size={24} color="#000000" />
          <Text style={styles.postActionCount}>{fmtCount(post.shares)}</Text>
        </TouchableOpacity>
        {/* Gift */}
        <TouchableOpacity style={styles.postAction} onPress={onGift}>
          <Ionicons name="gift-outline" size={24} color="#000000" />
          <Text style={styles.postActionCount}>{fmtCount(post.gifts)}</Text>
        </TouchableOpacity>
        {/* Timestamp — pushed to right */}
        <View style={styles.postTimestampWrap}>
          <Text style={styles.postTimestamp} numberOfLines={1}>
            {formatMomentPostTime(post.createdAt)}
          </Text>
        </View>
      </View>

    </View>
  );
});

// ── Search modal ──────────────────────────────────────────────────────────────

function SearchModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={[styles.searchScreen, { paddingTop: insets.top }]}>
        {/* Bar */}
        <View style={styles.searchHeader}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search" size={18} color={Colors.textTertiary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search..."
              placeholderTextColor={Colors.textTertiary}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
          </View>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.searchCancel}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.searchBody} showsVerticalScrollIndicator={false}>
          <Text style={styles.sectionTitle}>Search history</Text>
          <View style={styles.tagWrap}>
            {SEARCH_HISTORY.map((t) => (
              <TouchableOpacity key={t} style={styles.tag}>
                <Text style={styles.tagText}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>Recommended topics</Text>
          <View style={styles.tagWrap}>
            {RECOMMENDED.map((t) => (
              <TouchableOpacity key={t} style={styles.tagPurple}>
                <Text style={styles.tagTextPurple}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Comments modal ────────────────────────────────────────────────────────────

function CommentsModal({
  visible,
  onClose,
  postId,
  onCommentAdded,
}: {
  visible: boolean;
  onClose: () => void;
  postId: string | null;
  onCommentAdded?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible || !postId) return;
    momentsApi.getComments(postId).then(setComments).catch(() => {});
  }, [visible, postId]);

  const handleSend = useCallback(async () => {
    if (!comment.trim() || !postId) return;
    setSending(true);
    try {
      const newComment = await momentsApi.postComment(postId, comment.trim());
      setComments((prev) => [newComment, ...prev]);
      setComment('');
      onCommentAdded?.();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to post comment');
    } finally {
      setSending(false);
    }
  }, [comment, postId, onCommentAdded]);

  const handleToggleCommentLike = useCallback(async (commentId: string) => {
    if (!postId) return;
    setComments((prev) =>
      prev.map((c) => {
        if (c.id !== commentId) return c;
        const nextLiked = !(c.is_liked ?? false);
        return {
          ...c,
          is_liked: nextLiked,
          likes_count: Math.max(0, c.likes_count + (nextLiked ? 1 : -1)),
        };
      }),
    );
    try {
      const result = await momentsApi.toggleCommentLike(postId, commentId);
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? { ...c, is_liked: result.liked, likes_count: result.likes_count }
            : c,
        ),
      );
    } catch {
      momentsApi.getComments(postId).then(setComments).catch(() => {});
    }
  }, [postId]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    const h = d.getHours();
    const m = d.getMinutes();
    return `${mm}-${dd}-${yyyy}  ${h}:${m}`;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <TouchableOpacity style={styles.modalDismiss} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Comment ({comments.length})</Text>
          </View>

          <FlatList
            data={comments}
            keyExtractor={(c) => c.id}
            style={styles.commentList}
            showsVerticalScrollIndicator={false}
            maxToRenderPerBatch={10}
            windowSize={5}
            ListEmptyComponent={
              <Text style={styles.emptyComments}>No comments yet. Be the first!</Text>
            }
            renderItem={({ item }) => (
              <View style={styles.commentRow}>
                <UserAvatar
                  user={{
                    displayName: item.user.displayName,
                    avatar: item.user.avatar,
                    equippedFrame: item.user.equippedFrame ?? null,
                  }}
                  size={36}
                />
                <View style={styles.commentBody}>
                  <Text style={styles.commentUser}>{item.user.displayName}</Text>
                  <Text style={styles.commentDate}>{formatDate(item.created_at)}</Text>
                  <Text style={styles.commentText}>{item.text}</Text>
                </View>
                <TouchableOpacity
                  style={styles.commentActionItem}
                  onPress={() => handleToggleCommentLike(item.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={item.is_liked ?? false ? 'heart' : 'heart-outline'}
                    size={16}
                    color={item.is_liked ?? false ? '#FF2D55' : '#999999'}
                  />
                  {item.likes_count > 0 ? (
                    <Text style={styles.commentActionCount}>{item.likes_count}</Text>
                  ) : null}
                </TouchableOpacity>
              </View>
            )}
          />

          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Say something..."
              placeholderTextColor="#AAAAAA"
              value={comment}
              onChangeText={setComment}
              onSubmitEditing={handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[styles.commentSendBtn, (!comment.trim() || sending) && styles.commentSendBtnDisabled]}
              onPress={handleSend}
              disabled={!comment.trim() || sending}
            >
              <Text style={styles.commentSendText}>{sending ? '…' : 'Send'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Share modal ───────────────────────────────────────────────────────────────

function ShareModal({
  visible,
  onClose,
  postId,
  onShared,
}: {
  visible: boolean;
  onClose: () => void;
  postId: string | null;
  onShared?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const queryClient = useQueryClient();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [friends, setFriends] = useState<PublicUser[]>([]);
  const [shareLabel, setShareLabel] = useState('');
  const [sharedUserIds, setSharedUserIds] = useState<Set<string>>(new Set());
  const [loadingFriends, setLoadingFriends] = useState(false);

  useEffect(() => {
    if (!visible || !postId) return;
    setSharedUserIds(new Set());
    setLoadingFriends(true);
    momentsApi.get(postId)
      .then((post) => {
        const link = getMomentShareLink(postId);
        const snippet = post.caption?.trim()
          ? `"${post.caption.trim()}" by ${post.user.displayName}`
          : `a post by ${post.user.displayName}`;
        setShareLabel(`${snippet} on Haka Live — ${link}`);
      })
      .catch(() => {
        setShareLabel(`Check this out on Haka Live: ${getMomentShareLink(postId)}`);
      });

    if (currentUser?.id) {
      usersApi.following(currentUser.id)
        .then((res) => setFriends(res.items))
        .catch(() => setFriends([]))
        .finally(() => setLoadingFriends(false));
    } else {
      setLoadingFriends(false);
    }
  }, [visible, postId, currentUser?.id]);

  const recordShare = useCallback(async (platform: string) => {
    if (!postId) return;
    try {
      await momentsApi.share(postId, platform);
      onShared?.();
    } catch { /* silent */ }
  }, [postId, onShared]);

  const handleShareToUser = useCallback(async (user: PublicUser) => {
    if (!postId || !shareLabel) return;
    try {
      const sent = await chatApi.sendDM(user.id, shareLabel);
      if (currentUser?.id) {
        onOutboundDmSent(queryClient, sent, currentUser.id);
      }
      await recordShare('dm');
      setSharedUserIds((prev) => new Set(prev).add(user.id));
      toast.show(`Shared with ${user.displayName}`, 'success');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to share');
    }
  }, [postId, shareLabel, recordShare, toast, currentUser?.id, queryClient]);

  const handleSocial = useCallback(async (platformId: string) => {
    if (!postId) return;
    const link = getMomentShareLink(postId);
    const message = shareLabel || `Check this out on Haka Live: ${link}`;

    if (platformId === 'copy') {
      await Clipboard.setStringAsync(link);
      await recordShare('copy');
      toast.show('Link copied!', 'success');
      onClose();
      return;
    }
    if (platformId === 'whatsapp') {
      Linking.openURL(`whatsapp://send?text=${encodeURIComponent(message)}`).catch(() =>
        toast.show('WhatsApp is not installed', 'error'),
      );
      await recordShare('whatsapp');
      onClose();
      return;
    }
    if (platformId === 'facebook') {
      Linking.openURL(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`);
      await recordShare('facebook');
      onClose();
      return;
    }
    if (platformId === 'twitter') {
      Linking.openURL(`https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`);
      await recordShare('twitter');
      onClose();
      return;
    }
    if (platformId === 'instagram' || platformId === 'messenger') {
      try {
        await Share.share({ message });
        await recordShare(platformId);
      } catch { /* user cancelled */ }
      onClose();
      return;
    }

    try {
      await Share.share({ message });
      await recordShare(platformId);
    } catch { /* user cancelled */ }
    onClose();
  }, [postId, shareLabel, recordShare, toast, onClose]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <TouchableOpacity style={styles.modalDismiss} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Share to</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.shareUserList}
            contentContainerStyle={styles.shareUserListContent}
          >
            {loadingFriends ? (
              <Text style={styles.shareLoadingText}>Loading friends…</Text>
            ) : friends.length === 0 ? (
              <Text style={styles.shareLoadingText}>Follow people to share via DM</Text>
            ) : (
              friends.map((u) => (
                <View key={u.id} style={styles.shareUserItem}>
                  <UserAvatar
                    user={{ displayName: u.displayName, avatar: u.avatar, equippedFrame: null }}
                    size={48}
                  />
                  <Text style={styles.shareUserName} numberOfLines={1}>{u.displayName}</Text>
                  <TouchableOpacity
                    style={[styles.shareBtn, sharedUserIds.has(u.id) && styles.shareBtnDone]}
                    onPress={() => handleShareToUser(u)}
                    disabled={sharedUserIds.has(u.id)}
                  >
                    <Text style={styles.shareBtnText}>
                      {sharedUserIds.has(u.id) ? 'Sent' : 'Share'}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.socialGrid}>
            {SOCIAL_PLATFORMS.map((p) => (
              <TouchableOpacity key={p.id} style={styles.socialItem} onPress={() => handleSocial(p.id)}>
                <View style={[styles.socialIcon, { backgroundColor: p.color + '22' }]}>
                  {p.id === 'copy' ? (
                    <CopyIcon size={24} color={p.color} />
                  ) : (
                    <Ionicons name={p.icon} size={24} color={p.color} />
                  )}
                </View>
                <Text style={styles.socialLabel}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Gift modal ────────────────────────────────────────────────────────────────

function GiftModal({
  visible,
  onClose,
  postId,
  authorUserId,
  onGiftSent,
}: {
  visible: boolean;
  onClose: () => void;
  postId: string | null;
  authorUserId?: string | null;
  onGiftSent?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    giftsApi.catalogue().then(setGifts).catch(() => {});
  }, [visible]);

  const isOwnPost = Boolean(
    currentUser?.id && authorUserId && currentUser.id === authorUserId,
  );

  const handleGift = useCallback(async (gift: Gift) => {
    if (!postId) return;
    if (isOwnPost) {
      Alert.alert('Not allowed', 'You cannot send a gift to your own post.');
      return;
    }
    setSending(true);
    try {
      const res = await momentsApi.sendGift(postId, gift.id);
      invalidateUserLevels(currentUser?.id, authorUserId);
      onGiftSent?.();
      Alert.alert('Gift sent!', `You sent "${res.gift_name}"`);
      onClose();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to send gift');
    } finally {
      setSending(false);
    }
  }, [postId, onClose, onGiftSent, currentUser?.id, authorUserId, isOwnPost]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalContainer}>
        <TouchableOpacity style={styles.modalDismiss} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.md }]}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Send a Gift</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={22} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {isOwnPost ? (
            <Text style={styles.giftOwnPostHint}>
              You cannot send a gift to your own post.
            </Text>
          ) : null}
          <FlatList
            data={gifts}
            keyExtractor={(g) => g.id}
            numColumns={4}
            contentContainerStyle={styles.giftGrid}
            maxToRenderPerBatch={10}
            windowSize={5}
            ListEmptyComponent={
              <Text style={styles.emptyComments}>Loading gifts…</Text>
            }
            renderItem={({ item }) => {
              const bundled = item.image ? GIFT_CATALOG_IMAGES[item.image] : null;
              const remote =
                !bundled && typeof item.image === 'string' && isGiftHttpUrl(item.image)
                  ? item.image
                  : null;
              return (
                <TouchableOpacity
                  style={styles.giftItem}
                  onPress={() => handleGift(item)}
                  disabled={sending}
                >
                  {bundled ? (
                    <Image source={bundled} style={styles.giftGridImg} contentFit="contain" />
                  ) : remote ? (
                    <Image source={{ uri: remote }} style={styles.giftGridImg} contentFit="contain" cachePolicy="disk" />
                  ) : (
                    <View style={styles.giftGridIconWrap}>
                      <Ionicons name="gift" size={24} color={Colors.textSecondary} />
                    </View>
                  )}
                  <Text style={styles.giftName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.giftCost}>🪙 {item.coinCost}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function DiscoverScreen() {
  const insets  = useSafeAreaInsets();
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const queryClient = useQueryClient();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const dims    = useCardDims(screenW);

  const [activeTab, setActiveTab] = useState<DiscoverTab>('game');
  const [showSearch,   setShowSearch]   = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showShare,    setShowShare]    = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [activePostId, setActivePostId] = useState<string | null>(null);
  const [giftAuthorId, setGiftAuthorId] = useState<string | null>(null);

  // Cached per feed type so switching Discover tabs paints the last result
  // instantly and refreshes in the background instead of re-blocking.
  const momentsQuery = useQuery({
    queryKey: queryKeys.discover.moments(),
    queryFn: () => momentsApi.list('moment').then((feed) => feed.results.map(apiToMoment)),
    enabled: activeTab === 'moment',
    staleTime: 60_000,
  });
  const videosQuery = useInfiniteQuery({
    queryKey: queryKeys.discover.videos(),
    queryFn: ({ pageParam }) =>
      momentsApi.list('video', pageParam).then((feed) => ({
        items: feed.results.map(apiToVideo),
        page: feed.page,
        count: feed.count,
        page_size: feed.page_size,
      })),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const totalPages = Math.ceil(last.count / last.page_size);
      return last.page < totalPages ? last.page + 1 : undefined;
    },
    enabled: activeTab === 'video',
    staleTime: 60_000,
  });
  const moments: MomentPost[] = momentsQuery.data ?? [];
  const videos: MomentVideoPost[] = useMemo(
    () => videosQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [videosQuery.data],
  );
  const momentLoading = moments.length === 0 && momentsQuery.isLoading;
  const videoLoading = videos.length === 0 && videosQuery.isLoading;
  const videoError = videosQuery.isError;
  const [activeVideoIndex, setActiveVideoIndex] = useState(0);
  const [videoMuted, setVideoMuted] = useState(true);
  const [videoPaused, setVideoPaused] = useState(false);
  const [followedUserIds, setFollowedUserIds] = useState<Set<string>>(() => new Set());
  const [screenFocused, setScreenFocused] = useState(true);
  const currentUserId = useSelector((s: RootState) => s.auth.user?.id ?? '');

  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true);
      return () => setScreenFocused(false);
    }, []),
  );

  useEffect(() => {
    if (activeTab === 'video') {
      setActiveVideoIndex(0);
      setVideoPaused(false);
      logDiagnostic('native_note', 'video_tab_opened', { count: videos.length });
    }
  }, [activeTab, videos.length]);

  useEffect(() => {
    setVideoPaused(false);
  }, [activeVideoIndex]);

  const activeVideo = videos[activeVideoIndex] ?? null;
  const videoPlaybackActive =
    activeTab === 'video' &&
    screenFocused &&
    !showComments &&
    !showShare &&
    !showGift &&
    !!activeVideo &&
    isPlayableVideoUrl(activeVideo.video_url);

  const loadMoreVideos = useCallback(() => {
    if (videosQuery.hasNextPage && !videosQuery.isFetchingNextPage) {
      void videosQuery.fetchNextPage();
    }
  }, [videosQuery]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 75 }).current;
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const first = viewableItems.find((v) => v.isViewable && v.index != null);
      if (first?.index != null) setActiveVideoIndex(first.index);
    },
  ).current;

  const openComment = useCallback((postId: string) => {
    setActivePostId(postId);
    setShowComments(true);
  }, []);

  const openShare = useCallback((postId: string) => {
    setActivePostId(postId);
    setShowShare(true);
  }, []);

  const openGift = useCallback((postId: string) => {
    const momentPost = moments.find((m) => m.id === postId);
    const videoPost = videos.find((v) => v.id === postId);
    setActivePostId(postId);
    setGiftAuthorId(momentPost?.user.id ?? videoPost?.user.id ?? null);
    setShowGift(true);
  }, [moments, videos]);

  const bumpActivePostCount = useCallback(
    (field: DiscoverCountField) => {
      if (!activePostId) return;
      bumpDiscoverPostCount(queryClient, activePostId, field);
    },
    [activePostId, queryClient],
  );

  // Full-screen TikTok-style paging (header floats over video)
  const videoCardH = screenH;

  const videoGetItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: videoCardH,
      offset: videoCardH * index,
      index,
    }),
    [videoCardH],
  );

  const handleVideoFollow = useCallback(
    async (userId: string) => {
      if (!userId || userId === currentUserId) return;
      try {
        await usersApi.follow(userId);
        setFollowedUserIds((prev) => new Set(prev).add(userId));
      } catch {
        Alert.alert('Follow', 'Could not follow this user.');
      }
    },
    [currentUserId],
  );

  const handleVideoDoubleTapLike = useCallback(
    async (postId: string) => {
      try {
        await momentsApi.toggleLike(postId);
      } catch {
        /* MomentVideoCard rolls back optimistic UI on failure */
      }
    },
    [],
  );

  // Column wrapper style depends on runtime screen width
  const gameRowStyle = useMemo(
    () => ({ justifyContent: 'space-between' as const, paddingHorizontal: GRID_H_PAD }),
    [],
  );

  const isVideo = activeTab === 'video';

  const TABS: { key: DiscoverTab; label: string }[] = [
    { key: 'game',   label: 'Game'   },
    { key: 'moment', label: 'Moment' },
    { key: 'video',  label: 'Video'  },
  ];

  return (
    <View style={[styles.screen, isVideo && styles.screenVideo]}>
      {isVideo ? (
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'transparent']}
          style={[styles.videoHeaderGradient, { height: insets.top + 56 }]}
          pointerEvents="none"
        />
      ) : null}
      {/* ── Header — overlays for video tab, static for others ── */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top },
          isVideo && styles.headerOverlay,
        ]}
      >
        <View style={styles.tabs}>
          {TABS.map((t) => (
            <TouchableOpacity key={t.key} style={styles.tabBtn} onPress={() => setActiveTab(t.key)}>
              <Text
                style={[
                  styles.tabText,
                  activeTab === t.key && styles.tabTextActive,
                  isVideo && styles.tabTextVideo,
                  isVideo && activeTab === t.key && styles.tabTextVideoActive,
                ]}
              >
                {t.label}
              </Text>
              {activeTab === t.key && (
                <View style={[styles.tabUnderline, isVideo && styles.tabUnderlineVideo]} />
              )}
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.searchBtn} onPress={() => nav.navigate('Search')}>
          <Ionicons name="search-outline" size={22} color={isVideo ? '#FFFFFF' : Colors.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* ── Game tab ── */}
      {activeTab === 'game' && (
        <FlatList
          key={dims.cols}
          data={GAMES}
          keyExtractor={(g) => g.id}
          numColumns={dims.cols}
          columnWrapperStyle={dims.cols > 1 ? gameRowStyle : undefined}
          contentContainerStyle={styles.gameList}
          showsVerticalScrollIndicator={false}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => <GameCard game={item} dims={dims} />}
          ItemSeparatorComponent={() => <View style={{ height: ROW_SEP }} />}
        />
      )}

      {/* ── Moment tab ── */}
      {activeTab === 'moment' && (momentLoading ? (
        <MomentGridSkeleton cols={dims.cols} />
      ) : (
        <FlatList
          data={moments}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.momentList}
          showsVerticalScrollIndicator={false}
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          renderItem={({ item }) => (
            <PostCard
              post={item}
              isVideo={false}
              onComment={() => openComment(item.id)}
              onShare={() => openShare(item.id)}
              onGift={() => openGift(item.id)}
              onProfilePress={() => nav.navigate('PublicProfile', { userId: item.user.id })}
            />
          )}
        />
      ))}

      {/* ── Video tab (full-screen TikTok-style paging) ── */}
      {activeTab === 'video' && (
        <ErrorBoundary>
          {videoLoading ? (
            <View style={styles.videoSkeleton}>
              <Skeleton width="100%" height={videoCardH} borderRadius={0} />
            </View>
          ) : videoError ? (
            <View style={styles.videoEmpty}>
              <Ionicons name="cloud-offline-outline" size={48} color={Colors.textTertiary} />
              <Text style={styles.videoEmptyTitle}>Could not load videos</Text>
              <Text style={styles.videoEmptyBody}>Check your connection and try again.</Text>
              <TouchableOpacity
                style={styles.videoEmptyBtn}
                onPress={() => void videosQuery.refetch()}
              >
                <Text style={styles.videoEmptyBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : videos.length === 0 ? (
            <View style={styles.videoEmpty}>
              <Ionicons name="videocam-outline" size={48} color={Colors.textTertiary} />
              <Text style={styles.videoEmptyTitle}>No videos yet</Text>
              <Text style={styles.videoEmptyBody}>Be the first to share a short video.</Text>
              <TouchableOpacity
                style={styles.videoEmptyBtn}
                onPress={() => nav.navigate('CreateMoment', { postType: 'video' })}
              >
                <Text style={styles.videoEmptyBtnText}>Create video</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.videoFeedWrap}>
              {activeVideo ? (
                <View style={styles.videoPlayerLayer} pointerEvents="box-none">
                  <VideoFeedPlayer
                    uri={activeVideo.video_url}
                    poster={activeVideo.poster_url}
                    isActive={videoPlaybackActive}
                    paused={videoPaused}
                    muted={videoMuted}
                    height={videoCardH}
                    onToggleMute={() => setVideoMuted((m) => !m)}
                  />
                </View>
              ) : null}
              <FlatList
                data={videos}
                keyExtractor={(p) => p.id}
                pagingEnabled
                showsVerticalScrollIndicator={false}
                snapToInterval={videoCardH}
                snapToAlignment="start"
                decelerationRate="fast"
                getItemLayout={videoGetItemLayout}
                initialNumToRender={1}
                maxToRenderPerBatch={2}
                windowSize={3}
                removeClippedSubviews={false}
                onViewableItemsChanged={onViewableItemsChanged}
                viewabilityConfig={viewabilityConfig}
                onEndReached={loadMoreVideos}
                onEndReachedThreshold={0.6}
                refreshControl={
                  <RefreshControl
                    refreshing={videosQuery.isRefetching && !videosQuery.isFetchingNextPage}
                    onRefresh={() => void videosQuery.refetch()}
                    tintColor="#FFFFFF"
                  />
                }
                style={styles.videoList}
                renderItem={({ item, index }) => (
                  <MomentVideoCard
                    post={item}
                    height={videoCardH}
                    isActive={index === activeVideoIndex}
                    showPoster={index !== activeVideoIndex}
                    onComment={() => openComment(item.id)}
                    onShare={() => openShare(item.id)}
                    onGift={() => openGift(item.id)}
                    onProfilePress={() => nav.navigate('PublicProfile', { userId: item.user.id })}
                    onFollowPress={() => void handleVideoFollow(item.user.id)}
                    isFollowing={followedUserIds.has(item.user.id)}
                    onDoubleTapLike={() => void handleVideoDoubleTapLike(item.id)}
                    onTogglePause={() => setVideoPaused((p) => !p)}
                  />
                )}
              />
            </View>
          )}
        </ErrorBoundary>
      )}

      {/* ── FAB — visible on Moment and Video tabs ── */}
      {(activeTab === 'moment' || activeTab === 'video') && (
        <MomentCameraButton
          style={[styles.fab, { bottom: insets.bottom + 70 }]}
          onPress={() => nav.navigate('CreateMoment', { postType: activeTab as 'moment' | 'video' })}
        />
      )}

      {/* ── Overlays ── */}
      <SearchModal   visible={showSearch}   onClose={() => setShowSearch(false)}   />
      <CommentsModal
        visible={showComments}
        onClose={() => setShowComments(false)}
        postId={activePostId}
        onCommentAdded={() => bumpActivePostCount('comments')}
      />
      <ShareModal
        visible={showShare}
        onClose={() => setShowShare(false)}
        postId={activePostId}
        onShared={() => bumpActivePostCount('shares')}
      />
      <GiftModal
        visible={showGift}
        onClose={() => {
          setShowGift(false);
          setGiftAuthorId(null);
        }}
        postId={activePostId}
        authorUserId={giftAuthorId}
        onGiftSent={() => bumpActivePostCount('gifts')}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },
  screenVideo: { backgroundColor: '#000000' },
  videoHeaderGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9,
  },

  // ── Header / tabs ──────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
    zIndex: 10,
  },
  // When video tab is active, header floats over the video (immersive)
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'transparent',
    borderBottomWidth: 0,
    zIndex: 10,
  },
  tabs: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.xl,
  },
  tabBtn: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.textTertiary,
  },
  tabTextActive: {
    color: '#5F22D9',
  },
  // Video tab: light text on video overlay header
  tabTextVideo: {
    color: 'rgba(255,255,255,0.75)',
  },
  tabTextVideoActive: {
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: '#5F22D9',
    borderRadius: Radius.full,
  },
  tabUnderlineVideo: {
    backgroundColor: '#FFFFFF',
  },
  searchBtn: {
    padding: Spacing.xs,
  },

  // ── Game grid ──────────────────────────────────────────────────────────────
  gameList: {
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },
  // Game name: 14px/400/black, centered — width overridden per-card with imgW
  gameName: {
    fontSize: 14,
    fontWeight: '400',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 21,
  },
  // Gameplay pill — width overridden per-card with imgW
  gameplayPill: {
    height: 25,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  // Gameplay text: 14px/600/black (Figma: color #000000, weight 600)
  gameplayText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    lineHeight: 21,
  },

  // ── Post / moment cards ────────────────────────────────────────────────────
  // List: paddingTop:13 matches Figma gap from tabs to first card
  momentList: {
    paddingTop: 13,
    paddingBottom: Spacing.xxxl,
  },
  // Card: white, height:500, TL:50 TR:0 BR:15 BL:0, horizontal margin 25px
  postCard: {
    marginHorizontal: 25,
    height: 500,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderTopLeftRadius: 50,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 15,
    borderBottomLeftRadius: 0,
    overflow: 'hidden',
  },
  // Header section: avatar left:10 top:18, user info to the right
  postHeader: {
    height: 90,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 10,
    paddingTop: 18,
    gap: 12,
  },
  // Avatar container — relative so follow button can be absolute inside
  postAvatarWrap: {
    width: POST_AVATAR_SIZE,
    height: POST_AVATAR_SIZE,
  },
  // Follow button: purple #5F22D9, white border, bottom-right of avatar
  postFollowBtn: {
    position: 'absolute',
    bottom: 1,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#5F22D9',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // User info column: paddingTop aligns name beside avatar
  postUserCol: {
    flex: 1,
    paddingTop: 8,
    gap: 4,
  },
  postNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  // Name: 14px/600/black
  postDisplayName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    lineHeight: 20,
    flexShrink: 1,
  },
  postFlagWrap: {
    width: 22,
    height: 15,
    borderRadius: 2,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
  },
  postFlagIcon: {
    width: '100%',
    height: '100%',
  },
  postGenderPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Radius.full,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minHeight: 18,
  },
  postGenderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Cover: full card width, height:300
  postCover: {
    width: '100%',
    height: 300,
  },
  postCoverImage: {
    width: '100%',
    height: '100%',
  },
  // Play button centered in cover (video tab)
  playBtnCenter: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Camera button: bottom-right of cover, 60×60 (video tab)
  postCameraBtn: {
    position: 'absolute',
    bottom: 15,
    right: 15,
  },
  momentCameraCircle: {
    backgroundColor: 'rgba(58, 58, 58, 0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Hashtag: #5F22D9 purple, 14px/600, left:10, top:426 from card = 13px below cover
  postHashtag: {
    color: '#5F22D9',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 21,
    marginLeft: 10,
    marginTop: 13,
  },
  // Action row: left:10, top:461 (14px below hashtag), gap:20 between items
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
    marginRight: 14,
    marginTop: 14,
    gap: 20,
  },
  // Each action item: icon (24px) + count, aligned at flex-end (bottom)
  postAction: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  // Count text: 14px/600/black
  postActionCount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    lineHeight: 21,
  },
  postTimestampWrap: {
    marginLeft: 'auto',
    flexShrink: 0,
    maxWidth: '42%',
  },
  // Timestamp: right-aligned, 14px/600/black
  postTimestamp: {
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
    color: '#000000',
    lineHeight: 21,
  },

  // ── Search modal ───────────────────────────────────────────────────────────
  searchScreen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  searchCancel: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '500',
  },
  searchBody: {
    flex: 1,
    padding: Spacing.lg,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: Spacing.md,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  tag: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceElevated,
  },
  tagText: {
    color: Colors.textSecondary,
    fontSize: 13,
  },
  tagPurple: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: Radius.full,
    backgroundColor: '#5F22D922',
  },
  tagTextPurple: {
    color: '#5F22D9',
    fontSize: 13,
    fontWeight: '500',
  },

  // ── Bottom sheet shared ────────────────────────────────────────────────────
  modalContainer: {
    flex: 1,
  },
  modalDismiss: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: Spacing.sm,
    maxHeight: '75%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDDDDD',
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  sheetHeader: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  sheetTitle: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },

  // ── Comments sheet ─────────────────────────────────────────────────────────
  commentList: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    maxHeight: 340,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  commentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  commentAvatarFallback: {
    backgroundColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    color: '#666666',
    fontSize: 16,
    fontWeight: '700',
  },
  commentBody: {
    flex: 1,
    gap: 2,
  },
  commentUser: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '700',
  },
  commentDate: {
    color: '#999999',
    fontSize: 11,
  },
  commentText: {
    color: '#333333',
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  commentActionItem: {
    alignItems: 'center',
    gap: 2,
    paddingTop: 4,
  },
  commentActionCount: {
    color: '#999999',
    fontSize: 11,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  commentInput: {
    flex: 1,
    height: 40,
    backgroundColor: '#F5F5F5',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    color: '#000000',
    fontSize: 14,
  },
  commentSendBtn: {
    backgroundColor: '#FF2D55',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  commentSendBtnDisabled: {
    backgroundColor: '#DDDDDD',
  },
  commentSendText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Share sheet ────────────────────────────────────────────────────────────
  shareUserList: {
    maxHeight: 120,
  },
  shareUserListContent: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.lg,
  },
  shareUserItem: {
    alignItems: 'center',
    gap: Spacing.xs,
    width: 72,
  },
  shareUserAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareUserInitial: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  shareUserName: {
    color: Colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
  },
  shareBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  shareBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  shareBtnDone: {
    backgroundColor: Colors.textTertiary,
  },
  shareLoadingText: {
    color: Colors.textSecondary,
    fontSize: 13,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  socialGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.md,
  },
  socialItem: {
    alignItems: 'center',
    gap: Spacing.xs,
    flex: 1,
  },
  socialIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialLabel: {
    color: Colors.textSecondary,
    fontSize: 10,
    textAlign: 'center',
  },

  // ── Video card (full-screen TikTok-style) ─────────────────────────────────
  videoCard: {
    width: '100%',
    backgroundColor: '#000000',
  },
  // Right-side action column: avatar + gift/like/comment/share/more
  videoActions: {
    position: 'absolute',
    right: Spacing.lg,
    bottom: 120,
    alignItems: 'center',
    gap: 1,
  },
  videoAvatarWrap: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  videoAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#D9D9D9',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoAvatarInitial: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  videoFollowBtn: {
    width: 12,
    height: 12,
    borderRadius: 20,
    backgroundColor: '#5F22D9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -6,
  },
  videoActionItem: {
    alignItems: 'center',
    gap: 1,
  },
  videoActionCount: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Bottom-left: user info + description
  videoBottomInfo: {
    position: 'absolute',
    left: 25,
    bottom: 50,
    right: 70,
  },
  videoNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  videoDisplayName: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '600',
  },
  videoFlag: {
    fontSize: 16,
  },
  videoGenderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 5,
    gap: 3,
    height: 12,
    borderRadius: 20,
  },
  videoGenderText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '400',
  },
  videoDescription: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '400',
    lineHeight: 12,
    marginTop: 5,
  },

  // ── FAB ────────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    right: 20,
    zIndex: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 8,
  },
  videoSkeleton: {
    flex: 1,
  },
  videoFeedWrap: {
    flex: 1,
    backgroundColor: '#000000',
  },
  videoPlayerLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 0,
  },
  videoList: {
    flex: 1,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  videoEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  videoEmptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  videoEmptyBody: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  videoEmptyBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  videoEmptyBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // ── Gift modal ─────────────────────────────────────────────────────────────
  giftGrid: {
    padding: Spacing.md,
  },
  giftItem: {
    flex: 1,
    alignItems: 'center',
    padding: Spacing.sm,
    gap: 4,
  },
  giftGridImg: {
    width: 40,
    height: 40,
  },
  giftGridIconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giftName: {
    fontSize: 11,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
  giftCost: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.gold,
  },

  // ── Empty states ───────────────────────────────────────────────────────────
  giftOwnPostHint: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  emptyComments: {
    textAlign: 'center',
    color: Colors.textTertiary,
    fontSize: 13,
    paddingVertical: Spacing.xl,
  },
});
