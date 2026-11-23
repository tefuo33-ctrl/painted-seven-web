// Ход партии: раздача → заказ → взятки → подсчёт → следующий раунд.
//
// Состояние партии — обычный объект (GameState) без функций и без DOM.
// Его можно сохранить в JSON, отправить по сети (для будущего онлайна)
// или использовать в приложении для телефона и компьютера.
// Менять состояние можно только функциями этого файла — они проверяют правила.

import { type Card, type Suit, SUITS, createDeck, isJoker, sameCard } from './cards';
import { type Rng, deal, randomInt, shuffle } from './deck';
import {
  type RoundSpec,
  MIN_PLAYERS,
  PLAYER_COUNT,
  bidsBeforeDeal,
  buildRoundSequence,
  hasBidding,
  hasTrump,
} from './rounds';
import {
  type JokerChoice,
  type JokerDemand,
  type Play,
  jokerDemands,
  legalCards,
  trickWinner,
} from './rules';
import { scoreRound } from './scoring';
import { DEFAULT_SETTINGS, type RuleSettings } from './settings';

/**
 * Фаза игры — чего игра сейчас ждёт:
 * deal      — пора раздавать карты (dealCards);
 * bidding   — игрок `turn` должен сделать заказ;
 * playing   — игрок `turn` должен положить карту;
 * trickEnd  — взятка сыграна, её надо забрать (finishTrick);
 * roundEnd  — раунд подсчитан, можно начинать следующий (nextRound);
 * gameOver  — партия окончена.
 */
export type Phase = 'deal' | 'bidding' | 'playing' | 'trickEnd' | 'roundEnd' | 'gameOver';

/** Ячейка таблицы: один игрок в одном раунде. */
export interface SheetCell {
  bid: number | null;
  tricks: number;
  /** Очки за раунд (уже со штрафом). */
  points: number;
  star: boolean;
  /** Штраф за просроченные ходы (0 или отрицательное число). */
  penalty: number;
  /** Сумма очков с начала партии. */
  total: number;
}

/** Строка таблицы: один раунд. */
export interface SheetRow {
  round: RoundSpec;
  trump: Suit | null;
  dealer: number;
  cells: SheetCell[];
}

export interface GameState {
  settings: RuleSettings;
  rng: Rng;
  playerNames: string[];
  rounds: RoundSpec[];
  roundIndex: number;
  dealer: number;
  phase: Phase;
  /** Чья очередь действовать (в фазах bidding и playing). */
  turn: number;
  dealt: boolean;
  hands: Card[][];
  trump: Suit | null;
  /** Карта, показавшая козырь. */
  trumpCard: Card | null;
  bids: (number | null)[];
  /** Сколько взяток взял каждый в этом раунде. */
  taken: number[];
  /** Карты текущей взятки. */
  trick: Play[];
  /** Кто забрал только что сыгранную взятку (в фазе trickEnd). */
  trickWinner: number | null;
  /** Карты, вышедшие в уже сыгранных взятках этого раунда (их видели все). */
  seen: Card[];
  /** Сколько раундов подряд каждый игрок заказывал пас (0 взяток). */
  passStreak: number[];
  /** Штрафы за просроченные ходы в этом раунде (отрицательные числа). */
  penalties: number[];
  /** Сколько раз подряд текущий игрок просрочил свой ход. */
  strikes: number;
  /** Кто выбыл из раунда за бездействие — за него доигрывает бот. */
  autoPlay: boolean[];
  /** Когда начался текущий ход (мс, часы того, кто ведёт партию). Нужно для таймера. */
  turnStartedAt: number;
  sheet: SheetRow[];
}

export interface NewGameOptions {
  settings?: Partial<RuleSettings>;
  seed?: number;
  playerNames?: string[];
  /** Кто раздаёт первым; по умолчанию — случайный игрок. */
  firstDealer?: number;
}

/** Сколько игроков в партии (2–4). */
export function playerCount(state: Pick<GameState, 'playerNames'>): number {
  return state.playerNames.length;
}

function next(state: GameState, player: number): number {
  return (player + 1) % playerCount(state);
}

export function createGame(options: NewGameOptions = {}): GameState {
  const settings: RuleSettings = { ...DEFAULT_SETTINGS, ...options.settings };
  const rng: Rng = { seed: options.seed ?? Math.floor(Math.random() * 2 ** 31) };
  const playerNames = (options.playerNames ?? ['Вы', 'Аня', 'Борис', 'Вера']).slice(0, PLAYER_COUNT);
  if (playerNames.length < MIN_PLAYERS) throw new Error('Нужно хотя бы два игрока');
  const players = playerNames.length;
  const state: GameState = {
    settings,
    rng,
    playerNames,
    rounds: buildRoundSequence(settings.gameLength, players),
    roundIndex: 0,
    dealer: options.firstDealer ?? randomInt(rng, 0, players - 1),
    phase: 'deal',
    turn: 0,
    dealt: false,
    hands: [],
    trump: null,
    trumpCard: null,
    bids: [],
    taken: [],
    trick: [],
    trickWinner: null,
    seen: [],
    passStreak: Array.from({ length: players }, () => 0),
    penalties: [],
    strikes: 0,
    autoPlay: [],
    turnStartedAt: 0,
    sheet: [],
  };
  startRound(state);
  return state;
}

export function currentRound(state: GameState): RoundSpec {
  return state.rounds[state.roundIndex];
}

/**
 * Сосед раздающего по часовой: он первым получает карту, первым заказывает и первым заходит.
 * Раздающий заказывает последним.
 */
export function firstPlayer(state: GameState): number {
  return next(state, state.dealer);
}

/** Кто заказывает первым — тот же сосед раздающего по часовой. */
export function firstBidder(state: GameState): number {
  return firstPlayer(state);
}

/** Начался новый ход: сбрасываем счётчик просрочек. Время ставит тот, кто ведёт партию. */
function newTurn(state: GameState, player: number): void {
  state.turn = player;
  state.strikes = 0;
  state.turnStartedAt = 0;
}

function startRound(state: GameState): void {
  const round = currentRound(state);
  state.dealt = false;
  state.hands = Array.from({ length: playerCount(state) }, () => []);
  state.trump = null;
  state.trumpCard = null;
  state.bids = Array.from({ length: playerCount(state) }, () => null);
  state.taken = Array.from({ length: playerCount(state) }, () => 0);
  state.trick = [];
  state.trickWinner = null;
  state.seen = [];
  state.penalties = Array.from({ length: playerCount(state) }, () => 0);
  state.autoPlay = Array.from({ length: playerCount(state) }, () => false);
  // В «Тёмной» сначала заказ, потом раздача.
  state.phase = bidsBeforeDeal(round.mode) ? 'bidding' : 'deal';
  newTurn(state, state.phase === 'bidding' ? firstBidder(state) : firstPlayer(state));
}

/** Раздача: колода тасуется, карты раздаются по одной по часовой стрелке. */
export function dealCards(state: GameState): void {
  if (state.phase !== 'deal') throw new Error('Сейчас нельзя раздавать');
  const round = currentRound(state);

  const deck = shuffle(createDeck(), state.rng);

  const result = deal(deck, playerCount(state), round.cards, state.dealer);
  state.hands = result.hands;
  state.dealt = true;

  if (hasTrump(round.mode)) {
    // Есть остаток колоды — козырь показывает его верхняя карта,
    // иначе — последняя карта раздающего (остаётся у него в руке).
    state.trumpCard = result.rest.length > 0 ? result.rest[0] : result.dealerLastCard;
    // Если козырь показала семёрка пик (джокер) — раунд играется без козыря.
    state.trump = isJoker(state.trumpCard) ? null : state.trumpCard.suit;
  }

  const needBids = hasBidding(round.mode) && state.bids.some((b) => b === null);
  state.phase = needBids ? 'bidding' : 'playing';
  newTurn(state, needBids ? firstBidder(state) : firstPlayer(state));
}

/** Почему заказ запрещён: 'sum' — сумма заказов сравнялась бы с числом взяток, 'pass' — третий пас подряд. */
export type BidBan = 'sum' | 'pass';

/**
 * Запрещён ли такой заказ игроку (null — разрешён).
 *  - Последний заказывающий не может довести сумму заказов до числа взяток:
 *    кто-то обязательно недоберёт или переберёт.
 *  - Нельзя заказывать пас (0) слишком много раундов подряд.
 */
export function bidBan(state: GameState, player: number, bid: number): BidBan | null {
  const { settings } = state;
  const cards = currentRound(state).cards;
  const sumBanned = (value: number) => {
    // Ограничен последний заказывающий — раздающий.
    if (!settings.forbidSumEqualsCards || player !== state.dealer) return false;
    const sum = state.bids.reduce<number>((s, b, i) => s + (i === player ? 0 : (b ?? 0)), 0);
    return sum + value === cards;
  };
  if (sumBanned(bid)) return 'sum';
  if (bid === 0 && settings.maxPassesInRow > 0 && state.passStreak[player] >= settings.maxPassesInRow) {
    // Если кроме паса заказать нечего (например, одна карта и запрет суммы), пас всё же разрешён.
    const hasOther = Array.from({ length: cards }, (_, i) => i + 1).some((value) => !sumBanned(value));
    if (hasOther) return 'pass';
  }
  return null;
}

/** Какие заказы сейчас разрешены игроку. */
export function allowedBids(state: GameState, player: number): number[] {
  const cards = currentRound(state).cards;
  const all = Array.from({ length: cards + 1 }, (_, i) => i);
  return all.filter((bid) => bidBan(state, player, bid) === null);
}

export function placeBid(state: GameState, player: number, bid: number): void {
  if (state.phase !== 'bidding') throw new Error('Сейчас не время заказа');
  if (player !== state.turn) throw new Error('Заказывает другой игрок');
  if (!allowedBids(state, player).includes(bid)) throw new Error(`Заказ ${bid} недопустим`);

  state.bids[player] = bid;
  state.passStreak[player] = bid === 0 ? state.passStreak[player] + 1 : 0;
  if (state.bids.every((b) => b !== null)) {
    state.phase = state.dealt ? 'playing' : 'deal';
    newTurn(state, firstPlayer(state));
  } else {
    newTurn(state, next(state, player));
  }
}

/** Карты, которыми игрок может пойти прямо сейчас. */
export function legalCardsFor(state: GameState, player: number): Card[] {
  return legalCards({
    hand: state.hands[player],
    plays: state.trick,
    trump: state.trump,
    settings: state.settings,
  });
}

/** Что можно потребовать у остальных, кладя джокер прямо сейчас (только на заходе). */
export function jokerDemandsFor(state: GameState): JokerDemand[] {
  return jokerDemands(state.trick, state.trump, state.settings);
}

/** Игрок кладёт карту. Для джокера нужно передать выбранный режим. */
export function playCard(
  state: GameState,
  player: number,
  card: Card,
  joker?: JokerChoice,
): void {
  if (state.phase !== 'playing') throw new Error('Сейчас нельзя ходить');
  if (player !== state.turn) throw new Error('Ходит другой игрок');
  if (!legalCardsFor(state, player).some((c) => sameCard(c, card))) {
    throw new Error('Этой картой сейчас ходить нельзя');
  }

  // В партию попадают только масть и ранг: лишние поля (например, из сообщения браузера) отбрасываются.
  const play: Play = { player, card: { suit: card.suit, rank: card.rank } };
  if (isJoker(card)) {
    const choice = joker ?? { mode: 'high' };
    if (choice.mode !== 'high' && choice.mode !== 'low') throw new Error('Неизвестный режим джокера');
    play.joker = { mode: choice.mode };
    if (choice.demand) {
      if (!jokerDemandsFor(state).includes(choice.demand)) {
        throw new Error('Требовать карту можно, только заходя с джокера');
      }
      play.joker.demand = choice.demand;
      if (choice.demand === 'suit') {
        if (!choice.suit || !SUITS.includes(choice.suit)) throw new Error('Для этого требования нужно назвать масть');
        play.joker.suit = choice.suit;
      }
    }
  }

  const hand = state.hands[player];
  const index = hand.findIndex((c) => sameCard(c, card));
  if (index < 0) throw new Error('Такой карты нет на руке');
  hand.splice(index, 1);
  state.trick.push(play);

  if (state.trick.length === playerCount(state)) {
    state.trickWinner = trickWinner(state.trick, state.trump);
    state.phase = 'trickEnd';
    state.strikes = 0;
  } else {
    newTurn(state, next(state, player));
  }
}

/** Забрать сыгранную взятку: победитель получает её и заходит следующим. */
export function finishTrick(state: GameState): void {
  if (state.phase !== 'trickEnd' || state.trickWinner === null) {
    throw new Error('Взятка ещё не сыграна');
  }
  const winner = state.trickWinner;
  if (!Number.isInteger(winner) || winner < 0 || winner >= playerCount(state)) throw new Error('Неизвестный победитель взятки');
  state.taken[winner]++;
  state.seen.push(...state.trick.map((play) => play.card));
  state.trick = [];
  state.trickWinner = null;

  if (state.hands[winner].length > 0) {
    newTurn(state, winner);
    state.phase = 'playing';
  } else {
    finishRound(state);
  }
}

function finishRound(state: GameState): void {
  const round = currentRound(state);
  const previous = state.sheet[state.sheet.length - 1];
  const cells: SheetCell[] = [];
  for (let player = 0; player < playerCount(state); player++) {
    const bid = hasBidding(round.mode) ? state.bids[player] : null;
    const score = scoreRound(round.mode, bid, state.taken[player], state.settings);
    const penalty = state.penalties[player] ?? 0;
    const points = score.points + penalty;
    cells.push({
      bid,
      tricks: state.taken[player],
      points,
      star: score.star,
      penalty,
      total: (previous ? previous.cells[player].total : 0) + points,
    });
  }
  state.sheet.push({ round, trump: state.trump, dealer: state.dealer, cells });
  state.phase = 'roundEnd';
}

/** Что случилось при просрочке хода: штраф или игрок выбыл из раунда. */
export type TimeoutResult = 'penalty' | 'kicked';

/**
 * Текущий игрок просрочил ход (прошло settings.turnSeconds без действия).
 * Каждая просрочка — штраф; после settings.maxTimeouts подряд игрок выбывает из раунда:
 * до конца раунда за него ходит бот.
 */
export function timeoutStrike(state: GameState): TimeoutResult {
  if (state.phase !== 'bidding' && state.phase !== 'playing') throw new Error('Сейчас никто не ходит');
  const player = state.turn;
  state.penalties[player] -= state.settings.timeoutPenalty;
  state.strikes++;
  if (state.strikes >= state.settings.maxTimeouts) {
    state.autoPlay[player] = true;
    return 'kicked';
  }
  return 'penalty';
}

/** Перейти к следующему раунду (или закончить партию). */
export function nextRound(state: GameState): void {
  if (state.phase !== 'roundEnd') throw new Error('Раунд ещё не закончен');
  if (state.roundIndex + 1 >= state.rounds.length) {
    state.phase = 'gameOver';
    return;
  }
  state.roundIndex++;
  state.dealer = next(state, state.dealer);
  startRound(state);
}

/** Текущие суммы очков игроков. */
export function totals(state: GameState): number[] {
  const last = state.sheet[state.sheet.length - 1];
  return last
    ? last.cells.map((c) => c.total)
    : Array.from({ length: playerCount(state) }, () => 0);
}

/** Победители — все, у кого максимум очков (при равенстве победу делят). */
export function winners(scores: number[]): number[] {
  // Только настоящие числа: «не число» в сумме не должно оставить партию без победителя.
  const valid = scores.filter((s) => Number.isFinite(s));
  if (valid.length === 0) return [];
  const best = Math.max(...valid);
  return scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
}
