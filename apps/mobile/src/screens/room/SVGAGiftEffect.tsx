import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  type ImageSourcePropType,
  StyleSheet,
  View,
} from "react-native";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import { SvgaPlayer, type SvgaPlayerRef } from "@jayming/svga-player-rn";
import { Spacing } from "@/theme";

const { width: SW, height: SH } = Dimensions.get("screen");

const SVGA_ASSETS: Record<string, number> = {
  "gifts/86.svga": require("../../../assets/gifts/86.svga"),
  "gifts/93.svga": require("../../../assets/gifts/93.svga"),
  "gifts/116.svga": require("../../../assets/gifts/116.svga"),
  "gifts/121.svga": require("../../../assets/gifts/121.svga"),
};

const GIFT_IMAGES: Record<string, ReturnType<typeof require>> = {
  "gifts/86.png": require("../../../assets/gifts/86.png"),
  "gifts/93.png": require("../../../assets/gifts/93.png"),
  "gifts/116.png": require("../../../assets/gifts/116.png"),
  "gifts/121.png": require("../../../assets/gifts/121.png"),
};

const _uriCache: Record<string, string> = {};
let _preloadStarted = false;

export async function preloadSvgaAssets(): Promise<void> {
  if (_preloadStarted) return;
  _preloadStarted = true;
  await Promise.all(
    Object.entries(SVGA_ASSETS).map(async ([key, mod]) => {
      try {
        const [asset] = await Asset.loadAsync(mod);
        let uri = asset.localUri ?? null;
        if (!uri) {
          await asset.downloadAsync();
          uri = asset.localUri ?? null;
        }
        if (uri)
          _uriCache[key] = uri.startsWith("file://") ? uri : `file://${uri}`;
      } catch {
        /* ignore — fallback to on-demand load */
      }
    }),
  );
}

export async function preloadRemoteSvgaAssets(
  urls: string[],
  options: { limit?: number } = {},
): Promise<void> {
  const limit = Math.max(0, Math.min(20, options.limit ?? 4));
  if (limit === 0) return;

  const normalized = Array.from(
    new Set(
      urls
        .map((u) => (typeof u === "string" ? normalizeHttpSource(u).trim() : ""))
        .filter((u) => u.length > 0 && isHttpUrl(u)),
    ),
  ).slice(0, limit);

  // Keep this intentionally small/conservative: we don't want to saturate the
  // network on room entry.
  for (const url of normalized) {
    try {
      await getCachedRemoteSvgaUri(url);
    } catch {
      // ignore
    }
  }
}

/** Scheme-relative CDN URLs (`//cdn/...`) → https for SvgaPlayer. */
function normalizeHttpSource(src: string): string {
  const t = src.trim();
  if (t.startsWith("//")) return `https:${t}`;
  return t;
}

function isHttpUrl(src: string): boolean {
  return /^https?:\/\//i.test(normalizeHttpSource(src));
}

function hashStringDjb2(input: string): string {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  // >>> 0 makes it unsigned 32-bit
  return (hash >>> 0).toString(16);
}

/** Resolve a gift SVGA key or remote URL to a player-ready source URI. */
export async function resolveGiftSvgaUri(
  svgaAsset: string,
): Promise<string | null> {
  const trimmed = typeof svgaAsset === "string" ? svgaAsset.trim() : "";
  if (!trimmed) return null;

  const assetModule = SVGA_ASSETS[trimmed];
  const normalizedHttp = normalizeHttpSource(trimmed);
  const useRemote =
    !assetModule && !!normalizedHttp && isHttpUrl(normalizedHttp);

  if (useRemote) {
    const local = await getCachedRemoteSvgaUri(normalizedHttp);
    return local ?? normalizedHttp;
  }

  if (!assetModule) return null;

  const cached = _uriCache[trimmed];
  if (cached) return cached;

  try {
    const immediate = Asset.fromModule(assetModule);
    const immediateUri = immediate.localUri ?? immediate.uri ?? null;
    if (immediateUri) return immediateUri;
  } catch {
    // ignore
  }

  try {
    const [asset] = await Asset.loadAsync(assetModule);
    let localUri = asset.localUri ?? null;
    if (!localUri) {
      await asset.downloadAsync();
      localUri = asset.localUri ?? null;
    }
    if (!localUri) return null;
    const uri = localUri.startsWith("file://") ? localUri : `file://${localUri}`;
    _uriCache[trimmed] = uri;
    return uri;
  } catch {
    return null;
  }
}

async function getCachedRemoteSvgaUri(remoteUrl: string): Promise<string | null> {
  const key = normalizeHttpSource(remoteUrl).trim();
  if (!isHttpUrl(key)) return null;

  const cached = _uriCache[key];
  if (cached) return cached;

  const baseDir = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ""}svga/`;
  if (!baseDir) return null;

  try {
    await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
  } catch {
    // ignore (directory may already exist or be unsupported)
  }

  const localPath = `${baseDir}${hashStringDjb2(key)}.svga`;
  try {
    // `size` option isn't available in some expo-file-system typings; rely on the returned FileInfo.
    const info = await FileSystem.getInfoAsync(localPath);
    const size = (info as any).size as number | undefined;
    if (info.exists && (typeof size !== "number" || size > 0)) {
      const uri = localPath.startsWith("file://") ? localPath : `file://${localPath}`;
      _uriCache[key] = uri;
      return uri;
    }
  } catch {
    // ignore
  }

  try {
    const result = await FileSystem.downloadAsync(key, localPath);
    const uri = result.uri.startsWith("file://") ? result.uri : `file://${result.uri}`;
    _uriCache[key] = uri;
    return uri;
  } catch {
    return null;
  }
}

interface Props {
  visible: boolean;
  svgaAsset: string;
  giftImage?: string | null;
  senderName: string;
  giftName: string;
  giftIcon: string;
  qty?: number;
  onComplete: () => void;
}

/**
 * Two-layer gift effect:
 *   Layer 1 (PNG)  — starts immediately, guarantees no blank delay
 *   Layer 2 (SVGA) — loads in parallel, fades in on top when ready
 *
 * If SVGA fails or errors, Layer 1 completes normally.
 * If SVGA finishes first, it fades out both layers and calls onComplete.
 */
export const SVGAGiftEffect = React.memo(SVGAGiftEffectInner);
function SVGAGiftEffectInner({
  visible,
  svgaAsset,
  giftImage,
  onComplete,
}: Props) {
  // SVGA loading state
  const [sourceUri, setSourceUri] = useState<string | null>(null);
  const svgaTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const svgaRevealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const playerRef = useRef<SvgaPlayerRef>(null);
  const completedRef = useRef(false);
  // Reference to running PNG animation so we can stop it when SVGA finishes.
  const pngAnimRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── PNG layer animated values ─────────────────────────────────────────────
  const pngImgOpacity = useRef(new Animated.Value(0)).current;
  const pngImgTransY = useRef(new Animated.Value(-SH * 0.7)).current;

  // ── SVGA layer animated values ────────────────────────────────────────────
  const svgaLayerOpacity = useRef(new Animated.Value(0)).current;

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const callComplete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onCompleteRef.current();
  }, []);

  const hasSvga = typeof svgaAsset === "string" && svgaAsset.trim().length > 0;

  // Some builds/devices don't reliably fire SvgaPlayer.onLoaded.
  // Reveal the SVGA layer shortly after we have a source URI to avoid being stuck
  // on the loading backdrop forever.
  useEffect(() => {
    if (!visible || !sourceUri) return;

    // Ensure the SVGA layer is visible even if onLoaded never fires.
    svgaLayerOpacity.setValue(1);

    if (svgaRevealTimerRef.current) clearTimeout(svgaRevealTimerRef.current);
    svgaRevealTimerRef.current = setTimeout(() => {
      svgaRevealTimerRef.current = null;
    }, 700);

    return () => {
      if (svgaRevealTimerRef.current) {
        clearTimeout(svgaRevealTimerRef.current);
        svgaRevealTimerRef.current = null;
      }
    };
  }, [visible, sourceUri, svgaLayerOpacity]);

  // ── Layer 1: PNG animation — starts immediately ───────────────────────────
  useEffect(() => {
    if (!visible) return;
    // SVGA-only UX: if an SVGA exists, never show the thumbnail layer.
    if (hasSvga) return;
    // If this gift has an SVGA asset, we prefer SVGA-only.
    // But on production with remote https sources, initial loading can be slow,
    // so we keep the PNG layer visible (if available) until SVGA is loaded.
    if (hasSvga && !giftImage) return;
    const bundledPng = giftImage ? GIFT_IMAGES[giftImage] : null;
    const remotePngUri =
      !bundledPng &&
      giftImage &&
      /^https?:\/\//i.test(giftImage) &&
      /\.(png|jpe?g|webp)(\?|$|#)/i.test(giftImage.split(/[?#]/)[0] ?? "")
        ? giftImage
        : null;
    if (!bundledPng && !remotePngUri) {
      return;
    }

    pngImgOpacity.setValue(0);
    pngImgTransY.setValue(-SH * 0.7);

    const anim = Animated.sequence([
      Animated.parallel([
        Animated.timing(pngImgOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.timing(pngImgTransY, {
          toValue: 0,
          duration: 900,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(800),
      Animated.timing(pngImgOpacity, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }),
    ]);

    pngAnimRef.current = anim;
    anim.start(({ finished }) => {
      pngAnimRef.current = null;
      // If SVGA exists, PNG is only a placeholder; do not complete here.
      if (finished && !hasSvga) callComplete();
    });

    return () => {
      anim.stop();
      pngAnimRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, giftImage, hasSvga]);

  // ── Layer 2: SVGA — resolve source in one effect (avoids reset vs load setState races)
  useEffect(() => {
    if (!visible) {
      setSourceUri(null);
      if (svgaTimeoutRef.current) {
        clearTimeout(svgaTimeoutRef.current);
        svgaTimeoutRef.current = null;
      }
      return;
    }

    completedRef.current = false;
    svgaLayerOpacity.setValue(0);
    if (svgaTimeoutRef.current) {
      clearTimeout(svgaTimeoutRef.current);
      svgaTimeoutRef.current = null;
    }

    let cancelled = false;
    const trimmed = typeof svgaAsset === "string" ? svgaAsset.trim() : "";
    const assetModule = trimmed ? SVGA_ASSETS[trimmed] : undefined;
    const normalizedHttp = trimmed ? normalizeHttpSource(trimmed) : "";
    const useRemote =
      !assetModule && !!normalizedHttp && isHttpUrl(normalizedHttp);

    // If SVGA never loads, don't get stuck showing only the thumbnail forever.
    // This also fixes the "thumbnail-only" symptom where PNG completes before SVGA loads.
    if (trimmed.length > 0) {
      svgaTimeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        callComplete();
      }, 8000);
    }


    if (useRemote) {
      setSourceUri(null);
      (async () => {
        const local = await getCachedRemoteSvgaUri(normalizedHttp);
        if (cancelled) return;
        setSourceUri(local ?? normalizedHttp);
      })();
      return () => {
        cancelled = true;
        if (svgaTimeoutRef.current) {
          clearTimeout(svgaTimeoutRef.current);
          svgaTimeoutRef.current = null;
        }
      };
    }

    if (!assetModule) {
      setSourceUri(null);
      return;
    }

    // Fast path: start the player with whatever URI Expo has immediately.
    // In dev builds, `asset.uri` can be a Metro URL; `SvgaPlayer` can still load it.
    // We still download/cache to a file:// URI in background for subsequent plays.
    try {
      const immediate = Asset.fromModule(assetModule);
      const immediateUri = immediate.localUri ?? immediate.uri ?? null;
      if (immediateUri) {
        setSourceUri(immediateUri);
      }
    } catch {
      // ignore
    }

    const cached = _uriCache[trimmed];
    if (cached) {
      setSourceUri(cached);
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      try {
        const [asset] = await Asset.loadAsync(assetModule);
        let localUri = asset.localUri ?? null;
        if (!localUri) {
          await asset.downloadAsync();
          localUri = asset.localUri ?? null;
        }
        if (!localUri) throw new Error("no localUri");
        const uri = localUri.startsWith("file://")
          ? localUri
          : `file://${localUri}`;
        _uriCache[trimmed] = uri;
        if (!cancelled) {
          setSourceUri(uri);
        }
      } catch (e) {
        console.warn("[SVGA] load failed:", e);
      }
    })();
    return () => {
      cancelled = true;
      if (svgaTimeoutRef.current) {
        clearTimeout(svgaTimeoutRef.current);
        svgaTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, svgaAsset]);

  // ── SVGA callbacks ────────────────────────────────────────────────────────
  const handleSvgaLoaded = useCallback(() => {
    if (svgaRevealTimerRef.current) {
      clearTimeout(svgaRevealTimerRef.current);
      svgaRevealTimerRef.current = null;
    }
    if (svgaTimeoutRef.current) {
      clearTimeout(svgaTimeoutRef.current);
      svgaTimeoutRef.current = null;
    }
    Animated.timing(svgaLayerOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [svgaLayerOpacity]);

  const handleSvgaFinished = useCallback(() => {
    // Stop the PNG animation so it doesn't call onComplete again.
    if (pngAnimRef.current) {
      pngAnimRef.current.stop();
      pngAnimRef.current = null;
    }
    if (svgaRevealTimerRef.current) {
      clearTimeout(svgaRevealTimerRef.current);
      svgaRevealTimerRef.current = null;
    }
    if (svgaTimeoutRef.current) {
      clearTimeout(svgaTimeoutRef.current);
      svgaTimeoutRef.current = null;
    }

    Animated.parallel([
      Animated.timing(svgaLayerOpacity, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }),
      Animated.timing(pngImgOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => callComplete());
  }, [svgaLayerOpacity, pngImgOpacity, callComplete]);

  // SVGA native error — hide SVGA layer, let PNG continue.
  const handleSvgaError = useCallback(
    (e: { error: string }) => {
      console.warn("[SVGA] native error:", e?.error);
      if (svgaRevealTimerRef.current) {
        clearTimeout(svgaRevealTimerRef.current);
        svgaRevealTimerRef.current = null;
      }
      if (svgaTimeoutRef.current) {
        clearTimeout(svgaTimeoutRef.current);
        svgaTimeoutRef.current = null;
      }
      Animated.timing(svgaLayerOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
      // Let the placeholder end quickly if SVGA cannot play.
      callComplete();
    },
    [svgaLayerOpacity, callComplete],
  );

  if (!visible) return null;

  const bundledPng = giftImage ? GIFT_IMAGES[giftImage] : null;
  const remotePngUri =
    !bundledPng &&
    giftImage &&
    /^https?:\/\//i.test(giftImage) &&
    /\.(png|jpe?g|webp)(\?|$|#)/i.test(
      (giftImage.split(/[?#]/)[0] ?? "").toLowerCase(),
    )
      ? giftImage
      : null;
  const pngSource: ImageSourcePropType | null =
    bundledPng ?? (remotePngUri ? { uri: remotePngUri } : null);
  const svgaOnly =
    typeof svgaAsset === "string" && svgaAsset.trim().length > 0;

  return (
    <View style={styles.container} pointerEvents="none">
      {/* ── Layer 1: PNG base (always immediate) ── */}
      {!svgaOnly && pngSource ? (
        <Animated.View
          style={[
            styles.pngWrap,
            {
              opacity: pngImgOpacity,
              transform: [{ translateY: pngImgTransY }],
            },
          ]}
        >
          <Image
            source={pngSource}
            style={styles.pngImg}
            resizeMode="contain"
          />
        </Animated.View>
      ) : null}

      {/* ── Layer 2: SVGA overlay (loads in parallel, fades in on top) ── */}
      {sourceUri ? (
        <Animated.View
          style={[StyleSheet.absoluteFill, { opacity: svgaLayerOpacity }]}
        >
          <SvgaPlayer
            ref={playerRef}
            source={sourceUri}
            autoPlay
            loops={1}
            clearsAfterStop
            align="center"
            style={StyleSheet.absoluteFill}
            onLoaded={handleSvgaLoaded}
            onFinished={handleSvgaFinished}
            onError={handleSvgaError}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  pngWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  pngImg: {
    width: SW * 0.68,
    height: SW * 0.68,
    marginBottom: Spacing.xl,
  },
});
