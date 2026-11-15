// Переводит состояние партии из движка в то, что видит один игрок за 3D-столом.

import { type GameState, PLAYER_COUNT, legalCardsFor } from '../engine';
import type { TableState } from './tableView';

/** `me` — номер игрока, глазами которого смотрим. Его место — 0, остальные по часовой стрелке. */
export function tableStateFromGame(game: GameState, me: number): TableState {
  const playerAt = (seat: number) => (me + seat) % PLAYER_COUNT;
  const seatOf = (player: number) => (player - me + PLAYER_COUNT) % PLAYER_COUNT;
  const myTurn = game.phase === 'playing' && game.turn === me;

  return {
    hands: Array.from({ length: PLAYER_COUNT }, (_, seat) => {
      const hand = game.hands[playerAt(seat)] ?? [];
      // Чужие карты игроку неизвестны.
      return seat === 0 ? hand.slice() : hand.map(() => null);
    }),
    trick: game.trick.map((play) => ({ seat: seatOf(play.player), card: play.card })),
    // До раздачи колода целая; после — остаток (в раундах по 9 карт он пуст).
    deckCount: game.dealt ? 36 - currentRoundCards(game) * PLAYER_COUNT : 36,
    trumpCard: game.trumpCard,
    trump: game.trump,
    playable: myTurn ? legalCardsFor(game, me) : [],
  };
}

function currentRoundCards(game: GameState): number {
  return game.rounds[game.roundIndex].cards;
}
