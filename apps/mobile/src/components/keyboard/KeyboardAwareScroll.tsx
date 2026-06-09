import React from 'react';
import { StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  KeyboardAwareScrollView,
  type KeyboardAwareScrollViewProps,
} from 'react-native-keyboard-controller';

import { Spacing } from '@/theme';

type Props = KeyboardAwareScrollViewProps;

/** Scrollable forms — auto-scrolls focused `TextInput` above the keyboard. */
export function KeyboardAwareScroll({
  children,
  bottomOffset,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  showsVerticalScrollIndicator = false,
  style,
  ...rest
}: Props) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAwareScrollView
      bottomOffset={bottomOffset ?? insets.bottom + Spacing.lg}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      contentContainerStyle={contentContainerStyle}
      style={[styles.flex, style]}
      {...rest}
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
