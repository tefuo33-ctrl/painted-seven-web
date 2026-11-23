// Сервер для игры с друзьями: комнаты по коротким кодам, обмен сообщениями через WebSocket.
// Запуск: npm run server   (порт берётся из переменной PORT, по умолчанию 8787)
//
// Защита (браузеру не доверяем — его код можно поменять):
//  - любое кривое сообщение или сбой соединения закрывает только это соединение, а не сервер;
//  - всё, что прислал браузер, проверяется (server/validate.ts);
//  - не больше 30 сообщений за 10 секунд от одного соединения и не больше одной комнаты на соединение;
//  - подключаться можно только со страниц игры (ALLOWED_ORIGINS);
//  - мёртвые соединения отключаются (ping/pong), пустые комнаты удаляются.

import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { type ServerMessage, makeRoomCode } from '../src/net/protocol';
import { sanitizeSkin } from '../src/shared/skin';
import { type Connection, Room } from './room';
import {
  cleanBotLevel,
  cleanCard,
  cleanClientId,
  cleanInt,
  cleanJoker,
  cleanRoomCode,
  cleanToken,
  isObject,
} from './validate';

const PORT = Number(process.env.PORT ?? 8787);
/** Комната без людей на связи удаляется через это время (мс). */
const ROOM_TTL = 10 * 60 * 1000;
/** Больше комнат сервер не держит (защита памяти). */
const MAX_ROOMS = 500;
/** Сколько сообщений можно прислать за окно RATE_WINDOW (мс); больше — соединение закрывается. */
const RATE_LIMIT = 30;
const RATE_WINDOW = 10 * 1000;
/** Если клиент не читает сообщения и у него скопилось больше этого (байт) — отключаем. */
const MAX_BUFFERED = 1024 * 1024;
/** Как часто проверять, что соединение живо (мс). */
const HEARTBEAT = 30 * 1000;

/**
 * С каких страниц можно подключаться (через запятую, например
 * «https://tefuo33-ctrl.github.io,http://localhost:5173»). Без переменной — страница игры
 * на GitHub Pages и любые адреса на своём компьютере (для разработки).
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? 'https://tefuo33-ctrl.github.io,capacitor://localhost,tauri://localhost,http://tauri.localhost,https://tauri.localhost')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

function originAllowed(origin: string | undefined): boolean {
  // Без заголовка Origin подключаются не браузеры (их всё равно не остановить проверкой Origin).
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

/** Ошибки, которые браузер умеет показать. Всё остальное — общая «что-то пошло не так». */
const KNOWN_ERRORS = new Set([
  'err.cannotJoin',
  'err.needPlayers',
  'err.notHost',
  'err.notInGame',
  'err.notYourTurn',
  'err.badRequest',
  'err.busy',
  'err.tooFast',
  'err.replaced',
]);

const rooms = new Map<string, Room>();

function cleanName(value: unknown): string {
  const name = typeof value === 'string' ? value.replace(/[<>&"'`]/g, '').trim().slice(0, 14) : '';
  return name || 'Игрок';
}

// Обычная веб-страница нужна только для проверки «сервер жив» (её открывает хостинг).
const http = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Painted Seven: сервер работает.');
});

const wss = new WebSocketServer({
  server: http,
  maxPayload: 16 * 1024,
  verifyClient: (info: { origin?: string }) => originAllowed(info.origin),
});

interface LiveSocket extends WebSocket {
  alive?: boolean;
}

wss.on('connection', (socket: LiveSocket) => {
  let room: Room | null = null;
  let clientId = '';
  socket.alive = true;
  socket.on('pong', () => {
    socket.alive = true;
  });

  // Сбой соединения (слишком большое или кривое сообщение и т. п.) — закрываем только его.
  socket.on('error', (error) => {
    console.error('[ws]', error.message);
    try {
      socket.terminate();
    } catch {
      // уже закрыто
    }
  });

  const connection: Connection = {
    send(message: ServerMessage) {
      if (socket.readyState !== socket.OPEN) return;
      // Клиент не читает, а сообщения копятся — отключаем, чтобы не держать память.
      if (socket.bufferedAmount > MAX_BUFFERED) {
        socket.terminate();
        return;
      }
      socket.send(JSON.stringify(message));
    },
    isOpen: () => socket.readyState === socket.OPEN,
    close: () => socket.close(),
  };

  /** Выйти из комнаты, в которой сидит это соединение (перед входом в другую). */
  const leaveRoom = (): void => {
    if (!room) return;
    room.leave(clientId, connection);
    // Комната, из которой ушли все ещё до начала игры, больше не нужна.
    if (room.empty) {
      room.dispose();
      rooms.delete(room.code);
    }
    room = null;
  };

  // Ограничение частоты: не больше RATE_LIMIT сообщений за RATE_WINDOW.
  let windowStart = Date.now();
  let count = 0;
  const tooFast = (): boolean => {
    const now = Date.now();
    if (now - windowStart > RATE_WINDOW) {
      windowStart = now;
      count = 0;
    }
    return ++count > RATE_LIMIT;
  };

  const handle = (message: Record<string, unknown>): void => {
    switch (message.t) {
      case 'create': {
        const id = cleanClientId(message.clientId);
        if (!id) throw new Error('err.badRequest');
        if (rooms.size >= MAX_ROOMS) throw new Error('err.busy');
        leaveRoom();
        let code = makeRoomCode();
        while (rooms.has(code)) code = makeRoomCode();
        const created = new Room(code, id, message.settings);
        created.join(id, cleanName(message.name), sanitizeSkin(message.skin), connection);
        rooms.set(code, created);
        room = created;
        clientId = id;
        break;
      }
      case 'join': {
        const id = cleanClientId(message.clientId);
        if (!id) throw new Error('err.badRequest');
        const code = cleanRoomCode(message.code);
        const found = code ? rooms.get(code) : undefined;
        // Нет комнаты, игра идёт или мест нет — одна и та же ошибка: по ней не угадать, какие коды заняты.
        if (!found) throw new Error('err.cannotJoin');
        if (found !== room) leaveRoom();
        found.join(id, cleanName(message.name), sanitizeSkin(message.skin), connection, cleanToken(message.token));
        // Только после удачного входа: при ошибке соединение остаётся там, где было.
        room = found;
        clientId = id;
        break;
      }
      case 'start':
        room?.start(clientId);
        break;
      case 'bid': {
        const bid = cleanInt(message.bid, 0, 9);
        if (bid === undefined) throw new Error('err.badRequest');
        room?.bid(clientId, bid);
        break;
      }
      case 'play': {
        const card = cleanCard(message.card);
        if (!card) throw new Error('err.badRequest');
        room?.play(clientId, card, cleanJoker(message.joker));
        break;
      }
      case 'ready':
        room?.ready(clientId);
        break;
      case 'config':
        room?.configure(clientId, cleanBotLevel(message.botLevel), cleanInt(message.bots, 0, 4));
        break;
      case 'leave':
        leaveRoom();
        break;
      default:
        throw new Error('err.badRequest');
    }
  };

  socket.on('message', (data, isBinary) => {
    if (tooFast()) {
      connection.send({ t: 'error', message: 'err.tooFast' });
      socket.close();
      return;
    }
    try {
      if (isBinary) throw new Error('err.badRequest');
      const message: unknown = JSON.parse(String(data));
      if (!isObject(message)) throw new Error('err.badRequest');
      handle(message);
    } catch (error) {
      const code = error instanceof Error && KNOWN_ERRORS.has(error.message) ? error.message : 'err.badRequest';
      // Подробности — только в журнал сервера; игроку — понятный код ошибки.
      if (code === 'err.badRequest' && error instanceof Error && error.message !== 'err.badRequest') {
        console.error('[ws] message', error.message);
      }
      try {
        connection.send({ t: 'error', message: code });
      } catch {
        // соединение уже не принимает сообщений
      }
    }
  });

  socket.on('close', () => {
    leaveRoom();
  });
});

// Сердцебиение: соединение, которое не ответило на прошлый ping, считается мёртвым.
const heartbeat = setInterval(() => {
  for (const client of wss.clients as Set<LiveSocket>) {
    if (client.alive === false) {
      client.terminate();
      continue;
    }
    client.alive = false;
    try {
      client.ping();
    } catch {
      client.terminate();
    }
  }
}, HEARTBEAT);
wss.on('close', () => clearInterval(heartbeat));

// Уборка: удаляем комнаты, где давно нет ни одного человека на связи.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.alive && now - room.lastActivity > ROOM_TTL) {
      room.dispose();
      rooms.delete(code);
    }
  }
}, 60 * 1000);

// Последняя страховка: непредвиденная ошибка записывается в журнал, и процесс перезапускается
// хостингом начисто (продолжать работу в неизвестном состоянии опаснее).
process.on('uncaughtException', (error) => {
  console.error('[fatal]', error);
  process.exit(1);
});

http.listen(PORT, () => {
  console.log(`Painted Seven: сервер слушает порт ${PORT}`);
});
