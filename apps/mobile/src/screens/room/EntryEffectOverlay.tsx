import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { SvgaPlayer, type SvgaPlayerRef } from "@jayming/svga-player-rn";
import { resolveGiftSvgaUri } from "./SVGAGiftEffect";

interface Props {
  visible: boolean;
  /** Remote SVGA URL (the entry store item's `image`). */
  svga: string;
  /** Display name (kept for queue metadata; no on-screen label). */
  name: string;
  onComplete: () => void;
}

/**
 * Full-screen entry animation played once when a user with an equipped
 * entry effect joins the room. SVGA only — no center label (join toasts cover that).
 */
export const EntryEffectOverlay = React.memo(EntryEffectOverlayInner);
function EntryEffectOverlayInner({ visible, svga, onComplete }: Props) {
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const playerRef = useRef<SvgaPlayerRef>(null);
  const completedRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        onFinished={callComplete}
        onError={callComplete}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9998,
    elevation: 9998,
  },
});
