import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

const TIMER_STRIP = require('../../../assets/ranking/state-star/timer-box.png');

/** Native dimensions of `timer-box.png` (full Hour : Min : Sec strip). */
const TIMER_NATIVE_W = 169;
const TIMER_NATIVE_H = 47;
const TIMER_BOX_W = 43;
const TIMER_GAP_W = 18;
const TIMER_EDGE_PAD = 2;
const TIMER_DIGIT_H = 32;
const COUNTDOWN_DISPLAY_W = 168;
const COUNTDOWN_SCALE = COUNTDOWN_DISPLAY_W / TIMER_NATIVE_W;

type Props = {
  countdown: string;
};

export function RankingCountdownBoxes({ countdown }: Props) {
  const [hh, mm, ss] = countdown.split(':');
  const values = [hh, mm, ss];
  const stripH = Math.round(TIMER_NATIVE_H * COUNTDOWN_SCALE);
  const boxW = Math.round(TIMER_BOX_W * COUNTDOWN_SCALE);
  const gapW = Math.round(TIMER_GAP_W * COUNTDOWN_SCALE);
  const edgePad = Math.round(TIMER_EDGE_PAD * COUNTDOWN_SCALE);
  const digitH = Math.round(TIMER_DIGIT_H * COUNTDOWN_SCALE);

  return (
    <View style={[styles.countdownWrap, { width: COUNTDOWN_DISPLAY_W, height: stripH }]}>
      <Image
        source={TIMER_STRIP}
        style={{ width: COUNTDOWN_DISPLAY_W, height: stripH }}
        contentFit="contain"
        cachePolicy="memory-disk"
      />
      <View style={[styles.countdownDigitsRow, { height: digitH, paddingLeft: edgePad, top: 1 }]}>
        {values.map((val, idx) => (
          <React.Fragment key={idx}>
            {idx > 0 ? <View style={{ width: gapW }} /> : null}
            <View style={[styles.countdownDigitCell, { width: boxW, height: digitH }]}>
              <Text style={styles.countdownNum} allowFontScaling={false}>
                {val}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  countdownWrap: {
    position: 'relative',
    alignSelf: 'center',
  },
  countdownDigitsRow: {
    position: 'absolute',
    top: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  countdownDigitCell: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  countdownNum: {
    color: '#FFE566',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0,
    includeFontPadding: false,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 1,
  },
});
