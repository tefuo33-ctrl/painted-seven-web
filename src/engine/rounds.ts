// Последовательность раундов партии.

export type RoundMode = 'normal' | 'noTrump' | 'dark' | 'minus' | 'plus';

export interface RoundSpec {
  mode: RoundMode;
  /** Сколько карт на руке у каждого. */
  cards: number;
}

/** Сколько игроков за столом, если не сказано иное. Играть можно вдвоём, втроём и вчетвером. */
export const PLAYER_COUNT = 4;
export const MIN_PLAYERS = 2;
export const MAX_CARDS = 9; // 36 карт / 4 игрока

/**
 * Полная партия: 1…8, затем «9», «Без козыря», «Тёмная», «Минуса», «Плюса» — каждый столько раз,
 * сколько игроков (чтобы каждый по разу раздал). Вчетвером: 8 + 5 × 4 = 28 раундов.
 */
export function buildRoundSequence(length: 'full' | 'short' = 'full', players = PLAYER_COUNT): RoundSpec[] {
  if (length === 'short') {
    return [
      { mode: 'normal', cards: 2 },
      { mode: 'normal', cards: 5 },
      { mode: 'normal', cards: MAX_CARDS },
      { mode: 'noTrump', cards: MAX_CARDS },
      { mode: 'dark', cards: MAX_CARDS },
      { mode: 'minus', cards: MAX_CARDS },
      { mode: 'plus', cards: MAX_CARDS },
    ];
  }
  const rounds: RoundSpec[] = [];
  for (let cards = 1; cards < MAX_CARDS; cards++) {
    rounds.push({ mode: 'normal', cards });
  }
  const blocks: RoundMode[] = ['normal', 'noTrump', 'dark', 'minus', 'plus'];
  for (const mode of blocks) {
    for (let i = 0; i < players; i++) {
      rounds.push({ mode, cards: MAX_CARDS });
    }
  }
  return rounds;
}

/** В «Минусах» и «Плюсах» заказа нет. */
export function hasBidding(mode: RoundMode): boolean {
  return mode === 'normal' || mode === 'noTrump' || mode === 'dark';
}

/** В «Тёмной» заказывают до раздачи. */
export function bidsBeforeDeal(mode: RoundMode): boolean {
  return mode === 'dark';
}

export function hasTrump(mode: RoundMode): boolean {
  return mode !== 'noTrump';
}

function cardsWord(n: number): string {
  if (n === 1) return 'карта';
  if (n >= 2 && n <= 4) return 'карты';
  return 'карт';
}

/** Название раунда по-русски: «5 карт», «Без козыря», … */
export function roundName(spec: RoundSpec): string {
  switch (spec.mode) {
    case 'normal':
      return `${spec.cards} ${cardsWord(spec.cards)}`;
    case 'noTrump':
      return 'Без козыря';
    case 'dark':
      return 'Тёмная';
    case 'minus':
      return 'Минуса';
    case 'plus':
      return 'Плюса';
  }
}
