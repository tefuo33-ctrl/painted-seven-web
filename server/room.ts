// Комната: до четырёх мест, партия и её ход. Играть можно вдвоём, втроём и вчетвером. Правила исполняются здесь, на сервере, —
// браузеры получают только «вид игрока» без чужих карт.

import { randomBytes } from 'node:crypto';
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
import { MIN_PLAYERS } from '../src/engine/rounds';
import { type SeatInfo, type ServerMessage, PLAYER_COUNT, viewFor } from '../src/net/protocol';
import { dealSeconds } from '../src/shared/dealTiming';
import { pickBotNames } from '../src/shared/names';
import { type Skin, randomGender, randomSkin } from '../src/shared/skin';
import { cleanSettings } from './validate';

/** Паузы (мс), чтобы игроки успевали следить за игрой и анимациями. */
const BOT_DELAY = 900;
const TRICK_DELAY = 2300;
const BEFORE_DEAL = 1400;
/** Пауза перед следующим раундом, когда все готовы. */
const NEXT_ROUND_DELAY = 1200;
/**
 * Даже с выключенным таймером комната не может зависнуть навсегда: через 10 минут без хода
 * за игрока ходит бот, а через 5 минут ожидания готовности следующий раунд начинается сам.
 */
const MAX_TURN_WAIT = 10 * 60 * 1000;
const MAX_READY_WAIT = 5 * 60 * 1000;
/** Самая длинная пауза, которую умеет setTimeout (больше — Node превращает её в 1 мс). */
const MAX_TIMEOUT = 2 ** 31 - 1;

export interface Connection {
  send(message: ServerMessage): void;
  /** Соединение ещё открыто (у поддельных соединений в тестах метода нет — считаются открытыми). */
  isOpen?(): boolean;
  /** Закрыть соединение (например, когда тот же игрок зашёл с другой вкладки). */
  close?(): void;
}

function isOpen(connection: Connection | null): boolean {
  return connection !== null && (connection.isOpen ? connection.isOpen() : true);
}

interface Seat {
  clientId: string | null; // null — бот
  name: string;
  skin: Skin;
  connection: Connection | null;
  /** Готов к следующему раунду. */
  ready: boolean;
  /**
   * Секрет места: его знает только этот игрок (сервер выдаёт его при входе в комнату).
   * Вернуться на место после перезагрузки можно, только назвав его, — одного clientId мало.
   */
  token: string;
}

function newToken(): string {
  return randomBytes(16).toString('hex');
}

export class Room {
  readonly code: string;
  /** До начала — четыре места (null — свободно). После начала — только игроки партии, по порядку хода. */
  seats: (Seat | null)[] = [null, null, null, null];
  game: GameState | null = null;
  private settings: Partial<RuleSettings>;
  private hostId: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  lastActivity = Date.now();

  /** Когда началось ожидание готовности к следующему раунду (0 — не ждём). */
  private readySince = 0;

  constructor(code: string, hostId: string, settings: unknown) {
    this.code = code;
    this.hostId = hostId;
    // Только известные настройки в допустимых пределах (их присылает браузер создателя).
    this.settings = cleanSettings(settings);
  }

  get started(): boolean {
    return this.game !== null;
  }

  /** Есть ли в комнате хоть один человек на связи. */
  get alive(): boolean {
    return this.seats.some((seat) => seat !== null && isOpen(seat.connection));
  }

  /** В комнате не осталось ни одного человека (до начала игры все ушли). */
  get empty(): boolean {
    return this.seats.every((seat) => seat === null || seat.clientId === null);
  }

  /** Секрет места игрока `clientId` (null — его нет в комнате). */
  tokenOf(clientId: string): string | null {
    const index = this.seatOf(clientId);
    return index < 0 ? null : this.seats[index]!.token;
  }

  seatOf(clientId: string): number {
    return this.seats.findIndex((seat) => seat?.clientId === clientId);
  }

  /** Посадить человека: вернуть на своё место при переподключении или занять свободное. */
  join(clientId: string, name: string, skin: Skin, connection: Connection, token: string | null = null): number {
    let index = this.seatOf(clientId);
    let returned = false;
    if (index < 0) {
      // Не говорим, почему нельзя войти (идёт игра или мест нет): одна и та же ошибка.
      if (this.started) throw new Error('err.cannotJoin');
      index = this.seats.findIndex((seat) => seat === null);
      if (index < 0) throw new Error('err.cannotJoin');
      this.seats[index] = { clientId, name, skin, connection, ready: false, token: newToken() };
    } else {
      const seat = this.seats[index]!;
      // Вернуться на место можно только с его секретом — иначе по одному clientId его можно было бы занять.
      if (token !== seat.token) throw new Error('err.cannotJoin');
      returned = !isOpen(seat.connection);
      // На месте может сидеть только одно соединение: прежнее (другая вкладка) закрываем.
      if (seat.connection && seat.connection !== connection) {
        const old = seat.connection;
        seat.connection = null;
        try {
          old.send({ t: 'error', message: 'err.replaced' });
          old.close?.();
        } catch {
          // старое соединение уже закрыто
        }
      }
      seat.connection = connection;
      if (!this.started) {
        seat.name = name;
        seat.skin = skin;
      }
    }
    this.lastActivity = Date.now();
    this.broadcastRoom();
    if (this.game) {
      this.sendTo(connection, { t: 'state', game: viewFor(this.game, index), now: Date.now() });
      // Человек вернулся — бот больше не ходит за него. Если он и так был на связи (просто
      // переподключился), ничего не перепланируем: иначе частые переподключения тормозили бы игру.
      if (returned) this.schedule();
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
    else {
      this.seats[index] = null;
      // Создатель ушёл до начала игры — права переходят к следующему человеку в комнате.
      if (clientId === this.hostId) {
        const next = this.seats.find((seat) => seat !== null && seat.clientId !== null);
        if (next?.clientId) this.hostId = next.clientId;
      }
    }
    this.broadcastRoom();
    if (this.game) this.schedule(); // за отсутствующего ходит бот
  }

  /** Сколько ботов сядет за стол: сколько выбрал создатель, но не больше свободных мест. */
  private plannedBots(): number {
    const free = this.seats.filter((seat) => seat === null).length;
    return Math.min(this.botCount ?? free, free);
  }

  /**
   * Начать партию. За стол садятся все люди и выбранное число ботов (со случайными именами
   * и внешностью). Лишние свободные места убираются: играют вдвоём, втроём или вчетвером.
   */
  start(clientId: string): void {
    if (clientId !== this.hostId) throw new Error('err.notHost');
    if (this.started) return;
    const humans = this.seats.filter((seat): seat is Seat => seat !== null);
    const botCount = this.plannedBots();
    if (humans.length + botCount < MIN_PLAYERS) throw new Error('err.needPlayers');
    const genders = Array.from({ length: botCount }, () => randomGender());
    const names = pickBotNames(genders, humans.map((seat) => seat.name));
    const bots: Seat[] = genders.map((gender, n) => ({
      clientId: null,
      name: names[n],
      skin: randomSkin(gender),
      connection: null,
      ready: true,
      token: '',
    }));
    this.seats = [...humans, ...bots];
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
    // Только масть и ранг: лишние поля из браузера в партию не попадают.
    playCard(game, game.turn, { suit: card.suit, rank: card.rank }, joker);
    this.schedule();
  }

  /** Игрок подтвердил, что готов к следующему раунду. Раунд начнётся, когда готовы все люди на связи. */
  ready(clientId: string): void {
    const index = this.seatOf(clientId);
    if (index < 0 || !this.game || this.game.phase !== 'roundEnd') return;
    // Повторное «готов» ничего не меняет (и не откладывает следующий раунд).
    if (this.seats[index]!.ready) return;
    this.seats[index]!.ready = true;
    this.broadcastRoom();
    this.schedule();
  }

  /** Создатель комнаты выбирает сложность ботов и их число (только до начала игры). */
  configure(clientId: string, botLevel?: BotLevel, bots?: number): void {
    if (clientId !== this.hostId) throw new Error('err.notHost');
    if (this.started) return;
    if (botLevel !== undefined && ['easy', 'normal', 'hard', 'expert'].includes(botLevel)) this.botLevel = botLevel;
    if (Number.isInteger(bots) && bots! >= 0 && bots! <= PLAYER_COUNT) this.botCount = bots!;
    this.broadcastRoom();
  }

  /** Все люди на связи подтвердили готовность? Боты и отключившиеся раунд не задерживают. */
  private get everyoneReady(): boolean {
    return this.seats.every((seat) => !seat || seat.clientId === null || seat.connection === null || seat.ready);
  }

  private requireTurn(clientId: string): GameState {
    const index = this.seatOf(clientId);
    if (!this.game || index < 0) throw new Error('err.notInGame');
    if (this.game.turn !== index) throw new Error('err.notYourTurn');
    // Игрок выбыл из раунда за бездействие: до конца раунда за него ходит бот.
    if (this.game.autoPlay[index]) throw new Error('err.notYourTurn');
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
    // Сначала снимаем прежний таймер: что бы ни случилось дальше, двух таймеров не будет.
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.broadcastState();

    const after = (ms: number, action: () => void) => {
      this.timer = setTimeout(
        () => {
          this.timer = null;
          try {
            action();
          } catch (error) {
            console.error(`[${this.code}]`, error);
          }
          try {
            this.schedule();
          } catch (error) {
            console.error(`[${this.code}] reschedule`, error);
          }
        },
        Math.min(Math.max(0, ms), MAX_TIMEOUT),
      );
    };
    if (game.phase !== 'roundEnd') this.readySince = 0;

    switch (game.phase) {
      case 'deal':
        after(BEFORE_DEAL, () => {
          dealCards(game);
          // Ждём, пока у игроков доиграет анимация раздачи.
          // Камера сверху, тасовка, карты по одной, возврат камеры (src/shared/dealTiming.ts);
          // подъём камеры и тасовка у игроков уже шли, пока сервер ждал BEFORE_DEAL.
          const total = currentRound(game).cards * game.playerNames.length;
          this.dealPause = Math.max(1600, dealSeconds(total) * 1000 - BEFORE_DEAL + 300);
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
        } else {
          // Таймер выключен, но бесконечно ждать нельзя: через 10 минут за игрока ходит бот.
          after(MAX_TURN_WAIT + pause, () => {
            if (game.phase === 'bidding') placeBid(game, game.turn, chooseBid(game, game.turn, 'normal'));
            else if (game.phase === 'playing') {
              const move = chooseMove(game, game.turn, 'normal');
              playCard(game, game.turn, move.card, move.joker);
            }
          });
        }
        break;
      }
      case 'trickEnd':
        after(TRICK_DELAY, () => finishTrick(game));
        break;
      case 'roundEnd':
        // Следующий раунд начинается, когда готовы все люди на связи
        // (или когда ждём уже 5 минут — один молчащий игрок не держит всех).
        if (this.readySince === 0) this.readySince = Date.now();
        {
          const startNext = () => {
            if (game.phase !== 'roundEnd') return;
            nextRound(game);
            this.readySince = 0;
            for (const seat of this.seats) if (seat && seat.clientId !== null) seat.ready = false;
            this.broadcastRoom();
          };
          if (this.everyoneReady) after(NEXT_ROUND_DELAY, startNext);
          else after(this.readySince + MAX_READY_WAIT - Date.now(), startNext);
        }
        break;
      default:
        break;
    }
  }

  private dealPause = 0;
  private botLevel: BotLevel = 'normal';
  /** Сколько ботов посадить (null — занять все свободные места). */
  private botCount: number | null = null;

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

  /** Отправить одному игроку; ошибка одного соединения не ломает комнату. */
  private sendTo(connection: Connection, message: ServerMessage): void {
    try {
      connection.send(message);
    } catch (error) {
      console.error(`[${this.code}] send`, error);
    }
  }

  private broadcastRoom(): void {
    this.seats.forEach((seat, index) => {
      if (!seat?.connection) return;
      this.sendTo(seat.connection, {
        t: 'room',
        code: this.code,
        seats: Array.from({ length: this.seats.length }, (_, i) => this.seatInfo((index + i) % this.seats.length)),
        host: seat.clientId === this.hostId,
        started: this.started,
        botLevel: this.botLevel,
        bots: this.started ? this.seats.filter((s) => s?.clientId === null).length : this.plannedBots(),
        freeSeats: this.started ? 0 : this.seats.filter((s) => s === null).length,
        token: seat.token,
      });
    });
  }

  private broadcastState(): void {
    const game = this.game;
    if (!game) return;
    this.seats.forEach((seat, index) => {
      if (seat?.connection) this.sendTo(seat.connection, { t: 'state', game: viewFor(game, index), now: Date.now() });
    });
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
