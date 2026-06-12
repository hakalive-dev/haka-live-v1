import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

/** Noticeable “you won” buzz — short pulses, not a single subtle tick. */
const LUCKY_WIN_VIBRATE_PATTERN = [0, 70, 60, 90, 60, 130];

const LUCKY_WIN_DOUBLE_GAP_MS = 120;

export function triggerLuckyWinVibration(): void {
  void triggerLuckyWinVibrationAsync().catch(() => {});
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function luckyWinPulseOnce(): Promise<void> {
  if (Platform.OS === 'android') {
    // performAndroidHapticsAsync uses the haptics engine (no VIBRATE perm).
    // Vibration.vibrate adds a clearer motor pulse on devices where Confirm is faint.
    await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm);
    Vibration.vibrate(LUCKY_WIN_VIBRATE_PATTERN);
    return;
  }

  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
}

async function triggerLuckyWinVibrationAsync(): Promise<void> {
  await luckyWinPulseOnce();
  await delay(LUCKY_WIN_DOUBLE_GAP_MS);
  await luckyWinPulseOnce();
}
