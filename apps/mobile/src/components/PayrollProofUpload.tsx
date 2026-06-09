import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/theme';

type Props = {
  proofUri: string | null;
  onPick: () => void;
  onView: () => void;
  fullWidth?: boolean;
};

export function PayrollProofUpload({ proofUri, onPick, onView, fullWidth = false }: Props) {
  return (
    <View style={[styles.box, fullWidth && styles.boxFullWidth]}>
      {proofUri ? (
        <>
          <TouchableOpacity activeOpacity={0.9} onPress={onView}>
            <Image
              source={{ uri: proofUri }}
              style={[styles.thumb, fullWidth && styles.thumbFullWidth]}
              contentFit="cover"
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={onView} hitSlop={6}>
            <Text style={styles.viewLink}>View photo</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onPick} hitSlop={6}>
            <Text style={styles.changeLink}>Change</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={styles.empty} onPress={onPick} activeOpacity={0.8}>
          <Ionicons name="image-outline" size={28} color={Colors.textTertiary} />
          <Text style={styles.uploadLabel}>Upload Payment Proof</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const PROOF_WIDTH = 108;

const styles = StyleSheet.create({
  box: {
    width: PROOF_WIDTH,
    minHeight: 88,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.sm,
    backgroundColor: '#F0F0F4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  boxFullWidth: {
    width: '100%',
    minHeight: 120,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.sm,
    width: '100%',
  },
  thumb: {
    width: PROOF_WIDTH - 16,
    height: 56,
    borderRadius: Radius.xs,
  },
  thumbFullWidth: {
    width: '100%',
    height: 140,
    borderRadius: Radius.sm,
  },
  uploadLabel: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 4,
    textAlign: 'center',
  },
  viewLink: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.payroll,
    marginTop: 4,
  },
  changeLink: {
    fontSize: 10,
    color: Colors.textTertiary,
    marginTop: 2,
  },
});
