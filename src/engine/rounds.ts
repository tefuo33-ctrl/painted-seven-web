// Последовательность раундов партии.

export type RoundMode = 'normal' | 'noTrump' | 'dark' | 'minus' | 'plus';

export interface RoundSpec {
  mode: RoundMode;
  /** Сколько карт на руке у каждого. */
  cards: number;
}

export const PLAYER_COUNT = 4;
export const MAX_CARDS = 9; // 36 карт / 4 игрока

/** Полная партия: 1…8, затем «9» ×4, «Без козыря» ×4, «Тёмная» ×4, «Минуса» ×4, «Плюса» ×4 = 28. */
export function buildRoundSequence(length: 'full' | 'short' = 'full'): RoundSpec[] {
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
    for (let i = 0; i < PLAYER_COUNT; i++) {
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
