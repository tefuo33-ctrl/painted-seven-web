// Атлас карт: все 36 лиц, рубашка, торец и значки мастей нарисованы кодом
// на одной текстуре. Одна текстура на все карты — быстро на телефоне.

import * as THREE from 'three';
import { type Card, type Rank, type Suit, RANKS, SUITS, isJoker } from '../engine';
import { PALETTE, hex, pixelTexture } from './gfx';

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

// ---------- Пиксельные цифры и буквы рангов (5×7) ----------

const GLYPHS: Record<string, string[]> = {
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '..#..', '..#..', '..#..'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  '1': ['.#.', '##.', '.#.', '.#.', '.#.', '.#.', '###'],
  '0': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  В: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  Д: ['..##.', '.#.#.', '.#.#.', '.#.#.', '.#.#.', '#####', '#...#'],
  К: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  Т: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
};

const RANK_TEXT: Record<Rank, string> = {
  6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'В', 12: 'Д', 13: 'К', 14: 'Т',
};

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number, color: string): void {
  ctx.fillStyle = color;
  let cursor = x;
  for (const char of text) {
    const glyph = GLYPHS[char];
    glyph.forEach((row, rowIndex) => {
      for (let col = 0; col < row.length; col++) {
        if (row[col] === '#') ctx.fillRect(cursor + col * scale, y + rowIndex * scale, scale, scale);
      }
    });
    cursor += (glyph[0].length + 1) * scale;
  }
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

function drawFace(ctx: CanvasRenderingContext2D, card: Card): void {
  const joker = isJoker(card);
  const [main] = suitColors(card.suit);
  ctx.fillStyle = hex(joker ? PALETTE.jokerPaper : PALETTE.paper);
  ctx.fillRect(0, 0, CELL_W, CELL_H);
  // Тонкая рамка цвета масти (у джокера — золотая).
  ctx.strokeStyle = joker ? hex(PALETTE.goldDark) : main;
  ctx.lineWidth = 1;
  ctx.strokeRect(2.5, 2.5, CELL_W - 5, CELL_H - 5);

  // Ранг и маленький значок масти в левом верхнем углу.
  // Ранг крупный: его должно быть видно даже на далёкой карте при низком разрешении.
  drawText(ctx, RANK_TEXT[card.rank], 5, 5, 3, main);
  drawSuit(ctx, card.suit, 12, 35, 6);

  if (card.rank === 14) {
    drawSuit(ctx, card.suit, 37, 58, 18);
  } else if (card.rank >= 11) {
    drawPortrait(ctx, card.rank, card.suit);
  } else {
    for (const [col, row] of PIPS[card.rank]) {
      drawSuit(ctx, card.suit, 41 + col * 11, 33 + row * 50, 5.5);
    }
  }
  if (joker) drawStar(ctx, 52, 13, 8);
  if (card.rank >= 11 && card.rank <= 13) {
    // Портрет не должен залезать под ранг: рисуем ранг ещё раз поверх.
    ctx.fillStyle = hex(PALETTE.paper);
    ctx.fillRect(4, 4, 18, 23);
    drawText(ctx, RANK_TEXT[card.rank], 5, 5, 3, main);
  }
}

function drawBack(ctx: CanvasRenderingContext2D): void {
  const w = CELL_W;
  const h = CELL_H;
  ctx.fillStyle = hex(PALETTE.felt);
  ctx.fillRect(0, 0, w, h);
  const inset = 3;
  const cx = w / 2;
  const cy = h / 2;
  // Четыре треугольника по диагоналям.
  ctx.fillStyle = hex(PALETTE.feltLight);
  fillPolygon(ctx, [[inset, inset], [cx, cy], [inset, h - inset]], 0, 0, 1);
  fillPolygon(ctx, [[w - inset, inset], [w - inset, h - inset], [cx, cy]], 0, 0, 1);
  ctx.fillStyle = hex(PALETTE.feltDark);
  fillPolygon(ctx, [[inset, inset], [w - inset, inset], [cx, cy]], 0, 0, 1);
  fillPolygon(ctx, [[inset, h - inset], [cx, cy], [w - inset, h - inset]], 0, 0, 1);
  // Тонкая светлая рамка с отступом.
  ctx.strokeStyle = '#d9d2b8';
  ctx.lineWidth = 1;
  ctx.strokeRect(6.5, 6.5, w - 13, h - 13);
  // Золотой ромб в центре.
  facet(ctx, [[cx, cy - 13], [cx + 8, cy], [cx, cy + 13], [cx - 8, cy]], hex(PALETTE.gold), hex(PALETTE.goldDark), cx);
}

let atlas: THREE.CanvasTexture | null = null;

/** Текстура со всеми картами (создаётся один раз). */
export function getCardAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const texture = pixelTexture(CELL_W * COLS * ATLAS_SCALE, CELL_H * ROWS * ATLAS_SCALE, (ctx) => {
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
      cell(suitIconCell(suit), () => {
        // Значок козыря на светлой гранёной плашке с золотой каймой — виден на любом фоне.
        const plate: Polygon = [[32, 12], [58, 30], [58, 66], [32, 84], [6, 66], [6, 30]];
        ctx.fillStyle = hex(PALETTE.goldDark);
        fillPolygon(ctx, plate, 0, 0, 1);
        const inner: Polygon = [[32, 17], [54, 32], [54, 64], [32, 79], [10, 64], [10, 32]];
        facet(ctx, inner, hex(PALETTE.paper), '#f7f3e6', 32);
        drawSuit(ctx, suit, 32, 48, 17);
      });
    }
  });
  // Уменьшенные копии текстуры: далёкие карты не «искрят», но остаются пиксельными.
  // Сглаживание и уменьшенные копии: ранг и масть читаются и вблизи, и на дальнем конце стола.
  texture.generateMipmaps = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = 8;
  atlas = texture;
  return texture;
}
