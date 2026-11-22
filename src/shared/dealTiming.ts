// Тайминги раздачи (секунды, при обычной скорости анимаций). Общие для игры и сервера:
// сервер по ним ждёт, пока у игроков доиграет раздача, и только потом запускает таймер хода.

export const DEAL_TIMING = {
  /** Камера поднимается над столом. */
  cameraUp: 1.6,
  /** Тасовка у раздающего. */
  shuffle: 0.7,
  /** Одна карта: отделить от колоды, полёт, пауза после приземления. */
  lift: 0.06,
  flight: 0.24,
  pause: 0.03,
  /** Камера задерживается сверху, чтобы был виден итог раздачи. */
  hold: 1.6,
  /** Камера возвращается к глазам игрока (игроки в это время берут карты в руки). */
  cameraBack: 1.6,
};

/** Сколько длится вся раздача из `totalCards` карт (на всех игроков) при скорости `speed`. */
export function dealSeconds(totalCards: number, speed = 1): number {
  const t = DEAL_TIMING;
  const perCard = t.lift + t.flight + t.pause;
  return (t.cameraUp + t.shuffle + totalCards * perCard + t.hold + t.cameraBack) / Math.max(0.1, speed);
}
