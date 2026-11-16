// Переводы интерфейса. Все тексты лежат в словарях (ru.ts, de.ts, en.ts) под одинаковыми ключами.
// Чтобы добавить язык: создайте словарь с типом Dictionary и впишите его в LANGUAGES.

import { de } from './de';
import { en } from './en';
import { type Dictionary, type TextKey, ru } from './ru';

export type { TextKey } from './ru';

export const LANGUAGES = {
  ru: { name: 'Русский', short: 'RU', dictionary: ru, ranks: { 11: 'В', 12: 'Д', 13: 'К', 14: 'Т' } },
  de: { name: 'Deutsch', short: 'DE', dictionary: de, ranks: { 11: 'B', 12: 'D', 13: 'K', 14: 'A' } },
  en: { name: 'English', short: 'EN', dictionary: en, ranks: { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' } },
} satisfies Record<string, { name: string; short: string; dictionary: Dictionary; ranks: Record<number, string> }>;

export type Language = keyof typeof LANGUAGES;

const LANGUAGE_KEY = 'painted-seven-language';
let current: Language = 'ru';
const listeners: (() => void)[] = [];

function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && value in LANGUAGES;
}

/** Выбрать язык при запуске: сохранённый, иначе язык браузера, иначе русский. */
export function loadLanguage(): void {
  try {
    const saved = localStorage.getItem(LANGUAGE_KEY);
    if (isLanguage(saved)) {
      current = saved;
      return;
    }
  } catch {
    // хранилище недоступно — берём язык браузера
  }
  const browser = (typeof navigator !== 'undefined' ? navigator.language : 'ru').slice(0, 2).toLowerCase();
  current = isLanguage(browser) ? browser : browser === 'uk' || browser === 'be' ? 'ru' : 'en';
}

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language): void {
  current = language;
  try {
    localStorage.setItem(LANGUAGE_KEY, language);
  } catch {
    // не страшно
  }
  listeners.forEach((listener) => listener());
}

/** Вызвать функцию при смене языка (например, чтобы перерисовать буквы на картах). */
export function onLanguageChange(listener: () => void): void {
  listeners.push(listener);
}

/** Текст по ключу. `{name}` в строке заменяется на params.name. */
export function t(key: TextKey, params: Record<string, string | number> = {}): string {
  const text: string = LANGUAGES[current].dictionary[key] ?? ru[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
}

/** Текст по ключу, который известен только во время работы (например, из данных о скинах). */
export function tKey(key: string, params: Record<string, string | number> = {}): string {
  return key in ru ? t(key as TextKey, params) : key;
}

/** Буква ранга на карте: В/Д/К/Т, B/D/K/A или J/Q/K/A. */
export function rankLetter(rank: number): string {
  const letters: Record<number, string> = LANGUAGES[current].ranks;
  return letters[rank] ?? String(rank);
}

/** «5 карт», «2 карты», «1 карта» — с правильным окончанием для языка. */
export function cardsCount(n: number): string {
  if (n === 1) return t('round.cards.one', { n });
  if (current === 'ru' && n >= 2 && n <= 4) return t('round.cards.few', { n });
  return t('round.cards.many', { n });
}

const LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k',
  л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya', і: 'i', ї: 'yi', є: 'ye',
};

/**
 * Имя игрока для текущего языка: на немецком и английском кириллица пишется латиницей,
 * чтобы друзья из других стран могли прочитать имена ботов и соперников.
 */
export function localName(name: string): string {
  if (current === 'ru' || !/[а-яёіїє]/i.test(name)) return name;
  const text = name.replace(/дж/gi, (m) => (m[0] === 'Д' ? 'J' : 'j'));
  let out = '';
  for (const char of text) {
    const lower = char.toLowerCase();
    const latin = LATIN[lower];
    if (latin === undefined) out += char;
    else out += char === lower ? latin : latin.charAt(0).toUpperCase() + latin.slice(1);
  }
  return out;
}
