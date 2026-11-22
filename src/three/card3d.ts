// Одна 3D-карта: тонкая коробочка с лицом и рубашкой из атласа, умеет плавно перелетать.

import * as THREE from 'three';
import { type Card } from '../engine';
import { CELL_BACK, CELL_EDGE, cardCell, cellUv, getCardAtlas } from './cardAtlas';
import { retro } from './gfx';

/** Размер карт: 1 — обычные (1 × 1.5). Крупнее (например 1.2) — их лучше видно с другого конца стола. */
export const CARD_SIZE = 1;
export const CARD_W = 1 * CARD_SIZE;
export const CARD_H = 1.5 * CARD_SIZE;
export const CARD_T = 0.03 * CARD_SIZE;

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
  /** Лёгкий поворот в полёте вокруг вертикали (радианы): карта «плывёт» и ложится ровно. */
  spin?: number;
}

type Look = 'normal' | 'dim' | 'lit' | 'chosen';

let materials: Record<Look, THREE.MeshLambertMaterial> | null = null;

/** Самая большая яркость лица карты (0…1): ниже порога свечения bloom, карта никогда не «горит». */
const CARD_MAX_LIGHT = 0.84;

function getMaterials(): Record<Look, THREE.MeshLambertMaterial> {
  if (!materials) {
    const map = getCardAtlas();
    // Прозрачные скруглённые углы карты (альфа-канал атласа) не рисуем.
    // Матовая бумага без бликов: яркость лица карты ограничена (CARD_MAX_LIGHT) ниже порога
    // свечения картинки (bloom 0.9). Иначе карта, взлетая к лампе или поднимаясь к камере,
    // пересвечивалась в белое пятно с ореолом и её нельзя было прочитать.
    const cut = (material: THREE.MeshLambertMaterial, cap = CARD_MAX_LIGHT) => {
      material.alphaTest = 0.5;
      const previous = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        previous.call(material, shader, renderer);
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <opaque_fragment>',
          `outgoingLight = min(outgoingLight, vec3(${cap.toFixed(3)}));\n#include <opaque_fragment>`,
        );
      };
      material.customProgramCacheKey = () => `card-matte-${cap}`;
      return material;
    };
    materials = {
      // Бумага светлее прежней, но не белая: вместе с более ярким светом над столом карты
      // на 30 % светлее и при этом не «выгорают» под лампой.
      normal: cut(retro(new THREE.MeshLambertMaterial({ map, flatShading: true, color: 0xe4e0d8 }))),
      // Затемнённая карта: ею сейчас ходить нельзя.
      dim: cut(retro(new THREE.MeshLambertMaterial({ map, flatShading: true, color: 0x6c6a7c }))),
      // Подсвеченная карта: ею можно ходить.
      lit: cut(
        retro(new THREE.MeshLambertMaterial({ map, flatShading: true, emissive: 0x4a3818, emissiveMap: map, color: 0xeae6de })),
        0.88, // подсвеченная — чуть ярче обычной, но тоже без ореола
      ),
      // Выбранная карта: светится ярче остальных.
      chosen: cut(
        retro(new THREE.MeshLambertMaterial({ map, flatShading: true, emissive: 0x7a5c20, emissiveMap: map, color: 0xeae6de })),
        0.88,
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

/** Золотое свечение за картой: рамка вокруг карты, которой можно ходить. */
let haloParts: { geometry: THREE.PlaneGeometry; lit: THREE.MeshBasicMaterial; chosen: THREE.MeshBasicMaterial } | null = null;
function getHalo() {
  if (!haloParts) {
    const material = (color: number, opacity: number) =>
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, fog: false, toneMapped: false });
    haloParts = {
      // Тонкая и полупрозрачная кайма — заметна, но не кричит.
      geometry: new THREE.PlaneGeometry(CARD_W + 0.06, CARD_H + 0.06),
      lit: material(0xe0b450, 0.35),
      chosen: material(0xffe28a, 0.7),
    };
  }
  return haloParts;
}

const UP = new THREE.Vector3(0, 1, 0);
const spinQuaternion = new THREE.Quaternion();

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
  private spin = 0;
  private onArrive: (() => void) | null = null;
  private halo: THREE.Mesh;

  constructor() {
    const geometry = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T);
    this.uv = geometry.getAttribute('uv') as THREE.BufferAttribute;
    // Порядок граней коробки: +x, -x, +y, -y, +z (лицо), -z (рубашка).
    for (let face = 0; face < 4; face++) setFaceUv(this.uv, face, CELL_EDGE, true);
    setFaceUv(this.uv, 4, CELL_BACK);
    setFaceUv(this.uv, 5, CELL_BACK);
    this.mesh = new THREE.Mesh(geometry, getMaterials().normal);
    this.mesh.userData.card3d = this;
    this.mesh.castShadow = true;

    // Рамка лежит сразу за лицом карты и чуть больше неё — снаружи видна золотая кайма.
    const halo = getHalo();
    this.halo = new THREE.Mesh(halo.geometry, halo.lit);
    this.halo.position.z = CARD_T / 2 - 0.004;
    this.halo.visible = false;
    this.mesh.add(this.halo);
  }

  /** Показать на лице карту (или рубашку, если карта неизвестна). */
  setFace(card: Card | null): void {
    this.face = card;
    setFaceUv(this.uv, 4, card ? cardCell(card) : CELL_BACK);
    this.uv.needsUpdate = true;
  }

  setLook(look: Look): void {
    this.mesh.material = getMaterials()[look];
    this.halo.visible = look === 'lit' || look === 'chosen';
    this.halo.material = look === 'chosen' ? getHalo().chosen : getHalo().lit;
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
    this.spin = options.spin ?? 0;
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
    if (this.spin !== 0) this.mesh.quaternion.premultiply(spinQuaternion.setFromAxisAngle(UP, this.spin * Math.sin(Math.PI * k)));
    this.mesh.scale.setScalar(this.fromScale + (scale - this.fromScale) * k);
  }
}
