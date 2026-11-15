// Сцена целиком: рендер, камера с вращением и зумом, свет с тенями, эффекты поверх картинки.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { gfx, updateSnap } from './gfx';
import { buildLocation } from './location';
import { type Obstacle, type OrbitView, OrbitCamera } from './orbit';
import { SEATS, buildChairs, buildChipStacks, buildTable } from './table';

/** Виньетка: края кадра слегка темнеют. */
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uStrength: { value: 0.5 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uStrength;
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      color.rgb *= 1.0 - uStrength * smoothstep(0.35, 0.85, d);
      gl_FragColor = color;
    }`,
};

export type StageView = 'table' | 'wardrobe';

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Холст, на котором рисуется сцена (для нажатий). */
  canvas: HTMLCanvasElement;
  /** Где на экране находится точка сцены: координаты в пикселях страницы. */
  toScreen(point: THREE.Vector3): { x: number; y: number; visible: boolean };
  /** Куда смотрит камера: на стол или на персонажа в «Гардеробе». */
  setView(view: StageView): void;
  /** Вернуть камеру в исходное положение. */
  resetView(): void;
  /** Игрок повернул или приблизил камеру? (тогда показываем кнопку «вернуть вид») */
  viewChanged(): boolean;
  /** Камера далеко от моего места — можно показать моего персонажа со стороны. */
  awayFromSeat(): boolean;
  /** Последнее нажатие было вращением камеры, а не кликом? */
  consumeDrag(): boolean;
  /** Применить изменённые настройки из `gfx`. */
  applySettings(): void;
  /** Добавить функцию, которая вызывается каждый кадр (time и delta — в секундах). */
  onFrame(callback: (time: number, delta: number) => void): void;
}

/** Точка, вокруг которой стоит персонаж в «Гардеробе». */
export const WARDROBE_SPOT = new THREE.Vector3(0, 0, 16);

export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.imageRendering = 'pixelated';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 1.2, 600);

  const location = buildLocation(scene);
  scene.add(location.group);
  const table = buildTable();
  scene.add(table);
  const chairs = buildChairs();
  scene.add(chairs.group);
  scene.add(buildChipStacks());

  // Главный свет с тенями: сверху и чуть со стороны заката.
  const key = new THREE.DirectionalLight(0xffc890, 1.25);
  key.position.set(-7, 17, -10);
  key.target.position.set(0, 0, 1);
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -15;
  key.shadow.camera.right = 15;
  key.shadow.camera.top = 15;
  key.shadow.camera.bottom = -15;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 50;
  key.shadow.bias = -0.0025;
  key.shadow.normalBias = 0.04;
  scene.add(key, key.target);

  // Сглаживание краёв (MSAA): без «лесенок» на картах и силуэтах.
  const composer = new EffectComposer(
    renderer,
    new THREE.WebGLRenderTarget(1, 1, { samples: 4, type: THREE.HalfFloatType }),
  );
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), gfx.bloomStrength, 0.5, 0.9);
  composer.addPass(bloom);
  const vignette = new ShaderPass(VignetteShader);
  composer.addPass(vignette);
  composer.addPass(new OutputPass());

  // ---------- Камера ----------

  let view: StageView = 'table';

  /** Обзор «за столом»: на уровне глаз сидящего игрока, стол — перед ним. */
  function tableView(aspect: number): OrbitView {
    const narrow = THREE.MathUtils.clamp((1.3 - aspect) / 0.8, 0, 1); // 1 — вертикальный телефон
    return {
      target: new THREE.Vector3(0, 0.9, -0.4),
      azimuth: 0,
      elevation: THREE.MathUtils.lerp(0.3, 0.5, narrow),
      distance: THREE.MathUtils.lerp(11.4, 15.5, narrow),
      minDistance: 4.5,
      maxDistance: 16,
      minElevation: 0.1,
      maxElevation: 1.15,
    };
  }

  function wardrobeView(aspect: number): OrbitView {
    return {
      target: new THREE.Vector3(WARDROBE_SPOT.x, -0.4, WARDROBE_SPOT.z),
      azimuth: 0,
      elevation: 0.06,
      distance: aspect < 1 ? 15.5 : 12.5,
      minDistance: 4,
      maxDistance: 18,
      minElevation: -0.15,
      maxElevation: 0.9,
    };
  }

  const orbit = new OrbitCamera(camera, renderer.domElement, tableView(1.6));

  /** Препятствия для камеры за столом: кресла соперников с сидящими в них игроками. */
  const tableObstacles: Obstacle[] = SEATS.slice(1).map((seat) => ({ x: seat.x, z: seat.z, radius: 3.3, top: 7.4 }));

  function applyView(instant: boolean): void {
    const aspect = camera.aspect;
    if (view === 'table') {
      orbit.setView(tableView(aspect), instant);
      orbit.obstacles = tableObstacles;
      orbit.maxRadius = 12.2; // дальше — балюстрада и колонны
      orbit.minHeight = 0.9;
      orbit.maxHeight = 10.5;
      camera.clearViewOffset();
    } else {
      orbit.setView(wardrobeView(aspect), instant);
      orbit.obstacles = [];
      orbit.maxRadius = Infinity;
      orbit.minHeight = -3.4;
      orbit.maxHeight = 12;
    }
  }

  // В «Гардеробе» персонаж стоит спиной к закату — подсвечиваем его спереди и сбоку.
  const wardrobeLight = new THREE.PointLight(0xffe2b8, 0, 60, 1);
  scene.add(wardrobeLight);

  function resize(): void {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    // Считаем в настоящих пикселях экрана: у телефонов их в 2–3 раза больше, чем «точек» в браузере.
    // На «низком» качестве плотность экрана не учитываем — картинка мельче, зато быстрее.
    const ratio = gfx.quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
    const density = ratio / gfx.pixelScale;
    renderer.domElement.style.imageRendering = gfx.pixelScale > 1.5 ? 'pixelated' : 'auto';
    const renderWidth = Math.max(200, Math.round(width * density));
    const renderHeight = Math.max(150, Math.round(height * density));
    renderer.setSize(renderWidth, renderHeight, false);
    composer.setSize(renderWidth, renderHeight);
    updateSnap(renderWidth, renderHeight);

    const aspect = width / height;
    const aspectChanged = Math.abs(camera.aspect - aspect) > 0.01;
    camera.aspect = aspect;
    // Чем уже экран, тем шире угол обзора — чтобы боковые игроки оставались в кадре.
    const neededFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(46)) / aspect));
    camera.fov = view === 'wardrobe' ? (aspect < 1 ? 60 : 44) : THREE.MathUtils.clamp(neededFov, 56, 80);
    if (aspectChanged) applyView(true);
    if (view === 'wardrobe' && aspect >= 1) {
      // На широком экране панель гардероба справа — сдвигаем картинку влево.
      camera.setViewOffset(width, height, width * 0.16, 0, width, height);
    } else {
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
  }

  function applySettings(): void {
    const high = gfx.quality === 'high';
    bloom.enabled = gfx.bloom && high;
    bloom.strength = gfx.bloomStrength;
    vignette.enabled = gfx.vignette > 0 && high;
    vignette.uniforms.uStrength.value = gfx.vignette;
    renderer.shadowMap.enabled = high;
    key.castShadow = high;
    resize();
  }

  // Двойное нажатие — приблизиться к предмету, чтобы рассмотреть его.
  const raycaster = new THREE.Raycaster();
  renderer.domElement.addEventListener('dblclick', (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    raycaster.far = 40; // фон (море, город) не приближаем
    const hit = raycaster.intersectObjects(scene.children, true).find((h) => h.object.visible && h.distance > 2);
    if (hit) orbit.focus(hit.point, view === 'wardrobe' ? 4.5 : 5);
  });

  const callbacks: ((time: number, delta: number) => void)[] = [];
  const clock = new THREE.Clock();

  function frame(): void {
    const delta = Math.min(clock.getDelta(), 0.1);
    const time = clock.elapsedTime;
    orbit.update(delta);
    if (view === 'wardrobe') {
      // Свет держится у камеры, чтобы персонаж был хорошо виден с любой стороны.
      wardrobeLight.position.copy(camera.position).add(new THREE.Vector3(0, 2.5, 0));
    }
    location.update(time);
    // Своё кресло видно, только когда камера ушла со своего места.
    chairs.own.visible = view === 'table' && awayFromSeat();
    for (const callback of callbacks) callback(time, delta);
    composer.render(delta);
  }

  function awayFromSeat(): boolean {
    return Math.abs(orbit.azimuthFromHome) > 0.55 || orbit.distanceFromHome > 2.2;
  }

  // Следим за размером контейнера (а не только окна): так сцена не растягивается при любом изменении.
  new ResizeObserver(resize).observe(container);
  applySettings();
  applyView(true);
  renderer.setAnimationLoop(frame);

  const projected = new THREE.Vector3();

  return {
    scene,
    camera,
    canvas: renderer.domElement,
    toScreen(point) {
      projected.copy(point).project(camera);
      return {
        x: ((projected.x + 1) / 2) * container.clientWidth,
        y: ((1 - projected.y) / 2) * container.clientHeight,
        visible: projected.z < 1 && Math.abs(projected.x) < 1.15 && Math.abs(projected.y) < 1.15,
      };
    },
    applySettings,
    setView(next) {
      view = next;
      wardrobeLight.intensity = next === 'wardrobe' ? 26 : 0;
      applyView(true);
      resize();
    },
    resetView: () => orbit.reset(),
    viewChanged: () => orbit.offset > 0.12,
    awayFromSeat,
    consumeDrag: () => orbit.consumeDrag(),
    onFrame(callback) {
      callbacks.push(callback);
    },
  };
}
