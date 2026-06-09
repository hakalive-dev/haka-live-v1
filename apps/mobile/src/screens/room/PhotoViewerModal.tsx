import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface Props {
  visible: boolean;
  uri: string | null;
  onClose: () => void;
}

export function PhotoViewerModal({ visible, uri, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {uri ? (
          <Pressable style={styles.imageWrap} onPress={() => {}}>
            <Image source={{ uri }} style={styles.image} contentFit="contain" />
          </Pressable>
        ) : null}
        <View style={[styles.closeWrap, { top: insets.top + 12 }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageWrap: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  image: { width: '100%', height: '100%' },
  closeWrap: { position: 'absolute', right: 16 },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
