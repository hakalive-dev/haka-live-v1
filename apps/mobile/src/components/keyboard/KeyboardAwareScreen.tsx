import React from 'react';
import { StyleSheet, type ViewProps } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';

// `KeyboardAvoidingViewProps` is a discriminated union on `behavior`; destructuring
// then re-spreading it loses the discriminant correlation. This wrapper only ever
// uses the non-'position' behaviors (no `contentContainerStyle`), so we describe the
// props as a single object type built from `ViewProps`.
type Props = ViewProps & {
  behavior?: 'height' | 'padding' | 'translate-with-padding';
  enabled?: boolean;
  keyboardVerticalOffset?: number;
  children: React.ReactNode;
};

/** Full-screen wrapper — keeps focused inputs above the keyboard. */
export function KeyboardAwareScreen({
  children,
  style,
  behavior = 'padding',
  keyboardVerticalOffset = 0,
  ...rest
}: Props) {
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={behavior}
      keyboardVerticalOffset={keyboardVerticalOffset}
      {...rest}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
