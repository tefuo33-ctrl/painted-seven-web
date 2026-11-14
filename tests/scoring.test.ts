// Тесты подсчёта очков. T-19 … T-32 — сценарии из заметок «08 Tests/Tests Scoring».

import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, scoreRound } from '../src/engine';

describe('Обычные раунды', () => {
  it('T-19, T-20: взял ровно — 10 за взятку', () => {
    expect(scoreRound('normal', 1, 1).points).toBe(10);
    expect(scoreRound('normal', 5, 5).points).toBe(50);
  });

  it('T-21, T-22: перебор — по 1 очку за взятку', () => {
    expect(scoreRound('normal', 1, 2).points).toBe(2);
    expect(scoreRound('normal', 1, 3).points).toBe(3);
    expect(scoreRound('normal', 3, 5).points).toBe(5);
  });

  it('T-23, T-24: полный недобор', () => {
    expect(scoreRound('normal', 5, 0).points).toBe(-50);
    expect(scoreRound('normal', 1, 0).points).toBe(-10);
  });

  it('T-25: частичный недобор — −10 за каждую недобранную', () => {
    expect(scoreRound('normal', 5, 3).points).toBe(-20);
    expect(scoreRound('normal', 2, 1).points).toBe(-10);
  });

  it('T-25 (вариант из старых заметок): −10 за каждую заказанную', () => {
    const old = { ...DEFAULT_SETTINGS, underbidRule: 'perBid' as const };
    expect(scoreRound('normal', 5, 3, old).points).toBe(-50);
  });

  it('T-26: заказ 0, взято 0 — очки из настройки (по умолчанию +5)', () => {
    expect(scoreRound('normal', 0, 0).points).toBe(5);
    expect(scoreRound('normal', 0, 0, { ...DEFAULT_SETTINGS, zeroBidPoints: 0 }).points).toBe(0);
  });

  it('T-27: заказ 0, взято 2 — перебор, +2', () => {
    expect(scoreRound('normal', 0, 2).points).toBe(2);
  });

  it('T-28: «Тёмная» и «Без козыря» считаются как обычный раунд', () => {
    expect(scoreRound('dark', 2, 2).points).toBe(20);
    expect(scoreRound('noTrump', 2, 0).points).toBe(-20);
  });

  it('лучше перебрать, чем недобрать', () => {
    const over = scoreRound('normal', 2, 3).points;
    const under = scoreRound('normal', 2, 1).points;
    expect(over).toBeGreaterThan(under);
  });
});

describe('«Минуса»', () => {
  it('T-29: каждая взятка −20', () => {
    expect(scoreRound('minus', null, 3)).toEqual({ points: -60, star: false });
  });

  it('T-30: ни одной взятки — звёздочка +50', () => {
    expect(scoreRound('minus', null, 0)).toEqual({ points: 50, star: true });
  });
});

describe('«Плюса»', () => {
  it('T-31: каждая взятка +20', () => {
    expect(scoreRound('plus', null, 4)).toEqual({ points: 80, star: false });
  });

  it('T-32: ни одной взятки — звёздочка −50', () => {
    expect(scoreRound('plus', null, 0)).toEqual({ points: -50, star: true });
  });
});
