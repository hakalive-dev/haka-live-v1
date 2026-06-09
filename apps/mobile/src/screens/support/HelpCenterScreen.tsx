import React, { useEffect, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScroll, KeyboardStickyFooter } from '@components/keyboard';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useSelector } from 'react-redux';
import { Colors, Radius, Spacing } from '@/theme';
import { RootState } from '../../store';
import { supportApi, SupportTicket } from '../../api/support';
import type { RootStackScreenProps } from '../../navigation/types';

const MAX_DESCRIPTION = 250;

export function HelpCenterScreen({ navigation }: RootStackScreenProps<'HelpCenter'>) {
  const insets = useSafeAreaInsets();
  const user = useSelector((s: RootState) => s.auth.user);
  const supportTicketReplyAt = useSelector((s: RootState) => s.auth.lastSupportTicketReplyAt);

  const [description, setDescription] = useState('');
  const [screenshots, setScreenshots] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // ── Tabs ──────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'submit' | 'history'>('submit');
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await supportApi.getMyTickets();
      setTickets(data.items);
    } catch {}
    setHistoryLoading(false);
  };

  useEffect(() => {
    if (tab === 'history' && supportTicketReplyAt) {
      void loadHistory();
    }
  }, [supportTicketReplyAt, tab]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      setScreenshots((prev) => [...prev, result.assets[0].uri]);
    }
  };

  const removeScreenshot = (index: number) => {
    setScreenshots((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!description.trim()) {
      Alert.alert('Required', 'Please describe your issue.');
      return;
    }
    setSubmitting(true);
    try {
      const screenshotUrls: string[] = [];
      for (const uri of screenshots) {
        try {
          screenshotUrls.push(await supportApi.uploadScreenshot(uri));
        } catch {
          // Skip failed upload; continue with others
        }
      }
      await supportApi.createTicket(description.trim(), screenshotUrls);
      Alert.alert('Submitted', 'Your report has been sent. We will review it shortly.');
      setDescription('');
      setScreenshots([]);
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'Failed to submit. Please try again.');
    }
    setSubmitting(false);
  };

  const statusColor = (status: string) => {
    if (status === 'replied') return '#22C97A';
    if (status === 'closed') return '#999';
    return '#E8A020';
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contact customer service</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tab, tab === 'submit' && styles.tabActive]}
          onPress={() => setTab('submit')}
        >
          <Text style={[styles.tabText, tab === 'submit' && styles.tabTextActive]}>Submit</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, tab === 'history' && styles.tabActive]}
          onPress={() => { setTab('history'); loadHistory(); }}
        >
          <Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>History</Text>
        </Pressable>
      </View>

      {tab === 'submit' ? (
        <View style={styles.flex}>
          <KeyboardAwareScroll
            style={styles.flex}
            contentContainerStyle={styles.formContent}
            bottomOffset={insets.bottom + 80}
          >
            {/* Label */}
            <Text style={styles.label}>
              <Text style={styles.required}>*</Text>Please describe your issue
            </Text>

            {/* Description input */}
            <View style={styles.inputCard}>
              <TextInput
                style={styles.textArea}
                placeholder="Please describe your problem in the detail so that we can help you ASAP."
                placeholderTextColor="#AAAAAA"
                multiline
                maxLength={MAX_DESCRIPTION}
                value={description}
                onChangeText={setDescription}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{description.length}/{MAX_DESCRIPTION}</Text>
            </View>

            {/* Screenshot picker */}
            <View style={styles.screenshotRow}>
              {screenshots.map((uri, i) => (
                <View key={i} style={styles.screenshotThumb}>
                  <Image source={{ uri }} style={styles.screenshotImage} />
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removeScreenshot(i)}
                  >
                    <Ionicons name="close-circle" size={20} color={Colors.danger} />
                  </TouchableOpacity>
                </View>
              ))}
              {screenshots.length < 3 && (
                <TouchableOpacity style={styles.addScreenshot} onPress={pickImage}>
                  <Ionicons name="image-outline" size={28} color="#999" />
                </TouchableOpacity>
              )}
            </View>

            {/* Helper text */}
            <Text style={styles.helperText}>
              If you have photos/videos, Please provide it us so that we can assist better on your problems.
            </Text>
          </KeyboardAwareScroll>

          <KeyboardStickyFooter safeBottomPadding={insets.bottom + Spacing.md}>
            <TouchableOpacity
              style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
            >
              <Text style={styles.submitText}>{submitting ? 'Submitting...' : 'Submit'}</Text>
            </TouchableOpacity>
          </KeyboardStickyFooter>
        </View>
      ) : (
        /* History tab */
        <FlatList
          data={tickets}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.historyContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="chatbubble-ellipses-outline" size={48} color="#CCC" />
              <Text style={styles.emptyText}>
                {historyLoading ? 'Loading...' : 'No tickets yet'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.ticketCard}>
              <View style={styles.ticketHeader}>
                <View style={[styles.statusBadge, { backgroundColor: statusColor(item.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: statusColor(item.status) }]}>
                    {item.status}
                  </Text>
                </View>
                <Text style={styles.ticketDate}>
                  {new Date(item.createdAt).toLocaleDateString()}
                </Text>
              </View>
              <Text style={styles.ticketDesc} numberOfLines={3}>{item.description}</Text>
              {item.adminReply ? (
                <View style={styles.replyBox}>
                  <Text style={styles.replyLabel}>Admin Reply:</Text>
                  <Text style={styles.replyText}>{item.adminReply}</Text>
                </View>
              ) : null}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    height: 52,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
    marginHorizontal: Spacing.lg,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#999',
  },
  tabTextActive: {
    color: Colors.primary,
    fontWeight: '600',
  },
  formContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: Spacing.sm,
  },
  required: {
    color: Colors.danger,
    fontWeight: '700',
  },
  inputCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: Radius.md,
    padding: Spacing.md,
    minHeight: 140,
    marginBottom: Spacing.lg,
  },
  textArea: {
    fontSize: 14,
    color: '#1A1A1A',
    flex: 1,
    minHeight: 100,
  },
  charCount: {
    fontSize: 12,
    color: '#AAAAAA',
    textAlign: 'right',
  },
  screenshotRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  screenshotThumb: {
    width: 90,
    height: 90,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  screenshotImage: {
    width: '100%',
    height: '100%',
  },
  removeBtn: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  addScreenshot: {
    width: 90,
    height: 90,
    borderRadius: Radius.sm,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helperText: {
    fontSize: 13,
    color: '#999',
    lineHeight: 18,
  },
  bottomBar: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    height: 52,
    borderRadius: Radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.5,
  },
  submitText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  historyContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    gap: Spacing.md,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  ticketCard: {
    backgroundColor: '#F8F8F8',
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.md,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  ticketDate: {
    fontSize: 12,
    color: '#999',
  },
  ticketDesc: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  replyBox: {
    marginTop: Spacing.sm,
    backgroundColor: '#FFFFFF',
    borderRadius: Radius.sm,
    padding: Spacing.sm,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  replyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 4,
  },
  replyText: {
    fontSize: 13,
    color: '#333',
    lineHeight: 18,
  },
});
