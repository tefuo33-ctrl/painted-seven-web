// Сцена целиком: рендер в низком разрешении, камера, свет, эффекты поверх картинки.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { gfx, updateSnap } from './gfx';
import { buildLocation } from './location';
import { buildChairs, buildTable } from './table';

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

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Холст, на котором рисуется сцена (для нажатий). */
  canvas: HTMLCanvasElement;
  /** Где на экране находится точка сцены: координаты в пикселях страницы. */
  toScreen(point: THREE.Vector3): { x: number; y: number };
  /** Применить изменённые настройки из `gfx`. */
  applySettings(): void;
  /** Добавить функцию, которая вызывается каждый кадр (time и delta — в секундах). */
  onFrame(callback: (time: number, delta: number) => void): void;
}

export function createStage(container: HTMLElement): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.imageRendering = 'pixelated';
  renderer.domElement.style.display = 'block';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 3, 600);

  const location = buildLocation(scene);
  scene.add(location.group);
  scene.add(buildTable());
  scene.add(buildChairs());

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), gfx.bloomStrength, 0.5, 0.9);
  composer.addPass(bloom);
  const vignette = new ShaderPass(VignetteShader);
  composer.addPass(vignette);
  composer.addPass(new OutputPass());

  // Положение камеры: за моим местом, чуть сверху. На вертикальном экране — выше и дальше,
  // чтобы стол помещался по ширине.
  const basePosition = new THREE.Vector3();
  const lookAt = new THREE.Vector3();

  function resize(): void {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    // Считаем в настоящих пикселях экрана: у телефонов их в 2–3 раза больше, чем «точек» в браузере.
    const density = Math.min(window.devicePixelRatio || 1, 3) / gfx.pixelScale;
    const renderWidth = Math.max(160, Math.round(width * density));
    const renderHeight = Math.max(120, Math.round(height * density));
    renderer.setSize(renderWidth, renderHeight, false);
    composer.setSize(renderWidth, renderHeight);
    updateSnap(renderWidth, renderHeight);

    const aspect = width / height;
    camera.aspect = aspect;
    // Держим в кадре стол и боковых игроков: чем уже экран, тем шире угол обзора,
    // а на вертикальном экране камера ещё и отходит назад и вверх.
    const neededFov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(39)) / aspect));
    camera.fov = THREE.MathUtils.clamp(neededFov, 50, 76);
    const t = (camera.fov - 50) / 26; // 0 — широкий экран, 1 — узкий вертикальный
    basePosition.set(0, THREE.MathUtils.lerp(7.2, 10.5, t), THREE.MathUtils.lerp(11, 14.5, t));
    lookAt.set(0, THREE.MathUtils.lerp(0.9, 0.6, t), THREE.MathUtils.lerp(-3.5, -2.5, t));
    camera.updateProjectionMatrix();
  }

  function applySettings(): void {
    bloom.enabled = gfx.bloom;
    bloom.strength = gfx.bloomStrength;
    vignette.enabled = gfx.vignette > 0;
    vignette.uniforms.uStrength.value = gfx.vignette;
    resize();
  }

  const callbacks: ((time: number, delta: number) => void)[] = [];
  const clock = new THREE.Clock();

  function frame(): void {
    const delta = Math.min(clock.getDelta(), 0.1);
    const time = clock.elapsedTime;
    // Лёгкое покачивание камеры.
    camera.position.set(
      basePosition.x + Math.sin(time * 0.4) * 0.08,
      basePosition.y + Math.sin(time * 0.6) * 0.05,
      basePosition.z,
    );
    camera.lookAt(lookAt);
    camera.updateMatrixWorld();
    location.update(time);
    for (const callback of callbacks) callback(time, delta);
    composer.render(delta);
  }

  // Следим за размером контейнера (а не только окна): так сцена не растягивается при любом изменении.
  new ResizeObserver(resize).observe(container);
  applySettings();
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
      };
    },
    applySettings,
    onFrame(callback) {
      callbacks.push(callback);
    },
  };
}
