import { useResizeMode } from 'react-native-keyboard-controller';

/** Mount once under `KeyboardProvider` — consistent Android resize for all inputs. */
export function KeyboardSetup() {
  useResizeMode();
  return null;
}
