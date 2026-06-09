import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { chatApi } from '@api/chat';
import { Colors, Radius, Spacing } from '@/theme';
import { useToast } from '@components/Toast';
import type { DirectMessage } from '@/types';

interface Asset {
  uri: string;
  width: number;
  height: number;
  mimeType?: string;
  fileName?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSent?: (msg: DirectMessage) => void;
  asset: Asset | null;
  userId: string;
}

const MAX_WIDTH = 1600;
const PREVIEW_MAX_HEIGHT = 220;

export function DMPhotoShareOverlay({ visible, onClose, onSent, asset, userId }: Props) {
  const toast = useToast();
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);

  const previewRatio = asset ? asset.width / asset.height : 1;
  const previewHeight = PREVIEW_MAX_HEIGHT;
  const previewWidth = previewHeight * previewRatio;

  const handleClose = () => {
    if (sending) return;
    setCaption('');
    onClose();
  };

  const handleSend = async () => {
    if (!asset || sending) return;
    setSending(true);
    try {
      const manipulated = await ImageManipulator.manipulateAsync(
        asset.uri,
        asset.width > MAX_WIDTH ? [{ resize: { width: MAX_WIDTH } }] : [],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );

      const dm = await chatApi.sendDMImage(userId, {
        fileUri: manipulated.uri,
        mimeType: 'image/jpeg',
        fileName: `photo-${Date.now()}.jpg`,
        caption: caption.trim() || undefined,
      });

      setCaption('');
      onClose();
      onSent?.(dm);
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Failed to send photo';
      toast.show(msg, 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.title}>Share Photo</Text>

          {asset ? (
            <View style={styles.previewWrap}>
              <Image
                source={{ uri: asset.uri }}
                style={{ width: previewWidth, height: previewHeight, borderRadius: Radius.md }}
                contentFit="contain"
              />
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Add a comment…"
            placeholderTextColor={Colors.textSecondary}
            value={caption}
            onChangeText={setCaption}
            maxLength={500}
            editable={!sending}
          />

          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={handleClose} disabled={sending}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending}>
              {sending ? (
                <ActivityIndicator color={Colors.textInverse} />
              ) : (
                <Text style={styles.sendText}>Send</Text>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  previewWrap: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  input: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.textPrimary,
    marginBottom: Spacing.lg,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  cancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  sendBtn: {
    flex: 1,
    height: 48,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: Colors.textInverse, fontSize: 15, fontWeight: '600' },
});
