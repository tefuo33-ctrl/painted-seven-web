// Режиссёр камеры за столом: одна машина состояний поверх обычной камеры игрока (OrbitCamera).
//
//   gameplay ──goTop()──▶ toTop ──▶ top ──goBack()──▶ toGameplay ──▶ gameplay
//            ◀──────────── cutTo('gameplay') / cutTo(shot) ─────────────▶
//
// gameplay   — обычный вид от лица игрока (его считает OrbitCamera, режиссёр не вмешивается);
// toTop      — камера плавно по дуге уходит от глаз игрока к «кадру» (через изометрию);
// top        — камера снимает стол с одного из ракурсов (Shot), карты в центре внимания.
//              Ракурсы меняются резкой склейкой, как в кино (cut), без анимации перехода;
// toGameplay — тем же путём плавно обратно к глазам игрока.
//
// Камера одна: режиссёр каждый кадр берёт позу, которую посчитала OrbitCamera, и смешивает её
// с позой текущего ракурса. Пока режим не gameplay, поворот мышью заблокирован.

import * as THREE from 'three';
import { DEAL_TIMING } from '../shared/dealTiming';

export type CameraMode = 'gameplay' | 'toTop' | 'top' | 'toGameplay';
export type Easing = 'cubic' | 'sine' | 'quint';

/**
 * Ракурс («кадр» в кино). Камера смотрит на центр сукна.
 * elevation — угол над столом (90° — строго сверху), azimuth — с какой стороны:
 * 0 — с моей стороны, ±π/4 — по диагонали между местами (там не мешают головы игроков).
 */
export interface Shot {
  elevation: number;
  azimuth: number;
  /** Какой радиус вокруг центра сукна должен поместиться в кадр. */
  frameRadius: number;
  fov: number;
}

const DEG = Math.PI / 180;

/** Набор ракурсов. Все — между местами игроков, чтобы ничьи головы не закрывали карты. */
export const SHOTS = {
  /** Строго сверху (чуть с наклоном, чтобы не было «плоско»): раздача, весь расклад. */
  top: { elevation: 85 * DEG, azimuth: 0, frameRadius: 6.6, fov: 42 },
  /** Сверху сбоку, из-за моего правого плеча по диагонали. */
  highSide: { elevation: 55 * DEG, azimuth: 45 * DEG, frameRadius: 5.6, fov: 40 },
  /** Низкий «киношный» ракурс по диагонали с дальней стороны: карты крупно, за ними — игроки. */
  lowFar: { elevation: 30 * DEG, azimuth: -135 * DEG, frameRadius: 4.9, fov: 36 },
  /** Средний ракурс слева спереди. */
  midLeft: { elevation: 42 * DEG, azimuth: -45 * DEG, frameRadius: 5.2, fov: 38 },
  /** Высокий ракурс справа с дальней стороны. */
  highFar: { elevation: 62 * DEG, azimuth: 135 * DEG, frameRadius: 5.8, fov: 40 },
} satisfies Record<string, Shot>;
export type ShotName = keyof typeof SHOTS;

/** Настраиваемые параметры. */
export interface DirectorSettings {
  /** Длительность плавного подъёма и возврата, секунды (делится на скорость анимаций). */
  transition: number;
  easing: Easing;
  /** Через сколько секунд на одном ракурсе склеить следующий (если задана очередь ракурсов). */
  shotLength: number;
  /** Приближение всех ракурсов (1 — как задано, больше — ближе). */
  zoom: number;
}

export const DEFAULT_DIRECTOR: DirectorSettings = {
  transition: DEAL_TIMING.cameraUp,
  easing: 'cubic',
  shotLength: 3.2,
  zoom: 1,
};

const EASE: Record<Easing, (t: number) => number> = {
  cubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  quint: (t) => (t < 0.5 ? 16 * t ** 5 : 1 - Math.pow(-2 * t + 2, 5) / 2),
};

/**
 * Куда смотрит камера: чуть ближе ко мне, чем центр стола, — стол на экране выше,
 * и моя зона не прячется под нижней панелью интерфейса.
 */
const CENTER = new THREE.Vector3(0, 0, 0.5);

export class CameraDirector {
  readonly settings: DirectorSettings = { ...DEFAULT_DIRECTOR };
  /** Скорость анимаций (1 — обычная): делит длительность перехода и ракурсов. */
  speed = 1;

  private state: CameraMode = 'gameplay';
  /** Насколько камера «в кадре»: 0 — у игрока, 1 — на ракурсе. */
  private progress = 0;
  private shot: Shot = SHOTS.top;
  /** Очередь ракурсов для склеек (пусто — держим текущий) и сколько уже держим этот. */
  private playlist: ShotName[] = [];
  private shotTime = 0;
  private playLength = DEFAULT_DIRECTOR.shotLength;
  private waiters: (() => void)[] = [];
  /** Вызывается при смене режима (например, чтобы заблокировать мышь). */
  onModeChange: (mode: CameraMode) => void = () => {};

  // Временные векторы: в кадре ничего не создаём.
  private gameplayPosition = new THREE.Vector3();
  private gameplayTarget = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private target = new THREE.Vector3();
  private offset = new THREE.Vector3();

  get mode(): CameraMode {
    return this.state;
  }

  /** Насколько камера ушла от глаз игрока: 0 — у игрока, 1 — на ракурсе. */
  get height(): number {
    return this.progress;
  }

  /** Камера в обычном режиме игрока (мышью можно крутить). */
  get free(): boolean {
    return this.state === 'gameplay';
  }

  /** Плавно уйти от глаз игрока к ракурсу. Промис — когда камера на месте. */
  goTop(shot: ShotName = 'top'): Promise<void> {
    if (this.state === 'top') {
      this.cut(shot);
      return Promise.resolve();
    }
    this.shot = SHOTS[shot];
    this.playlist = [];
    this.setMode('toTop');
    return this.wait();
  }

  /** Плавно вернуться к глазам игрока. Промис — когда камера снова у игрока и мышь разблокирована. */
  goBack(): Promise<void> {
    if (this.state === 'gameplay') return Promise.resolve();
    this.playlist = [];
    this.setMode('toGameplay');
    return this.wait();
  }

  /**
   * Склейка, как в кино: мгновенно переключиться на ракурс (или к глазам игрока),
   * без анимации перехода.
   */
  cutTo(target: ShotName | 'gameplay'): void {
    if (target === 'gameplay') {
      this.playlist = [];
      this.snap('gameplay');
      return;
    }
    this.cut(target);
    if (this.state !== 'top') this.snap('top');
  }

  /**
   * Очередь ракурсов: каждые settings.shotLength секунд — склейка на следующий (по кругу).
   * Первый ракурс включается сразу (если камера уже на ракурсе — склейкой).
   */
  play(shots: ShotName[], seconds = this.settings.shotLength): void {
    this.playlist = shots.slice();
    this.playLength = seconds;
    this.shotTime = 0;
    if (shots.length && this.state === 'top') this.cut(shots[0]);
    else if (shots.length) this.shot = SHOTS[shots[0]];
  }

  /** Мгновенно встать в режим (кнопка «Пропустить», выход в меню). */
  snap(mode: 'gameplay' | 'top'): void {
    this.progress = mode === 'top' ? 1 : 0;
    if (mode === 'gameplay') this.playlist = [];
    this.setMode(mode);
    this.release();
  }

  private cut(name: ShotName): void {
    this.shot = SHOTS[name];
    this.shotTime = 0;
  }

  /**
   * Каждый кадр, после того как OrbitCamera поставила камеру игрока:
   * смешать её позу с позой ракурса. `fov` — угол обзора игрока в этом кадре.
   */
  apply(camera: THREE.PerspectiveCamera, delta: number, fov: number): void {
    if (this.state === 'toTop' || this.state === 'toGameplay') {
      const step = delta / Math.max(0.05, this.settings.transition / this.speed);
      this.progress = THREE.MathUtils.clamp(this.progress + (this.state === 'toTop' ? step : -step), 0, 1);
      if (this.state === 'toTop' && this.progress >= 1) {
        this.setMode('top');
        this.release();
      } else if (this.state === 'toGameplay' && this.progress <= 0) {
        this.setMode('gameplay');
        this.release();
      }
    }
    // Очередь ракурсов: держим кадр, потом — склейка на следующий.
    if (this.state === 'top' && this.playlist.length > 1) {
      this.shotTime += delta * this.speed;
      if (this.shotTime >= this.playLength) {
        const index = this.playlist.findIndex((name) => SHOTS[name] === this.shot);
        this.cut(this.playlist[(index + 1) % this.playlist.length]);
      }
    }
    if (this.progress <= 0) return; // обычный вид игрока — ничего не трогаем

    const k = EASE[this.settings.easing](this.progress);
    const shot = this.shot;

    // Откуда: глаза игрока и точка на сукне, куда он смотрит.
    this.gameplayPosition.copy(camera.position);
    camera.getWorldDirection(this.forward);
    const down = Math.max(0.15, -this.forward.y);
    this.gameplayTarget.copy(camera.position).addScaledVector(this.forward, camera.position.y / down);

    // Куда: на таком расстоянии, чтобы круг frameRadius целиком был в кадре
    // и по вертикали, и по горизонтали (на вертикальном телефоне камера дальше).
    const tanV = Math.tan(THREE.MathUtils.degToRad(shot.fov / 2));
    const fit = Math.max(1, 1 / Math.max(0.2, camera.aspect));
    const shotDistance = (shot.frameRadius * fit) / tanV / this.settings.zoom;

    // Путь — по дуге вокруг центра стола, а не по прямой: камера отъезжает назад и вверх,
    // проходит «изометрию» и выходит на ракурс.
    const startOffset = this.offset.copy(this.gameplayPosition).sub(CENTER);
    const startDistance = startOffset.length();
    const startElevation = Math.asin(THREE.MathUtils.clamp(startOffset.y / startDistance, -1, 1));
    const startAzimuth = Math.atan2(startOffset.x, startOffset.z);
    // Поворот вокруг стола — по кратчайшей дуге.
    let turn = shot.azimuth - startAzimuth;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    const azimuth = startAzimuth + turn * k;
    const elevation = THREE.MathUtils.lerp(startElevation, shot.elevation, k);
    // Дистанция растёт чуть быстрее подъёма — сначала «вдох» назад, потом вверх.
    const distance = THREE.MathUtils.lerp(startDistance, shotDistance, Math.sin((k * Math.PI) / 2));
    camera.position.set(
      CENTER.x + Math.sin(azimuth) * Math.cos(elevation) * distance,
      CENTER.y + Math.sin(elevation) * distance,
      CENTER.z + Math.cos(azimuth) * Math.cos(elevation) * distance,
    );
    this.target.lerpVectors(this.gameplayTarget, CENTER, k);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.target);
    camera.fov = THREE.MathUtils.lerp(fov, shot.fov, k);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }

  private setMode(mode: CameraMode): void {
    if (this.state === mode) return;
    this.state = mode;
    this.onModeChange(mode);
  }

  private wait(): Promise<void> {
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  private release(): void {
    const waiters = this.waiters;
    this.waiters = [];
    for (const resolve of waiters) resolve();
  }
}
