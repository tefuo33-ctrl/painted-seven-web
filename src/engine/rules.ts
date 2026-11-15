// Главное правило: какие карты можно положить и кто забирает взятку.
// Самая важная часть движка — покрыта тестами в tests/rules.test.ts и tests/joker.test.ts.

import { type Card, type Suit, isJoker } from './cards';
import { DEFAULT_SETTINGS, type RuleSettings } from './settings';

/** Сила джокера (7♠): high — самая сильная карта, low — самая слабая. */
export type JokerMode = 'high' | 'low';

/** Что можно потребовать у остальных, заходя с джокера. */
export type JokerDemand = 'trump' | 'strongest' | 'weakest';

export interface JokerChoice {
  mode: JokerMode;
  /** Требование ко всем остальным игрокам (только при заходе с джокера). */
  demand?: JokerDemand;
}

/** Одна карта, положенная во взятку. */
export interface Play {
  player: number;
  card: Card;
  /** Заполнено, только если карта — джокер. */
  joker?: JokerChoice;
}

/** Берёт ли джокер взятку при таком выборе. */
export function jokerStrength(choice: JokerChoice | undefined): JokerMode {
  return choice?.mode ?? 'high';
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
 * Какие карты обязан положить игрок по требованию джокера.
 * Пустой список значит «выполнить нечем» — тогда действуют обычные правила.
 */
export function requestedCards(hand: Card[], demand: JokerDemand, trump: Suit | null): Card[] {
  const cards = hand.filter((c) => !isJoker(c));
  const trumps = cards.filter((c) => c.suit === trump);
  const others = cards.filter((c) => c.suit !== trump);
  if (demand === 'trump') {
    return trumps.filter((c) => c.rank === maxRank(trumps));
  }
  if (demand === 'strongest') {
    if (trumps.length > 0) return trumps.filter((c) => c.rank === maxRank(trumps));
    return others.filter((c) => c.rank === maxRank(others));
  }
  if (others.length > 0) return others.filter((c) => c.rank === minRank(others));
  return trumps.filter((c) => c.rank === minRank(trumps));
}

export interface LegalContext {
  hand: Card[];
  /** Карты, уже лежащие во взятке (по порядку). */
  plays: Play[];
  /** Козырь или null, если козыря нет. */
  trump: Suit | null;
  settings?: RuleSettings;
}

/** Возвращает карты из руки, которыми сейчас можно пойти. */
export function legalCards(ctx: LegalContext): Card[] {
  const { hand, plays, trump } = ctx;
  const settings = ctx.settings ?? DEFAULT_SETTINGS;

  // Заход: любая карта.
  if (plays.length === 0) return hand.slice();

  const first = plays[0];
  if (isJoker(first.card)) {
    // Зашли с джокера и что-то потребовали — каждый обязан положить именно это.
    if (first.joker?.demand && settings.jokerRequests) {
      const requested = requestedCards(hand, first.joker.demand, trump);
      if (requested.length > 0) return requested;
    }
    // Джокер забирает взятку: остальные кладут что хотят.
    if (jokerStrength(first.joker) === 'high') return hand.slice();
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
export function trickWinner(plays: Play[], trump: Suit | null): number {
  const strongJoker = plays.find((p) => isJoker(p.card) && jokerStrength(p.joker) === 'high');
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

/** Что можно потребовать, кладя джокер прямо сейчас (не на заходе — ничего). */
export function jokerDemands(
  plays: Play[],
  trump: Suit | null,
  settings: RuleSettings = DEFAULT_SETTINGS,
): JokerDemand[] {
  if (plays.length > 0 || !settings.jokerRequests) return [];
  return trump !== null ? ['trump', 'strongest', 'weakest'] : ['strongest', 'weakest'];
}
