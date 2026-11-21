// Сцена с закатом из 3D-сессии (assets/3d/export/environment/background/, копия в public/models/scene/).
//
// Все модели — в метрах, в одной системе координат glTF (Y вверх, море — в сторону -Z).
// Стол в этой системе стоит в точке (0, 0, 2.3), сукно на высоте 0.72 м. В игре сукно на y = 0,
// центр стола — в начале координат, 1 метр = METRE единиц. Поэтому всё сдвигаем на (0, -0.72, -2.3)
// и масштабируем на METRE.
//
// Сцена делится на две части:
//  - ближняя (терраса: пол, балюстрада, колонны с аркой, лоза, фонари, вазоны) — в основной сцене;
//  - дальняя (небо, море, солнце, облака, город, остров, горы, парусник) — до 7 км; её рисуем
//    отдельной сценой и отдельной камерой с большой дальностью, чтобы не потерять точность глубины.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { METRE } from './table';

const BASE = `${import.meta.env.BASE_URL}models/scene/`;
/**
 * На сколько метров стол со стульями стоит дальше от балюстрады, чем в сцене Blender:
 * так с места игрока видны колонны с аркой по бокам, без приближения.
 */
const SCENE_SHIFT = 2.4;
/** На сколько метров терраса сдвинута вправо: стол с игроками в кадре на 5 % левее. */
const SCENE_SIDE = 0.65;
const NEAR_FILES = ['terrace'];
const FAR_FILES = ['bg_sky', 'bg_sea', 'bg_sun', 'bg_clouds', 'bg_far', 'bg_left_island', 'bg_right_town', 'bg_sailboat'];

/** Перевод из метров сцены в координаты игры. */
function sceneRoot(): { outer: THREE.Group; inner: THREE.Group } {
  const outer = new THREE.Group();
  outer.scale.setScalar(METRE);
  const inner = new THREE.Group();
  inner.position.set(SCENE_SIDE, -0.72, -2.3 - SCENE_SHIFT);
  outer.add(inner);
  return { outer, inner };
}

/** Точка из метров сцены (glTF) в координаты игры. */
export function fromScene(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3((x + SCENE_SIDE) * METRE, (y - 0.72) * METRE, (z - 2.3 - SCENE_SHIFT) * METRE);
}

/** Свет заката (из layout.json → lighting_sunset). Солнце — низко над морем, за столом. */
export const SUN_DIRECTION = new THREE.Vector3(0, 65.5, -3500).normalize();
export const SUN_COLOR = new THREE.Color(0.99, 0.5475, 0.25875);
export const AMBIENT_COLOR = new THREE.Color('#8a2c44');
/** Тёплые огни двух фонарей на тумбах балюстрады (layout.json → terrace.lantern_lights). */
export const LANTERN_POSITIONS = [fromScene(-2.74, 1.35, 0), fromScene(2.74, 1.35, 0)];

export interface SunsetScene {
  near: THREE.Group;
  far: THREE.Group;
}

function prepare(model: THREE.Object3D, near: boolean): void {
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as THREE.MeshStandardMaterial;
    const glowColors = mesh.geometry.getAttribute('color_1');
    if (glowColors) {
      // Небо, море с дорожкой, солнце и облака светятся сами: их цвет — во втором наборе
      // цветов вершин (COLOR_1), первый набор у них белый. Освещение на них не действует.
      mesh.geometry.setAttribute('color', glowColors);
      mesh.geometry.deleteAttribute('color_1');
      const sky = material.name.startsWith('PreviewSky');
      // Купол неба смотрит гранями наружу, а мы внутри него — рисуем обе стороны.
      mesh.material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        fog: false,
        depthWrite: !sky,
        side: sky ? THREE.DoubleSide : THREE.FrontSide,
      });
      if (sky) mesh.renderOrder = -1;
    }
    // Полированный пол (шероховатость 0.08) в игре даёт слепящий блик от света над столом —
    // делаем поверхности чуть матовее.
    const standard = mesh.material as THREE.MeshStandardMaterial;
    if (standard.isMeshStandardMaterial && standard.roughness < 0.5) standard.roughness = 0.5;
    mesh.castShadow = false;
    mesh.receiveShadow = near; // тени от людей и стола ложатся на пол террасы
  });
}

/** Загрузить сцену заката. Если хоть один файл не загрузился — ошибка (останется прежняя локация). */
export async function loadSunsetScene(): Promise<SunsetScene> {
  const loader = new GLTFLoader();
  const load = (file: string) => loader.loadAsync(`${BASE}${file}.glb`).then((gltf) => gltf.scene);
  const [nearModels, farModels] = await Promise.all([
    Promise.all(NEAR_FILES.map(load)),
    Promise.all(FAR_FILES.map(load)),
  ]);
  const near = sceneRoot();
  nearModels.forEach((model) => {
    prepare(model, true);
    near.inner.add(model);
  });
  const far = sceneRoot();
  farModels.forEach((model) => {
    prepare(model, false);
    far.inner.add(model);
  });
  return { near: near.outer, far: far.outer };
}
