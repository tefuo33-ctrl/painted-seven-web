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

/** Высота туловища: от бёдер до основания шеи. */
const HIP_Y = -1.2;
const SHOULDER_Y = 2.25;
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
          { y: HIP_Y, w: 1.78, d: 1.12 },
          { y: -0.6, w: 1.7, d: 1.06 },
          { y: 0.25, w: 1.3, d: 0.88 },
          { y: 1.0, w: 1.66, d: 1.04 },
          { y: 1.7, w: 2.0, d: 1.02 },
          { y: 2.1, w: 2.16, d: 0.92 },
          { y: SHOULDER_Y + 0.1, w: 1.5, d: 0.62 },
          { y: TORSO_TOP, w: 0.5, d: 0.4 },
        ]
      : [
          { y: HIP_Y, w: 2.0, d: 1.22 },
          { y: -0.4, w: 2.0, d: 1.2 },
          { y: 0.4, w: 2.06, d: 1.16 },
          { y: 1.2, w: 2.52, d: 1.22 },
          { y: 1.8, w: 2.9, d: 1.16 },
          { y: 2.1, w: 3.0, d: 1.04 },
          { y: SHOULDER_Y + 0.1, w: 2.0, d: 0.7 },
          { y: TORSO_TOP, w: 0.56, d: 0.44 },
        ];
    this.body.add(
      new THREE.Mesh(loftTorso(sections), new THREE.MeshPhongMaterial({ map: torsoTexture(skin), shininess: 5, specular: 0x111111 })),
    );
    this.buildClothes(female, sections);

    // Шея и голова.
    this.body.add(limb(new THREE.Vector3(0, SHOULDER_Y + 0.05, 0), new THREE.Vector3(0, SHOULDER_Y + 0.5, -0.03), female ? 0.2 : 0.25, smooth(SKIN_DARK, 6)));
    this.head.position.set(0, SHOULDER_Y + 0.38, 0);
    this.body.add(this.head);
    const skull = buildHead(female);
    skull.position.y = 0.92;
    this.head.add(skull);
    this.buildFace(female);
    this.buildHair(female);
    this.buildAccessories(female);

    // Руки: плечо → локоть → кисть. Сидя — кисти сведены перед собой и держат карты.
    const shoulderX = (female ? 2.16 : 3.0) / 2 - 0.3;
    const armRadius = female ? 0.25 : 0.33;
    for (const side of [1, -1]) {
      const holder = side === 1 ? this.rightArm : new THREE.Group();
      const shoulder = new THREE.Vector3(side * shoulderX, SHOULDER_Y - 0.32, 0);
      const elbow = seated
        ? new THREE.Vector3(side * (shoulderX + 0.3), 0.66, -0.62)
        : new THREE.Vector3(side * (shoulderX + 0.16), 0.5, 0.06);
      const wrist = seated
        ? new THREE.Vector3(side * 0.36, 0.62, -1.78)
        : new THREE.Vector3(side * (shoulderX + 0.14), -0.95, -0.18);
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
    const radius = female ? 0.3 : 0.42;
    const footY = FLOOR_Y + 0.22 + heel * 0.5;

    for (const side of [1, -1]) {
      const legX = side * (female ? 0.4 : 0.5);
      const hip = new THREE.Vector3(legX, HIP_Y + 0.1, 0);
      const knee = seated ? new THREE.Vector3(legX, HIP_Y + 0.05, -1.75) : new THREE.Vector3(legX * 0.95, (HIP_Y + footY) / 2, -0.04);
      const ankle = seated ? new THREE.Vector3(legX, footY + 0.2, -1.6) : new THREE.Vector3(legX * 0.9, footY + 0.2, 0);
      this.body.add(limb(hip, knee, radius, legMaterial));
      this.body.add(limb(knee, ankle, radius * 0.8, legMaterial));
      // Ботинок: вытянутая округлая форма с подошвой.
      this.body.add(blob(0.3, [female ? 0.78 : 1, 0.6, 1.75], [ankle.x, footY - 0.04, ankle.z - 0.3], shoeMaterial));
      if (!female) this.body.add(blob(0.3, [1.04, 0.16, 1.8], [ankle.x, FLOOR_Y + 0.05, ankle.z - 0.3], smooth(BLACK, 10)));
      if (heel > 0) {
        const heelMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, heel + 0.2, 10), shoeMaterial);
        heelMesh.position.set(ankle.x, FLOOR_Y + (heel + 0.2) / 2, ankle.z + 0.12);
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
    const black = smooth(BLACK, 100);
    // Чёрные очки в оправе: у мужчины прямоугольные со скруглением, у женщины чуть крупнее.
    const lensW = female ? 0.5 : 0.46;
    const lensH = female ? 0.31 : 0.25;
    const rounded = (w: number, h: number, r: number) => {
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 + r, -h / 2);
      shape.lineTo(w / 2 - r, -h / 2);
      shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      shape.lineTo(w / 2, h / 2 - r * 0.6);
      shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r * 0.6, h / 2);
      shape.lineTo(-w / 2 + r * 0.6, h / 2);
      shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r * 0.6);
      shape.lineTo(-w / 2, -h / 2 + r);
      shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
      return shape;
    };
    const lensGeometry = new THREE.ExtrudeGeometry(rounded(lensW, lensH, 0.09), { depth: 0.045, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2, curveSegments: 8 });
    for (const side of [1, -1]) {
      const lens = new THREE.Mesh(lensGeometry, black);
      lens.position.set(side * 0.285, 1.04, -0.69);
      lens.rotation.y = side * -0.2;
      this.head.add(lens);
      const temple = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.74), black);
      temple.position.set(side * 0.585, 1.1, -0.32);
      temple.rotation.y = side * 0.06;
      this.head.add(temple);
    }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.04), black);
    bridge.position.set(0, 1.11, -0.68);
    this.head.add(bridge);

    // Нос: тонкая спинка и кончик.
    this.head.add(limb(new THREE.Vector3(0, 1.08, -0.62), new THREE.Vector3(0, 0.84, -0.7), 0.05, smooth(SKIN_LIGHT, 8)));
    this.head.add(blob(0.075, [1.05, 0.8, 1], [0, 0.82, -0.69], smooth(SKIN_LIGHT, 8)));
    // Губы: верхняя и нижняя.
    const lipColor = female ? 0xb02a40 : 0xa8685a;
    this.head.add(blob(0.07, [female ? 1.5 : 1.7, 0.34, 0.5], [0, 0.585, -0.545], smooth(lipColor, 14)));
    this.head.add(blob(0.07, [female ? 1.25 : 1.4, 0.4, 0.5], [0, 0.535, -0.535], smooth(female ? 0xc03a50 : 0xb47466, 18)));
    // Уши и брови над очками.
    const browColor = HAIR_COLORS[this.skin.hairColor].color ?? 0x35251c;
    for (const side of [1, -1]) {
      this.head.add(blob(0.13, [0.42, 1, 0.72], [side * 0.6, 0.98, 0.04], smooth(SKIN_DARK, 8)));
      const brow = limb(new THREE.Vector3(side * 0.12, 1.25, -0.63), new THREE.Vector3(side * 0.44, 1.27 + (female ? 0.02 : 0), -0.56), female ? 0.018 : 0.026, smooth(browColor, 6));
      this.head.add(brow);
    }
  }

  private buildHair(female: boolean): void {
    const tone = HAIR_COLORS[this.skin.hairColor];
    const dark = smooth(tone.color ?? 0x35251c, 28);
    const light = smooth(tone.light, 28);
    const style = this.skin.hair;
    // Под шляпой волосы прижаты, чтобы не торчали сквозь неё.
    const hat = this.skin.accessory === 3;
    const random = seededRandom(style * 31 + this.skin.hairColor * 7 + (female ? 100 : 0));
    const add = (mesh: THREE.Mesh) => this.head.add(mesh);

    /** Основа причёски по форме головы. */
    const cap = (lift: number, back: number, wide = 1.04) => {
      add(blob(0.66, [wide, 1.02 + lift, 1.1], [0, 1.3 + lift * 0.3, 0.1 + back], dark));
    };
    /** Локоны: шары, разбросанные по области. Чередуются тёмные и светлые пряди. */
    const curls = (count: number, area: () => [number, number, number], size: number) => {
      for (let i = 0; i < count; i++) {
        const [x, y, z] = area();
        const r = size * (0.75 + random() * 0.55);
        add(blob(r, [1, 0.9 + random() * 0.3, 1], [x, y, z], i % 3 === 0 ? light : dark));
      }
    };
    /** Точка на «шапке» головы: a — угол вокруг, up — высота 0…1. */
    const onCap = (a: number, up: number, radius = 0.66): [number, number, number] => {
      const ring = Math.sqrt(Math.max(0, 1 - up * up)) * radius;
      return [Math.cos(a) * ring * 1.02, 1.3 + up * radius * 1.02, Math.sin(a) * ring * 1.08 + 0.1];
    };

    if (!female) {
      if (style === 3) return; // лысый
      if (style === 1 || hat) {
        // Коротко: плотная шапка и аккуратная линия висков.
        cap(-0.05, 0.02);
        for (const side of [1, -1]) add(blob(0.2, [0.5, 1.2, 1.3], [side * 0.6, 1.2, 0.05], dark));
        return;
      }
      if (style === 2) {
        // Кудрявые, пышные — как на референсе: плотные завитки по всей голове и чёлка на лоб.
        cap(0.04, 0.02);
        curls(70, () => onCap(random() * Math.PI * 2, 0.1 + random() * 0.9, 0.7), 0.19);
        curls(14, () => [(random() - 0.5) * 0.9, 1.5 + random() * 0.2, -0.56 - random() * 0.1], 0.15);
        return;
      }
      // Зачёсаны назад с объёмом: пряди идут ото лба к затылку.
      cap(0.02, 0.05);
      for (let i = -3; i <= 3; i++) {
        const x = i * 0.15;
        const height = 1.92 - Math.abs(i) * 0.045;
        const strand = limb(new THREE.Vector3(x * 0.9, height - 0.3, -0.52), new THREE.Vector3(x, height - 0.12, 0.55), 0.115, i % 2 ? light : dark);
        add(strand);
        add(blob(0.13, [1, 1.1, 1.2], [x * 0.9, height - 0.18, -0.46], i % 2 ? light : dark)); // объём надо лбом
      }
      for (const side of [1, -1]) add(blob(0.22, [0.5, 1.5, 1.6], [side * 0.6, 1.24, 0.12], dark));
      return;
    }

    // Женские причёски: объём надо лбом с пробором.
    cap(hat ? -0.04 : 0.05, 0.03, 1.06);
    if (!hat) {
      for (const side of [1, -1]) {
        add(blob(0.3, [1.1, 0.8, 1.5], [side * 0.3, 1.82, -0.2], side === 1 ? light : dark));
        add(blob(0.24, [0.8, 1.2, 1.2], [side * 0.56, 1.5, -0.3], dark));
      }
    }
    if (style === 1) {
      // Пучок на затылке.
      add(blob(0.36, [1, 1, 1], [0, 1.46, 0.86], dark));
      add(blob(0.3, [1.1, 0.5, 1.1], [0, 1.52, 0.9], light));
      add(blob(0.1, [2.2, 0.6, 1], [0, 1.38, 0.58], light));
    } else if (style === 2) {
      // Каре: ровная линия у подбородка, пряди обрамляют лицо.
      add(blob(0.74, [1.06, 1.0, 0.9], [0, 0.86, 0.26], dark));
      for (const side of [1, -1]) {
        add(blob(0.3, [0.66, 2.1, 1.3], [side * 0.62, 0.76, -0.04], side === 1 ? light : dark));
        add(blob(0.16, [0.8, 1, 1], [side * 0.6, 0.2, -0.1], dark));
      }
    } else if (style === 3) {
      // Хвост: собран сзади и спускается на спину.
      add(blob(0.24, [1, 1, 1], [0, 1.52, 0.8], dark));
      add(blob(0.09, [2.4, 0.9, 1.4], [0, 1.5, 0.74], smooth(0x8a1c2b, 20))); // резинка
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        add(blob(0.2 - t * 0.07, [1, 1.3, 1], [Math.sin(t * 4) * 0.06, 1.38 - t * 2.2, 0.96 + Math.sin(t * 3) * 0.08], i % 2 ? light : dark));
      }
    } else {
      // Длинные волнистые волосы ниже плеч: тяжёлые локоны по спине и на плечах, как на референсе.
      add(blob(0.72, [1.14, 2.2, 0.66], [0, 0.05, 0.5], dark));
      curls(58, () => {
        const side = random() < 0.5 ? -1 : 1;
        const down = random();
        const forward = random();
        return [side * (0.5 + random() * 0.32 + down * 0.12), 1.2 - down * 2.5, 0.42 - forward * 0.62 * Math.min(1, down * 1.6)];
      }, 0.23);
      curls(22, () => [(random() - 0.5) * 1.4, -0.6 - random() * 1.0, 0.5 + random() * 0.3], 0.25);
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
