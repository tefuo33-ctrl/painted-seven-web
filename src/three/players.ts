// Персонажи за столом и персонаж в «Гардеробе».

import * as THREE from 'three';
import { Character, STANDING_LEG, type Skin } from './character';
import { type Stage, WARDROBE_SPOT } from './stage';
import { CHARACTER_SEAT_Y, FLOOR_Y, SEATS } from './table';

/** Где персонаж сидит относительно центра кресла (ближе к спинке). */
const SIT_OFFSET = 0.3;

export class Players {
  private stage: Stage;
  private characters = new Map<number, Character>();
  private wardrobe: Character | null = null;
  private anchor = new THREE.Vector3();

  constructor(stage: Stage) {
    this.stage = stage;
    stage.onFrame((time, delta) => {
      for (const [seat, character] of this.characters) {
        // Своего персонажа видно, только когда камера смотрит со стороны.
        if (seat === 0) character.group.visible = this.stage.awayFromSeat();
        character.update(time, delta);
      }
      this.wardrobe?.update(time, delta);
    });
  }

  /** Рассадить игроков. `skins[seat]` — внешний вид; место 0 — я сам. */
  seat(skins: (Skin | null)[]): void {
    for (const character of this.characters.values()) {
      this.stage.scene.remove(character.group);
    }
    this.characters.clear();
    skins.forEach((skin, seat) => {
      if (!skin) return;
      const spot = SEATS[seat];
      const character = new Character(skin);
      const distance = Math.hypot(spot.x, spot.z);
      const scale = (distance + SIT_OFFSET) / distance;
      character.group.position.set(spot.x * scale, CHARACTER_SEAT_Y, spot.z * scale);
      character.group.rotation.y = spot.angle;
      character.group.visible = seat !== 0;
      this.characters.set(seat, character);
      this.stage.scene.add(character.group);
    });
  }

  clear(): void {
    this.seat([]);
  }

  /** Точка у кистей игрока — там он держит веер карт. */
  handPosition(seat: number): THREE.Vector3 | null {
    const character = this.characters.get(seat);
    if (!character) return null;
    return character.handAnchor.getWorldPosition(this.anchor).clone();
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

  /** Показать стоящего персонажа для «Гардероба» (null — убрать). Вращает его игрок — камерой. */
  showWardrobe(skin: Skin | null): void {
    if (!skin) {
      if (this.wardrobe) {
        this.stage.scene.remove(this.wardrobe.group);
      }
      this.wardrobe = null;
      this.stage.setView('table');
      return;
    }
    if (!this.wardrobe) {
      this.wardrobe = new Character(skin, false);
      this.wardrobe.group.position.copy(WARDROBE_SPOT);
      this.wardrobe.group.position.y = FLOOR_Y + 1.2 + STANDING_LEG; // бёдра модели — на y = -1.2
      this.wardrobe.group.rotation.y = Math.PI; // лицом к камере
      this.stage.scene.add(this.wardrobe.group);
      this.stage.setView('wardrobe');
    } else {
      this.wardrobe.setSkin(skin);
    }
  }
}
