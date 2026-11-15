// Локация: терраса виллы у моря на закате. Всё собрано кодом из простых форм.

import * as THREE from 'three';
import { FacetBuilder, PALETTE, flat, flatVertexColors, glow, hex, pixelTexture, retro, seededRandom } from './gfx';
import { FLOOR_Y } from './table';

const SEA_Y = -11;
const EDGE_Z = -13; // край террасы с балюстрадой
const CEILING_Y = 12.5;
const SKY_Z = -260;

export interface Location {
  group: THREE.Group;
  /** Вызывать каждый кадр: волны, мерцание фонаря. `time` — в секундах. */
  update(time: number): void;
}

// ---------- Небо, солнце, море ----------

function buildSky(group: THREE.Group): void {
  const texture = pixelTexture(8, 128, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#231d48');
    gradient.addColorStop(0.35, '#4a3a78');
    gradient.addColorStop(0.62, '#a8588a');
    gradient.addColorStop(0.82, '#e87a5a');
    gradient.addColorStop(0.95, '#f6a850');
    gradient.addColorStop(1, '#ffd080');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
  });
  const sky = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 260),
    new THREE.MeshBasicMaterial({ map: texture, fog: false }),
  );
  sky.position.set(0, SEA_Y + 130, SKY_Z);
  group.add(sky);

  // Солнце наполовину ушло в море.
  const sun = new THREE.Mesh(new THREE.CircleGeometry(13, 10), new THREE.MeshBasicMaterial({ color: 0xffe2a0, fog: false }));
  sun.position.set(0, SEA_Y + 3, SKY_Z + 2);
  group.add(sun);
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(30, 10),
    new THREE.MeshBasicMaterial({ color: 0xff9a50, fog: false, transparent: true, opacity: 0.35 }),
  );
  halo.position.set(0, SEA_Y + 3, SKY_Z + 1);
  group.add(halo);

  // Плоские облака: тёмные сверху, подсвеченные снизу.
  const random = seededRandom(7);
  for (let i = 0; i < 9; i++) {
    const width = 50 + random() * 90;
    const x = (random() - 0.5) * 520;
    const y = SEA_Y + 28 + random() * 80;
    const top = new THREE.Mesh(
      new THREE.PlaneGeometry(width, 5 + random() * 4),
      new THREE.MeshBasicMaterial({ color: y > SEA_Y + 70 ? 0x3f346a : 0x7a4a7c, fog: false }),
    );
    top.position.set(x, y, SKY_Z + 4);
    group.add(top);
    const bottom = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 0.8, 2.5),
      new THREE.MeshBasicMaterial({ color: y > SEA_Y + 70 ? 0x8a4f86 : 0xf08a5a, fog: false }),
    );
    bottom.position.set(x + width * 0.05, y - 3.2, SKY_Z + 5);
    group.add(bottom);
  }
}

function buildSea(group: THREE.Group): (time: number) => void {
  const waves = pixelTexture(32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#1c2a5e';
    ctx.fillRect(0, 0, w, h);
    const random = seededRandom(3);
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = random() > 0.5 ? '#24367a' : '#172250';
      for (let x = 0; x < w; x += 4) {
        if (random() > 0.45) ctx.fillRect(x, y, 3 + Math.floor(random() * 4), 1);
      }
    }
  });
  waves.wrapS = waves.wrapT = THREE.RepeatWrapping;
  waves.repeat.set(40, 24);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(900, -SKY_Z + 20),
    retro(new THREE.MeshBasicMaterial({ map: waves })),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, SEA_Y, SKY_Z / 2);
  group.add(sea);

  // Дорожка света от солнца: золотые чёрточки. Полоса узкая у горизонта и широкая у берега.
  const path = pixelTexture(32, 32, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const random = seededRandom(11);
    for (let y = 0; y < h; y++) {
      for (let n = 0; n < 6; n++) {
        const x = w / 2 + (random() - 0.5) * (random() > 0.5 ? 12 : 26);
        ctx.fillStyle = random() > 0.4 ? '#ffd27a' : '#ff9c50';
        if (random() > 0.3) ctx.fillRect(Math.floor(x), y, 2 + Math.floor(random() * 4), 1);
      }
    }
  });
  path.wrapT = THREE.RepeatWrapping;
  path.repeat.y = 5;
  const farZ = SKY_Z + 4;
  const nearZ = EDGE_Z - 4;
  const pathGeometry = new THREE.BufferGeometry();
  pathGeometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(
      [-9, 0, farZ, 9, 0, farZ, 34, 0, nearZ, -9, 0, farZ, 34, 0, nearZ, -34, 0, nearZ],
      3,
    ),
  );
  pathGeometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2));
  const light = new THREE.Mesh(
    pathGeometry,
    new THREE.MeshBasicMaterial({ map: path, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide }),
  );
  light.position.y = SEA_Y + 0.9; // заметный зазор над водой: иначе полоса мерцает вдалеке
  group.add(light);

  return (time) => {
    waves.offset.y = time * 0.03;
    waves.offset.x = Math.sin(time * 0.2) * 0.02;
    path.offset.y = Math.floor(time * 6) / 32; // шагами, как старая анимация
  };
}

function buildBoatAndTown(group: THREE.Group): void {
  // Парусник вдалеке.
  const boat = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 0.9, 1.4), glow(0x2a2238));
  boat.add(hull);
  const sail = new FacetBuilder()
    .triangle({ x: 0.2, y: 0.5, z: 0 }, { x: 3, y: 0.8, z: 0 }, { x: 0.2, y: 8, z: 0 }, 0xf2e2c8)
    .triangle({ x: -0.2, y: 0.5, z: 0 }, { x: -0.2, y: 6.5, z: 0 }, { x: -2.4, y: 0.8, z: 0 }, 0xd8c0a8)
    .build();
  boat.add(new THREE.Mesh(sail, retro(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }))));
  boat.position.set(34, SEA_Y + 0.4, -150);
  group.add(boat);

  // Скалистый берег справа.
  const random = seededRandom(21);
  const rocks: [number, number, number, number, number][] = [
    // x, z, радиус, высота, цвет
    [120, -190, 50, 34, 0x3a2f55],
    [175, -160, 60, 46, 0x33294c],
    [85, -215, 36, 18, 0x4a3a64],
    [230, -200, 80, 60, 0x2c2444],
  ];
  for (const [x, z, radius, height, color] of rocks) {
    const rock = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 6, 1), flat(color));
    rock.position.set(x, SEA_Y + height / 2 - 1, z);
    rock.rotation.y = random() * 3;
    rock.scale.z = 0.7;
    group.add(rock);
  }

  // Домики-коробки с горящими окнами.
  const walls = [0xd8a878, 0xc88a6a, 0xe0b890, 0xb87a62];
  const houseTextures = walls.map((wall) =>
    pixelTexture(16, 16, (ctx, w, h) => {
      ctx.fillStyle = hex(wall);
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#7a4a3a';
      ctx.fillRect(0, 0, w, 2); // крыша
      const windowRandom = seededRandom(wall);
      for (let y = 4; y < h - 2; y += 5) {
        for (let x = 2; x < w - 2; x += 5) {
          ctx.fillStyle = windowRandom() > 0.3 ? '#ffe28a' : '#4a3348';
          ctx.fillRect(x, y, 2, 3);
        }
      }
    }),
  );
  for (let i = 0; i < 20; i++) {
    const width = 5 + random() * 4;
    const height = 4 + random() * 5;
    const house = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, width),
      retro(new THREE.MeshBasicMaterial({ map: houseTextures[i % houseTextures.length] })),
    );
    const along = random();
    house.position.set(88 + along * 100, SEA_Y + 3 + along * 16 + random() * 7, -205 + along * 45 + random() * 16);
    house.rotation.y = (random() - 0.5) * 0.6;
    group.add(house);
  }
}

// ---------- Терраса ----------

function buildTerrace(group: THREE.Group): void {
  // Плиточный пол.
  const tiles = pixelTexture(32, 32, (ctx, w, h) => {
    ctx.fillStyle = '#8a6a58';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#a07c66';
    ctx.fillRect(1, 1, 14, 14);
    ctx.fillRect(17, 17, 14, 14);
    ctx.fillStyle = '#946f5c';
    ctx.fillRect(17, 1, 14, 14);
    ctx.fillRect(1, 17, 14, 14);
  });
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(14, 9);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(64, 40),
    retro(new THREE.MeshLambertMaterial({ map: tiles })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR_Y, EDGE_Z + 20);
  group.add(floor);

  const stone = flat(0xb8a898);
  const stoneDark = flat(0x9a8a80);

  // Балюстрада: основание, балясины, перила.
  const railTop = FLOOR_Y + 3;
  const base = new THREE.Mesh(new THREE.BoxGeometry(64, 0.5, 1.2), stoneDark);
  base.position.set(0, FLOOR_Y + 0.25, EDGE_Z);
  group.add(base);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(64, 0.45, 1.3), stone);
  rail.position.set(0, railTop, EDGE_Z);
  group.add(rail);
  const count = 44;
  const balusters = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.36, railTop - FLOOR_Y - 0.6, 6), stone, count);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    matrix.setPosition(-31 + (i * 62) / (count - 1), (FLOOR_Y + railTop) / 2 + 0.05, EDGE_Z);
    balusters.setMatrixAt(i, matrix);
  }
  group.add(balusters);

  // Колонны и арки над ними.
  const columnXs = [-27, -9.5, 9.5, 27];
  const archBase = 8.2;
  for (const x of columnXs) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1, archBase - FLOOR_Y, 8), stone);
    column.position.set(x, (archBase + FLOOR_Y) / 2, EDGE_Z);
    group.add(column);
    const capital = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.7, 2.2), stoneDark);
    capital.position.set(x, archBase, EDGE_Z);
    group.add(capital);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.8, 2.2), stoneDark);
    plinth.position.set(x, FLOOR_Y + 0.4, EDGE_Z);
    group.add(plinth);
  }
  for (let i = 0; i < columnXs.length - 1; i++) {
    const left = columnXs[i];
    const right = columnXs[i + 1];
    const middle = (left + right) / 2;
    const halfWidth = (right - left) / 2;
    const rise = CEILING_Y - archBase - 0.6;
    const segments = 10;
    for (let s = 0; s < segments; s++) {
      const a0 = Math.PI - (s / segments) * Math.PI;
      const a1 = Math.PI - ((s + 1) / segments) * Math.PI;
      const x0 = middle + Math.cos(a0) * halfWidth;
      const y0 = archBase + Math.sin(a0) * rise;
      const x1 = middle + Math.cos(a1) * halfWidth;
      const y1 = archBase + Math.sin(a1) * rise;
      // Заполняем стену над дугой: четырёхугольник от дуги до потолка.
      const piece = new FacetBuilder()
        .quad(
          { x: x0, y: y0, z: 0 },
          { x: x1, y: y1, z: 0 },
          { x: x1, y: CEILING_Y + 0.5, z: 0 },
          { x: x0, y: CEILING_Y + 0.5, z: 0 },
          s % 2 === 0 ? 0xa89888 : 0x9c8c7e,
        )
        .build();
      const mesh = new THREE.Mesh(piece, flatVertexColors(true));
      mesh.position.z = EDGE_Z + 0.9;
      group.add(mesh);
    }
  }

  // Потолок террасы (в тени) и боковые стены вдалеке.
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(64, 40), flat(0x4a3a3a));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CEILING_Y, EDGE_Z + 20);
  group.add(ceiling);
}

/** Зелень с красными цветами, свисающая с арки. */
function buildVines(group: THREE.Group): void {
  const random = seededRandom(5);
  const greens = [0x2f5d3a, 0x3d7044, 0x24482e, 0x4a7a3a];
  const leaves = new FacetBuilder();
  const flowerPositions: THREE.Vector3[] = [];
  // Гирлянды: точка крепления на арке и длина свисания.
  const strands: [number, number, number][] = [];
  for (let i = 0; i < 26; i++) {
    const x = -26 + random() * 24; // в основном слева, как на референсе
    strands.push([x, 9.5 + random() * 2.5, 2 + random() * 5]);
  }
  for (let i = 0; i < 9; i++) strands.push([4 + random() * 22, 10.5 + random() * 1.5, 1 + random() * 2.5]);

  for (const [x, top, length] of strands) {
    const leafCount = Math.floor(length * 3);
    for (let n = 0; n < leafCount; n++) {
      const cx = x + (random() - 0.5) * 1.6;
      const cy = top - (n / leafCount) * length + (random() - 0.5) * 0.5;
      const cz = EDGE_Z + 1.3 + random() * 0.8;
      const size = 0.45 + random() * 0.45;
      const tilt = (random() - 0.5) * 1.2;
      const color = greens[Math.floor(random() * greens.length)];
      leaves.quad(
        { x: cx - size, y: cy + tilt * size, z: cz },
        { x: cx, y: cy - size, z: cz + 0.15 },
        { x: cx + size, y: cy - tilt * size, z: cz },
        { x: cx, y: cy + size, z: cz + 0.1 },
        color,
      );
      if (random() > 0.86) flowerPositions.push(new THREE.Vector3(cx, cy, cz + 0.3));
    }
  }
  group.add(new THREE.Mesh(leaves.build(), flatVertexColors(true)));

  const flowers = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.28, 0), glow(0xc82a3a), flowerPositions.length);
  const matrix = new THREE.Matrix4();
  flowerPositions.forEach((position, index) => {
    matrix.setPosition(position);
    flowers.setMatrixAt(index, matrix);
  });
  group.add(flowers);
}

/** Пальма в терракотовом горшке. */
function buildPalm(): THREE.Group {
  const palm = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.2, 2.8, 7), flat(0xb0603a));
  pot.position.y = 1.4;
  palm.add(pot);
  const potRim = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 0.4, 7), flat(0xc4704a));
  potRim.position.y = 2.8;
  palm.add(potRim);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 5, 5), flat(0x5a4030));
  trunk.position.y = 5.2;
  palm.add(trunk);

  // Листья: полосы из нескольких звеньев, выгибаются наружу и вниз.
  const random = seededRandom(9);
  const fronds = new FacetBuilder();
  const greens = [0x2f6a3a, 0x3d7a44, 0x285a34];
  const frondCount = 11;
  for (let f = 0; f < frondCount; f++) {
    const angle = (f / frondCount) * Math.PI * 2 + random() * 0.4;
    const length = 6 + random() * 2.5;
    const lift = 1.5 + random() * 2;
    const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    const segments = 5;
    let previous: [THREE.Vector3, THREE.Vector3] | null = null;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const centerPoint = new THREE.Vector3(0, 7.6, 0)
        .addScaledVector(direction, t * length)
        .add(new THREE.Vector3(0, lift * Math.sin(t * Math.PI * 0.6) - t * t * 4.5, 0));
      const width = 0.9 * Math.sin(Math.max(0.08, t) * Math.PI * 0.95) + 0.08;
      const current: [THREE.Vector3, THREE.Vector3] = [
        centerPoint.clone().addScaledVector(side, width),
        centerPoint.clone().addScaledVector(side, -width),
      ];
      if (previous) {
        fronds.quad(previous[0], previous[1], current[1], current[0], greens[(f + s) % greens.length]);
      }
      previous = current;
    }
  }
  palm.add(new THREE.Mesh(fronds.build(), flatVertexColors(true)));
  return palm;
}

/** Приставной столик с бутылкой и бокалами. */
function buildSideTable(): THREE.Group {
  const table = new THREE.Group();
  const wood = flat(PALETTE.wood);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.2, 6), wood);
  top.position.y = 2.9;
  table.add(top);
  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.8, 5), flat(PALETTE.woodDark));
  leg.position.y = 1.4;
  table.add(leg);
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1, 0.15, 6), flat(PALETTE.woodDark));
  foot.position.y = 0.08;
  table.add(foot);

  const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.3, 6), flat(0x2a4a34));
  bottle.position.set(-0.4, 3.65, -0.2);
  table.add(bottle);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 0.7, 6), flat(0x2a4a34));
  neck.position.set(-0.4, 4.65, -0.2);
  table.add(neck);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.45, 6), flat(0xd9d2b8));
  label.position.set(-0.4, 3.6, -0.2);
  table.add(label);

  const glass = retro(new THREE.MeshLambertMaterial({ color: 0xcfe0e0, transparent: true, opacity: 0.55, flatShading: true }));
  for (const [x, z] of [[0.55, 0.25], [0.25, -0.7]]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.2, 0.55, 6), glass);
    cup.position.set(x, 3.28, z);
    table.add(cup);
    const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.2, 6), glow(0xc8843a));
    drink.position.set(x, 3.14, z);
    table.add(drink);
  }
  return table;
}

/** Кованый фонарь над столом — главный источник света. */
function buildLantern(group: THREE.Group): (time: number) => void {
  const lantern = new THREE.Group();
  const iron = flat(0x1c1612);
  const y = 6.3;

  const chain = new THREE.Mesh(new THREE.BoxGeometry(0.12, CEILING_Y - y - 1.2, 0.12), iron);
  chain.position.y = (CEILING_Y + y + 1.2) / 2;
  lantern.add(chain);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.8, 4), iron);
  cap.position.y = y + 0.95;
  cap.rotation.y = Math.PI / 4;
  lantern.add(cap);
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.42, 1.1, 4),
    glow(0xe0a850, { fog: false }),
  );
  glass.position.y = y;
  glass.rotation.y = Math.PI / 4;
  lantern.add(glass);
  // Четыре кованые стойки по углам.
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.2, 0.1), iron);
    post.position.set(Math.cos(angle) * 0.56, y, Math.sin(angle) * 0.56);
    post.rotation.z = Math.cos(angle) * 0.17;
    post.rotation.x = -Math.sin(angle) * 0.17;
    lantern.add(post);
  }
  const bottom = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.45, 4), iron);
  bottom.position.y = y - 0.75;
  bottom.rotation.set(Math.PI, Math.PI / 4, 0);
  lantern.add(bottom);
  const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), glow(0xfff2c0, { fog: false }));
  flame.position.y = y - 0.05;
  lantern.add(flame);

  const light = new THREE.PointLight(PALETTE.lantern, 1, 60, 1.1);
  light.position.set(0, y - 0.4, 0);
  lantern.add(light);
  lantern.position.z = -1.2;
  group.add(lantern);

  return (time) => {
    // Мерцание пламени: несколько волн разной частоты.
    const flicker = 1 + Math.sin(time * 9.1) * 0.04 + Math.sin(time * 23.7) * 0.03 + Math.sin(time * 3.3) * 0.05;
    light.intensity = 34 * flicker;
    flame.scale.setScalar(0.9 + (flicker - 1) * 3);
    flame.rotation.y = time * 2;
  };
}

export function buildLocation(scene: THREE.Scene): Location {
  const group = new THREE.Group();

  buildSky(group);
  const updateSea = buildSea(group);
  buildBoatAndTown(group);
  buildTerrace(group);
  buildVines(group);

  const palm = buildPalm();
  palm.position.set(-17.5, FLOOR_Y, -8.5);
  group.add(palm);

  const sideTable = buildSideTable();
  sideTable.position.set(-12, FLOOR_Y, -3.5);
  group.add(sideTable);

  const updateLantern = buildLantern(group);

  // Свет: тёплое небо сверху, закат со стороны моря, фонарь над столом.
  group.add(new THREE.HemisphereLight(0xffd0b8, 0x3a2a48, 1.3));
  const sunset = new THREE.DirectionalLight(0xff8a5a, 1.1);
  sunset.position.set(0, 6, -30);
  group.add(sunset);

  // Тёплая закатная дымка вместо серого тумана.
  scene.fog = new THREE.Fog(0xd87a5a, 60, 420);
  scene.background = new THREE.Color(0x231d48);

  return {
    group,
    update(time) {
      updateSea(time);
      updateLantern(time);
    },
  };
}
