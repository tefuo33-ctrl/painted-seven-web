// Боты. Они не подглядывают: используют только свою руку и то, что видно всем
// (козырь, стол, заказы, взятки, вышедшие карты).
//
// Уровни сложности отличаются алгоритмом, а не «случайными числами»:
//   easy   — простые правила, иногда ошибается (случайная карта, неточный заказ);
//   normal — те же правила без ошибок, заказ по силе руки и длине мастей;
//   hard   — помнит вышедшие карты, заказ уточняет перебором случайных раскладов,
//            в конце раунда просчитывает ходы;
//   expert — каждый заказ и каждый ход проверяет на десятках возможных раскладов,
//            учитывает заказы соперников.

import {
  type BotLevel,
  type Card,
  type GameState,
  type JokerChoice,
  type JokerDemand,
  type Play,
  type Suit,
  SUITS,
  allowedBids,
  createDeck,
  currentRound,
  finishTrick,
  firstPlayer,
  hasBidding,
  isJoker,
  jokerDemandsFor,
  legalCardsFor,
  playCard,
  playerCount,
  sameCard,
  scoreRound,
  trickWinner,
} from '../engine';

export interface BotMove {
  card: Card;
  joker?: JokerChoice;
}

type Random = () => number;

// ---------- Что бот знает ----------

/** Карты, которые бот не видел: не у него в руке, не вышли и не лежат на столе. */
function unseenCards(state: GameState, player: number): Card[] {
  const known = [...state.hands[player], ...state.seen, ...state.trick.map((p) => p.card)];
  // Карта, показавшая козырь, лежит в остатке колоды (если остаток есть) — в игре её нет.
  const stockTrump = state.trumpCard && currentRound(state).cards < 9 ? [state.trumpCard] : [];
  return createDeck().filter((card) => ![...known, ...stockTrump].some((k) => sameCard(k, card)));
}

/** Сколько карт этой масти старше данной ещё не вышло (и не у бота в руке). */
function higherUnseen(card: Card, unseen: Card[]): number {
  return unseen.filter((c) => !isJoker(c) && c.suit === card.suit && c.rank > card.rank).length;
}

// ---------- Оценка руки для заказа ----------

/** Примерная вероятность, что карта возьмёт взятку (без учёта вышедших карт). */
function trickChance(card: Card, trump: Suit | null, hand: Card[]): number {
  if (isJoker(card)) return 1;
  const sameSuit = hand.filter((c) => !isJoker(c) && c.suit === card.suit).length;
  if (trump !== null && card.suit === trump) {
    const byRank: Record<number, number> = {
      14: 0.95, 13: 0.85, 12: 0.7, 11: 0.55, 10: 0.45, 9: 0.35, 8: 0.3, 7: 0.25, 6: 0.2,
    };
    // Когда карт мало, в игре мало козырей — даже мелкий козырь силён. Длинный козырь усиливает мелкие.
    return Math.min(1, byRank[card.rank] + (9 - hand.length) * 0.04 + Math.max(0, sameSuit - 3) * 0.06);
  }
  if (trump === null) {
    const byRank: Record<number, number> = { 14: 0.88, 13: 0.58, 12: 0.32, 11: 0.12 };
    // Без козыря длинная масть сама берёт взятки младшими картами.
    return Math.min(1, (byRank[card.rank] ?? 0) + Math.max(0, sameSuit - 4) * 0.08);
  }
  const byRank: Record<number, number> = { 14: 0.66, 13: 0.36, 12: 0.12 };
  // Длинную некозырную масть чаще бьют козырем.
  return Math.max(0, (byRank[card.rank] ?? 0) - Math.max(0, sameSuit - 4) * 0.06);
}

function handStrength(hand: Card[], trump: Suit | null): number {
  let expected = 0;
  for (const card of hand) expected += trickChance(card, trump, hand);
  if (trump !== null) {
    // Короткая масть при своих козырях — шанс взять взятку козырем.
    const trumps = hand.filter((c) => !isJoker(c) && c.suit === trump).length;
    for (const suit of SUITS) {
      if (suit === trump) continue;
      const length = hand.filter((c) => !isJoker(c) && c.suit === suit).length;
      if (length === 0 && trumps >= 2 && hand.length >= 4) expected += 0.35;
    }
  }
  return expected;
}

/** Ближайший разрешённый заказ к желаемому. */
function nearestAllowed(wanted: number, allowed: number[]): number {
  return allowed.reduce((best, bid) => (Math.abs(bid - wanted) < Math.abs(best - wanted) ? bid : best));
}

// ---------- Простые правила хода (основа всех уровней) ----------

/** Хочет ли игрок сейчас брать взятку. */
function wantsTrick(state: GameState, player: number): boolean {
  const mode = currentRound(state).mode;
  if (mode === 'minus') return false;
  if (mode === 'plus') return true;
  const bid = state.bids[player] ?? 0;
  // Ровно набрал заказ — больше не брать. Уже перебрал — каждая взятка даёт +1.
  return state.taken[player] !== bid;
}

/** «Сила» карты для сравнения: козыри старше всех, джокер старше козырей. */
function power(card: Card, trump: Suit | null): number {
  if (isJoker(card)) return 1000;
  return card.rank + (card.suit === trump ? 100 : 0);
}

function byPower(trump: Suit | null) {
  return (a: Card, b: Card) => power(a, trump) - power(b, trump);
}

/** Побеждает ли эта карта, если положить её сейчас (джокер считаем «сильным»). */
function winsNow(state: GameState, player: number, card: Card): boolean {
  const plays: Play[] = [...state.trick, { player, card }];
  return trickWinner(plays, state.trump) === player;
}

/** Выбор режима джокера. `takeTrick` — хочет ли бот забрать взятку. */
function chooseJoker(state: GameState, player: number, takeTrick: boolean): JokerChoice {
  const choice: JokerChoice = { mode: takeTrick ? 'high' : 'low' };
  const demands = jokerDemandsFor(state);
  if (demands.length === 0) return choice; // не заход — требовать нечего

  const mode = currentRound(state).mode;
  const pick = (demand: JokerDemand) => demands.includes(demand);
  if (takeTrick && pick('trump') && mode !== 'plus') {
    choice.demand = 'trump'; // забираем взятку и выбиваем у всех козыри
  } else if (pick('suit') && takeTrick) {
    // Без козыря: выбиваем старшие карты в своей самой длинной масти — потом она берёт взятки.
    const hand = state.hands[player].filter((c) => !isJoker(c));
    let best: Suit = 'hearts';
    let bestLength = -1;
    for (const suit of SUITS) {
      const length = hand.filter((c) => c.suit === suit).length;
      if (length > bestLength) {
        best = suit;
        bestLength = length;
      }
    }
    choice.demand = 'suit';
    choice.suit = best;
  } else {
    // Пусть все сбросят крупные карты: потом легче взять своё или не взять лишнего.
    choice.demand = 'strongest';
  }
  return choice;
}

/**
 * Ход по простым правилам. `memory` — учитывать ли вышедшие карты
 * (тогда бот знает, какая карта стала старшей в масти).
 */
function ruleMove(state: GameState, player: number, memory: boolean): BotMove {
  const legal = legalCardsFor(state, player);
  const trump = state.trump;
  const want = wantsTrick(state, player);
  const joker = legal.find(isJoker);
  const normal = legal.filter((c) => !isJoker(c)).sort(byPower(trump));
  const isLead = state.trick.length === 0;
  const isLast = state.trick.length === playerCount(state) - 1;
  const unseen = memory ? unseenCards(state, player) : null;
  /** Карта — старшая из оставшихся в своей масти. */
  const isBoss = (card: Card) => (unseen ? higherUnseen(card, unseen) === 0 : card.rank === 14);
  const trumpsOut = unseen && trump ? unseen.filter((c) => !isJoker(c) && c.suit === trump).length : 99;

  const playJoker = (takeTrick: boolean): BotMove => ({ card: joker!, joker: chooseJoker(state, player, takeTrick) });
  if (normal.length === 0) return playJoker(want); // в руке только джокер

  const lowest = normal[0];
  const highest = normal[normal.length - 1];

  if (want) {
    if (isLead) {
      // Заходим с карты, которая почти наверняка возьмёт: старший козырь или старшая в масти.
      const bosses = normal.filter(isBoss);
      const bossTrump = bosses.find((c) => c.suit === trump);
      if (bossTrump) return { card: bossTrump };
      // Некозырная старшая карта надёжна, если козыри у соперников вышли (или их нет вовсе).
      const safeBoss = bosses.filter((c) => c.suit !== trump).sort((a, b) => b.rank - a.rank)[0];
      if (safeBoss && (trump === null || trumpsOut === 0 || !memory)) return { card: safeBoss };
      if (joker) return playJoker(true);
      if (safeBoss) return { card: safeBoss };
      // Надёжной карты нет: выманиваем старшие мелкой некозырной.
      const nonTrump = normal.filter((c) => c.suit !== trump);
      return { card: nonTrump.length > 0 ? nonTrump[0] : lowest };
    }
    const winning = normal.filter((c) => winsNow(state, player, c));
    if (winning.length > 0) {
      // Последним ходом берём самой дешёвой картой, иначе — самой сильной (чтобы не перебили).
      return { card: isLast ? winning[0] : winning[winning.length - 1] };
    }
    if (joker) return playJoker(true);
    return { card: lowest }; // взять нечем — сбрасываем мелочь
  }

  // Взятка не нужна.
  if (isLead) {
    // Заходим с мелкой карты, которую наверняка перебьют. Если мелких нет — «слабым» джокером.
    if (joker && lowest.rank > 9) return playJoker(false);
    const safe = normal.filter((c) => c.suit !== trump && !isBoss(c));
    if (safe.length > 0) return { card: safe[0] };
    const nonTrump = normal.filter((c) => c.suit !== trump);
    return { card: nonTrump.length > 0 ? nonTrump[0] : lowest };
  }
  const losing = normal.filter((c) => !winsNow(state, player, c));
  if (losing.length > 0) return { card: losing[losing.length - 1] }; // сбрасываем самую крупную из безопасных
  if (joker) return playJoker(false);
  // Любая карта берёт: последним ходом избавляемся от крупной, иначе надеемся, что перебьют.
  return { card: isLast ? highest : lowest };
}

// ---------- Перебор возможных раскладов (hard и expert) ----------

function shuffled<T>(list: T[], random: Random): T[] {
  const result = list.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Копия партии для «мысленной» игры: таблица не нужна, руки копируем. */
function cloneForSimulation(state: GameState): GameState {
  return {
    ...state,
    hands: state.hands.map((hand) => hand.slice()),
    trick: state.trick.map((play) => ({ ...play })),
    bids: state.bids.slice(),
    taken: state.taken.slice(),
    seen: state.seen.slice(),
    passStreak: state.passStreak.slice(),
    penalties: state.penalties.slice(),
    autoPlay: state.autoPlay.slice(),
    sheet: [],
  };
}

/**
 * Один возможный мир: бот знает свою руку, а карты соперников раздаёт случайно
 * из тех, что он ещё не видел. Настоящие руки соперников не используются.
 */
function sampleWorld(state: GameState, player: number, random: Random): GameState {
  const world = cloneForSimulation(state);
  let pool = shuffled(unseenCards(state, player), random);
  const round = currentRound(state);
  // В раундах по 9 карт козырь показала последняя карта раздающего — она точно у него.
  const dealerHolds =
    round.cards * playerCount(state) >= 36 &&
    state.trumpCard !== null &&
    state.dealer !== player &&
    pool.some((c) => sameCard(c, state.trumpCard!));
  if (dealerHolds) pool = pool.filter((c) => !sameCard(c, state.trumpCard!));

  for (let other = 0; other < playerCount(state); other++) {
    if (other === player) continue;
    const size = state.hands[other].length;
    const hand: Card[] = [];
    if (dealerHolds && other === state.dealer && size > 0) hand.push(state.trumpCard!);
    while (hand.length < size && pool.length > 0) hand.push(pool.pop()!);
    world.hands[other] = hand;
  }
  return world;
}

/** Доиграть раунд по простым правилам и вернуть очки игрока за него. */
function playOut(world: GameState, player: number, selfish: number): number {
  for (let guard = 0; guard < 200 && (world.phase === 'playing' || world.phase === 'trickEnd'); guard++) {
    if (world.phase === 'trickEnd') {
      finishTrick(world);
    } else {
      const move = ruleMove(world, world.turn, true);
      playCard(world, world.turn, move.card, move.joker);
    }
  }
  const mode = currentRound(world).mode;
  const score = (p: number) => scoreRound(mode, hasBidding(mode) ? (world.bids[p] ?? 0) : null, world.taken[p], world.settings).points;
  let others = 0;
  const players = playerCount(world);
  for (let p = 0; p < players; p++) if (p !== player) others += score(p);
  // Эксперт слегка учитывает и чужой результат: мешать соперникам тоже выгодно.
  return score(player) - (others / (players - 1)) * selfish;
}

/** Все разумные ходы: каждая разрешённая карта; джокер — в обоих режимах. */
function candidateMoves(state: GameState, player: number): BotMove[] {
  const moves: BotMove[] = [];
  for (const card of legalCardsFor(state, player)) {
    if (isJoker(card)) {
      moves.push({ card, joker: chooseJoker(state, player, true) });
      moves.push({ card, joker: chooseJoker(state, player, false) });
    } else {
      moves.push({ card });
    }
  }
  return moves;
}

/** Выбрать ход, проверив каждый вариант на нескольких случайных раскладах. */
function searchMove(state: GameState, player: number, samples: number, selfish: number, random: Random): BotMove {
  const moves = candidateMoves(state, player);
  if (moves.length === 1) return moves[0];
  const totals = moves.map(() => 0);
  for (let s = 0; s < samples; s++) {
    const world = sampleWorld(state, player, random);
    moves.forEach((move, i) => {
      const trial = cloneForSimulation(world);
      try {
        playCard(trial, player, move.card, move.joker);
        totals[i] += playOut(trial, player, selfish);
      } catch {
        totals[i] -= 1000; // такой ход в этом раскладе невозможен
      }
    });
  }
  // При равенстве предпочитаем ход, который советуют простые правила.
  const advised = ruleMove(state, player, true);
  let best = 0;
  moves.forEach((move, i) => {
    const same = sameCard(move.card, advised.card) && move.joker?.mode === advised.joker?.mode;
    const value = totals[i] + (same ? 0.01 * samples : 0);
    const bestSame = sameCard(moves[best].card, advised.card) && moves[best].joker?.mode === advised.joker?.mode;
    if (value > totals[best] + (bestSame ? 0.01 * samples : 0)) best = i;
  });
  return moves[best];
}

/** Выбрать заказ, сыграв раунд «в уме» с каждым возможным заказом. */
function searchBid(state: GameState, player: number, samples: number, selfish: number, random: Random): number {
  const allowed = allowedBids(state, player);
  const guess = Math.round(handStrength(state.hands[player], state.trump));
  // Проверяем заказы рядом с грубой оценкой — остальные заведомо хуже.
  const options = allowed.filter((bid) => Math.abs(bid - guess) <= 2);
  const bids = options.length > 0 ? options : allowed;
  const totals = bids.map(() => 0);
  for (let s = 0; s < samples; s++) {
    const world = sampleWorld(state, player, random);
    // Те, кто ещё не заказал, в этом мире заказывают по силе своей (случайной) руки.
    for (let other = 0; other < playerCount(world); other++) {
      if (other !== player && world.bids[other] === null) {
        world.bids[other] = Math.round(handStrength(world.hands[other], world.trump));
      }
    }
    bids.forEach((bid, i) => {
      const trial = cloneForSimulation(world);
      trial.bids[player] = bid;
      trial.phase = 'playing';
      trial.turn = firstPlayer(trial);
      totals[i] += playOut(trial, player, selfish);
    });
  }
  let best = 0;
  totals.forEach((total, i) => {
    if (total > totals[best]) best = i;
  });
  return bids[best];
}

// ---------- Решения по уровням ----------

const SEARCH: Record<BotLevel, { bid: number; move: number; endgame: number; selfish: number }> = {
  easy: { bid: 0, move: 0, endgame: 0, selfish: 0 },
  normal: { bid: 0, move: 0, endgame: 0, selfish: 0 },
  hard: { bid: 14, move: 0, endgame: 5, selfish: 0 },
  expert: { bid: 36, move: 24, endgame: 9, selfish: 0.12 },
};

export function chooseBid(state: GameState, player: number, level?: BotLevel, random: Random = Math.random): number {
  const depth = level ?? state.settings.botLevel;
  const round = currentRound(state);
  const allowed = allowedBids(state, player);
  const search = SEARCH[depth];

  // «Тёмная»: карт ещё нет. В среднем на игрока приходится четверть взяток;
  // сильные боты учитывают, сколько уже заказали другие.
  if (!state.dealt) {
    let wanted = round.cards / playerCount(state);
    if (depth === 'hard' || depth === 'expert') {
      const placed = state.bids.filter((b): b is number => b !== null);
      const left = playerCount(state) - placed.length;
      const sum = placed.reduce((a, b) => a + b, 0);
      wanted = Math.max(0, (round.cards - sum) / Math.max(1, left)) * 0.85;
    }
    if (depth === 'easy') wanted += random() < 0.5 ? 1 : -1;
    else wanted += (random() - 0.5) * 0.9; // немного разнообразия: заказ вслепую не бывает точным
    return nearestAllowed(Math.round(wanted), allowed);
  }

  if (search.bid > 0) return searchBid(state, player, search.bid, search.selfish, random);

  let wanted = handStrength(state.hands[player], state.trump);
  if (depth === 'easy' && random() < 0.4) wanted += random() < 0.5 ? 1 : -1; // новичок часто ошибается на взятку
  return nearestAllowed(Math.round(wanted), allowed);
}

export function chooseMove(state: GameState, player: number, level?: BotLevel, random: Random = Math.random): BotMove {
  const depth = level ?? state.settings.botLevel;
  const search = SEARCH[depth];

  if (depth === 'easy') {
    // Новичок иногда кладёт случайную разрешённую карту.
    if (random() < 0.22) {
      const moves = candidateMoves(state, player);
      return moves[Math.floor(random() * moves.length)];
    }
    return ruleMove(state, player, false);
  }
  if (depth === 'normal') return ruleMove(state, player, false);

  const cardsLeft = state.hands[player].length;
  const samples = search.move > 0 ? search.move : cardsLeft <= search.endgame ? 10 : 0;
  if (samples > 0 && cardsLeft > 1) return searchMove(state, player, samples, search.selfish, random);
  return ruleMove(state, player, true);
}
