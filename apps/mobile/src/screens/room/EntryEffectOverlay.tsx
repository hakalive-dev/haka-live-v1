import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Dimensions, StyleSheet, Text, View } from "react-native";
import { SvgaPlayer, type SvgaPlayerRef } from "@jayming/svga-player-rn";
import { resolveGiftSvgaUri } from "./SVGAGiftEffect";
import { Colors, Spacing } from "@/theme";

const { height: SH } = Dimensions.get("screen");

interface Props {
  visible: boolean;
  /** Remote SVGA URL (the entry store item's `image`). */
  svga: string;
  /** Name shown in the "… entered" label. */
  name: string;
  onComplete: () => void;
}

/**
 * Full-screen entry animation played once when a user with an equipped
 * entry effect joins the room. Mirrors the SVGA layer of SVGAGiftEffect but
 * without the gift-specific PNG/qty machinery. Self-completes on finish,
 * error, or a safety timeout so the queue can never get stuck.
 */
export const EntryEffectOverlay = React.memo(EntryEffectOverlayInner);
function EntryEffectOverlayInner({ visible, svga, name, onComplete }: Props) {
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const playerRef = useRef<SvgaPlayerRef>(null);
  const completedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const labelOpacity = useRef(new Animated.Value(0)).current;
  const labelTransY = useRef(new Animated.Value(20)).current;

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const callComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    onCompleteRef.current();
  }, []);

  // Resolve (download + cache) the remote SVGA, with a hard timeout fallback.
  useEffect(() => {
    if (!visible) {
      setSourceUri(null);
      return;
    }
    completedRef.current = false;
    let cancelled = false;
    const trimmed = typeof svga === "string" ? svga.trim() : "";

    if (!trimmed) {
      callComplete();
      return;
    }

    // Never block the queue forever if the SVGA can't load/play.
    timeoutRef.current = setTimeout(callComplete, 8000);

    (async () => {
      const uri = await resolveGiftSvgaUri(trimmed);
      if (cancelled) return;
      if (!uri) {
        callComplete();
        return;
      }
      setSourceUri(uri);
    })();

    return () => {
      cancelled = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [visible, svga, callComplete]);

  const handleLoaded = useCallback(() => {
    labelOpacity.setValue(0);
    labelTransY.setValue(20);
    Animated.parallel([
      Animated.timing(labelOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(labelTransY, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
    ]).start();
  }, [labelOpacity, labelTransY]);

  if (!visible || !sourceUri) return null;

  return (
    <View style={styles.container} pointerEvents="none">
      <SvgaPlayer
        ref={playerRef}
        source={sourceUri}
        autoPlay
        loops={1}
        clearsAfterStop
        align="center"
        style={StyleSheet.absoluteFill}
        onLoaded={handleLoaded}
        onFinished={callComplete}
        onError={callComplete}
      />
      {name ? (
        <Animated.View
          style={[
            styles.labelWrap,
            { opacity: labelOpacity, transform: [{ translateY: labelTransY }] },
          ]}
        >
          <View style={styles.labelBg}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>
            <Text style={styles.entered}>entered the room</Text>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
    elevation: 9998,
  },
  labelWrap: {
    position: "absolute",
    top: SH * 0.62,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  labelBg: {
    alignItems: "center",
    backgroundColor: "rgba(0,0,0,0.55)",
    borderWidth: 1,
    borderColor: `${Colors.primary}66`,
    borderRadius: 50,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    gap: 2,
  },
  name: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.textPrimary,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    letterSpacing: 0.5,
  },
  entered: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.primaryLight,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
