// Локация: терраса виллы у моря на закате (модели из 3D-сессии, см. sunset.ts) и люстра над столом.
//
// Пока модели грузятся, вокруг стола — только тёплый закатный фон (без прежней «кодовой» террасы:
// её старые текстуры мелькали при запуске, а сама она строилась долго и зря).

import * as THREE from 'three';
import { createLoader } from './loader';
import { gfx, smooth } from './gfx';
import { AMBIENT_COLOR, LANTERN_POSITIONS, SUN_COLOR, SUN_DIRECTION, loadSunsetScene, mergeStatic } from './sunset';
import { METRE } from './table';

const CEILING_Y = 12.5;
/** Лампа включена: свет тёплый и ярче. */
const LAMP_COLOR = new THREE.Color(0xffb35a);
const LAMP_LIGHT = 64;
/** Лампа выключена: ровный белый свет над столом (сукно и карты — естественных цветов). */
const PLAIN_COLOR = new THREE.Color(0xfff6ee);
const PLAIN_LIGHT = 36;
/** Свет сцены заката: солнце, общий свет, небо и фонари на балюстраде. */
const SUN_LIGHT = 2.2;
const AMBIENT_LIGHT = 1.6;
const SKY_LIGHT = 0.9;
const LANTERN_LIGHT = 30;
/** Цвет неба, пока сцена заката грузится. */
const LOADING_SKY = 0x5a2f55;

export interface Location {
  group: THREE.Group;
  /** Сцена заката загрузилась (или не загрузилась — тогда остаётся закатный фон). */
  ready: Promise<void>;
  /** Вызывать каждый кадр: мерцание света. `time` — в секундах. */
  update(time: number): void;
}

/**
 * Локация: ближняя часть сцены заката — в `scene`, дальний фон — в `background` (рисуется отдельно).
 */
export function buildLocation(scene: THREE.Scene, background: THREE.Scene): Location {
  const group = new THREE.Group();
  // На телефоне каждый точечный свет заметно греет: фонари на балюстраде — только на компьютере.
  const mobile = window.matchMedia('(pointer: coarse)').matches;

  // Над столом — воксельная люстра из 3D-сессии (public/models/chandelier_voxel.glb).
  // Люстра в метрах: точка крепления — начало координат, висит вниз на 0.80 м.
  // Масштаб сцены (METRE); крепление на 1.6 м выше сукна, низ — на 0.8 м.
  const metre = METRE;
  const attachY = 1.6 * metre;
  const chandelier = new THREE.Group();
  chandelier.position.set(0, attachY, 0);
  // По имени её прячет камера раздачи (вид сверху), чтобы люстра не закрывала стол.
  chandelier.name = 'chandelier';
  group.add(chandelier);
  createLoader().load(
    `${import.meta.env.BASE_URL}models/chandelier_voxel.glb`,
    (gltf) => {
      gltf.scene.scale.setScalar(metre);
      // Цепь от крепления люстры до потолка — одним куском (одна отрисовка вместо двадцати).
      const chain = new THREE.Group();
      const linkGeometry = new THREE.TorusGeometry(0.13, 0.035, 6, 10);
      const linkMaterial = smooth(0x3a2a16, 30);
      for (let y = attachY + 0.21; y < CEILING_Y; y += 0.42) {
        const link = new THREE.Mesh(linkGeometry, linkMaterial);
        link.position.set(0, y - attachY, 0);
        link.rotation.y = (Math.round(y / 0.42) % 2) * (Math.PI / 2);
        chain.add(link);
      }
      for (const part of [mergeStatic(gltf.scene), mergeStatic(chain)]) {
        part.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (!mesh.isMesh) return;
          mesh.castShadow = false; // тень люстры легла бы пятном на сукно
          mesh.receiveShadow = false;
        });
        chandelier.add(part);
      }
    },
    undefined,
    (error) => console.warn('Люстра не загрузилась', error),
  );

  // Главный свет — точка прямо под люстрой, на 0.86 м ниже крепления: он освещает сукно.
  const light = new THREE.PointLight(0xffb35a, 1, 70, 1.1);
  light.position.set(0, attachY - 0.86 * metre, 0);
  group.add(light);

  // Пока сцена заката грузится — тёплое закатное небо и мягкий общий свет вокруг стола.
  scene.background = new THREE.Color(LOADING_SKY);
  const loadingLight = new THREE.HemisphereLight(0xffd0b8, 0x4a3a58, 1.25);
  group.add(loadingLight);

  const lanterns: THREE.PointLight[] = [];
  const ready = loadSunsetScene()
    .then(({ near, far }) => {
      group.remove(loadingLight);
      scene.background = null; // небо теперь рисуется дальним фоном
      group.add(near);
      background.add(far);
      // Свет заката: низкое солнце со стороны моря и общий тёплый свет неба — в обеих сценах.
      for (const target of [group, background]) {
        const sun = new THREE.DirectionalLight(SUN_COLOR, SUN_LIGHT);
        sun.position.copy(SUN_DIRECTION).multiplyScalar(60);
        target.add(sun);
        target.add(new THREE.AmbientLight(AMBIENT_COLOR, AMBIENT_LIGHT));
        target.add(new THREE.HemisphereLight(0xffb48a, 0x3a2440, SKY_LIGHT));
      }
      if (!mobile) {
        for (const position of LANTERN_POSITIONS) {
          const lantern = new THREE.PointLight(0xffb35a, LANTERN_LIGHT, 45, 1.2);
          lantern.position.copy(position);
          lanterns.push(lantern);
          group.add(lantern);
        }
      }
    })
    .catch((error) => console.warn('Сцена заката не загрузилась — остаётся закатный фон', error));

  return {
    group,
    ready,
    update(time) {
      // Мерцание пламени: несколько волн разной частоты.
      const flicker = 1 + Math.sin(time * 9.1) * 0.04 + Math.sin(time * 23.7) * 0.03 + Math.sin(time * 3.3) * 0.05;
      // Лампа выключена — ровный белый свет без мерцания; включена — тёплый, ярче, мерцает.
      light.color.copy(gfx.lamp ? LAMP_COLOR : PLAIN_COLOR);
      light.intensity = gfx.lamp ? LAMP_LIGHT * flicker : PLAIN_LIGHT;
      lanterns.forEach((lantern, i) => {
        lantern.intensity = LANTERN_LIGHT * (1 + Math.sin(time * (6 + i) + i * 3) * 0.06);
      });
    },
  };
}
