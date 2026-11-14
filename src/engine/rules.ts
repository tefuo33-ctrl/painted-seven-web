// Главное правило: какие карты можно положить и кто забирает взятку.
// Самая важная часть движка — покрыта тестами в tests/rules.test.ts и tests/joker.test.ts.

import { type Card, type Suit, isJoker } from './cards';
import { DEFAULT_SETTINGS, type RuleSettings } from './settings';

/**
 * Режимы джокера (7♠):
 * high — самая сильная, low — самая слабая,
 * askTrump / askStrongest / askWeakest — попросить у игрока козырь / сильнейшую / слабейшую карту.
 */
export type JokerMode = 'high' | 'low' | 'askTrump' | 'askStrongest' | 'askWeakest';

export interface JokerChoice {
  mode: JokerMode;
  /** У кого просят карту (только для режимов ask…). */
  target?: number;
}

/** Одна карта, положенная во взятку. */
export interface Play {
  player: number;
  card: Card;
  /** Заполнено, только если карта — джокер. */
  joker?: JokerChoice;
}

export function isRequestMode(mode: JokerMode): boolean {
  return mode === 'askTrump' || mode === 'askStrongest' || mode === 'askWeakest';
}

/** Берёт ли джокер взятку при таком выборе. */
export function jokerStrength(
  choice: JokerChoice | undefined,
  settings: RuleSettings = DEFAULT_SETTINGS,
): 'high' | 'low' {
  if (!choice || choice.mode === 'high') return 'high';
  if (choice.mode === 'low') return 'low';
  return settings.jokerRequestStrength;
}

/** Масть взятки — масть первой обычной карты (джокер масти не задаёт). */
export function leadSuit(plays: Play[]): Suit | null {
  const first = plays.find((p) => !isJoker(p.card));
  return first ? first.card.suit : null;
}

function maxRank(cards: Card[]): number {
  return Math.max(...cards.map((c) => c.rank));
}

function minRank(cards: Card[]): number {
  return Math.min(...cards.map((c) => c.rank));
}

/**
 * Какие карты обязан положить игрок, у которого джокером попросили карту.
 * Пустой список значит «просьбу выполнить нечем» — тогда действуют обычные правила.
 */
export function requestedCards(hand: Card[], mode: JokerMode, trump: Suit | null): Card[] {
  const cards = hand.filter((c) => !isJoker(c));
  const trumps = cards.filter((c) => c.suit === trump);
  const others = cards.filter((c) => c.suit !== trump);
  if (mode === 'askTrump') {
    return trumps.filter((c) => c.rank === maxRank(trumps));
  }
  if (mode === 'askStrongest') {
    if (trumps.length > 0) return trumps.filter((c) => c.rank === maxRank(trumps));
    return others.filter((c) => c.rank === maxRank(others));
  }
  if (mode === 'askWeakest') {
    if (others.length > 0) return others.filter((c) => c.rank === minRank(others));
    return trumps.filter((c) => c.rank === minRank(trumps));
  }
  return [];
}

export interface LegalContext {
  hand: Card[];
  /** Карты, уже лежащие во взятке (по порядку). */
  plays: Play[];
  /** Козырь или null, если козыря нет. */
  trump: Suit | null;
  /** Номер игрока — нужен, только чтобы понять, просили ли у него карту джокером. */
  player?: number;
  settings?: RuleSettings;
}

/** Возвращает карты из руки, которыми сейчас можно пойти. */
export function legalCards(ctx: LegalContext): Card[] {
  const { hand, plays, trump } = ctx;
  const settings = ctx.settings ?? DEFAULT_SETTINGS;

  // Заход: любая карта.
  if (plays.length === 0) return hand.slice();

  // У этого игрока джокером попросили карту — он обязан её отдать.
  const jokerPlay = plays.find((p) => isJoker(p.card));
  if (
    jokerPlay?.joker &&
    isRequestMode(jokerPlay.joker.mode) &&
    ctx.player !== undefined &&
    jokerPlay.joker.target === ctx.player
  ) {
    const requested = requestedCards(hand, jokerPlay.joker.mode, trump);
    if (requested.length > 0) return requested;
  }

  // Зашли с джокера, который забирает взятку: остальные кладут что хотят.
  if (isJoker(plays[0].card) && jokerStrength(plays[0].joker, settings) === 'high') {
    return hand.slice();
  }

  const suit = leadSuit(plays);
  // На столе пока только «слабый» джокер: масть задаст следующая карта.
  if (suit === null) return hand.slice();

  const jokers = hand.filter(isJoker); // джокер можно всегда
  const normal = hand.filter((c) => !isJoker(c));

  const sameSuit = normal.filter((c) => c.suit === suit);
  if (sameSuit.length > 0) return [...sameSuit, ...jokers];

  const trumps = normal.filter((c) => c.suit === trump);
  if (trumps.length > 0) return [...trumps, ...jokers];

  return hand.slice();
}

/**
 * Кто забирает взятку: возвращает номер игрока.
 * Работает и для неполной взятки («кто побеждает прямо сейчас»).
 * Если на столе только «слабый» джокер, победителя ещё нет — вернёт -1.
 */
export function trickWinner(
  plays: Play[],
  trump: Suit | null,
  settings: RuleSettings = DEFAULT_SETTINGS,
): number {
  const strongJoker = plays.find(
    (p) => isJoker(p.card) && jokerStrength(p.joker, settings) === 'high',
  );
  if (strongJoker) return strongJoker.player;

  const normal = plays.filter((p) => !isJoker(p.card));
  if (normal.length === 0) return -1;

  const suit = normal[0].card.suit;
  let best = normal[0];
  for (const play of normal.slice(1)) {
    const bestIsTrump = best.card.suit === trump;
    const playIsTrump = play.card.suit === trump;
    if (playIsTrump && !bestIsTrump) {
      best = play;
    } else if (playIsTrump === bestIsTrump) {
      // Обе козыри или обе не козыри: сравниваем, только если карта нужной масти.
      const neededSuit = bestIsTrump ? trump : suit;
      if (play.card.suit === neededSuit && play.card.rank > best.card.rank) {
        best = play;
      }
    }
  }
  return best.player;
}

export interface JokerOption {
  mode: JokerMode;
  /** Игроки, у которых можно попросить карту (пусто для high / low). */
  targets: number[];
}

/** Какие режимы джокера доступны игроку прямо сейчас. */
export function jokerOptions(
  plays: Play[],
  player: number,
  trump: Suit | null,
  settings: RuleSettings = DEFAULT_SETTINGS,
  playerCount = 4,
): JokerOption[] {
  const options: JokerOption[] = [
    { mode: 'low', targets: [] },
    { mode: 'high', targets: [] },
  ];
  if (!settings.jokerRequests) return options;

  // Просить можно только у тех, кто ещё не положил карту в эту взятку.
  const played = new Set(plays.map((p) => p.player));
  const targets: number[] = [];
  for (let step = 1; step < playerCount; step++) {
    const other = (player + step) % playerCount;
    if (!played.has(other)) targets.push(other);
  }
  if (targets.length === 0) return options;

  if (trump !== null) options.push({ mode: 'askTrump', targets });
  options.push({ mode: 'askStrongest', targets });
  options.push({ mode: 'askWeakest', targets });
  return options;
}
