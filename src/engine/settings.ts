// Настройки правил. Всё, в чём правила не до конца ясны (см. RULES.md, «Допущения»),
// вынесено сюда: ответ знакомого поменяет одно значение, а не код.

export type BotLevel = 'easy' | 'normal' | 'hard' | 'expert';

export interface RuleSettings {
  /**
   * Недобор: 'perMissing' — −10 за каждую недобранную взятку (новый текст Тима),
   * 'perBid' — −10 за каждую заказанную (старые заметки).
   */
  underbidRule: 'perMissing' | 'perBid';
  /** Очки за «заказал 0 и взял 0». */
  zeroBidPoints: number;
  /** Звёздочка в «Минусах» (ни одной взятки). */
  minusStarBonus: number;
  /** Звёздочка в «Плюсах» (ни одной взятки) — отрицательное число. */
  plusStarPenalty: number;
  /** Очки за взятку в «Минусах» (отрицательное) и «Плюсах». */
  minusPerTrick: number;
  plusPerTrick: number;
  /** Запрет: сумма всех заказов не может равняться числу карт (ограничивает последнего заказывающего). */
  forbidSumEqualsCards: boolean;
  /** Сколько раз подряд (в соседних раундах) один игрок может заказать пас — 0 взяток. 0 — без ограничения. */
  maxPassesInRow: number;
  /** Сколько секунд даётся на ход. 0 — таймер выключен. */
  turnSeconds: number;
  /** Штраф за каждые просроченные turnSeconds. */
  timeoutPenalty: number;
  /** После скольких просрочек подряд игрок выбывает из раунда (за него доигрывает бот). */
  maxTimeouts: number;
  /** Сила ботов. */
  botLevel: BotLevel;
  /** Можно ли, заходя с джокера, потребовать у остальных карту. */
  jokerRequests: boolean;
  /** Длина партии: полная (28 раундов) или короткая (7 раундов для знакомства). */
  gameLength: 'full' | 'short';
}

export const DEFAULT_SETTINGS: RuleSettings = {
  underbidRule: 'perMissing',
  zeroBidPoints: 5,
  minusStarBonus: 50,
  plusStarPenalty: -50,
  minusPerTrick: -20,
  plusPerTrick: 20,
  forbidSumEqualsCards: true,
  maxPassesInRow: 2,
  turnSeconds: 30,
  timeoutPenalty: 10,
  maxTimeouts: 3,
  botLevel: 'normal',
  jokerRequests: true,
  gameLength: 'full',
};
