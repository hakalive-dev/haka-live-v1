import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';

const CACHE_DIR = `${FileSystem.cacheDirectory}svga/`;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const inflight = new Map<string, Promise<string>>();

async function ensureCacheDir(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
    }
  } catch {
    // Race: another caller may have just created the dir. Subsequent writes
    // will surface a real error if the dir truly cannot be created.
  }
}

async function fetchAndCache(remoteUrl: string): Promise<string> {
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, remoteUrl);
  const localPath = `${CACHE_DIR}${hash}.svga`;

  const info = await FileSystem.getInfoAsync(localPath);
  if (info.exists) return localPath;

  await ensureCacheDir();
  // Bound the download — a hung CDN connection would otherwise hold an
  // inflight promise forever, leaking memory and starving subsequent loads.
  const download = FileSystem.downloadAsync(remoteUrl, localPath);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('SVGA download timeout')), DOWNLOAD_TIMEOUT_MS),
  );
  const { uri } = await Promise.race([download, timeout]);
  return uri;
}

/**
 * Return the local-FS URI for a remote SVGA, downloading it once and caching it.
 * Subsequent calls for the same URL hit the cache. `null` / non-remote URLs pass through.
 */
export function useCachedSvga(remoteUrl: string | null | undefined): { uri: string | null; ready: boolean } {
  const [uri, setUri] = useState<string | null>(() => (isRemoteUrl(remoteUrl) ? null : remoteUrl ?? null));
  const [ready, setReady] = useState<boolean>(!isRemoteUrl(remoteUrl));

  useEffect(() => {
    if (!remoteUrl) {
      setUri(null);
      setReady(true);
      return;
    }
    if (!isRemoteUrl(remoteUrl)) {
      setUri(remoteUrl);
      setReady(true);
      return;
    }

    let cancelled = false;
    setReady(false);
    setUri(null);

    let promise = inflight.get(remoteUrl);
    if (!promise) {
      promise = fetchAndCache(remoteUrl).finally(() => inflight.delete(remoteUrl));
      inflight.set(remoteUrl, promise);
    }

    promise
      .then((localUri) => {
        if (!cancelled) {
          setUri(localUri);
          setReady(true);
        }
      })
      .catch(() => {
        // On failure, fall back to the remote URL — keeps current behavior of streaming directly.
        if (!cancelled) {
          setUri(remoteUrl);
          setReady(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [remoteUrl]);

  return { uri, ready };
}

function isRemoteUrl(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^https?:/i.test(value);
}
