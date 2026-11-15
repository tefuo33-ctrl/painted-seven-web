// Связь браузера с сервером игры (WebSocket).

import type { ClientMessage, ServerMessage } from './protocol';

/** Сервер игры в интернете (Render). Адрес не секретный — это просто «куда звонить». */
const PUBLIC_SERVER_URL = 'wss://painted-seven-web.onrender.com';

/** Другой адрес можно задать при сборке переменной VITE_SERVER_URL. */
const CONFIGURED_URL: string = import.meta.env.VITE_SERVER_URL || '';

/** Адрес сервера или пустая строка, если он ещё не настроен. */
export function serverUrl(): string {
  if (CONFIGURED_URL) return CONFIGURED_URL;
  // При запуске на своём компьютере сервер стартует командой «npm run server».
  const host = location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return `ws://${host}:8787`;
  return PUBLIC_SERVER_URL;
}

/** Постоянный случайный номер этого браузера: по нему сервер возвращает игрока на его место. */
export function clientId(): string {
  const key = 'painted-seven-client-id';
  try {
    let id = localStorage.getItem(key);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export interface Net {
  send(message: ClientMessage): void;
  close(): void;
}

export interface NetHandlers {
  onMessage(message: ServerMessage): void;
  /** Соединение потеряно или не установилось. */
  onClose(): void;
}

/** Подключиться к серверу. Обещание выполняется, когда соединение готово. */
export function connect(url: string, handlers: NetHandlers): Promise<Net> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let opened = false;
    let closedByUs = false;
    socket.addEventListener('open', () => {
      opened = true;
      resolve({
        send: (message) => socket.send(JSON.stringify(message)),
        close: () => {
          closedByUs = true;
          socket.close();
        },
      });
    });
    socket.addEventListener('message', (event) => {
      try {
        handlers.onMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch (error) {
        console.error(error);
      }
    });
    socket.addEventListener('close', () => {
      if (!opened) reject(new Error('Не удалось подключиться к серверу'));
      else if (!closedByUs) handlers.onClose();
    });
  });
}
