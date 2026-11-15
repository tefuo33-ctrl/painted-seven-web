// Локация: терраса виллы у моря на закате. Всё собрано кодом.
// Море, небо и город — неподвижный фон с несколькими планами глубины; анимируется только пламя фонарей.

import * as THREE from 'three';
import { PALETTE, glow, paintedTexture, seededRandom, smooth } from './gfx';
import { FLOOR_Y } from './table';

const SEA_Y = -11;
const EDGE_Z = -13; // край террасы с балюстрадой
const CEILING_Y = 12.5;
const SKY_Z = -260;

export interface Location {
  group: THREE.Group;
  /** Вызывать каждый кадр: мерцание фонарей. `time` — в секундах. */
  update(time: number): void;
}

function turned(profile: [number, number][], material: THREE.Material, segments = 20): THREE.Mesh {
  return new THREE.Mesh(new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments), material);
}

// ---------- Небо, солнце, море ----------

function buildSky(group: THREE.Group): void {
  const texture = paintedTexture(1024, 512, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#2a2356');
    gradient.addColorStop(0.3, '#55407f');
    gradient.addColorStop(0.55, '#a5557f');
    gradient.addColorStop(0.75, '#e4735a');
    gradient.addColorStop(0.9, '#f7a04e');
    gradient.addColorStop(1, '#ffd27a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // Сияние вокруг солнца.
    const sun = ctx.createRadialGradient(w / 2, h, 10, w / 2, h, h * 0.75);
    sun.addColorStop(0, 'rgba(255,236,170,0.95)');
    sun.addColorStop(0.25, 'rgba(255,170,90,0.5)');
    sun.addColorStop(1, 'rgba(255,120,80,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);

    // Облака: вытянутые полосы, тёмные сверху и подсвеченные закатом снизу.
    const random = seededRandom(7);
    for (let i = 0; i < 46; i++) {
      const y = h * (0.12 + random() * 0.72);
      const x = random() * w;
      const length = 60 + random() * 220;
      const thickness = 4 + random() * 12;
      const low = y / h; // ближе к горизонту — теплее
      const body = ctx.createLinearGradient(0, y - thickness, 0, y + thickness);
      body.addColorStop(0, `rgba(${60 + low * 60},${44 + low * 30},${110 - low * 10},0)`);
      body.addColorStop(0.45, `rgba(${70 + low * 80},${50 + low * 30},${118 - low * 20},0.75)`);
      body.addColorStop(0.8, `rgba(250,${150 + low * 40},100,0.8)`);
      body.addColorStop(1, 'rgba(255,170,110,0)');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(x, y, length, thickness, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(1100, 290), new THREE.MeshBasicMaterial({ map: texture, fog: false }));
  sky.position.set(0, SEA_Y + 145, SKY_Z);
  group.add(sky);

  // Солнце наполовину ушло в море.
  const sun = new THREE.Mesh(new THREE.CircleGeometry(12, 48), new THREE.MeshBasicMaterial({ color: 0xfff0b8, fog: false }));
  sun.position.set(0, SEA_Y + 3.5, SKY_Z + 2);
  group.add(sun);
}

function buildSea(group: THREE.Group): void {
  // Море — неподвижная картина: тёмная вода, мелкая рябь и дорожка света от солнца.
  const texture = paintedTexture(512, 1024, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#3a3f86'); // у горизонта светлее
    gradient.addColorStop(0.25, '#232c70');
    gradient.addColorStop(1, '#141c4c');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    const random = seededRandom(3);
    // Рябь: короткие горизонтальные штрихи, крупнее к берегу.
    for (let i = 0; i < 5200; i++) {
      const t = Math.pow(random(), 1.7);
      const y = t * h;
      const length = 2 + t * 22;
      ctx.fillStyle = random() > 0.5 ? 'rgba(120,130,210,0.16)' : 'rgba(8,10,40,0.2)';
      ctx.fillRect(random() * w, y, length, 1 + t * 1.5);
    }
    // Дорожка света: золотые блики, узкая у горизонта и широкая у берега.
    for (let i = 0; i < 2600; i++) {
      const t = Math.pow(random(), 1.3);
      const y = t * h;
      const spread = 5 + t * 62;
      const x = w / 2 + (random() + random() - 1) * spread;
      const length = 2 + t * 16;
      ctx.fillStyle = random() > 0.4 ? `rgba(255,214,130,${0.85 - t * 0.35})` : `rgba(255,150,80,${0.7 - t * 0.3})`;
      ctx.fillRect(x - length / 2, y, length, 1 + t * 1.6);
    }
  });
  const depth = -SKY_Z + 10;
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1100, depth), new THREE.MeshBasicMaterial({ map: texture }));
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, SEA_Y, SKY_Z + depth / 2 - 2);
  group.add(sea);
}

/** Дальние планы: острова и гряды гор — фон получает глубину. */
function buildHorizon(group: THREE.Group): void {
  const ridge = (x0: number, x1: number, z: number, heights: number[], color: number) => {
    const shape = new THREE.Shape();
    const step = (x1 - x0) / (heights.length - 1);
    shape.moveTo(x0, -2);
    heights.forEach((height, i) => {
      // Плавные вершины холмов.
      if (i === 0) shape.lineTo(x0, height);
      else shape.quadraticCurveTo(x0 + (i - 0.5) * step, (heights[i - 1] + height) / 2 + 3, x0 + i * step, height);
    });
    shape.lineTo(x1, -2);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 8), new THREE.MeshBasicMaterial({ color, fog: false }));
    mesh.position.set(0, SEA_Y, z);
    group.add(mesh);
  };
  ridge(120, 520, SKY_Z + 6, [8, 30, 54, 44, 70, 60, 86, 70, 96], 0x7a5690);
  ridge(70, 520, SKY_Z + 16, [3, 16, 30, 26, 46, 38, 56, 74], 0x5a4278);
  ridge(-380, -200, SKY_Z + 8, [0, 9, 17, 12, 21, 9, 0], 0x7a5690);
  ridge(-180, -105, SKY_Z + 10, [0, 6, 11, 5, 0], 0x8a6298);
}

function buildBoatAndTown(group: THREE.Group): void {
  // Парусник.
  const boat = new THREE.Group();
  const hullShape = new THREE.Shape();
  hullShape.moveTo(-3.4, 0.9);
  hullShape.lineTo(3.8, 0.9);
  hullShape.quadraticCurveTo(3.2, -0.5, 1.6, -0.6);
  hullShape.lineTo(-2.4, -0.6);
  hullShape.quadraticCurveTo(-3.3, -0.4, -3.4, 0.9);
  boat.add(new THREE.Mesh(new THREE.ShapeGeometry(hullShape), new THREE.MeshBasicMaterial({ color: 0x3a2434, fog: false })));
  const sail = (points: [number, number][], color: number) => {
    const shape = new THREE.Shape();
    points.forEach(([x, y], i) => (i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y)));
    boat.add(new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ color, fog: false, side: THREE.DoubleSide })));
  };
  sail([[0.3, 1.1], [3.4, 1.4], [0.3, 11]], 0xf6ead4);
  sail([[-0.2, 1.1], [-0.2, 8.6], [-2.8, 1.5]], 0xe2cdb4);
  boat.position.set(38, SEA_Y + 0.5, -160);
  group.add(boat);

  // Холмы побережья: тёмная зелень с лиловой дымкой.
  const random = seededRandom(21);
  const hills: [number, number, number, number, number, number][] = [
    // x, z, ширина, высота, глубина, цвет
    [150, -200, 90, 44, 50, 0x3a3558],
    [205, -170, 100, 58, 60, 0x33304f],
    [100, -222, 60, 22, 34, 0x46406a],
    [270, -205, 120, 74, 70, 0x2c2946],
  ];
  for (const [x, z, width, height, depth, color] of hills) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color }));
    hill.scale.set(width, height, depth);
    hill.position.set(x, SEA_Y - 1, z);
    group.add(hill);
  }

  // Домики: светлые стены, черепичные крыши, горящие окна.
  const wallColors = ['#e6c9a0', '#d8a882', '#f0d8b4', '#c98e70'];
  const wallTextures = wallColors.map((wall, index) =>
    paintedTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = wall;
      ctx.fillRect(0, 0, w, h);
      const shade = ctx.createLinearGradient(0, 0, 0, h);
      shade.addColorStop(0, 'rgba(255,220,170,0.25)');
      shade.addColorStop(1, 'rgba(60,30,60,0.35)');
      ctx.fillStyle = shade;
      ctx.fillRect(0, 0, w, h);
      const windowRandom = seededRandom(index + 5);
      for (let y = 18; y < h - 24; y += 34) {
        for (let x = 14; x < w - 20; x += 30) {
          const lit = windowRandom() > 0.28;
          ctx.fillStyle = lit ? '#ffe9a0' : '#4a3350';
          ctx.fillRect(x, y, 12, 18);
          if (lit) {
            ctx.fillStyle = 'rgba(255,200,110,0.35)';
            ctx.fillRect(x - 3, y - 3, 18, 24);
          }
          ctx.fillStyle = '#5a3a34';
          ctx.fillRect(x + 5.5, y, 1, 18);
        }
      }
    }),
  );
  const roof = new THREE.MeshBasicMaterial({ color: 0xa8523a });
  for (let i = 0; i < 26; i++) {
    const width = 5 + random() * 5;
    const height = 4 + random() * 6;
    const along = random();
    const house = new THREE.Group();
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(width, height, width * 0.9),
      new THREE.MeshBasicMaterial({ map: wallTextures[i % wallTextures.length] }),
    );
    walls.position.y = height / 2;
    house.add(walls);
    const top = new THREE.Mesh(new THREE.ConeGeometry(width * 0.78, width * 0.34, 4), roof);
    top.rotation.y = Math.PI / 4;
    top.position.y = height + width * 0.17;
    house.add(top);
    house.position.set(96 + along * 110, SEA_Y + 2 + along * 22 + random() * 8, -212 + along * 46 + random() * 14);
    house.rotation.y = (random() - 0.5) * 0.5;
    group.add(house);
  }
  // Кипарисы между домами.
  for (let i = 0; i < 18; i++) {
    const along = random();
    const height = 6 + random() * 7;
    const tree = new THREE.Mesh(new THREE.ConeGeometry(1 + random() * 0.6, height, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x24402e : 0x1c3426 }));
    tree.position.set(92 + along * 120, SEA_Y + 3 + along * 22 + random() * 9 + height / 2, -206 + along * 44 + random() * 16);
    group.add(tree);
  }
}

// ---------- Терраса ----------

function buildTerrace(group: THREE.Group): void {
  // Каменная плитка: тёплые плиты разного оттенка со швами.
  const tiles = paintedTexture(512, 512, (ctx, w, h) => {
    ctx.fillStyle = '#6e5446';
    ctx.fillRect(0, 0, w, h);
    const random = seededRandom(12);
    const size = w / 4;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        const tone = 150 + Math.floor(random() * 34);
        ctx.fillStyle = `rgb(${tone + 14},${tone - 28},${tone - 52})`;
        ctx.fillRect(col * size + 3, row * size + 3, size - 6, size - 6);
        // Лёгкая неровность камня.
        for (let i = 0; i < 60; i++) {
          ctx.fillStyle = random() > 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)';
          ctx.fillRect(col * size + 4 + random() * (size - 12), row * size + 4 + random() * (size - 12), 3 + random() * 8, 2 + random() * 4);
        }
      }
    }
  });
  tiles.wrapS = tiles.wrapT = THREE.RepeatWrapping;
  tiles.repeat.set(7, 4.5);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(64, 40), new THREE.MeshPhongMaterial({ map: tiles, shininess: 8, specular: 0x221a14 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, FLOOR_Y, EDGE_Z + 20);
  group.add(floor);

  const stone = smooth(0xd8c8b4, 4);
  const stoneDark = smooth(0xb8a694, 4);

  // Балюстрада: основание, точёные балясины, перила со скруглённым профилем.
  const railTop = FLOOR_Y + 3.1;
  const base = new THREE.Mesh(new THREE.BoxGeometry(64, 0.45, 1.3), stoneDark);
  base.position.set(0, FLOOR_Y + 0.22, EDGE_Z);
  group.add(base);
  const rail = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 63, 4, 10), stone);
  rail.rotation.z = Math.PI / 2;
  rail.scale.set(0.8, 1, 2);
  rail.position.set(0, railTop, EDGE_Z);
  group.add(rail);
  const balusterProfile: [number, number][] = [
    [0.3, 0], [0.32, 0.12], [0.16, 0.3], [0.2, 0.55], [0.36, 0.95], [0.4, 1.2], [0.3, 1.55], [0.15, 1.95], [0.2, 2.15], [0.3, 2.3], [0.3, 2.45],
  ];
  const balusterGeometry = new THREE.LatheGeometry(balusterProfile.map(([r, y]) => new THREE.Vector2(r, y)), 12);
  const count = 52;
  const balusters = new THREE.InstancedMesh(balusterGeometry, stone, count);
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    matrix.setPosition(-31 + (i * 62) / (count - 1), FLOOR_Y + 0.42, EDGE_Z);
    balusters.setMatrixAt(i, matrix);
  }
  group.add(balusters);

  // Колонны с базой и капителью; арки между ними.
  const columnXs = [-27, -9.5, 9.5, 27];
  const archBase = 8.2;
  const height = archBase - FLOOR_Y;
  for (const x of columnXs) {
    const column = turned(
      [
        [1.25, 0], [1.25, 0.5], [1.05, 0.62], [1.1, 0.9], [0.92, 1.05], [0.86, height * 0.5], [0.8, height - 1.1],
        [0.95, height - 0.95], [0.9, height - 0.7], [1.2, height - 0.45], [1.3, height - 0.1], [1.3, height],
      ],
      stone,
      24,
    );
    column.position.set(x, FLOOR_Y, EDGE_Z);
    group.add(column);
  }
  for (let i = 0; i < columnXs.length - 1; i++) {
    const left = columnXs[i];
    const right = columnXs[i + 1];
    const middle = (left + right) / 2;
    const halfWidth = (right - left) / 2;
    const rise = CEILING_Y - archBase - 0.7;
    // Стена над аркой: прямоугольник с вырезанным полукругом.
    const wall = new THREE.Shape();
    wall.moveTo(-halfWidth, 0);
    wall.lineTo(-halfWidth, CEILING_Y - archBase + 0.6);
    wall.lineTo(halfWidth, CEILING_Y - archBase + 0.6);
    wall.lineTo(halfWidth, 0);
    wall.lineTo(halfWidth - 0.9, 0);
    wall.absellipse(0, 0, halfWidth - 0.9, rise, 0, Math.PI, false);
    wall.lineTo(-halfWidth, 0);
    const arch = new THREE.Mesh(new THREE.ExtrudeGeometry(wall, { depth: 1.5, bevelEnabled: false, curveSegments: 32 }), stoneDark);
    arch.position.set(middle, archBase, EDGE_Z - 0.75);
    group.add(arch);
  }

  // Потолок террасы с тёмными балками.
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(64, 40), smooth(0x5a4640, 0));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, CEILING_Y, EDGE_Z + 20);
  group.add(ceiling);
  for (let i = 0; i < 6; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(64, 0.5, 0.7), smooth(0x3a2a22, 6));
    beam.position.set(0, CEILING_Y - 0.25, EDGE_Z + 3 + i * 6.5);
    group.add(beam);
  }
}

/** Бугенвиллея: густая зелень с гроздьями красных цветов, свисающая с арок. */
function buildVines(group: THREE.Group): void {
  const random = seededRandom(5);
  const leafGeometry = new THREE.SphereGeometry(0.34, 6, 4);
  leafGeometry.scale(1, 0.32, 0.62);
  const leaves: THREE.Matrix4[] = [];
  const leafColors: THREE.Color[] = [];
  const flowers: THREE.Matrix4[] = [];
  const greens = [0x2f5d3a, 0x3d7044, 0x24482e, 0x4a7a3a, 0x356a40];
  const dummy = new THREE.Object3D();

  // Гирлянды: точка крепления на арке и длина свисания. Слева гуще, как на референсе.
  const strands: [number, number, number][] = [];
  for (let i = 0; i < 44; i++) strands.push([-27 + random() * 25, 9.3 + random() * 2.8, 2 + random() * 5.5]);
  for (let i = 0; i < 16; i++) strands.push([4 + random() * 23, 10.4 + random() * 1.6, 1 + random() * 2.8]);

  for (const [x, top, length] of strands) {
    const count = Math.floor(length * 7);
    for (let n = 0; n < count; n++) {
      const t = n / count;
      dummy.position.set(
        x + (random() - 0.5) * (1.9 - t * 0.9) + Math.sin(t * 5 + x) * 0.3,
        top - t * length + (random() - 0.5) * 0.4,
        EDGE_Z + 1.1 + random() * 1.1,
      );
      dummy.rotation.set(random() * 3, random() * 3, random() * 3);
      dummy.scale.setScalar(0.7 + random() * 0.8);
      dummy.updateMatrix();
      leaves.push(dummy.matrix.clone());
      leafColors.push(new THREE.Color(greens[Math.floor(random() * greens.length)]));
      if (random() > 0.8) {
        // Гроздь цветов.
        for (let k = 0; k < 3; k++) {
          dummy.position.x += (random() - 0.5) * 0.5;
          dummy.position.y += (random() - 0.5) * 0.4;
          dummy.position.z += 0.25;
          dummy.scale.setScalar(0.5 + random() * 0.4);
          dummy.updateMatrix();
          flowers.push(dummy.matrix.clone());
        }
      }
    }
  }
  const leafMesh = new THREE.InstancedMesh(leafGeometry, new THREE.MeshLambertMaterial(), leaves.length);
  leaves.forEach((m, i) => {
    leafMesh.setMatrixAt(i, m);
    leafMesh.setColorAt(i, leafColors[i]);
  });
  group.add(leafMesh);
  const flowerMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 6, 5), glow(0xd22a44), flowers.length);
  flowers.forEach((m, i) => flowerMesh.setMatrixAt(i, m));
  group.add(flowerMesh);
}

/** Пальма в терракотовой вазе. */
function buildPalm(): THREE.Group {
  const palm = new THREE.Group();
  const terracotta = smooth(0xb8643c, 10);
  palm.add(
    turned(
      [[0.9, 0], [1.1, 0.15], [1.0, 0.4], [1.3, 0.9], [1.9, 1.9], [2.05, 2.5], [1.75, 2.85], [1.9, 3.0], [2.1, 3.05], [2.1, 3.25], [1.7, 3.25], [1.6, 3.0]],
      terracotta,
      24,
    ),
  );
  const soil = new THREE.Mesh(new THREE.CircleGeometry(1.65, 20), smooth(0x3a2a1c, 0));
  soil.rotation.x = -Math.PI / 2;
  soil.position.y = 3.1;
  palm.add(soil);
  // Ствол из сегментов.
  for (let i = 0; i < 7; i++) {
    const segment = new THREE.Mesh(new THREE.CylinderGeometry(0.34 - i * 0.012, 0.42 - i * 0.012, 0.85, 10), smooth(i % 2 ? 0x6a4a34 : 0x5a3e2c, 4));
    segment.position.set(Math.sin(i * 0.5) * 0.08, 3.4 + i * 0.78, 0);
    palm.add(segment);
  }

  // Листья: дуга из центрального стебля и множества узких листочков по обе стороны.
  const random = seededRandom(9);
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  const triangle = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, hexColor: number) => {
    color.setHex(hexColor);
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      colors.push(color.r, color.g, color.b);
    }
  };
  const greens = [0x2f6a3a, 0x3d7a44, 0x285a34, 0x4a8a48];
  const frondCount = 13;
  for (let f = 0; f < frondCount; f++) {
    const angle = (f / frondCount) * Math.PI * 2 + random() * 0.4;
    const length = 6.5 + random() * 2.5;
    const lift = 1.6 + random() * 2.2;
    const direction = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    const steps = 16;
    const point = (t: number) =>
      new THREE.Vector3(0, 9.0, 0)
        .addScaledVector(direction, t * length)
        .add(new THREE.Vector3(0, lift * Math.sin(t * Math.PI * 0.6) - t * t * 4.6, 0));
    for (let s = 0; s < steps; s++) {
      const a = point(s / steps);
      const b = point((s + 1) / steps);
      const reach = 1.5 * Math.sin(Math.max(0.06, s / steps) * Math.PI * 0.95) + 0.1;
      const green = greens[(f + s) % greens.length];
      for (const sign of [1, -1]) {
        // Листочек: узкий треугольник от стебля наружу и чуть вниз.
        const tip = a.clone().addScaledVector(side, sign * reach).addScaledVector(direction, 0.5).add(new THREE.Vector3(0, -0.45 * reach, 0));
        triangle(a, b, tip, green);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  palm.add(new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  return palm;
}

/** Фонарь: кованая рамка и тёплое стекло. Возвращает пламя для мерцания. */
function buildLamp(scale = 1): { lamp: THREE.Group; flame: THREE.Mesh } {
  const lamp = new THREE.Group();
  const iron = smooth(0x1c1612, 30);
  lamp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.4, 1.1, 6), glow(0xf0b050, { fog: false, transparent: true, opacity: 0.92 })));
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.16, 6), iron);
    post.position.set(Math.cos(angle) * 0.5, 0, Math.sin(angle) * 0.5);
    post.rotation.z = Math.cos(angle) * 0.14;
    post.rotation.x = -Math.sin(angle) * 0.14;
    lamp.add(post);
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.82, 0.62, 6), iron);
  cap.position.y = 0.86;
  lamp.add(cap);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), iron);
  knob.position.y = 1.22;
  lamp.add(knob);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 0.08, 6), iron);
  rim.position.y = 0.56;
  lamp.add(rim);
  const bottom = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.2, 0.3, 6), iron);
  bottom.position.y = -0.7;
  lamp.add(bottom);
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), glow(0xfff4cc, { fog: false }));
  flame.scale.y = 1.4;
  lamp.add(flame);
  lamp.scale.setScalar(scale);
  return { lamp, flame };
}

/** Приставной столик с фонарём, бутылкой и бокалами. */
function buildSideTable(): { table: THREE.Group; flame: THREE.Mesh } {
  const table = new THREE.Group();
  table.add(turned([[0.01, 2.75], [1.55, 2.75], [1.6, 2.85], [1.55, 2.98], [0.01, 2.98]], smooth(0x4a2a18, 40), 28));
  table.add(turned([[0.22, 2.75], [0.3, 2.3], [0.16, 1.6], [0.26, 0.7], [0.7, 0.2], [1.0, 0.08], [1.0, 0], [0.01, 0]], smooth(0x321c10, 30), 16));

  const { lamp, flame } = buildLamp(0.72);
  lamp.position.set(-0.55, 3.72, 0.3);
  table.add(lamp);

  const bottle = turned([[0.01, 0], [0.3, 0], [0.32, 0.9], [0.24, 1.15], [0.11, 1.4], [0.1, 1.85], [0.13, 1.9], [0.01, 1.9]], smooth(0x24452e, 90), 14);
  bottle.position.set(0.5, 2.98, -0.45);
  table.add(bottle);
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.325, 0.325, 0.42, 14), smooth(0xe6ddc4, 4));
  label.position.set(0.5, 3.5, -0.45);
  table.add(label);

  const glass = new THREE.MeshPhongMaterial({ color: 0xdcecec, transparent: true, opacity: 0.4, shininess: 100, specular: 0xffffff });
  for (const [x, z] of [[0.75, 0.4], [0.1, 0.75]]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.5, 14, 1, true), glass);
    cup.position.set(x, 3.23, z);
    table.add(cup);
    const drink = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.22, 14), glow(0xc8843a, { transparent: true, opacity: 0.9 }));
    drink.position.set(x, 3.1, z);
    table.add(drink);
  }
  return { table, flame };
}

export function buildLocation(scene: THREE.Scene): Location {
  const group = new THREE.Group();
  const flames: THREE.Mesh[] = [];

  buildSky(group);
  buildSea(group);
  buildHorizon(group);
  buildBoatAndTown(group);
  buildTerrace(group);
  buildVines(group);

  // Пальмы и кадки с кустами.
  const palm = buildPalm();
  palm.position.set(-17.5, FLOOR_Y, -8.5);
  group.add(palm);
  const palm2 = buildPalm();
  palm2.position.set(18.5, FLOOR_Y, -8);
  palm2.scale.setScalar(0.85);
  palm2.rotation.y = 1.3;
  group.add(palm2);

  const random = seededRandom(31);
  for (const x of [-14, 14, -23, 23]) {
    const planter = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.3, 1.5), smooth(0xa85a38, 8));
    planter.position.set(x, FLOOR_Y + 0.65, EDGE_Z + 1.7);
    group.add(planter);
    for (let i = 0; i < 9; i++) {
      const bush = new THREE.Mesh(new THREE.SphereGeometry(0.5 + random() * 0.3, 8, 6), new THREE.MeshLambertMaterial({ color: i % 2 === 0 ? 0x2f6a3a : 0x3d7a44 }));
      bush.position.set(x - 1 + (i % 5) * 0.5, FLOOR_Y + 1.5 + random() * 0.45, EDGE_Z + 1.7 + (random() - 0.5) * 0.5);
      group.add(bush);
    }
    for (let i = 0; i < 6; i++) {
      const flower = new THREE.Mesh(new THREE.SphereGeometry(0.14, 6, 5), glow(0xd22a44));
      flower.position.set(x - 1 + random() * 2, FLOOR_Y + 2.0 + random() * 0.3, EDGE_Z + 2.0 + random() * 0.2);
      group.add(flower);
    }
  }

  const side = buildSideTable();
  side.table.position.set(-12.5, FLOOR_Y, -5.5);
  group.add(side.table);
  flames.push(side.flame);

  // Настенные фонари на колоннах.
  for (const x of [-9.5, 9.5]) {
    const wall = buildLamp(0.7);
    wall.lamp.position.set(x, 4.9, EDGE_Z + 1.55);
    group.add(wall.lamp);
    flames.push(wall.flame);
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.9), smooth(0x1c1612, 30));
    bracket.position.set(x, 5.75, EDGE_Z + 1.1);
    group.add(bracket);
  }

  // Большой кованый фонарь над столом — главный источник света.
  const main = buildLamp(1.5);
  const lanternY = 7.9;
  main.lamp.position.set(0, lanternY, -1.2);
  group.add(main.lamp);
  flames.push(main.flame);
  for (let y = lanternY + 2.0; y < CEILING_Y; y += 0.42) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.035, 6, 10), smooth(0x1c1612, 30));
    link.position.set(0, y, -1.2);
    link.rotation.y = (Math.round(y / 0.42) % 2) * (Math.PI / 2);
    group.add(link);
  }
  const light = new THREE.PointLight(PALETTE.lantern, 1, 60, 1.1);
  light.position.set(0, lanternY - 0.8, -1.2);
  group.add(light);

  // Свет: тёплое небо сверху и закат со стороны моря. Главный свет с тенями — в stage.ts.
  group.add(new THREE.HemisphereLight(0xffd0b8, 0x4a3a58, 1.25));
  const sunset = new THREE.DirectionalLight(0xff8a5a, 0.7);
  sunset.position.set(0, 6, -30);
  group.add(sunset);

  // Тени: всё освещаемое их принимает; отбрасывают предметы на самой террасе.
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.Material;
    if (material.type === 'MeshBasicMaterial') return;
    mesh.receiveShadow = true;
    mesh.castShadow = !material.transparent;
  });

  // Тёплая закатная дымка вместо серого тумана.
  scene.fog = new THREE.Fog(0xd87a5a, 80, 520);
  scene.background = new THREE.Color(0x2a2356);

  return {
    group,
    update(time) {
      // Мерцание пламени: несколько волн разной частоты.
      const flicker = 1 + Math.sin(time * 9.1) * 0.04 + Math.sin(time * 23.7) * 0.03 + Math.sin(time * 3.3) * 0.05;
      light.intensity = 17 * flicker;
      flames.forEach((flame, i) => {
        const own = 1 + Math.sin(time * (8 + i) + i * 2) * 0.08;
        flame.scale.set(own, 1.4 * own * flicker, own);
      });
    },
  };
}
