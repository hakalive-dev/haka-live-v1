import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const DEVICE_ID_KEY = 'haka_device_id';

export type ClientDevicePayload = {
  deviceId: string;
  deviceModel: string;
  platform: string;
  appVersion: string;
};

/**
 * Stable install id + model metadata for backend UserDevice upserts.
 */
export async function getDeviceInfo(): Promise<ClientDevicePayload> {
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = `${Platform.OS}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  }
  return {
    deviceId,
    deviceModel: Constants.deviceName ?? '',
    platform: Platform.OS,
    appVersion: Constants.expoConfig?.version ?? '',
  };
}
