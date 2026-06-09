import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, Radius, Spacing } from '@/theme';

// ── Shared styles / pills ────────────────────────────────────────────────────

const SHEET_BG = '#25203C';
const PILL_BG = 'rgba(255,255,255,0.08)';
const PILL_ACTIVE = '#7B4FFF';

function TimePill({
  label, active, onPress, minWidth = 82,
}: { label: string; active: boolean; onPress: () => void; minWidth?: number }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.pill,
        { backgroundColor: active ? PILL_ACTIVE : PILL_BG, minWidth },
      ]}
    >
      <Text style={styles.pillText}>{label}</Text>
    </TouchableOpacity>
  );
}

// ── Room PK Overlay ─────────────────────────────────────────────────────────

interface RoomPKProps {
  visible: boolean;
  onClose: () => void;
  onRandomMatch: (durationSecs: number) => void;
  onInviteRoom: (durationSecs: number) => void;
  isInQueue?: boolean;
  onCancelQueue?: () => void;
}

const PK_TIMES = [5, 10, 30];

export function RoomPKOverlay({ visible, onClose, onRandomMatch, onInviteRoom, isInQueue, onCancelQueue }: RoomPKProps) {
  const [minutes, setMinutes] = useState(5);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Room PK</Text>
            <View style={styles.titleRight}>
              <Text style={styles.invitation}>⚔️ Invitation</Text>
              <Ionicons name="help-circle-outline" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </View>
          </View>

          <Text style={styles.sectionLabel}>Time</Text>
          <View style={styles.pillRow}>
            {PK_TIMES.map((m) => (
              <TimePill
                key={m}
                label={`${m} mins`}
                active={minutes === m}
                onPress={() => setMinutes(m)}
              />
            ))}
          </View>

          <View style={styles.pkActionRow}>
            <TouchableOpacity onPress={() => onRandomMatch(minutes * 60)} activeOpacity={0.85} style={styles.randomMatchWrap}>
              <LinearGradient
                colors={['#FF3DB4', '#7B4FFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.randomMatchBtn}
              >
                <Text style={styles.randomMatchTitle}>Random Match</Text>
                <Text style={styles.randomMatchSub}>{minutes} min</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity style={styles.inviteRoomBtn} onPress={() => onInviteRoom(minutes * 60)} activeOpacity={0.85}>
              <Text style={styles.inviteRoomText}>Invite a room</Text>
            </TouchableOpacity>
          </View>

          {isInQueue && (
            <View style={styles.queueState}>
              <Text style={styles.queueText}>🔍 Searching for opponent...</Text>
              <TouchableOpacity onPress={onCancelQueue} style={styles.cancelQueueBtn}>
                <Text style={styles.cancelQueueText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Calculator Overlay ──────────────────────────────────────────────────────

interface CalcProps {
  visible: boolean;
  onClose: () => void;
  onStart: (durationSeconds: number | null) => void;
}

const CALC_OPTIONS: { label: string; seconds: number | null }[] = [
  { label: '5mins',   seconds: 300  },
  { label: '15mins',  seconds: 900  },
  { label: '30mins',  seconds: 1800 },
  { label: '∞ time',  seconds: null },
];

function CalculatorRuleView({ onBack }: { onBack: () => void }) {
  return (
    <View>
      <View style={styles.ruleHeader}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.ruleTitle}>Rule</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.ruleCrown}>
        <Ionicons name="trophy" size={48} color="#E8A020" />
      </View>

      <View style={styles.ruleList}>
        {[
          'Calculator will be counted after opening.',
          'Receive gifts on the seat will increase points.',
          'Points will become 0 if close the calculator.',
          'Points will become 0 if the guest left the seat.',
        ].map((rule, i) => (
          <Text key={i} style={styles.ruleItem}>{i + 1}. {rule}</Text>
        ))}
      </View>
    </View>
  );
}

export function CalculatorOverlay({ visible, onClose, onStart }: CalcProps) {
  const [selected, setSelected] = useState<number | null>(300);
  const [showRule, setShowRule] = useState(false);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      onDismiss={() => setShowRule(false)}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          {showRule ? (
            <CalculatorRuleView onBack={() => setShowRule(false)} />
          ) : (
            <>
              <View style={styles.titleRow}>
                <View style={styles.calcTitleLeft}>
                  <LinearGradient colors={['#FF3DB4', '#7B4FFF']} style={styles.calcIcon}>
                    <Ionicons name="flame" size={16} color="#FFFFFF" />
                  </LinearGradient>
                  <Text style={styles.title}>Calculator</Text>
                </View>
                <TouchableOpacity onPress={() => setShowRule(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="help-circle-outline" size={22} color="#FFFFFF" />
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel}>Choose Time</Text>
              <View style={[styles.pillRow, { flexWrap: 'wrap', rowGap: Spacing.sm }]}>
                {CALC_OPTIONS.map((opt) => (
                  <TimePill
                    key={opt.label}
                    label={opt.label}
                    active={selected === opt.seconds}
                    onPress={() => setSelected(opt.seconds)}
                    minWidth={92}
                  />
                ))}
              </View>

              <TouchableOpacity style={styles.startBtn} onPress={() => onStart(selected)}>
                <Text style={styles.startBtnText}>Start</Text>
              </TouchableOpacity>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    backgroundColor: 'transparent',
  },
  card: {
    width: '100%',
    backgroundColor: SHEET_BG,
    borderRadius: 16,
    padding: Spacing.xl,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  titleRight: { flexDirection: 'row', alignItems: 'center' },
  invitation: { color: '#FFFFFF', fontSize: 13 },
  calcTitleLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  calcIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },

  sectionLabel: { fontSize: 14, color: '#FFFFFF', marginBottom: Spacing.md },
  pillRow: { flexDirection: 'row', gap: Spacing.sm, marginBottom: Spacing.xl },
  pill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: 999,
    alignItems: 'center',
  },
  pillText: { color: '#FFFFFF', fontSize: 14, fontWeight: '500' },

  // Room PK actions
  pkActionRow: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  randomMatchWrap: { flex: 1 },
  randomMatchBtn: {
    paddingVertical: 12,
    borderRadius: 999,
    alignItems: 'center',
  },
  randomMatchTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  randomMatchSub: { color: '#FFFFFF', fontSize: 12, opacity: 0.9, marginTop: 2 },
  inviteRoomBtn: {
    flex: 1,
    paddingVertical: 18,
    borderRadius: 999,
    backgroundColor: 'rgba(123,79,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteRoomText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  queueState: { alignItems: 'center', marginTop: Spacing.md, gap: Spacing.xs },
  queueText: { color: Colors.textSecondary, fontSize: 13 },
  cancelQueueBtn: { paddingHorizontal: Spacing.md, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1, borderColor: Colors.danger },
  cancelQueueText: { color: Colors.danger, fontSize: 13, fontWeight: '600' },

  // Calculator
  startBtn: {
    backgroundColor: PILL_ACTIVE,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  startBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },

  // Rule view
  ruleHeader: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    marginBottom: Spacing.lg,
  },
  ruleTitle: { fontSize: 18, fontWeight: '700' as const, color: '#FFFFFF', textAlign: 'center' as const },
  ruleCrown: { alignItems: 'center' as const, marginBottom: Spacing.xl },
  ruleList: { gap: Spacing.md, marginBottom: Spacing.lg },
  ruleItem: { fontSize: 14, color: '#FFFFFF', lineHeight: 20 },
});
