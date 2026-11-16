// Атлас карт: все 36 лиц, рубашка, торец и значки мастей нарисованы кодом
// на одной текстуре. Одна текстура на все карты — быстро на телефоне.

import * as THREE from 'three';
import { type Card, type Rank, type Suit, RANKS, SUITS, isJoker } from '../engine';
import { rankLetter } from '../i18n';
import { PALETTE, hex, paintedTexture } from './gfx';

/** Во сколько раз текстура крупнее координат рисования (чем больше — тем чётче карты). */
const ATLAS_SCALE = 4;

export const CELL_W = 64;
export const CELL_H = 96;
const COLS = 10;
const ROWS = 5;

/** Номера особых ячеек атласа (0…35 — лица карт). */
export const CELL_BACK = 36;
export const CELL_EDGE = 37;
const CELL_SUIT_ICON = 38; // 38…41 — крупные значки мастей

export function cardCell(card: Card): number {
  return SUITS.indexOf(card.suit) * RANKS.length + RANKS.indexOf(card.rank);
}

export function suitIconCell(suit: Suit): number {
  return CELL_SUIT_ICON + SUITS.indexOf(suit);
}

/** Прямоугольник ячейки в координатах текстуры: [u0, v0, u1, v1] (v0 — низ). */
export function cellUv(cell: number): [number, number, number, number] {
  const col = cell % COLS;
  const row = Math.floor(cell / COLS);
  return [col / COLS, 1 - (row + 1) / ROWS, (col + 1) / COLS, 1 - row / ROWS];
}

// ---------- Угловатые значки мастей ----------

type Polygon = [number, number][];

/** Значки в единичных координатах (-1…1, y вниз). Только прямые отрезки. */
const SUIT_SHAPES: Record<Suit, Polygon[]> = {
  hearts: [[[0, -0.4], [0.5, -0.9], [1, -0.45], [1, 0.05], [0, 1], [-1, 0.05], [-1, -0.45], [-0.5, -0.9]]],
  diamonds: [[[0, -1], [0.75, 0], [0, 1], [-0.75, 0]]],
  spades: [
    [[0, -1], [1, 0.15], [0.62, 0.62], [0, 0.4], [-0.62, 0.62], [-1, 0.15]],
    [[0, 0.1], [0.42, 1], [-0.42, 1]],
  ],
  clubs: [
    [[0, -1], [0.45, -0.55], [0, -0.05], [-0.45, -0.55]],
    [[0.5, -0.3], [1, 0.15], [0.55, 0.62], [0.05, 0.15]],
    [[-0.5, -0.3], [-0.05, 0.15], [-0.55, 0.62], [-1, 0.15]],
    [[0, -0.1], [0.4, 1], [-0.4, 1]],
  ],
};

function suitColors(suit: Suit): [string, string] {
  return suit === 'hearts' || suit === 'diamonds'
    ? [hex(PALETTE.red), hex(PALETTE.redLight)]
    : [hex(PALETTE.black), hex(PALETTE.blackLight)];
}

function fillPolygon(ctx: CanvasRenderingContext2D, points: Polygon, cx: number, cy: number, size: number): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => {
    const px = cx + x * size;
    const py = cy + y * size;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.closePath();
  ctx.fill();
}

/** Значок масти: основной цвет и более светлая грань слева, как у гранёного камня. */
function drawSuit(ctx: CanvasRenderingContext2D, suit: Suit, cx: number, cy: number, size: number): void {
  const [main, light] = suitColors(suit);
  for (const polygon of SUIT_SHAPES[suit]) {
    ctx.fillStyle = main;
    fillPolygon(ctx, polygon, cx, cy, size);
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(cx - size - 1, cy - size - 1, size + 1, size * 2 + 2);
  ctx.clip();
  for (const polygon of SUIT_SHAPES[suit]) {
    ctx.fillStyle = light;
    fillPolygon(ctx, polygon, cx, cy, size);
  }
  ctx.restore();
}

// ---------- Лицо карты ----------

/** Где стоят значки на числовых картах: [колонка -1…1, строка 0…1]. */
const PIPS: Record<number, [number, number][]> = {
  6: [[-1, 0], [1, 0], [-1, 0.5], [1, 0.5], [-1, 1], [1, 1]],
  7: [[-1, 0], [1, 0], [-1, 0.5], [1, 0.5], [-1, 1], [1, 1], [0, 0.25]],
  8: [[-1, 0], [1, 0], [-1, 0.5], [1, 0.5], [-1, 1], [1, 1], [0, 0.25], [0, 0.75]],
  9: [[-1, 0], [1, 0], [-1, 0.33], [1, 0.33], [-1, 0.67], [1, 0.67], [-1, 1], [1, 1], [0, 0.5]],
  10: [[-1, 0], [1, 0], [-1, 0.33], [1, 0.33], [-1, 0.67], [1, 0.67], [-1, 1], [1, 1], [0, 0.17], [0, 0.83]],
};

/** Закрасить многоугольник двумя тонами: слева светлее. Координаты — в пикселях ячейки. */
function facet(ctx: CanvasRenderingContext2D, points: Polygon, main: string, light: string, splitX: number): void {
  ctx.fillStyle = main;
  fillPolygon(ctx, points, 0, 0, 1);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, splitX, CELL_H);
  ctx.clip();
  ctx.fillStyle = light;
  fillPolygon(ctx, points, 0, 0, 1);
  ctx.restore();
}

/** Простой гранёный портрет для валета, дамы и короля. */
function drawPortrait(ctx: CanvasRenderingContext2D, rank: Rank, suit: Suit): void {
  const [main, light] = suitColors(suit);
  const skin = '#c89a72';
  const skinLight = '#e3bd94';
  const hair = '#3a2a22';
  const hairLight = '#5a4030';
  const gold = hex(PALETTE.gold);
  const goldDark = hex(PALETTE.goldDark);
  const mid = 35;

  if (rank === 12) {
    // Длинные волосы дамы — позади лица.
    facet(ctx, [[19, 70], [20, 40], [35, 30], [50, 40], [51, 70]], hair, hairLight, mid);
  }
  // Плечи в цвет масти.
  facet(ctx, [[13, 89], [21, 68], [49, 68], [57, 89]], main, light, mid);
  ctx.fillStyle = hex(PALETTE.paper);
  fillPolygon(ctx, [[31, 68], [39, 68], [35, 76]], 0, 0, 1); // воротник
  // Шея и лицо.
  ctx.fillStyle = skin;
  ctx.fillRect(31, 60, 8, 9);
  facet(ctx, [[25, 40], [45, 40], [47, 52], [41, 64], [29, 64], [23, 52]], skin, skinLight, mid);
  // Глаза.
  ctx.fillStyle = hex(PALETTE.black);
  ctx.fillRect(28, 49, 4, 2);
  ctx.fillRect(38, 49, 4, 2);

  if (rank === 13) {
    facet(ctx, [[23, 40], [23, 27], [29, 34], [35, 25], [41, 34], [47, 27], [47, 40]], goldDark, gold, mid);
    facet(ctx, [[27, 55], [43, 55], [42, 65], [35, 71], [28, 65]], hair, hairLight, mid); // борода
  } else if (rank === 12) {
    facet(ctx, [[28, 33], [30, 26], [35, 31], [40, 26], [42, 33]], goldDark, gold, mid);
    ctx.fillStyle = hex(PALETTE.red);
    ctx.fillRect(33, 58, 4, 2); // губы
  } else {
    facet(ctx, [[21, 40], [25, 29], [46, 31], [49, 40]], main, light, mid); // берет
    facet(ctx, [[44, 31], [53, 20], [49, 34]], goldDark, gold, 49); // перо
    ctx.fillStyle = hair;
    ctx.fillRect(23, 40, 3, 11);
    ctx.fillRect(44, 40, 3, 11);
  }
}

function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number): void {
  const points: Polygon = [];
  for (let i = 0; i < 10; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? radius : radius * 0.45;
    points.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
  }
  facet(ctx, points, hex(PALETTE.gold), hex(PALETTE.goldDark), cx);
}

/** Ранг карты для текущего языка: цифра или буква (В/Д/К/Т, B/D/K/A, J/Q/K/A). */
function rankText(rank: Rank): string {
  return rank <= 10 ? String(rank) : rankLetter(rank);
}

/** Ранг и маленький значок масти в углу карты. */
function drawIndex(ctx: CanvasRenderingContext2D, card: Card, color: string): void {
  const text = rankText(card.rank);
  ctx.fillStyle = color;
  // Индекс стоит на поле карты — между рамкой и картинкой (x 5…15), ни на что не залезая.
  ctx.font = `bold ${text.length > 1 ? 9 : 12}px Georgia, 'Times New Roman', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, 10.5, 16);
  drawSuit(ctx, card.suit, 10.5, 23, 3.6);
}

function drawFace(ctx: CanvasRenderingContext2D, card: Card): void {
  const joker = isJoker(card);
  const [main] = suitColors(card.suit);
  const paper = hex(joker ? PALETTE.jokerPaper : PALETTE.paper);

  // Бумага с лёгким переходом тона — карта не выглядит плоской заливкой.
  const base = ctx.createLinearGradient(0, 0, CELL_W, CELL_H);
  base.addColorStop(0, joker ? '#f3e2ae' : '#f7f3e6');
  base.addColorStop(1, paper);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, CELL_W, CELL_H);

  // Двойная рамка: тонкая цветная и внутренняя золотистая с уголками.
  const frame = joker ? hex(PALETTE.goldDark) : main;
  ctx.strokeStyle = frame;
  ctx.lineWidth = 0.9;
  ctx.strokeRect(2.5, 2.5, CELL_W - 5, CELL_H - 5);
  ctx.strokeStyle = joker ? 'rgba(184,148,47,0.7)' : 'rgba(184,148,47,0.45)';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(4.5, 4.5, CELL_W - 9, CELL_H - 9);
  ctx.fillStyle = joker ? hex(PALETTE.goldDark) : 'rgba(184,148,47,0.7)';
  for (const [x, y] of [[4.5, 4.5], [CELL_W - 4.5, 4.5], [4.5, CELL_H - 4.5], [CELL_W - 4.5, CELL_H - 4.5]]) {
    ctx.beginPath();
    ctx.arc(x, y, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  if (card.rank === 14) {
    // Туз: крупный значок в ореоле.
    ctx.strokeStyle = 'rgba(184,148,47,0.5)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(CELL_W / 2, CELL_H / 2, 21, 0, Math.PI * 2);
    ctx.stroke();
    drawSuit(ctx, card.suit, CELL_W / 2, CELL_H / 2, 17);
  } else if (card.rank >= 11) {
    // Картинка в рамке с золотой каймой.
    ctx.save();
    ctx.beginPath();
    ctx.rect(16, 22, CELL_W - 32, CELL_H - 44);
    ctx.clip();
    ctx.fillStyle = card.suit === 'hearts' || card.suit === 'diamonds' ? '#f1dccf' : '#dcdfe6';
    ctx.fillRect(16, 22, CELL_W - 32, CELL_H - 44);
    ctx.translate(-3, -4);
    drawPortrait(ctx, card.rank, card.suit);
    ctx.restore();
    ctx.strokeStyle = hex(PALETTE.goldDark);
    ctx.lineWidth = 0.8;
    ctx.strokeRect(16, 22, CELL_W - 32, CELL_H - 44);
  } else {
    for (const [col, row] of PIPS[card.rank]) {
      drawSuit(ctx, card.suit, CELL_W / 2 + col * 9.5, 24 + row * 48, 5.4);
    }
  }
  if (joker) drawStar(ctx, CELL_W / 2, CELL_H / 2, 7);

  // Индексы в двух углах, как на настоящей карте: левый верхний и перевёрнутый правый нижний.
  drawIndex(ctx, card, main);
  ctx.save();
  ctx.translate(CELL_W, CELL_H);
  ctx.rotate(Math.PI);
  drawIndex(ctx, card, main);
  ctx.restore();
}

function drawBack(ctx: CanvasRenderingContext2D): void {
  const w = CELL_W;
  const h = CELL_H;
  ctx.fillStyle = '#f2ecdc';
  ctx.fillRect(0, 0, w, h); // светлая кайма
  ctx.fillStyle = hex(PALETTE.felt);
  ctx.fillRect(2.5, 2.5, w - 5, h - 5);
  const inset = 4;
  const cx = w / 2;
  const cy = h / 2;
  // Четыре треугольника по диагоналям.
  ctx.fillStyle = hex(PALETTE.feltLight);
  fillPolygon(ctx, [[inset, inset], [cx, cy], [inset, h - inset]], 0, 0, 1);
  fillPolygon(ctx, [[w - inset, inset], [w - inset, h - inset], [cx, cy]], 0, 0, 1);
  ctx.fillStyle = hex(PALETTE.feltDark);
  fillPolygon(ctx, [[inset, inset], [w - inset, inset], [cx, cy]], 0, 0, 1);
  fillPolygon(ctx, [[inset, h - inset], [cx, cy], [w - inset, h - inset]], 0, 0, 1);

  // Ромбическая сетка поверх — как на настоящей рубашке.
  ctx.save();
  ctx.beginPath();
  ctx.rect(inset, inset, w - inset * 2, h - inset * 2);
  ctx.clip();
  ctx.strokeStyle = 'rgba(217,210,184,0.16)';
  ctx.lineWidth = 0.4;
  for (let i = -h; i < w + h; i += 5) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + h, h);
    ctx.moveTo(i, h);
    ctx.lineTo(i + h, 0);
    ctx.stroke();
  }
  ctx.restore();

  // Золотая рамка с отступом и угловыми завитками.
  ctx.strokeStyle = hex(PALETTE.gold);
  ctx.lineWidth = 0.7;
  ctx.strokeRect(7.5, 7.5, w - 15, h - 15);
  ctx.strokeStyle = 'rgba(217,210,184,0.8)';
  ctx.lineWidth = 0.4;
  ctx.strokeRect(9.5, 9.5, w - 19, h - 19);
  ctx.fillStyle = hex(PALETTE.gold);
  for (const [x, y] of [[7.5, 7.5], [w - 7.5, 7.5], [7.5, h - 7.5], [w - 7.5, h - 7.5]]) {
    fillPolygon(ctx, [[0, -2.4], [2.4, 0], [0, 2.4], [-2.4, 0]], x, y, 1);
  }
  // Золотой ромб в центре с ореолом и малые ромбы сверху и снизу.
  ctx.strokeStyle = 'rgba(217,180,74,0.6)';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(cx, cy, 13, 19, 0, 0, Math.PI * 2);
  ctx.stroke();
  facet(ctx, [[cx, cy - 14], [cx + 9, cy], [cx, cy + 14], [cx - 9, cy]], hex(PALETTE.gold), hex(PALETTE.goldDark), cx);
  facet(ctx, [[cx, cy - 5], [cx + 3.2, cy], [cx, cy + 5], [cx - 3.2, cy]], '#f6e3a0', hex(PALETTE.gold), cx);
  for (const y of [20, h - 20]) {
    facet(ctx, [[cx, y - 4], [cx + 2.6, y], [cx, y + 4], [cx - 2.6, y]], hex(PALETTE.gold), hex(PALETTE.goldDark), cx);
  }
}

let atlas: THREE.CanvasTexture | null = null;

function paintAtlas(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, CELL_W * COLS * ATLAS_SCALE, CELL_H * ROWS * ATLAS_SCALE);
  const cell = (index: number, draw: () => void) => {
    ctx.save();
    ctx.translate((index % COLS) * CELL_W * ATLAS_SCALE, Math.floor(index / COLS) * CELL_H * ATLAS_SCALE);
    ctx.scale(ATLAS_SCALE, ATLAS_SCALE);
    ctx.beginPath();
    ctx.rect(0, 0, CELL_W, CELL_H);
    ctx.clip();
    draw();
    ctx.restore();
  };
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      const card: Card = { suit, rank };
      cell(cardCell(card), () => drawFace(ctx, card));
    }
  }
  cell(CELL_BACK, () => drawBack(ctx));
  cell(CELL_EDGE, () => {
    ctx.fillStyle = hex(PALETTE.paperEdge);
    ctx.fillRect(0, 0, CELL_W, CELL_H);
  });
  for (const suit of SUITS) {
    cell(suitIconCell(suit), () => drawSuit(ctx, suit, CELL_W / 2, CELL_H / 2, 26));
  }
}

/** Текстура со всеми картами (создаётся один раз). */
export function getCardAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const texture = paintedTexture(CELL_W * COLS * ATLAS_SCALE, CELL_H * ROWS * ATLAS_SCALE, (ctx) => paintAtlas(ctx));
  texture.anisotropy = 8;
  atlas = texture;
  return texture;
}

/** Перерисовать карты (после смены языка меняются буквы рангов). */
export function repaintCardAtlas(): void {
  if (!atlas) return;
  const canvas = atlas.image as HTMLCanvasElement;
  paintAtlas(canvas.getContext('2d')!);
  atlas.needsUpdate = true;
  imageCache.clear();
}

const imageCache = new Map<string, string>();

/** Картинка одной карты (data URL) — для интерфейса: козырь в углу экрана. */
export function cardImage(card: Card): string {
  const key = `${card.suit}:${card.rank}`;
  let url = imageCache.get(key);
  if (!url) {
    const canvas = document.createElement('canvas');
    canvas.width = CELL_W * 3;
    canvas.height = CELL_H * 3;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(3, 3);
    drawFace(ctx, card);
    url = canvas.toDataURL('image/png');
    imageCache.set(key, url);
  }
  return url;
}
