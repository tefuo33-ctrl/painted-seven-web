// Проверка всего, что присылает браузер. Браузеру нельзя доверять: его код можно поменять,
// поэтому сервер принимает только данные правильного вида и в разумных пределах.

import { type BotLevel, type Card, type JokerChoice, type JokerDemand, type RuleSettings, RANKS, SUITS } from '../src/engine';

const BOT_LEVELS: BotLevel[] = ['easy', 'normal', 'hard', 'expert'];
const JOKER_DEMANDS: JokerDemand[] = ['trump', 'strongest', 'weakest', 'suit'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function intIn(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

function oneOf<T extends string>(value: unknown, options: readonly T[]): T | undefined {
  return typeof value === 'string' && (options as readonly string[]).includes(value) ? (value as T) : undefined;
}

function bool(value: unknown): boolean | undefined {
  return value === true || value === false ? value : undefined;
}

/**
 * Настройки правил от создателя комнаты: только известные ключи, только числа и слова
 * в допустимых пределах. Всё остальное отбрасывается (тогда действует значение по умолчанию).
 */
export function cleanSettings(raw: unknown): Partial<RuleSettings> {
  if (!isObject(raw)) return {};
  const turnSeconds = intIn(raw.turnSeconds, 0, 600);
  const settings: Partial<RuleSettings> = {
    underbidRule: oneOf(raw.underbidRule, ['perMissing', 'perBid'] as const),
    zeroBidPoints: intIn(raw.zeroBidPoints, -100, 100),
    minusStarBonus: intIn(raw.minusStarBonus, -1000, 1000),
    plusStarPenalty: intIn(raw.plusStarPenalty, -1000, 1000),
    minusPerTrick: intIn(raw.minusPerTrick, -100, 100),
    plusPerTrick: intIn(raw.plusPerTrick, -100, 100),
    forbidSumEqualsCards: bool(raw.forbidSumEqualsCards),
    maxPassesInRow: intIn(raw.maxPassesInRow, 0, 10),
    // Таймер хода: выключен (0) или от 5 секунд до 10 минут.
    turnSeconds: turnSeconds === 0 || (turnSeconds !== undefined && turnSeconds >= 5) ? turnSeconds : undefined,
    timeoutPenalty: intIn(raw.timeoutPenalty, 0, 100),
    maxTimeouts: intIn(raw.maxTimeouts, 1, 10),
    botLevel: oneOf(raw.botLevel, BOT_LEVELS),
    jokerRequests: bool(raw.jokerRequests),
    gameLength: oneOf(raw.gameLength, ['full', 'short'] as const),
  };
  for (const key of Object.keys(settings) as (keyof RuleSettings)[]) {
    if (settings[key] === undefined) delete settings[key];
  }
  return settings;
}

/**
 * Номер браузера (crypto.randomUUID() в браузере): строка из букв, цифр и дефисов, 16–64 знака.
 * Пустые, «undefined», «null», числа и объекты не принимаются.
 */
export function cleanClientId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (raw.length < 16 || raw.length > 64 || !/^[A-Za-z0-9-]+$/.test(raw)) return null;
  return raw;
}

/** Код комнаты: пять знаков из алфавита кодов. */
export function cleanRoomCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.toUpperCase().trim();
  return /^[A-Z2-9]{5}$/.test(code) ? code : null;
}

/** Секрет места (выдаёт сервер): 32 шестнадцатеричных знака. */
export function cleanToken(raw: unknown): string | null {
  return typeof raw === 'string' && /^[0-9a-f]{32}$/.test(raw) ? raw : null;
}

/** Карта: только масть и ранг — никаких лишних полей. */
export function cleanCard(raw: unknown): Card | null {
  if (!isObject(raw)) return null;
  const suit = oneOf(raw.suit, SUITS);
  const rank = typeof raw.rank === 'number' && (RANKS as number[]).includes(raw.rank) ? (raw.rank as Card['rank']) : undefined;
  return suit && rank ? { suit, rank } : null;
}

/** Выбор режима джокера: только известные поля и значения. */
export function cleanJoker(raw: unknown): JokerChoice | undefined {
  if (!isObject(raw)) return undefined;
  const mode = oneOf(raw.mode, ['high', 'low'] as const);
  if (!mode) return undefined;
  const choice: JokerChoice = { mode };
  const demand = oneOf(raw.demand, JOKER_DEMANDS);
  if (demand) choice.demand = demand;
  const suit = oneOf(raw.suit, SUITS);
  if (suit) choice.suit = suit;
  return choice;
}

export function cleanBotLevel(raw: unknown): BotLevel | undefined {
  return oneOf(raw, BOT_LEVELS);
}

export function cleanInt(raw: unknown, min: number, max: number): number | undefined {
  return intIn(raw, min, max);
}

export { isObject };
