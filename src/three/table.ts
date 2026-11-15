// Стол и кресла. Единица длины — ширина одной карты.
// Сукно лежит на высоте y = 0, пол террасы — на FLOOR_Y.

import * as THREE from 'three';
import { FacetBuilder, PALETTE, flat, flatVertexColors } from './gfx';

export const FELT_RADIUS = 4.8;
export const TABLE_RADIUS = 5.3;
export const FLOOR_Y = -4.2;
/** Расстояние от центра стола до кресла. */
export const SEAT_DISTANCE = 7.4;

/** Точка на окружности: восьмиугольник повёрнут так, что к камере обращена плоская сторона. */
function corner(index: number, radius: number, y: number): THREE.Vector3 {
  const angle = Math.PI / 8 + (index * Math.PI) / 4;
  return new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
}

export function buildTable(): THREE.Group {
  const group = new THREE.Group();

  // Сукно: восемь клиньев с чуть разным оттенком — грани читаются.
  const felt = new FacetBuilder();
  const center = new THREE.Vector3(0, 0, 0);
  // Оттенки близкие: грани видны, но сукно остаётся единым.
  const shades = [PALETTE.felt, 0x23422f, PALETTE.felt, 0x1b3527];
  for (let i = 0; i < 8; i++) {
    felt.triangle(center, corner(i + 1, FELT_RADIUS, 0), corner(i, FELT_RADIUS, 0), shades[i % 4]);
  }
  group.add(new THREE.Mesh(felt.build(), flatVertexColors()));

  // Деревянный бортик чуть шире сукна.
  const rim = new THREE.Mesh(
    new THREE.CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS - 0.25, 0.55, 8),
    flat(PALETTE.wood),
  );
  rim.rotation.y = Math.PI / 8;
  rim.position.y = -0.38; // зазор под сукном, чтобы грани не «мерцали» друг сквозь друга
  group.add(rim);

  // Шестигранная ножка-тумба и опора.
  const legHeight = -FLOOR_Y - 0.55;
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.7, legHeight, 6), flat(PALETTE.woodDark));
  leg.position.y = -0.55 - legHeight / 2;
  group.add(leg);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.9, 0.3, 6), flat(PALETTE.woodDark));
  foot.position.y = FLOOR_Y + 0.15;
  group.add(foot);

  return group;
}

/** Кресло с высокой спинкой. Сидящий смотрит в сторону -z. */
export function buildChair(): THREE.Group {
  const group = new THREE.Group();
  const wood = flat(0x2c1a12);
  const cushion = flat(0x6e1a22);
  const seatY = -1.7;

  const seat = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.35, 3), wood);
  seat.position.set(0, seatY, 0);
  group.add(seat);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.3, 2.6), cushion);
  pad.position.set(0, seatY + 0.3, 0);
  group.add(pad);

  // Спинка: рама и обивка.
  const back = new THREE.Mesh(new THREE.BoxGeometry(3.2, 4.6, 0.35), wood);
  back.position.set(0, seatY + 2.3, 1.45);
  group.add(back);
  const backPad = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.8, 0.2), cushion);
  backPad.position.set(0, seatY + 2.3, 1.25);
  group.add(backPad);
  const crest = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.36, 6, 1, false, 0, Math.PI), wood);
  crest.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  crest.position.set(0, seatY + 4.55, 1.45);
  group.add(crest);

  // Подлокотники.
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 2.6), wood);
    arm.position.set(side * 1.6, seatY + 1.3, 0.2);
    group.add(arm);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.2, 0.3), wood);
    post.position.set(side * 1.6, seatY + 0.6, -1);
    group.add(post);
  }

  // Ножки.
  const legHeight = seatY - FLOOR_Y;
  for (const x of [-1.4, 1.4]) {
    for (const z of [-1.3, 1.3]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.3, legHeight, 0.3), wood);
      leg.position.set(x, FLOOR_Y + legHeight / 2, z);
      group.add(leg);
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

export function buildChairs(): THREE.Group {
  const group = new THREE.Group();
  // Своё кресло (место 0) не рисуем: камера смотрит из него, оно только закрывало бы стол.
  for (const seat of SEATS.slice(1)) {
    const chair = buildChair();
    chair.position.set(seat.x, 0, seat.z);
    chair.rotation.y = seat.angle;
    group.add(chair);
  }
  return group;
}
