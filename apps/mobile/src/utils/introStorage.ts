import * as SecureStore from 'expo-secure-store';

const INTRO_COMPLETED_KEY = 'intro_completed_v1';

export async function hasCompletedIntro(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(INTRO_COMPLETED_KEY);
  return value === '1';
}

export async function markIntroCompleted(): Promise<void> {
  await SecureStore.setItemAsync(INTRO_COMPLETED_KEY, '1');
}
