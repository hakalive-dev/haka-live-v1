import React from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { Spacing } from '@/theme';
import PkIcon from '../../../assets/room-toolbar/pk.svg';
import BattleIcon from '../../../assets/room-toolbar/battle.svg';
import LuckyBagIcon from '../../../assets/room-toolbar/lucky-bag.svg';

// ── Image assets (drop PNGs into apps/mobile/assets/room-play/) ─────────────
// Expected files: room-pk.png, battle.png, calculator.png,
// lucky-bag.png — each exported 76×76 @1x (@2x/@3x auto-resolve).

const playIcons = {
  'room-pk':    null as number | null,
  'battle':     null as number | null,
  'calculator': null as number | null,
  'lucky-bag':  null as number | null,
};

// Uncomment the requires after adding the image files.
playIcons['room-pk']    = require('../../../assets/room-play/room_pk.png');
playIcons['battle']     = require('../../../assets/room-play/battle.png');
playIcons['calculator'] = require('../../../assets/room-play/calculator.png');
playIcons['lucky-bag']  = require('../../../assets/room-play/lucky_bag.png');

type PlayKey = keyof typeof playIcons;

interface Props {
  visible: boolean;
  onClose: () => void;
  onAction: (key: string) => void;
  isHost: boolean;
  isHostOrAdmin: boolean;
  /** Listener has a queued seat application — show Applyer tool to open overlay / cancel. */
  hasPendingSeatApplication?: boolean;
  toolStates: Partial<Record<string, boolean>>;
}

// Each play-icon SVG has its own viewBox aspect (battle 71×107 is tall,
// calculator 76×76 is square, game 24×19 is wide). Normalizing by the
// longer side alone still leaves tall icons visibly smaller because their
// total visual area is less. We normalize by **area** instead — each icon
// renders at W × H ≈ TARGET², so they all occupy the same on-screen space
// while keeping their native aspect.
const PLAY_ICON_TARGET = 52;

const TOOL_CIRCLE_GRADIENT_START = { x: 0.9841828847, y: 0.3752324797 } as const;
const TOOL_CIRCLE_GRADIENT_END = { x: 0.0158171153, y: 0.6247675203 } as const;
const TOOL_CIRCLE_GRADIENT_COLORS = [
  'rgba(57, 196, 11, 0.126)',
  'rgba(255, 255, 255, 0.0468)',
] as const;

function fitPlayIcon(naturalW: number, naturalH: number, scale = 1) {
  const aspect = naturalW / naturalH;
  const k = Math.sqrt(aspect);
  return {
    width: PLAY_ICON_TARGET * k * scale,
    height: PLAY_ICON_TARGET / k * scale,
  };
}

const PLAY_ITEMS: {
  key: PlayKey;
  label: string;
  fallbackEmoji: string;
  natW: number;
  natH: number;
  // Optional per-icon dampener. Use when an SVG's artwork fills its viewBox
  // tightly and area-based sizing makes it visually larger than peers —
  // e.g. the game controller (game.svg has zero internal padding).
  scale?: number;
  svg?: React.ComponentType<{ width?: number; height?: number }>;
  hidden?: boolean;
  hostOnly?: boolean;
  adminOnly?: boolean;
  isToggle?: boolean;
}[] = [
  { key: 'room-pk',    label: 'Room PK',    fallbackEmoji: '⚔️', natW: 177, natH: 205, svg: PkIcon,        hidden: true },
  { key: 'battle',     label: 'Battle',     fallbackEmoji: '🏆', natW: 71,  natH: 107, svg: BattleIcon,    hidden: true },
  { key: 'calculator', label: 'Calculator', fallbackEmoji: '🔥', natW: 76,  natH: 76,  adminOnly: true, isToggle: true },
];

const VoiceIconPng = require('../../../assets/room-toolbar/voice.png');
const GiftEffectsIconPng = require('../../../assets/room-toolbar/gift.png');
const ApplyerIconPng = require('../../../assets/room-toolbar/applyer.png');
const CleanIconPng = require('../../../assets/room-toolbar/clean.png');
const PublicMsgIconPng = require('../../../assets/room-toolbar/public_msg.png');
const MusicIconPng = require('../../../assets/room-toolbar/music.png');
const PhotoIconPng = require('../../../assets/room-toolbar/photo.png');
const CallIconPng = require('../../../assets/room-toolbar/call.png');
const MessageIconPng = require('../../../assets/room-toolbar/message.png');
const ShareIconPng = require('../../../assets/room-toolbar/share.png');
const RoomDataIconPng = require('../../../assets/room-toolbar/room_data.png');
const SettingIconPng = require('../../../assets/room-toolbar/setting.png');

const TOOLS: {
  key: string;
  label: string;
  image: number;
  hostOnly?: boolean;
  adminOnly?: boolean;
  isToggle?: boolean;
}[] = [
  { key: 'voice',     label: 'Voice On',     image: VoiceIconPng,       isToggle: true },
  { key: 'effects',   label: 'Gift Effects', image: GiftEffectsIconPng, isToggle: true },
  { key: 'applyer',   label: 'Applyer',      image: ApplyerIconPng },
  { key: 'clean',     label: 'Clean',        image: CleanIconPng,       hostOnly: true },
  { key: 'publicmsg', label: 'Public Msg',   image: PublicMsgIconPng,   hostOnly: true, isToggle: true },
  { key: 'music',     label: 'Music',        image: MusicIconPng,       adminOnly: true },
  { key: 'photo',     label: 'Photo',        image: PhotoIconPng },
  { key: 'call',      label: 'Call',         image: CallIconPng,        isToggle: true },
  { key: 'share',     label: 'Share',        image: ShareIconPng },
  { key: 'room_data', label: 'Room Data',    image: RoomDataIconPng,    adminOnly: true },
  { key: 'setting',   label: 'Setting',      image: SettingIconPng,     adminOnly: true },
];

export function RoomPlayOverlay({
  visible,
  onClose,
  onAction,
  isHost,
  isHostOrAdmin,
  hasPendingSeatApplication = false,
  toolStates,
}: Props) {
  const insets = useSafeAreaInsets();
  const tools = TOOLS.filter((t) => {
    if (t.key === 'applyer') {
      return isHostOrAdmin || hasPendingSeatApplication;
    }
    if (t.hostOnly) return isHost;
    if (t.adminOnly) return isHostOrAdmin;
    return true;
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.xxl }]} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <Text style={styles.title}>Room Play</Text>

            {/* Play grid — visible items only; hidden items keep their onAction wiring */}
            <View style={styles.playGrid}>
              {PLAY_ITEMS.filter((p) => {
                if (p.hidden) return false;
                if (p.hostOnly) return isHost;
                if (p.adminOnly) return isHostOrAdmin;
                return true;
              }).map((p) => {
                const dims = fitPlayIcon(p.natW, p.natH, p.scale);
                const active = p.isToggle ? (toolStates[p.key] ?? false) : true;
                return (
                  <TouchableOpacity
                    key={p.key}
                    style={styles.playItem}
                    onPress={() => onAction(p.key)}
                  >
                    <View style={[styles.playIconBox, p.isToggle && !active && styles.playIconBoxOff]}>
                      {p.svg ? (
                        <p.svg width={dims.width} height={dims.height} />
                      ) : playIcons[p.key] ? (
                        <Image
                          source={playIcons[p.key]!}
                          style={dims}
                          contentFit="contain"
                        />
                      ) : (
                        <Text style={styles.playEmoji}>{p.fallbackEmoji}</Text>
                      )}
                      {p.isToggle && (
                        <View style={[
                          styles.toggleSwitch,
                          active ? styles.toggleSwitchOn : styles.toggleSwitchOff,
                        ]}>
                          <View style={styles.toggleKnob} />
                        </View>
                      )}
                    </View>
                    <Text style={[styles.itemLabel, p.isToggle && !active && styles.itemLabelOff]}>
                      {p.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Lucky Bag — hidden but onAction('lucky-bag') remains wired */}

            {/* Tools */}
            <Text style={styles.sectionLabel}>Tools</Text>
            <View style={styles.toolsGrid}>
              {tools.map((t) => {
                const active = t.isToggle ? (toolStates[t.key] ?? true) : true;
                const isRawToolIcon =
                  t.key === 'share' ||
                  t.key === 'photo' ||
                  t.key === 'music' ||
                  t.key === 'clean' ||
                  t.key === 'room_data' ||
                  t.key === 'setting';
                return (
                  <TouchableOpacity
                    key={t.key}
                    style={styles.toolItem}
                    onPress={() => onAction(t.key)}
                  >
                    <View style={styles.toolIconCircleWrap}>
                      {isRawToolIcon ? (
                        <Image
                          source={t.image}
                          style={styles.toolIconRawImage}
                          contentFit="contain"
                        />
                      ) : (
                        <LinearGradient
                          colors={[...TOOL_CIRCLE_GRADIENT_COLORS]}
                          start={TOOL_CIRCLE_GRADIENT_START}
                          end={TOOL_CIRCLE_GRADIENT_END}
                          style={[
                            styles.toolIconSvgBox,
                            t.isToggle && !active && styles.toolIconSvgBoxOff,
                          ]}
                        >
                          <View style={styles.toolIconAnchor}>
                            <Image
                              source={t.image}
                              style={styles.toolIconImage}
                              contentFit="contain"
                            />
                            {t.isToggle && (
                              <View style={[
                                styles.toggleSwitch,
                                active ? styles.toggleSwitchOn : styles.toggleSwitchOff,
                              ]}>
                                <View style={styles.toggleKnob} />
                              </View>
                            )}
                          </View>
                        </LinearGradient>
                      )}
                    </View>
                    <Text style={[styles.itemLabel, t.isToggle && !active && styles.itemLabelOff]}>
                      {t.label}
                    </Text>
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#25203C',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    maxHeight: '85%',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: Spacing.lg,
  },
  playGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  playItem: {
    width: 64,
    alignItems: 'center',
  },
  playIconBox: {
    width: 64,
    height: 68,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  playIconBoxOff: {
    opacity: 0.45,
  },
  playEmoji: { fontSize: 30 },
  itemLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
  },
  toolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  toolItem: {
    width: '25%',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  toolIconSvgBox: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: 'rgba(217, 217, 217, 0.27)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolIconAnchor: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  toolIconImage: {
    width: 34,
    height: 34,
  },
  toolIconRawImage: {
    width: 64,
    height: 64,
  },
  toolIconSvgBoxOff: {
    opacity: 0.45,
  },
  itemLabelOff: {
    color: 'rgba(255,255,255,0.4)',
  },
  toolIconCircleWrap: {
    position: 'relative',
    marginBottom: 6,
  },
  toggleSwitch: {
    position: 'absolute',
    bottom: -1,
    right: -5,
    width: 18,
    height: 10,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#25203C',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 1.5,
  },
  toggleSwitchOn: {
    backgroundColor: '#4CAF50',
    justifyContent: 'flex-end',
  },
  toggleSwitchOff: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'flex-start',
  },
  toggleKnob: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
});
