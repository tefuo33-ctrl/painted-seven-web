// Тесты главного правила: масть → козырь → любая карта; кто забирает взятку.
// Номера T-NN — сценарии из заметок «08 Tests/Tests Follow Suit and Trump».

import { describe, expect, it } from 'vitest';
import {
  type Play,
  type Suit,
  cardLabel,
  legalCards,
  parseCards,
  trickWinner,
} from '../src/engine';

/** Легальные карты в виде строк, например ['6♥']. */
function legal(handText: string, trickText: string, trump: Suit | null): string[] {
  const plays: Play[] = parseCards(trickText).map((card, i) => ({ player: i, card }));
  return legalCards({ hand: parseCards(handText), plays, trump }).map(cardLabel).sort();
}

/** Номер игрока (по порядку хода), который забирает взятку. */
function winner(trickText: string, trump: Suit | null): number {
  const plays: Play[] = parseCards(trickText).map((card, i) => ({ player: i, card }));
  return trickWinner(plays, trump);
}

describe('Обязан ходить в масть', () => {
  it('T-01: есть масть захода — легальна только она', () => {
    expect(legal('♥6 ♣Т ♦7', '♥10', 'diamonds')).toEqual(['6♥']);
  });

  it('T-02: несколько карт масти — все легальны', () => {
    expect(legal('♠6 ♠К ♥Т', '♠9', 'clubs')).toEqual(['6♠', 'К♠']);
  });

  it('T-05: козырь запрещён, если есть масть', () => {
    expect(legal('♥6 ♦Т', '♥10', 'diamonds')).not.toContain('Т♦');
  });

  it('T-06: заход — любая карта', () => {
    expect(legal('♥6 ♦Т ♣8', '', 'diamonds')).toHaveLength(3);
  });

  it('масть определяет первая карта взятки, а не последняя', () => {
    expect(legal('♥6 ♣7', '♥10 ♣Т', 'diamonds')).toEqual(['6♥']);
  });
});

describe('Козырь', () => {
  it('T-03: нет масти — обязан козырь', () => {
    expect(legal('♣К ♦9 ♦Т', '♥10', 'diamonds')).toEqual(['9♦', 'Т♦']);
  });

  it('T-04: нет масти и нет козыря — любая карта', () => {
    expect(legal('♠Т ♣8', '♥10', 'diamonds')).toEqual(['8♣', 'Т♠']);
  });

  it('T-10: «Без козыря» — нет масти, значит любая карта', () => {
    expect(legal('♦Т ♣8', '♥10', null)).toEqual(['8♣', 'Т♦']);
  });

  it('зашли с козыря — обязан козырь', () => {
    expect(legal('♦6 ♥Т', '♦10', 'diamonds')).toEqual(['6♦']);
  });
});

describe('Кто забирает взятку', () => {
  it('T-07: старшая карта масти захода', () => {
    expect(winner('♥10 ♥К ♣Т ♥6', 'diamonds')).toBe(1);
  });

  it('T-08: козырь бьёт старшую карту масти', () => {
    expect(winner('♥Т ♦6 ♥К ♣Т', 'diamonds')).toBe(1);
  });

  it('T-09: старший из нескольких козырей', () => {
    expect(winner('♥Т ♦6 ♦В ♦9', 'diamonds')).toBe(2);
  });

  it('T-10: без козыря чужая масть не бьёт', () => {
    expect(winner('♥10 ♦Т ♥6 ♥7', null)).toBe(0);
  });

  it('старшинство: 6 < … < 10 < В < Д < К < Т', () => {
    expect(winner('♣10 ♣В ♣Д ♣К', null)).toBe(3);
    expect(winner('♣Т ♣К ♣Д ♣В', null)).toBe(0);
    expect(winner('♣6 ♣10 ♣9 ♣7', null)).toBe(1);
  });

  it('пример 1 из заметок: единственный козырь забирает', () => {
    expect(winner('♥10 ♥6 ♦9 ♠Т', 'diamonds')).toBe(2);
  });
});
