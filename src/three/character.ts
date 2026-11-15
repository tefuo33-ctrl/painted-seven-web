// Персонаж за столом: low-poly фигура в костюме и чёрных очках. Всё собрано кодом.
// Персонаж смотрит в сторону -z. Единица длины — ширина карты; сукно стола на y = 0.

import * as THREE from 'three';
import { FacetBuilder, flat, flatVertexColors, hex, pixelTexture, retro } from './gfx';
import { FLOOR_Y } from './table';

import { type Skin, SHIRTS, SUITS_MALE, TIES } from '../shared/skin';

export * from '../shared/skin';

const SKIN = 0xd6a47c;
const SKIN_LIGHT = 0xe6b890;
const SKIN_DARK = 0xb98a64;
const HAIR = 0x35251c;
const HAIR_LIGHT = 0x4a3528;
const BLACK = 0x121216;
const JACKET_BLACK = 0x1c1c22;
const WHITE = 0xf2efe6;

type Polygon = [number, number][];

function poly(ctx: CanvasRenderingContext2D, points: Polygon, fill: string, stroke?: string): void {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

/** Зеркально отразить многоугольник относительно середины груди (x = 24). */
function mirror(points: Polygon): Polygon {
  return points.map(([x, y]) => [48 - x, y]);
}

const torsoTextures = new Map<string, THREE.CanvasTexture>();

/**
 * Текстура туловища 64×64: слева (48 px) — перёд пиджака с лацканами, рубашкой и галстуком,
 * справа (16 px) — просто ткань для боков и спины.
 */
function torsoTexture(skin: Skin): THREE.CanvasTexture {
  const key = JSON.stringify(skin);
  const cached = torsoTextures.get(key);
  if (cached) return cached;

  const texture = pixelTexture(64, 64, (ctx) => {
    if (skin.gender === 'male') drawMaleTorso(ctx, skin);
    else drawFemaleTorso(ctx, skin);
  });
  torsoTextures.set(key, texture);
  return texture;
}

function drawMaleTorso(ctx: CanvasRenderingContext2D, skin: Skin): void {
  const suit = SUITS_MALE[skin.suit];
  const striped = skin.suit === 1;
  const tie = TIES[skin.tie];
  const fabric = hex(suit.fabric);
  const shade = hex(suit.shade);
  const dark = hex(suit.dark);

  ctx.fillStyle = fabric;
  ctx.fillRect(0, 0, 64, 64);
  if (striped) {
    // Тонкая светлая вертикальная полоска.
    ctx.fillStyle = '#56628e';
    for (let x = 1; x < 64; x += 4) ctx.fillRect(x, 0, 1, 64);
  }

  const vBottom = striped ? 36 : 29;
  if (striped) {
    // Жилет костюма-тройки виден в вырезе пиджака.
    poly(ctx, [[15, 0], [33, 0], [24, vBottom]], dark);
    ctx.fillStyle = '#56628e';
    for (const y of [22, 27, 32]) ctx.fillRect(23, y, 2, 2);
    poly(ctx, [[19, 0], [29, 0], [24, 19]], hex(WHITE));
  } else {
    poly(ctx, [[16, 0], [32, 0], [24, vBottom]], hex(WHITE));
  }

  // Галстук с небольшим узлом.
  const tieEnd = striped ? 17 : vBottom - 3;
  poly(ctx, [[22.5, 4], [25.5, 4], [26.5, tieEnd], [24, tieEnd + 2], [21.5, tieEnd]], hex(tie.color));
  if (tie.pattern !== undefined) {
    ctx.fillStyle = hex(tie.pattern);
    for (let y = 6; y < tieEnd; y += 3) ctx.fillRect(y % 2 === 0 ? 23 : 24, y, 1, 1);
  }
  poly(ctx, [[22, 1], [26, 1], [25.5, 4.5], [22.5, 4.5]], hex(tie.color), '#00000055');

  // Воротник рубашки.
  const collar: Polygon = [[18, 0], [24, 2.5], [20.5, 7]];
  poly(ctx, collar, '#ffffff', '#b8b4a8');
  poly(ctx, mirror(collar), '#ffffff', '#b8b4a8');

  // Широкие остроконечные лацканы: пик смотрит вверх к плечу.
  const lapel: Polygon = [[17, 0], [11, 0], [12.5, 9], [7, 6.5], [10.5, 15], [24, vBottom]];
  poly(ctx, lapel, shade, dark);
  poly(ctx, mirror(lapel), shade, dark);

  if (!striped) {
    // Двубортный: шесть пуговиц, два ряда по три.
    ctx.fillStyle = '#5a4630';
    for (const y of [31, 37, 43]) {
      ctx.fillRect(18, y, 2, 2);
      ctx.fillRect(28, y, 2, 2);
    }
  } else {
    ctx.fillStyle = '#0c1024';
    ctx.fillRect(23, 39, 2, 2);
    ctx.fillRect(23, 45, 2, 2);
  }

  // Нагрудный карман с платком и клапаны карманов по бокам.
  ctx.fillStyle = dark;
  ctx.fillRect(33, 18, 8, 1);
  poly(ctx, [[35, 18], [37, 15], [39, 18]], striped ? '#c8cce0' : '#3a4670');
  ctx.fillStyle = dark;
  ctx.fillRect(5, 46, 10, 1);
  ctx.fillRect(33, 46, 10, 1);
}

function drawFemaleTorso(ctx: CanvasRenderingContext2D, skin: Skin): void {
  const shirt = hex(SHIRTS[skin.shirt].color);
  const lapelColor = '#2b2b34';
  const edge = '#0c0c10';

  ctx.fillStyle = hex(JACKET_BLACK);
  ctx.fillRect(0, 0, 64, 64);

  // Рубашка в вырезе.
  poly(ctx, [[17, 0], [31, 0], [24, 27]], shirt);
  ctx.fillStyle = '#00000033';
  ctx.fillRect(24, 6, 1, 20); // планка

  // Обычные лацканы средней ширины с вырезом.
  const lapel: Polygon = [[16, 0], [11, 0], [9.5, 11], [13, 12], [12, 16], [24, 27]];
  poly(ctx, lapel, lapelColor, edge);
  poly(ctx, mirror(lapel), lapelColor, edge);

  // Крупный острый воротник рубашки лежит ПОВЕРХ лацканов.
  const collar: Polygon = [[20, 0], [24, 6], [14, 14], [11, 4]];
  poly(ctx, collar, shirt, '#00000055');
  poly(ctx, mirror(collar), shirt, '#00000055');

  // Две пуговицы и клапаны карманов.
  ctx.fillStyle = '#4a4a56';
  ctx.fillRect(23, 31, 2, 2);
  ctx.fillRect(23, 37, 2, 2);
  ctx.fillRect(6, 46, 9, 1);
  ctx.fillRect(33, 46, 9, 1);
}

interface Section {
  y: number;
  w: number;
  d: number;
}

/** Туловище: «гранёная» фигура из поперечных сечений. Перёд (-z) получает текстуру с деталями. */
function loftTorso(sections: Section[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const bottom = sections[0].y;
  const height = sections[sections.length - 1].y - bottom;
  const FRONT_U = 48 / 64;

  const push = (x: number, y: number, z: number, u: number) => {
    positions.push(x, y, z);
    uvs.push(u, (y - bottom) / height);
  };
  const quad = (p: [number, number, number, number][]) => {
    for (const i of [0, 1, 2, 0, 2, 3]) push(...p[i]);
  };

  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i];
    const b = sections[i + 1];
    const ax = a.w / 2, az = a.d / 2, bx = b.w / 2, bz = b.d / 2;
    const side0 = 50 / 64, side1 = 62 / 64;
    // Перёд: слева на экране — правая рука персонажа (+x).
    quad([[ax, a.y, -az, 0], [-ax, a.y, -az, FRONT_U], [-bx, b.y, -bz, FRONT_U], [bx, b.y, -bz, 0]]);
    // Спина и бока — просто ткань.
    quad([[-ax, a.y, az, side0], [ax, a.y, az, side1], [bx, b.y, bz, side1], [-bx, b.y, bz, side0]]);
    quad([[-ax, a.y, -az, side0], [-ax, a.y, az, side1], [-bx, b.y, bz, side1], [-bx, b.y, -bz, side0]]);
    quad([[ax, a.y, az, side0], [ax, a.y, -az, side1], [bx, b.y, -bz, side1], [bx, b.y, bz, side0]]);
  }
  // Крышка плеч.
  const top = sections[sections.length - 1];
  const tx = top.w / 2, tz = top.d / 2;
  quad([[tx, top.y, -tz, 0.8], [-tx, top.y, -tz, 0.9], [-tx, top.y, tz, 0.9], [tx, top.y, tz, 0.8]]);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** Брусок от точки a до точки b (рука, нога). */
function limb(a: THREE.Vector3, b: THREE.Vector3, width: number, depth: number, material: THREE.Material): THREE.Mesh {
  const length = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, length, depth), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

/** Гранёная голова: кольца из восьми точек от подбородка до макушки. */
function buildHead(female: boolean): THREE.Mesh {
  const rings: { y: number; rx: number; rz: number; z: number }[] = [
    { y: -0.82, rx: 0.24, rz: 0.22, z: -0.14 },
    { y: -0.5, rx: female ? 0.44 : 0.5, rz: 0.48, z: -0.05 },
    { y: 0, rx: female ? 0.58 : 0.62, rz: 0.64, z: 0 },
    { y: 0.45, rx: 0.6, rz: 0.64, z: 0 },
    { y: 0.8, rx: 0.4, rz: 0.46, z: 0 },
  ];
  const point = (ring: (typeof rings)[number], index: number) => {
    const angle = Math.PI / 8 + (index * Math.PI) / 4;
    return new THREE.Vector3(Math.cos(angle) * ring.rx, ring.y, Math.sin(angle) * ring.rz + ring.z);
  };
  const builder = new FacetBuilder();
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < 8; i++) {
      const a = point(rings[r], i), b = point(rings[r], i + 1);
      const c = point(rings[r + 1], i + 1), d = point(rings[r + 1], i);
      // Грани с одной стороны светлее, с другой темнее — лицо читается плоскостями.
      const middle = (a.x + b.x) / 2;
      const color = r === 0 ? SKIN_DARK : middle > 0.1 ? SKIN_LIGHT : middle < -0.1 ? SKIN_DARK : SKIN;
      builder.quad(a, d, c, b, color);
    }
  }
  const crown = new THREE.Vector3(0, 0.86, 0);
  const chin = new THREE.Vector3(0, -0.86, -0.14);
  for (let i = 0; i < 8; i++) {
    builder.triangle(crown, point(rings[4], i + 1), point(rings[4], i), SKIN);
    builder.triangle(chin, point(rings[0], i), point(rings[0], i + 1), SKIN_DARK);
  }
  return new THREE.Mesh(builder.build(), flatVertexColors());
}

/** Волосы — деформированная коробка: восемь углов, шесть граней. */
function hairBlock(corners: Record<'fbl' | 'fbr' | 'ftl' | 'ftr' | 'btl' | 'btr' | 'bbl' | 'bbr', [number, number, number]>): THREE.Mesh {
  const v = (key: keyof typeof corners) => new THREE.Vector3(...corners[key]);
  const builder = new FacetBuilder();
  builder.quad(v('ftl'), v('btl'), v('btr'), v('ftr'), HAIR_LIGHT); // верх
  builder.quad(v('fbr'), v('fbl'), v('ftl'), v('ftr'), HAIR); // перёд (смотрит в -z)
  builder.quad(v('bbl'), v('bbr'), v('btr'), v('btl'), HAIR); // затылок
  builder.quad(v('fbl'), v('bbl'), v('btl'), v('ftl'), HAIR); // -x
  builder.quad(v('bbr'), v('fbr'), v('ftr'), v('btr'), HAIR_LIGHT); // +x
  return new THREE.Mesh(builder.build(), flatVertexColors(true));
}

export class Character {
  readonly group = new THREE.Group();
  private skin: Skin;
  private seated: boolean;
  private body = new THREE.Group();
  private head = new THREE.Group();
  private rightArm = new THREE.Group();
  private targetYaw = 0;
  private throwTime = 1;
  private nodTime = 1;
  private phase = Math.random() * 10;

  constructor(skin: Skin, seated = true) {
    this.skin = { ...skin };
    this.seated = seated;
    this.group.add(this.body);
    this.build();
  }

  setSkin(skin: Skin): void {
    this.skin = { ...skin };
    this.body.clear();
    this.head.clear();
    this.rightArm.clear();
    this.build();
  }

  private build(): void {
    const { skin, seated } = this;
    const female = skin.gender === 'female';
    const suit = SUITS_MALE[skin.suit];
    const sleeve = flat(female ? JACKET_BLACK : suit.fabric);
    const trousers = flat(female ? JACKET_BLACK : suit.fabric);
    const shirtColor = female ? SHIRTS[skin.shirt].color : WHITE;
    const skinMaterial = flat(SKIN);

    // Туловище. У мужчины широкие подложенные плечи, у женщины пиджак заужен в талии.
    const hipY = -1.2;
    const shoulderY = 2.25;
    const sections: Section[] = female
      ? [
          { y: hipY, w: 1.7, d: 1.05 },
          { y: 0.25, w: 1.3, d: 0.85 },
          { y: 1.45, w: 1.85, d: 1.0 },
          { y: shoulderY, w: 2.2, d: 0.9 },
        ]
      : [
          { y: hipY, w: 1.9, d: 1.15 },
          { y: 0.25, w: 1.95, d: 1.1 },
          { y: 1.45, w: 2.5, d: 1.15 },
          { y: shoulderY, w: 3.0, d: 1.0 },
        ];
    const torso = new THREE.Mesh(
      loftTorso(sections),
      retro(new THREE.MeshLambertMaterial({ map: torsoTexture(skin), flatShading: true })),
    );
    this.body.add(torso);

    // Шея и голова.
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.5, 6), flat(SKIN_DARK));
    neck.position.y = shoulderY + 0.12;
    this.body.add(neck);
    this.head.position.set(0, shoulderY + 0.22, 0);
    this.body.add(this.head);
    const skull = buildHead(female);
    skull.position.y = 0.86;
    this.head.add(skull);
    this.buildFace(female);
    this.buildHair(female);

    // Руки: плечо → локоть → кисть у края стола (или вдоль тела, если персонаж стоит).
    const shoulderX = sections[3].w / 2 - 0.22;
    const armWidth = female ? 0.5 : 0.62;
    for (const side of [1, -1]) {
      const holder = side === 1 ? this.rightArm : new THREE.Group();
      const shoulder = new THREE.Vector3(side * shoulderX, shoulderY - 0.25, 0);
      const elbow = seated
        ? new THREE.Vector3(side * (shoulderX + 0.2), 0.75, -0.75)
        : new THREE.Vector3(side * (shoulderX + 0.12), 0.55, 0.05);
      const wrist = seated
        ? new THREE.Vector3(side * 0.55, 0.62, -1.75)
        : new THREE.Vector3(side * (shoulderX + 0.1), -0.9, -0.2);
      holder.position.copy(shoulder);
      const local = (p: THREE.Vector3) => p.clone().sub(shoulder);
      holder.add(limb(local(shoulder), local(elbow), armWidth, armWidth, sleeve));
      holder.add(limb(local(elbow), local(wrist), armWidth * 0.85, armWidth * 0.85, sleeve));
      // Манжета рубашки выглядывает из рукава, дальше кисть.
      const direction = wrist.clone().sub(elbow).normalize();
      const cuffEnd = wrist.clone().addScaledVector(direction, female ? 0.22 : 0.12);
      holder.add(limb(local(wrist), local(cuffEnd), armWidth * 0.7, armWidth * 0.7, flat(shirtColor)));
      const handEnd = cuffEnd.clone().addScaledVector(direction, 0.38);
      holder.add(limb(local(cuffEnd), local(handEnd), armWidth * 0.62, armWidth * 0.5, skinMaterial));
      this.body.add(holder);
    }

    // Ноги: сидя — бёдра вперёд, голени вниз; стоя — прямые.
    const legLength = hipY - (FLOOR_Y + 0.2);
    for (const side of [1, -1]) {
      const legX = side * (female ? 0.38 : 0.48);
      const hip = new THREE.Vector3(legX, hipY, 0);
      const knee = seated ? new THREE.Vector3(legX, hipY, -1.7) : new THREE.Vector3(legX, hipY - legLength / 2, 0);
      const ankle = seated ? new THREE.Vector3(legX, FLOOR_Y + 0.2, -1.7) : new THREE.Vector3(legX, FLOOR_Y + 0.2, 0);
      const legMaterial = female ? flat(0x2a2024) : trousers; // у женщины тёмные колготки
      const thick = female ? 0.6 : 0.85;
      this.body.add(limb(hip, knee, thick, thick, female && seated ? flat(JACKET_BLACK) : legMaterial));
      this.body.add(limb(knee, ankle, thick * 0.88, thick * 0.88, legMaterial));
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(thick * 0.9, 0.25, 1.1), flat(BLACK));
      shoe.position.set(ankle.x, FLOOR_Y + 0.12, ankle.z - 0.25);
      this.body.add(shoe);
    }
    if (female) {
      // Чёрная юбка.
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(1.75, seated ? 0.8 : 1.5, seated ? 1.9 : 1.1), flat(JACKET_BLACK));
      skirt.position.set(0, seated ? hipY : hipY - 0.75, seated ? -0.75 : 0);
      this.body.add(skirt);
    }
  }

  private buildFace(female: boolean): void {
    const black = flat(BLACK);
    // Чёрные очки: у мужчины прямоугольные, у женщины чуть крупнее.
    const lensW = female ? 0.5 : 0.44;
    const lensH = female ? 0.3 : 0.24;
    for (const side of [1, -1]) {
      const lens = new THREE.Mesh(new THREE.BoxGeometry(lensW, lensH, 0.08), black);
      lens.position.set(side * 0.29, 1.0, -0.64);
      this.head.add(lens);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.7), black);
      arm.position.set(side * 0.6, 1.03, -0.3);
      this.head.add(arm);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.06), black);
    bridge.position.set(0, 1.05, -0.64);
    this.head.add(bridge);

    // Нос — маленький клин, рот — тонкая полоска.
    const nose = new FacetBuilder()
      .triangle({ x: 0, y: 0.95, z: -0.62 }, { x: 0, y: 0.66, z: -0.8 }, { x: 0.1, y: 0.66, z: -0.6 }, SKIN_LIGHT)
      .triangle({ x: 0, y: 0.95, z: -0.62 }, { x: -0.1, y: 0.66, z: -0.6 }, { x: 0, y: 0.66, z: -0.8 }, SKIN_DARK)
      .triangle({ x: 0.1, y: 0.66, z: -0.6 }, { x: 0, y: 0.66, z: -0.8 }, { x: -0.1, y: 0.66, z: -0.6 }, SKIN_DARK)
      .build();
    this.head.add(new THREE.Mesh(nose, flatVertexColors(true)));
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(female ? 0.22 : 0.26, 0.05, 0.04), flat(female ? 0xa02a3a : 0x8a4a40));
    mouth.position.set(0, 0.42, -0.5);
    this.head.add(mouth);

    if (female) {
      for (const side of [1, -1]) {
        const earring = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), flat(0xd9b44a));
        earring.position.set(side * 0.63, 0.62, 0);
        this.head.add(earring);
      }
    }
  }

  private buildHair(female: boolean): void {
    if (!female) {
      // Зачёсаны назад, с объёмом сверху.
      this.head.add(
        hairBlock({
          fbl: [-0.62, 1.22, -0.6], fbr: [0.62, 1.22, -0.6],
          ftl: [-0.52, 1.98, -0.5], ftr: [0.52, 1.98, -0.5],
          btl: [-0.56, 1.86, 0.6], btr: [0.56, 1.86, 0.6],
          bbl: [-0.66, 0.42, 0.7], bbr: [0.66, 0.42, 0.7],
        }),
      );
      return;
    }
    this.head.add(
      hairBlock({
        fbl: [-0.64, 1.25, -0.58], fbr: [0.64, 1.25, -0.58],
        ftl: [-0.54, 1.84, -0.45], ftr: [0.54, 1.84, -0.45],
        btl: [-0.6, 1.8, 0.6], btr: [0.6, 1.8, 0.6],
        bbl: [-0.7, 0.3, 0.72], bbr: [0.7, 0.3, 0.72],
      }),
    );
    if (this.skin.hair === 1) {
      const bun = new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), flat(HAIR));
      bun.position.set(0, 1.25, 0.92);
      this.head.add(bun);
      return;
    }
    // Длинные волосы ниже плеч: полотно сзади и пряди по бокам.
    this.head.add(
      hairBlock({
        fbl: [-0.72, -1.6, 0.35], fbr: [0.72, -1.6, 0.35],
        ftl: [-0.68, 0.9, 0.3], ftr: [0.68, 0.9, 0.3],
        btl: [-0.66, 0.9, 0.78], btr: [0.66, 0.9, 0.78],
        bbl: [-0.8, -1.6, 0.8], bbr: [0.8, -1.6, 0.8],
      }),
    );
    for (const side of [1, -1]) {
      const strand = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.9, 0.5), flat(side === 1 ? HAIR_LIGHT : HAIR));
      strand.position.set(side * 0.72, 0.1, 0.1);
      this.head.add(strand);
    }
  }

  /** Повернуть голову к точке (в координатах сцены). */
  lookAt(point: THREE.Vector3): void {
    const local = this.group.worldToLocal(point.clone());
    this.targetYaw = THREE.MathUtils.clamp(Math.atan2(-local.x, -local.z), -1.1, 1.1);
  }

  /** Движение руки при броске карты. */
  throwCard(): void {
    this.throwTime = 0;
  }

  /** Кивок, когда персонаж берёт взятку. */
  nod(): void {
    this.nodTime = 0;
  }

  update(time: number, delta: number): void {
    const t = time + this.phase;
    // Лёгкое дыхание и покачивание.
    this.body.position.y = Math.sin(t * 1.3) * 0.025;
    this.body.rotation.z = Math.sin(t * 0.5) * 0.012;

    this.head.rotation.y += (this.targetYaw - this.head.rotation.y) * Math.min(1, delta * 5);
    this.nodTime = Math.min(1, this.nodTime + delta / 0.6);
    this.head.rotation.x = Math.sin(this.nodTime * Math.PI) * 0.35 + Math.sin(t * 0.7) * 0.02;

    this.throwTime = Math.min(1, this.throwTime + delta / 0.45);
    this.rightArm.rotation.x = -Math.sin(this.throwTime * Math.PI) * 0.55;
  }
}
