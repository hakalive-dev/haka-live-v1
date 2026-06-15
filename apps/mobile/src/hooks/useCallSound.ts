import { useEffect, useRef } from 'react';
import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
} from 'expo-audio';

const RINGTONE_SOURCE = require('../../assets/sounds/call_ringtone.wav');
const RINGBACK_SOURCE = require('../../assets/sounds/call_ringback.wav');

let callAudioModeReady = false;

async function ensureCallAudioMode(): Promise<void> {
  if (callAudioModeReady) return;
  await setAudioModeAsync({
    playsInSilentMode: true,
    // The Agora session may already hold the mic — allow recording so tones can mix in.
    allowsRecording: true,
    shouldPlayInBackground: false,
    shouldRouteThroughEarpiece: false,
    interruptionMode: 'mixWithOthers',
  });
  callAudioModeReady = true;
}

/**
 * Loops the incoming-call ringtone or outgoing ringback while `active`.
 * Cadence (silence between rings) is baked into the WAV files.
 */
export function useLoopingCallSound(sound: 'ringtone' | 'ringback', active: boolean) {
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    void (async () => {
      try {
        await ensureCallAudioMode();
        if (cancelled) return;
        const player = createAudioPlayer(
          sound === 'ringtone' ? RINGTONE_SOURCE : RINGBACK_SOURCE,
        );
        if (cancelled) {
          // Unmounted while createAudioPlayer ran — cleanup already fired, so
          // release here or the player leaks.
          try {
            player.remove();
          } catch {
            /* already released */
          }
          return;
        }
        playerRef.current = player;
        player.volume = 1;
        player.loop = true;
        if (player.isLoaded) {
          player.play();
          return;
        }
        const sub = player.addListener('playbackStatusUpdate', (status) => {
          if (!status.isLoaded) return;
          sub.remove();
          if (playerRef.current === player) player.play();
        });
      } catch {
        /* best-effort */
      }
    })();

    return () => {
      cancelled = true;
      const player = playerRef.current;
      playerRef.current = null;
      try {
        player?.pause();
        player?.remove();
      } catch {
        /* already released */
      }
    };
  }, [sound, active]);
}
