import { mn, type Dictionary } from "./mn";

export type Locale = "mn";
export const defaultLocale: Locale = "mn";

const dictionaries: Record<Locale, Dictionary> = { mn };

/** Single entry point for UI copy. Add "en" to `Locale` + `dictionaries` to introduce English later. */
export function getDictionary(locale: Locale = defaultLocale): Dictionary {
  return dictionaries[locale];
}

export const t = getDictionary();
export type { Dictionary };
