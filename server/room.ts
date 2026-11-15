// Комната: четыре места, партия и её ход. Правила исполняются здесь, на сервере, —
// браузеры получают только «вид игрока» без чужих карт.

import { chooseBid, chooseMove } from '../src/ai/bot';
import {
  type BotLevel,
  type Card,
  type GameState,
  type JokerChoice,
  type RuleSettings,
  createGame,
  currentRound,
  dealCards,
  finishTrick,
  nextRound,
  placeBid,
  playCard,
  timeoutStrike,
} from '../src/engine';
import { type SeatInfo, type ServerMessage, PLAYER_COUNT, viewFor } from '../src/net/protocol';
import { pickBotNames } from '../src/shared/names';
import { type Skin, randomGender, randomSkin } from '../src/shared/skin';

/** Паузы (мс), чтобы игроки успевали следить за игрой и анимациями. */
const BOT_DELAY = 900;
const TRICK_DELAY = 2300;
const BEFORE_DEAL = 1400;
/** Пауза перед следующим раундом, когда все готовы. */
const NEXT_ROUND_DELAY = 1200;

export interface Connection {
  send(message: ServerMessage): void;
}

interface Seat {
  clientId: string | null; // null — бот
  name: string;
  skin: Skin;
  connection: Connection | null;
  /** Готов к следующему раунду. */
  ready: boolean;
}

export class Room {
  readonly code: string;
  readonly seats: (Seat | null)[] = [null, null, null, null];
  game: GameState | null = null;
  private settings: Partial<RuleSettings>;
  private hostId: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  lastActivity = Date.now();

  constructor(code: string, hostId: string, settings: Partial<RuleSettings>) {
    this.code = code;
    this.hostId = hostId;
    this.settings = settings;
  }

  get started(): boolean {
    return this.game !== null;
  }

  /** Есть ли в комнате хоть один человек на связи. */
  get alive(): boolean {
    return this.seats.some((seat) => seat?.connection);
  }

  seatOf(clientId: string): number {
    return this.seats.findIndex((seat) => seat?.clientId === clientId);
  }

  /** Посадить человека: вернуть на своё место при переподключении или занять свободное. */
  join(clientId: string, name: string, skin: Skin, connection: Connection): number {
    this.lastActivity = Date.now();
    let index = this.seatOf(clientId);
    if (index < 0) {
      if (this.started) throw new Error('Игра в этой комнате уже началась');
      index = this.seats.findIndex((seat) => seat === null);
      if (index < 0) throw new Error('В комнате уже четыре игрока');
      this.seats[index] = { clientId, name, skin, connection, ready: false };
    } else {
      const seat = this.seats[index]!;
      seat.connection = connection;
      if (!this.started) {
        seat.name = name;
        seat.skin = skin;
      }
    }
    this.broadcastRoom();
    if (this.game) {
      connection.send({ t: 'state', game: viewFor(this.game, index), now: Date.now() });
      this.schedule(); // человек вернулся — бот больше не ходит за него
    }
    return index;
  }

  /** Связь пропала или человек вышел. До начала игры место освобождается. */
  leave(clientId: string, connection?: Connection): void {
    const index = this.seatOf(clientId);
    if (index < 0) return;
    // Закрылось старое соединение, а человек уже вернулся по новому — ничего не делаем.
    if (connection && this.seats[index]!.connection !== connection) return;
    if (this.started) this.seats[index]!.connection = null;
    else this.seats[index] = null;
    this.broadcastRoom();
    if (this.game) this.schedule(); // за отсутствующего ходит бот
  }

  /** Начать партию: пустые места занимают боты со случайными именами и внешностью. */
  start(clientId: string): void {
    if (clientId !== this.hostId) throw new Error('Начать игру может только создатель комнаты');
    if (this.started) return;
    const empty = this.seats.flatMap((seat, i) => (seat === null ? [i] : []));
    const genders = empty.map(() => randomGender());
    const taken = this.seats.flatMap((seat) => (seat ? [seat.name] : []));
    const names = pickBotNames(genders, taken);
    empty.forEach((index, n) => {
      this.seats[index] = { clientId: null, name: names[n], skin: randomSkin(genders[n]), connection: null, ready: true };
    });
    this.game = createGame({
      settings: { ...this.settings, botLevel: this.botLevel },
      playerNames: this.seats.map((seat) => seat!.name),
    });
    this.broadcastRoom();
    this.schedule();
  }

  // ---------- Действия игроков ----------

  bid(clientId: string, bid: number): void {
    const game = this.requireTurn(clientId);
    placeBid(game, game.turn, bid);
    this.schedule();
  }

  play(clientId: string, card: Card, joker?: JokerChoice): void {
    const game = this.requireTurn(clientId);
    playCard(game, game.turn, card, joker);
    this.schedule();
  }

  /** Игрок подтвердил, что готов к следующему раунду. Раунд начнётся, когда готовы все люди на связи. */
  ready(clientId: string): void {
    const index = this.seatOf(clientId);
    if (index < 0 || !this.game || this.game.phase !== 'roundEnd') return;
    this.seats[index]!.ready = true;
    this.broadcastRoom();
    this.schedule();
  }

  /** Создатель комнаты выбирает сложность ботов (только до начала игры). */
  configure(clientId: string, botLevel: BotLevel): void {
    if (clientId !== this.hostId) throw new Error('Настройки меняет только создатель комнаты');
    if (this.started) return;
    if (!['easy', 'normal', 'hard', 'expert'].includes(botLevel)) return;
    this.botLevel = botLevel;
    this.broadcastRoom();
  }

  /** Все люди на связи подтвердили готовность? Боты и отключившиеся раунд не задерживают. */
  private get everyoneReady(): boolean {
    return this.seats.every((seat) => !seat || seat.clientId === null || seat.connection === null || seat.ready);
  }

  private requireTurn(clientId: string): GameState {
    const index = this.seatOf(clientId);
    if (!this.game || index < 0) throw new Error('Вы не в этой игре');
    if (this.game.turn !== index) throw new Error('Сейчас не ваш ход');
    return this.game;
  }

  // ---------- Ход партии ----------

  /** За это место сейчас действует сервер (бот или отключившийся человек)? */
  private automatic(index: number): boolean {
    const seat = this.seats[index];
    // Бот, отключившийся человек или игрок, выбывший из раунда за бездействие.
    return !seat || seat.clientId === null || seat.connection === null || this.game?.autoPlay[index] === true;
  }

  /** Разослать состояние и запланировать следующий автоматический шаг. */
  private schedule(): void {
    const game = this.game;
    if (!game) return;
    this.lastActivity = Date.now();
    this.broadcastState();
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;

    const after = (ms: number, action: () => void) => {
      this.timer = setTimeout(() => {
        this.timer = null;
        try {
          action();
        } catch (error) {
          console.error(`[${this.code}]`, error);
        }
        this.schedule();
      }, ms);
    };

    switch (game.phase) {
      case 'deal':
        after(BEFORE_DEAL, () => {
          dealCards(game);
          // Ждём, пока у игроков доиграет анимация раздачи.
          this.dealPause = 1600 + currentRound(game).cards * PLAYER_COUNT * 80;
        });
        break;
      case 'bidding':
      case 'playing': {
        const pause = this.takeDealPause();
        if (this.automatic(game.turn)) {
          // За людей (отключившихся или выбывших) бот играет на обычном уровне.
          const level = this.seats[game.turn]?.clientId === null ? undefined : 'normal';
          after(BOT_DELAY + pause, () => {
            if (game.phase === 'bidding') {
              placeBid(game, game.turn, chooseBid(game, game.turn, level));
            } else {
              const move = chooseMove(game, game.turn, level);
              playCard(game, game.turn, move.card, move.joker);
            }
          });
        } else if (game.settings.turnSeconds > 0) {
          // Таймер хода живёт на сервере: переподключение его не сбрасывает.
          if (game.turnStartedAt === 0) {
            game.turnStartedAt = Date.now() + pause;
            this.broadcastState();
          }
          const deadline = game.turnStartedAt + game.settings.turnSeconds * 1000;
          after(Math.max(0, deadline - Date.now()), () => {
            timeoutStrike(game); // штраф; после третьего подряд игрок выбывает из раунда
            game.turnStartedAt = Date.now();
          });
        }
        break;
      }
      case 'trickEnd':
        after(TRICK_DELAY, () => finishTrick(game));
        break;
      case 'roundEnd':
        // Следующий раунд начинается, только когда готовы все люди на связи.
        if (this.everyoneReady) {
          after(NEXT_ROUND_DELAY, () => {
            if (game.phase !== 'roundEnd') return;
            nextRound(game);
            for (const seat of this.seats) if (seat && seat.clientId !== null) seat.ready = false;
            this.broadcastRoom();
          });
        }
        break;
      default:
        break;
    }
  }

  private dealPause = 0;
  private botLevel: BotLevel = 'normal';

  private takeDealPause(): number {
    const pause = this.dealPause;
    this.dealPause = 0;
    return pause;
  }

  // ---------- Рассылка ----------

  private seatInfo(index: number): SeatInfo | null {
    const seat = this.seats[index];
    if (!seat) return null;
    return {
      name: seat.name,
      skin: seat.skin,
      bot: seat.clientId === null,
      connected: seat.clientId === null || seat.connection !== null,
      ready: seat.clientId === null || seat.ready,
    };
  }

  private broadcastRoom(): void {
    this.seats.forEach((seat, index) => {
      if (!seat?.connection) return;
      seat.connection.send({
        t: 'room',
        code: this.code,
        seats: Array.from({ length: PLAYER_COUNT }, (_, i) => this.seatInfo((index + i) % PLAYER_COUNT)),
        host: seat.clientId === this.hostId,
        started: this.started,
        botLevel: this.botLevel,
        bots: this.started
          ? this.seats.filter((s) => s?.clientId === null).length
          : this.seats.filter((s) => s === null).length,
      });
    });
  }

  private broadcastState(): void {
    const game = this.game;
    if (!game) return;
    this.seats.forEach((seat, index) => {
      seat?.connection?.send({ t: 'state', game: viewFor(game, index), now: Date.now() });
    });
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
