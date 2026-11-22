// Переводит состояние партии из движка в то, что видит один игрок за 3D-столом.

import { type Card, type GameState, currentRound, hasBidding, legalCardsFor } from '../engine';
import type { TableState } from './tableView';

/** `me` — номер игрока, глазами которого смотрим. Его место — 0, остальные по часовой стрелке. */
/**
 * Какое кресло занимает игрок. Кресел всегда четыре; вдвоём садятся друг напротив друга,
 * втроём — я и соседи слева и справа (дальнее кресло пустует). Порядок хода — по часовой.
 */
const SEAT_LAYOUT: Record<number, number[]> = { 2: [0, 2], 3: [0, 1, 3], 4: [0, 1, 2, 3] };

/** Кресло игрока `player` (номер относительно меня: 0 — я) при `players` игроках. */
export function seatOfPlayer(players: number, player: number): number {
  return (SEAT_LAYOUT[players] ?? SEAT_LAYOUT[4])[player] ?? player;
}

/** Внешность игроков (по номерам игроков) → по креслам; пустые кресла — null. */
export function skinsBySeat<T>(skins: (T | null)[]): (T | null)[] {
  const result: (T | null)[] = [null, null, null, null];
  skins.forEach((skin, player) => {
    result[seatOfPlayer(skins.length, player)] = skin;
  });
  return result;
}

export function tableStateFromGame(game: GameState, me: number): TableState {
  const count = game.playerNames.length;
  const relative = (player: number) => (player - me + count) % count;
  const seatOf = (player: number) => seatOfPlayer(count, relative(player));
  const myTurn = game.phase === 'playing' && game.turn === me;
  const bySeat = <T>(value: (player: number) => T, empty: T): T[] => {
    const result: T[] = [empty, empty, empty, empty];
    for (let player = 0; player < count; player++) result[seatOf(player)] = value(player);
    return result;
  };

  return {
    hands: bySeat((player) => {
      const hand = game.hands[player] ?? [];
      // Чужие карты игроку неизвестны.
      return player === me ? hand.slice() : hand.map(() => null);
    }, [] as (Card | null)[]),
    trick: game.trick.map((play) => ({ seat: seatOf(play.player), card: play.card })),
    // До раздачи колода целая; после — остаток (в раундах по 9 карт вчетвером он пуст).
    deckCount: game.dealt ? 36 - currentRoundCards(game) * count : 36,
    trumpCard: game.trumpCard,
    // В раундах по 9 карт козырь — последняя карта раздающего, она остаётся у него в руке.
    trumpSeat: game.trumpCard && game.dealt && currentRoundCards(game) * count >= 36 ? seatOf(game.dealer) : null,
    trump: game.trump,
    playable: myTurn ? legalCardsFor(game, me) : [],
    bidding: game.phase === 'bidding' && game.turn === me,
    taken: bySeat((player) => game.taken[player] ?? 0, 0),
    deckSeat: seatOf(game.dealt ? (game.dealer + 1) % count : game.dealer),
    // В розыгрыше, пока ходят другие, мой веер убран; на мой ход (и при заказе) он на экране.
    handAway: game.phase === 'trickEnd' || (game.phase === 'playing' && game.turn !== me),
    dealerSeat: seatOf(game.dealer),
    // В «Минусах» и «Плюсах» заказа нет — и слитков тоже.
    bids: bySeat((player) => (hasBidding(currentRound(game).mode) ? (game.bids[player] ?? null) : null), null as number | null),
  };
}

function currentRoundCards(game: GameState): number {
  return game.rounds[game.roundIndex].cards;
}
