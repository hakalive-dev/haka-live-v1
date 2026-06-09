// Single source of truth for the languages the app offers and how their
// human-readable names map to the ISO codes i18next keys off of.
//
// The backend persists the user's choice as a display NAME (e.g. "Spanish"),
// not a code — see UserSettings.language in src/api/settings.ts. Keep this list
// and the resources in src/i18n/resources.ts in sync.

/** ISO 639-1 codes we ship translations for. 'en' is the source / fallback. */
export const SUPPORTED_CODES = [
  'en', 'fr', 'pt', 'es', 'ar', 'hi', 'zh', 'ja', 'ko', 'ru', 'tr', 'th',
] as const;

export type SupportedCode = (typeof SUPPORTED_CODES)[number];

/** Display names shown in the Language setting picker (English endonyms-ish). */
export const LANGUAGES: { name: string; code: SupportedCode }[] = [
  { name: 'English', code: 'en' },
  { name: 'French', code: 'fr' },
  { name: 'Portuguese', code: 'pt' },
  { name: 'Spanish', code: 'es' },
  { name: 'Arabic', code: 'ar' },
  { name: 'Hindi', code: 'hi' },
  { name: 'Chinese', code: 'zh' },
  { name: 'Japanese', code: 'ja' },
  { name: 'Korean', code: 'ko' },
  { name: 'Russian', code: 'ru' },
  { name: 'Turkish', code: 'tr' },
  { name: 'Thai', code: 'th' },
];

export const LANGUAGE_NAME_TO_CODE: Record<string, SupportedCode> = LANGUAGES.reduce(
  (acc, { name, code }) => {
    acc[name] = code;
    return acc;
  },
  {} as Record<string, SupportedCode>,
);

const SUPPORTED_SET = new Set<string>(SUPPORTED_CODES);

export function isSupportedCode(code: string): code is SupportedCode {
  return SUPPORTED_SET.has(code);
}

/** Map a display name ("Spanish") to its code; falls back to 'en' if unknown. */
export function nameToCode(name: string | null | undefined): SupportedCode {
  if (!name) return 'en';
  return LANGUAGE_NAME_TO_CODE[name] ?? 'en';
}
