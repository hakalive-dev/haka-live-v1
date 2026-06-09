import { getLocales } from 'expo-localization';

import type { UserSettings } from '@api/settings';
import i18n from './index';
import { isSupportedCode, nameToCode, type SupportedCode } from './languages';

/**
 * Best-effort device language code, mapped to a code we ship. Falls back to 'en'
 * when the device locale isn't one we support, or when detection is unavailable
 * (expo-localization is native — without a rebuild it returns nothing and we
 * default to English). Used for the "System Language" preference.
 */
export function getDeviceLanguageCode(): SupportedCode {
  try {
    const primary = getLocales()[0]?.languageCode; // e.g. "es", "zh"
    if (primary && isSupportedCode(primary)) return primary;
  } catch {
    /* native module unavailable — fall through to default */
  }
  return 'en';
}

/**
 * Resolve which language code to use from the user's saved settings. When
 * `use_system_language` is set we follow the device locale; otherwise we map the
 * stored display name (e.g. "Spanish") to its code.
 */
export function resolveLanguageCode(
  settings: Pick<UserSettings, 'use_system_language' | 'language'>,
): SupportedCode {
  if (settings.use_system_language) return getDeviceLanguageCode();
  return nameToCode(settings.language);
}

/**
 * Apply the user's saved language to the i18n instance. Safe to call on every
 * settings load; it's a no-op when already on the target language. Mirrors the
 * applyNotificationPrefs() pattern in src/services/notifications.ts.
 */
export async function applyLanguageFromSettings(
  settings: Pick<UserSettings, 'use_system_language' | 'language'>,
): Promise<void> {
  const code = resolveLanguageCode(settings);
  if (i18n.language !== code) {
    await i18n.changeLanguage(code);
  }
}
