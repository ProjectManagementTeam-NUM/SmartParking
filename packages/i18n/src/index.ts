import i18next, { type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { mn } from "./locales/mn";

export const SUPPORTED_LANGUAGES = ["mn", "en"] as const;
export type Language = (typeof SUPPORTED_LANGUAGES)[number];
export const LANGUAGE_STORAGE_KEY = "sp.lang";

function isLanguage(value: unknown): value is Language {
  return SUPPORTED_LANGUAGES.includes(value as Language);
}

function readStoredLanguage(): Language {
  try {
    const stored = globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(stored) ? stored : "mn";
  } catch {
    return "mn";
  }
}

export function initI18n(): i18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources: { mn: { translation: mn }, en: { translation: en } },
    lng: readStoredLanguage(),
    fallbackLng: "mn",
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}

export async function setLanguage(instance: i18n, lng: Language): Promise<void> {
  await instance.changeLanguage(lng);
  try {
    globalThis.localStorage?.setItem(LANGUAGE_STORAGE_KEY, lng);
  } catch {
    // Storage blocked (private mode): language still switches for this session.
  }
}
