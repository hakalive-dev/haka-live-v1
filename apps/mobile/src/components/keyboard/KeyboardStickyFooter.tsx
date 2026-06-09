import React from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  KeyboardStickyView,
  useKeyboardState,
  type KeyboardStickyViewProps,
} from 'react-native-keyboard-controller';

import { Spacing } from '@/theme';

type Props = Omit<KeyboardStickyViewProps, 'offset'> & {
  children: React.ReactNode;
  /** Padding below content when keyboard is closed (defaults to safe area + sm). */
  safeBottomPadding?: number;
  /** When true, no extra padding while the keyboard is open (flush with keyboard top). */
  flushWhenOpen?: boolean;
  /** Fills the footer chrome including safe-area padding (prevents list bleed-through). */
  barBackgroundColor?: string;
  /** Reports full rendered footer height (content + padding). */
  onChromeLayout?: (event: LayoutChangeEvent) => void;
  dockStyle?: StyleProp<ViewStyle>;
};

/** Bottom chat/composer bar — sticks directly above the keyboard. */
export function KeyboardStickyFooter({
  children,
  style,
  dockStyle,
  safeBottomPadding,
  flushWhenOpen = false,
  barBackgroundColor = '#FFFFFF',
  onChromeLayout,
  ...rest
}: Props) {
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardState((s) => s.isVisible);
  const closedPad = safeBottomPadding ?? insets.bottom + Spacing.sm;
  const openPad = flushWhenOpen ? 0 : Spacing.xs;

  return (
    <KeyboardStickyView
      style={[
        styles.dock,
        { backgroundColor: barBackgroundColor },
        dockStyle,
        style,
      ]}
      offset={{ closed: 0, opened: 0 }}
      {...rest}
    >
      <View
        onLayout={onChromeLayout}
        style={[
          styles.chrome,
          {
            paddingBottom: keyboardVisible ? openPad : closedPad,
            backgroundColor: barBackgroundColor,
          },
        ]}
      >
        {children}
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
    elevation: 20,
  },
  chrome: {
    width: '100%',
  },
});
