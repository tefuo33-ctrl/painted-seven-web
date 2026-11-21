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
import { FLOOR_Y, SEATS, buildChairs, buildTable } from './table';

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
  /** Во сколько раз сейчас приближен вид за столом (1 — обычный). */
  zoom(): number;
  /** Управление камерой (нужно для проверки сцены). */
  orbit: OrbitCamera;
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

  // Дальний фон (небо, море, город) — до 7 км: отдельная сцена и камера с большой дальностью,
  // рисуется первой; ближняя сцена — поверх, с очищенной глубиной.
  const background = new THREE.Scene();
  const backgroundCamera = new THREE.PerspectiveCamera(50, 1, 20, 60000);
  const location = buildLocation(scene, background);
  scene.add(location.group);
  const table = buildTable();
  scene.add(table);
  const chairs = buildChairs();
  scene.add(chairs.group);

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
  composer.addPass(new RenderPass(background, backgroundCamera));
  const nearPass = new RenderPass(scene, camera);
  nearPass.clear = false; // поверх дальнего фона
  nearPass.clearDepth = true;
  composer.addPass(nearPass);
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), gfx.bloomStrength, 0.5, 0.9);
  composer.addPass(bloom);
  const vignette = new ShaderPass(VignetteShader);
  composer.addPass(vignette);
  composer.addPass(new OutputPass());

  // Телефон греется от 60 кадров в секунду в полном разрешении: на сенсорных экранах
  // рисуем не чаще 30 раз в секунду и с плотностью пикселей не выше 1.5.
  const mobile = window.matchMedia('(pointer: coarse)').matches;

  // ---------- Камера ----------

  let view: StageView = 'table';

  /** Угол обзора за столом без приближения. */
  let tableFov = 60;
  function zoomedFov(): number {
    const half = Math.atan(Math.tan(THREE.MathUtils.degToRad(tableFov) / 2) / orbit.zoom);
    return THREE.MathUtils.radToDeg(half * 2);
  }

  /** Обзор «за столом»: на уровне глаз сидящего игрока, стол — перед ним. */
  function tableView(aspect: number): OrbitView {
    const narrow = THREE.MathUtils.clamp((1.3 - aspect) / 0.8, 0, 1); // 1 — вертикальный телефон
    // Композиция как в эталоне (Buckshot Roulette): глаза сидящего игрока чуть выше стола,
    // взгляд через стол. В кадре все три соперника: напротив — на 40 % высоты, соседи — у краёв
    // кадра; стол занимает нижнюю половину, ближний край уходит за низ экрана.
    // На вертикальном телефоне садимся дальше и выше, чтобы соседи всё равно попадали в кадр.
    const eye = new THREE.Vector3(0, THREE.MathUtils.lerp(4.0, 8.6, narrow), THREE.MathUtils.lerp(9.4, 12.6, narrow));
    const look = new THREE.Vector3(0, THREE.MathUtils.lerp(1.93, 0.2, narrow), -0.4);
    const pitch = Math.atan2(look.y - eye.y, eye.z - look.z);
    return {
      target: look,
      eye,
      azimuth: 0,
      elevation: pitch,
      // Игрок не встаёт с места: только оглядывается (влево-вправо до соседей, чуть вверх-вниз)
      // и приближает вид.
      distance: 0,
      minDistance: -0.3,
      maxDistance: 1,
      minElevation: pitch - 0.2,
      maxElevation: pitch + 0.22,
      minAzimuth: -0.8,
      maxAzimuth: 0.8,
    };
  }

  function wardrobeView(aspect: number): OrbitView {
    return {
      target: new THREE.Vector3(WARDROBE_SPOT.x, FLOOR_Y + 4.6, WARDROBE_SPOT.z),
      azimuth: 0,
      elevation: 0.06,
      distance: aspect < 1 ? 17 : 13.5,
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
      orbit.minHeight = FLOOR_Y + 0.8;
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
    const ratio = gfx.quality === 'low' ? 1 : Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
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
    // На вертикальном телефоне угол шире, чтобы были видны игроки по бокам.
    tableFov = THREE.MathUtils.clamp(neededFov, 56, aspect < 1 ? 100 : 80);
    // На широком экране обзор чуть уже (в 1.2 раза) — стол и соперник напротив крупнее.
    // Обзор не сужаем: в кадре должны быть все три соперника.
    const tighten = 1;
    tableFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(tableFov) / 2) / tighten));
    camera.fov = view === 'wardrobe' ? (aspect < 1 ? 60 : 44) : zoomedFov();
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
    // Свечение — самый «горячий» эффект; на телефоне выключено.
    bloom.enabled = gfx.bloom && high && !mobile;
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
    // Только в гардеробе: за столом двойное нажатие — это ход картой, камера не должна прыгать вперёд.
    if (hit && view === 'wardrobe') orbit.focus(hit.point, 4.5);
  });

  const callbacks: ((time: number, delta: number) => void)[] = [];
  const clock = new THREE.Clock();

  let lastFrame = 0;

  function frame(now: number): void {
    if (mobile && now - lastFrame < 1000 / 31) return;
    lastFrame = now;
    const delta = Math.min(clock.getDelta(), 0.1);
    const time = clock.elapsedTime;
    orbit.update(delta);
    if (view === 'table') {
      // Приближение за столом — сужением угла обзора.
      const fov = zoomedFov();
      if (Math.abs(camera.fov - fov) > 1e-3) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    }
    if (view === 'wardrobe') {
      // Свет держится у камеры, чтобы персонаж был хорошо виден с любой стороны.
      wardrobeLight.position.copy(camera.position).add(new THREE.Vector3(0, 2.5, 0));
    }
    location.update(time);
    // Камера дальнего фона смотрит так же, как основная.
    backgroundCamera.position.copy(camera.position);
    backgroundCamera.quaternion.copy(camera.quaternion);
    if (backgroundCamera.fov !== camera.fov || backgroundCamera.aspect !== camera.aspect || camera.view) {
      backgroundCamera.fov = camera.fov;
      backgroundCamera.aspect = camera.aspect;
      backgroundCamera.view = camera.view ? { ...camera.view } : null;
      backgroundCamera.updateProjectionMatrix();
    }
    // Своё кресло видно, только когда камера ушла со своего места.
    chairs.own.visible = view === 'table' && awayFromSeat();
    for (const callback of callbacks) callback(time, delta);
    composer.render(delta);
  }

  function awayFromSeat(): boolean {
    // За столом игрок никогда не встаёт с места — своего персонажа и кресло не видно.
    return false;
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
    zoom: () => (view === 'table' ? orbit.zoom : 1),
    orbit,
    onFrame(callback) {
      callbacks.push(callback);
    },
  };
}
