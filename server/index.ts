// Сервер для игры с друзьями: комнаты по коротким кодам, обмен сообщениями через WebSocket.
// Запуск: npm run server   (порт берётся из переменной PORT, по умолчанию 8787)

import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { type ClientMessage, type ServerMessage, makeRoomCode } from '../src/net/protocol';
import { sanitizeSkin } from '../src/shared/skin';
import { type Connection, Room } from './room';

const PORT = Number(process.env.PORT ?? 8787);
/** Комната без людей удаляется через это время (мс). */
const ROOM_TTL = 30 * 60 * 1000;

const rooms = new Map<string, Room>();

function cleanName(value: unknown): string {
  const name = typeof value === 'string' ? value.replace(/[<>&"'`]/g, '').trim().slice(0, 14) : '';
  return name || 'Игрок';
}

// Обычная веб-страница нужна только для проверки «сервер жив» (её открывает хостинг).
const http = createServer((_request, response) => {
  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(`Painted Seven: сервер работает. Комнат: ${rooms.size}`);
});

const wss = new WebSocketServer({ server: http, maxPayload: 16 * 1024 });

wss.on('connection', (socket: WebSocket) => {
  let room: Room | null = null;
  let clientId = '';

  const connection: Connection = {
    send(message: ServerMessage) {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
    },
  };

  const handle = (message: ClientMessage): void => {
    switch (message.t) {
      case 'create': {
        let code = makeRoomCode();
        while (rooms.has(code)) code = makeRoomCode();
        clientId = String(message.clientId).slice(0, 64);
        room = new Room(code, clientId, typeof message.settings === 'object' && message.settings ? message.settings : {});
        rooms.set(code, room);
        room.join(clientId, cleanName(message.name), sanitizeSkin(message.skin), connection);
        break;
      }
      case 'join': {
        const found = rooms.get(String(message.code).toUpperCase().trim());
        if (!found) throw new Error('err.noRoom');
        clientId = String(message.clientId).slice(0, 64);
        found.join(clientId, cleanName(message.name), sanitizeSkin(message.skin), connection);
        room = found;
        break;
      }
      case 'start':
        room?.start(clientId);
        break;
      case 'bid':
        room?.bid(clientId, Number(message.bid));
        break;
      case 'play':
        room?.play(clientId, message.card, message.joker);
        break;
      case 'ready':
        room?.ready(clientId);
        break;
      case 'config':
        room?.configure(clientId, message.botLevel, message.bots);
        break;
      case 'leave':
        room?.leave(clientId);
        room = null;
        break;
      default:
        break;
    }
  };

  socket.on('message', (data) => {
    try {
      handle(JSON.parse(String(data)) as ClientMessage);
    } catch (error) {
      connection.send({ t: 'error', message: error instanceof Error ? error.message : 'Ошибка' });
    }
  });

  socket.on('close', () => {
    room?.leave(clientId, connection);
  });
});

// Уборка: удаляем комнаты, где давно никого нет.
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (!room.alive && now - room.lastActivity > ROOM_TTL) {
      room.dispose();
      rooms.delete(code);
    }
  }
}, 60 * 1000);

http.listen(PORT, () => {
  console.log(`Painted Seven: сервер слушает порт ${PORT}`);
});
