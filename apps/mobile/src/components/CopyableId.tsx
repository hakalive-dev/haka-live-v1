import React from 'react';
import { Alert, StyleSheet, Text, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { stripIdLabel } from '@/utils/publicUserId';
import { CopyIcon } from './CopyIcon';

interface Props {
  value: string | null | undefined;
  label?: string;
  textStyle?: TextStyle | TextStyle[];
  iconColor?: string;
  iconSize?: number;
  containerStyle?: ViewStyle | ViewStyle[];
}

export function CopyableId({
  value,
  label = 'ID',
  textStyle,
  iconColor = '#D8D6E1',
  iconSize = 13,
  containerStyle,
}: Props) {
  const stripped = stripIdLabel(value);
  const display = stripped ?? value ?? '------';
  const copyValue = stripped ?? value ?? null;
  const canCopy = !!copyValue;

  return (
    <View style={[styles.row, containerStyle]}>
      <Text style={textStyle}>{label}: {display}</Text>
      {canCopy && (
        <TouchableOpacity
          hitSlop={8}
          style={styles.iconBtn}
          onPress={async () => {
            await Clipboard.setStringAsync(copyValue!);
            Alert.alert('Copied', `${label} copied to clipboard`);
          }}
        >
          <CopyIcon size={iconSize} color={iconColor} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { marginLeft: 6 },
});
