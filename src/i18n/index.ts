import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { I18nManager } from 'react-native';

import en from './locales/en.json';
import he from './locales/he.json';

export const SUPPORTED_LOCALES = ['en', 'he'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const RTL_LOCALES: readonly Locale[] = ['he'];

const STORAGE_KEY = 'nailedit.locale';

function deviceLocale(): Locale {
  const tag = Localization.getLocales()[0]?.languageCode ?? 'en';
  return (SUPPORTED_LOCALES as readonly string[]).includes(tag) ? (tag as Locale) : 'en';
}

export function isRTL(locale: Locale): boolean {
  return RTL_LOCALES.includes(locale);
}

/**
 * Initialise translations.
 *
 * RTL is the fiddly part: React Native decides layout direction at native
 * level, so flipping it needs `I18nManager.forceRTL` plus an app restart. We
 * set it here on boot from the stored preference; the language settings screen
 * is what triggers the restart when a user changes it mid-session.
 */
export async function initI18n(): Promise<Locale> {
  let stored: Locale | null = null;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw && (SUPPORTED_LOCALES as readonly string[]).includes(raw)) stored = raw as Locale;
  } catch {
    // storage unavailable — fall through to the device locale
  }

  const locale = stored ?? deviceLocale();
  const rtl = isRTL(locale);

  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
    // The flip only takes full effect after a reload. On a cold start (the
    // normal case) we are already before first render, so nothing to do.
  }

  await i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, he: { translation: he } },
    lng: locale,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
    compatibilityJSON: 'v4',
  });

  return locale;
}

export async function setLocale(locale: Locale): Promise<{ needsRestart: boolean }> {
  await AsyncStorage.setItem(STORAGE_KEY, locale);
  await i18n.changeLanguage(locale);

  const rtl = isRTL(locale);
  if (I18nManager.isRTL !== rtl) {
    I18nManager.allowRTL(rtl);
    I18nManager.forceRTL(rtl);
    return { needsRestart: true };
  }
  return { needsRestart: false };
}

export function currentLocale(): Locale {
  return (i18n.language as Locale) ?? 'en';
}

export default i18n;
