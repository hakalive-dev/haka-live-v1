import React, { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';

import { isPlayableVideoUrl } from '@/utils/videoUrl';

const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const NativePlayer = IS_EXPO_GO
  ? null
  : (require('./NativeMomentVideoPlayer').NativeMomentVideoPlayer as React.ComponentType<{
      uri: string;
      isActive: boolean;
      muted?: boolean;
      paused?: boolean;
    }>);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function WebViewVideoPlayer({
  uri,
  isActive,
  muted,
}: {
  uri: string;
  isActive: boolean;
  muted: boolean;
}) {
  const html = useMemo(() => {
    const safeUri = escapeHtml(uri);
    const playCmd = isActive ? 'v.play().catch(function(){});' : 'v.pause();';
    const muteCmd = muted ? 'v.muted = true;' : 'v.muted = false;';
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
  <video id="v" src="${safeUri}" playsinline webkit-playsinline loop></video>
  <script>
    var v = document.getElementById('v');
    ${muteCmd}
    ${playCmd}
  </script>
</body>
</html>`;
  }, [uri, isActive, muted]);

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

export type VideoFeedPlayerProps = {
  uri: string;
  poster: string | null;
  isActive: boolean;
  paused: boolean;
  muted: boolean;
  height: number;
  onToggleMute?: () => void;
};

/**
 * Single shared player for the vertical video feed.
 * Mounted once at DiscoverScreen level — swaps source via NativeMomentVideoPlayer.replaceAsync.
 */
export function VideoFeedPlayer({
  uri,
  poster,
  isActive,
  paused,
  muted,
  height,
  onToggleMute,
}: VideoFeedPlayerProps) {
  const lastUri = useRef(uri);

  useEffect(() => {
    if (uri !== lastUri.current) {
      lastUri.current = uri;
    }
  }, [uri]);

  const playing = isActive && !paused;

  const fallbackUri = poster ?? (isPlayableVideoUrl(uri) ? null : uri);

  if (!isPlayableVideoUrl(uri)) {
    if (!fallbackUri) {
      return <View style={[styles.fallback, { height }]} />;
    }
    return (
      <Image
        source={{ uri: fallbackUri }}
        style={[styles.fallback, { height }]}
        contentFit="cover"
      />
    );
  }

  return (
    <View style={[styles.container, { height }]}>
      {IS_EXPO_GO || !NativePlayer ? (
        <WebViewVideoPlayer uri={uri} isActive={playing} muted={muted} />
      ) : (
        <NativePlayer uri={uri} isActive={playing} muted={muted} paused={paused} />
      )}
      {paused && isActive ? (
        <View style={styles.pauseOverlay} pointerEvents="none">
          <Ionicons name="play-circle" size={72} color="rgba(255,255,255,0.9)" />
        </View>
      ) : null}
      {onToggleMute ? (
        <Pressable style={styles.muteBtn} onPress={onToggleMute} hitSlop={12}>
          <Ionicons
            name={muted ? 'volume-mute' : 'volume-high'}
            size={22}
            color="#FFFFFF"
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: '#000000',
    overflow: 'hidden',
  },
  fallback: {
    width: '100%',
    backgroundColor: '#000000',
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  muteBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
