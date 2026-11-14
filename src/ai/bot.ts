// Простые боты. Они не подглядывают: видят только свою руку и то, что видно всем
// (козырь, стол, заказы, взятки). Играют по понятным правилам, без случайности.

import {
  type Card,
  type GameState,
  type JokerChoice,
  type Play,
  type Suit,
  allowedBids,
  currentRound,
  isJoker,
  jokerOptionsFor,
  legalCardsFor,
  totals,
  trickWinner,
} from '../engine';

// ---------- Заказ ----------

/** Примерная вероятность, что карта возьмёт взятку. */
function trickChance(card: Card, trump: Suit | null, handSize: number): number {
  if (isJoker(card)) return 1;
  if (trump !== null && card.suit === trump) {
    const byRank: Record<number, number> = {
      14: 0.95, 13: 0.85, 12: 0.7, 11: 0.55, 10: 0.45, 9: 0.35, 8: 0.3, 7: 0.25, 6: 0.2,
    };
    // Когда карт мало, в игре мало козырей — даже мелкий козырь силён.
    return Math.min(1, byRank[card.rank] + (9 - handSize) * 0.04);
  }
  if (trump === null) {
    const byRank: Record<number, number> = { 14: 0.85, 13: 0.55, 12: 0.3, 11: 0.1 };
    return byRank[card.rank] ?? 0;
  }
  const byRank: Record<number, number> = { 14: 0.65, 13: 0.35, 12: 0.12 };
  return byRank[card.rank] ?? 0;
}

/** Ближайший разрешённый заказ к желаемому. */
function nearestAllowed(wanted: number, allowed: number[]): number {
  return allowed.reduce((best, bid) =>
    Math.abs(bid - wanted) < Math.abs(best - wanted) ? bid : best,
  );
}

export function chooseBid(state: GameState, player: number): number {
  const round = currentRound(state);
  const allowed = allowedBids(state, player);

  // «Тёмная»: карт ещё нет. В среднем на игрока приходится четверть взяток.
  if (!state.dealt) {
    return nearestAllowed(Math.round(round.cards / 4), allowed);
  }

  const hand = state.hands[player];
  let expected = 0;
  for (const card of hand) {
    expected += trickChance(card, state.trump, hand.length);
  }
  return nearestAllowed(Math.round(expected), allowed);
}

// ---------- Ход ----------

export interface BotMove {
  card: Card;
  joker?: JokerChoice;
}

/** Хочет ли бот сейчас брать взятку. */
function wantsTrick(state: GameState, player: number): boolean {
  const mode = currentRound(state).mode;
  if (mode === 'minus') return false;
  if (mode === 'plus') return true;
  const bid = state.bids[player] ?? 0;
  const taken = state.taken[player];
  // Ровно набрал заказ — больше не брать. Уже перебрал — каждая взятка даёт +1.
  return taken !== bid;
}

/** «Сила» карты для сравнения: козыри старше всех, джокер старше козырей. */
function power(card: Card, trump: Suit | null): number {
  if (isJoker(card)) return 1000;
  return card.rank + (card.suit === trump ? 100 : 0);
}

/** Насколько хороша карта для захода, когда взятка нужна. */
function leadValue(card: Card, trump: Suit | null): number {
  if (isJoker(card)) return 13.5; // почти как туз: надёжно, но туз лучше сыграть раньше
  if (card.suit === trump) {
    return card.rank >= 12 ? card.rank + 5 : card.rank - 8; // мелкие козыри бережём
  }
  return card.rank;
}

function byPower(trump: Suit | null) {
  return (a: Card, b: Card) => power(a, trump) - power(b, trump);
}

/** Побеждает ли эта карта, если положить её сейчас (джокер считаем «сильным»). */
function winsNow(state: GameState, player: number, card: Card): boolean {
  const plays: Play[] = [...state.trick, { player, card }];
  return trickWinner(plays, state.trump, state.settings) === player;
}

/** Выбор режима джокера. `takeTrick` — хочет ли бот забрать взятку. */
function chooseJoker(state: GameState, player: number, takeTrick: boolean): JokerChoice {
  const options = jokerOptionsFor(state, player);
  const requestTakes = state.settings.jokerRequestStrength === 'high';
  const mode = currentRound(state).mode;

  // Просьба подходит, только если она даёт нужный результат со взяткой.
  if (requestTakes === takeTrick) {
    const wantedMode =
      takeTrick && state.trump !== null && mode !== 'plus' ? 'askTrump' : 'askStrongest';
    const option = options.find((o) => o.mode === wantedMode);
    if (option && option.targets.length > 0) {
      // Просим у лидера по очкам.
      const scores = totals(state);
      const target = option.targets.reduce((best, p) => (scores[p] > scores[best] ? p : best));
      return { mode: wantedMode, target };
    }
  }
  return { mode: takeTrick ? 'high' : 'low' };
}

export function chooseMove(state: GameState, player: number): BotMove {
  const legal = legalCardsFor(state, player);
  const trump = state.trump;
  const want = wantsTrick(state, player);
  const joker = legal.find(isJoker);
  const normal = legal.filter((c) => !isJoker(c)).sort(byPower(trump));
  const isLead = state.trick.length === 0;
  const isLast = state.trick.length === 3;

  const playJoker = (takeTrick: boolean): BotMove => ({
    card: joker!,
    joker: chooseJoker(state, player, takeTrick),
  });

  // В руке только джокер.
  if (normal.length === 0) return playJoker(want);

  const lowest = normal[0];
  const highest = normal[normal.length - 1];

  if (want) {
    if (isLead) {
      const best = legal.reduce((a, b) => (leadValue(b, trump) > leadValue(a, trump) ? b : a));
      return isJoker(best) ? playJoker(true) : { card: best };
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
    // Заходим с мелкой карты. Если мелких нет — «слабым» джокером.
    if (joker && lowest.rank > 9) return playJoker(false);
    const nonTrump = normal.filter((c) => c.suit !== trump);
    return { card: nonTrump.length > 0 ? nonTrump[0] : lowest };
  }
  const losing = normal.filter((c) => !winsNow(state, player, c));
  if (losing.length > 0) {
    return { card: losing[losing.length - 1] }; // сбрасываем самую крупную из безопасных
  }
  if (joker) return playJoker(false);
  // Любая карта берёт: последним ходом избавляемся от крупной, иначе надеемся, что перебьют.
  return { card: isLast ? highest : lowest };
}
