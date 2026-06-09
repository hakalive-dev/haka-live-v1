import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';

import { Colors, Radius, Spacing } from '@/theme';
import { MomentGridSkeleton, Skeleton } from '@components/Skeleton';
import { UserAvatar } from '@components/UserAvatar';
import { CopyIcon } from '@components/CopyIcon';
import type { RootStackParamList } from '@navigation/types';
import { useQuery } from '@tanstack/react-query';
import { useSelector } from 'react-redux';

import { momentsApi } from '@api/moments';
import { queryKeys } from '@api/queryKeys';
import { giftsApi } from '@api/gifts';
import { invalidateUserLevels } from '@hooks/queries/useLevelQueries';
import type { RootState } from '../../store';
import type { MomentPost as ApiMomentPost, MomentComment as ApiComment, Gift } from '@/types';

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
    country_flag: string;
    rich_level: number;
    charm_level: number;
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
  timestamp: string;
};

type VideoPost = {
  id: string;
  user: {
    displayName: string;
    avatar: string | null;
    country_flag: string;
    gender: string;
    level: number;
  };
  video_image: string;
  description: string;
  likes: number;
  comments: number;
  shares: number;
  gifts: number;
  default_liked: boolean;
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
const SHARE_USERS     = [
  { id: 'u1', displayName: 'Kai Rivera'     },
  { id: 'u2', displayName: 'Preeti Sharma'  },
  { id: 'u3', displayName: 'Yuki Tanaka'    },
  { id: 'u4', displayName: 'Omar Hassan'    },
  { id: 'u5', displayName: 'Rosa Martinez'  },
];
const SOCIAL_PLATFORMS: { id: string; label: string; icon: React.ComponentProps<typeof Ionicons>['name']; color: string }[] = [
  { id: 'copy',      label: 'Copy',      icon: 'copy-outline',           color: '#666666'  },
  { id: 'whatsapp',  label: 'WhatsApp',  icon: 'logo-whatsapp',          color: '#25D366'  },
  { id: 'facebook',  label: 'Facebook',  icon: 'logo-facebook',          color: '#1877F2'  },
  { id: 'twitter',   label: 'X',         icon: 'logo-twitter',           color: '#000000'  },
  { id: 'instagram', label: 'Instagram', icon: 'logo-instagram',         color: '#E1306C'  },
  { id: 'messenger', label: 'Messenger', icon: 'chatbubble-ellipses',    color: '#0099FF'  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

function apiToMoment(p: ApiMomentPost): MomentPost {
  return {
    id: p.id,
    user: {
      id: p.user.id,
      username: p.user.username,
      displayName: p.user.displayName,
      avatar: p.user.avatar,
      country_flag: p.user.country ?? '',
      rich_level: p.user.rich_level,
      charm_level: p.user.charm_level,
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
    timestamp: new Date(p.created_at).toLocaleDateString(),
  };
}

function apiToVideo(p: ApiMomentPost): VideoPost {
  return {
    id: p.id,
    user: {
      displayName: p.user.displayName,
      avatar: p.user.avatar,
      country_flag: p.user.country ?? '',
      gender: p.user.gender ?? '',
      level: p.user.rich_level,
    },
    video_image: p.media_url ?? '',
    description: p.caption,
    likes: p.likes_count,
    comments: p.comments_count,
    shares: p.shares_count,
    gifts: p.gifts_count,
    default_liked: p.is_liked,
  };
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

const PostCard = React.memo(function PostCard({
  post,
  isVideo,
  onComment,
  onShare,
  onGift,
}: {
  post: MomentPost;
  isVideo: boolean;
  onComment: () => void;
  onShare: () => void;
  onGift: () => void;
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

  return (
    <View style={styles.postCard}>

      {/* ── Header: avatar + user info (height 113px) ── */}
      <View style={styles.postHeader}>
        {/* Avatar with follow button */}
        <View style={styles.postAvatarWrap}>
          <View style={styles.postAvatar80}>
            <Text style={styles.postAvatarInitial}>{post.user.displayName[0]}</Text>
          </View>
          {/* Follow / + button — bottom-right of avatar */}
          <TouchableOpacity style={styles.postFollowBtn}>
            <Ionicons name="add" size={13} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Name + level badges + live badge */}
        <View style={styles.postUserCol}>
          {/* Name row: display_name + flag + level badges */}
          <View style={styles.postNameRow}>
            <Text style={styles.postDisplayName} numberOfLines={1}>{post.user.displayName}</Text>
            <Text style={styles.postFlag}>{post.user.country_flag}</Text>
            {/* Rich level badge */}
            <View style={styles.postLevelBadgeRich}>
              <Ionicons name="diamond" size={8} color="#E8A020" />
              <Text style={styles.postLevelBadgeRichText}>Lv.{post.user.rich_level}</Text>
            </View>
            {/* Charm level badge */}
            <View style={styles.postLevelBadgeCharm}>
              <Ionicons name="heart" size={8} color="#FF69B4" />
              <Text style={styles.postLevelBadgeCharmText}>Lv.{post.user.charm_level}</Text>
            </View>
          </View>
          {/* Pink live-viewers badge */}
          <View style={styles.postLiveBadge}>
            <Ionicons name="heart" size={8} color="#FFFFFF" />
            <View style={styles.postLiveDot} />
            <Text style={styles.postLiveCount}>{fmtCount(post.live_viewers)}</Text>
          </View>
        </View>
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
        {isVideo && (
          <TouchableOpacity style={styles.postCameraBtn}>
            <Ionicons name="camera" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
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
        <Text style={styles.postTimestamp}>{post.timestamp}</Text>
      </View>

    </View>
  );
});

// ── Video card (full-screen TikTok-style) ────────────────────────────────────

const VideoCard = React.memo(function VideoCard({
  post,
  height,
  onComment,
  onShare,
}: {
  post: VideoPost;
  height: number;
  onComment: () => void;
  onShare: () => void;
}) {
  const [liked, setLiked] = useState(post.default_liked);
  const [likeCount, setLikeCount] = useState(post.likes);

  const handleLike = () => {
    setLiked((v) => !v);
    setLikeCount((c) => (liked ? c - 1 : c + 1));
  };

  const genderColor = post.user.gender === 'female' ? '#F9467D' : '#4DA6FF';

  return (
    <View style={[styles.videoCard, { height }]}>
      {/* Full-screen background image */}
      <Image
        source={{ uri: post.video_image }}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
      />

      {/* Right-side action bar */}
      <View style={styles.videoActions}>
        {/* Avatar + follow */}
        <View style={styles.videoAvatarWrap}>
          <View style={styles.videoAvatar}>
            <Text style={styles.videoAvatarInitial}>{post.user.displayName[0]}</Text>
          </View>
          <View style={styles.videoFollowBtn}>
            <Ionicons name="add" size={10} color="#FFFFFF" />
          </View>
        </View>

        {/* Gift */}
        <TouchableOpacity style={styles.videoActionItem}>
          <Ionicons name="gift" size={24} color="#FFFFFF" />
          <Text style={styles.videoActionCount}>{fmtCount(post.gifts)}</Text>
        </TouchableOpacity>
        {/* Like */}
        <TouchableOpacity style={styles.videoActionItem} onPress={handleLike}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={22}
            color={liked ? '#FF383C' : '#FFFFFF'}
          />
          <Text style={styles.videoActionCount}>{fmtCount(likeCount)}</Text>
        </TouchableOpacity>
        {/* Comment */}
        <TouchableOpacity style={styles.videoActionItem} onPress={onComment}>
          <Ionicons name="chatbubble-outline" size={22} color="#FFFFFF" />
          <Text style={styles.videoActionCount}>{fmtCount(post.comments)}</Text>
        </TouchableOpacity>
        {/* Share */}
        <TouchableOpacity style={styles.videoActionItem} onPress={onShare}>
          <Ionicons name="arrow-redo-outline" size={20} color="#FFFFFF" />
          <Text style={styles.videoActionCount}>{fmtCount(post.shares)}</Text>
        </TouchableOpacity>
        {/* More */}
        <TouchableOpacity style={styles.videoActionItem}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* Bottom-left user info + description */}
      <View style={styles.videoBottomInfo}>
        {/* Name row: display_name + flag + gender/level badge */}
        <View style={styles.videoNameRow}>
          <Text style={styles.videoDisplayName}>{post.user.displayName}</Text>
          <Text style={styles.videoFlag}>{post.user.country_flag}</Text>
          <View style={[styles.videoGenderBadge, { backgroundColor: genderColor }]}>
            <Ionicons
              name={post.user.gender === 'female' ? 'female' : 'male'}
              size={8}
              color="#FFFFFF"
            />
            <Text style={styles.videoGenderText}>.{post.user.level}</Text>
          </View>
        </View>
        {/* Description */}
        <Text style={styles.videoDescription} numberOfLines={3}>{post.description}</Text>
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
}: {
  visible: boolean;
  onClose: () => void;
  postId: string | null;
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
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to post comment');
    } finally {
      setSending(false);
    }
  }, [comment, postId]);

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
                <View style={styles.commentActions}>
                  <TouchableOpacity style={styles.commentActionItem}>
                    <Ionicons
                      name={item.likes_count > 0 ? 'heart' : 'heart-outline'}
                      size={16}
                      color={item.likes_count > 0 ? '#FF2D55' : '#999999'}
                    />
                    <Text style={styles.commentActionCount}>{item.likes_count}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.commentActionItem}>
                    <Ionicons name="happy-outline" size={16} color="#999999" />
                  </TouchableOpacity>
                </View>
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
}: {
  visible: boolean;
  onClose: () => void;
  postId: string | null;
}) {
  const insets = useSafeAreaInsets();

  const handleShare = useCallback(async (platform: string) => {
    if (!postId) return;
    try {
      await momentsApi.share(postId, platform);
    } catch { /* silent */ }
    onClose();
  }, [postId, onClose]);

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

          {/* User list */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.shareUserList}
            contentContainerStyle={styles.shareUserListContent}
          >
            {SHARE_USERS.map((u) => (
              <View key={u.id} style={styles.shareUserItem}>
                <View style={styles.shareUserAvatar}>
                  <Text style={styles.shareUserInitial}>{u.displayName[0]}</Text>
                </View>
                <Text style={styles.shareUserName} numberOfLines={1}>{u.displayName}</Text>
                <TouchableOpacity style={styles.shareBtn} onPress={() => handleShare('user')}>
                  <Text style={styles.shareBtnText}>Share</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          {/* Social platforms */}
          <View style={styles.socialGrid}>
            {SOCIAL_PLATFORMS.map((p) => (
              <TouchableOpacity key={p.id} style={styles.socialItem} onPress={() => handleShare(p.id)}>
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
}: {
  visible: boolean;
  onClose: () => void;
  postId: string | null;
  authorUserId?: string | null;
}) {
  const insets = useSafeAreaInsets();
  const currentUser = useSelector((state: RootState) => state.auth.user);
  const [gifts, setGifts] = useState<Gift[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    giftsApi.catalogue().then(setGifts).catch(() => {});
  }, [visible]);

  const handleGift = useCallback(async (gift: Gift) => {
    if (!postId) return;
    setSending(true);
    try {
      const res = await momentsApi.sendGift(postId, gift.id);
      invalidateUserLevels(currentUser?.id, authorUserId);
      Alert.alert('Gift sent!', `You sent "${res.gift_name}"`);
      onClose();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to send gift');
    } finally {
      setSending(false);
    }
  }, [postId, onClose, currentUser?.id, authorUserId]);

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
  const videosQuery = useQuery({
    queryKey: queryKeys.discover.videos(),
    queryFn: () => momentsApi.list('video').then((feed) => feed.results.map(apiToVideo)),
    enabled: activeTab === 'video',
    staleTime: 60_000,
  });
  const moments: MomentPost[] = momentsQuery.data ?? [];
  const videos: VideoPost[] = videosQuery.data ?? [];
  const momentLoading = moments.length === 0 && momentsQuery.isLoading;
  const videoLoading = videos.length === 0 && videosQuery.isLoading;

  const openComment = useCallback((postId: string) => {
    setActivePostId(postId);
    setShowComments(true);
  }, []);

  const openShare = useCallback((postId: string) => {
    setActivePostId(postId);
    setShowShare(true);
  }, []);

  const openGift = useCallback((postId: string) => {
    const post = moments.find((m) => m.id === postId);
    setActivePostId(postId);
    setGiftAuthorId(post?.user.id ?? null);
    setShowGift(true);
  }, [moments]);

  // Height available for each full-screen video card (below the header)
  const headerH = insets.top + 48; // safe area + header height
  const videoCardH = screenH - headerH;

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
    <View style={styles.screen}>
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
          <Ionicons name="search-outline" size={22} color={isVideo ? '#000000' : Colors.textPrimary} />
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
            />
          )}
        />
      ))}

      {/* ── Video tab (full-screen paging) ── */}
      {activeTab === 'video' && (videoLoading ? (
        <View style={styles.videoSkeleton}>
          <Skeleton width="100%" height={videoCardH} borderRadius={0} />
        </View>
      ) : (
        <FlatList
          data={videos}
          keyExtractor={(p) => p.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={videoCardH}
          decelerationRate="fast"
          maxToRenderPerBatch={8}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item }) => (
            <VideoCard
              post={item}
              height={videoCardH}
              onComment={() => openComment(item.id)}
              onShare={() => openShare(item.id)}
            />
          )}
        />
      ))}

      {/* ── FAB — visible on Moment and Video tabs ── */}
      {(activeTab === 'moment' || activeTab === 'video') && (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 70 }]}
          onPress={() => nav.navigate('CreateMoment', { postType: activeTab as 'moment' | 'video' })}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      )}

      {/* ── Overlays ── */}
      <SearchModal   visible={showSearch}   onClose={() => setShowSearch(false)}   />
      <CommentsModal visible={showComments} onClose={() => setShowComments(false)} postId={activePostId} />
      <ShareModal    visible={showShare}    onClose={() => setShowShare(false)}    postId={activePostId} />
      <GiftModal
        visible={showGift}
        onClose={() => {
          setShowGift(false);
          setGiftAuthorId(null);
        }}
        postId={activePostId}
        authorUserId={giftAuthorId}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

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
  // When video tab is active, header floats over the video
  headerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
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
  // Video tab: dark text on white overlay header
  tabTextVideo: {
    color: 'rgba(0,0,0,0.7)',
  },
  tabTextVideoActive: {
    fontWeight: '600',
    color: '#000000',
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
    backgroundColor: '#000000',
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
  // Header section (height:113): avatar left:10 top:18, user info to the right
  postHeader: {
    height: 113,
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingLeft: 10,
    paddingTop: 18,
    gap: 19,
  },
  // Avatar container (80×80) — relative so follow button can be absolute inside
  postAvatarWrap: {
    width: 80,
    height: 80,
  },
  postAvatar80: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  postAvatarInitial: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '700',
  },
  // Follow button: 20×20, purple #5F22D9, white border, bottom-right of avatar
  postFollowBtn: {
    position: 'absolute',
    bottom: 2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#5F22D9',
    borderWidth: 1,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // User info column: paddingTop:20 so name aligns at top:38 from card (18+20=38)
  postUserCol: {
    flex: 1,
    paddingTop: 20,
    gap: 6,
  },
  postNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  // Name: 16px/600/black (Figma: weight:600, color:#000000)
  postDisplayName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    lineHeight: 24,
    flexShrink: 1,
  },
  postFlag: {
    fontSize: 16,
  },
  // Rich level badge: gold pill
  postLevelBadgeRich: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8A02018',
    borderRadius: Radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
    gap: 2,
  },
  postLevelBadgeRichText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#E8A020',
  },
  // Charm level badge: pink pill
  postLevelBadgeCharm: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF69B418',
    borderRadius: Radius.full,
    paddingHorizontal: 5,
    paddingVertical: 1,
    gap: 2,
  },
  postLevelBadgeCharmText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FF69B4',
  },
  // Live badge: pink #F9467D pill, height:13, borderRadius:10
  postLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F9467D',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    gap: 3,
    height: 13,
  },
  // White dot inside live badge
  postLiveDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
  },
  postLiveCount: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: '600',
    lineHeight: 11,
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
  // Camera button: bottom-right of cover, 60×60, rgba(223,223,223,0.5) (video tab)
  postCameraBtn: {
    position: 'absolute',
    bottom: 15,
    right: 15,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(223,223,223,0.5)',
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
  // Timestamp: right-aligned, 14px/600/black
  postTimestamp: {
    flex: 1,
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
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingTop: 4,
  },
  commentActionItem: {
    alignItems: 'center',
    gap: 2,
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
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 20,
  },
  videoSkeleton: {
    flex: 1,
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
  emptyComments: {
    textAlign: 'center',
    color: Colors.textTertiary,
    fontSize: 13,
    paddingVertical: Spacing.xl,
  },
});
