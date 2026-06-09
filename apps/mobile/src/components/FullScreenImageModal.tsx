import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '@/theme';

type Props = {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
};

export function FullScreenImageModal({ visible, uri, onClose }: Props) {
  const insets = useSafeAreaInsets();
  if (!uri) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={[styles.closeBtn, { top: insets.top + Spacing.sm }]} onPress={onClose}>
          <Ionicons name="close" size={28} color={Colors.textPrimary} />
        </Pressable>
        <Image source={{ uri }} style={styles.image} contentFit="contain" />
        <Text style={styles.hint}>Pinch to zoom · tap X to close</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtn: {
    position: 'absolute',
    right: Spacing.lg,
    zIndex: 2,
    padding: Spacing.sm,
  },
  image: {
    width: '100%',
    height: '80%',
  },
  hint: {
    position: 'absolute',
    bottom: Spacing.xxl,
    fontSize: 12,
    color: Colors.textTertiary,
  },
});
