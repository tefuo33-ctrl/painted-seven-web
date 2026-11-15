// Одна 3D-карта: тонкая коробочка с лицом и рубашкой из атласа, умеет плавно перелетать.

import * as THREE from 'three';
import { type Card } from '../engine';
import { CELL_BACK, CELL_EDGE, cardCell, cellUv, getCardAtlas } from './cardAtlas';
import { retro } from './gfx';

export const CARD_W = 1;
export const CARD_H = 1.5;
export const CARD_T = 0.03;

/** Куда карта должна прийти. Функция — если цель движется (рука привязана к камере). */
export interface Pose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** Размер карты (1 — обычный). */
  scale?: number;
}
export type PoseSource = Pose | (() => Pose);

export interface MoveOptions {
  duration?: number;
  delay?: number;
  /** Высота дуги полёта. */
  arc?: number;
}

type Look = 'normal' | 'dim' | 'lit';

let materials: Record<Look, THREE.MeshLambertMaterial> | null = null;

function getMaterials(): Record<Look, THREE.MeshLambertMaterial> {
  if (!materials) {
    const map = getCardAtlas();
    materials = {
      // Бумага чуть приглушена, чтобы под фонарём карты не «выгорали» в белое.
      normal: retro(new THREE.MeshLambertMaterial({ map, flatShading: true, color: 0xc8c4bc })),
      // Затемнённая карта: ею сейчас ходить нельзя.
      dim: retro(new THREE.MeshLambertMaterial({ map, flatShading: true, color: 0x5a5866 })),
      // Подсвеченная карта: ею можно ходить.
      lit: retro(
        new THREE.MeshLambertMaterial({ map, flatShading: true, emissive: 0x3a2c12, emissiveMap: map, color: 0xc8c4bc }),
      ),
    };
  }
  return materials;
}

function setFaceUv(uv: THREE.BufferAttribute, faceIndex: number, cell: number, point = false): void {
  const [u0, v0, u1, v1] = cellUv(cell);
  const base = faceIndex * 4;
  if (point) {
    // Торец: все четыре угла смотрят в одну точку однотонной ячейки.
    for (let i = 0; i < 4; i++) uv.setXY(base + i, (u0 + u1) / 2, (v0 + v1) / 2);
    return;
  }
  // Небольшой отступ внутрь ячейки, чтобы не цеплять соседние карты атласа.
  const eu = (u1 - u0) * 0.008;
  const ev = (v1 - v0) * 0.006;
  uv.setXY(base + 0, u0 + eu, v1 - ev);
  uv.setXY(base + 1, u1 - eu, v1 - ev);
  uv.setXY(base + 2, u0 + eu, v0 + ev);
  uv.setXY(base + 3, u1 - eu, v0 + ev);
}

function ease(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export class Card3D {
  readonly mesh: THREE.Mesh;
  /** Имя места, которое карта сейчас занимает (см. tableView.ts). */
  key = '';
  face: Card | null = null;

  private uv: THREE.BufferAttribute;
  private fromPosition = new THREE.Vector3();
  private fromQuaternion = new THREE.Quaternion();
  private fromScale = 1;
  private target: PoseSource | null = null;
  private progress = 1;
  private duration = 0.3;
  private delay = 0;
  private arc = 0;
  private onArrive: (() => void) | null = null;

  constructor() {
    const geometry = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T);
    this.uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    // Порядок граней коробки: +x, -x, +y, -y, +z (лицо), -z (рубашка).
    for (let face = 0; face < 4; face++) setFaceUv(this.uv, face, CELL_EDGE, true);
    setFaceUv(this.uv, 4, CELL_BACK);
    setFaceUv(this.uv, 5, CELL_BACK);
    this.mesh = new THREE.Mesh(geometry, getMaterials().normal);
    this.mesh.userData.card3d = this;
  }

  /** Показать на лице карту (или рубашку, если карта неизвестна). */
  setFace(card: Card | null): void {
    this.face = card;
    setFaceUv(this.uv, 4, card ? cardCell(card) : CELL_BACK);
    this.uv.needsUpdate = true;
  }

  setLook(look: Look): void {
    this.mesh.material = getMaterials()[look];
  }

  /** Мгновенно поставить карту в позу. */
  place(pose: PoseSource): void {
    this.target = pose;
    this.progress = 1;
    this.delay = 0;
    this.apply(typeof pose === 'function' ? pose() : pose, 1);
  }

  /** Плавно перелететь в новую позу. */
  moveTo(pose: PoseSource, options: MoveOptions = {}): Promise<void> {
    this.fromPosition.copy(this.mesh.position);
    this.fromQuaternion.copy(this.mesh.quaternion);
    this.fromScale = this.mesh.scale.x;
    this.target = pose;
    this.progress = 0;
    this.duration = options.duration ?? 0.35;
    this.delay = options.delay ?? 0;
    this.arc = options.arc ?? 0;
    this.onArrive?.(); // предыдущий полёт прерван — считаем его завершённым
    return new Promise((resolve) => {
      this.onArrive = resolve;
    });
  }

  get moving(): boolean {
    return this.progress < 1;
  }

  update(delta: number): void {
    if (!this.target) return;
    const pose = typeof this.target === 'function' ? this.target() : this.target;
    if (this.progress >= 1) {
      // Карта на месте; если место движется (рука у камеры) — следуем за ним.
      if (typeof this.target === 'function') this.apply(pose, 1);
      return;
    }
    if (this.delay > 0) {
      this.delay -= delta;
      return;
    }
    this.progress = Math.min(1, this.progress + delta / this.duration);
    this.apply(pose, ease(this.progress));
    if (this.progress >= 1) {
      const done = this.onArrive;
      this.onArrive = null;
      done?.();
    }
  }

  private apply(pose: Pose, k: number): void {
    const scale = pose.scale ?? 1;
    if (k >= 1) {
      this.mesh.position.copy(pose.position);
      this.mesh.quaternion.copy(pose.quaternion);
      this.mesh.scale.setScalar(scale);
      return;
    }
    this.mesh.position.lerpVectors(this.fromPosition, pose.position, k);
    this.mesh.position.y += Math.sin(Math.PI * k) * this.arc;
    this.mesh.quaternion.slerpQuaternions(this.fromQuaternion, pose.quaternion, k);
    this.mesh.scale.setScalar(this.fromScale + (scale - this.fromScale) * k);
  }
}
