import { useAudioPlayer } from 'expo-audio';
import { useCallback, useRef } from 'react';

const SOUND_MAP: Record<string, any> = {
  fanfare: require('../../assets/sounds/fanfare.wav'),
  sparkle: require('../../assets/sounds/sparkle.wav'),
  boom: require('../../assets/sounds/boom.wav'),
};

export function useGiftSound() {
  const fanfarePlayer = useAudioPlayer(SOUND_MAP.fanfare);
  const sparklePlayer = useAudioPlayer(SOUND_MAP.sparkle);
  const boomPlayer = useAudioPlayer(SOUND_MAP.boom);

  const playersRef = useRef({
    fanfare: fanfarePlayer,
    sparkle: sparklePlayer,
    boom: boomPlayer,
  });
  playersRef.current = {
    fanfare: fanfarePlayer,
    sparkle: sparklePlayer,
    boom: boomPlayer,
  };

  const play = useCallback((soundKey: string) => {
    const key = soundKey.trim();
    if (!key || key === 'default') return;
    try {
      const player =
        playersRef.current[key as keyof typeof playersRef.current];
      if (!player) return;
      player.seekTo(0).catch(() => {});
      player.play();
    } catch {
      // Sound is best-effort — never block the gift effect
    }
  }, []);

  return { play };
}
