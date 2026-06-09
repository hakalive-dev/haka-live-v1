import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius } from '@/theme';

const TRACK_W = 52;
const TRACK_H = 26;
const THUMB = 22;

type Props = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
};

export function PayrollTakeOrderToggle({ value, onValueChange, disabled }: Props) {
  return (
    <Pressable
      onPress={() => !disabled && onValueChange(!value)}
      style={[styles.track, value ? styles.trackOn : styles.trackOff, disabled && styles.disabled]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={value ? 'Take orders on' : 'Take orders off'}
    >
      <View style={[styles.thumb, value ? styles.thumbOn : styles.thumbOff]} />
      {value ? (
        <Text style={styles.label}>ON</Text>
      ) : (
        <Text style={[styles.label, styles.labelOff]}>OFF</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: Radius.full,
    position: 'relative',
    justifyContent: 'center',
  },
  trackOn: { backgroundColor: Colors.payroll },
  trackOff: { backgroundColor: 'rgba(255,255,255,0.45)' },
  disabled: { opacity: 0.6 },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: Colors.textInverse,
    top: (TRACK_H - THUMB) / 2,
  },
  thumbOn: { right: 2 },
  thumbOff: { left: 2 },
  label: {
    position: 'absolute',
    left: 7,
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textInverse,
    zIndex: 1,
  },
  labelOff: {
    left: undefined,
    right: 6,
  },
});
