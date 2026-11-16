// Персонаж за столом: стилизованная объёмная фигура в костюме и чёрных очках. Всё собрано кодом.
// Одежда сделана слоями: рубашка — на теле, поверх неё галстук, воротник, лацканы и пуговицы
// отдельными деталями. Персонаж смотрит в сторону -z. Единица длины — ширина карты; сукно на y = 0.

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

const SKIN = 0xd9a882;
const SKIN_LIGHT = 0xe8bc96;
const SKIN_DARK = 0xbd8e68;
const BLACK = 0x121216;
const JACKET_BLACK = 0x1c1c22;

type Polygon = [number, number][];

/**
 * Пропорции по листу персонажей (примерно три «головы» в росте):
 * голова с причёской ~32 % роста, туловище ~37 %, ноги с обувью ~31 %. Шеи почти не видно.
 */
const HIP_Y = -1.2;
const SHOULDER_Y = 1.72;
/** Во сколько раз голова крупнее «реалистичной». */
const HEAD_SCALE = 1.5;
/** Длина ног у стоящего персонажа (от бёдер до пола). */
export const STANDING_LEG = 2.45;
const TORSO_TOP = SHOULDER_Y + 0.2;
/** Размер «клетки выкройки» (48×64) в единицах сцены. */
const UNIT_Y = (TORSO_TOP - HIP_Y) / 64;

const torsoTextures = new Map<string, THREE.CanvasTexture>();
const TEXTURE_SCALE = 6;

/**
 * Текстура туловища (нижний слой одежды): ткань пиджака и то, что видно в вырезе, —
 * рубашка и жилет. Лацканы, воротник и галстук — отдельные объёмные детали поверх.
 */
function torsoTexture(skin: Skin): THREE.CanvasTexture {
  const key = JSON.stringify(skin);
  const cached = torsoTextures.get(key);
  if (cached) return cached;
  const texture = paintedTexture(64 * TEXTURE_SCALE, 64 * TEXTURE_SCALE, (ctx) => {
    ctx.scale(TEXTURE_SCALE, TEXTURE_SCALE);
    const female = skin.gender === 'female';
    const suit = SUITS_MALE[skin.suit];
    const fabric = female ? JACKET_BLACK : suit.fabric;
    const shirt = hex(SHIRTS[skin.shirt].color ?? 0xffffff);

    ctx.fillStyle = hex(fabric);
    ctx.fillRect(0, 0, 64, 64);
    if (!female && suit.striped) {
      // Тонкая светлая вертикальная полоска.
      ctx.fillStyle = 'rgba(120,136,190,0.75)';
      for (let x = 1; x < 64; x += 3) ctx.fillRect(x, 0, 0.45, 64);
    }
    // Лёгкая фактура ткани.
    for (let i = 0; i < 700; i++) {
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect((i * 37) % 64, (i * 53) % 64, 0.6, 1.4);
    }

    // Вырез пиджака: рубашка, у тройки — ещё и жилет.
    const vBottom = female ? 27 : suit.doubleBreasted ? 29 : 36;
    const wedge = (half: number, bottom: number, color: string) => {
      ctx.beginPath();
      ctx.moveTo(24 - half, 0);
      ctx.lineTo(24 + half, 0);
      ctx.lineTo(24, bottom);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };
    if (!female && suit.vest) {
      wedge(10, vBottom, hex(suit.dark));
      ctx.fillStyle = hex(suit.shade);
      for (const y of [22, 27, 32]) {
        ctx.beginPath();
        ctx.arc(24, y, 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      wedge(5.5, 20, shirt);
    } else {
      wedge(9, vBottom, shirt);
    }
    // Планка рубашки и мягкая тень под лацканами — слой рубашки выглядит утопленным.
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(23.8, 4, 0.5, (female || !suit.vest ? vBottom : 20) - 6);
    const shadow = ctx.createLinearGradient(14, 0, 34, 0);
    shadow.addColorStop(0, 'rgba(0,0,0,0.3)');
    shadow.addColorStop(0.3, 'rgba(0,0,0,0)');
    shadow.addColorStop(0.7, 'rgba(0,0,0,0)');
    shadow.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(34, 0);
    ctx.lineTo(24, vBottom);
    ctx.closePath();
    ctx.clip();
    ctx.fillStyle = shadow;
    ctx.fillRect(14, 0, 20, vBottom);
    ctx.restore();

    // Карманы: нагрудный и клапаны по бокам.
    ctx.fillStyle = female ? '#0c0c10' : hex(suit.dark);
    if (!female) ctx.fillRect(33, 18, 8, 0.7);
    ctx.fillRect(5, 46, 10, 0.8);
    ctx.fillRect(33, 46, 10, 0.8);

    // Мягкая тень по бокам — ткань выглядит объёмной.
    const side = ctx.createLinearGradient(0, 0, 48, 0);
    side.addColorStop(0, 'rgba(0,0,0,0.3)');
    side.addColorStop(0.22, 'rgba(0,0,0,0)');
    side.addColorStop(0.78, 'rgba(0,0,0,0)');
    side.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = side;
    ctx.fillRect(0, 0, 48, 64);
  });
  torsoTextures.set(key, texture);
  return texture;
}

interface Section {
  y: number;
  w: number;
  d: number;
}

const RING = 24;

/**
 * Туловище: плавная фигура из овальных сечений. Передняя половина (-z) получает
 * текстуру с рубашкой в вырезе, задняя — просто ткань.
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
      const front = Math.sin(((k + 0.5) / RING) * Math.PI * 2) < 0; // отрицательный z — перёд
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

/** Глубина передней поверхности туловища на высоте y (по сечениям). */
function frontDepth(sections: Section[], y: number): number {
  for (let i = 0; i < sections.length - 1; i++) {
    const a = sections[i];
    const b = sections[i + 1];
    if (y >= a.y && y <= b.y) return (a.d + ((y - a.y) / (b.y - a.y)) * (b.d - a.d)) / 2;
  }
  return sections[sections.length - 1].d / 2;
}

/** Округлая «кость» от точки a до точки b (рука, нога). */
function limb(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const length = Math.max(0.01, a.distanceTo(b));
  const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 4, 14), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

/** Шар, растянутый по осям, — из таких собраны причёски, кисти, детали лица. */
function blob(radius: number, scale: [number, number, number], position: [number, number, number], material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material);
  mesh.scale.set(...scale);
  mesh.position.set(...position);
  return mesh;
}

/** Голова: шар с выраженными скулами и аккуратным подбородком. */
function buildHead(female: boolean): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(0.62, 36, 28);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    let x = position.getX(i);
    const y = position.getY(i) * 1.22;
    let z = position.getZ(i) * 1.05;
    if (y < 0.1) {
      // Книзу лицо сужается: скулы → челюсть → подбородок. Затылок сужается меньше.
      const t = Math.min(1, (0.1 - y) / 0.86);
      const front = z < 0 ? 1 : 0.55;
      x *= 1 - (female ? 0.52 : 0.4) * Math.pow(t, 1.5) * front - (z >= 0 ? 0.18 * t : 0);
      z = z * (1 - 0.26 * Math.pow(t, 2)) - 0.07 * t * (z < 0 ? 1 : 0);
    }
    // Лёгкая плоскость лица спереди.
    if (z < -0.5) z = -0.5 - (z + 0.5) * 0.72;
    position.setXYZ(i, x, y, z);
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, smooth(SKIN, 8));
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
    const sleeve = smooth(fabric, 5);
    const shirtColor = SHIRTS[skin.shirt].color ?? 0xffffff;
    const skinMaterial = smooth(SKIN, 8);

    // Туловище. У мужчины широкие подложенные плечи, у женщины пиджак заужен в талии.
    const sections: Section[] = female
      ? [
          { y: HIP_Y, w: 1.9, d: 1.2 },
          { y: -0.7, w: 1.84, d: 1.14 },
          { y: 0.1, w: 1.5, d: 0.98 },
          { y: 0.8, w: 1.8, d: 1.08 },
          { y: 1.35, w: 2.14, d: 1.06 },
          { y: 1.62, w: 2.26, d: 0.98 },
          { y: SHOULDER_Y + 0.08, w: 1.6, d: 0.74 },
          { y: TORSO_TOP, w: 0.6, d: 0.5 },
        ]
      : [
          { y: HIP_Y, w: 2.2, d: 1.32 },
          { y: -0.5, w: 2.2, d: 1.3 },
          { y: 0.3, w: 2.3, d: 1.26 },
          { y: 0.95, w: 2.66, d: 1.3 },
          { y: 1.4, w: 2.98, d: 1.24 },
          { y: 1.62, w: 3.06, d: 1.12 },
          { y: SHOULDER_Y + 0.08, w: 2.1, d: 0.84 },
          { y: TORSO_TOP, w: 0.7, d: 0.56 },
        ];
    this.body.add(
      new THREE.Mesh(loftTorso(sections), new THREE.MeshPhongMaterial({ map: torsoTexture(skin), shininess: 5, specular: 0x111111 })),
    );
    this.buildClothes(female, sections);

    // Шея и голова.
    this.body.add(limb(new THREE.Vector3(0, SHOULDER_Y, 0), new THREE.Vector3(0, SHOULDER_Y + 0.34, -0.02), female ? 0.26 : 0.32, smooth(SKIN_DARK, 6)));
    this.head.position.set(0, SHOULDER_Y + 0.02, 0);
    this.head.scale.setScalar(HEAD_SCALE);
    this.body.add(this.head);
    const skull = buildHead(female);
    skull.position.y = 0.92;
    this.head.add(skull);
    this.buildFace(female);
    this.buildHair(female);
    this.buildAccessories(female);

    // Руки: плечо → локоть → кисть. Сидя — кисти сведены перед собой и держат карты.
    const shoulderX = (female ? 2.26 : 3.06) / 2 - 0.3;
    const armRadius = female ? 0.29 : 0.36;
    for (const side of [1, -1]) {
      const holder = side === 1 ? this.rightArm : new THREE.Group();
      const shoulder = new THREE.Vector3(side * shoulderX, SHOULDER_Y - 0.36, 0);
      const elbow = seated
        ? new THREE.Vector3(side * (shoulderX + 0.3), 0.56, -0.62)
        : new THREE.Vector3(side * (shoulderX + 0.2), 0.36, 0.04);
      const wrist = seated
        ? new THREE.Vector3(side * 0.36, 0.62, -1.78)
        : new THREE.Vector3(side * (shoulderX + 0.2), -0.72, -0.12);
      holder.position.copy(shoulder);
      const local = (p: THREE.Vector3) => p.clone().sub(shoulder);
      // Подплечник: плечо пиджака чуть шире и выше руки.
      holder.add(blob(armRadius * 1.25, [1.15, 0.8, 1.05], [side * 0.04, 0.1, 0], sleeve));
      holder.add(limb(local(shoulder), local(elbow), armRadius, sleeve));
      holder.add(limb(local(elbow), local(wrist), armRadius * 0.88, sleeve));
      // Манжета рубашки выглядывает из рукава, дальше кисть с пальцами.
      const direction = wrist.clone().sub(elbow).normalize();
      const cuffEnd = wrist.clone().addScaledVector(direction, female ? 0.26 : 0.16);
      holder.add(limb(local(wrist), local(cuffEnd), armRadius * 0.74, smooth(shirtColor, 5)));
      const palm = cuffEnd.clone().addScaledVector(direction, 0.22);
      const hand = blob(armRadius * 0.82, [1, 0.62, 1.15], [0, 0, 0], skinMaterial);
      hand.position.copy(local(palm));
      hand.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction);
      holder.add(hand);
      // Пальцы, обхватившие карты, и большой палец сверху.
      const across = new THREE.Vector3(-side, 0, 0);
      for (let f = 0; f < 4; f++) {
        const base = palm.clone().addScaledVector(direction, 0.12 + f * 0.01).addScaledVector(across, 0.1 - f * 0.085).add(new THREE.Vector3(0, -0.02, 0));
        const tip = base.clone().addScaledVector(direction, 0.2).add(new THREE.Vector3(0, -0.12, 0));
        holder.add(limb(local(base), local(tip), armRadius * 0.17, skinMaterial));
      }
      holder.add(limb(local(palm), local(palm.clone().addScaledVector(across, 0.2).add(new THREE.Vector3(0, 0.16, -0.08))), armRadius * 0.2, skinMaterial));
      if (!female && skin.accessory === 4 && side === -1) {
        holder.add(limb(local(wrist.clone().addScaledVector(direction, 0.02)), local(wrist.clone().addScaledVector(direction, 0.1)), armRadius * 0.95, smooth(PALETTE.gold, 80)));
      }
      this.body.add(holder);
    }
    this.handAnchor.position.set(0, 0.6, -2.42);
    this.body.add(this.handAnchor);

    this.buildLegs(female, fabric);

    // Тени от всех частей персонажа.
    this.body.traverse((object) => {
      if ((object as THREE.Mesh).isMesh) {
        object.castShadow = true;
        object.receiveShadow = true;
      }
    });
  }

  /** Верхний слой одежды: лацканы, воротник, галстук, пуговицы — объёмные детали поверх рубашки. */
  private buildClothes(female: boolean, sections: Section[]): void {
    const { skin } = this;
    const suit = SUITS_MALE[skin.suit];
    const chestWidth = female ? 1.9 : 2.6;
    const unitX = chestWidth / 48;
    const shirt = smooth(SHIRTS[skin.shirt].color ?? 0xffffff, 6, true);
    const lapelColor = female ? 0x2b2b34 : suit.shade;
    const lapelMaterial = smooth(lapelColor, 6, true);

    /** Деталь по выкройке (координаты 48×64, как на текстуре), выдавленная на толщину. */
    const piece = (points: Polygon, thickness: number, material: THREE.Material, lift: number, mirrorX = false): THREE.Mesh => {
      const shape = new THREE.Shape();
      points.forEach(([tx, ty], i) => {
        const x = (24 - tx) * unitX * (mirrorX ? -1 : 1);
        const y = TORSO_TOP - ty * UNIT_Y;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      });
      const mesh = new THREE.Mesh(
        new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 1 }),
        material,
      );
      // Середина детали по высоте — там прижимаем её к поверхности груди; наклон повторяет скос к шее.
      const ys = points.map(([, ty]) => TORSO_TOP - ty * UNIT_Y);
      const top = Math.max(...ys);
      const low = Math.min(...ys);
      const zTop = frontDepth(sections, top);
      const zLow = frontDepth(sections, low);
      const tilt = Math.atan2(zLow - zTop, Math.max(0.2, top - low));
      const pivot = new THREE.Group();
      pivot.position.set(0, low, -zLow - lift - thickness);
      mesh.position.y = -low;
      pivot.rotation.x = tilt;
      // Боковые детали чуть развёрнуты наружу — ложатся по округлой груди.
      pivot.rotation.y = (mirrorX ? 1 : -1) * 0.1 * (points.some(([tx]) => tx < 14) ? 1 : 0);
      pivot.add(mesh);
      this.body.add(pivot);
      return mesh;
    };
    const pair = (points: Polygon, thickness: number, material: THREE.Material, lift: number) => {
      piece(points, thickness, material, lift);
      piece(points, thickness, material, lift, true);
    };

    if (female) {
      // Лацканы с вырезом и крупный острый воротник рубашки ПОВЕРХ них.
      pair([[16.5, 1], [11, 1], [9.5, 11], [13, 12], [12, 16], [23.6, 27.5]], 0.06, lapelMaterial, 0.01);
      pair([[20.5, 0.5], [23.6, 6.5], [14, 14], [11, 4.5]], 0.05, shirt, 0.08);
      // Пуговицы.
      for (const ty of [31, 37]) {
        this.body.add(blob(0.07, [1, 1, 0.5], [0, TORSO_TOP - ty * UNIT_Y, -frontDepth(sections, TORSO_TOP - ty * UNIT_Y) - 0.02], smooth(0x4a4a56, 60)));
      }
      if (skin.accessory === 4) {
        this.body.add(blob(0.1, [1, 1, 0.5], [-0.42, 1.72, -frontDepth(sections, 1.72) - 0.12], smooth(PALETTE.gold, 90)));
      }
      return;
    }

    const vBottom = suit.doubleBreasted ? 29 : 36;
    // Широкие остроконечные лацканы: пик смотрит вверх к плечу.
    pair([[17.4, 1], [11.5, 1], [12.6, 9], [7, 6.4], [10.6, 15], [23.7, vBottom + 0.5]], 0.07, lapelMaterial, 0.012);
    // Воротник рубашки.
    pair([[18.4, 0.6], [23.7, 3], [20.6, 7.2]], 0.05, shirt, 0.06);

    // Галстук: узел и полотно, сужающееся кверху.
    const tie = TIES[skin.tie];
    if (!tie.none) {
      const tieMaterial = smooth(tie.color ?? 0, 22, true);
      const tieEnd = suit.vest ? 18 : vBottom - 3;
      piece([[22.6, 4.2], [25.4, 4.2], [26.6, tieEnd], [24, tieEnd + 2.2], [21.4, tieEnd]], 0.05, tieMaterial, 0.02);
      piece([[22, 1.2], [26, 1.2], [25.4, 4.6], [22.6, 4.6]], 0.09, tieMaterial, 0.03);
      if (tie.pattern !== undefined) {
        for (let ty = 7; ty < tieEnd; ty += 3) {
          const y = TORSO_TOP - ty * UNIT_Y;
          this.body.add(blob(0.022, [1, 1, 0.4], [(ty % 2 ? 0.03 : -0.03), y, -frontDepth(sections, y) - 0.085], smooth(tie.pattern, 40)));
        }
      }
    }

    // Пуговицы: у двубортного — шесть в два ряда.
    const buttonMaterial = smooth(suit.fabric > 0x808080 ? 0x5a4630 : 0x0c1024, 60);
    const buttons: [number, number][] = suit.doubleBreasted
      ? [[18.5, 32], [29.5, 32], [18.5, 38], [29.5, 38], [18.5, 44], [29.5, 44]]
      : [[24, 40], [24, 46]];
    for (const [tx, ty] of buttons) {
      const y = TORSO_TOP - ty * UNIT_Y;
      this.body.add(blob(0.075, [1, 1, 0.5], [(24 - tx) * unitX, y, -frontDepth(sections, y) * 0.99 - 0.02], buttonMaterial));
    }
    // Платок в нагрудном кармане или бутоньерка на лацкане (слева у персонажа).
    if (skin.accessory === 1) {
      piece([[34.4, 18.4], [36, 14.6], [37.2, 16.4], [38.4, 14.4], [39.8, 18.4]], 0.04, smooth(0xf4efe6, 8, true), 0.02);
    }
    if (skin.accessory === 2) {
      const y = TORSO_TOP - 10 * UNIT_Y;
      this.body.add(blob(0.11, [1, 1, 0.6], [-(36 - 24) * unitX, y, -frontDepth(sections, y) - 0.16], smooth(0xc82a3a, 20)));
      this.body.add(blob(0.05, [1, 1, 0.6], [-(36 - 24) * unitX, y, -frontDepth(sections, y) - 0.22], smooth(0xf0c040, 20)));
    }
  }

  private buildLegs(female: boolean, fabric: number): void {
    const { skin, seated } = this;
    const skirt = SKIRTS[skin.skirt];
    const trousers = !female || skirt.trousers === true;
    const legMaterial = smooth(!female ? fabric : trousers ? JACKET_BLACK : 0x2a2024, 5); // иначе тёмные колготки
    const shoeColor = (female ? SHOES_FEMALE[skin.shoes] : SHOES_MALE[skin.shoes]).color ?? BLACK;
    const shoeMaterial = smooth(shoeColor, 70);
    const heel = female ? SHOES_FEMALE[skin.shoes].heel : 0;
    const radius = female ? 0.32 : 0.5;
    // Стоящий персонаж ниже: его «пол» — на длину коротких ног под бёдрами.
    const ground = seated ? FLOOR_Y : HIP_Y - STANDING_LEG;
    const footY = ground + 0.22 + heel * 0.5;

    for (const side of [1, -1]) {
      const legX = side * (female ? 0.42 : 0.56);
      const hip = new THREE.Vector3(legX, HIP_Y + 0.1, 0);
      const knee = seated ? new THREE.Vector3(legX, HIP_Y + 0.05, -1.75) : new THREE.Vector3(legX * 0.95, (HIP_Y + footY) / 2, -0.04);
      const ankle = seated ? new THREE.Vector3(legX, footY + 0.2, -1.6) : new THREE.Vector3(legX * 0.9, footY + 0.2, 0);
      this.body.add(limb(hip, knee, radius, legMaterial));
      this.body.add(limb(knee, ankle, radius * (female ? 0.8 : 0.94), legMaterial));
      // Ботинок: вытянутая округлая форма с подошвой.
      this.body.add(blob(0.34, [female ? 0.8 : 1.15, 0.62, 1.7], [ankle.x, footY - 0.04, ankle.z - 0.28], shoeMaterial));
      if (!female) this.body.add(blob(0.3, [1.04, 0.16, 1.8], [ankle.x, ground + 0.05, ankle.z - 0.3], smooth(BLACK, 10)));
      if (heel > 0) {
        const heelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, heel + 0.2, 10), shoeMaterial);
        heelMesh.position.set(ankle.x, ground + (heel + 0.2) / 2, ankle.z + 0.12);
        this.body.add(heelMesh);
      }
    }

    if (female && !trousers) {
      // Юбка: стоя — от бёдер вниз на свою длину; сидя — лежит на бёдрах и свисает с коленей.
      const material = smooth(JACKET_BLACK, 5);
      if (seated) {
        const along = Math.min(1.95, 0.7 + skirt.length * 0.6);
        const top = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, along, 4, 16), material);
        top.rotation.x = Math.PI / 2;
        top.scale.set(1.75, 1, 0.9);
        top.position.set(0, HIP_Y + 0.06, -along / 2 + 0.1);
        this.body.add(top);
        if (skirt.length > 2) {
          const drop = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.0, skirt.length - 1.4, 20), material);
          drop.scale.z = 0.5;
          drop.position.set(0, HIP_Y - (skirt.length - 1.4) / 2 - 0.1, -1.72);
          this.body.add(drop);
        }
      } else {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.86, skirt.length > 2 ? 1.02 : 0.74, skirt.length, 24), material);
        mesh.scale.z = 0.7;
        mesh.position.set(0, HIP_Y - skirt.length / 2 + 0.15, 0);
        this.body.add(mesh);
      }
    }
  }

  private buildFace(female: boolean): void {
    const black = smooth(BLACK, 110);
    // Крупные чёрные очки закрывают глаза — как на листе персонажей.
    const lensW = female ? 0.52 : 0.5;
    const lensH = female ? 0.34 : 0.3;
    const rounded = (w: number, h: number, r: number) => {
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 + r, -h / 2);
      shape.lineTo(w / 2 - r, -h / 2);
      shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      shape.lineTo(w / 2, h / 2 - r * 0.5);
      shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r * 0.5, h / 2);
      shape.lineTo(-w / 2 + r * 0.5, h / 2);
      shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r * 0.5);
      shape.lineTo(-w / 2, -h / 2 + r);
      shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      return shape;
    };
    const lensGeometry = new THREE.ExtrudeGeometry(rounded(lensW, lensH, 0.12), { depth: 0.05, bevelEnabled: true, bevelSize: 0.014, bevelThickness: 0.014, bevelSegments: 2, curveSegments: 10 });
    for (const side of [1, -1]) {
      const lens = new THREE.Mesh(lensGeometry, black);
      lens.position.set(side * 0.29, 0.98, -0.7);
      lens.rotation.y = side * -0.2;
      this.head.add(lens);
      const temple = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.74), black);
      temple.position.set(side * 0.6, 1.05, -0.32);
      temple.rotation.y = side * 0.06;
      this.head.add(temple);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.05), black);
    bridge.position.set(0, 1.06, -0.69);
    this.head.add(bridge);

    // Небольшой нос и маленький рот.
    this.head.add(blob(0.07, [0.9, 0.8, 0.9], [0, 0.78, -0.68], smooth(SKIN_LIGHT, 8)));
    this.head.add(blob(0.06, [female ? 1.5 : 1.7, 0.4, 0.5], [0, 0.56, -0.56], smooth(female ? 0xb83448 : 0xa66a5c, 16)));
    // Уши (у длинных причёсок их закрывают волосы).
    for (const side of [1, -1]) {
      this.head.add(blob(0.13, [0.42, 1, 0.72], [side * 0.6, 0.94, 0.04], smooth(SKIN_DARK, 8)));
    }
  }

  private buildHair(female: boolean): void {
    const tone = HAIR_COLORS[this.skin.hairColor];
    const dark = smooth(tone.color ?? 0x35251c, 30);
    const light = smooth(tone.light, 30);
    const style = this.skin.hair;
    // Под шляпой волосы прижаты, чтобы не торчали сквозь неё.
    const hat = this.skin.accessory === 3;
    const random = seededRandom(style * 31 + this.skin.hairColor * 7 + (female ? 100 : 0));
    const add = (mesh: THREE.Mesh) => this.head.add(mesh);
    const pick = (i: number) => (i % 3 === 0 ? light : dark);

    /** Основа причёски: шапка заметно больше головы, сдвинута к затылку. */
    const cap = (size: number, lift: number, back: number) => {
      add(blob(0.7, [1.06 * size, (1.02 + lift) * size, 1.12 * size], [0, 1.32 + lift * 0.4, 0.14 + back], dark));
    };
    /** Локоны: шары, разбросанные по области; чередуются тёмные и светлые пряди. */
    const curls = (count: number, area: () => [number, number, number], size: number) => {
      for (let i = 0; i < count; i++) {
        const [x, y, z] = area();
        add(blob(size * (0.78 + random() * 0.5), [1, 0.9 + random() * 0.25, 1], [x, y, z], pick(i)));
      }
    };
    /** Точка на поверхности шапки: a — угол вокруг головы, up — высота 0…1. */
    const onCap = (a: number, up: number, radius: number): [number, number, number] => {
      const ring = Math.sqrt(Math.max(0, 1 - up * up)) * radius;
      return [Math.cos(a) * ring * 1.04, 1.32 + up * radius, Math.sin(a) * ring * 1.1 + 0.14];
    };
    /** Чёлка: пряди надо лбом, спускаются почти до очков. */
    const fringe = (count: number, low: number, sweep: number) => {
      for (let i = 0; i < count; i++) {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const x = (t - 0.5) * 1.08;
        add(blob(0.2, [1.05, 1.25, 0.8], [x + sweep * (1 - Math.abs(t - 0.5)), low + 0.24 - Math.abs(t - 0.5) * 0.18, -0.6 + Math.abs(t - 0.5) * 0.14], pick(i + 1)));
      }
    };
    /** Виски: объём по бокам головы перед ушами. */
    const sides = (length: number) => {
      for (const side of [1, -1]) add(blob(0.24, [0.6, length, 1.5], [side * 0.6, 1.3 - length * 0.12, 0.02], dark));
    };

    if (!female) {
      if (style === 3) return; // без волос
      if (style === 1 || hat) {
        // Короткие: аккуратная шапка и короткая чёлка.
        cap(0.98, -0.02, 0);
        fringe(5, 1.36, 0);
        sides(1.3);
        return;
      }
      if (style === 2) {
        // Кудрявые: пышная шапка из завитков, чёлка на лоб.
        cap(1.08, 0.06, 0);
        curls(90, () => onCap(random() * Math.PI * 2, 0.05 + random() * 0.95, 0.8), 0.2);
        curls(16, () => [(random() - 0.5) * 1.0, 1.46 + random() * 0.2, -0.56 - random() * 0.12], 0.17);
        sides(1.5);
        return;
      }
      // Пышные, уложенные с объёмом сверху — как на листе персонажей.
      cap(1.1, 0.1, 0.02);
      curls(34, () => onCap(random() * Math.PI * 2, 0.35 + random() * 0.65, 0.78), 0.26);
      fringe(6, 1.36, 0.1);
      sides(1.5);
      return;
    }

    // Женские причёски: объём надо лбом и по бокам.
    cap(hat ? 1.0 : 1.1, hat ? -0.02 : 0.08, 0.03);
    if (!hat) {
      curls(22, () => onCap(random() * Math.PI * 2, 0.4 + random() * 0.6, 0.78), 0.26);
      fringe(5, 1.4, -0.12);
    }
    if (style === 1) {
      // Собраны наверх, пучок на затылке.
      add(blob(0.4, [1, 1, 1], [0, 1.5, 0.94], dark));
      add(blob(0.32, [1.1, 0.5, 1.1], [0, 1.6, 0.98], light));
      sides(1.4);
    } else if (style === 2) {
      // Каре: до подбородка, обрамляет лицо.
      add(blob(0.8, [1.08, 1.0, 0.92], [0, 0.84, 0.28], dark));
      for (const side of [1, -1]) {
        add(blob(0.32, [0.7, 2.2, 1.35], [side * 0.66, 0.74, -0.02], side === 1 ? light : dark));
        add(blob(0.18, [0.8, 1, 1], [side * 0.64, 0.14, -0.08], dark));
      }
    } else if (style === 3) {
      // Хвост: собран сзади и спускается на спину.
      add(blob(0.26, [1, 1, 1], [0, 1.56, 0.86], dark));
      add(blob(0.09, [2.4, 0.9, 1.4], [0, 1.54, 0.8], smooth(0x8a1c2b, 20))); // резинка
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        add(blob(0.24 - t * 0.08, [1, 1.3, 1], [Math.sin(t * 4) * 0.06, 1.42 - t * 2.0, 1.02 + Math.sin(t * 3) * 0.08], pick(i)));
      }
      sides(1.4);
    } else {
      // Длинные волнистые: тяжёлые локоны обрамляют лицо и лежат на плечах и спине.
      add(blob(0.78, [1.2, 1.9, 0.72], [0, 0.2, 0.52], dark));
      curls(70, () => {
        const side = random() < 0.5 ? -1 : 1;
        const down = random();
        const forward = random();
        return [side * (0.56 + random() * 0.3 + down * 0.1), 1.3 - down * 2.3, 0.44 - forward * 0.7 * Math.min(1, 0.3 + down * 1.4)];
      }, 0.25);
      curls(24, () => [(random() - 0.5) * 1.5, -0.4 - random() * 0.8, 0.5 + random() * 0.3], 0.27);
    }
  }

  private buildAccessories(female: boolean): void {
    const accessory = this.skin.accessory;
    const gold = smooth(PALETTE.gold, 90);
    if (accessory === 3) {
      // Шляпа: у мужчины федора с заломом, у женщины — с широкими полями.
      const felt = smooth(female ? 0x1c1c22 : 0x4a3a30, 8);
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(female ? 1.35 : 1.0, female ? 1.42 : 1.06, 0.06, 36), felt);
      brim.position.y = 1.84;
      this.head.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.68, 0.6, 28), felt);
      crown.position.y = 2.15;
      this.head.add(crown);
      this.head.add(blob(0.56, [1, 0.22, 1], [0, 2.45, 0], felt));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.685, 0.7, 0.15, 28), smooth(female ? 0x8a1c2b : 0x1a1a22, 30));
      band.position.y = 1.95;
      this.head.add(band);
    }
    if (female && accessory === 1) {
      for (const side of [1, -1]) {
        this.head.add(blob(0.05, [1, 1, 1], [side * 0.63, 0.82, 0.04], gold));
        this.head.add(blob(0.09, [1, 1.4, 1], [side * 0.64, 0.68, 0.04], gold));
      }
    }
    if (female && accessory === 2) {
      // Жемчужное ожерелье.
      for (let i = -5; i <= 5; i++) {
        this.body.add(blob(0.06, [1, 1, 1], [i * 0.085, SHOULDER_Y + 0.02 - (25 - i * i) * 0.009, -0.34 - (25 - i * i) * 0.006], smooth(0xf6f1e4, 100)));
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
