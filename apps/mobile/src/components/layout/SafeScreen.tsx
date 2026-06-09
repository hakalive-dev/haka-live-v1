import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MAIN_TAB_BAR_RESERVE } from '../../constants/layout';

type Edge = 'top' | 'bottom';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  edges?: Edge[];
  reserveTabBar?: boolean;
};

export function SafeScreen({
  children,
  style,
  edges = ['top', 'bottom'],
  reserveTabBar = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const paddingTop = edges.includes('top') ? insets.top : 0;
  const paddingBottom =
    (edges.includes('bottom') ? insets.bottom : 0) +
    (reserveTabBar ? MAIN_TAB_BAR_RESERVE : 0);

  return (
    <View style={[styles.flex, { paddingTop, paddingBottom }, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
