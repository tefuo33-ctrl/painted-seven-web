// Камера, которой управляет игрок: вращение вокруг точки, приближение и отдаление.
// Мышь: зажать и тянуть — вращение, колесо — зум. Телефон: палец — вращение, два пальца — зум.

import * as THREE from 'three';

/** Параметры обзора: вокруг какой точки вращаемся и в каких пределах. */
export interface OrbitView {
  target: THREE.Vector3;
  /** Угол вокруг вертикальной оси: 0 — камера со стороны +z. */
  azimuth: number;
  /** Угол подъёма над горизонтом (радианы). */
  elevation: number;
  distance: number;
  minDistance: number;
  maxDistance: number;
  minElevation: number;
  maxElevation: number;
}

/** Препятствие — вертикальный цилиндр (кресло с игроком, колонна). */
export interface Obstacle {
  x: number;
  z: number;
  radius: number;
  top: number;
}

export class OrbitCamera {
  /** Предел удаления камеры от центра сцены по горизонтали (стены террасы). */
  maxRadius = Infinity;
  minHeight = -Infinity;
  maxHeight = Infinity;
  obstacles: Obstacle[] = [];

  private camera: THREE.PerspectiveCamera;
  private home: OrbitView;
  private goal: OrbitView;
  private current: OrbitView;
  private pointers = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  private moved = 0;
  private dragged = false;
  private lift = 0;

  constructor(camera: THREE.PerspectiveCamera, element: HTMLElement, view: OrbitView) {
    this.camera = camera;
    this.home = cloneView(view);
    this.goal = cloneView(view);
    this.current = cloneView(view);

    element.addEventListener('pointerdown', (event) => {
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 1) {
        this.moved = 0;
        this.dragged = false;
      }
      if (this.pointers.size === 2) this.pinchDistance = this.pointerSpread();
    });
    element.addEventListener('pointermove', (event) => {
      const previous = this.pointers.get(event.pointerId);
      if (!previous) return;
      const dx = event.clientX - previous.x;
      const dy = event.clientY - previous.y;
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

      if (this.pointers.size === 2) {
        // Два пальца: сводим — отдаляем, разводим — приближаем.
        const spread = this.pointerSpread();
        if (this.pinchDistance > 0) this.zoomBy(this.pinchDistance / spread);
        this.pinchDistance = spread;
        this.dragged = true;
        return;
      }
      this.moved += Math.abs(dx) + Math.abs(dy);
      if (this.moved < 8) return; // маленькое смещение — это нажатие, а не вращение
      if (!this.dragged) {
        this.dragged = true;
        element.setPointerCapture(event.pointerId);
      }
      this.goal.azimuth -= dx * 0.0055;
      this.goal.elevation = THREE.MathUtils.clamp(
        this.goal.elevation + dy * 0.0045,
        this.goal.minElevation,
        this.goal.maxElevation,
      );
    });
    const release = (event: PointerEvent) => {
      this.pointers.delete(event.pointerId);
      this.pinchDistance = 0;
    };
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.zoomBy(Math.exp(event.deltaY * 0.0012));
      },
      { passive: false },
    );
  }

  private pointerSpread(): number {
    const [a, b] = [...this.pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y) || 1;
  }

  private zoomBy(factor: number): void {
    this.goal.distance = THREE.MathUtils.clamp(this.goal.distance * factor, this.goal.minDistance, this.goal.maxDistance);
  }

  /** Было ли последнее нажатие вращением камеры (тогда это не «клик по карте»). */
  consumeDrag(): boolean {
    const dragged = this.dragged;
    this.dragged = false;
    return dragged;
  }

  /** Задать новый обзор. `instant` — без плавного перелёта. */
  setView(view: OrbitView, instant = false): void {
    this.home = cloneView(view);
    this.goal = cloneView(view);
    // Плавно доворачиваем по кратчайшему пути.
    this.current.azimuth = shortest(this.goal.azimuth, this.current.azimuth);
    if (instant) this.current = cloneView(view);
  }

  /** Вернуться к исходному обзору. */
  reset(): void {
    this.goal = cloneView(this.home);
    this.current.azimuth = shortest(this.goal.azimuth, this.current.azimuth);
  }

  /** Приблизиться к точке сцены, чтобы рассмотреть её. */
  focus(point: THREE.Vector3, distance: number): void {
    this.goal.target.copy(point);
    this.goal.distance = Math.max(this.goal.minDistance * 0.6, distance);
  }

  /** Насколько обзор отличается от исходного (0 — тот же). */
  get offset(): number {
    return (
      Math.abs(this.goal.azimuth - shortest(this.goal.azimuth, this.home.azimuth)) +
      Math.abs(this.goal.elevation - this.home.elevation) +
      Math.abs(this.goal.distance - this.home.distance) / this.home.distance +
      this.goal.target.distanceTo(this.home.target) / 4
    );
  }

  /** Текущий угол поворота вокруг стола относительно исходного. */
  get azimuthFromHome(): number {
    return this.current.azimuth - shortest(this.current.azimuth, this.home.azimuth);
  }

  get distanceFromHome(): number {
    return this.current.distance - this.home.distance;
  }

  update(delta: number): void {
    // Плавное движение: каждый кадр проходим часть пути до цели.
    const k = 1 - Math.exp(-delta * 9);
    const c = this.current;
    const g = this.goal;
    c.azimuth += (g.azimuth - c.azimuth) * k;
    c.elevation += (g.elevation - c.elevation) * k;
    c.distance += (g.distance - c.distance) * k;
    c.target.lerp(g.target, k);

    const cosE = Math.cos(c.elevation);
    const position = this.camera.position.set(
      c.target.x + Math.sin(c.azimuth) * cosE * c.distance,
      c.target.y + Math.sin(c.elevation) * c.distance,
      c.target.z + Math.cos(c.azimuth) * cosE * c.distance,
    );

    // Не даём камере пройти сквозь предметы и выйти за пределы террасы.
    let wanted = 0;
    for (const obstacle of this.obstacles) {
      const dx = position.x - obstacle.x;
      const dz = position.z - obstacle.z;
      const distance = Math.hypot(dx, dz);
      if (distance < obstacle.radius && position.y < obstacle.top) {
        // Выталкиваем вверх: так камера «переваливает» через спинку кресла и голову игрока.
        wanted = Math.max(wanted, obstacle.top - position.y);
      }
    }
    this.lift += (wanted - this.lift) * Math.min(1, delta * 10);
    position.y += this.lift;
    const radius = Math.hypot(position.x, position.z);
    if (radius > this.maxRadius) {
      position.x *= this.maxRadius / radius;
      position.z *= this.maxRadius / radius;
    }
    position.y = THREE.MathUtils.clamp(position.y, this.minHeight, this.maxHeight);

    this.camera.lookAt(c.target);
    this.camera.updateMatrixWorld();
  }
}

function cloneView(view: OrbitView): OrbitView {
  return { ...view, target: view.target.clone() };
}

/** Угол `to`, приведённый к ближайшему обороту относительно `from`. */
function shortest(from: number, to: number): number {
  const turn = Math.PI * 2;
  return to + Math.round((from - to) / turn) * turn;
}
