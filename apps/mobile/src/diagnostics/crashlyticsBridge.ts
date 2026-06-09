// Safe wrapper around @react-native-firebase/crashlytics.
// Uses lazy require so the JS bundle still boots if the native module
// failed to register (e.g., immediately after a fresh install before
// Gradle plugin ran). Every call is wrapped — Crashlytics failures
// must never cascade into the very crashes we're trying to catch.

type CrashlyticsMod = typeof import('@react-native-firebase/crashlytics');

let cachedMod: CrashlyticsMod | null = null;
let attempted = false;

function loadMod(): CrashlyticsMod | null {
  if (attempted) return cachedMod;
  attempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cachedMod = require('@react-native-firebase/crashlytics') as CrashlyticsMod;
  } catch {
    cachedMod = null;
  }
  return cachedMod;
}

export function recordError(err: unknown, breadcrumb?: string): void {
  try {
    const mod = loadMod();
    if (!mod) return;
    const crashlytics = mod.getCrashlytics();
    if (breadcrumb) mod.log(crashlytics, breadcrumb);
    const error = err instanceof Error ? err : new Error(String(err));
    mod.recordError(crashlytics, error);
  } catch {
    /* never let crash reporter cause a crash */
  }
}

export function logBreadcrumb(message: string): void {
  try {
    const mod = loadMod();
    if (!mod) return;
    mod.log(mod.getCrashlytics(), message);
  } catch {
    /* noop */
  }
}

export function setAttribute(name: string, value: string): void {
  try {
    const mod = loadMod();
    if (!mod) return;
    void mod.setAttribute(mod.getCrashlytics(), name, value);
  } catch {
    /* noop */
  }
}

/** Dev-only forced crash for verifying the Crashlytics pipeline. */
export function forceTestCrash(): void {
  try {
    const mod = loadMod();
    if (!mod) return;
    mod.crash(mod.getCrashlytics());
  } catch {
    /* noop */
  }
}
