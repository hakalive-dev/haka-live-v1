import React, { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius, Spacing } from '@/theme';
import { roomsApi, type RoomStats } from '@api/rooms';
import { UserAvatar } from '@components/UserAvatar';
import type { Room } from '@/types';

interface Props {
  visible: boolean;
  onClose: () => void;
  room: Room;
}

function last5Dates(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < 5; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function RoomDataOverlay({ visible, onClose, room }: Props) {
  const insets = useSafeAreaInsets();
  const DATES = last5Dates();
  const [date, setDate] = useState(DATES[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [stats, setStats] = useState<RoomStats | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancel = false;
    const fetch = () => {
      roomsApi.getStats(room.id, date).then((s) => { if (!cancel) setStats(s); }).catch(() => {});
    };
    fetch();
    // Room stats change slowly; 5s polling was 720 req/hr while open. 15s is
    // plenty for a stats panel and cuts that to 240 req/hr. (Already gated on
    // `visible`, so it only runs while the overlay is open.)
    const id = setInterval(fetch, 15_000);
    return () => { cancel = true; clearInterval(id); };
  }, [visible, room.id, date]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Edit Info</Text>
          <View style={styles.backBtn} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}>
          <View style={styles.roomBar}>
            <UserAvatar
              user={{
                displayName: room.host.displayName,
                avatar: room.host.avatar,
                equippedFrame: room.host.equippedFrame ?? null,
              }}
              size={48}
            />
            <View style={{ flex: 1, marginLeft: Spacing.md }}>
              <Text style={styles.roomTitle} numberOfLines={1}>
                {room.title || room.host.displayName}
              </Text>
              <Text style={styles.roomId}>Room ID: {room.roomCode || room.id.slice(0, 6)}</Text>
            </View>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setPickerOpen((v) => !v)}>
              <Text style={styles.dateText}>{date}</Text>
              <Ionicons name="chevron-down" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {pickerOpen && (
            <View style={styles.datePicker}>
              {DATES.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={styles.dateRow}
                  onPress={() => {
                    setDate(d);
                    setPickerOpen(false);
                  }}
                >
                  <Text style={[styles.dateRowText, d === date && { color: Colors.primary }]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <Section icon="videocam" iconBg="#FF4D7A" title="Live Room">
            <View style={styles.card}>
              <StatRow>
                <Stat label="Live Duration" value={`${stats?.liveDurationMins ?? 0} mins`} />
                <Stat label="Live room (myself)" value={String(stats?.liveRoomMyselfCoins ?? 0)} coin />
              </StatRow>
              <View style={styles.statDivider} />
              <StatRow>
                <Stat label="PK times" value={String(stats?.pkTimes ?? 0)} />
                <View style={{ flex: 1 }} />
              </StatRow>
            </View>
          </Section>

          <Section icon="chatbubble-ellipses" iconBg="#F5C842" title="Chat Room">
            <View style={styles.card}>
              <StatRow>
                <Stat label="Mic Duration" value={`${stats?.micDurationMins ?? 0} mins`} />
                <Stat label="Chat room gift (room)" value={String(stats?.chatRoomGiftCoins ?? 0)} coin />
              </StatRow>
              <View style={styles.statDivider} />
              <StatRow>
                <Stat label="Chat room (myself)" value={String(stats?.chatRoomMyselfMessages ?? 0)} />
                <View style={{ flex: 1 }} />
              </StatRow>
            </View>
          </Section>
        </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Section({
  icon, iconBg, title, children,
}: { icon: keyof typeof Ionicons.glyphMap; iconBg: string; title: string; children: React.ReactNode }) {
  return (
    <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.lg }}>
      <View style={styles.sectionHeader}>
        <View style={[styles.sectionIcon, { backgroundColor: iconBg }]}>
          <Ionicons name={icon} size={14} color="#FFFFFF" />
        </View>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function StatRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.statRow}>{children}</View>;
}

function Stat({ label, value, coin }: { label: string; value: string; coin?: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statValRow}>
        {coin && <View style={styles.coinDot} />}
        <Text style={styles.statValue}>{value}</Text>
      </View>
    </View>
  );
}

const BG = '#1A1530';

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: BG,
    borderTopLeftRadius: 16, borderTopRightRadius: 16,
    height: '55%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingTop: Spacing.md, paddingBottom: Spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },

  roomBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginHorizontal: Spacing.lg, padding: Spacing.md, borderRadius: Radius.md,
  },
  roomAvatar: { width: 44, height: 44, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.08)' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  roomTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  roomId: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },

  datePicker: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginHorizontal: Spacing.lg, marginTop: Spacing.xs,
    borderRadius: Radius.md, overflow: 'hidden',
  },
  dateRow: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  dateRowText: { color: '#FFFFFF', fontSize: 13 },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  sectionIcon: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  card: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.md,
    padding: Spacing.md,
  },
  statRow: { flexDirection: 'row', gap: Spacing.md },
  statDivider: { height: Spacing.md },
  statLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  statValRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  statValue: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  coinDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: Colors.coin,
    borderWidth: 2, borderColor: '#FF7A3D',
  },
});
