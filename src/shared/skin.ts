// Внешний вид персонажа: только данные (без 3D), чтобы их мог использовать и сервер.
// Названия вариантов здесь не хранятся — они в переводах (src/i18n), по ключам `key`.

export type Gender = 'male' | 'female';

/** Числа — номера вариантов в списках ниже. */
export interface Skin {
  gender: Gender;
  /** Мужчина: костюм (см. SUITS_MALE). У женщины пиджак всегда чёрный. */
  suit: number;
  /** Цвет рубашки (см. SHIRTS). */
  shirt: number;
  /** Мужчина: галстук (см. TIES); последний вариант — без галстука. */
  tie: number;
  /** Причёска (см. HAIR_MALE / HAIR_FEMALE). */
  hair: number;
  /** Цвет волос (см. HAIR_COLORS). */
  hairColor: number;
  /** Обувь (см. SHOES_MALE / SHOES_FEMALE). */
  shoes: number;
  /** Женщина: юбка (см. SKIRTS). */
  skirt: number;
  /** Аксессуар (см. ACCESSORIES_MALE / ACCESSORIES_FEMALE). */
  accessory: number;
}

export interface Option {
  key: string;
  color?: number;
}

export const SUITS_MALE = [
  { key: 'suit.cream', color: 0xe2d6bc, fabric: 0xe2d6bc, shade: 0xcdbf9f, dark: 0xa89878, striped: false, doubleBreasted: true, vest: false },
  { key: 'suit.navy', color: 0x1f2748, fabric: 0x1f2748, shade: 0x2c3660, dark: 0x141a33, striped: true, doubleBreasted: false, vest: true },
  { key: 'suit.black', color: 0x1c1c22, fabric: 0x1c1c22, shade: 0x2b2b34, dark: 0x0c0c10, striped: false, doubleBreasted: false, vest: false },
  { key: 'suit.white', color: 0xf2efe6, fabric: 0xf2efe6, shade: 0xe0dccf, dark: 0xb9b4a4, striped: false, doubleBreasted: false, vest: true },
];

export const SHIRTS: Option[] = [
  { key: 'color.white', color: 0xf2efe6 },
  { key: 'color.cream', color: 0xe8d9b8 },
  { key: 'color.lightBlue', color: 0x9cc0e0 },
  { key: 'color.pink', color: 0xe6a8b8 },
  { key: 'color.burgundy', color: 0x8a1c2b },
  { key: 'color.black', color: 0x26262c },
  { key: 'color.emerald', color: 0x1f7a56 },
  { key: 'color.lavender', color: 0xb8a4dc },
];

export const TIES: (Option & { pattern?: number; none?: boolean })[] = [
  { key: 'color.burgundy', color: 0x7a1c2b },
  { key: 'color.navy', color: 0x1c2550 },
  { key: 'color.black', color: 0x18181e },
  { key: 'color.gold', color: 0xc9a23c },
  { key: 'color.emerald', color: 0x1f6a4a },
  { key: 'color.silver', color: 0xa8acb8 },
  { key: 'color.purple', color: 0x5a2f7a },
  { key: 'tie.patterned', color: 0x33405e, pattern: 0xd9b44a },
  { key: 'tie.none', none: true },
];

export const HAIR_MALE: Option[] = [{ key: 'hair.slicked' }, { key: 'hair.short' }, { key: 'hair.wavy' }, { key: 'hair.bald' }];
export const HAIR_FEMALE: Option[] = [{ key: 'hair.long' }, { key: 'hair.bun' }, { key: 'hair.bob' }, { key: 'hair.ponytail' }];

export const HAIR_COLORS: (Option & { light: number })[] = [
  { key: 'color.darkBrown', color: 0x35251c, light: 0x4a3528 },
  { key: 'color.black', color: 0x18161a, light: 0x2a272c },
  { key: 'color.chestnut', color: 0x6a3a22, light: 0x86502e },
  { key: 'color.blond', color: 0xc9a25a, light: 0xdcb974 },
  { key: 'color.grey', color: 0x8a8a90, light: 0xa6a6ac },
  { key: 'color.red', color: 0x8a2f1c, light: 0xa84428 },
];

export const SHOES_MALE: Option[] = [
  { key: 'shoes.blackOxford', color: 0x121216 },
  { key: 'shoes.brown', color: 0x4a2c1a },
  { key: 'shoes.white', color: 0xe8e2d2 },
  { key: 'shoes.burgundy', color: 0x5a1820 },
];

export const SHOES_FEMALE: (Option & { heel: number })[] = [
  { key: 'shoes.blackHeels', color: 0x121216, heel: 0.45 },
  { key: 'shoes.redHeels', color: 0x9a1c2b, heel: 0.45 },
  { key: 'shoes.flats', color: 0x121216, heel: 0 },
  { key: 'shoes.goldHeels', color: 0xb8942f, heel: 0.3 },
];

/** Юбки: длина в единицах сцены (стоя) или брюки. */
export const SKIRTS: (Option & { length: number; trousers?: boolean })[] = [
  { key: 'skirt.pencil', length: 1.5 },
  { key: 'skirt.mini', length: 0.95 },
  { key: 'skirt.long', length: 2.5 },
  { key: 'skirt.trousers', length: 0, trousers: true },
];

export const ACCESSORIES_MALE: Option[] = [
  { key: 'acc.none' },
  { key: 'acc.pocketSquare' },
  { key: 'acc.boutonniere' },
  { key: 'acc.fedora' },
  { key: 'acc.watch' },
];

export const ACCESSORIES_FEMALE: Option[] = [
  { key: 'acc.none' },
  { key: 'acc.earrings' },
  { key: 'acc.pearls' },
  { key: 'acc.hat' },
  { key: 'acc.brooch' },
];

export const DEFAULT_SKIN: Skin = {
  gender: 'male',
  suit: 0,
  shirt: 0,
  tie: 0,
  hair: 0,
  hairColor: 0,
  shoes: 0,
  skirt: 0,
  accessory: 0,
};

/** Сколько вариантов у каждого поля — в зависимости от пола. */
export function optionCounts(gender: Gender): Record<Exclude<keyof Skin, 'gender'>, number> {
  const male = gender === 'male';
  return {
    suit: SUITS_MALE.length,
    shirt: SHIRTS.length,
    tie: TIES.length,
    hair: male ? HAIR_MALE.length : HAIR_FEMALE.length,
    hairColor: HAIR_COLORS.length,
    shoes: male ? SHOES_MALE.length : SHOES_FEMALE.length,
    skirt: SKIRTS.length,
    accessory: male ? ACCESSORIES_MALE.length : ACCESSORIES_FEMALE.length,
  };
}

export function randomGender(random: () => number = Math.random): Gender {
  return random() < 0.5 ? 'male' : 'female';
}

export function randomSkin(gender: Gender, random: () => number = Math.random): Skin {
  const counts = optionCounts(gender);
  const pick = (count: number) => Math.floor(random() * count);
  return {
    gender,
    suit: pick(counts.suit),
    // Рубашка чаще белая — так костюмы смотрятся классически.
    shirt: random() < 0.5 ? 0 : pick(counts.shirt),
    tie: pick(counts.tie - 1), // боты всегда при галстуке
    hair: pick(counts.hair - (gender === 'male' ? 1 : 0)),
    hairColor: pick(counts.hairColor),
    shoes: pick(counts.shoes),
    skirt: pick(counts.skirt),
    accessory: random() < 0.45 ? 0 : pick(counts.accessory),
  };
}

/** Проверка данных, пришедших по сети или из сохранения: возвращает корректный скин. */
export function sanitizeSkin(value: unknown): Skin {
  const raw = (value ?? {}) as Partial<Record<keyof Skin, unknown>>;
  const gender: Gender = raw.gender === 'female' ? 'female' : 'male';
  const counts = optionCounts(gender);
  const index = (v: unknown, count: number) =>
    Number.isInteger(v) && (v as number) >= 0 && (v as number) < count ? (v as number) : 0;
  return {
    gender,
    suit: index(raw.suit, counts.suit),
    shirt: index(raw.shirt, counts.shirt),
    tie: index(raw.tie, counts.tie),
    hair: index(raw.hair, counts.hair),
    hairColor: index(raw.hairColor, counts.hairColor),
    shoes: index(raw.shoes, counts.shoes),
    skirt: index(raw.skirt, counts.skirt),
    accessory: index(raw.accessory, counts.accessory),
  };
}
