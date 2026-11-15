// Персонаж за столом: стилизованная объёмная фигура в костюме и чёрных очках. Всё собрано кодом.
// Персонаж смотрит в сторону -z. Единица длины — ширина карты; сукно стола на y = 0.

import * as THREE from 'three';
import {
  type Skin,
  HAIR_COLORS,
  SHIRTS,
  SHOES_FEMALE,
  SHOES_MALE,
  SKIRTS,
  SUITS_MALE,
  TIES,
} from '../shared/skin';
import { PALETTE, hex, paintedTexture, seededRandom, smooth } from './gfx';
import { FLOOR_Y } from './table';

export * from '../shared/skin';

const SKIN = 0xd6a47c;
const SKIN_LIGHT = 0xe6b890;
const SKIN_DARK = 0xb98a64;
const BLACK = 0x121216;
const JACKET_BLACK = 0x1c1c22;

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
const TEXTURE_SCALE = 6;

/**
 * Текстура туловища: слева (3/4 ширины) — перёд пиджака с лацканами, рубашкой и галстуком,
 * справа — просто ткань для боков и спины. Рисуется в координатах 64×64 и увеличивается вдвое.
 */
function torsoTexture(skin: Skin): THREE.CanvasTexture {
  const key = JSON.stringify(skin);
  const cached = torsoTextures.get(key);
  if (cached) return cached;
  const texture = paintedTexture(64 * TEXTURE_SCALE, 64 * TEXTURE_SCALE, (ctx) => {
    ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE);
    if (skin.gender === 'male') drawMaleTorso(ctx, skin);
    else drawFemaleTorso(ctx, skin);
    // Мягкая тень по бокам и книзу — ткань выглядит объёмной.
    const shade = ctx.createLinearGradient(0, 0, 48, 0);
    shade.addColorStop(0, 'rgba(0,0,0,0.28)');
    shade.addColorStop(0.2, 'rgba(0,0,0,0)');
    shade.addColorStop(0.8, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 48, 64);
  });
  torsoTextures.set(key, texture);
  return texture;
}

function drawMaleTorso(ctx: CanvasRenderingContext2D, skin: Skin): void {
  const suit = SUITS_MALE[skin.suit];
  const tie = TIES[skin.tie];
  const shirt = hex(SHIRTS[skin.shirt].color ?? 0xffffff);
  const fabric = hex(suit.fabric);
  const shade = hex(suit.shade);
  const dark = hex(suit.dark);
  const stripe = '#56628e';

  ctx.fillStyle = fabric;
  ctx.fillRect(0, 0, 64, 64);
  if (suit.striped) {
    // Тонкая светлая вертикальная полоска.
    ctx.fillStyle = stripe;
    for (let x = 1; x < 64; x += 4) ctx.fillRect(x, 0, 1, 64);
  }

  const vBottom = suit.doubleBreasted ? 29 : 36;
  if (suit.vest) {
    // Жилет костюма-тройки виден в вырезе пиджака.
    poly(ctx, [[15, 0], [33, 0], [24, vBottom]], dark);
    ctx.fillStyle = suit.striped ? stripe : shade;
    for (const y of [22, 27, 32]) ctx.fillRect(23, y, 2, 2);
    poly(ctx, [[19, 0], [29, 0], [24, 19]], shirt);
  } else {
    poly(ctx, [[16, 0], [32, 0], [24, vBottom]], shirt);
  }

  if (tie.none) {
    // Без галстука: расстёгнутый ворот.
    ctx.fillStyle = '#00000044';
    ctx.fillRect(23.5, 4, 1, suit.vest ? 14 : vBottom - 8);
  } else {
    const tieEnd = suit.vest ? 17 : vBottom - 3;
    const tieColor = hex(tie.color ?? 0);
    poly(ctx, [[22.5, 4], [25.5, 4], [26.5, tieEnd], [24, tieEnd + 2], [21.5, tieEnd]], tieColor);
    if (tie.pattern !== undefined) {
      ctx.fillStyle = hex(tie.pattern);
      for (let y = 6; y < tieEnd; y += 3) ctx.fillRect(y % 2 === 0 ? 23 : 24, y, 1, 1);
    }
    poly(ctx, [[22, 1], [26, 1], [25.5, 4.5], [22.5, 4.5]], tieColor, '#00000055');
  }

  // Воротник рубашки.
  const collar: Polygon = [[18, 0], [24, 2.5], [20.5, 7]];
  poly(ctx, collar, shirt, '#00000040');
  poly(ctx, mirror(collar), shirt, '#00000040');

  // Широкие остроконечные лацканы: пик смотрит вверх к плечу.
  const lapel: Polygon = [[17, 0], [11, 0], [12.5, 9], [7, 6.5], [10.5, 15], [24, vBottom]];
  poly(ctx, lapel, shade, dark);
  poly(ctx, mirror(lapel), shade, dark);

  ctx.fillStyle = suit.fabric > 0x808080 ? '#5a4630' : '#0c1024';
  if (suit.doubleBreasted) {
    // Двубортный: шесть пуговиц, два ряда по три.
    for (const y of [31, 37, 43]) {
      ctx.fillRect(18, y, 2, 2);
      ctx.fillRect(28, y, 2, 2);
    }
  } else {
    ctx.fillRect(23, 39, 2, 2);
    ctx.fillRect(23, 45, 2, 2);
  }

  // Нагрудный карман и клапаны карманов по бокам.
  ctx.fillStyle = dark;
  ctx.fillRect(33, 18, 8, 1);
  ctx.fillRect(5, 46, 10, 1);
  ctx.fillRect(33, 46, 10, 1);
  if (skin.accessory === 1) poly(ctx, [[34.5, 18], [37, 14.5], [39.5, 18]], '#f2efe6', '#00000030'); // платок
  if (skin.accessory === 2) {
    // Бутоньерка на лацкане.
    ctx.fillStyle = '#c82a3a';
    ctx.fillRect(35, 9, 3, 3);
    ctx.fillStyle = '#2f6a3a';
    ctx.fillRect(36, 12, 1, 2);
  }
}

function drawFemaleTorso(ctx: CanvasRenderingContext2D, skin: Skin): void {
  const shirt = hex(SHIRTS[skin.shirt].color ?? 0xffffff);
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
  if (skin.accessory === 4) {
    // Брошь на лацкане.
    ctx.fillStyle = hex(PALETTE.gold);
    ctx.fillRect(34, 10, 3, 3);
    ctx.fillStyle = '#fff2c0';
    ctx.fillRect(35, 11, 1, 1);
  }
}

interface Section {
  y: number;
  w: number;
  d: number;
}

const RING = 20;

/**
 * Туловище: плавная фигура из овальных сечений. Передняя половина (-z) получает
 * текстуру пиджака с лацканами и рубашкой, задняя — просто ткань.
 */
function loftTorso(sections: Section[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const bottom = sections[0].y;
  const height = sections[sections.length - 1].y - bottom;
  const FRONT_U = 48 / 64;

  /** Точка сечения: слегка «квадратный» овал — плечи и грудь выглядят как у пиджака. */
  const ringPoint = (section: Section, index: number) => {
    const angle = (index / RING) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const shape = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.72);
    return { x: (section.w / 2) * shape(c), z: (section.d / 2) * shape(s), nx: c / section.w, nz: s / section.d };
  };
  const push = (section: Section, index: number, front: boolean) => {
    const p = ringPoint(section, index);
    positions.push(p.x, section.y, p.z);
    const length = Math.hypot(p.nx, p.nz) || 1;
    normals.push(p.nx / length, 0, p.nz / length);
    // Спереди слева на экране — правая рука персонажа (+x).
    const u = front ? FRONT_U * (0.5 - p.x / section.w) : 0.79 + 0.18 * (p.x / section.w + 0.5);
    uvs.push(u, (section.y - bottom) / height);
  };

  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i];
    const b = sections[i + 1];
    for (let k = 0; k < RING; k++) {
      // Сегменты с отрицательным z — перёд персонажа.
      const front = Math.sin(((k + 0.5) / RING) * Math.PI * 2) < 0;
      // Обход против часовой стрелки, если смотреть снаружи.
      push(a, k + 1, front);
      push(a, k, front);
      push(b, k, front);
      push(a, k + 1, front);
      push(b, k, front);
      push(b, k + 1, front);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return geometry;
}

/** Округлая «кость» от точки a до точки b (рука, нога). */
function limb(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const length = Math.max(0.01, a.distanceTo(b));
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 12), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

/** Шар, растянутый по осям, — из таких собраны причёски, кисти, детали лица. */
function blob(radius: number, scale: [number, number, number], position: [number, number, number], material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 14, 10), material);
  mesh.scale.set(...scale);
  mesh.position.set(...position);
  return mesh;
}

/** Голова: шар, суженный к подбородку. */
function buildHead(female: boolean): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.64, 28, 22);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i);
    let y = position.getY(i) * 1.2;
    let z = position.getZ(i) * 1.04;
    if (y < 0) {
      // Скулы и подбородок: книзу голова сужается, подбородок чуть выступает вперёд.
      const t = Math.min(1, -y / 0.77);
      x *= 1 - (female ? 0.5 : 0.42) * Math.pow(t, 1.6);
      z = z * (1 - 0.3 * Math.pow(t, 2)) - 0.08 * t;
    }
    position.setXYZ(i, x, y, z);
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, smooth(SKIN, 6));
}

export class Character {
  readonly group = new THREE.Group();
  /** Точка у кистей: отсюда расходится веер карт. */
  readonly handAnchor = new THREE.Object3D();
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
    const fabric = female ? JACKET_BLACK : suit.fabric;
    const sleeve = smooth(fabric, 4);
    const shirtColor = SHIRTS[skin.shirt].color ?? 0xffffff;
    const skinMaterial = smooth(SKIN, 6);

    // Туловище. У мужчины широкие подложенные плечи, у женщины пиджак заужен в талии.
    const hipY = -1.2;
    const shoulderY = 2.25;
    const sections: Section[] = female
      ? [
          { y: hipY, w: 1.72, d: 1.1 },
          { y: -0.5, w: 1.6, d: 1.02 },
          { y: 0.3, w: 1.32, d: 0.88 },
          { y: 1.1, w: 1.7, d: 1.02 },
          { y: 1.75, w: 2.0, d: 1.0 },
          { y: 2.12, w: 2.14, d: 0.9 },
          { y: shoulderY + 0.1, w: 1.5, d: 0.62 },
          { y: shoulderY + 0.2, w: 0.5, d: 0.4 },
        ]
      : [
          { y: hipY, w: 1.95, d: 1.2 },
          { y: -0.4, w: 1.98, d: 1.18 },
          { y: 0.4, w: 2.05, d: 1.14 },
          { y: 1.2, w: 2.5, d: 1.2 },
          { y: 1.8, w: 2.86, d: 1.14 },
          { y: 2.12, w: 2.96, d: 1.02 },
          { y: shoulderY + 0.1, w: 2.0, d: 0.7 },
          { y: shoulderY + 0.2, w: 0.56, d: 0.44 },
        ];
    this.body.add(
      new THREE.Mesh(loftTorso(sections), new THREE.MeshPhongMaterial({ map: torsoTexture(skin), shininess: 4, specular: 0x111111 })),
    );

    // Шея и голова.
    this.body.add(limb(new THREE.Vector3(0, shoulderY, 0), new THREE.Vector3(0, shoulderY + 0.42, -0.02), 0.26, smooth(SKIN_DARK, 4)));
    this.head.position.set(0, shoulderY + 0.3, 0);
    this.body.add(this.head);
    const skull = buildHead(female);
    skull.position.y = 0.92;
    this.head.add(skull);
    this.buildFace(female);
    this.buildHair(female);
    this.buildAccessories(female, shoulderY);

    // Руки: плечо → локоть → кисть. Сидя — кисти сведены перед собой и держат карты.
    const shoulderX = (female ? 2.14 : 2.96) / 2 - 0.3;
    const armRadius = female ? 0.25 : 0.32;
    for (const side of [1, -1]) {
      const holder = side === 1 ? this.rightArm : new THREE.Group();
      const shoulder = new THREE.Vector3(side * shoulderX, shoulderY - 0.32, 0);
      const elbow = seated
        ? new THREE.Vector3(side * (shoulderX + 0.3), 0.66, -0.62)
        : new THREE.Vector3(side * (shoulderX + 0.16), 0.5, 0.06);
      const wrist = seated
        ? new THREE.Vector3(side * 0.36, 0.62, -1.78)
        : new THREE.Vector3(side * (shoulderX + 0.14), -0.95, -0.18);
      holder.position.copy(shoulder);
      const local = (p: THREE.Vector3) => p.clone().sub(shoulder);
      holder.add(blob(armRadius * 1.12, [1, 1, 1], [0, 0, 0], sleeve)); // округлое плечо
      holder.add(limb(local(shoulder), local(elbow), armRadius, sleeve));
      holder.add(limb(local(elbow), local(wrist), armRadius * 0.88, sleeve));
      // Манжета рубашки выглядывает из рукава, дальше кисть.
      const direction = wrist.clone().sub(elbow).normalize();
      const cuffEnd = wrist.clone().addScaledVector(direction, female ? 0.26 : 0.16);
      holder.add(limb(local(wrist), local(cuffEnd), armRadius * 0.74, smooth(shirtColor, 4)));
      const palm = cuffEnd.clone().addScaledVector(direction, 0.24);
      const hand = blob(armRadius * 0.86, [1, 0.72, 1.25], [0, 0, 0], skinMaterial);
      hand.position.copy(local(palm));
      hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      holder.add(hand);
      // Большой палец.
      holder.add(limb(local(palm), local(palm.clone().add(new THREE.Vector3(-side * 0.16, 0.16, -0.06))), armRadius * 0.24, skinMaterial));
      if (!female && skin.accessory === 4 && side === -1) {
        holder.add(limb(local(wrist.clone().addScaledVector(direction, 0.02)), local(wrist.clone().addScaledVector(direction, 0.1)), armRadius * 0.95, smooth(PALETTE.gold, 80)));
      }
      this.body.add(holder);
    }
    this.handAnchor.position.set(0, 0.6, -2.42);
    this.body.add(this.handAnchor);

    this.buildLegs(female, hipY, fabric);

    // Тени от всех частей персонажа.
    this.body.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }

  private buildLegs(female: boolean, hipY: number, fabric: number): void {
    const { skin, seated } = this;
    const skirt = SKIRTS[skin.skirt];
    const trousers = !female || skirt.trousers === true;
    const legMaterial = smooth(!female ? fabric : trousers ? JACKET_BLACK : 0x2a2024, 4); // иначе тёмные колготки
    const shoeColor = (female ? SHOES_FEMALE[skin.shoes] : SHOES_MALE[skin.shoes]).color ?? BLACK;
    const shoeMaterial = smooth(shoeColor, 60);
    const heel = female ? SHOES_FEMALE[skin.shoes].heel : 0;
    const radius = female ? 0.3 : 0.42;
    const footY = FLOOR_Y + 0.22 + heel * 0.5;

    for (const side of [1, -1]) {
      const legX = side * (female ? 0.4 : 0.5);
      const hip = new THREE.Vector3(legX, hipY + 0.1, 0);
      const knee = seated ? new THREE.Vector3(legX, hipY + 0.05, -1.75) : new THREE.Vector3(legX * 0.95, (hipY + footY) / 2, -0.04);
      const ankle = seated ? new THREE.Vector3(legX, footY + 0.2, -1.6) : new THREE.Vector3(legX * 0.9, footY + 0.2, 0);
      this.body.add(limb(hip, knee, radius, legMaterial));
      this.body.add(limb(knee, ankle, radius * 0.8, legMaterial));
      // Ботинок: вытянутая округлая форма.
      const shoe = blob(0.3, [female ? 0.78 : 1, 0.62, 1.75], [ankle.x, footY - 0.04, ankle.z - 0.3], shoeMaterial);
      this.body.add(shoe);
      if (heel > 0) {
        const heelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, heel + 0.2, 8), shoeMaterial);
        heelMesh.position.set(ankle.x, FLOOR_Y + (heel + 0.2) / 2, ankle.z + 0.12);
        this.body.add(heelMesh);
      }
    }

    if (female && !trousers) {
      // Юбка: стоя — от бёдер вниз на свою длину; сидя — лежит на бёдрах и свисает с коленей.
      const material = smooth(JACKET_BLACK, 4);
      if (seated) {
        const along = Math.min(1.95, 0.7 + skirt.length * 0.6);
        const top = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, along, 4, 14), material);
        top.rotation.x = Math.PI / 2;
        top.scale.set(1.75, 1, 0.9);
        top.position.set(0, hipY + 0.06, -along / 2 + 0.1);
        this.body.add(top);
        if (skirt.length > 2) {
          const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, skirt.length - 1.4, 16), material);
          drop.scale.z = 0.5;
          drop.position.set(0, hipY - (skirt.length - 1.4) / 2 - 0.1, -1.72);
          this.body.add(drop);
        }
      } else {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.84, skirt.length > 2 ? 1.02 : 0.74, skirt.length, 20), material);
        mesh.scale.z = 0.7;
        mesh.position.set(0, hipY - skirt.length / 2 + 0.15, 0);
        this.body.add(mesh);
      }
    }
  }

  private buildFace(female: boolean): void {
    const black = smooth(BLACK, 90);
    // Чёрные очки: у мужчины прямоугольные со скруглением, у женщины чуть крупнее.
    const lensW = female ? 0.5 : 0.46;
    const lensH = female ? 0.32 : 0.26;
    const lensShape = new THREE.Shape();
    const r = 0.07;
    lensShape.moveTo(-lensW / 2 + r, -lensH / 2);
    lensShape.lineTo(lensW / 2 - r, -lensH / 2);
    lensShape.quadraticCurveTo(lensW / 2, -lensH / 2, lensW / 2, -lensH / 2 + r);
    lensShape.lineTo(lensW / 2, lensH / 2 - r);
    lensShape.quadraticCurveTo(lensW / 2, lensH / 2, lensW / 2 - r, lensH / 2);
    lensShape.lineTo(-lensW / 2 + r, lensH / 2);
    lensShape.quadraticCurveTo(-lensW / 2, lensH / 2, -lensW / 2, lensH / 2 - r);
    lensShape.lineTo(-lensW / 2, -lensH / 2 + r);
    lensShape.quadraticCurveTo(-lensW / 2, -lensH / 2, -lensW / 2 + r, -lensH / 2);
    const lensGeometry = new THREE.ExtrudeGeometry(lensShape, { depth: 0.05, bevelEnabled: false, curveSegments: 6 });
    for (const side of [1, -1]) {
      const lens = new THREE.Mesh(lensGeometry, black);
      lens.position.set(side * 0.29, 1.06, -0.7);
      lens.rotation.y = side * -0.16;
      this.head.add(lens);
      const temple = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.72), black);
      temple.position.set(side * 0.6, 1.1, -0.34);
      this.head.add(temple);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.05), black);
    bridge.position.set(0, 1.12, -0.7);
    this.head.add(bridge);

    // Нос, губы, уши, брови над очками.
    this.head.add(blob(0.1, [0.85, 1.5, 1.2], [0, 0.9, -0.7], smooth(SKIN_LIGHT, 6)));
    const lips = blob(0.1, [female ? 1.25 : 1.4, 0.3, 0.5], [0, 0.5, -0.56], smooth(female ? 0xa62a3c : 0x9a5a4c, 10));
    this.head.add(lips);
    for (const side of [1, -1]) {
      this.head.add(blob(0.13, [0.45, 1, 0.75], [side * 0.63, 0.98, 0.02], smooth(SKIN_DARK, 6)));
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.045, 0.05), smooth(HAIR_COLORS[this.skin.hairColor].color ?? 0x35251c, 4));
      brow.position.set(side * 0.28, 1.27, -0.66);
      brow.rotation.z = side * -0.1;
      this.head.add(brow);
    }
  }

  private buildHair(female: boolean): void {
    const tone = HAIR_COLORS[this.skin.hairColor];
    const dark = smooth(tone.color ?? 0x35251c, 16);
    const light = smooth(tone.light, 16);
    const style = this.skin.hair;
    // Под шляпой волосы прижаты, чтобы не торчали сквозь неё.
    const hat = this.skin.accessory === 3;
    const random = seededRandom(style * 31 + this.skin.hairColor * 7 + (female ? 100 : 0));

    /** Шапка волос по форме головы. */
    const cap = (lift: number, back: number) => {
      this.head.add(blob(0.68, [1.02, 1.0 + lift, 1.08], [0, 1.28 + lift * 0.3, 0.1 + back], dark));
    };
    /** Локоны: шары, разбросанные по поверхности. */
    const curls = (count: number, area: (t: number) => [number, number, number], size: number) => {
      for (let i = 0; i < count; i++) {
        const [x, y, z] = area(random());
        this.head.add(blob(size * (0.8 + random() * 0.5), [1, 1, 1], [x, y, z], i % 3 === 0 ? light : dark));
      }
    };

    if (!female) {
      if (style === 3) return; // лысый
      if (style === 1 || hat) {
        cap(-0.06, 0.02); // коротко
        return;
      }
      if (style === 2) {
        // Кудрявые, пышные — как на референсе.
        cap(0.02, 0.02);
        curls(34, () => {
          const a = random() * Math.PI * 2;
          const up = 0.25 + random() * 0.75;
          const ring = Math.sqrt(1 - up * up) * 0.66;
          return [Math.cos(a) * ring, 1.32 + up * 0.62, Math.sin(a) * ring * 1.05 + 0.08];
        }, 0.2);
        return;
      }
      // Зачёсаны назад с объёмом сверху.
      cap(0.08, 0.06);
      this.head.add(blob(0.42, [1.25, 0.6, 1.2], [0, 1.9, -0.2], light));
      return;
    }

    cap(hat ? -0.04 : 0.04, 0.03);
    if (style === 1) {
      this.head.add(blob(0.36, [1, 1, 1], [0, 1.42, 0.86], dark)); // пучок
      this.head.add(blob(0.12, [1.6, 0.5, 1], [0, 1.36, 0.6], light));
    } else if (style === 2) {
      // Каре: до подбородка.
      this.head.add(blob(0.74, [1.04, 0.95, 0.9], [0, 0.82, 0.24], dark));
      for (const side of [1, -1]) this.head.add(blob(0.3, [0.7, 1.9, 1.3], [side * 0.62, 0.72, -0.02], light));
    } else if (style === 3) {
      // Хвост: собран сзади и спускается на спину.
      this.head.add(blob(0.24, [1, 1, 1], [0, 1.5, 0.8], dark));
      const tail = limb(new THREE.Vector3(0, 1.45, 0.92), new THREE.Vector3(0, -0.7, 1.02), 0.2, dark);
      this.head.add(tail);
      this.head.add(blob(0.16, [1, 1.6, 1], [0, -0.85, 1.02], light));
    } else {
      // Длинные волнистые волосы ниже плеч.
      this.head.add(blob(0.7, [1.12, 2.1, 0.62], [0, 0.1, 0.52], dark));
      curls(26, () => {
        const side = random() < 0.5 ? -1 : 1;
        const down = random();
        return [side * (0.5 + random() * 0.26), 1.1 - down * 2.3, 0.05 + random() * 0.5];
      }, 0.24);
      curls(10, () => [(random() - 0.5) * 1.2, -1.0 - random() * 0.5, 0.5 + random() * 0.2], 0.24);
    }
  }

  private buildAccessories(female: boolean, shoulderY: number): void {
    const accessory = this.skin.accessory;
    const gold = smooth(PALETTE.gold, 80);
    if (accessory === 3) {
      // Шляпа: у мужчины федора, у женщины — с широкими полями.
      const felt = smooth(female ? 0x1c1c22 : 0x4a3a30, 6);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(female ? 1.35 : 1.0, female ? 1.4 : 1.04, 0.06, 28), felt);
      brim.position.y = 1.82;
      this.head.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.68, 0.58, 24), felt);
      crown.position.y = 2.12;
      this.head.add(crown);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.69, 0.7, 0.15, 24), smooth(female ? 0x8a1c2b : 0x1a1a22, 20));
      band.position.y = 1.93;
      this.head.add(band);
    }
    if (female && accessory === 1) {
      for (const side of [1, -1]) this.head.add(blob(0.09, [1, 1.3, 1], [side * 0.66, 0.74, 0.02], gold));
    }
    if (female && accessory === 2) {
      // Жемчужное ожерелье.
      for (let i = -4; i <= 4; i++) {
        this.body.add(blob(0.065, [1, 1, 1], [i * 0.1, shoulderY - 0.08 - (16 - i * i) * 0.012, -0.36 - (16 - i * i) * 0.008], smooth(0xf4efe2, 90)));
      }
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
