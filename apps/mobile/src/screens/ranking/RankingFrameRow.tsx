import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

import { UserAvatar } from '@components/UserAvatar';
import { RICH, CHARM } from '@screens/level/LevelScreen';
import { Colors, Spacing, Radius } from '@/theme';
import type { LeaderboardUserEntry } from '@/types';

export const RANKING_ROW_NATIVE_W = 350;
export const RANKING_ROW_NATIVE_H = 80;
/** Matches rounded corners baked into row PNGs — clips non-transparent black corner padding. */
export const RANKING_ROW_CORNER_RADIUS = 10;

export const RANKING_ROWS = {
  1: require('../../../assets/ranking/rows/row-1st.png'),
  2: require('../../../assets/ranking/rows/row-2nd.png'),
  3: require('../../../assets/ranking/rows/row-3rd.png'),
} as const;

export const RANKING_ROW_4TH = require('../../../assets/ranking/rows/row-4th-bg.png');

const PROFILE_FRAMES = {
  1: require('../../../assets/ranking/agent/profile-frame-1st.png'),
  2: require('../../../assets/ranking/agent/profile-frame-2nd.png'),
  3: require('../../../assets/ranking/agent/profile-frame-3rd.png'),
} as const;

const DIAMOND_ICON = require('../../../assets/ranking/game/diamond.png');
const RING_REWARD_ICON = require('../../../assets/ranking/game/ring-reward.png');
const BEAN_ICON = require('../../../assets/bean.png');
const COIN_ICON = require('../../../assets/ranking/coin.png');

const REWARD_VALUE_COLOR = '#C5E866';

const PROFILE_FRAME_NATIVE = {
  1: { w: 62, h: 66 },
  2: { w: 62, h: 71 },
  3: { w: 60, h: 67 },
} as const;

const PROFILE_FRAME_AVATAR = {
  1: { d: 46, offsetX: 0, offsetY: 1.0 },
  2: { d: 46, offsetX: 0, offsetY: 0.5 },
  3: { d: 45, offsetX: 0, offsetY: 1.0 },
} as const;

export type RankingFrameRowVariant = 'game' | 'activity';

function formatNum(n: number): string {
  return n.toLocaleString();
}

export function rowHeight(displayW: number): number {
  return Math.round((RANKING_ROW_NATIVE_H / RANKING_ROW_NATIVE_W) * displayW);
}

export function rowCornerRadius(displayW: number): number {
  return Math.round(RANKING_ROW_CORNER_RADIUS * (displayW / RANKING_ROW_NATIVE_W));
}

function rowFaceSize(displayW: number): number {
  const rowScale = displayW / RANKING_ROW_NATIVE_W;
  return Math.round(PROFILE_FRAME_AVATAR[1].d * rowScale);
}

function rankZoneWidth(displayW: number): number {
  return Math.round(displayW * 0.115);
}

function avatarMetrics(entry: LeaderboardUserEntry, displayW: number) {
  const isTop3 = entry.rank >= 1 && entry.rank <= 3;
  const rowScale = displayW / RANKING_ROW_NATIVE_W;

  if (isTop3) {
    const rank = entry.rank as 1 | 2 | 3;
    const native = PROFILE_FRAME_NATIVE[rank];
    const layout = PROFILE_FRAME_AVATAR[rank];
    const frameW = Math.round(native.w * rowScale);
    const frameH = Math.round(native.h * rowScale);
    const avatarSize = Math.round(frameW * (layout.d / native.w));
    return {
      isTop3: true,
      avatarSize,
      avatarOffsetX: layout.offsetX * rowScale,
      avatarOffsetY: layout.offsetY * rowScale,
      frameW,
      frameH,
      frameSource: PROFILE_FRAMES[rank],
    };
  }

  const faceSize = rowFaceSize(displayW);
  return {
    isTop3: false,
    avatarSize: faceSize,
    avatarOffsetX: 0,
    avatarOffsetY: 0,
    frameW: faceSize,
    frameH: faceSize,
    frameSource: null as null,
  };
}

type Props = {
  entry: LeaderboardUserEntry;
  displayW: number;
  variant: RankingFrameRowVariant;
};

export function RankingFrameRow({ entry, displayW, variant }: Props) {
  const displayH = rowHeight(displayW);
  const rowRadius = rowCornerRadius(displayW);
  const metrics = avatarMetrics(entry, displayW);
  const { isTop3, avatarSize, avatarOffsetX, avatarOffsetY, frameW, frameH, frameSource } = metrics;
  const rankZoneW = rankZoneWidth(displayW);
  const rowSource = isTop3 ? RANKING_ROWS[entry.rank as 1 | 2 | 3] : RANKING_ROW_4TH;
  const bonusReward = Math.max(1, Math.floor(entry.score / 50_000));
  const scoreBelow4 = !isTop3;

  return (
    <View style={{ width: displayW, height: displayH, marginBottom: Spacing.sm, overflow: 'visible' }}>
      <View
        style={{
          width: displayW,
          height: displayH,
          borderRadius: rowRadius,
          overflow: 'hidden',
        }}
      >
        <Image
          source={rowSource}
          style={{ width: displayW, height: displayH }}
          contentFit="contain"
          cachePolicy="memory-disk"
        />
      </View>
      <View style={styles.rowOverlay}>
        <View style={[styles.rankZone, { width: rankZoneW }]}>
          {!isTop3 ? (
            <Text style={styles.rankInside} allowFontScaling={false}>
              {entry.rank}
            </Text>
          ) : null}
        </View>

        <View style={[styles.avatarSlot, { width: frameW, height: frameH }]}>
          <View
            style={[
              styles.avatarInFrame,
              {
                width: avatarSize,
                height: avatarSize,
                borderRadius: avatarSize / 2,
                left: (frameW - avatarSize) / 2 + avatarOffsetX,
                top: (frameH - avatarSize) / 2 + avatarOffsetY,
              },
            ]}
          >
            <UserAvatar
              user={{
                displayName: entry.displayName,
                avatar: entry.avatar,
                equippedFrame: entry.equippedFrame ?? null,
              }}
              size={avatarSize}
              hideBorder
              hideFrame
            />
          </View>
          {frameSource ? (
            <Image
              source={frameSource}
              pointerEvents="none"
              style={styles.avatarFrameOverlay}
              contentFit="fill"
              cachePolicy="memory-disk"
            />
          ) : null}
        </View>

        <View style={styles.rowInfo}>
          <Text style={styles.rowName} numberOfLines={1}>
            {entry.displayName}
          </Text>
          <View style={styles.badgeRow}>
            {entry.richLevel != null && entry.richLevel > 0 ? (
              <Image
                source={RICH[Math.min(Math.max(entry.richLevel, 1), 100)] ?? RICH[1]}
                style={styles.levelBadgeImg}
                contentFit="contain"
              />
            ) : null}
            {entry.charmLevel != null && entry.charmLevel > 0 ? (
              <Image
                source={CHARM[Math.min(Math.max(entry.charmLevel, 0), 100)] ?? CHARM[0]}
                style={styles.levelBadgeImg}
                contentFit="contain"
              />
            ) : null}
          </View>
          <View style={styles.rewardRow}>
            {variant === 'activity' && scoreBelow4 ? (
              <Text style={styles.rewardLabel}>Reward: </Text>
            ) : null}
            {variant === 'game' ? (
              <>
                <Text style={styles.rewardLabel}>Reward: </Text>
                <Image source={DIAMOND_ICON} style={styles.rowIconSm} contentFit="contain" />
                <Text style={styles.rewardValue}>{formatNum(Math.floor(entry.score * 0.08))}</Text>
                <Image source={RING_REWARD_ICON} style={styles.rowIconSm} contentFit="contain" />
                <Text style={styles.rewardValue}>{formatNum(bonusReward)}</Text>
              </>
            ) : (
              <>
                <Image source={BEAN_ICON} style={styles.rowIconSm} contentFit="contain" />
                <Text style={[styles.rewardValue, scoreBelow4 && styles.rewardValueBelow4]}>
                  {formatNum(entry.score)}
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.rowRight}>
          <View style={styles.scoreRow}>
            <Image
              source={variant === 'game' ? DIAMOND_ICON : COIN_ICON}
              style={styles.rowIconMd}
              contentFit="contain"
            />
            <Text
              style={[styles.scoreText, scoreBelow4 && styles.scoreTextBelow4]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.65}
            >
              {formatNum(entry.score)}
            </Text>
          </View>
          <View style={[styles.receivedPill, scoreBelow4 && styles.receivedPillBelow4]}>
            <Text style={[styles.receivedText, scoreBelow4 && styles.receivedTextBelow4]}>
              {isTop3 ? 'Unreceived' : 'Received'}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rowOverlay: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: '3%',
    paddingVertical: 4,
    gap: 4,
  },
  rankZone: {
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  rankInside: {
    fontWeight: '800',
    color: Colors.textPrimary,
    fontSize: 17,
    textAlign: 'center',
  },
  avatarSlot: {
    position: 'relative',
    marginLeft: -2,
    overflow: 'visible',
  },
  avatarInFrame: {
    position: 'absolute',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFrameOverlay: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  rowInfo: { flex: 1, gap: 1, minWidth: 0 },
  rowName: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  levelBadgeImg: { width: 44, height: 16 },
  rewardRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 2 },
  rewardLabel: { color: Colors.textPrimary, fontSize: 10, fontWeight: '500' },
  rewardValue: { color: REWARD_VALUE_COLOR, fontSize: 10, fontWeight: '700' },
  rewardValueBelow4: { color: Colors.textPrimary, fontSize: 14, fontWeight: '400' },
  rowIconSm: { width: 12, height: 12 },
  rowIconMd: { width: 18, height: 18 },
  rowRight: { alignItems: 'flex-end', justifyContent: 'center', gap: 4, maxWidth: '34%' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  scoreText: { color: Colors.textPrimary, fontSize: 11, fontWeight: '800', maxWidth: 100 },
  scoreTextBelow4: { color: '#2A1A0F' },
  receivedPill: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: Radius.full,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  receivedPillBelow4: {
    backgroundColor: 'rgba(255,255,255,0.55)',
  },
  receivedText: { color: '#F24822', fontSize: 10, fontWeight: '700' },
  receivedTextBelow4: { color: Colors.textPrimary },
});
