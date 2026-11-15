// Настройки правил. Всё, в чём правила не до конца ясны (см. RULES.md, «Допущения»),
// вынесено сюда: ответ знакомого поменяет одно значение, а не код.

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
  /** Запрет: сумма всех заказов не может равняться числу карт (ограничивает последнего). */
  forbidSumEqualsCards: boolean;
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
  forbidSumEqualsCards: false,
  jokerRequests: true,
  gameLength: 'full',
};
