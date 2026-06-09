import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

let cached = { sound: true, vibrate: true };

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: cached.sound,
    shouldSetBadge: true,
  }),
});

export async function applyNotificationPrefs(prefs: { sound: boolean; vibrate: boolean }) {
  cached = prefs;
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.HIGH,
      sound: prefs.sound ? 'default' : undefined,
      vibrationPattern: prefs.vibrate ? [0, 250, 250, 250] : [0],
      enableVibrate: prefs.vibrate,
    });
    await Notifications.setNotificationChannelAsync('account', {
      name: 'Account alerts',
      description: 'Recharge approvals, balance updates, and official messages',
      importance: Notifications.AndroidImportance.HIGH,
      sound: prefs.sound ? 'default' : undefined,
      vibrationPattern: prefs.vibrate ? [0, 250, 250, 250] : [0],
      enableVibrate: prefs.vibrate,
    });
  } catch {}
}
