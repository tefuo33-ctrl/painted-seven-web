// Камера, которой управляет игрок. Два режима:
//  - «вокруг точки» (гардероб): вращение вокруг персонажа, приближение и отдаление;
//  - «на месте» (за столом): камера — это глаза игрока. Она стоит неподвижно и смотрит на стол,
//    её можно только приблизить (как бинокль), чтобы рассмотреть карты на столе.
// За столом: колесо или зажатая правая кнопка — приблизить; на телефоне — два пальца.

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
  /**
   * Режим «на месте»: камера стоит в этой точке и смотрит по направлению azimuth/elevation
   * (azimuth 0 — к центру стола по оси -z, elevation < 0 — вниз). distance — степень приближения:
   * 0 — обычный вид, 1 — в ZOOM_MAX раз ближе, меньше нуля — чуть дальше.
   */
  eye?: THREE.Vector3;
  /** Пределы поворота влево-вправо (только для режима «на месте»). */
  minAzimuth?: number;
  maxAzimuth?: number;
}

/** Препятствие — вертикальный цилиндр (кресло с игроком, колонна). */
export interface Obstacle {
  x: number;
  z: number;
  radius: number;
  top: number;
}

/** Во сколько раз можно приблизить вид за столом. */
export const ZOOM_MAX = 2.5;

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
  /** Зажата правая кнопка мыши — приближаем, пока держат. */
  private leaning = false;
  /** Можно ли начинать поворот с этой точки экрана (не с карты в руке). Задаёт игра. */
  canRotate: (x: number, y: number) => boolean = () => true;
  private rotating = true;
  private leanBase = 0;

  constructor(camera: THREE.PerspectiveCamera, element: HTMLElement, view: OrbitView) {
    this.camera = camera;
    this.home = cloneView(view);
    this.goal = cloneView(view);
    this.current = cloneView(view);

    // Правая кнопка мыши за столом приближает, контекстное меню браузера не нужно.
    element.addEventListener('contextmenu', (event) => event.preventDefault());
    element.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button === 2) {
        if (this.goal.eye && !this.leaning) {
          this.leaning = true;
          this.leanBase = this.goal.distance;
          this.goal.distance = this.goal.maxDistance;
        }
        return;
      }
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.pointers.size === 1) {
        this.moved = 0;
        this.dragged = false;
        this.rotating = this.canRotate(event.clientX, event.clientY);
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
      if (this.goal.eye) {
        // За столом: тянешь вправо — смотришь вправо, вверх — смотришь вверх (в пределах).
        // Перетаскивание, начатое на карте руки, — это перестановка карт, а не поворот.
        if (!this.rotating) return;
        this.goal.azimuth = THREE.MathUtils.clamp(
          this.goal.azimuth + dx * 0.003,
          this.goal.minAzimuth ?? -Infinity,
          this.goal.maxAzimuth ?? Infinity,
        );
        this.goal.elevation = THREE.MathUtils.clamp(
          this.goal.elevation - dy * 0.0025,
          this.goal.minElevation,
          this.goal.maxElevation,
        );
        return;
      }
      this.goal.azimuth -= dx * 0.0055;
      this.goal.elevation = THREE.MathUtils.clamp(
        this.goal.elevation + dy * 0.0045,
        this.goal.minElevation,
        this.goal.maxElevation,
      );
    });
    const release = (event: PointerEvent) => {
      if (event.pointerType === 'mouse' && event.button === 2) {
        if (this.leaning) {
          this.leaning = false;
          this.goal.distance = this.leanBase;
        }
        return;
      }
      this.pointers.delete(event.pointerId);
      this.pinchDistance = 0;
    };
    // Отпустили правую кнопку за пределами окна — всё равно откидываемся назад.
    window.addEventListener('pointerup', (event) => {
      if (event.button === 2 && this.leaning) {
        this.leaning = false;
        this.goal.distance = this.leanBase;
      }
    });
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
    element.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        if (this.goal.eye) {
          // За столом колесо подаёт камеру вперёд-назад в небольших пределах.
          this.goal.distance = THREE.MathUtils.clamp(
            this.goal.distance - event.deltaY * 0.0016,
            this.goal.minDistance,
            this.goal.maxDistance,
          );
          return;
        }
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
    if (this.goal.eye) {
      // Сводим пальцы — отдаляем, разводим — приближаем.
      this.goal.distance = THREE.MathUtils.clamp(
        this.goal.distance - Math.log(factor) / Math.log(ZOOM_MAX),
        this.goal.minDistance,
        this.goal.maxDistance,
      );
      return;
    }
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
    if (this.goal.eye) {
      // За столом: поворачиваемся к предмету и подаёмся к нему, не вставая с места.
      const to = point.clone().sub(this.goal.eye);
      this.goal.azimuth = THREE.MathUtils.clamp(
        Math.atan2(to.x, -to.z),
        this.goal.minAzimuth ?? -Infinity,
        this.goal.maxAzimuth ?? Infinity,
      );
      this.goal.elevation = THREE.MathUtils.clamp(
        Math.atan2(to.y, Math.hypot(to.x, to.z)),
        this.goal.minElevation,
        this.goal.maxElevation,
      );
      this.goal.distance = this.goal.maxDistance;
      return;
    }
    this.goal.target.copy(point);
    this.goal.distance = Math.max(this.goal.minDistance * 0.6, distance);
  }

  /** Насколько обзор отличается от исходного (0 — тот же). */
  get offset(): number {
    return (
      Math.abs(this.goal.azimuth - shortest(this.goal.azimuth, this.home.azimuth)) +
      Math.abs(this.goal.elevation - this.home.elevation) +
      Math.abs(this.goal.distance - this.home.distance) / Math.max(this.home.distance, 2) +
      this.goal.target.distanceTo(this.home.target) / 4
    );
  }

  /** Во сколько раз сейчас приближен вид за столом (1 — обычный вид). */
  get zoom(): number {
    return this.goal.eye ? Math.pow(ZOOM_MAX, this.current.distance) : 1;
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

    if (g.eye) {
      // Режим «на месте»: глаза в кресле, только поворот и лёгкий наклон вперёд.
      if (!c.eye) c.eye = g.eye.clone();
      c.eye.lerp(g.eye, k);
      const cosE = Math.cos(c.elevation);
      const look = new THREE.Vector3(Math.sin(c.azimuth) * cosE, Math.sin(c.elevation), -Math.cos(c.azimuth) * cosE);
      // Приближение делает сцена — сужая угол обзора; сама камера остаётся в кресле.
      this.camera.position.copy(c.eye);
      this.camera.lookAt(this.camera.position.clone().add(look));
      this.camera.updateMatrixWorld();
      this.lift = 0;
      return;
    }
    c.eye = undefined;

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
  return { ...view, target: view.target.clone(), eye: view.eye?.clone() };
}

/** Угол `to`, приведённый к ближайшему обороту относительно `from`. */
function shortest(from: number, to: number): number {
  const turn = Math.PI * 2;
  return to + Math.round((from - to) / turn) * turn;
}
