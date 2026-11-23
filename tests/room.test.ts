// Тесты сервера: комната, скрытие чужих карт, имена ботов.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Room } from '../server/room';
import { type GameState, allowedBids, cardLabel, createGame, dealCards, legalCardsFor } from '../src/engine';
import { type ServerMessage, makeRoomCode, viewFor } from '../src/net/protocol';
import { dealSeconds } from '../src/shared/dealTiming';
import { FEMALE_NAMES, MALE_NAMES, pickBotNames } from '../src/shared/names';
import { DEFAULT_SKIN, sanitizeSkin } from '../src/shared/skin';

/** Поддельное соединение: просто запоминает, что прислал сервер. */
function fakeConnection() {
  const messages: ServerMessage[] = [];
  return {
    messages,
    send: (message: ServerMessage) => messages.push(message),
    lastState: (): GameState | null => {
      const states = messages.filter((m) => m.t === 'state');
      const last = states[states.length - 1];
      return last && last.t === 'state' ? last.game : null;
    },
  };
}

describe('Вид игрока (чужие карты скрыты)', () => {
  const game = createGame({ seed: 3, firstDealer: 0 });
  game.rounds = [{ mode: 'normal', cards: 9 }];
  dealCards(game);

  it('свои карты видны, чужие заменены заглушками', () => {
    const view = viewFor(game, 2);
    expect(view.hands[0].map(cardLabel)).toEqual(game.hands[2].map(cardLabel));
    for (const seat of [1, 2, 3]) {
      expect(view.hands[seat]).toHaveLength(9);
      expect(new Set(view.hands[seat].map(cardLabel)).size).toBe(1);
    }
  });

  it('всё повёрнуто так, что получатель — игрок 0', () => {
    const view = viewFor(game, 2);
    expect(view.playerNames[0]).toBe(game.playerNames[2]);
    expect(view.dealer).toBe((game.dealer - 2 + 4) % 4);
    expect(view.turn).toBe((game.turn - 2 + 4) % 4);
  });

  it('состояние генератора случайных чисел не раскрывается', () => {
    expect(viewFor(game, 1).rng.seed).toBe(0);
  });
});

describe('Комната', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('создатель и гость садятся, пустые места занимают боты с разными именами', () => {
    const room = new Room('ABCDE', 'host', { gameLength: 'short' });
    const host = fakeConnection();
    const guest = fakeConnection();
    expect(room.join('host', 'Тим', DEFAULT_SKIN, host)).toBe(0);
    expect(room.join('guest', 'Оля', DEFAULT_SKIN, guest)).toBe(1);
    expect(() => room.start('guest')).toThrow();
    room.start('host');

    const names = room.seats.map((seat) => seat!.name);
    expect(names.slice(0, 2)).toEqual(['Тим', 'Оля']);
    expect(new Set(names).size).toBe(4);
    expect(room.seats.filter((seat) => seat!.clientId === null)).toHaveLength(2);

    // Гость видит себя на месте 0, создателя — на месте 3.
    const roomMessage = guest.messages.filter((m) => m.t === 'room').pop();
    expect(roomMessage && roomMessage.t === 'room' && roomMessage.seats[0]?.name).toBe('Оля');
    expect(roomMessage && roomMessage.t === 'room' && roomMessage.seats[3]?.name).toBe('Тим');
    room.dispose();
  });

  it('создатель выбирает, сколько ботов посадить: можно играть вдвоём', () => {
    const room = new Room('ABCDE', 'host', { gameLength: 'short' });
    const host = fakeConnection();
    const guest = fakeConnection();
    room.join('host', 'Тим', DEFAULT_SKIN, host);
    room.join('guest', 'Оля', DEFAULT_SKIN, guest);
    expect(() => room.configure('guest', undefined, 0)).toThrow();
    room.configure('host', undefined, 0);
    const lobby = host.messages.filter((m) => m.t === 'room').pop();
    expect(lobby && lobby.t === 'room' && lobby.bots).toBe(0);
    expect(lobby && lobby.t === 'room' && lobby.freeSeats).toBe(2);
    room.start('host');
    expect(room.seats).toHaveLength(2);
    expect(room.game!.playerNames).toEqual(['Тим', 'Оля']);
    // Гость видит партию на двоих: он — игрок 0, создатель — игрок 1.
    const state = guest.messages.filter((m) => m.t === 'state').pop();
    expect(state && state.t === 'state' && state.game.playerNames).toEqual(['Оля', 'Тим']);
    room.dispose();
  });

  it('одному без ботов начать нельзя, с одним ботом — можно', () => {
    const room = new Room('ABCDE', 'host', { gameLength: 'short' });
    room.join('host', 'Тим', DEFAULT_SKIN, fakeConnection());
    room.configure('host', undefined, 0);
    expect(() => room.start('host')).toThrow('err.needPlayers');
    room.configure('host', undefined, 1);
    room.start('host');
    expect(room.seats).toHaveLength(2);
    expect(room.seats[1]!.clientId).toBeNull();
    room.dispose();
  });

  it('в комнату не входит пятый игрок, а после начала — посторонний', () => {
    const room = new Room('ABCDE', 'a', {});
    for (const id of ['a', 'b', 'c', 'd']) room.join(id, id, DEFAULT_SKIN, fakeConnection());
    expect(() => room.join('e', 'e', DEFAULT_SKIN, fakeConnection())).toThrow();
    room.start('a');
    expect(() => room.join('f', 'f', DEFAULT_SKIN, fakeConnection())).toThrow();
    room.dispose();
  });

  it('ход не в свою очередь отклоняется', () => {
    const room = new Room('ABCDE', 'a', { gameLength: 'short' });
    for (const id of ['a', 'b', 'c', 'd']) room.join(id, id, DEFAULT_SKIN, fakeConnection());
    room.start('a');
    vi.advanceTimersByTime(3000); // раздача
    const game = room.game!;
    expect(game.phase).toBe('bidding');
    const notTurn = ['a', 'b', 'c', 'd'][(game.turn + 1) % 4];
    expect(() => room.bid(notTurn, 0)).toThrow();
    room.dispose();
  });

  it('если люди отключились, боты доигрывают партию до конца', () => {
    const room = new Room('ABCDE', 'host', { gameLength: 'short' });
    const host = fakeConnection();
    room.join('host', 'Тим', DEFAULT_SKIN, host);
    room.start('host');
    room.leave('host'); // дальше за него ходит бот
    for (let i = 0; i < 2000 && room.game!.phase !== 'gameOver'; i++) vi.advanceTimersByTime(31000);
    expect(room.game!.phase).toBe('gameOver');
    expect(room.game!.sheet).toHaveLength(7);
    room.dispose();
  });
});

describe('Готовность, таймер и сложность ботов', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** Комната из двух людей и двух ботов, доведённая до конца первого раунда. */
  function roomAtRoundEnd() {
    const room = new Room('ABCDE', 'a', { gameLength: 'short', turnSeconds: 0 });
    const a = fakeConnection();
    const b = fakeConnection();
    room.join('a', 'a', DEFAULT_SKIN, a);
    room.join('b', 'b', DEFAULT_SKIN, b);
    room.start('a');
    const game = room.game!;
    for (let i = 0; i < 400 && game.phase !== 'roundEnd'; i++) {
      vi.advanceTimersByTime(3000);
      const id = ['a', 'b'][game.turn];
      if (id && game.phase === 'bidding') room.bid(id, allowedBids(game, game.turn)[0]);
      else if (id && game.phase === 'playing') room.play(id, legalCardsFor(game, game.turn)[0], { mode: 'high' });
    }
    expect(game.phase).toBe('roundEnd');
    return { room, a, b, game };
  }

  it('следующий раунд не начинается, пока не готовы все люди', () => {
    const { room, game, b } = roomAtRoundEnd();
    vi.advanceTimersByTime(120000);
    expect(game.roundIndex).toBe(0); // никто не подтвердил — ждём
    room.ready('a');
    vi.advanceTimersByTime(60000);
    expect(game.roundIndex).toBe(0); // один готов, второй нет
    const seen = b.messages.filter((m) => m.t === 'room').pop();
    expect(seen && seen.t === 'room' && seen.seats.map((s) => s?.ready)).toEqual([false, true, true, true]);
    room.ready('b');
    vi.advanceTimersByTime(3000);
    expect(game.roundIndex).toBe(1);
    room.dispose();
  });

  it('отключившийся игрок не задерживает следующий раунд', () => {
    const { room, game } = roomAtRoundEnd();
    room.ready('a');
    room.leave('b');
    vi.advanceTimersByTime(3000);
    expect(game.roundIndex).toBe(1);
    room.dispose();
  });

  it('таймер хода: штраф каждые 30 секунд, после 90 секунд за игрока ходит бот', () => {
    const room = new Room('ABCDE', 'a', { gameLength: 'short' });
    for (const id of ['a', 'b', 'c', 'd']) room.join(id, id, DEFAULT_SKIN, fakeConnection());
    room.start('a');
    const game = room.game!;
    vi.advanceTimersByTime(dealWait(game)); // раздача и её анимация (камера сверху, карты по одной)
    expect(game.phase).toBe('bidding');
    const idle = game.turn;
    vi.advanceTimersByTime(31000);
    expect(game.penalties[idle]).toBe(-10);
    expect(game.turn).toBe(idle);
    vi.advanceTimersByTime(30000);
    expect(game.penalties[idle]).toBe(-20);
    vi.advanceTimersByTime(32000);
    expect(game.penalties[idle]).toBe(-30);
    expect(game.autoPlay[idle]).toBe(true);
    expect(game.bids[idle]).not.toBeNull(); // бот сделал заказ за выбывшего
    room.dispose();
  });

  it('переподключение не сбрасывает таймер хода', () => {
    const room = new Room('ABCDE', 'a', { gameLength: 'short' });
    for (const id of ['a', 'b', 'c', 'd']) room.join(id, id, DEFAULT_SKIN, fakeConnection());
    room.start('a');
    const game = room.game!;
    vi.advanceTimersByTime(dealWait(game));
    const id = ['a', 'b', 'c', 'd'][game.turn];
    const startedAt = game.turnStartedAt;
    vi.advanceTimersByTime(20000);
    room.join(id, id, DEFAULT_SKIN, fakeConnection(), room.tokenOf(id)); // обновил страницу и вернулся
    expect(game.turnStartedAt).toBe(startedAt);
    vi.advanceTimersByTime(11000);
    expect(game.penalties[game.turn]).toBe(-10);
    room.dispose();
  });

  it('сложность ботов выбирает создатель комнаты до начала игры', () => {
    const room = new Room('ABCDE', 'a', {});
    const guest = fakeConnection();
    room.join('a', 'a', DEFAULT_SKIN, fakeConnection());
    room.join('b', 'b', DEFAULT_SKIN, guest);
    expect(() => room.configure('b', 'expert')).toThrow();
    room.configure('a', 'expert');
    const message = guest.messages.filter((m) => m.t === 'room').pop();
    expect(message && message.t === 'room' && [message.botLevel, message.bots]).toEqual(['expert', 2]);
    room.start('a');
    expect(room.game!.settings.botLevel).toBe('expert');
    room.dispose();
  });
});

describe('Имена ботов и коды комнат', () => {
  it('в списках не меньше 150 мужских и 150 женских имён', () => {
    expect(MALE_NAMES.length).toBeGreaterThanOrEqual(150);
    expect(FEMALE_NAMES.length).toBeGreaterThanOrEqual(150);
  });

  it('имя соответствует полу, в одной игре имена не повторяются и не совпадают с занятыми', () => {
    for (let i = 0; i < 200; i++) {
      const names = pickBotNames(['male', 'female', 'male'], ['Иван']);
      expect(MALE_NAMES).toContain(names[0]);
      expect(FEMALE_NAMES).toContain(names[1]);
      expect(new Set([...names, 'Иван']).size).toBe(4);
    }
  });

  it('код комнаты — пять символов без похожих букв', () => {
    for (let i = 0; i < 100; i++) expect(makeRoomCode()).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
  });

  it('скин из сети приводится к допустимому', () => {
    expect(sanitizeSkin({ gender: 'robot', suit: 99, tie: -1 })).toEqual(DEFAULT_SKIN);
    expect(sanitizeSkin(null)).toEqual(DEFAULT_SKIN);
  });
});

/** Сколько ждать от старта раунда до начала заказа: пауза сервера перед раздачей и анимация раздачи. */
function dealWait(game: GameState): number {
  return Math.ceil(dealSeconds(game.rounds[game.roundIndex].cards * game.playerNames.length) * 1000) + 500;
}
