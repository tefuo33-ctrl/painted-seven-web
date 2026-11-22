// Золотые слитки — игровая валюта на столе (модель из 3D-сессии: public/models/gold_bar.glb).
//
// Что показывают: заказ каждого игрока. Заказал N взяток — N слитков перелетают у него из рук
// на стол и встают пирамидкой перед ним (4 + 3 + 2, до девяти). Каждая взятая взятка
// «зажигает» один слиток: видно, сколько игрок заказал и сколько уже взял.
// В раундах без заказа («Минуса», «Плюса») слитков нет. В новом раунде слитки уходят со стола.

import * as THREE from 'three';
import { createLoader } from './loader';
import { playGoldSound } from '../ui/sound';
import { METRE, SEATS, seatPoint } from './table';

const MODEL_URL = `${import.meta.env.BASE_URL}models/gold_bar.glb`;
/** Слиток в 1.2 раза крупнее настоящего (8 см), чтобы его было видно с другого конца стола. */
const BAR_SCALE = METRE * 1.2;
/** Размеры слитка в метрах: ширина низа и высота. */
const BAR_WIDTH = 0.034;
const BAR_HEIGHT = 0.024;
/** Пирамидка: сколько слитков в каждом слое снизу вверх. */
const LAYERS = [4, 3, 2];
const FLIGHT = 0.6;
/** Насколько левее игрока и как далеко от центра стола лежит его стопка. */
const STACK_LEFT = 3.6;
const STACK_FROM_CENTER = 5.0;
const STAGGER = 0.13;

/**
 * Где стоит пирамидка каждого места и как она повёрнута (угол длинной стороны слитков).
 * Места: 0 — я, 1 — слева, 2 — напротив, 3 — справа. Подобраны так, чтобы не задевать
 * ряд взятки посередине, колоду справа вдали и борт стола.
 */
const STACKS: { x: number; z: number; yaw: number }[] = SEATS.map((seat, index) => {
  // У каждого — слева от него (если смотреть с его места), ближе к его краю стола.
  const point = seatPoint(index, -STACK_LEFT, 0, STACK_FROM_CENTER);
  // Слитки лежат длинной стороной к игроку, ряд — вдоль его края стола.
  return { x: point.x, z: point.z, yaw: seat.angle + Math.PI / 2 };
});

interface Bar {
  mesh: THREE.Mesh;
  /** Откуда и куда летит, 0…1 — сколько пролетел; delay — сколько ждать до вылета. */
  from: THREE.Vector3;
  to: THREE.Vector3;
  yaw: number;
  spin: number;
  progress: number;
  delay: number;
  leaving: boolean;
  landed: boolean;
}

let template: Promise<THREE.Mesh | null> | null = null;

function loadTemplate(): Promise<THREE.Mesh | null> {
  if (!template) {
    template = createLoader()
      .loadAsync(MODEL_URL)
      .then((gltf) => {
        let found: THREE.Mesh | null = null;
        gltf.scene.traverse((object) => {
          const mesh = object as THREE.Mesh;
          if (mesh.isMesh && !found) found = mesh;
        });
        const mesh = found as THREE.Mesh | null;
        if (!mesh) return null;
        const material = mesh.material as THREE.MeshStandardMaterial;
        for (const texture of [material.map, material.emissiveMap]) {
          if (!texture) continue;
          texture.magFilter = THREE.NearestFilter;
          texture.minFilter = THREE.NearestFilter;
          texture.generateMipmaps = false;
          texture.needsUpdate = true;
        }
        material.emissiveIntensity = 0.35;
        return mesh;
      })
      .catch((error) => {
        console.warn('Слиток не загрузился — слитков на столе не будет', error);
        return null;
      });
  }
  return template;
}

function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export class GoldBars {
  private group = new THREE.Group();
  private bars: Bar[][] = [[], [], [], []];
  private model: THREE.Mesh | null = null;
  private litMaterial: THREE.MeshStandardMaterial | null = null;
  private pending: { bids: (number | null)[]; taken: number[] } | null = null;
  /** Откуда вылетают слитки места (кисти игрока; для меня — низ экрана). */
  private origin: (seat: number) => THREE.Vector3;

  constructor(scene: THREE.Scene, origin: (seat: number) => THREE.Vector3) {
    this.origin = origin;
    scene.add(this.group);
    void loadTemplate().then((model) => {
      if (!model) return;
      this.model = model;
      // Взятая взятка — слиток ярче светится.
      const lit = (model.material as THREE.MeshStandardMaterial).clone();
      lit.emissiveIntensity = 1.4;
      this.litMaterial = lit;
      if (this.pending) this.sync(this.pending.bids, this.pending.taken);
    });
  }

  /** Место слитка номер `index` в пирамидке места `seat` (координаты сцены). */
  private slot(seat: number, index: number): THREE.Vector3 {
    let layer = 0;
    let rest = index;
    while (layer < LAYERS.length - 1 && rest >= LAYERS[layer]) {
      rest -= LAYERS[layer];
      layer++;
    }
    const inLayer = LAYERS[layer];
    const pitch = BAR_WIDTH * BAR_SCALE * 1.04;
    const along = (rest - (inLayer - 1) / 2) * pitch;
    const stack = STACKS[seat];
    // Слитки лежат рядом поперёк длинной стороны; ряд идёт перпендикулярно yaw.
    const across = new THREE.Vector3(Math.sin(stack.yaw), 0, Math.cos(stack.yaw));
    return new THREE.Vector3(stack.x, 0.02 + layer * BAR_HEIGHT * BAR_SCALE * 0.98, stack.z).addScaledVector(across, along);
  }

  /** Привести слитки к заказам (по местам; null — заказа нет) и взятым взяткам. */
  sync(bids: (number | null)[], taken: number[]): void {
    this.pending = { bids, taken };
    if (!this.model) return;
    for (let seat = 0; seat < 4; seat++) {
      const want = Math.min(9, bids[seat] ?? 0);
      const bars = this.bars[seat].filter((bar) => !bar.leaving);
      // Лишние уходят со стола (новый раунд).
      for (let i = want; i < bars.length; i++) this.leave(bars[i]);
      // Недостающие прилетают из рук.
      for (let i = bars.length; i < want; i++) this.arrive(seat, i, i - bars.length);
      // Взятые взятки зажигают слитки снизу вверх.
      const active = this.bars[seat].filter((bar) => !bar.leaving);
      active.forEach((bar, i) => {
        bar.mesh.material = i < (taken[seat] ?? 0) && this.litMaterial ? this.litMaterial : this.model!.material;
      });
    }
  }

  private arrive(seat: number, index: number, order: number): void {
    const mesh = this.model!.clone();
    mesh.scale.setScalar(BAR_SCALE);
    mesh.castShadow = true;
    const from = this.origin(seat);
    mesh.position.copy(from);
    mesh.visible = false;
    this.group.add(mesh);
    this.bars[seat].push({
      mesh,
      from,
      to: this.slot(seat, index),
      yaw: STACKS[seat].yaw + (Math.random() - 0.5) * 0.08,
      spin: (Math.random() < 0.5 ? -1 : 1) * Math.PI * (1 + Math.random()),
      progress: 0,
      delay: order * STAGGER,
      leaving: false,
      landed: false,
    });
  }

  private leave(bar: Bar): void {
    bar.leaving = true;
    bar.from = bar.mesh.position.clone();
    bar.to = bar.from.clone().setY(-0.4);
    bar.progress = 0;
    bar.delay = Math.random() * 0.15;
  }

  update(delta: number): void {
    for (const seatBars of this.bars) {
      for (let i = seatBars.length - 1; i >= 0; i--) {
        const bar = seatBars[i];
        if (bar.delay > 0) {
          bar.delay -= delta;
          continue;
        }
        bar.mesh.visible = true;
        if (bar.progress >= 1) continue;
        bar.progress = Math.min(1, bar.progress + delta / (bar.leaving ? 0.35 : FLIGHT));
        const t = ease(bar.progress);
        if (bar.leaving) {
          // Уходит: тонет в сукно и исчезает.
          bar.mesh.position.lerpVectors(bar.from, bar.to, t);
          bar.mesh.scale.setScalar(BAR_SCALE * (1 - t));
          if (bar.progress >= 1) {
            this.group.remove(bar.mesh);
            seatBars.splice(i, 1);
          }
          continue;
        }
        // Летит дугой из рук на стол, вращаясь, и плавно останавливается.
        bar.mesh.position.lerpVectors(bar.from, bar.to, t);
        bar.mesh.position.y += Math.sin(Math.PI * t) * 1.4;
        bar.mesh.rotation.set(0, bar.yaw + bar.spin * (1 - t), Math.sin(Math.PI * t) * 0.5);
        if (bar.progress >= 1 && !bar.landed) {
          bar.landed = true;
          bar.mesh.position.copy(bar.to);
          playGoldSound();
        }
      }
    }
  }
}
