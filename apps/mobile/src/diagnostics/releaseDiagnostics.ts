import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';

import { API_BASE_URL, getApiHost } from '../api/client';
import { recordError as recordCrashlyticsError } from './crashlyticsBridge';

export type DiagnosticCategory =
  | 'lifecycle'
  | 'api_timeout'
  | 'api_network'
  | 'api_http'
  | 'api_slow'
  | 'auth'
  | 'js_fatal'
  | 'js_promise'
  | 'react_boundary'
  | 'socket'
  | 'agora'
  | 'session'
  | 'native_note';

const LOG_FILENAME = 'haka-release-diagnostics.log';
const MAX_MEMORY_LINES = 400;
const MAX_FILE_BYTES = 512_000;

/**
 * Captured at module evaluation — this file is imported on the very first line
 * of App.tsx, so it is the earliest JS timestamp available and serves as the
 * cold-start "t0" for the time-to-interactive metric (see logAppInteractive).
 */
const BOOT_START_MS = Date.now();
let interactiveLogged = false;

/** Elapsed ms since JS boot. */
export function getBootElapsedMs(): number {
  return Date.now() - BOOT_START_MS;
}

/**
 * Log time-to-interactive exactly once, when the first real screen is ready to
 * render. Baseline metric for performance work — read it from the diagnostics
 * log as `lifecycle app_interactive ttiMs=…`.
 */
export function logAppInteractive(detail?: Record<string, unknown>): void {
  if (interactiveLogged) return;
  interactiveLogged = true;
  logDiagnostic('lifecycle', 'app_interactive', { ttiMs: getBootElapsedMs(), ...detail });
}

const memoryLines: string[] = [];
let flushChain: Promise<void> = Promise.resolve();
let initialized = false;

/** Active on release APK/AAB; in dev only when EXPO_PUBLIC_DIAGNOSTICS=true. */
export function isReleaseDiagnosticsEnabled(): boolean {
  if (__DEV__) {
    return process.env.EXPO_PUBLIC_DIAGNOSTICS === 'true';
  }
  return true;
}

function logFileUri(): string | null {
  const base = FileSystem.documentDirectory;
  if (!base) return null;
  return `${base}${LOG_FILENAME}`;
}

function formatLine(
  category: DiagnosticCategory,
  message: string,
  detail?: Record<string, unknown>,
): string {
  const ts = new Date().toISOString();
  let extra = '';
  if (detail && Object.keys(detail).length > 0) {
    try {
      extra = ` ${JSON.stringify(detail)}`;
    } catch {
      extra = ' {"detail":"[unserializable]"}';
    }
  }
  return `${ts} [${category}] ${message}${extra}\n`;
}

async function trimLogFile(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.size == null || info.size <= MAX_FILE_BYTES) return;
    const content = await FileSystem.readAsStringAsync(uri);
    const trimmed = content.slice(-Math.floor(MAX_FILE_BYTES * 0.75));
    const firstNewline = trimmed.indexOf('\n');
    const body = firstNewline >= 0 ? trimmed.slice(firstNewline + 1) : trimmed;
    await FileSystem.writeAsStringAsync(uri, body);
  } catch {
    /* best-effort */
  }
}

async function appendToFileSafe(line: string): Promise<void> {
  const uri = logFileUri();
  if (!uri) return;
  try {
    let existing = '';
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      existing = await FileSystem.readAsStringAsync(uri);
    }
    await FileSystem.writeAsStringAsync(uri, existing + line, { encoding: 'utf8' });
    await trimLogFile(uri);
  } catch {
    /* ignore disk errors */
  }
}

/** Ring buffer + persisted log for release APK/AAB troubleshooting. */
export function logDiagnostic(
  category: DiagnosticCategory,
  message: string,
  detail?: Record<string, unknown>,
): void {
  if (!isReleaseDiagnosticsEnabled()) return;

  const line = formatLine(category, message, detail);
  memoryLines.push(line);
  if (memoryLines.length > MAX_MEMORY_LINES) {
    memoryLines.splice(0, memoryLines.length - MAX_MEMORY_LINES);
  }
  console.warn('[HakaDiag]', line.trim());
  flushChain = flushChain.then(() => appendToFileSafe(line)).catch(() => {});
}

export function getInMemoryDiagnosticLog(maxLines = 250): string {
  const slice = memoryLines.slice(-maxLines);
  return slice.join('').trimEnd();
}

export async function readPersistedDiagnosticLog(): Promise<string> {
  const uri = logFileUri();
  if (!uri) return getInMemoryDiagnosticLog(400);
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return getInMemoryDiagnosticLog(400);
    const disk = await FileSystem.readAsStringAsync(uri);
    const mem = getInMemoryDiagnosticLog(80);
    if (!mem) return disk.trimEnd();
    if (!disk) return mem;
    return `${disk.trimEnd()}\n--- memory tail ---\n${mem}`;
  } catch {
    return getInMemoryDiagnosticLog(400);
  }
}

export async function clearDiagnosticLog(): Promise<void> {
  memoryLines.length = 0;
  const uri = logFileUri();
  if (!uri) return;
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    /* ignore */
  }
  logDiagnostic('lifecycle', 'log_cleared');
}

function buildStartupDetail(): Record<string, unknown> {
  return {
    apiHost: getApiHost(),
    apiBase: API_BASE_URL,
    platform: Platform.OS,
    osVersion: Platform.Version,
    appVersion: Constants.expoConfig?.version ?? '',
    nativeAppVersion: Constants.nativeAppVersion ?? '',
    buildProfile: process.env.EAS_BUILD_PROFILE ?? '',
    executionEnv: Constants.executionEnvironment ?? '',
  };
}

/** Call once at app entry (before UI). Wires global handlers on release builds. */
export function initReleaseDiagnostics(): void | (() => void) {
  if (!isReleaseDiagnosticsEnabled() || initialized) return;
  initialized = true;

  logDiagnostic('lifecycle', 'diagnostics_enabled', buildStartupDetail());
  logDiagnostic(
    'native_note',
    'Native force-close (Agora/OOM) may not appear here; use: adb logcat | grep -E FATAL|AndroidRuntime|Agora',
  );

  const sub = AppState.addEventListener('change', (next) => {
    logDiagnostic('lifecycle', 'app_state', { state: next });
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ErrorUtils = (global as any).ErrorUtils;
  const previousHandler = ErrorUtils?.getGlobalHandler?.();

  ErrorUtils?.setGlobalHandler?.((error: unknown, isFatal?: boolean) => {
    const err = error instanceof Error ? error : new Error(String(error));
    logDiagnostic('js_fatal', err.message, {
      isFatal: !!isFatal,
      name: err.name,
      stack: err.stack?.slice(0, 2000),
    });
    recordCrashlyticsError(err, `js_fatal isFatal=${!!isFatal}`);
    if (__DEV__ && isFatal && previousHandler) {
      previousHandler(error, isFatal);
    }
  });

  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : String(reason);
      logDiagnostic('js_promise', message, {
        stack: reason instanceof Error ? reason.stack?.slice(0, 1500) : undefined,
      });
      const err = reason instanceof Error ? reason : new Error(message);
      recordCrashlyticsError(err, 'unhandledrejection');
    });
  }

  // Prevent listener leak on fast refresh in dev with diagnostics flag
  if (__DEV__) {
    return () => sub.remove();
  }
}
