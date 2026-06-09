import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface Props {
  name: string;
  eta: string;
}

export function FeaturePlaceholder({ name, eta }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{name}</Text>
      <Text style={styles.eta}>{eta} — not yet built</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    gap: 8,
  },
  label: {
    color: '#FF4444',
    fontSize: 20,
    fontWeight: '600',
  },
  eta: {
    color: '#666',
    fontSize: 14,
  },
});
