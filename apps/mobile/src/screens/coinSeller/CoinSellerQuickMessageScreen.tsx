import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { coinSellerApi } from '@api/coinSeller';
import { Colors, Radius, Spacing } from '@/theme';
import { DetailSkeleton } from '@components/Skeleton';
import { KeyboardAwareScreen } from '@components/keyboard';
import type { RootStackScreenProps } from '@navigation/types';

type Props = RootStackScreenProps<'CoinSellerQuickMessage'>;

export function CoinSellerQuickMessageScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await coinSellerApi.getQuickMessage();
      setMessage(data.quick_message);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await coinSellerApi.updateQuickMessage(message);
      Alert.alert('Success', 'Quick message updated.');
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <DetailSkeleton />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="chevron-back" size={24} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Quick Messages</Text>
        <TouchableOpacity onPress={handleSubmit} disabled={saving} hitSlop={8}>
          <Text style={[styles.submitText, saving && styles.submitTextDisabled]}>Submit</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAwareScreen style={styles.content}>
        <Text style={styles.label}>* Selling price of coins</Text>

        <TextInput
          style={styles.input}
          multiline
          placeholder="Please Enter message"
          placeholderTextColor="#999"
          value={message}
          onChangeText={setMessage}
          maxLength={100}
          textAlignVertical="top"
        />

        <Text style={styles.charCount}>{message.length}/100</Text>
      </KeyboardAwareScreen>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600', color: '#000' },
  submitText: { fontSize: 15, fontWeight: '600', color: Colors.primary },
  submitTextDisabled: { opacity: 0.5 },

  content: { paddingHorizontal: Spacing.lg, marginTop: Spacing.lg },
  label: { fontSize: 14, fontWeight: '500', color: '#FF4444', marginBottom: Spacing.md },

  input: {
    height: 150,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: Radius.md,
    padding: Spacing.md,
    fontSize: 14,
    color: '#000',
  },

  charCount: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
    marginTop: Spacing.xs,
  },
});
