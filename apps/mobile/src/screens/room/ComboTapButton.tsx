import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type View as RNView,
} from "react-native";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Asset } from "expo-asset";
import { Image } from "expo-image";
import type { SvgaPlayerRef } from "@jayming/svga-player-rn";
import { Colors, Spacing } from "@/theme";

const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const COMBO_BTN_SIZE = 82;
const COMBO_BTN_HALF = COMBO_BTN_SIZE / 2;

const COMBO_BTN_SVGA = require("../../../assets/room/new_combo_btn.svga");
const COMBO_BALANCE_BADGE = require("../../../assets/room/combo_balance_badge.png");

/** Native asset 1024×228 — keep pill aspect when scaling. */
const BALANCE_BAR_WIDTH = 148;
const BALANCE_BAR_HEIGHT = Math.round(BALANCE_BAR_WIDTH * (228 / 1024));

let SvgaPlayer: React.ForwardRefExoticComponent<
  {
    source: string;
    style?: object;
    autoPlay?: boolean;
    loops?: number;
    clearsAfterStop?: boolean;
    align?: "top" | "bottom" | "center";
  } & React.RefAttributes<SvgaPlayerRef>
> | null = null;

if (!IS_EXPO_GO) {
  try {
    SvgaPlayer = require("@jayming/svga-player-rn").SvgaPlayer;
  } catch {
    SvgaPlayer = null;
  }
}

let _cachedUri: string | null = null;
let _preloadStarted = false;

function ComboSvgaLayer({
  sourceUri,
  playerRef,
}: {
  sourceUri: string;
  playerRef: React.RefObject<SvgaPlayerRef | null>;
}) {
  if (!SvgaPlayer) return null;
  return (
    <SvgaPlayer
      ref={playerRef}
      source={sourceUri}
      autoPlay
      // Play once and hold the last frame; each combo tap restarts it from frame 0
      // (see restartNonce effect) instead of auto-looping into a fresh play.
      loops={1}
      clearsAfterStop={false}
      align="center"
      style={styles.svgaFill}
    />
  );
}

export async function preloadComboButtonSvga(): Promise<void> {
  if (_preloadStarted) return;
  _preloadStarted = true;
  try {
    const [asset] = await Asset.loadAsync(COMBO_BTN_SVGA);
    let uri = asset.localUri ?? null;
    if (!uri) {
      await asset.downloadAsync();
      uri = asset.localUri ?? null;
    }
    if (uri) _cachedUri = uri.startsWith("file://") ? uri : `file://${uri}`;
  } catch {
    /* on-demand load on mount */
  }
}

interface Props {
  coinBalance: number;
  comboScale: Animated.Value;
  bottomInset: number;
  originRef: React.RefObject<RNView | null>;
  onPress: () => void;
  /** Bump to replay the combo-button SVGA from frame 0 on each tap. */
  restartNonce?: number;
}

export function ComboTapButton({
  coinBalance,
  comboScale,
  bottomInset,
  originRef,
  onPress,
  restartNonce,
}: Props) {
  const [sourceUri, setSourceUri] = useState<string | null>(_cachedUri);
  const playerRef = useRef<SvgaPlayerRef | null>(null);
  const prevRestartNonceRef = useRef(restartNonce ?? 0);

  useEffect(() => {
    if (_cachedUri) {
      setSourceUri(_cachedUri);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const [asset] = await Asset.loadAsync(COMBO_BTN_SVGA);
        let uri = asset.localUri ?? null;
        if (!uri) {
          await asset.downloadAsync();
          uri = asset.localUri ?? null;
        }
        if (!uri || cancelled) return;
        const resolved = uri.startsWith("file://") ? uri : `file://${uri}`;
        _cachedUri = resolved;
        setSourceUri(resolved);
      } catch {
        /* Expo Go / missing asset */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canUseSvga = !!SvgaPlayer;
  const svgaReady = canUseSvga && !!sourceUri;

  // Replay the combo-button SVGA from frame 0 on each tap. Skips the initial
  // mount (autoPlay already starts it) and only acts once the player is live.
  useEffect(() => {
    const nonce = restartNonce ?? 0;
    if (nonce === prevRestartNonceRef.current) return;
    prevRestartNonceRef.current = nonce;
    if (!svgaReady) return;
    playerRef.current?.startAnimation();
  }, [restartNonce, svgaReady]);
  const balanceLabel =
    coinBalance >= 1000 ? coinBalance.toLocaleString() : String(coinBalance);

  return (
    <View style={[styles.comboWrap, { bottom: bottomInset }]}>
      <Animated.View style={{ transform: [{ scale: comboScale }] }}>
        <View ref={originRef} collapsable={false} style={styles.comboBtnSlot}>
          <TouchableOpacity
            style={[
              styles.comboBtn,
              !svgaReady && !canUseSvga && styles.comboBtnDevFallback,
            ]}
            activeOpacity={1}
            onPress={onPress}
          >
            {svgaReady ? (
              <ComboSvgaLayer sourceUri={sourceUri} playerRef={playerRef} />
            ) : null}
          </TouchableOpacity>
        </View>
      </Animated.View>
      <View style={styles.balanceRow} pointerEvents="none">
        <View style={styles.balanceBar}>
          <Image
            source={COMBO_BALANCE_BADGE}
            style={styles.balanceBarImage}
            contentFit="fill"
            priority="high"
          />
          <View style={styles.balanceTextRow}>
            <Text allowFontScaling={false} style={styles.balancePrefix}>
              Balance:
            </Text>
            <Text allowFontScaling={false} style={styles.balanceValue} numberOfLines={1}>
              {balanceLabel}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  comboWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    // Above FlyingGift (zIndex 10000) so combo-tap gifts launch behind the SVGA.
    zIndex: 10001,
    elevation: 42,
  },
  comboBtnSlot: {
    width: COMBO_BTN_SIZE,
    height: COMBO_BTN_SIZE,
  },
  comboBtn: {
    width: COMBO_BTN_SIZE,
    height: COMBO_BTN_SIZE,
    borderRadius: COMBO_BTN_HALF,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  svgaFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "transparent",
  },
  /** Expo Go only — purple so it never matches the SVGA gold end-frame. */
  comboBtnDevFallback: {
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  balanceRow: {
    marginTop: Spacing.xs,
    alignItems: "center",
  },
  balanceBar: {
    width: BALANCE_BAR_WIDTH,
    height: BALANCE_BAR_HEIGHT,
    justifyContent: "center",
  },
  balanceBarImage: {
    ...StyleSheet.absoluteFillObject,
    width: BALANCE_BAR_WIDTH,
    height: BALANCE_BAR_HEIGHT,
  },
  balanceTextRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 34,
    paddingRight: Spacing.sm,
    gap: 4,
  },
  balancePrefix: {
    color: Colors.textInverse,
    fontSize: 11,
    fontWeight: "600",
  },
  balanceValue: {
    flexShrink: 1,
    color: Colors.textInverse,
    fontSize: 12,
    fontWeight: "800",
  },
});
