import React from 'react';
import { Alert, Platform, StyleSheet, Text, ToastAndroid, TouchableOpacity, View, ViewStyle } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { StoreItemMedia } from './StoreItemMedia';

const LEVEL_BADGE_SOURCE: Record<string, string> = {
  SSS: 'store/special-ids/SSS.svga',
  SS:  'store/special-ids/SS.svga',
  S:   'store/special-ids/S.svga',
  A:   'store/special-ids/A.svga',
  B:   'store/special-ids/B.svga',
};

interface Props {
  number: string;
  level: string;
  /** Total width of the badge. Height auto-scales at 3:1. Default 120. */
  width?: number;
  style?: ViewStyle;
}

export function SpecialIdBadge({ number, level, width = 120, style }: Props) {
  const height = Math.round(width / 3);
  const source = LEVEL_BADGE_SOURCE[level] ?? LEVEL_BADGE_SOURCE.B;
  // The "ID" emblem occupies ~28% on the left; text area is the remaining right portion.
  const textLeft = Math.round(width * 0.28);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(number);
    if (Platform.OS === 'android') {
      ToastAndroid.show('ID copied', ToastAndroid.SHORT);
    } else {
      Alert.alert('Copied', 'ID copied to clipboard');
    }
  };

  return (
    <TouchableOpacity activeOpacity={0.8} onPress={handleCopy} style={[styles.wrap, { width, height }, style]}>
      <StoreItemMedia source={source} size={width} style={{ width, height }} />
      <Text
        style={[
          styles.number,
          { left: textLeft, lineHeight: height, fontSize: Math.round(width * 0.085) },
        ]}
        numberOfLines={1}
      >
        {number}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
  },
  number: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 4,
    textAlign: 'center',
    textAlignVertical: 'center',
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
