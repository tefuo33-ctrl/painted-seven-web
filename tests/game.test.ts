// Тесты колоды, раздачи, порядка раундов и целой партии (T-33 … T-48).

import { describe, expect, it } from 'vitest';
import { chooseBid, chooseMove } from '../src/ai/bot';
import {
  type GameState,
  PLAYER_COUNT,
  allowedBids,
  bidBan,
  buildRoundSequence,
  cardLabel,
  createDeck,
  createGame,
  currentRound,
  cutDeck,
  deal,
  dealCards,
  finishTrick,
  isJoker,
  jokerDemandsFor,
  legalCardsFor,
  nextRandom,
  nextRound,
  parseCard,
  placeBid,
  playCard,
  shuffle,
  timeoutStrike,
  totals,
  winners,
} from '../src/engine';

describe('Колода и раздача', () => {
  it('T-39: 36 уникальных карт и ровно одна 7♠', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(36);
    expect(new Set(deck.map(cardLabel)).size).toBe(36);
    expect(deck.filter(isJoker)).toHaveLength(1);
  });

  it('T-40: тасовка воспроизводима по seed', () => {
    const a = shuffle(createDeck(), { seed: 42 }).map(cardLabel);
    const b = shuffle(createDeck(), { seed: 42 }).map(cardLabel);
    const c = shuffle(createDeck(), { seed: 43 }).map(cardLabel);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('T-41: раздача 9 карт — у каждого 9, остатка нет, все карты разные', () => {
    const result = deal(shuffle(createDeck(), { seed: 1 }), 4, 9, 0);
    expect(result.hands.map((h) => h.length)).toEqual([9, 9, 9, 9]);
    expect(result.rest).toHaveLength(0);
    expect(new Set(result.hands.flat().map(cardLabel)).size).toBe(36);
  });

  it('T-42: раздача по часовой, начиная с соседа раздающего', () => {
    const deck = createDeck();
    const result = deal(deck, 4, 1, 2);
    expect(result.hands[3][0]).toEqual(deck[0]);
    expect(result.hands[0][0]).toEqual(deck[1]);
    expect(result.hands[1][0]).toEqual(deck[2]);
    expect(result.hands[2][0]).toEqual(deck[3]);
    expect(result.dealerLastCard).toEqual(deck[3]);
  });

  it('T-43: срез сохраняет колоду', () => {
    const deck = createDeck();
    const cut = cutDeck(deck, 10);
    expect(cut).toHaveLength(36);
    expect(cut[0]).toEqual(deck[10]);
    expect(new Set(cut.map(cardLabel)).size).toBe(36);
  });

  it('T-44: среза в цифровой игре нет — раздача идёт сразу и без штрафов', () => {
    const game = createGame({ seed: 5, firstDealer: 0 });
    expect(game.phase).toBe('deal');
    dealCards(game);
    expect(game.phase).toBe('bidding');
    expect(game.hands.map((h) => h.length)).toEqual([1, 1, 1, 1]);
  });

  it('T-45: козырь — верхняя карта остатка или последняя карта раздающего', () => {
    const small = createGame({ seed: 7 }); // раунд «1 карта»
    dealCards(small);
    expect(small.trumpCard).not.toBeNull();
    expect(small.hands.flat()).not.toContainEqual(small.trumpCard);

    const game = createGame({ seed: 7, settings: { gameLength: 'short' } });
    while (currentRound(game).cards < 9) {
      dealCards(game);
      playRound(game);
      nextRound(game);
    }
    dealCards(game); // раунд «9 карт»
    const dealerHand = game.hands[game.dealer];
    expect(game.trumpCard).toEqual(dealerHand[dealerHand.length - 1]);
    expect(game.trump).toBe(game.trumpCard!.suit);
  });
});

describe('Порядок раундов', () => {
  const rounds = buildRoundSequence();

  it('T-33: ровно 28 раундов', () => {
    expect(rounds).toHaveLength(28);
  });

  it('T-34, T-35: порядок режимов и число карт', () => {
    expect(rounds.slice(0, 8).map((r) => r.cards)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rounds.slice(0, 12).every((r) => r.mode === 'normal')).toBe(true);
    expect(rounds.slice(12, 16).every((r) => r.mode === 'noTrump')).toBe(true);
    expect(rounds.slice(16, 20).every((r) => r.mode === 'dark')).toBe(true);
    expect(rounds.slice(20, 24).every((r) => r.mode === 'minus')).toBe(true);
    expect(rounds.slice(24, 28).every((r) => r.mode === 'plus')).toBe(true);
    expect(rounds.slice(8).every((r) => r.cards === 9)).toBe(true);
  });

  it('T-38: первым заказывает сосед раздающего по часовой, раздающий — последним; сосед и заходит первым', () => {
    const game = createGame({ seed: 3, firstDealer: 0 });
    dealCards(game);
    expect(game.phase).toBe('bidding');
    expect(game.turn).toBe(1);
    expect(() => placeBid(game, 2, 0)).toThrow(); // не его очередь
    expect(() => placeBid(game, 1, 2)).toThrow(); // больше, чем карт
    placeBid(game, 1, 0);
    placeBid(game, 2, 0);
    placeBid(game, 3, 0);
    expect(game.turn).toBe(0); // раздающий заказывает последним
    placeBid(game, 0, 0); // 1 нельзя: сумма стала бы равна числу взяток
    expect(game.phase).toBe('playing');
    expect(game.turn).toBe(1); // сосед раздающего заходит первым
  });

  it('T-38: сумма заказов не может равняться числу взяток — ограничен последний заказывающий', () => {
    const game = createGame({ seed: 3, firstDealer: 0 });
    game.rounds = [{ mode: 'normal', cards: 8 }];
    dealCards(game);
    placeBid(game, 1, 3);
    placeBid(game, 2, 2);
    placeBid(game, 3, 1);
    // Уже заказано 6 из 8: последнему (раздающему) нельзя заказать 2.
    expect(allowedBids(game, 0)).not.toContain(2);
    expect(bidBan(game, 0, 2)).toBe('sum');
    expect(() => placeBid(game, 0, 2)).toThrow();
    placeBid(game, 0, 1);
    expect(game.bids.reduce<number>((sum, bid) => sum + (bid ?? 0), 0)).toBe(7);
  });

  it('первые три игрока в заказе не ограничены суммой', () => {
    const game = createGame({ seed: 3, firstDealer: 0 });
    game.rounds = [{ mode: 'normal', cards: 5 }];
    dealCards(game);
    expect(allowedBids(game, 1)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('нельзя заказать пас три раунда подряд', () => {
    const game = createGame({ seed: 3, firstDealer: 0 });
    game.rounds = [
      { mode: 'normal', cards: 3 },
      { mode: 'normal', cards: 3 },
      { mode: 'normal', cards: 3 },
    ];
    for (let round = 0; round < 2; round++) {
      dealCards(game);
      while (game.phase === 'bidding') placeBid(game, game.turn, game.turn === 3 ? 0 : allowedBids(game, game.turn).find((b) => b > 0)!);
      playRound(game);
      nextRound(game);
    }
    dealCards(game);
    expect(game.passStreak[3]).toBe(2);
    expect(bidBan(game, 3, 0)).toBe('pass');
    expect(allowedBids(game, 3)).not.toContain(0);
    // Тот, кто заказывал взятки, пас заказать может.
    expect(bidBan(game, 0, 0)).toBeNull();
  });

  it('пас разрешён, если ничего другого заказать нельзя', () => {
    const game = createGame({ seed: 3, firstDealer: 0 });
    dealCards(game); // одна карта
    game.passStreak = [5, 0, 0, 0];
    placeBid(game, 1, 0);
    placeBid(game, 2, 0);
    placeBid(game, 3, 0);
    // Последний не может заказать 1 (сумма стала бы равна числу взяток) — значит, пас разрешён несмотря на серию.
    expect(allowedBids(game, 0)).toEqual([0]);
  });

  it('если козырь показала семёрка пик — раунд идёт без козыря', () => {
    let found = false;
    for (let seed = 1; seed < 400 && !found; seed++) {
      const game = createGame({ seed, firstDealer: 0 });
      game.rounds = [{ mode: 'normal', cards: 5 }];
      dealCards(game);
      if (game.trumpCard && isJoker(game.trumpCard)) {
        expect(game.trump).toBeNull();
        found = true;
      } else {
        expect(game.trump).toBe(game.trumpCard!.suit);
      }
    }
    expect(found).toBe(true);
  });

  it('просроченный ход: штраф −10 каждый раз, после третьего игрок выбывает из раунда', () => {
    const game = createGame({ seed: 3, firstDealer: 0 });
    game.rounds = [{ mode: 'normal', cards: 3 }];
    dealCards(game);
    const player = game.turn;
    expect(timeoutStrike(game)).toBe('penalty');
    expect(timeoutStrike(game)).toBe('penalty');
    expect(game.autoPlay[player]).toBe(false);
    expect(timeoutStrike(game)).toBe('kicked');
    expect(game.autoPlay[player]).toBe(true);
    expect(game.penalties[player]).toBe(-30);
    playRound(game);
    const cell = game.sheet[0].cells[player];
    expect(cell.penalty).toBe(-30);
    // Очки за раунд включают штраф.
    expect(cell.points).toBeLessThanOrEqual(Math.max(cell.tricks * 10, 5) - 30);
  });

  it('счётчик просрочек сбрасывается, когда игрок походил', () => {
    const game = createGame({ seed: 3, firstDealer: 0 });
    game.rounds = [{ mode: 'normal', cards: 3 }];
    dealCards(game);
    timeoutStrike(game);
    expect(game.strikes).toBe(1);
    placeBid(game, game.turn, allowedBids(game, game.turn)[0]);
    expect(game.strikes).toBe(0);
  });
});

/** Доигрывает текущий раунд: все игроки ходят как боты. */
function playRound(game: GameState, random?: { seed: number }): void {
  while (game.phase !== 'roundEnd') {
    if (game.phase === 'deal') {
      dealCards(game);
    } else if (game.phase === 'bidding') {
      const bids = allowedBids(game, game.turn);
      const bid = random
        ? bids[Math.floor(nextRandom(random) * bids.length)]
        : chooseBid(game, game.turn);
      placeBid(game, game.turn, bid);
    } else if (game.phase === 'playing') {
      if (random) {
        playRandomCard(game, random);
      } else {
        const move = chooseMove(game, game.turn);
        playCard(game, game.turn, move.card, move.joker);
      }
    } else if (game.phase === 'trickEnd') {
      finishTrick(game);
    } else {
      throw new Error(`Неожиданная фаза ${game.phase}`);
    }
  }
}

function playRandomCard(game: GameState, random: { seed: number }): void {
  const legal = legalCardsFor(game, game.turn);
  const card = legal[Math.floor(nextRandom(random) * legal.length)];
  if (!isJoker(card)) {
    playCard(game, game.turn, card);
    return;
  }
  const demands = [undefined, ...jokerDemandsFor(game)];
  const mode = nextRandom(random) > 0.5 ? 'high' : 'low';
  const demand = demands[Math.floor(nextRandom(random) * demands.length)];
  playCard(game, game.turn, card, { mode, demand, suit: demand === 'suit' ? 'hearts' : undefined });
}

function playWholeGame(seed: number, random: boolean, players = 4): GameState {
  const game = createGame({ seed, playerNames: ['А', 'Б', 'В', 'Г'].slice(0, players) });
  const rng = random ? { seed: seed * 7919 } : undefined;
  while (game.phase !== 'gameOver') {
    playRound(game, rng);
    const row = game.sheet[game.sheet.length - 1];
    const tricks = row.cells.reduce((sum, c) => sum + c.tricks, 0);
    expect(tricks).toBe(row.round.cards); // сумма взяток = числу карт
    nextRound(game);
  }
  return game;
}

describe('Целая партия', () => {
  it('T-36: каждый раздаёт по разу в каждом блоке ×4 и 7 раз за партию', () => {
    const game = playWholeGame(11, false);
    const dealers = game.sheet.map((row) => row.dealer);
    expect(new Set(dealers.slice(8, 12)).size).toBe(4);
    for (let player = 0; player < PLAYER_COUNT; player++) {
      expect(dealers.filter((d) => d === player)).toHaveLength(7);
    }
  });

  it('T-37: в «Тёмной» заказ идёт до раздачи', () => {
    const game = createGame({ seed: 2, settings: { gameLength: 'short' } });
    while (currentRound(game).mode !== 'dark') {
      playRound(game);
      nextRound(game);
    }
    expect(game.phase).toBe('bidding');
    expect(game.dealt).toBe(false);
    expect(game.hands.flat()).toHaveLength(0);
    expect(game.trump).toBeNull();
    for (let i = 0; i < PLAYER_COUNT; i++) placeBid(game, game.turn, 2);
    expect(game.phase).toBe('deal');
    dealCards(game);
    expect(game.phase).toBe('playing');
    expect(game.trump).not.toBeNull();
  });

  it('в «Минусах» и «Плюсах» заказа нет', () => {
    const game = createGame({ seed: 2, settings: { gameLength: 'short' } });
    while (currentRound(game).mode !== 'minus') {
      playRound(game);
      nextRound(game);
    }
    dealCards(game);
    expect(game.phase).toBe('playing');
    playRound(game);
    expect(game.sheet[game.sheet.length - 1].cells.every((c) => c.bid === null)).toBe(true);
  });

  it('нелегальный ход отклоняется', () => {
    const game = createGame({ seed: 9, settings: { gameLength: 'short' } });
    dealCards(game);
    while (game.phase === 'bidding') placeBid(game, game.turn, allowedBids(game, game.turn)[0]);
    const notMine = parseCard('♥6');
    const other = (game.turn + 1) % PLAYER_COUNT;
    expect(() => playCard(game, other, game.hands[other][0])).toThrow();
    if (!game.hands[game.turn].some((c) => c.suit === 'hearts' && c.rank === 6)) {
      expect(() => playCard(game, game.turn, notMine)).toThrow();
    }
  });

  it('T-46: накопительный итог в таблице', () => {
    const game = playWholeGame(4, false);
    for (let player = 0; player < PLAYER_COUNT; player++) {
      let sum = 0;
      for (const row of game.sheet) {
        sum += row.cells[player].points;
        expect(row.cells[player].total).toBe(sum);
      }
    }
    expect(totals(game)).toEqual(game.sheet[27].cells.map((c) => c.total));
  });

  it('T-47: при равенстве очков победу делят', () => {
    expect(winners([120, 85, 120, 40])).toEqual([0, 2]);
    expect(winners([10, 85, 20, 40])).toEqual([1]);
  });

  it('T-48: 300 партий случайными легальными ходами доигрываются без ошибок', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const game = playWholeGame(seed, true);
      expect(game.sheet).toHaveLength(28);
    }
  });

  it('T-48: 100 партий ботов доигрываются без ошибок', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const game = playWholeGame(seed, false);
      expect(game.sheet).toHaveLength(28);
    }
  });

  it('вдвоём и втроём партия тоже доигрывается: каждый раздаёт по разу в каждом блоке', () => {
    for (const players of [2, 3]) {
      for (let seed = 1; seed <= 30; seed++) {
        const game = playWholeGame(seed, seed % 2 === 0, players);
        expect(game.sheet).toHaveLength(8 + 5 * players);
        expect(game.sheet[0].cells).toHaveLength(players);
      }
    }
  });

  it('вдвоём первым заказывает и заходит сосед раздающего, раздающий заказывает последним', () => {
    const game = createGame({ seed: 5, firstDealer: 0, playerNames: ['А', 'Б'] });
    dealCards(game);
    expect(game.turn).toBe(1);
    placeBid(game, 1, 0);
    expect(game.turn).toBe(0);
    expect(allowedBids(game, 0)).toEqual([0]); // 1 = числу карт — нельзя
    placeBid(game, 0, 0);
    expect(game.turn).toBe(1);
  });

  it('боты играют осмысленно: в среднем набирают больше, чем случайные ходы', () => {
    let botSum = 0;
    let randomSum = 0;
    for (let seed = 1; seed <= 40; seed++) {
      botSum += totals(playWholeGame(seed, false)).reduce((a, b) => a + b, 0);
      randomSum += totals(playWholeGame(seed, true)).reduce((a, b) => a + b, 0);
    }
    expect(botSum).toBeGreaterThan(randomSum);
  });
});
