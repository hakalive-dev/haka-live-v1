import type { ImageSourcePropType } from 'react-native';

/**
 * Adaptive foreground (safe-zone padding) — matches `app.json` android.adaptiveIcon.foregroundImage.
 * Native launcher only; do not use in RN UI (transparent margins look clipped or “erased”).
 */
export const HAKA_APP_LOGO: ImageSourcePropType = require('../../assets/adaptive-icon-foreground.png');

/** Full-bleed app icon — splash, login brand, circular avatars (Haka Team, etc.). */
export const HAKA_LOGO_MARK: ImageSourcePropType = require('../../assets/icon.png');
