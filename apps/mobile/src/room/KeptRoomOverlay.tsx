import React, { useCallback, useEffect, useReducer } from "react";
import { Dimensions, Platform, StyleSheet, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Gesture, GestureDetector, Pressable } from "react-native-gesture-handler";
import Animated, { useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { navigationRef } from "@/navigation/navigationRef";
import { Colors, Radius, Spacing } from "@/theme";
import { roomsApi } from "@api/rooms";
import { useRoomSession, type KeptRoomDisplay } from "@/room/RoomSessionProvider";

const BALL_SIZE = 64;
/** Extra space so the corner close control is not clipped when dragging. */
const CLUSTER_PAD = 8;
const CLUSTER = BALL_SIZE + CLUSTER_PAD;
const TAB_BAR_RESERVE = 88;
const EDGE = Spacing.lg;

/**
 * Floating bubble after **Keep**: `RoomScreen` calls `keepInBackground` → `KeptRoomOverlay`
 * shows when `session.keptDisplay` is set, `isBackground`, and Room modal is not focused.
 * Without a foreground service, live audio may pause when the app is fully backgrounded on Android.
 */

function clamp(v: number, lo: number, hi: number) {
  "worklet";
  return Math.min(Math.max(v, lo), hi);
}

function isRoomScreenFocused(): boolean {
  if (!navigationRef.isReady()) return false;
  try {
    return navigationRef.getCurrentRoute()?.name === "Room";
  } catch {
    return false;
  }
}

/** Theme background + room cover / host avatar so the touch ball always reflects the room. */
function KeptRoomBallArtwork({ display }: { display: KeptRoomDisplay }) {
  const bgUri = display.backgroundImageUrl?.trim() || null;
  const coverUri = display.coverUrl?.trim() || null;
  const gFrom = display.gradientFrom?.trim();
  const gTo = display.gradientTo?.trim();
  const hasGrad = Boolean(gFrom && gTo);
  const duplicate = Boolean(bgUri && coverUri && bgUri === coverUri);
  const showBackdropImage = Boolean(bgUri) && !duplicate;
  const showCoverLayer = Boolean(coverUri) && !duplicate;
  const showSingleSharedImage = duplicate && Boolean(bgUri);

  if (showSingleSharedImage && bgUri) {
    return (
      <Image
        source={{ uri: bgUri }}
        style={styles.coverImage}
        contentFit="cover"
      />
    );
  }

  return (
    <>
      {showBackdropImage && bgUri ? (
        <Image
          source={{ uri: bgUri }}
          style={styles.coverImage}
          contentFit="cover"
        />
      ) : !showBackdropImage && hasGrad ? (
        <LinearGradient
          colors={[gFrom!, gTo!]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.coverImage}
        />
      ) : (
        <View style={[styles.coverImage, styles.themeFallback]} />
      )}
      {showCoverLayer && coverUri ? (
        <Image
          source={{ uri: coverUri }}
          style={styles.coverForeground}
          contentFit="cover"
        />
      ) : null}
    </>
  );
}

export function KeptRoomOverlay() {
  const insets = useSafeAreaInsets();
  const { session, isBackground, stopSession } = useRoomSession();
  const [, bumpNav] = useReducer((n: number) => n + 1, 0);

  const minX = useSharedValue<number>(EDGE);
  const maxX = useSharedValue<number>(300);
  const minY = useSharedValue<number>(EDGE);
  const maxY = useSharedValue<number>(600);
  const posX = useSharedValue<number>(0);
  const posY = useSharedValue<number>(0);
  const dragStartX = useSharedValue<number>(0);
  const dragStartY = useSharedValue<number>(0);

  const syncBoundsAndSnapDefault = useCallback(() => {
    const { width: W, height: H } = Dimensions.get("window");
    const mnx = EDGE;
    const mxx = W - CLUSTER - EDGE;
    const mny = EDGE + insets.top;
    const mxy = H - CLUSTER - insets.bottom - TAB_BAR_RESERVE;
    minX.value = mnx;
    maxX.value = Math.max(mnx, mxx);
    minY.value = mny;
    maxY.value = Math.max(mny, mxy);
    posX.value = maxX.value;
    posY.value = maxY.value;
  }, [insets.bottom, insets.top, maxX, maxY, minX, minY, posX, posY]);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    const subscribe = () => {
      if (!navigationRef.isReady()) return false;
      unsub = navigationRef.addListener("state", () => bumpNav());
      return true;
    };
    if (subscribe()) {
      return () => unsub?.();
    }
    const id = setInterval(() => {
      if (subscribe()) clearInterval(id);
    }, 80);
    return () => {
      clearInterval(id);
      unsub?.();
    };
  }, []);

  const roomModalVisible = isRoomScreenFocused();
  const showBall =
    Boolean(session?.roomId) &&
    isBackground &&
    !roomModalVisible &&
    Boolean(session?.keptDisplay);

  useEffect(() => {
    if (!showBall) return;
    syncBoundsAndSnapDefault();
    const sub = Dimensions.addEventListener("change", syncBoundsAndSnapDefault);
    return () => sub.remove();
  }, [showBall, syncBoundsAndSnapDefault]);

  const openRoom = useCallback(() => {
    if (!session?.roomId || !navigationRef.isReady()) return;
    const d = session.keptDisplay;
    navigationRef.navigate("RoomModal", {
      roomId: session.roomId,
      roomMode: d?.roomMode,
      isLocked: d?.isLocked,
      hostId: d?.hostId,
    });
  }, [session]);

  const dismissKeptRoom = useCallback(async () => {
    if (!session?.roomId) {
      stopSession();
      return;
    }
    const roomId = session.roomId;
    const seat = session.keptDisplay?.seatPosition ?? null;
    // End background audio/socket only — RoomMember (persistent join) stays until
    // the user explicitly unjoins from the room toolbar.
    if (seat !== null) {
      try {
        await roomsApi.leaveSeat(roomId, seat);
      } catch {
        /* best-effort */
      }
    }
    stopSession();
  }, [session, stopSession]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      dragStartX.value = posX.value;
      dragStartY.value = posY.value;
    })
    .onUpdate((e) => {
      posX.value = clamp(
        dragStartX.value + e.translationX,
        minX.value,
        maxX.value,
      );
      posY.value = clamp(
        dragStartY.value + e.translationY,
        minY.value,
        maxY.value,
      );
    });

  const animatedStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: posX.value,
    top: posY.value,
    width: CLUSTER,
    height: CLUSTER,
    overflow: "visible",
  }));

  if (!showBall || !session?.keptDisplay) return null;

  const display = session.keptDisplay;
  const bgUri = display.backgroundImageUrl?.trim() || null;
  const coverUri = display.coverUrl?.trim() || null;
  const gFrom = display.gradientFrom?.trim();
  const gTo = display.gradientTo?.trim();
  const hasRoomVisual =
    Boolean(bgUri) ||
    Boolean(coverUri) ||
    Boolean(gFrom && gTo);
  const usesMic =
    display.seatPosition !== null && Boolean(session.canPublish);

  return (
    <View style={styles.screenOverlay} pointerEvents="box-none">
      <GestureDetector gesture={panGesture}>
        <Animated.View style={animatedStyle}>
          <Pressable
            onPress={openRoom}
            style={({ pressed }) => [
              styles.ball,
              pressed && styles.ballPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Return to live room: ${session.keptDisplay.title}`}
            accessibilityHint="Opens the room. Drag anywhere on this control to move it."
          >
            <View style={styles.artworkClip}>
              {hasRoomVisual ? (
                <KeptRoomBallArtwork display={display} />
              ) : (
                <View style={[styles.coverImage, styles.coverPlaceholder]}>
                  <Ionicons name="radio" size={28} color={Colors.primary} />
                </View>
              )}
            </View>
            {usesMic ? (
              <View style={styles.micDot} pointerEvents="none">
                <Ionicons name="mic" size={12} color={Colors.textInverse} />
              </View>
            ) : null}
          </Pressable>
          <Pressable
            onPress={() => void dismissKeptRoom()}
            style={({ pressed }) => [
              styles.closeFab,
              pressed && styles.closeFabPressed,
            ]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close mini player"
          >
            <Ionicons name="close" size={16} color={Colors.textInverse} />
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  screenOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 50,
    elevation: 24,
  },
  ball: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: BALL_SIZE,
    height: BALL_SIZE,
    borderRadius: Radius.full,
    overflow: "hidden",
    backgroundColor: Colors.surfaceElevated,
    borderWidth: 3,
    borderColor: Colors.live,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
      },
      default: {
        elevation: 12,
      },
    }),
  },
  ballPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.96 }],
  },
  /** Inner clip so expo-image / gradients respect the circle on Android + iOS. */
  artworkClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Radius.full,
    overflow: "hidden",
  },
  coverImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    borderRadius: Radius.full,
    overflow: "hidden",
  },
  coverForeground: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    borderRadius: Radius.full,
    overflow: "hidden",
    opacity: 0.97,
  },
  themeFallback: {
    backgroundColor: Colors.primarySubtle,
  },
  coverPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.primarySubtle,
  },
  micDot: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.surfaceElevated,
  },
  closeFab: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: Colors.surfaceElevated,
    zIndex: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.22,
        shadowRadius: 4,
      },
      default: { elevation: 8 },
    }),
  },
  closeFabPressed: {
    opacity: 0.88,
  },
});
