// Покерный стол, кресла и фишки. Единица длины — ширина одной карты.
// Сукно лежит на высоте y = 0, пол террасы — на FLOOR_Y.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PALETTE, hex, paintedTexture, smooth } from './gfx';

/** Во сколько раз стол шире модели в натуральную величину (высота стола прежняя). */
export const TABLE_SCALE = 1.4;
/** Радиус сукна до внутренней стенки борта (что ближе к краю — уже на борту). */
export const FELT_RADIUS = 5.0 * TABLE_SCALE;
export const TABLE_RADIUS = 5.85 * TABLE_SCALE;

/**
 * Воксельный стол из 3D-сессии (assets/3d/export/environment/poker_table.glb, копия в public/models/).
 * Он в метрах: радиус по борту 0.80, сукно на высоте 0.72. В игре стол того же размера, что и прежний:
 * борт — на радиусе TABLE_RADIUS, сукно — на высоте 0. Ножки уходят чуть ниже пола террасы — их не видно.
 */
const TABLE_MODEL_URL = `${import.meta.env.BASE_URL}models/poker_table.glb`;
const MODEL_RIM_RADIUS = 0.8;
const MODEL_FELT_HEIGHT = 0.72;
/** Сколько единиц игры в одном метре 3D-сцены (стол радиусом 0.80 м — радиусом TABLE_RADIUS). */
export const METRE = 5.85 / MODEL_RIM_RADIUS;
/** Пол террасы: сукно на 0.72 м выше пола. */
export const FLOOR_Y = -MODEL_FELT_HEIGHT * METRE;
/**
 * На сколько опустить сидящих персонажей, чтобы они сели на воксельный стул
 * (его сиденье на 0.48 м выше пола — ниже, чем у прежнего кресла).
 */
export const CHARACTER_SEAT_Y = -0.75;
const CHAIR_MODEL_URL = `${import.meta.env.BASE_URL}models/chair.glb`;
/** Расстояние от центра стола до кресла. */
export const SEAT_DISTANCE = 8.0 + (TABLE_RADIUS - 5.85);

const SEGMENTS = 56;

/** Тело вращения: из него сделаны борт, царга и ножка стола. */
function turned(profile: [number, number][], material: THREE.Material, segments = SEGMENTS): THREE.Mesh {
  const points = profile.map(([radius, y]) => new THREE.Vector2(radius, y));
  const mesh = new THREE.Mesh(new THREE.LatheGeometry(points, segments), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Стол. Сразу ставится нарисованный кодом (чтобы сцена не была пустой), а когда загрузится
 * воксельная модель — она его заменяет. Если модель не загрузилась, остаётся прежний стол.
 */
export function buildTable(): THREE.Group {
  const group = new THREE.Group();
  const fallback = buildProceduralTable();
  fallback.scale.set(TABLE_SCALE, 1, TABLE_SCALE);
  group.add(fallback);
  new GLTFLoader().load(
    TABLE_MODEL_URL,
    (gltf) => {
      const model = gltf.scene;
      // Шире в TABLE_SCALE раз, но той же высоты: сукно на y = 0, ножка — на полу террасы.
      model.scale.set(METRE * TABLE_SCALE, METRE, METRE * TABLE_SCALE);
      model.position.y = -MODEL_FELT_HEIGHT * METRE;
      model.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      group.remove(fallback);
      group.add(model);
    },
    undefined,
    (error) => console.warn('Модель стола не загрузилась — остаётся прежний стол', error),
  );
  return group;
}

/** Прежний стол, собранный кодом: запасной вариант. */
function buildProceduralTable(): THREE.Group {
  const group = new THREE.Group();

  // Сукно: мягкая ткань с ворсом, светлее к центру (свет фонаря), золотая линия-разметка.
  const feltTexture = paintedTexture(512, 512, (ctx, w, h) => {
    const gradient = ctx.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 2);
    gradient.addColorStop(0, '#2f6a48');
    gradient.addColorStop(0.6, '#235238');
    gradient.addColorStop(1, '#183a28');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    // Ворс ткани.
    for (let i = 0; i < 9000; i++) {
      const x = (i * 7919) % w;
      const y = (i * 104729) % h;
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      ctx.fillRect(x, y, 1, 2);
    }
    ctx.strokeStyle = 'rgba(217,180,74,0.55)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.375, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, w * 0.36, 0, Math.PI * 2);
    ctx.stroke();
  });
  const felt = new THREE.Mesh(
    new THREE.CircleGeometry(4.85, SEGMENTS),
    new THREE.MeshLambertMaterial({ map: feltTexture }),
  );
  felt.rotation.x = -Math.PI / 2;
  felt.receiveShadow = true;
  group.add(felt);

  // Золотая окантовка сукна, мягкий кожаный борт, царга из полированного дерева.
  const wood = smooth(0x4a2a18, 40);
  const darkWood = smooth(0x321c10, 40);
  group.add(turned([[4.8, 0.0], [4.84, 0.035], [5.0, 0.035]], smooth(PALETTE.goldDark, 60)));
  group.add(
    turned(
      [[5.0, 0.035], [5.01, 0.2], [5.1, 0.33], [5.3, 0.4], [5.55, 0.37], [5.75, 0.24], [5.85, 0.05]],
      smooth(0x47201a, 26),
    ),
  );
  group.add(
    turned(
      [[5.85, 0.05], [5.82, -0.22], [5.72, -0.34], [5.74, -0.44], [5.5, -0.56], [5.0, -0.68], [0.01, -0.68]],
      wood,
    ),
  );
  // Точёная ножка-тумба с кольцами.
  group.add(
    turned(
      [
        [1.0, -0.68], [1.5, -0.92], [1.55, -1.05], [1.05, -1.3], [0.82, -1.9], [0.8, -2.5], [0.95, -2.75],
        [0.9, -2.9], [1.25, -3.2], [2.1, -3.62], [2.55, -3.8], [2.7, -3.98], [2.72, FLOOR_Y + 0.02], [0.01, FLOOR_Y + 0.02],
      ],
      darkWood,
      32,
    ),
  );
  return group;
}

/** Фигура спинки кресла: прямоугольник с округлым верхом. */
function backShape(width: number, height: number): THREE.Shape {
  const half = width / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(half, height - half * 0.9);
  shape.quadraticCurveTo(half, height, 0, height);
  shape.quadraticCurveTo(-half, height, -half, height - half * 0.9);
  shape.closePath();
  return shape;
}

function extruded(shape: THREE.Shape, depth: number, bevel: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 16 }),
    material,
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Классическое кресло: резная деревянная рама, бордовая обивка. Сидящий смотрит в сторону -z. */
export function buildChair(): THREE.Group {
  const group = new THREE.Group();
  const wood = smooth(0x8a5a2a, 36); // тёплое золотистое дерево, как на референсе
  const woodDark = smooth(0x5a3418, 30);
  const cushion = smooth(0x7a1c24, 6);
  const seatY = -1.7;
  const add = <T extends THREE.Mesh>(mesh: T) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Сиденье: рама и мягкая подушка со скруглёнными краями.
  const seatShape = new THREE.Shape();
  const sw = 1.65;
  seatShape.moveTo(-sw + 0.3, -1.55);
  seatShape.lineTo(sw - 0.3, -1.55);
  seatShape.quadraticCurveTo(sw, -1.55, sw, -1.25);
  seatShape.lineTo(sw, 1.45);
  seatShape.lineTo(-sw, 1.45);
  seatShape.lineTo(-sw, -1.25);
  seatShape.quadraticCurveTo(-sw, -1.55, -sw + 0.3, -1.55);
  const frame = add(extruded(seatShape, 0.3, 0.04, wood));
  frame.rotation.x = Math.PI / 2;
  frame.position.y = seatY + 0.15;
  const pad = add(extruded(seatShape, 0.22, 0.12, cushion));
  pad.rotation.x = Math.PI / 2;
  pad.scale.set(0.86, 0.86, 1);
  pad.position.y = seatY + 0.5;

  // Спинка: рама с округлым верхом и обивка, утопленная в раму.
  const back = add(extruded(backShape(3.3, 5.2), 0.34, 0.05, wood));
  back.position.set(0, seatY + 0.1, 1.3);
  const backPad = add(extruded(backShape(2.6, 4.3), 0.2, 0.1, cushion));
  backPad.position.set(0, seatY + 0.55, 1.16);
  // Резное навершие.
  const finial = add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), smooth(PALETTE.gold, 70)));
  finial.position.set(0, seatY + 5.45, 1.47);

  // Подлокотники: изогнутая планка на точёной стойке.
  for (const side of [-1, 1]) {
    const arm = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 2.5, 4, 10), wood));
    arm.rotation.x = Math.PI / 2 - 0.1;
    arm.position.set(side * 1.68, seatY + 1.42, 0.1);
    const armPad = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 1.2, 4, 10), cushion));
    armPad.rotation.x = Math.PI / 2 - 0.1;
    armPad.position.set(side * 1.68, seatY + 1.55, 0.1);
    const post = add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 1.2, 10), woodDark));
    post.position.set(side * 1.68, seatY + 0.75, -1.1);
  }

  // Ножки: передние точёные, задние чуть отклонены назад.
  const legHeight = seatY - FLOOR_Y;
  for (const x of [-1.42, 1.42]) {
    const front = add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.1, legHeight, 10), woodDark));
    front.position.set(x, FLOOR_Y + legHeight / 2, -1.3);
    const rear = add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.11, legHeight + 0.1, 10), woodDark));
    rear.position.set(x, FLOOR_Y + legHeight / 2, 1.38);
    rear.rotation.x = 0.08;
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

/** Перевести точку из координат места (right — вправо от игрока, fromCenter — от центра стола) в координаты сцены. */
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
  const places: THREE.Group[] = [];
  SEATS.forEach((seat, index) => {
    // В каждом месте — прежнее кресло, пока не загрузится воксельный стул.
    const place = new THREE.Group();
    place.position.set(seat.x, 0, seat.z);
    place.rotation.y = seat.angle;
    place.add(buildChair());
    group.add(place);
    places.push(place);
    if (index === 0) own = place;
  });
  new GLTFLoader().load(
    CHAIR_MODEL_URL,
    (gltf) => {
      gltf.scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      for (const place of places) {
        // Стул в метрах, пол на y = 0, сиденьем к +Z — разворачиваем его к столу.
        const chair = gltf.scene.clone();
        chair.scale.setScalar(METRE);
        chair.position.y = FLOOR_Y;
        chair.rotation.y = Math.PI;
        place.clear();
        place.add(chair);
      }
    },
    undefined,
    (error) => console.warn('Стул не загрузился — остаются прежние кресла', error),
  );
  return { group, own };
}

// ---------- Покерные фишки ----------

const CHIP_RADIUS = 0.27;
export const CHIP_HEIGHT = 0.075;
const chipMaterials = new Map<number, THREE.Material[]>();

function chipMaterial(color: number): THREE.Material[] {
  let materials = chipMaterials.get(color);
  if (!materials) {
    // Ребро: чередование цвета и светлых вставок. Верх: кольцо со вставками и середина.
    const side = paintedTexture(128, 16, (ctx, w, h) => {
      ctx.fillStyle = hex(color);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f2ecdc';
      for (let x = 0; x < w; x += 32) ctx.fillRect(x, 0, 13, h);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, w, 2);
      ctx.fillRect(0, h - 2, w, 2);
    });
    const top = paintedTexture(128, 128, (ctx, w, h) => {
      const c = w / 2;
      ctx.fillStyle = hex(color);
      ctx.fillRect(0, 0, w, h);
      // Светлые вставки по краю.
      ctx.fillStyle = '#f2ecdc';
      for (let i = 0; i < 8; i++) {
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.arc(c, c, c, (i * Math.PI) / 4 - 0.16, (i * Math.PI) / 4 + 0.16);
        ctx.fill();
      }
      ctx.fillStyle = hex(color);
      ctx.beginPath();
      ctx.arc(c, c, c * 0.72, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#f2ecdc';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(c, c, c * 0.56, 0, Math.PI * 2);
      ctx.stroke();
    });
    const sideMaterial = new THREE.MeshPhongMaterial({ map: side, shininess: 30, specular: 0x222222 });
    const topMaterial = new THREE.MeshPhongMaterial({ map: top, shininess: 30, specular: 0x222222 });
    materials = [sideMaterial, topMaterial, topMaterial];
    chipMaterials.set(color, materials);
  }
  return materials;
}

const chipGeometry = new THREE.CylinderGeometry(CHIP_RADIUS, CHIP_RADIUS, CHIP_HEIGHT, 24);

export function buildChip(color: number): THREE.Mesh {
  const chip = new THREE.Mesh(chipGeometry, chipMaterial(color));
  chip.castShadow = true;
  chip.receiveShadow = true;
  return chip;
}

export const CHIP_COLORS = [0x9a1c2b, 0x1c2f6a, 0x1a1a22, 0x1f6a4a];

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
