import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Spacing } from '@/theme';

// ── Image assets (drop PNGs into apps/mobile/assets/room-games/) ────────────
// Expected files: lucky_wheel.png, ocean_hunt.png, jungle_slot.png,
// queens.png, ludo.png, forest_party.png, jungle_slot_2.png, win_go.png,
// royal_battle.png, bounty_racer.png, lion_vs_tiger.png — 64×64 @1x.

const gameIcons: Record<string, number | null> = {
  'lucky-wheel':   null,
  'ocean-hunt':    null,
  'jungle-slot':   null,
  'queens':        null,
  'ludo':          null,
  'forest-party':  null,
  'jungle-slot-2': null,
  'win-go':        null,
  'royal-battle':  null,
  'bounty-racer':  null,
  'lion-vs-tiger': null,
};

// Uncomment after adding the image files.
// gameIcons['lucky-wheel']   = require('../../../assets/room-games/lucky_wheel.png');
// gameIcons['ocean-hunt']    = require('../../../assets/room-games/ocean_hunt.png');
// gameIcons['jungle-slot']   = require('../../../assets/room-games/jungle_slot.png');
// gameIcons['queens']        = require('../../../assets/room-games/queens.png');
// gameIcons['ludo']          = require('../../../assets/room-games/ludo.png');
// gameIcons['forest-party']  = require('../../../assets/room-games/forest_party.png');
// gameIcons['jungle-slot-2'] = require('../../../assets/room-games/jungle_slot_2.png');
// gameIcons['win-go']        = require('../../../assets/room-games/win_go.png');
// gameIcons['royal-battle']  = require('../../../assets/room-games/royal_battle.png');
// gameIcons['bounty-racer']  = require('../../../assets/room-games/bounty_racer.png');
// gameIcons['lion-vs-tiger'] = require('../../../assets/room-games/lion_vs_tiger.png');

type GameKey = keyof typeof gameIcons;

const GAMES: { key: GameKey; label: string; fallbackEmoji: string }[] = [
  { key: 'lucky-wheel',   label: 'Lucky wheel',   fallbackEmoji: '🎡' },
  { key: 'ocean-hunt',    label: 'Ocean hunt',    fallbackEmoji: '🌊' },
  { key: 'jungle-slot',   label: 'Jungle Slot',   fallbackEmoji: '🎰' },
  { key: 'queens',        label: 'Queens ...',    fallbackEmoji: '♛' },
  { key: 'ludo',          label: 'Ludo',          fallbackEmoji: '🎲' },
  { key: 'forest-party',  label: 'Forest Party',  fallbackEmoji: '🎉' },
  { key: 'jungle-slot-2', label: 'Jungle Slot',   fallbackEmoji: '🦈' },
  { key: 'win-go',        label: 'Win Go',        fallbackEmoji: '🎲' },
  { key: 'royal-battle',  label: 'Royal Battle',  fallbackEmoji: '👑' },
  { key: 'bounty-racer',  label: 'Bounty Racer',  fallbackEmoji: '🏁' },
  { key: 'lion-vs-tiger', label: 'Lion Vs Tiger', fallbackEmoji: '🦁' },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onStart: (key: GameKey) => void;
  onShare?: () => void;
}

export function RoomGamesOverlay({ visible, onClose, onStart, onShare }: Props) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<GameKey>('lucky-wheel');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.xxl }]} onPress={() => {}}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Games</Text>
            <TouchableOpacity style={styles.shareRow} onPress={onShare}>
              <Ionicons name="arrow-redo-outline" size={18} color="#FFFFFF" />
              <Text style={styles.shareText}>Share</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.grid}>
              {GAMES.map((g) => {
                const active = selected === g.key;
                return (
                  <TouchableOpacity
                    key={g.key}
                    style={styles.item}
                    activeOpacity={0.85}
                    onPress={() => setSelected(g.key)}
                  >
                    <View style={[styles.tile, active && styles.tileActive]}>
                      {gameIcons[g.key] ? (
                        <Image
                          source={gameIcons[g.key]!}
                          style={styles.tileIcon}
                          contentFit="contain"
                        />
                      ) : (
                        <Text style={styles.tileEmoji}>{g.fallbackEmoji}</Text>
                      )}
                    </View>
                    <Text style={styles.label} numberOfLines={1}>{g.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const TILE_BG = 'rgba(255,255,255,0.06)';
const TILE_BORDER = 'rgba(255,255,255,0.08)';

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#25203C',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    maxHeight: '85%',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  shareRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shareText: { color: '#FFFFFF', fontSize: 14 },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  item: {
    width: '25%',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  tile: {
    width: 68,
    height: 68,
    borderRadius: 14,
    backgroundColor: TILE_BG,
    borderWidth: 1,
    borderColor: TILE_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  tileActive: {
    borderColor: '#7B4FFF',
    backgroundColor: 'rgba(123,79,255,0.18)',
  },
  tileIcon: { width: 48, height: 48, borderRadius: 10 },
  tileEmoji: { fontSize: 32 },
  label: { color: '#FFFFFF', fontSize: 12, textAlign: 'center' },

  startBtn: {
    backgroundColor: '#7B4FFF',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  startText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
