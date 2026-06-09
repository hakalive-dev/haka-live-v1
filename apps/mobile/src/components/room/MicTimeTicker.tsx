import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { Colors, Radius, Spacing } from '@/theme';
import { hostsApi } from '@api/hosts';

/** How often to reconcile the locally-ticked value against the server (ms). */
const RECONCILE_MS = 45_000;
/** Local tick cadence for the displayed clock (ms). */
const TICK_MS = 1_000;

interface Anchor {
  /** Qualifying mic seconds today at the moment of the last server fetch. */
  baselineSeconds: number;
  /** Date.now() at the fetch instant — locally-elapsed time is measured from here. */
  anchorMs: number;
}

const pad = (n: number) => n.toString().padStart(2, '0');

/** Format seconds as `M:SS` (<1h) or `H:MM:SS` (>=1h). */
function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const sec = totalSeconds % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * Live mic-time timer for a female host in her own room. Anchors to the Female
 * Host Task endpoint (`todayMicMinutes`) and ticks the value locally for a
 * realtime feel, reconciling against the server every ~45s.
 *
 * Renders nothing when the host is not eligible (endpoint 403s) or before the
 * first fetch resolves. Mount/unmount is driven by the host's on-mic state in
 * RoomScreen so the interval is cleaned up on leaving the seat/room.
 */
export function MicTimeTicker() {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [displaySeconds, setDisplaySeconds] = useState(0);
  // Keeps the clock monotonic: the server baseline is floored to whole minutes,
  // so a reconcile could otherwise nudge the display backwards by a few seconds.
  const lastShownRef = useRef(0);
  // Set true once the endpoint rejects (e.g. 403 for non-female/unverified host).
  const ineligibleRef = useRef(false);

  const reconcile = useCallback(async () => {
    if (ineligibleRef.current) return;
    try {
      const status = await hostsApi.getLevelTask();
      // Prefer second-precision (exact for the open session) so the timer resumes
      // correctly after the room is minimized/reopened; fall back to whole minutes.
      const baselineSeconds =
        status.todayMicSeconds ?? (status.todayMicMinutes ?? 0) * 60;
      setAnchor({ baselineSeconds, anchorMs: Date.now() });
    } catch {
      // Not eligible (or transient) — stop polling and render nothing.
      ineligibleRef.current = true;
      setAnchor(null);
    }
  }, []);

  // Initial fetch + periodic reconcile.
  useEffect(() => {
    void reconcile();
    const id = setInterval(() => void reconcile(), RECONCILE_MS);
    return () => clearInterval(id);
  }, [reconcile]);

  // Local 1s clock. The baseline already covers time up to `anchorMs`, so we add
  // only the seconds elapsed since the anchor, clamped to never tick backwards.
  useEffect(() => {
    if (!anchor) return;
    const compute = () => {
      const elapsed = Math.max(0, Math.floor((Date.now() - anchor.anchorMs) / 1000));
      const next = Math.max(lastShownRef.current, anchor.baselineSeconds + elapsed);
      lastShownRef.current = next;
      setDisplaySeconds(next);
    };
    compute();
    const id = setInterval(compute, TICK_MS);
    return () => clearInterval(id);
  }, [anchor]);

  if (ineligibleRef.current || !anchor) return null;

  return (
    <View style={s.pill}>
      <MaterialCommunityIcons name="microphone" size={13} color={Colors.bean} />
      <Text style={s.value}>{formatClock(displaySeconds)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.full,
    backgroundColor: Colors.beanSubtle,
  },
  value: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.bean,
  },
});
