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
import type { SvgaPlayerRef } from "@jayming/svga-player-rn";
import { Colors, Radius, Spacing } from "@/theme";

const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const COMBO_BTN_SIZE = 82;
const COMBO_BTN_HALF = COMBO_BTN_SIZE / 2;

const COMBO_BTN_SVGA = require("../../../assets/room/new_combo_btn.svga");

let SvgaPlayer: React.ComponentType<{
  source: string;
  style?: object;
  autoPlay?: boolean;
  loops?: number;
  clearsAfterStop?: boolean;
  align?: "top" | "bottom" | "center";
  ref?: React.Ref<SvgaPlayerRef>;
}> | null = null;

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
      loops={0}
      clearsAfterStop={false}
      align="center"
      style={StyleSheet.absoluteFill}
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
  count: number;
  comboScale: Animated.Value;
  bottomInset: number;
  originRef: React.RefObject<RNView | null>;
  onPress: () => void;
}

export function ComboTapButton({
  count,
  comboScale,
  bottomInset,
  originRef,
  onPress,
}: Props) {
  const [sourceUri, setSourceUri] = useState<string | null>(_cachedUri);
  const playerRef = useRef<SvgaPlayerRef>(null);
  const prevCountRef = useRef(count);

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

  useEffect(() => {
    if (prevCountRef.current === count) return;
    prevCountRef.current = count;
    playerRef.current?.startAnimation();
  }, [count]);

  const useSvga = !!SvgaPlayer && !!sourceUri;

  return (
    <View style={[styles.comboWrap, { bottom: bottomInset }]}>
      <Animated.View style={{ transform: [{ scale: comboScale }] }}>
        <View ref={originRef} collapsable={false}>
          <TouchableOpacity
            style={[styles.comboBtn, !useSvga && styles.comboBtnFallback]}
            activeOpacity={1}
            onPress={onPress}
          >
            {useSvga ? (
              <ComboSvgaLayer
                sourceUri={sourceUri}
                playerRef={playerRef}
              />
            ) : null}
          </TouchableOpacity>
        </View>
      </Animated.View>
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        <View style={styles.comboLabelRow}>
          <View style={styles.comboBadge}>
            <Text style={styles.comboBadgeText}>×{count}</Text>
          </View>
        </View>
      </TouchableOpacity>
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
  comboBtn: {
    width: COMBO_BTN_SIZE,
    height: COMBO_BTN_SIZE,
    borderRadius: COMBO_BTN_HALF,
    overflow: "hidden",
  },
  comboBtnFallback: {
    backgroundColor: Colors.gold,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.goldLight,
    borderBottomWidth: 8,
    borderBottomColor: Colors.textInverse,
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55,
    shadowRadius: 14,
    elevation: 16,
  },
  comboLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: Spacing.xs,
    gap: 4,
  },
  comboBadge: {
    backgroundColor: Colors.gold,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: Colors.goldLight,
  },
  comboBadgeText: {
    fontSize: 11,
    fontWeight: "800",
    color: Colors.textInverse,
  },
});
