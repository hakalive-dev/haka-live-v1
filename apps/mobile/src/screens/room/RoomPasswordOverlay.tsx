import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/theme';

const SHEET_BG = '#1A1530';
const DIGIT_COUNT = 6;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 'set' = host setting/changing password, 'enter' = user entering password to join */
  mode: 'set' | 'enter';
  /** Whether a password is already set (enables Delete button in 'set' mode) */
  hasPassword?: boolean;
  onSubmit: (password: string) => void;
  onDelete?: () => void;
  loading?: boolean;
  error?: string | null;
}

export function RoomPasswordOverlay({
  visible,
  onClose,
  mode,
  hasPassword,
  onSubmit,
  onDelete,
  loading,
  error,
}: Props) {
  const [digits, setDigits] = useState<string[]>(Array(DIGIT_COUNT).fill(''));
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    if (visible) {
      setDigits(Array(DIGIT_COUNT).fill(''));
      setTimeout(() => inputRefs.current[0]?.focus(), 200);
    }
  }, [visible]);

  const handleChange = (text: string, index: number) => {
    // Only accept digits
    const digit = text.replace(/[^0-9]/g, '').slice(-1);
    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < DIGIT_COUNT - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyPress = (e: { nativeEvent: { key: string } }, index: number) => {
    if (e.nativeEvent.key === 'Backspace' && !digits[index] && index > 0) {
      const next = [...digits];
      next[index - 1] = '';
      setDigits(next);
      inputRefs.current[index - 1]?.focus();
    }
  };

  const password = digits.join('');
  const isFull = password.length === DIGIT_COUNT;

  const handleSubmit = () => {
    if (!isFull || loading) return;
    onSubmit(password);
  };

  const handleDelete = () => {
    if (loading) return;
    onDelete?.();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.title}>Room Password</Text>
            <View style={{ width: 32 }} />
          </View>

          {/* Subtitle */}
          <Text style={styles.subtitle}>
            {mode === 'set'
              ? 'Set the Room Password'
              : 'Enter the Room Password'}
          </Text>

          {/* 6-digit input boxes */}
          <View style={styles.digitRow}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={(ref) => { inputRefs.current[i] = ref; }}
                style={[styles.digitBox, d ? styles.digitBoxFilled : null]}
                value={d}
                onChangeText={(t) => handleChange(t, i)}
                onKeyPress={(e) => handleKeyPress(e, i)}
                keyboardType="number-pad"
                maxLength={1}
                selectTextOnFocus
                caretHidden
              />
            ))}
          </View>

          {/* Error */}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {/* Action buttons */}
          <TouchableOpacity
            style={[styles.submitBtn, (!isFull || loading) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={!isFull || loading}
            activeOpacity={0.8}
          >
            <Text style={styles.submitText}>
              {loading
                ? 'Saving…'
                : mode === 'set'
                  ? 'Lock room'
                  : 'Enter room'}
            </Text>
          </TouchableOpacity>

          {/* Delete password — only in 'set' mode when password already exists */}
          {mode === 'set' && hasPassword && (
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={handleDelete}
              disabled={loading}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={16} color={Colors.danger} />
              <Text style={styles.deleteText}>Delete password</Text>
            </TouchableOpacity>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  sheet: {
    backgroundColor: SHEET_BG,
    borderRadius: 16,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: Spacing.xl,
  },
  digitRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  digitBox: {
    width: 44,
    height: 52,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  digitBoxFilled: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(123,79,255,0.1)',
  },
  error: {
    color: Colors.danger,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    height: 52,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
  },
  deleteText: {
    color: Colors.danger,
    fontSize: 14,
    fontWeight: '500',
  },
});
