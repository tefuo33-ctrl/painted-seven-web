// Покерный стол и кресла. Единица длины — ширина одной карты.
// Сукно лежит на высоте y = 0, пол террасы — на FLOOR_Y.

import * as THREE from 'three';
import { FacetBuilder, PALETTE, flat, flatVertexColors, hex, pixelTexture, retro } from './gfx';

export const FELT_RADIUS = 4.8;
export const TABLE_RADIUS = 5.85;
export const FLOOR_Y = -4.2;
/** Расстояние от центра стола до кресла. */
export const SEAT_DISTANCE = 8.0;

/** Точка на окружности: восьмиугольник повёрнут так, что к камере обращена плоская сторона. */
function corner(index: number, radius: number, y: number): THREE.Vector3 {
  const angle = Math.PI / 8 + (index * Math.PI) / 4;
  return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}

/** Тело вращения с восемью гранями — из него сделаны борт, царга и ножка стола. */
function octagonal(profile: [number, number][], material: THREE.Material): THREE.Mesh {
  const points = profile.map(([radius, y]) => new THREE.Vector2(radius, y));
  material.side = THREE.DoubleSide; // профиль может быть «вывернут» — рисуем обе стороны
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(points, 8), material);
  mesh.rotation.y = Math.PI / 8 + Math.PI / 2;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildTable(): THREE.Group {
  const group = new THREE.Group();

  // Сукно: восемь клиньев с чуть разным оттенком и тонкой линией-разметкой.
  const feltTexture = pixelTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#d9e6da';
    // Мелкая «ворсистость» ткани.
    for (let i = 0; i < 260; i++) ctx.fillRect((i * 37) % w, (i * 53) % h, 1, 1);
  });
  feltTexture.wrapS = feltTexture.wrapT = THREE.RepeatWrapping;
  const felt = new FacetBuilder();
  const center = new THREE.Vector3(0, 0, 0);
  const shades = [PALETTE.felt, 0x23422f, PALETTE.felt, 0x1b3527];
  for (let i = 0; i < 8; i++) {
    felt.triangle(center, corner(i + 1, FELT_RADIUS, 0), corner(i, FELT_RADIUS, 0), shades[i % 4]);
  }
  const feltMesh = new THREE.Mesh(felt.build(), flatVertexColors());
  feltMesh.receiveShadow = true;
  group.add(feltMesh);

  // Золотая линия-разметка на сукне.
  const line = new THREE.Mesh(
    new THREE.RingGeometry(3.55, 3.62, 8, 1),
    retro(new THREE.MeshBasicMaterial({ color: PALETTE.goldDark, transparent: true, opacity: 0.55 })),
  );
  line.rotation.set(-Math.PI / 2, 0, Math.PI / 8);
  line.position.y = 0.012;
  group.add(line);

  // Деревянная окантовка с золотой инкрустацией, мягкий кожаный борт, царга.
  const wood = flat(PALETTE.wood);
  const darkWood = flat(PALETTE.woodDark);
  group.add(octagonal([[FELT_RADIUS - 0.02, 0.0], [FELT_RADIUS + 0.05, 0.03], [5.0, 0.03]], flat(PALETTE.goldDark)));
  group.add(octagonal([[5.0, 0.03], [5.02, 0.24], [5.28, 0.36], [5.6, 0.3], [TABLE_RADIUS, 0.05]], flat(0x3a1a18)));
  group.add(
    octagonal([[TABLE_RADIUS, 0.05], [TABLE_RADIUS - 0.04, -0.3], [5.55, -0.52], [5.0, -0.66], [0.01, -0.66]], wood),
  );
  // Резная ножка-тумба.
  group.add(
    octagonal(
      [[1.05, -0.66], [1.45, -1.05], [0.85, -1.9], [0.8, -2.7], [1.3, -3.35], [2.5, -3.85], [2.75, FLOOR_Y + 0.02], [0.01, FLOOR_Y + 0.02]],
      darkWood,
    ),
  );
  return group;
}

/** Классическое кресло с высокой спинкой. Сидящий смотрит в сторону -z. */
export function buildChair(): THREE.Group {
  const group = new THREE.Group();
  const wood = flat(0x2c1a12);
  const cushion = flat(0x6e1a22);
  const gold = flat(PALETTE.goldDark);
  const seatY = -1.7;
  const add = (mesh: THREE.Mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  add(new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.35, 3.1), wood)).position.set(0, seatY, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.34, 2.7), cushion)).position.set(0, seatY + 0.3, 0);

  // Спинка: рама, обивка, округлый верх с золотой накладкой.
  add(new THREE.Mesh(new THREE.BoxGeometry(3.3, 4.6, 0.35), wood)).position.set(0, seatY + 2.3, 1.5);
  add(new THREE.Mesh(new THREE.BoxGeometry(2.7, 3.9, 0.22), cushion)).position.set(0, seatY + 2.3, 1.28);
  const crest = add(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.36, 8, 1, false, 0, Math.PI), wood));
  crest.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  crest.position.set(0, seatY + 4.55, 1.5);
  add(new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), gold)).position.set(0, seatY + 5.6, 1.3);
  // Гвоздики обивки.
  for (const x of [-1.2, -0.4, 0.4, 1.2]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.06), gold)).position.set(x, seatY + 4.15, 1.15);
  }

  // Подлокотники.
  for (const side of [-1, 1]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.3, 2.7), wood)).position.set(side * 1.65, seatY + 1.3, 0.2);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), wood)).position.set(side * 1.65, seatY + 0.6, -1.05);
  }

  // Ножки.
  const legHeight = seatY - FLOOR_Y;
  for (const x of [-1.45, 1.45]) {
    for (const z of [-1.35, 1.35]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.3, legHeight, 0.3), wood)).position.set(x, FLOOR_Y + legHeight / 2, z);
    }
  }
  return group;
}

/**
 * Места игроков вокруг стола. 0 — я (у камеры), дальше по часовой стрелке,
 * если смотреть сверху: 1 — слева, 2 — напротив, 3 — справа.
 */
export const SEATS: { x: number; z: number; angle: number }[] = [
  { x: 0, z: SEAT_DISTANCE, angle: 0 },
  { x: -SEAT_DISTANCE, z: 0, angle: -Math.PI / 2 },
  { x: 0, z: -SEAT_DISTANCE, angle: Math.PI },
  { x: SEAT_DISTANCE, z: 0, angle: Math.PI / 2 },
];

/** Перевести точку из координат места (x — вправо от игрока, z — к нему от центра) в координаты сцены. */
export function seatPoint(seat: number, right: number, y: number, fromCenter: number): THREE.Vector3 {
  const spot = SEATS[seat];
  const length = Math.hypot(spot.x, spot.z);
  const dx = spot.x / length;
  const dz = spot.z / length;
  // «Вправо от игрока»: игрок смотрит в центр стола.
  return new THREE.Vector3(dx * fromCenter + dz * right, y, dz * fromCenter - dx * right);
}

/** Четыре кресла. Своё (`own`) показывается, только когда камера смотрит со стороны. */
export function buildChairs(): { group: THREE.Group; own: THREE.Group } {
  const group = new THREE.Group();
  let own = new THREE.Group();
  SEATS.forEach((seat, index) => {
    const chair = buildChair();
    chair.position.set(seat.x, 0, seat.z);
    chair.rotation.y = seat.angle;
    group.add(chair);
    if (index === 0) own = chair;
  });
  return { group, own };
}

// ---------- Покерные фишки ----------

const CHIP_RADIUS = 0.27;
export const CHIP_HEIGHT = 0.075;
const chipMaterials = new Map<number, THREE.Material[]>();

function chipMaterial(color: number): THREE.Material[] {
  let materials = chipMaterials.get(color);
  if (!materials) {
    // Ребро: чередование цвета и светлых вставок. Верх: кольцо и середина.
    const side = pixelTexture(32, 4, (ctx, w, h) => {
      ctx.fillStyle = hex(color);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ebe6d6';
      for (let x = 0; x < w; x += 8) ctx.fillRect(x, 0, 3, h);
    });
    const top = pixelTexture(16, 16, (ctx, w, h) => {
      ctx.fillStyle = '#ebe6d6';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = hex(color);
      ctx.fillRect(2, 2, w - 4, h - 4);
      ctx.fillStyle = '#ebe6d6';
      ctx.fillRect(6, 6, 4, 4);
    });
    const sideMaterial = retro(new THREE.MeshLambertMaterial({ map: side, flatShading: true }));
    const topMaterial = retro(new THREE.MeshLambertMaterial({ map: top, flatShading: true }));
    materials = [sideMaterial, topMaterial, topMaterial];
    chipMaterials.set(color, materials);
  }
  return materials;
}

const chipGeometry = new THREE.CylinderGeometry(CHIP_RADIUS, CHIP_RADIUS, CHIP_HEIGHT, 10);

export function buildChip(color: number): THREE.Mesh {
  const chip = new THREE.Mesh(chipGeometry, chipMaterial(color));
  chip.castShadow = true;
  return chip;
}

export const CHIP_COLORS = [0x8a1c2b, 0x1c2550, 0x1a1a22, 0x1f6a4a];

/** Декоративные стопки фишек у каждого игрока. */
export function buildChipStacks(): THREE.Group {
  const group = new THREE.Group();
  const heights = [5, 3, 6, 4, 7, 2];
  SEATS.forEach((_, seat) => {
    for (let stack = 0; stack < 3; stack++) {
      const count = heights[(seat * 2 + stack) % heights.length];
      const base = seatPoint(seat, 2.15 + stack * 0.62 - (stack === 2 ? 0.9 : 0), 0, 3.95 - (stack === 2 ? 0.6 : 0));
      for (let i = 0; i < count; i++) {
        const chip = buildChip(CHIP_COLORS[(seat + stack) % CHIP_COLORS.length]);
        chip.position.set(base.x + ((i * 7) % 3) * 0.012, CHIP_HEIGHT / 2 + i * CHIP_HEIGHT, base.z + ((i * 5) % 3) * 0.012);
        chip.rotation.y = i * 0.7;
        group.add(chip);
      }
    }
  });
  return group;
}
