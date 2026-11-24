// Защита сервера: всё, что можно прислать «подделанным» браузером, не ломает игру и сервер.
// Проверки по отчёту о безопасности (painted-seven-security-review.md, ноябрь 2026).

import { type ChildProcess, spawn } from 'node:child_process';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { Room } from '../server/room';
import { cleanCard, cleanClientId, cleanJoker, cleanSettings } from '../server/validate';
import { type GameState, allowedBids, legalCardsFor, winners } from '../src/engine';
import type { ServerMessage } from '../src/net/protocol';
import { dealSeconds } from '../src/shared/dealTiming';
import { DEFAULT_SKIN } from '../src/shared/skin';

function fakeConnection() {
  const messages: ServerMessage[] = [];
  let open = true;
  return {
    messages,
    send: (message: ServerMessage) => messages.push(message),
    isOpen: () => open,
    close: () => {
      open = false;
    },
  };
}

function dealWait(game: GameState): number {
  return Math.ceil(dealSeconds(game.rounds[game.roundIndex].cards * game.playerNames.length) * 1000) + 500;
}

describe('Проверка данных от браузера', () => {
  it('опасные и неверные настройки отбрасываются', () => {
    const settings = cleanSettings({
      zeroBidPoints: '<img src=x onerror=alert(1)>',
      turnSeconds: 1e10,
      maxTimeouts: 1e9,
      timeoutPenalty: -50,
      jokerRequests: 'false',
      gameLength: 'short',
      junk: 'x'.repeat(10000),
      minusStarBonus: 40,
    });
    expect(settings).toEqual({ gameLength: 'short', minusStarBonus: 40 });
    expect(cleanSettings('строка')).toEqual({});
    expect(cleanSettings({ turnSeconds: 0 })).toEqual({ turnSeconds: 0 });
    expect(cleanSettings({ turnSeconds: 3 })).toEqual({});
  });

  it('номер браузера — только настоящий идентификатор', () => {
    for (const bad of [undefined, null, '', 'undefined', 'null', 42, {}, 'a'.repeat(65), '<script>alert(1)</script>xx']) {
      expect(cleanClientId(bad)).toBeNull();
    }
    expect(cleanClientId('3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b')).not.toBeNull();
  });

  it('у карты остаются только масть и ранг', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 7000; i++) deep = [deep];
    expect(cleanCard({ suit: 'hearts', rank: 14, junk: deep })).toEqual({ suit: 'hearts', rank: 14 });
    expect(cleanCard({ suit: 'hearts', rank: 15 })).toBeNull();
    expect(cleanCard({ suit: '__proto__', rank: 6 })).toBeNull();
    expect(cleanJoker({ mode: 'low', demand: 'evil', junk: 1 })).toEqual({ mode: 'low' });
  });

  it('победители считаются, даже если в суммах попалось «не число»', () => {
    expect(winners([10, Number.NaN, 30, 30])).toEqual([2, 3]);
  });
});

describe('Комната: защита', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('лишние поля карты не попадают в партию', () => {
    const room = new Room('ABCDE', 'a', { gameLength: 'short' });
    const ids = ['a', 'b', 'c', 'd'];
    for (const id of ids) room.join(id, id, DEFAULT_SKIN, fakeConnection());
    room.start('a');
    const game = room.game!;
    vi.advanceTimersByTime(dealWait(game));
    for (let i = 0; i < 4; i++) room.bid(ids[game.turn], allowedBids(game, game.turn)[0]);
    expect(game.phase).toBe('playing');
    const card = legalCardsFor(game, game.turn)[0];
    room.play(ids[game.turn], { ...card, junk: 'x'.repeat(5000) } as never, { mode: 'high' });
    expect(Object.keys(game.trick[0].card).sort()).toEqual(['rank', 'suit']);
    room.dispose();
  });

  it('опасные настройки создателя не попадают в партию', () => {
    const room = new Room('ABCDE', 'a', { zeroBidPoints: '<img onerror=x>', turnSeconds: 1e10 });
    room.join('a', 'a', DEFAULT_SKIN, fakeConnection());
    room.start('a');
    expect(room.game!.settings.zeroBidPoints).toBe(5);
    expect(room.game!.settings.turnSeconds).toBe(30);
    room.dispose();
  });

  it('чужой не займёт место по одному clientId — нужен секрет места', () => {
    const room = new Room('ABCDE', 'a', { gameLength: 'short' });
    const a = fakeConnection();
    room.join('a', 'a', DEFAULT_SKIN, a);
    room.join('b', 'b', DEFAULT_SKIN, fakeConnection());
    room.start('a');
    expect(() => room.join('a', 'x', DEFAULT_SKIN, fakeConnection())).toThrow('err.cannotJoin');
    expect(() => room.join('a', 'x', DEFAULT_SKIN, fakeConnection(), 'f'.repeat(32))).toThrow('err.cannotJoin');
    // Чужой ничего не сломал: хозяин места по-прежнему на связи и получает сообщения.
    const before = a.messages.length;
    vi.advanceTimersByTime(dealWait(room.game!));
    expect(a.messages.length).toBeGreaterThan(before);
    // А сам хозяин с секретом возвращается, старая вкладка закрывается.
    const again = fakeConnection();
    expect(room.join('a', 'a', DEFAULT_SKIN, again, room.tokenOf('a'))).toBe(0);
    expect(a.isOpen()).toBe(false);
    room.dispose();
  });

  it('секрет места приходит игроку в сообщении «room»', () => {
    const room = new Room('ABCDE', 'a', {});
    const a = fakeConnection();
    room.join('a', 'a', DEFAULT_SKIN, a);
    const message = a.messages.find((m) => m.t === 'room');
    expect(message && message.t === 'room' && message.token).toBe(room.tokenOf('a'));
    expect(room.tokenOf('a')).toMatch(/^[0-9a-f]{32}$/);
    room.dispose();
  });

  it('создатель ушёл до начала — права переходят к следующему', () => {
    const room = new Room('ABCDE', 'a', {});
    room.join('a', 'a', DEFAULT_SKIN, fakeConnection());
    room.join('b', 'b', DEFAULT_SKIN, fakeConnection());
    room.leave('a');
    expect(() => room.start('b')).not.toThrow();
    room.dispose();
  });

  it('выбывший за бездействие не может сам ходить до конца раунда', () => {
    const room = new Room('ABCDE', 'a', { gameLength: 'short' });
    const ids = ['a', 'b', 'c', 'd'];
    for (const id of ids) room.join(id, id, DEFAULT_SKIN, fakeConnection());
    room.start('a');
    const game = room.game!;
    vi.advanceTimersByTime(dealWait(game));
    const idle = game.turn;
    game.autoPlay[idle] = true;
    expect(() => room.bid(ids[idle], allowedBids(game, idle)[0])).toThrow('err.notYourTurn');
    room.dispose();
  });

  it('с выключенным таймером комната не зависает: через 10 минут за молчащего ходит бот', () => {
    const room = new Room('ABCDE', 'a', { gameLength: 'short', turnSeconds: 0 });
    for (const id of ['a', 'b', 'c', 'd']) room.join(id, id, DEFAULT_SKIN, fakeConnection());
    room.start('a');
    const game = room.game!;
    vi.advanceTimersByTime(dealWait(game));
    const idle = game.turn;
    expect(game.bids[idle]).toBeNull();
    vi.advanceTimersByTime(10 * 60 * 1000 + 2000);
    expect(game.bids[idle]).not.toBeNull();
    room.dispose();
  });

  it('частые «готов» и переподключения не откладывают следующий раунд', () => {
    const room = new Room('ABCDE', 'a', { gameLength: 'short', turnSeconds: 0 });
    room.join('a', 'a', DEFAULT_SKIN, fakeConnection());
    room.join('b', 'b', DEFAULT_SKIN, fakeConnection());
    room.start('a');
    const game = room.game!;
    for (let i = 0; i < 400 && game.phase !== 'roundEnd'; i++) {
      vi.advanceTimersByTime(3000);
      const id = ['a', 'b'][game.turn];
      if (id && game.phase === 'bidding') room.bid(id, allowedBids(game, game.turn)[0]);
      else if (id && game.phase === 'playing') room.play(id, legalCardsFor(game, game.turn)[0], { mode: 'high' });
    }
    expect(game.phase).toBe('roundEnd');
    room.ready('a');
    room.ready('b');
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(200);
      room.ready('a');
      room.ready('b');
      room.join('b', 'b', DEFAULT_SKIN, fakeConnection(), room.tokenOf('b'));
    }
    vi.advanceTimersByTime(1500);
    expect(game.roundIndex).toBe(1);
    room.dispose();
  });

  it('молчащий игрок не держит всех: через 5 минут следующий раунд начинается сам', () => {
    const room = new Room('ABCDE', 'a', { gameLength: 'short', turnSeconds: 0 });
    room.join('a', 'a', DEFAULT_SKIN, fakeConnection());
    room.join('b', 'b', DEFAULT_SKIN, fakeConnection());
    room.start('a');
    const game = room.game!;
    for (let i = 0; i < 400 && game.phase !== 'roundEnd'; i++) {
      vi.advanceTimersByTime(3000);
      const id = ['a', 'b'][game.turn];
      if (id && game.phase === 'bidding') room.bid(id, allowedBids(game, game.turn)[0]);
      else if (id && game.phase === 'playing') room.play(id, legalCardsFor(game, game.turn)[0], { mode: 'high' });
    }
    room.ready('a');
    vi.advanceTimersByTime(5 * 60 * 1000 + 1000);
    expect(game.roundIndex).toBe(1);
    room.dispose();
  });

  it('ошибка отправки одному игроку не ломает комнату', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const room = new Room('ABCDE', 'a', { gameLength: 'short' });
    const broken = {
      send: () => {
        throw new Error('сломано');
      },
    };
    room.join('a', 'a', DEFAULT_SKIN, fakeConnection());
    room.join('b', 'b', DEFAULT_SKIN, broken);
    expect(() => room.start('a')).not.toThrow();
    for (let i = 0; i < 50; i++) vi.advanceTimersByTime(31000);
    expect(room.game!.roundIndex).toBeGreaterThanOrEqual(0);
    room.dispose();
  });
});

// ---------- Настоящий сервер: кривые сообщения не роняют процесс ----------

const PORT = 18000 + Math.floor(Math.random() * 1000);
let server: ChildProcess;

function open(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}`);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function closed(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) resolve();
    else socket.once('close', () => resolve());
  });
}

function nextMessage(socket: WebSocket, type: string): Promise<ServerMessage> {
  return new Promise((resolve) => {
    const listener = (data: WebSocket.RawData) => {
      const message = JSON.parse(String(data)) as ServerMessage;
      if (message.t === type) {
        socket.off('message', listener);
        resolve(message);
      }
    };
    socket.on('message', listener);
  });
}

async function alive(): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${PORT}/`);
    return response.ok;
  } catch {
    return false;
  }
}

describe('Сервер не падает', () => {
  beforeAll(async () => {
    server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: 'pipe',
    });
    for (let i = 0; i < 100 && !(await alive()); i++) await new Promise((r) => setTimeout(r, 100));
  }, 20000);

  afterAll(() => {
    server?.kill();
  });

  it('слишком большое сообщение закрывает только это соединение', async () => {
    const socket = await open();
    socket.send('x'.repeat(16 * 1024 + 1));
    await closed(socket);
    expect(await alive()).toBe(true);
  });

  it('кривые и двоичные сообщения — ошибка в ответ, сервер жив', async () => {
    const socket = await open();
    const error = nextMessage(socket, 'error');
    socket.send('{не json');
    expect(await error).toEqual({ t: 'error', message: 'err.badRequest' });
    socket.send(Buffer.from([0xff, 0xfe, 0x00]));
    socket.send(JSON.stringify({ t: 'create', clientId: undefined }));
    socket.send(JSON.stringify(null));
    await new Promise((r) => setTimeout(r, 200));
    socket.close();
    expect(await alive()).toBe(true);
  });

  it('много «create» с одного соединения не плодят комнаты', async () => {
    const socket = await open();
    const id = '3f2b1c9e-8a7d-4e6f-9b0a-1c2d3e4f5a6b';
    let code = '';
    socket.on('message', (data) => {
      const message = JSON.parse(String(data)) as ServerMessage;
      if (message.t === 'room') code = message.code;
    });
    for (let i = 0; i < 20; i++) socket.send(JSON.stringify({ t: 'create', clientId: id, name: 'Тим', skin: {}, settings: {} }));
    await new Promise((r) => setTimeout(r, 300));
    expect(code).toMatch(/^[A-Z2-9]{5}$/);
    // Прежние комнаты закрыты: войти в первую попавшуюся старую уже нельзя, а в последнюю — можно.
    const guest = await open();
    const joined = nextMessage(guest, 'room');
    guest.send(JSON.stringify({ t: 'join', clientId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', code, name: 'Оля', skin: {} }));
    expect((await joined).t).toBe('room');
    socket.close();
    guest.close();
  });

  it('слишком частые сообщения — соединение закрывается', async () => {
    const socket = await open();
    for (let i = 0; i < 40; i++) socket.send(JSON.stringify({ t: 'ready' }));
    await closed(socket);
    expect(await alive()).toBe(true);
  });

  it('чужие сайты подключиться не могут', async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin: 'https://evil.example' });
    const result = await new Promise<string>((resolve) => {
      socket.once('open', () => resolve('open'));
      socket.once('error', () => resolve('rejected'));
    });
    expect(result).toBe('rejected');
  });
});

describe('Пропуск раздачи в сетевой игре', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('пропуск видят все, и заказ начинается почти сразу', () => {
    const room = new Room('ABCDE', 'a', { gameLength: 'full' });
    const a = fakeConnection();
    const b = fakeConnection();
    room.join('a', 'Тим', DEFAULT_SKIN, a);
    room.join('b', 'Оля', DEFAULT_SKIN, b);
    room.start('a');
    const game = room.game!;
    vi.advanceTimersByTime(1500); // сервер раздал, у игроков идёт анимация
    expect(game.phase).toBe('bidding');
    const normalEnd = Date.now() + dealWait(game) - 1500;
    room.skipDeal('b');
    const seenByA = a.messages.find((m) => m.t === 'dealSkipped');
    const seenByB = b.messages.find((m) => m.t === 'dealSkipped');
    expect(seenByA).toEqual({ t: 'dealSkipped', name: 'Оля', self: false });
    expect(seenByB).toEqual({ t: 'dealSkipped', name: 'Оля', self: true });
    // Ход начинается (или бот заказывает) задолго до конца обычной анимации.
    vi.advanceTimersByTime(2500);
    expect(game.turnStartedAt === 0 || game.turnStartedAt < normalEnd).toBe(true);
    // Повторный пропуск в той же раздаче ничего не рассылает.
    room.skipDeal('a');
    expect(a.messages.filter((m) => m.t === 'dealSkipped')).toHaveLength(1);
    room.dispose();
  });
});
