import { Alert, Linking, type View } from 'react-native';
import type { RefObject } from 'react';
import * as MediaLibrary from 'expo-media-library';
import { captureRef } from 'react-native-view-shot';

export const PERMISSION_DENIED_MESSAGE =
  'Allow photo library access to save the account card.';
export const PERMISSION_SETTINGS_MESSAGE =
  'Photo access is disabled in Settings. Enable it to save the account card.';

/** Request write-only photo library access (save to album, not read library). */
export async function ensureAlbumWritePermission(): Promise<void> {
  const response = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
  if (response.status === 'granted') {
    return;
  }
  if (!response.canAskAgain) {
    throw new Error(PERMISSION_SETTINGS_MESSAGE);
  }
  throw new Error(PERMISSION_DENIED_MESSAGE);
}

function isPermissionError(message: string): boolean {
  return (
    message === PERMISSION_DENIED_MESSAGE ||
    message === PERMISSION_SETTINGS_MESSAGE
  );
}

/** Capture the on-screen account card and save it as a PNG in the photo library. */
export async function saveAccountCardToAlbum(
  cardRef: RefObject<View | null>,
): Promise<void> {
  if (!cardRef.current) {
    throw new Error('Account card is not ready. Try again in a moment.');
  }

  await ensureAlbumWritePermission();

  const uri = await captureRef(cardRef, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });

  await MediaLibrary.saveToLibraryAsync(uri);
}

export function showSaveAlbumError(e: unknown): void {
  const message =
    e instanceof Error
      ? e.message
      : 'Could not save image. Rebuild the app if this is your first time using Save to album.';

  if (isPermissionError(message)) {
    const openSettings = message === PERMISSION_SETTINGS_MESSAGE;
    Alert.alert(
      'Could not save',
      message,
      openSettings
        ? [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open Settings', onPress: () => void Linking.openSettings() },
          ]
        : [{ text: 'OK' }],
    );
    return;
  }

  Alert.alert('Could not save', message);
}
