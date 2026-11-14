// Тасовка, срез и раздача. Случайность идёт через seed, чтобы партию можно было повторить.

import type { Card } from './cards';

/** Хранит состояние генератора случайных чисел (одно число — легко сохранить). */
export interface Rng {
  seed: number;
}

/** Следующее случайное число от 0 (включительно) до 1 (не включая). Алгоритм mulberry32. */
export function nextRandom(rng: Rng): number {
  rng.seed = (rng.seed + 0x6d2b79f5) | 0;
  let t = rng.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Случайное целое от min до max включительно. */
export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(nextRandom(rng) * (max - min + 1));
}

/** Возвращает перетасованную копию колоды (алгоритм Фишера — Йетса). */
export function shuffle(deck: Card[], rng: Rng): Card[] {
  const result = deck.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(rng, 0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Срез: верхние `position` карт уходят под низ. Набор карт не меняется. */
export function cutDeck(deck: Card[], position: number): Card[] {
  return [...deck.slice(position), ...deck.slice(0, position)];
}

export interface DealResult {
  hands: Card[][];
  /** Остаток колоды; rest[0] — верхняя карта. */
  rest: Card[];
  /** Последняя карта, которую раздающий сдал себе. */
  dealerLastCard: Card;
}

/**
 * Раздаёт по одной карте по часовой стрелке, начиная с соседа раздающего.
 * Раздающий получает карту последним.
 */
export function deal(
  deck: Card[],
  playerCount: number,
  cardsEach: number,
  dealer: number,
): DealResult {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  let top = 0;
  for (let round = 0; round < cardsEach; round++) {
    for (let step = 1; step <= playerCount; step++) {
      const player = (dealer + step) % playerCount;
      hands[player].push(deck[top]);
      top++;
    }
  }
  const dealerHand = hands[dealer];
  return {
    hands,
    rest: deck.slice(top),
    dealerLastCard: dealerHand[dealerHand.length - 1],
  };
}
