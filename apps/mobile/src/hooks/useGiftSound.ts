import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';
import { useCallback, useEffect } from 'react';

const COIN_WIN_SOURCE = require('../../assets/sounds/coin_win.wav');

const SOUND_MAP: Record<string, number> = {
  fanfare: require('../../assets/sounds/fanfare.wav'),
  sparkle: require('../../assets/sounds/sparkle.wav'),
  boom: require('../../assets/sounds/boom.wav'),
  coin_win: COIN_WIN_SOURCE,
};

let sfxAudioModeReady = false;

async function ensureSfxAudioMode(): Promise<void> {
  if (sfxAudioModeReady) return;
  await setAudioModeAsync({
    playsInSilentMode: true,
    // Voice rooms keep the mic session active — allow recording so SFX can mix in.
    allowsRecording: true,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
    interruptionMode: 'mixWithOthers',
  });
  sfxAudioModeReady = true;
}

function schedulePlayerCleanup(player: AudioPlayer): void {
  const timeout = setTimeout(() => {
    sub?.remove();
    try {
      player.pause();
      player.remove();
    } catch {
      /* already released */
    }
  }, 4000);

  const sub = player.addListener('playbackStatusUpdate', (status) => {
    if (!status.isLoaded) return;
    if (status.didJustFinish) {
      clearTimeout(timeout);
      sub.remove();
      try {
        player.remove();
      } catch {
        /* already released */
      }
    }
  });
}

async function playOneShot(source: number): Promise<void> {
  await ensureSfxAudioMode();
  const player = createAudioPlayer(source);
  player.volume = 1;
  player.loop = false;
  schedulePlayerCleanup(player);
  if (player.isLoaded) {
    player.seekTo(0).catch(() => {});
    player.play();
    return;
  }
  const sub = player.addListener('playbackStatusUpdate', (status) => {
    if (!status.isLoaded) return;
    sub.remove();
    player.seekTo(0).catch(() => {});
    player.play();
  });
}

/**
 * Gift / lucky-win SFX. Uses on-demand players + mixWithOthers so sounds are
 * audible during Agora voice rooms (hook-based players were silent in practice).
 */
export function useGiftSound() {
  useEffect(() => {
    void ensureSfxAudioMode().catch(() => {});
  }, []);

  const play = useCallback((soundKey: string) => {
    const key = soundKey.trim();
    const source = SOUND_MAP[key];
    if (!source) return;
    void playOneShot(source).catch(() => {
      /* best-effort */
    });
  }, []);

  const playLuckyWin = useCallback(() => {
    void playOneShot(COIN_WIN_SOURCE).catch(() => {
      /* best-effort */
    });
  }, []);

  return { play, playLuckyWin };
}
