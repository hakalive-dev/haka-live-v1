import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import { resources } from './resources';

// Initialize the i18next singleton once at app startup (App.tsx imports this
// module for its side effect). Components consume translations via the reactive
// `useTranslation()` hook, which re-renders on the `languageChanged` event — so
// changing the language updates the UI without a reload.
//
// Initial language is 'en'; the real preference (explicit choice or system
// language) is applied after the user's settings load — see applyLanguage.ts.
void i18n.use(initReactI18next).init({
  resources,
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes against XSS.
  },
  returnNull: false,
});

export default i18n;
