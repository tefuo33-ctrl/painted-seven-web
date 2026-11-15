// Общий «ретро»-стиль: настройки картинки, материалы с плоскими гранями
// и дрожанием вершин (как на PS1), текстуры без сглаживания.

import * as THREE from 'three';

/** Настройки картинки. Позже их можно будет менять в меню. */
export const gfx = {
  /** Во сколько раз рендер меньше окна (3 = треть размера, крупные пиксели). */
  pixelScale: 3,
  /** Сила дрожания вершин: 0 — выключено, 1 — как на PS1, больше — грубее. */
  snapStrength: 1,
  bloom: true,
  bloomStrength: 0.45,
  /** Сила виньетки: 0 — выключена. */
  vignette: 0.5,
};

/** Палитра игры. */
export const PALETTE = {
  felt: 0x1f3b2b,
  feltLight: 0x2a4d39,
  feltDark: 0x183024,
  wood: 0x3a2a1c,
  woodDark: 0x2a1e14,
  paper: 0xebe6d6,
  paperEdge: 0xcfc8b0,
  black: 0x1a1a22,
  blackLight: 0x3d3d52,
  red: 0x8a1c2b,
  redLight: 0xb83a4a,
  gold: 0xd9b44a,
  goldDark: 0xb8942f,
  jokerPaper: 0xe6d29a,
  lantern: 0xf0c070,
  horizon: 0xf0905a,
};

/** Сетка, к которой «прилипают» вершины. Общая для всех материалов. */
export const snapUniform = { value: new THREE.Vector2(0, 0) };

/** Пересчитать сетку дрожания под размер рендера. */
export function updateSnap(renderWidth: number, renderHeight: number): void {
  if (gfx.snapStrength <= 0) {
    snapUniform.value.set(0, 0);
  } else {
    snapUniform.value.set(
      renderWidth / 2 / gfx.snapStrength,
      renderHeight / 2 / gfx.snapStrength,
    );
  }
}

/** Добавляет материалу дрожание вершин: позиция на экране округляется до сетки. */
export function retro<T extends THREE.Material>(material: T): T {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSnap = snapUniform;
    shader.vertexShader =
      'uniform vec2 uSnap;\n' +
      shader.vertexShader.replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        if (uSnap.x > 0.0 && gl_Position.w > 0.0) {
          vec2 ndc = gl_Position.xy / gl_Position.w;
          gl_Position.xy = floor(ndc * uSnap + 0.5) / uSnap * gl_Position.w;
        }`,
      );
  };
  return material;
}

const flatCache = new Map<string, THREE.MeshLambertMaterial>();

/** Матовый материал с плоскими гранями. Одинаковые цвета переиспользуются. */
export function flat(color: number, doubleSide = false): THREE.MeshLambertMaterial {
  const key = `${color}:${doubleSide}`;
  let material = flatCache.get(key);
  if (!material) {
    material = retro(
      new THREE.MeshLambertMaterial({
        color,
        flatShading: true,
        side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
      }),
    );
    flatCache.set(key, material);
  }
  return material;
}

/** Материал с цветами вершин (для геометрий, раскрашенных по граням). */
export function flatVertexColors(doubleSide = false): THREE.MeshLambertMaterial {
  return retro(
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    }),
  );
}

/** Светящийся материал: не зависит от освещения (огонь, окна, солнце). */
export function glow(color: number, options: THREE.MeshBasicMaterialParameters = {}): THREE.MeshBasicMaterial {
  return retro(new THREE.MeshBasicMaterial({ color, ...options }));
}

/** Маленькая текстура, нарисованная кодом, без сглаживания. */
export function pixelTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Цвет в виде '#rrggbb' для рисования на canvas. */
export function hex(color: number): string {
  return '#' + color.toString(16).padStart(6, '0');
}

/** Простой повторяемый генератор случайных чисел (чтобы сцена всегда была одинаковой). */
export function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** Собирает геометрию из треугольников с цветом на каждую грань. */
export class FacetBuilder {
  private positions: number[] = [];
  private colors: number[] = [];
  private tmp = new THREE.Color();

  triangle(a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, color: number): this {
    this.tmp.setHex(color);
    for (const p of [a, b, c]) {
      this.positions.push(p.x, p.y, p.z);
      this.colors.push(this.tmp.r, this.tmp.g, this.tmp.b);
    }
    return this;
  }

  quad(a: THREE.Vector3Like, b: THREE.Vector3Like, c: THREE.Vector3Like, d: THREE.Vector3Like, color: number): this {
    return this.triangle(a, b, c, color).triangle(a, c, d, color);
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
}
