// Тесты семёрки пик (джокера). T-11 … T-18 — сценарии из заметок «08 Tests/Tests Joker».

import { describe, expect, it } from 'vitest';
import {
  type Card,
  type JokerChoice,
  type Play,
  DEFAULT_SETTINGS,
  cardLabel,
  createGame,
  dealCards,
  isJoker,
  jokerDemands,
  legalCards,
  parseCard,
  parseCards,
  placeBid,
  playCard,
  requestedCards,
  trickWinner,
} from '../src/engine';

function plays(text: string, joker?: JokerChoice): Play[] {
  return parseCards(text).map((card, i) => {
    const play: Play = { player: i, card };
    if (isJoker(card) && joker) play.joker = joker;
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

  it('T-15: после захода сильным джокером без требования остальные кладут любую карту', () => {
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

describe('Заход с джокера: требование ко всем остальным', () => {
  it('потребовать козырь: каждый обязан положить свой старший козырь', () => {
    const trick = plays('7♠ ♦6', { mode: 'high', demand: 'trump' });
    const result = legalCards({ hand: parseCards('♥6 ♦9 ♦К ♣Т'), plays: trick, trump: 'diamonds' });
    expect(labels(result)).toEqual(['К♦']);
  });

  it('потребовали козырь, а козырей нет — любая карта', () => {
    const trick = plays('7♠', { mode: 'high', demand: 'trump' });
    const result = legalCards({ hand: parseCards('♥6 ♣Т'), plays: trick, trump: 'diamonds' });
    expect(labels(result)).toEqual(['6♥', 'Т♣']);
  });

  it('потребовать самую сильную: старший козырь, а без козырей — старший ранг', () => {
    expect(labels(requestedCards(parseCards('♥Т ♦6 ♦9'), 'strongest', 'diamonds'))).toEqual(['9♦']);
    expect(labels(requestedCards(parseCards('♥Т ♣К ♣6'), 'strongest', 'diamonds'))).toEqual(['Т♥']);
    expect(labels(requestedCards(parseCards('♥Т ♣Т ♣6'), 'strongest', null))).toEqual(['Т♣', 'Т♥']);
  });

  it('потребовать самую слабую: младшая некозырная, а если одни козыри — младший козырь', () => {
    expect(labels(requestedCards(parseCards('♥8 ♦6 ♣К'), 'weakest', 'diamonds'))).toEqual(['8♥']);
    expect(labels(requestedCards(parseCards('♦6 ♦9'), 'weakest', 'diamonds'))).toEqual(['6♦']);
  });

  it('требование действует на всех трёх соперников', () => {
    const trick = plays('7♠ ♥Т ♣Т', { mode: 'high', demand: 'strongest' });
    const result = legalCards({ hand: parseCards('♥6 ♠К ♣7'), plays: trick, trump: null });
    expect(labels(result)).toEqual(['К♠']);
  });

  it('слабый джокер с требованием взятку не берёт, сильный — берёт', () => {
    const low = plays('7♠ ♦Т ♥Т ♥6', { mode: 'low', demand: 'strongest' });
    expect(trickWinner(low, 'diamonds')).toBe(1);
    const high = plays('7♠ ♦Т ♥Т ♥6', { mode: 'high', demand: 'strongest' });
    expect(trickWinner(high, 'diamonds')).toBe(0);
  });

  it('требовать можно только на заходе; в «Без козыря» козырь потребовать нельзя', () => {
    expect(jokerDemands([], 'hearts')).toEqual(['trump', 'strongest', 'weakest']);
    expect(jokerDemands([], null)).toEqual(['strongest', 'weakest']);
    expect(jokerDemands(plays('♥10'), 'hearts')).toEqual([]);
    expect(jokerDemands([], 'hearts', { ...DEFAULT_SETTINGS, jokerRequests: false })).toEqual([]);
  });

  it('движок отклоняет требование, если джокер брошен не на заходе', () => {
    const game = createGame({ seed: 1, firstDealer: 3 });
    game.rounds = [{ mode: 'normal', cards: 9 }];
    dealCards(game);
    while (game.phase === 'bidding') placeBid(game, game.turn, 1);
    // Кладём джокер в руку второго игрока вместо его первой карты.
    const joker = parseCard('7♠');
    for (const hand of game.hands) {
      const index = hand.findIndex(isJoker);
      if (index >= 0) hand[index] = game.hands[1][0];
    }
    game.hands[1][0] = joker;
    playCard(game, 0, game.hands[0][0]);
    expect(() => playCard(game, 1, joker, { mode: 'high', demand: 'trump' })).toThrow();
    playCard(game, 1, joker, { mode: 'low' });
    expect(game.trick[1].joker).toEqual({ mode: 'low' });
  });
});
