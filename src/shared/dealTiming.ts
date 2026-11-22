// Тайминги раздачи (секунды, при обычной скорости анимаций). Общие для игры и сервера:
// сервер по ним ждёт, пока у игроков доиграет раздача, и только потом запускает таймер хода.

export const DEAL_TIMING = {
  /** Камера над столом: раздача начинается сразу с вида сверху (склейка), подъёма нет. */
  cameraUp: 0,
  /** Тасовка у раздающего. */
  shuffle: 0.6,
  /** Одна карта: отделить от колоды и полёт. */
  lift: 0.06,
  flight: 0.24,
  /**
   * Через сколько вылетает следующая карта, когда карт мало. Карт больше — следующая вылетает
   * раньше, не дожидаясь, пока приземлится предыдущая: вся раздача укладывается в `maxSpread`.
   */
  interval: 0.33,
  maxSpread: 2.0,
  /** Камера задерживается сверху, чтобы был виден итог раздачи. */
  hold: 0.8,
  /** Камера возвращается к глазам игрока (карты пока лежат на столе). */
  cameraBack: 1.6,
  /** Камера уже внизу: игроки берут карты в руки, мои появляются в веере. */
  pickup: 0.9,
};

/** Через сколько секунд после предыдущей вылетает следующая карта (при скорости 1). */
export function dealInterval(totalCards: number): number {
  const t = DEAL_TIMING;
  if (totalCards <= 1) return t.interval;
  return Math.min(t.interval, t.maxSpread / (totalCards - 1));
}

/** Сколько длится сама раздача карт — от вылета первой до приземления последней (при скорости 1). */
export function dealSpread(totalCards: number): number {
  const t = DEAL_TIMING;
  if (totalCards <= 0) return 0;
  return (totalCards - 1) * dealInterval(totalCards) + t.lift + t.flight;
}

/** Сколько длится вся раздача из `totalCards` карт (на всех игроков) при скорости `speed`. */
export function dealSeconds(totalCards: number, speed = 1): number {
  const t = DEAL_TIMING;
  return (t.cameraUp + t.shuffle + dealSpread(totalCards) + t.hold + t.cameraBack + t.pickup) / Math.max(0.1, speed);
}
