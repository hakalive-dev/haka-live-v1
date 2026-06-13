import React, { useCallback, useRef, useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { momentsApi } from '@api/moments';
import { isPlayableVideoUrl } from '@/utils/videoUrl';

export type MomentVideoPost = {
  id: string;
  user: {
    id: string;
    displayName: string;
    avatar: string | null;
    country_flag: string;
    gender: string;
    level: number;
  };
  video_url: string;
  poster_url: string | null;
  description: string;
  likes: number;
  comments: number;
  shares: number;
  gifts: number;
  default_liked: boolean;
};

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const DOUBLE_TAP_MS = 300;

export const MomentVideoCard = React.memo(function MomentVideoCard({
  post,
  height,
  isActive,
  showPoster,
  onComment,
  onShare,
  onGift,
  onProfilePress,
  onFollowPress,
  isFollowing,
  onDoubleTapLike,
  onTogglePause,
}: {
  post: MomentVideoPost;
  height: number;
  isActive: boolean;
  /** When false, the shared VideoFeedPlayer behind the list is visible. */
  showPoster: boolean;
  onComment: () => void;
  onShare: () => void;
  onGift: () => void;
  onProfilePress: () => void;
  onFollowPress: () => void;
  isFollowing: boolean;
  onDoubleTapLike: () => void;
  onTogglePause: () => void;
}) {
  const [liked, setLiked] = useState(post.default_liked);
  const [likeCount, setLikeCount] = useState(post.likes);
  const lastTapRef = useRef(0);
  const heartScale = useRef(new Animated.Value(0)).current;

  const animateHeart = useCallback(() => {
    heartScale.setValue(0);
    Animated.sequence([
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, friction: 4 }),
      Animated.timing(heartScale, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();
  }, [heartScale]);

  const handleLike = useCallback(async () => {
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((c) => (nextLiked ? c + 1 : c - 1));
    try {
      await momentsApi.toggleLike(post.id);
    } catch {
      setLiked(!nextLiked);
      setLikeCount((c) => (nextLiked ? c - 1 : c + 1));
    }
  }, [liked, post.id]);

  const handleCardPress = useCallback(() => {
    const now = Date.now();
    if (now - lastTapRef.current < DOUBLE_TAP_MS) {
      lastTapRef.current = 0;
      if (!liked) {
        setLiked(true);
        setLikeCount((c) => c + 1);
        onDoubleTapLike();
      }
      animateHeart();
      return;
    }
    lastTapRef.current = now;
    setTimeout(() => {
      if (Date.now() - lastTapRef.current >= DOUBLE_TAP_MS && isActive) {
        onTogglePause();
      }
    }, DOUBLE_TAP_MS);
  }, [liked, onDoubleTapLike, animateHeart, isActive, onTogglePause]);

  const posterUri =
    post.poster_url ??
    (!isPlayableVideoUrl(post.video_url) ? post.video_url : null);

  const genderColor = post.user.gender === 'female' ? '#F9467D' : '#4DA6FF';

  return (
    <TouchableOpacity
      activeOpacity={1}
      style={[styles.videoCard, { height }]}
      onPress={handleCardPress}
    >
      {showPoster && posterUri ? (
        <Image
          source={{ uri: posterUri }}
          style={StyleSheet.absoluteFillObject}
          contentFit="cover"
        />
      ) : null}

      <Animated.View
        pointerEvents="none"
        style={[
          styles.heartBurst,
          {
            opacity: heartScale,
            transform: [{ scale: heartScale.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1.2] }) }],
          },
        ]}
      >
        <Ionicons name="heart" size={96} color="#FF383C" />
      </Animated.View>

      <View style={styles.videoActions}>
        <TouchableOpacity style={styles.videoAvatarWrap} onPress={onProfilePress}>
          <View style={styles.videoAvatar}>
            {post.user.avatar ? (
              <Image source={{ uri: post.user.avatar }} style={styles.videoAvatarImg} contentFit="cover" />
            ) : (
              <Text style={styles.videoAvatarInitial}>{post.user.displayName[0]}</Text>
            )}
          </View>
          {!isFollowing ? (
            <TouchableOpacity style={styles.videoFollowBtn} onPress={onFollowPress}>
              <Ionicons name="add" size={10} color="#FFFFFF" />
            </TouchableOpacity>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity style={styles.videoActionItem} onPress={onGift}>
          <Ionicons name="gift" size={24} color="#FFFFFF" />
          <Text style={styles.videoActionCount}>{fmtCount(post.gifts)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.videoActionItem} onPress={handleLike}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={22}
            color={liked ? '#FF383C' : '#FFFFFF'}
          />
          <Text style={styles.videoActionCount}>{fmtCount(likeCount)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.videoActionItem} onPress={onComment}>
          <Ionicons name="chatbubble-outline" size={22} color="#FFFFFF" />
          <Text style={styles.videoActionCount}>{fmtCount(post.comments)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.videoActionItem} onPress={onShare}>
          <Ionicons name="arrow-redo-outline" size={20} color="#FFFFFF" />
          <Text style={styles.videoActionCount}>{fmtCount(post.shares)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.videoActionItem}>
          <Ionicons name="ellipsis-horizontal" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.videoBottomInfo} onPress={onProfilePress} activeOpacity={0.85}>
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
        <Text style={styles.videoDescription} numberOfLines={3}>{post.description}</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  videoCard: {
    width: '100%',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  heartBurst: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoActions: {
    position: 'absolute',
    right: 12,
    bottom: 120,
    alignItems: 'center',
    gap: 18,
    zIndex: 2,
  },
  videoAvatarWrap: {
    alignItems: 'center',
    marginBottom: 4,
  },
  videoAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
  },
  videoAvatarImg: {
    width: '100%',
    height: '100%',
  },
  videoAvatarInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  videoFollowBtn: {
    position: 'absolute',
    bottom: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FF2D55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoActionItem: {
    alignItems: 'center',
    gap: 2,
  },
  videoActionCount: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  videoBottomInfo: {
    position: 'absolute',
    left: 12,
    right: 80,
    bottom: 24,
    zIndex: 2,
  },
  videoNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  videoDisplayName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  videoFlag: {
    fontSize: 14,
  },
  videoGenderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
    gap: 2,
  },
  videoGenderText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  videoDescription: {
    fontSize: 13,
    color: '#FFFFFF',
    lineHeight: 18,
  },
});
