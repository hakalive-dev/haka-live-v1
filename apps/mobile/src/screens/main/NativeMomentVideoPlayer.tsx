import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';

/** Dev-client / production only — not loaded in Expo Go. */
export function NativeMomentVideoPlayer({
  uri,
  isActive,
}: {
  uri: string;
  isActive: boolean;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = false;
  });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (isActive && !paused) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, paused, player]);

  const togglePause = useCallback(() => {
    setPaused((v) => !v);
  }, []);

  return (
    <Pressable style={StyleSheet.absoluteFillObject} onPress={togglePause}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFillObject}
        contentFit="cover"
        nativeControls={false}
      />
      {paused ? (
        <View style={styles.pauseOverlay}>
          <Ionicons name="play-circle" size={72} color="rgba(255,255,255,0.9)" />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
});
