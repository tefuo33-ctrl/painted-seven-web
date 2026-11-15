// Персонажи за столом (соперники) и персонаж в «Гардеробе».

import * as THREE from 'three';
import { Character, type Skin } from './character';
import type { Stage } from './stage';
import { SEATS } from './table';

/** Где персонаж сидит относительно центра кресла (ближе к спинке). */
const SIT_OFFSET = 0.35;

export class Players {
  private stage: Stage;
  private characters = new Map<number, Character>();
  private wardrobe: Character | null = null;
  private wardrobeSpin = 0;

  constructor(stage: Stage) {
    this.stage = stage;
    stage.onFrame((time, delta) => {
      for (const character of this.characters.values()) character.update(time, delta);
      if (this.wardrobe) {
        this.wardrobeSpin += delta * 0.6;
        this.wardrobe.group.rotation.y = this.wardrobeSpin;
        this.wardrobe.update(time, delta);
      }
    });
  }

  /** Посадить соперников. `skins[seat]` — внешний вид; место 0 (я) не рисуется. */
  seat(skins: (Skin | null)[]): void {
    for (const character of this.characters.values()) this.stage.scene.remove(character.group);
    this.characters.clear();
    skins.forEach((skin, seat) => {
      if (seat === 0 || !skin) return;
      const spot = SEATS[seat];
      const character = new Character(skin);
      const distance = Math.hypot(spot.x, spot.z);
      const scale = (distance + SIT_OFFSET) / distance;
      character.group.position.set(spot.x * scale, 0, spot.z * scale);
      character.group.rotation.y = spot.angle;
      this.characters.set(seat, character);
      this.stage.scene.add(character.group);
    });
  }

  clear(): void {
    this.seat([]);
  }

  /** Все поворачивают голову к тому, кто ходит (сам ходящий смотрит на стол). */
  lookAtSeat(active: number | null): void {
    const center = new THREE.Vector3(0, 1, 0);
    for (const [seat, character] of this.characters) {
      if (active === null || active === seat) {
        character.lookAt(center);
      } else {
        const spot = SEATS[active];
        character.lookAt(new THREE.Vector3(spot.x, 2.5, spot.z));
      }
    }
  }

  throwCard(seat: number): void {
    this.characters.get(seat)?.throwCard();
  }

  nod(seat: number): void {
    this.characters.get(seat)?.nod();
  }

  /** Показать стоящего персонажа для «Гардероба» (null — убрать). */
  showWardrobe(skin: Skin | null): void {
    if (!skin) {
      if (this.wardrobe) this.stage.scene.remove(this.wardrobe.group);
      this.wardrobe = null;
      this.stage.setView('table');
      return;
    }
    if (!this.wardrobe) {
      this.wardrobe = new Character(skin, false);
      this.wardrobe.group.position.set(0, 0, 16);
      this.wardrobeSpin = Math.PI; // сначала лицом к камере
      this.stage.scene.add(this.wardrobe.group);
      this.stage.setView('wardrobe');
    } else {
      this.wardrobe.setSkin(skin);
    }
  }
}
