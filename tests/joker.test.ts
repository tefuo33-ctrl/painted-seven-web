// Тесты семёрки пик (джокера). T-11 … T-18 — сценарии из заметок «08 Tests/Tests Joker».

import { describe, expect, it } from 'vitest';
import {
  type Card,
  type JokerChoice,
  type Play,
  DEFAULT_SETTINGS,
  cardLabel,
  jokerOptions,
  legalCards,
  parseCard,
  parseCards,
  requestedCards,
  trickWinner,
} from '../src/engine';

const JOKER = parseCard('7♠');

function plays(text: string, joker?: JokerChoice): Play[] {
  return parseCards(text).map((card, i) => {
    const play: Play = { player: i, card };
    if (card.suit === 'spades' && card.rank === 7 && joker) play.joker = joker;
    return play;
  });
}

function labels(cards: Card[]): string[] {
  return cards.map(cardLabel).sort();
}

describe('Джокер можно бросить в любой момент', () => {
  it('T-11: легален, даже если есть масть захода', () => {
    const result = legalCards({ hand: parseCards('♥6 7♠'), plays: plays('♥10'), trump: 'diamonds' });
    expect(labels(result)).toEqual(['6♥', '7♠']);
  });

  it('T-12: легален, даже если надо козырять', () => {
    const result = legalCards({ hand: parseCards('♦9 7♠ ♣К'), plays: plays('♥10'), trump: 'diamonds' });
    expect(labels(result)).toEqual(['7♠', '9♦']);
  });

  it('джокер не считается пикой: на заход в пики он не обязателен', () => {
    const result = legalCards({ hand: parseCards('7♠ ♥6 ♣8'), plays: plays('♠10'), trump: 'diamonds' });
    expect(labels(result)).toEqual(['6♥', '7♠', '8♣']);
  });

  it('джокер не считается козырем при козыре пики', () => {
    const result = legalCards({ hand: parseCards('7♠ ♥6 ♣8'), plays: plays('♦10'), trump: 'spades' });
    expect(labels(result)).toEqual(['6♥', '7♠', '8♣']);
  });
});

describe('Режим «самая сильная»', () => {
  it('T-13: забирает взятку против старшего козыря', () => {
    expect(trickWinner(plays('♥Т ♣Т 7♠ ♥6', { mode: 'high' }), 'clubs')).toBe(2);
  });

  it('T-14: на заходе забирает взятку', () => {
    expect(trickWinner(plays('7♠ ♦Т ♦К ♥Т', { mode: 'high' }), 'diamonds')).toBe(0);
  });

  it('T-15: после захода сильным джокером остальные кладут любую карту', () => {
    const result = legalCards({
      hand: parseCards('♥6 ♥К ♣8'),
      plays: plays('7♠ ♥10', { mode: 'high' }),
      trump: 'diamonds',
    });
    expect(result).toHaveLength(3);
  });

  it('T-16: остаётся джокером, когда пики — козырь', () => {
    expect(trickWinner(plays('♠Т 7♠ ♠К ♠6', { mode: 'high' }), 'spades')).toBe(1);
  });

  it('T-17: работает в «Без козыря»', () => {
    expect(trickWinner(plays('♥Т 7♠ ♥К ♥6', { mode: 'high' }), null)).toBe(1);
  });
});

describe('Режим «самая слабая»', () => {
  it('T-18: джокер «на проигрыш» взятку не берёт', () => {
    expect(trickWinner(plays('♥6 7♠ ♥8 ♣Т', { mode: 'low' }), 'diamonds')).toBe(2);
  });

  it('зашли слабым джокером: масть задаёт следующая карта', () => {
    const trick = plays('7♠ ♥10', { mode: 'low' });
    const result = legalCards({ hand: parseCards('♥6 ♣Т ♦7'), plays: trick, trump: 'diamonds' });
    expect(labels(result)).toEqual(['6♥']);
    expect(trickWinner(plays('7♠ ♥10 ♥К ♣Т', { mode: 'low' }), 'diamonds')).toBe(2);
  });

  it('на столе только слабый джокер — следующий кладёт любую карту', () => {
    const result = legalCards({
      hand: parseCards('♥6 ♣Т'),
      plays: plays('7♠', { mode: 'low' }),
      trump: 'diamonds',
    });
    expect(result).toHaveLength(2);
  });
});

describe('Режимы «попросить карту»', () => {
  it('попросить козырь: соперник обязан положить старший козырь, даже имея масть', () => {
    const trick = plays('♥10 7♠', { mode: 'askTrump', target: 2 });
    const result = legalCards({
      hand: parseCards('♥6 ♦9 ♦К ♣Т'),
      plays: trick,
      trump: 'diamonds',
      player: 2,
    });
    expect(labels(result)).toEqual(['К♦']);
  });

  it('попросить козырь, а козырей нет — действуют обычные правила', () => {
    const trick = plays('♥10 7♠', { mode: 'askTrump', target: 2 });
    const result = legalCards({
      hand: parseCards('♥6 ♣Т'),
      plays: trick,
      trump: 'diamonds',
      player: 2,
    });
    expect(labels(result)).toEqual(['6♥']);
  });

  it('просьба касается только названного игрока', () => {
    const trick = plays('♥10 7♠', { mode: 'askTrump', target: 3 });
    const result = legalCards({
      hand: parseCards('♥6 ♦К'),
      plays: trick,
      trump: 'diamonds',
      player: 2,
    });
    expect(labels(result)).toEqual(['6♥']);
  });

  it('самая сильная карта: старший козырь, а без козырей — старший ранг', () => {
    expect(labels(requestedCards(parseCards('♥Т ♦6 ♦9'), 'askStrongest', 'diamonds'))).toEqual(['9♦']);
    expect(labels(requestedCards(parseCards('♥Т ♣К ♣6'), 'askStrongest', 'diamonds'))).toEqual(['Т♥']);
    expect(labels(requestedCards(parseCards('♥Т ♣Т ♣6'), 'askStrongest', null))).toEqual(['Т♣', 'Т♥']);
  });

  it('самая слабая карта: младшая некозырная, а если одни козыри — младший козырь', () => {
    expect(labels(requestedCards(parseCards('♥8 ♦6 ♣К'), 'askWeakest', 'diamonds'))).toEqual(['8♥']);
    expect(labels(requestedCards(parseCards('♦6 ♦9'), 'askWeakest', 'diamonds'))).toEqual(['6♦']);
  });

  it('по умолчанию джокер с просьбой забирает взятку; настройкой — не забирает', () => {
    const trick = plays('♥Т 7♠ ♦Т ♥6', { mode: 'askStrongest', target: 2 });
    expect(trickWinner(trick, 'diamonds')).toBe(1);
    const lowSettings = { ...DEFAULT_SETTINGS, jokerRequestStrength: 'low' as const };
    expect(trickWinner(trick, 'diamonds', lowSettings)).toBe(2);
  });

  it('просить можно только у тех, кто ещё не ходил', () => {
    // Игрок 2 кладёт джокер третьим: не ходил только игрок 3.
    const options = jokerOptions(plays('♥10 ♥6'), 2, 'diamonds');
    expect(options.find((o) => o.mode === 'askTrump')?.targets).toEqual([3]);
    // Джокер последним: просить некого, остаются «слабая» и «сильная».
    const last = jokerOptions(plays('♥10 ♥6 ♥8'), 3, 'diamonds');
    expect(last.map((o) => o.mode).sort()).toEqual(['high', 'low']);
  });

  it('в «Без козыря» попросить козырь нельзя; просьбы выключаются настройкой', () => {
    const noTrump = jokerOptions([], 0, null);
    expect(noTrump.some((o) => o.mode === 'askTrump')).toBe(false);
    expect(noTrump.some((o) => o.mode === 'askStrongest')).toBe(true);
    const off = jokerOptions([], 0, 'hearts', { ...DEFAULT_SETTINGS, jokerRequests: false });
    expect(off).toHaveLength(2);
  });
});

it('в колоде ровно один джокер', () => {
  expect(JOKER).toEqual({ suit: 'spades', rank: 7 });
});
