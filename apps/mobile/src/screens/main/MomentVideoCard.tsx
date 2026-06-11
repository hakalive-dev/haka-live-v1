import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';

import { momentsApi } from '@api/moments';

// expo-video crashes in Expo Go (Media3 mismatch) — use WebView there; native player in APK/dev builds.
const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
const NativeMomentVideoPlayer = IS_EXPO_GO
  ? null
  : require('./NativeMomentVideoPlayer').NativeMomentVideoPlayer as React.ComponentType<{
      uri: string;
      isActive: boolean;
    }>;

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

function isPlayableVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) || url.includes('/moments/videos/');
}

function fmtCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** HTML5 video inside WebView — works in Expo Go without native expo-video. */
function WebViewVideoPlayer({ uri, isActive }: { uri: string; isActive: boolean }) {
  const html = useMemo(() => {
    const safeUri = escapeHtml(uri);
    const playCmd = isActive ? 'v.play().catch(function(){});' : 'v.pause();';
    return `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  * { margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }
  video { width: 100%; height: 100%; object-fit: cover; background: #000; }
</style>
</head>
<body>
  <video id="v" src="${safeUri}" playsinline webkit-playsinline loop muted></video>
  <script>
    var v = document.getElementById('v');
    v.muted = false;
    ${playCmd}
  </script>
</body>
</html>`;
  }, [uri, isActive]);

  return (
    <WebView
      source={{ html }}
      style={StyleSheet.absoluteFillObject}
      scrollEnabled={false}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      javaScriptEnabled
      domStorageEnabled
      originWhitelist={['*']}
    />
  );
}

function VideoBackground({
  uri,
  poster,
  isActive,
}: {
  uri: string;
  poster: string | null;
  isActive: boolean;
}) {
  if (!isPlayableVideoUrl(uri)) {
    return (
      <Image
        source={{ uri: poster ?? uri }}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
      />
    );
  }

  if (IS_EXPO_GO) {
    return <WebViewVideoPlayer uri={uri} isActive={isActive} />;
  }

  return <NativeMomentVideoPlayer uri={uri} isActive={isActive} />;
}

export const MomentVideoCard = React.memo(function MomentVideoCard({
  post,
  height,
  isActive,
  onComment,
  onShare,
  onGift,
}: {
  post: MomentVideoPost;
  height: number;
  isActive: boolean;
  onComment: () => void;
  onShare: () => void;
  onGift: () => void;
}) {
  const [liked, setLiked] = useState(post.default_liked);
  const [likeCount, setLikeCount] = useState(post.likes);

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

  const genderColor = post.user.gender === 'female' ? '#F9467D' : '#4DA6FF';

  return (
    <View style={[styles.videoCard, { height }]}>
      <VideoBackground
        uri={post.video_url}
        poster={post.poster_url}
        isActive={isActive}
      />

      <View style={styles.videoActions}>
        <View style={styles.videoAvatarWrap}>
          <View style={styles.videoAvatar}>
            <Text style={styles.videoAvatarInitial}>{post.user.displayName[0]}</Text>
          </View>
          <View style={styles.videoFollowBtn}>
            <Ionicons name="add" size={10} color="#FFFFFF" />
          </View>
        </View>

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

      <View style={styles.videoBottomInfo}>
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
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  videoCard: {
    width: '100%',
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  videoActions: {
    position: 'absolute',
    right: 12,
    bottom: 120,
    alignItems: 'center',
    gap: 18,
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
