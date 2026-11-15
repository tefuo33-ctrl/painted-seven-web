// Внешний вид персонажа: только данные (без 3D), чтобы их мог использовать и сервер.

export type Gender = 'male' | 'female';

/** Числа — номера цветов в палитрах ниже. */
export interface Skin {
  gender: Gender;
  /** Мужчина: 0 — кремово-белый двубортный, 1 — тёмно-синий в полоску (тройка). */
  suit: number;
  /** Мужчина: цвет галстука. */
  tie: number;
  /** Женщина: цвет рубашки. */
  shirt: number;
  /** Женщина: 0 — длинные волосы, 1 — пучок. */
  hair: number;
}

export const SUITS_MALE = [
  { name: 'Кремово-белый', fabric: 0xe2d6bc, shade: 0xcdbf9f, dark: 0xa89878 },
  { name: 'Тёмно-синий в полоску', fabric: 0x1f2748, shade: 0x2c3660, dark: 0x141a33 },
];

export const TIES: { name: string; color: number; pattern?: number }[] = [
  { name: 'Бордовый', color: 0x7a1c2b },
  { name: 'Тёмно-синий', color: 0x1c2550 },
  { name: 'Чёрный', color: 0x18181e },
  { name: 'Золотой', color: 0xc9a23c },
  { name: 'Изумрудный', color: 0x1f6a4a },
  { name: 'Серебристый', color: 0xa8acb8 },
  { name: 'Фиолетовый', color: 0x5a2f7a },
  { name: 'С узором', color: 0x33405e, pattern: 0xd9b44a },
];

export const SHIRTS = [
  { name: 'Белый', color: 0xf2efe6 },
  { name: 'Кремовый', color: 0xe8d9b8 },
  { name: 'Голубой', color: 0x9cc0e0 },
  { name: 'Розовый', color: 0xe6a8b8 },
  { name: 'Бордовый', color: 0x8a1c2b },
  { name: 'Чёрный', color: 0x26262c },
  { name: 'Изумрудный', color: 0x1f7a56 },
  { name: 'Лавандовый', color: 0xb8a4dc },
];

export const HAIR_FEMALE = ['Длинные', 'Пучок'];

export const DEFAULT_SKIN: Skin = { gender: 'male', suit: 0, tie: 0, shirt: 0, hair: 0 };

export function randomSkin(gender: Gender, random: () => number = Math.random): Skin {
  const pick = (count: number) => Math.floor(random() * count);
  return {
    gender,
    suit: pick(SUITS_MALE.length),
    tie: pick(TIES.length),
    shirt: pick(SHIRTS.length),
    hair: pick(HAIR_FEMALE.length),
  };
}

export function randomGender(random: () => number = Math.random): Gender {
  return random() < 0.5 ? 'male' : 'female';
}

/** Проверка данных, пришедших по сети: возвращает корректный скин. */
export function sanitizeSkin(value: unknown): Skin {
  const raw = (value ?? {}) as Partial<Record<keyof Skin, unknown>>;
  const index = (v: unknown, count: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < count ? (v as number) : 0);
  return {
    gender: raw.gender === 'female' ? 'female' : 'male',
    suit: index(raw.suit, SUITS_MALE.length),
    tie: index(raw.tie, TIES.length),
    shirt: index(raw.shirt, SHIRTS.length),
    hair: index(raw.hair, HAIR_FEMALE.length),
  };
}
