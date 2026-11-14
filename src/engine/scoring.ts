// Подсчёт очков за один раунд для одного игрока.

import type { RoundMode } from './rounds';
import { DEFAULT_SETTINGS, type RuleSettings } from './settings';

export interface RoundScore {
  points: number;
  /** Звёздочка: ни одной взятки в «Минусах» или «Плюсах». */
  star: boolean;
}

/**
 * @param mode   режим раунда
 * @param bid    заказ (в «Минусах» и «Плюсах» заказа нет — передай null)
 * @param tricks сколько взяток взял
 */
export function scoreRound(
  mode: RoundMode,
  bid: number | null,
  tricks: number,
  settings: RuleSettings = DEFAULT_SETTINGS,
): RoundScore {
  if (mode === 'minus') {
    if (tricks === 0) return { points: settings.minusStarBonus, star: true };
    return { points: settings.minusPerTrick * tricks, star: false };
  }
  if (mode === 'plus') {
    if (tricks === 0) return { points: settings.plusStarPenalty, star: true };
    return { points: settings.plusPerTrick * tricks, star: false };
  }

  if (bid === null) throw new Error('В этом режиме нужен заказ');

  if (tricks === bid) {
    // Взял ровно: 10 за взятку (за «0 из 0» — отдельная настройка).
    return { points: bid === 0 ? settings.zeroBidPoints : bid * 10, star: false };
  }
  if (tricks > bid) {
    // Перебор: по 1 очку за каждую взятую взятку.
    return { points: tricks, star: false };
  }
  // Недобор.
  const missing = settings.underbidRule === 'perMissing' ? bid - tricks : bid;
  return { points: -10 * missing, star: false };
}
