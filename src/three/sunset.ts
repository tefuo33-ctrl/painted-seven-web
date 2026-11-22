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
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createLoader } from './loader';
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

/** Общие материалы светящихся частей фона (небо — отдельно: его видно изнутри). */
const GLOW_MATERIALS: { sky?: THREE.MeshBasicMaterial; glow?: THREE.MeshBasicMaterial } = {};

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
      // Материал общий на всех: тогда облака, море и солнце склеиваются в одну отрисовку.
      if (!GLOW_MATERIALS[sky ? 'sky' : 'glow']) {
        GLOW_MATERIALS[sky ? 'sky' : 'glow'] = new THREE.MeshBasicMaterial({
          vertexColors: true,
          fog: false,
          depthWrite: !sky,
          side: sky ? THREE.DoubleSide : THREE.FrontSide,
        });
      }
      mesh.material = GLOW_MATERIALS[sky ? 'sky' : 'glow']!;
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
  const loader = createLoader();
  const load = (file: string) => loader.loadAsync(`${BASE}${file}.glb`).then((gltf) => gltf.scene);
  const [nearModels, farModels] = await Promise.all([
    Promise.all(NEAR_FILES.map(load)),
    Promise.all(FAR_FILES.map(load)),
  ]);
  const near = sceneRoot();
  nearModels.forEach((model) => {
    prepare(model, true);
    near.inner.add(mergeStatic(model));
  });
  const far = sceneRoot();
  farModels.forEach((model) => {
    prepare(model, false);
    far.inner.add(mergeStatic(model));
  });
  return { near: near.outer, far: far.outer };
}

/**
 * Склеить неподвижную модель: все её куски с одинаковым материалом (и настройками теней)
 * становятся одним мешем. Сотни отдельных домиков, облаков и звеньев цепи — это сотни отрисовок
 * в каждом кадре; после склейки их несколько десятков. Возвращает группу с тем же положением,
 * поворотом и масштабом, что у `root`.
 */
export function mergeStatic(root: THREE.Object3D): THREE.Group {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert();
  const buckets = new Map<string, { material: THREE.Material; mesh: THREE.Mesh; geometries: THREE.BufferGeometry[] }>();
  const keep: THREE.Object3D[] = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.SkinnedMesh).isSkinnedMesh || Array.isArray(mesh.material) || mesh.geometry.morphAttributes.position) {
      keep.push(mesh);
      return;
    }
    let geometry = mesh.geometry.clone();
    geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld));
    // Склеивать можно только одинаково устроенные геометрии: все с индексами и с теми же атрибутами.
    if (!geometry.index) {
      const count = geometry.attributes.position.count;
      const index = new (count > 65535 ? Uint32Array : Uint16Array)(count);
      for (let i = 0; i < count; i++) index[i] = i;
      geometry.setIndex(new THREE.BufferAttribute(index, 1));
    }
    for (const name of Object.keys(geometry.attributes)) {
      const attribute = geometry.attributes[name];
      if ((attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute) {
        geometry = geometry.toNonIndexed();
        break;
      }
    }
    const signature = Object.keys(geometry.attributes)
      .sort()
      .map((name) => {
        const attribute = geometry.attributes[name] as THREE.BufferAttribute;
        return `${name}:${attribute.itemSize}:${attribute.normalized}:${attribute.array.constructor.name}`;
      })
      .join(',');
    const key = `${mesh.material.uuid}|${signature}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}|${mesh.visible}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { material: mesh.material, mesh, geometries: [] };
      buckets.set(key, bucket);
    }
    bucket.geometries.push(geometry);
  });

  const group = new THREE.Group();
  group.position.copy(root.position);
  group.quaternion.copy(root.quaternion);
  group.scale.copy(root.scale);
  group.name = root.name;
  for (const { material, mesh, geometries } of buckets.values()) {
    const merged = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, false);
    // Не склеилось (такого быть не должно) — каждый кусок отдельным мешем, как было.
    for (const geometry of merged ? [merged] : geometries) {
      const result = new THREE.Mesh(geometry, material);
      result.castShadow = mesh.castShadow;
      result.receiveShadow = mesh.receiveShadow;
      result.renderOrder = mesh.renderOrder;
      result.visible = mesh.visible;
      result.name = mesh.name;
      group.add(result);
    }
  }
  // То, что склеить нельзя, переносим как есть (в координатах root).
  for (const object of keep) {
    const copy = object.clone();
    copy.matrixAutoUpdate = false;
    copy.matrix.multiplyMatrices(toRoot, object.matrixWorld);
    group.add(copy);
  }
  return group;
}
