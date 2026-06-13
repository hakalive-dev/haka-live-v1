import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

/** Dev-client / production only — not loaded in Expo Go. */
export function NativeMomentVideoPlayer({
  uri,
  isActive,
  muted = false,
  paused = false,
}: {
  uri: string;
  isActive: boolean;
  muted?: boolean;
  paused?: boolean;
  onTogglePause?: () => void;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
  });
  const lastUri = useRef(uri);

  useEffect(() => {
    if (uri && uri !== lastUri.current) {
      lastUri.current = uri;
      void player.replaceAsync(uri);
    }
  }, [uri, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    if (isActive && !paused) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, paused, player]);

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFillObject}
      contentFit="cover"
      nativeControls={false}
    />
  );
}
