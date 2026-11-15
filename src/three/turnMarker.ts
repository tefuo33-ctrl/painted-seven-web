// Подсветка «чей ход»: тёплый луч над игроком и светящийся сектор сукна перед ним.

import * as THREE from 'three';
import { PALETTE } from './gfx';
import type { Stage } from './stage';
import { FELT_RADIUS, SEATS } from './table';

export class TurnMarker {
  private beam: THREE.Mesh;
  private sector: THREE.Mesh;
  private sectorMaterial: THREE.MeshBasicMaterial;
  private beamMaterial: THREE.MeshBasicMaterial;
  private seat: number | null = null;

  constructor(stage: Stage) {
    // Луч: полупрозрачный конус, расширяется книзу.
    this.beamMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.lantern,
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 2.4, 11, 8, 1, true), this.beamMaterial);
    this.beam.visible = false;
    stage.scene.add(this.beam);

    // Сектор стола: треугольник от центра к стороне, у которой сидит игрок.
    this.sectorMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.gold,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Array(9).fill(0), 3));
    this.sector = new THREE.Mesh(geometry, this.sectorMaterial);
    this.sector.visible = false;
    this.sector.renderOrder = 1;
    stage.scene.add(this.sector);

    stage.onFrame((time) => {
      const pulse = 0.5 + Math.sin(time * 3) * 0.5;
      this.sectorMaterial.opacity = 0.14 + pulse * 0.12;
      this.beamMaterial.opacity = 0.12 + pulse * 0.06;
    });
  }

  /** Показать, чей ход (номер места), или убрать подсветку (null). */
  show(seat: number | null): void {
    if (seat === this.seat) return;
    this.seat = seat;
    if (seat === null) {
      this.beam.visible = false;
      this.sector.visible = false;
      return;
    }
    const spot = SEATS[seat];
    const angle = Math.atan2(spot.z, spot.x);
    const position = this.sector.geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = angle + Math.PI / 8;
    const b = angle - Math.PI / 8;
    position.setXYZ(0, 0, 0.02, 0);
    position.setXYZ(1, Math.cos(a) * FELT_RADIUS, 0.02, Math.sin(a) * FELT_RADIUS);
    position.setXYZ(2, Math.cos(b) * FELT_RADIUS, 0.02, Math.sin(b) * FELT_RADIUS);
    position.needsUpdate = true;
    this.sector.geometry.computeBoundingSphere();
    this.sector.visible = true;

    // Над собой луч не нужен: камера сидит на этом месте.
    this.beam.visible = seat !== 0;
    this.beam.position.set(spot.x, 3.2, spot.z);
  }
}
