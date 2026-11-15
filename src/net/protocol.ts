// Общие для браузера и сервера типы сообщений и «вид игрока» — состояние партии,
// в котором чужие карты скрыты. Правила исполняет сервер; браузер получает только свой вид.

import type { BotLevel, Card, GameState, JokerChoice, RuleSettings } from '../engine';
import type { Skin } from '../shared/skin';

export const PLAYER_COUNT = 4;

/** Одно место за столом — как его видят все. */
export interface SeatInfo {
  name: string;
  skin: Skin;
  bot: boolean;
  /** Человек на связи (для бота всегда true). */
  connected: boolean;
  /** Подтвердил готовность к следующему раунду (боты готовы всегда). */
  ready: boolean;
}

/** Сообщения от браузера серверу. */
export type ClientMessage =
  | { t: 'create'; clientId: string; name: string; skin: Skin; settings: Partial<RuleSettings> }
  | { t: 'join'; clientId: string; code: string; name: string; skin: Skin }
  | { t: 'start' }
  /** Создатель комнаты меняет сложность ботов до начала игры. */
  | { t: 'config'; botLevel: BotLevel }
  /** Игрок готов к следующему раунду. */
  | { t: 'ready' }
  | { t: 'bid'; bid: number }
  | { t: 'play'; card: Card; joker?: JokerChoice }
  | { t: 'leave' };

/** Сообщения от сервера браузеру. */
export type ServerMessage =
  | {
      t: 'room';
      code: string;
      /** Места по порядку от получателя: 0 — он сам. Пустое место — null. */
      seats: (SeatInfo | null)[];
      /** Создатель комнаты — получатель? Только он может начать игру. */
      host: boolean;
      started: boolean;
      /** Сложность ботов и сколько ботов займёт свободные места. */
      botLevel: BotLevel;
      bots: number;
    }
  /** `now` — время сервера: по нему браузер показывает общий для всех таймер хода. */
  | { t: 'state'; game: GameState; now: number }
  | { t: 'error'; message: string };

/** Заглушка вместо чужой карты: игроку виден только размер чужой руки. */
const HIDDEN_CARD: Card = { suit: 'clubs', rank: 6 };

function rotate<T>(list: T[], by: number): T[] {
  return list.map((_, i) => list[(i + by) % list.length]);
}

/**
 * Состояние партии глазами игрока `me`:
 *  - всё повёрнуто так, что он сам — игрок 0 (как в одиночной игре);
 *  - чужие карты заменены заглушками;
 *  - состояние генератора случайных чисел скрыто (по нему можно было бы вычислить раздачу).
 */
export function viewFor(game: GameState, me: number): GameState {
  const seatOf = (player: number) => (player - me + PLAYER_COUNT) % PLAYER_COUNT;
  return {
    ...game,
    rng: { seed: 0 },
    playerNames: rotate(game.playerNames, me),
    dealer: seatOf(game.dealer),
    turn: seatOf(game.turn),
    hands: rotate(game.hands, me).map((hand, seat) => (seat === 0 ? hand.slice() : hand.map(() => HIDDEN_CARD))),
    bids: rotate(game.bids, me),
    taken: rotate(game.taken, me),
    passStreak: rotate(game.passStreak, me),
    penalties: rotate(game.penalties, me),
    autoPlay: rotate(game.autoPlay, me),
    trick: game.trick.map((play) => ({ ...play, player: seatOf(play.player) })),
    trickWinner: game.trickWinner === null ? null : seatOf(game.trickWinner),
    sheet: game.sheet.map((row) => ({
      ...row,
      dealer: seatOf(row.dealer),
      cells: rotate(row.cells, me),
    })),
  };
}

/** Короткий код комнаты: без похожих букв и цифр (O/0, I/1). */
export function makeRoomCode(random: () => number = Math.random): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(random() * alphabet.length)];
  return code;
}
