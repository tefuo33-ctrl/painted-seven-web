// Ход партии: раздача → заказ → взятки → подсчёт → следующий раунд.
//
// Состояние партии — обычный объект (GameState) без функций и без DOM.
// Его можно сохранить в JSON, отправить по сети (для будущего онлайна)
// или использовать в приложении для телефона и компьютера.
// Менять состояние можно только функциями этого файла — они проверяют правила.

import { type Card, type Suit, createDeck, isJoker, sameCard } from './cards';
import { type Rng, cutDeck, deal, randomInt, shuffle } from './deck';
import {
  type RoundSpec,
  PLAYER_COUNT,
  bidsBeforeDeal,
  buildRoundSequence,
  hasBidding,
  hasTrump,
} from './rounds';
import {
  type JokerChoice,
  type JokerOption,
  type Play,
  isRequestMode,
  jokerOptions,
  legalCards,
  trickWinner,
} from './rules';
import { scoreRound } from './scoring';
import { DEFAULT_SETTINGS, type RuleSettings } from './settings';

/**
 * Фаза игры — чего игра сейчас ждёт:
 * deal      — раздающий должен раздать (и дать срезать);
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
  /** Штраф за пропущенный срез (0 или отрицательное число). */
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
  /** Штрафы за срез в этом раунде. */
  penalties: number[];
  sheet: SheetRow[];
}

export interface NewGameOptions {
  settings?: Partial<RuleSettings>;
  seed?: number;
  playerNames?: string[];
  /** Кто раздаёт первым; по умолчанию — случайный игрок. */
  firstDealer?: number;
}

function next(player: number): number {
  return (player + 1) % PLAYER_COUNT;
}

export function createGame(options: NewGameOptions = {}): GameState {
  const settings: RuleSettings = { ...DEFAULT_SETTINGS, ...options.settings };
  const rng: Rng = { seed: options.seed ?? Math.floor(Math.random() * 2 ** 31) };
  const state: GameState = {
    settings,
    rng,
    playerNames: options.playerNames ?? ['Вы', 'Аня', 'Борис', 'Вера'],
    rounds: buildRoundSequence(settings.gameLength),
    roundIndex: 0,
    dealer: options.firstDealer ?? randomInt(rng, 0, PLAYER_COUNT - 1),
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
    penalties: [],
    sheet: [],
  };
  startRound(state);
  return state;
}

export function currentRound(state: GameState): RoundSpec {
  return state.rounds[state.roundIndex];
}

/** Сосед раздающего по часовой: он срезает, первым заказывает и первым заходит. */
export function firstPlayer(state: GameState): number {
  return next(state.dealer);
}

function startRound(state: GameState): void {
  const round = currentRound(state);
  state.dealt = false;
  state.hands = Array.from({ length: PLAYER_COUNT }, () => []);
  state.trump = null;
  state.trumpCard = null;
  state.bids = Array.from({ length: PLAYER_COUNT }, () => null);
  state.taken = Array.from({ length: PLAYER_COUNT }, () => 0);
  state.trick = [];
  state.trickWinner = null;
  state.penalties = Array.from({ length: PLAYER_COUNT }, () => 0);
  state.turn = firstPlayer(state);
  // В «Тёмной» сначала заказ, потом раздача.
  state.phase = bidsBeforeDeal(round.mode) ? 'bidding' : 'deal';
}

/**
 * Раздача. `didCut` — дал ли раздающий срезать колоду.
 * `cutPosition` — где срезали (по умолчанию случайно).
 */
export function dealCards(state: GameState, didCut = true, cutPosition?: number): void {
  if (state.phase !== 'deal') throw new Error('Сейчас нельзя раздавать');
  const round = currentRound(state);

  let deck = shuffle(createDeck(), state.rng);
  if (didCut) {
    deck = cutDeck(deck, cutPosition ?? randomInt(state.rng, 4, deck.length - 4));
  } else if (state.settings.cutPenalty > 0) {
    state.penalties[state.dealer] = -state.settings.cutPenalty;
  }

  const result = deal(deck, PLAYER_COUNT, round.cards, state.dealer);
  state.hands = result.hands;
  state.dealt = true;

  if (hasTrump(round.mode)) {
    // Есть остаток колоды — козырь показывает его верхняя карта,
    // иначе — последняя карта раздающего (остаётся у него в руке).
    state.trumpCard = result.rest.length > 0 ? result.rest[0] : result.dealerLastCard;
    state.trump = state.trumpCard.suit;
  }

  const needBids = hasBidding(round.mode) && state.bids.some((b) => b === null);
  state.phase = needBids ? 'bidding' : 'playing';
  state.turn = firstPlayer(state);
}

/** Какие заказы сейчас разрешены игроку. */
export function allowedBids(state: GameState, player: number): number[] {
  const cards = currentRound(state).cards;
  const all = Array.from({ length: cards + 1 }, (_, i) => i);
  if (!state.settings.forbidSumEqualsCards || player !== state.dealer) return all;
  // Раздающий заказывает последним и не может «закрыть» сумму.
  const sum = state.bids.reduce<number>((s, b) => s + (b ?? 0), 0);
  return all.filter((bid) => sum + bid !== cards);
}

export function placeBid(state: GameState, player: number, bid: number): void {
  if (state.phase !== 'bidding') throw new Error('Сейчас не время заказа');
  if (player !== state.turn) throw new Error('Заказывает другой игрок');
  if (!allowedBids(state, player).includes(bid)) throw new Error(`Заказ ${bid} недопустим`);

  state.bids[player] = bid;
  if (state.bids.every((b) => b !== null)) {
    state.phase = state.dealt ? 'playing' : 'deal';
    state.turn = firstPlayer(state);
  } else {
    state.turn = next(player);
  }
}

/** Карты, которыми игрок может пойти прямо сейчас. */
export function legalCardsFor(state: GameState, player: number): Card[] {
  return legalCards({
    hand: state.hands[player],
    plays: state.trick,
    trump: state.trump,
    player,
    settings: state.settings,
  });
}

/** Режимы джокера, доступные игроку прямо сейчас. */
export function jokerOptionsFor(state: GameState, player: number): JokerOption[] {
  return jokerOptions(state.trick, player, state.trump, state.settings, PLAYER_COUNT);
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

  const play: Play = { player, card };
  if (isJoker(card)) {
    const choice = joker ?? { mode: 'high' };
    const option = jokerOptionsFor(state, player).find((o) => o.mode === choice.mode);
    if (!option) throw new Error('Этот режим джокера сейчас недоступен');
    if (isRequestMode(choice.mode)) {
      if (choice.target === undefined || !option.targets.includes(choice.target)) {
        throw new Error('У этого игрока нельзя попросить карту');
      }
      play.joker = { mode: choice.mode, target: choice.target };
    } else {
      play.joker = { mode: choice.mode };
    }
  }

  const hand = state.hands[player];
  hand.splice(hand.findIndex((c) => sameCard(c, card)), 1);
  state.trick.push(play);

  if (state.trick.length === PLAYER_COUNT) {
    state.trickWinner = trickWinner(state.trick, state.trump, state.settings);
    state.phase = 'trickEnd';
  } else {
    state.turn = next(player);
  }
}

/** Забрать сыгранную взятку: победитель получает её и заходит следующим. */
export function finishTrick(state: GameState): void {
  if (state.phase !== 'trickEnd' || state.trickWinner === null) {
    throw new Error('Взятка ещё не сыграна');
  }
  const winner = state.trickWinner;
  state.taken[winner]++;
  state.trick = [];
  state.trickWinner = null;

  if (state.hands[winner].length > 0) {
    state.turn = winner;
    state.phase = 'playing';
  } else {
    finishRound(state);
  }
}

function finishRound(state: GameState): void {
  const round = currentRound(state);
  const previous = state.sheet[state.sheet.length - 1];
  const cells: SheetCell[] = [];
  for (let player = 0; player < PLAYER_COUNT; player++) {
    const bid = hasBidding(round.mode) ? state.bids[player] : null;
    const score = scoreRound(round.mode, bid, state.taken[player], state.settings);
    const penalty = state.penalties[player];
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

/** Перейти к следующему раунду (или закончить партию). */
export function nextRound(state: GameState): void {
  if (state.phase !== 'roundEnd') throw new Error('Раунд ещё не закончен');
  if (state.roundIndex + 1 >= state.rounds.length) {
    state.phase = 'gameOver';
    return;
  }
  state.roundIndex++;
  state.dealer = next(state.dealer);
  startRound(state);
}

/** Текущие суммы очков игроков. */
export function totals(state: GameState): number[] {
  const last = state.sheet[state.sheet.length - 1];
  return last
    ? last.cells.map((c) => c.total)
    : Array.from({ length: PLAYER_COUNT }, () => 0);
}

/** Победители — все, у кого максимум очков (при равенстве победу делят). */
export function winners(scores: number[]): number[] {
  const best = Math.max(...scores);
  return scores.map((s, i) => (s === best ? i : -1)).filter((i) => i >= 0);
}
