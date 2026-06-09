import { NativeModules } from 'react-native';

/**
 * True when @react-native-firebase/messaging is compiled into the native app.
 * If false (Expo Go, or dev client not rebuilt after adding the package), never call `messaging()`.
 */
export function isRnFirebaseMessagingLinked(): boolean {
  return NativeModules.RNFBMessagingModule != null;
}
