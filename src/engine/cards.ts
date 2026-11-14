// Карты и колода. Здесь нет ничего про экран: только данные и простые функции.

export const SUITS = ['spades', 'clubs', 'diamonds', 'hearts'] as const;
export type Suit = (typeof SUITS)[number];

/** Ранг: 6…10, 11 = валет, 12 = дама, 13 = король, 14 = туз. */
export type Rank = 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14;
export const RANKS: Rank[] = [6, 7, 8, 9, 10, 11, 12, 13, 14];

export interface Card {
  suit: Suit;
  rank: Rank;
}

export const SUIT_SYMBOL: Record<Suit, string> = {
  spades: '♠',
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
};

export const SUIT_NAME: Record<Suit, string> = {
  spades: 'пики',
  clubs: 'трефы',
  diamonds: 'бубны',
  hearts: 'червы',
};

const RANK_LABEL: Record<Rank, string> = {
  6: '6',
  7: '7',
  8: '8',
  9: '9',
  10: '10',
  11: 'В',
  12: 'Д',
  13: 'К',
  14: 'Т',
};

export function rankLabel(rank: Rank): string {
  return RANK_LABEL[rank];
}

/** Короткая запись карты, например «10♥» или «Т♠». */
export function cardLabel(card: Card): string {
  return RANK_LABEL[card.rank] + SUIT_SYMBOL[card.suit];
}

export function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/** Семёрка пик — джокер. */
export function isJoker(card: Card): boolean {
  return card.suit === 'spades' && card.rank === 7;
}

/** Новая колода из 36 карт в фиксированном порядке. */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/**
 * Читает карту из строки: «♥10», «10♥», «Т♣», «7♠». Удобно в тестах.
 * Буквы рангов — русские (В, Д, К, Т) или латинские (J, Q, K, A).
 */
export function parseCard(text: string): Card {
  const suit = SUITS.find((s) => text.includes(SUIT_SYMBOL[s]));
  if (!suit) throw new Error(`Не найдена масть в «${text}»`);
  const rankText = text.replace(SUIT_SYMBOL[suit], '').trim().toUpperCase();
  const letters: Record<string, Rank> = {
    В: 11, J: 11,
    Д: 12, Q: 12,
    К: 13, K: 13,
    Т: 14, A: 14,
  };
  const rank = letters[rankText] ?? (Number(rankText) as Rank);
  if (!RANKS.includes(rank)) throw new Error(`Не понят ранг в «${text}»`);
  return { suit, rank };
}

/** Несколько карт через пробел: parseCards('♥6 ♣Т ♦7'). */
export function parseCards(text: string): Card[] {
  return text.split(/\s+/).filter(Boolean).map(parseCard);
}
