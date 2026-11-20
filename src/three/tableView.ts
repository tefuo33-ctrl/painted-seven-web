// Карты на столе в 3D. Получает «что сейчас на столе» (TableState) и сам решает,
// какая карта куда летит: колода, руки игроков, взятка, показ козыря, фишки за взятки.
// Правил здесь нет — только раскладка и анимация.

import * as THREE from 'three';
import { type Card, type Suit, cardLabel, isJoker } from '../engine';
import { CARD_SIZE, Card3D, type MoveOptions, type Pose, type PoseSource } from './card3d';
import { PALETTE, glow } from './gfx';
import type { Stage } from './stage';
import { SEATS, seatPoint } from './table';

/**
 * Что видит один игрок. Места считаются от него: 0 — он сам, дальше по часовой стрелке.
 * Чужие карты неизвестны (null) — так же и в игре по сети.
 */
export interface TableState {
  hands: (Card | null)[][];
  trick: { seat: number; card: Card }[];
  /** Сколько карт лежит в колоде. */
  deckCount: number;
  trumpCard: Card | null;
  /** У кого в руке карта козыря (место); null — она лежит на столе рядом с колодой. */
  trumpSeat: number | null;
  trump: Suit | null;
  /** Карты моей руки, которыми можно ходить (пусто, если ход не мой). */
  playable: Card[];
  /** Сколько взяток взял каждый в этом раунде (по местам). */
  taken: number[];
}

/** Где игрок держит карты: точка у его кистей и направление от центра стола. */
export interface HandAnchor {
  position: THREE.Vector3;
}

/**
 * Колода — в дальнем левом углу сукна, между картами взятки соседа слева и соседа напротив.
 * Открытый козырь лежит под колодой поперёк, как в настоящей игре: торчат его концы с индексами.
 */
const DECK_POSITION = new THREE.Vector3(2.45, 0.06, -3.3);
const DECK_YAW = -0.12;
/** Козырь под колодой поперёк и чуть ближе ко мне — видна его половина с индексом. */
const TRUMP_POSITION = new THREE.Vector3(2.45, 0.03, -2.95);
/** Круг, по которому ложатся карты взятки: центр чуть дальше от меня, чем центр стола. */
const TRICK_CENTER_Z = -1.3;
/** Шаг между картами взятки в ряду. */
const TRICK_SPACING = 1.5;
/** Половина вертикального угла обзора (тангенс), при которой веер имеет «родной» размер. */
const HAND_REFERENCE_TAN = Math.tan(THREE.MathUtils.degToRad(37.8));
/** На каком расстоянии от глаз держится мой веер (ближе ближней плоскости камеры нельзя). */
const HAND_NEAR = 1.6;
/** Сколько секунд козырь показывается всем после раздачи. */
const TRUMP_SHOW_SECONDS = 5;

const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

function quat(axis: THREE.Vector3, angle: number): THREE.Quaternion {
  return new THREE.Quaternion().setFromAxisAngle(axis, angle);
}

/** Карта лежит на столе: лицом вверх или вниз, повёрнута на угол yaw. */
function lying(yaw: number, faceUp: boolean, tilt = 0): THREE.Quaternion {
  return quat(AXIS_Y, yaw).multiply(quat(AXIS_X, ((faceUp ? -1 : 1) * Math.PI) / 2 + tilt));
}

/** Небольшой «случайный» поворот, одинаковый для одной и той же карты. */
function jitter(text: string): number {
  let hash = 0;
  for (const char of text) hash = (hash * 31 + char.charCodeAt(0)) % 1000;
  return (hash / 1000 - 0.5) * 0.3;
}

export class TableView {
  readonly cards: Card3D[] = [];
  /** Какая карта моей руки сейчас выбрана. */
  selected: string | null = null;
  /** Над какой картой моей руки сейчас указатель мыши. */
  hovered: string | null = null;
  /** Где соперники держат карты (задаётся, когда персонажи рассажены). */
  handAnchor: (seat: number) => HandAnchor | null = () => null;

  private stage: Stage;
  private group = new THREE.Group();
  private trumpCard = new Card3D();
  private trumpTimer = 0;
  private crystal: THREE.Mesh;
  private state: TableState | null = null;

  constructor(stage: Stage) {
    this.stage = stage;
    for (let i = 0; i < 36; i++) {
      const card = new Card3D();
      card.key = `d:${i}`;
      card.place(this.deckPose(i));
      this.cards.push(card);
      this.group.add(card.mesh);
    }

    // Карта, которая показывает козырь: появляется на 5 секунд после раздачи.
    this.trumpCard.mesh.visible = false;
    this.trumpCard.mesh.castShadow = false;
    this.group.add(this.trumpCard.mesh);

    // Золотой кристалл над семёркой пик: постоянно виден, пока джокер у меня в руке или на столе.
    this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), glow(PALETTE.gold, { fog: false }));
    this.crystal.scale.y = 1.5;
    this.crystal.visible = false;
    this.group.add(this.crystal);

    stage.scene.add(this.group);
    stage.onFrame((time, delta) => this.update(time, delta));
  }

  // ---------- Позы ----------

  private deckPose(index: number): Pose {
    return {
      position: DECK_POSITION.clone().setY(DECK_POSITION.y + index * 0.036),
      quaternion: lying(DECK_YAW, false),
    };
  }

  /**
   * Карты взятки ложатся по кругу: каждая — перед тем, кто ею сходил, и повёрнута к нему.
   * Круг сдвинут от меня вглубь стола, чтобы мой веер его не закрывал.
   */
  /**
   * Карты взятки ложатся в ряд посередине стола, слева направо по порядку хода, лицом ко мне —
   * как на превью стола из 3D-сессии. Чуть повёрнуты, чтобы не выглядели выложенными по линейке.
   */
  private trickPose(seat: number, order: number, card: Card): Pose {
    void seat;
    return {
      position: new THREE.Vector3((order - 1.5) * TRICK_SPACING, 0.09 + order * 0.01, TRICK_CENTER_Z),
      quaternion: lying(jitter(cardLabel(card)) * 0.5, true),
      scale: 1.3, // карты взятки крупнее: их должны прочитать все
    };
  }

  /** Козырь лежит открытым под колодой, поперёк неё. */
  private trumpRestPose(): Pose {
    return { position: TRUMP_POSITION.clone(), quaternion: lying(DECK_YAW + Math.PI / 2, true), scale: 1 };
  }

  /**
   * Веер карт в руках соперника: рубашкой к остальным. Карты расходятся из одной точки
   * у кистей — как настоящий веер, и раскладка сама подстраивается под число карт.
   */
  private opponentPose(seat: number, index: number, count: number): PoseSource {
    return () => {
      const spot = SEATS[seat];
      const length = Math.hypot(spot.x, spot.z);
      const dx = spot.x / length;
      const dz = spot.z / length;
      const yaw = Math.atan2(dx, dz);
      const pivot = this.handAnchor(seat)?.position ?? new THREE.Vector3(dx * 5.6, 0.6, dz * 5.6);
      const offset = index - (count - 1) / 2;
      // Чем больше карт, тем меньше угол между ними — веер не «разваливается».
      const step = Math.min(0.16, 1.15 / Math.max(1, count - 1));
      const quaternion = quat(AXIS_Y, yaw).multiply(quat(AXIS_X, 0.28)).multiply(quat(AXIS_Z, -offset * step));
      // Центр карты — над точкой хвата; небольшой сдвиг в глубину, чтобы карты не сливались.
      const center = new THREE.Vector3(0, 0.82 * CARD_SIZE, index * 0.014).applyQuaternion(quaternion).add(pivot);
      return { position: center, quaternion, scale: 0.92 };
    };
  }

  /** Моя рука: веер внизу экрана, привязан к камере. */
  private myHandPose(label: string, index: number, count: number, playable: boolean): PoseSource {
    return () => {
      const camera = this.stage.camera;
      // Раскладку считаем так, будто веер в 5 единицах от глаз (на вертикальном экране — в 4.6),
      // а потом уменьшаем всё в одно и то же число раз и ставим веер у самых глаз:
      // на экране карты того же размера, но они всегда над столом и не уходят в сукно,
      // даже когда игрок смотрит вниз или подаётся вперёд.
      const distance = camera.aspect < 1 ? 4.6 : 5.0;
      // Приближение сужает угол обзора — веер уменьшаем во столько же раз, чтобы он не «рос».
      const zoom = this.stage.zoom();
      const shrink = HAND_NEAR / distance;
      const halfHeight = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance * zoom;
      const halfWidth = halfHeight * camera.aspect;
      // Карты веера — одной и той же доли высоты экрана при любом угле обзора
      // (на широком экране обзор уже, и без этого веер разрастался на полстола).
      const unit = halfHeight / (HAND_REFERENCE_TAN * distance);
      const spacing = count > 1 ? Math.min(0.78 * unit, (halfWidth * 2 - 1.3 * unit) / (count - 1)) : 0;
      const offset = index - (count - 1) / 2;
      const raised =
        ((playable ? 0.14 : 0) + (this.hovered === label && playable ? 0.14 : 0) + (this.selected === label ? 0.36 : 0)) * unit;
      // Веер у нижнего края экрана, под рядом взятки.
      const local = new THREE.Vector3(
        offset * spacing,
        -halfHeight * 0.78 - offset * offset * 0.012 * unit + raised,
        -distance + index * 0.02,
      ).multiplyScalar(shrink);
      local.x /= zoom;
      local.y /= zoom;
      return {
        position: local.applyMatrix4(camera.matrixWorld),
        quaternion: camera.quaternion.clone().multiply(quat(AXIS_Z, -offset * 0.035)).multiply(quat(AXIS_X, -0.22)),
        // Свой веер — прежнего размера на экране (карты стали крупнее, а веер и так близко).
        scale: ((this.selected === label ? 1.08 : 1) * shrink * unit) / zoom / CARD_SIZE,
      };
    };
  }

  private pilePose(seat: number): Pose {
    return {
      position: seatPoint(seat, -1.2, 0.1, 3.7),
      quaternion: lying(SEATS[seat].angle, false),
      scale: 0.8,
    };
  }

  // ---------- Обновление раскладки ----------

  /**
   * Привести стол к новому состоянию. `deal` — это раздача: карты разлетаются из колоды
   * по одной, по часовой стрелке, начиная с места `firstSeat`.
   */
  sync(state: TableState, options: { deal?: boolean; firstSeat?: number } = {}): void {
    this.state = state;
    interface Wanted {
      key: string;
      face: Card | null;
      pose: PoseSource;
      move: MoveOptions;
      look: 'normal' | 'dim' | 'lit' | 'chosen';
      prefer: string;
    }
    const wanted: Wanted[] = [];
    const firstSeat = options.firstSeat ?? 1;
    const dealDelay = (seat: number, index: number) =>
      options.deal ? 0.5 + (index * 4 + ((seat - firstSeat + 4) % 4)) * 0.085 : 0;

    state.hands.forEach((hand, seat) => {
      hand.forEach((card, index) => {
        const move: MoveOptions = options.deal
          ? { delay: dealDelay(seat, index), duration: 0.36, arc: 1.3 }
          : { duration: 0.25 };
        if (seat === 0 && card) {
          const label = cardLabel(card);
          const myTurn = state.playable.length > 0;
          const playable = state.playable.some((c) => cardLabel(c) === label);
          wanted.push({
            key: `c:${label}`,
            face: card,
            pose: this.myHandPose(label, index, hand.length, myTurn && playable),
            move,
            look: !myTurn ? 'normal' : !playable ? 'dim' : this.selected === label ? 'chosen' : 'lit',
            prefer: 'd:',
          });
        } else {
          wanted.push({
            key: `h${seat}:${index}`,
            face: null,
            pose: this.opponentPose(seat, index, hand.length),
            move,
            look: 'normal',
            prefer: 'd:',
          });
        }
      });
    });

    state.trick.forEach((play, order) => {
      wanted.push({
        key: `c:${cardLabel(play.card)}`,
        face: play.card,
        pose: this.trickPose(play.seat, order, play.card),
        move: { duration: 0.4, arc: 1.0 },
        look: 'normal',
        prefer: `h${play.seat}:`,
      });
    });

    for (let i = 0; i < state.deckCount; i++) {
      wanted.push({ key: `d:${i}`, face: null, pose: this.deckPose(i), move: { duration: 0.2 }, look: 'normal', prefer: 'x:' });
    }

    // Какие 3D-карты уже стоят на нужных местах, а какие свободны.
    const byKey = new Map(this.cards.map((card) => [card.key, card]));
    const wantedKeys = new Set(wanted.map((w) => w.key));
    const free = this.cards.filter((card) => !wantedKeys.has(card.key));

    for (const want of wanted) {
      let card = byKey.get(want.key);
      const isNew = !card;
      if (!card) {
        // Берём свободную карту: лучше ту, что лежит «рядом» (в руке ходившего, в колоде).
        let index = -1;
        for (let i = free.length - 1; i >= 0; i--) {
          if (free[i].key.startsWith(want.prefer)) {
            index = i;
            break;
          }
        }
        if (index < 0) index = free.length - 1;
        card = free.splice(index, 1)[0];
        if (!card.mesh.visible) {
          card.place(this.deckPose(0)); // спрятанная карта появляется из колоды
          card.mesh.visible = true;
        }
        card.key = want.key;
      }
      if (card.face !== want.face) card.setFace(want.face);
      card.setLook(want.look);
      if (isNew || options.deal) void card.moveTo(want.pose, want.move);
      else void card.moveTo(want.pose, { duration: 0.18 });
    }

    // Лишние карты (например, собранные взятки) прячем.
    free.forEach((card, i) => {
      card.key = `x:${i}`;
      card.mesh.visible = false;
    });

    if (!state.trumpCard) this.hideTrump();
    else if (options.deal) {
      const delay = 0.6 + state.hands.flat().length * 0.085;
      // Крупно всем показываем только последнюю карту раздающего (раунды по 9 карт):
      // она видна всем, а потом уходит ему в руку. Иначе козырь просто открывается на столе у колоды.
      if (state.trumpSeat !== null) this.showTrump(state.trumpCard, delay);
      else this.layTrump(state.trumpCard, delay);
    }
    else if (this.trumpTimer <= 0) this.restTrump(state.trumpCard, state.trumpSeat);
  }

  /** Козырь с верха колоды переворачивается и ложится рядом с ней. */
  private layTrump(card: Card, delay: number): void {
    this.trumpTimer = 0;
    this.trumpCard.setFace(card);
    this.trumpCard.setLook('normal');
    this.trumpCard.place({ position: DECK_POSITION.clone().setY(0.6), quaternion: lying(0.35, false), scale: 1 });
    this.trumpCard.mesh.visible = true;
    void this.trumpCard.moveTo(this.trumpRestPose(), { duration: 0.5, arc: 0.5, delay });
  }

  /** Козырь без показа (например, продолжили сохранённую партию): сразу на своё место. */
  private restTrump(card: Card, seat: number | null): void {
    if (seat !== null) {
      this.trumpCard.mesh.visible = false;
      return;
    }
    if (this.trumpCard.mesh.visible && this.trumpCard.face === card) return;
    this.trumpCard.setFace(card);
    this.trumpCard.setLook('normal');
    this.trumpCard.place(this.trumpRestPose());
    this.trumpCard.mesh.visible = true;
  }

  /** Показать всем карту, определившую козырь: она поднимается над столом на несколько секунд. */
  private showTrump(card: Card, delay: number): void {
    this.trumpCard.setFace(card);
    this.trumpCard.setLook('lit');
    this.trumpCard.mesh.visible = true;
    this.trumpCard.place({ position: DECK_POSITION.clone().setY(0.6), quaternion: lying(0.35, false), scale: 1 });
    // Карта развёрнута лицом к камере, чтобы её было видно с любого места.
    const pose: PoseSource = () => ({
      position: new THREE.Vector3(0, 2.3, -0.6),
      quaternion: this.stage.camera.quaternion.clone(),
      scale: 2.1,
    });
    void this.trumpCard.moveTo(pose, { duration: 0.6, arc: 0.6, delay });
    this.trumpTimer = delay + 0.6 + TRUMP_SHOW_SECONDS;
  }

  private hideTrump(): void {
    this.trumpTimer = 0;
    this.trumpCard.mesh.visible = false;
  }

  /** Сыгранная взятка улетает к тому, кто её взял, и исчезает. */
  async collectTrick(winnerSeat: number): Promise<void> {
    const trick = this.cards.filter((card) => this.state?.trick.some((p) => `c:${cardLabel(p.card)}` === card.key));
    const pose = this.pilePose(winnerSeat);
    await Promise.all(trick.map((card, i) => card.moveTo(pose, { duration: 0.5, delay: i * 0.05, arc: 0.6 })));
    trick.forEach((card, i) => {
      card.mesh.visible = false;
      card.key = `x:t${i}`;
    });
  }

  /** Короткое «тасование»: половинки колоды расходятся и сходятся. Дождись конца перед раздачей. */
  async shuffle(): Promise<void> {
    const deck = this.cards.filter((card) => card.key.startsWith('d:'));
    for (let pass = 0; pass < 2; pass++) {
      await Promise.all(
        deck.map((card, i) => {
          const pose = this.deckPose(i);
          const lifted: Pose = {
            position: pose.position.clone().add(new THREE.Vector3((i + pass) % 2 === 0 ? 0.55 : -0.55, 0.25, 0)),
            quaternion: pose.quaternion,
          };
          return card.moveTo(lifted, { duration: 0.16, delay: (i % 6) * 0.015 });
        }),
      );
      await Promise.all(deck.map((card, i) => card.moveTo(this.deckPose(i), { duration: 0.16 })));
    }
  }

  /** Какая карта моей руки находится под точкой экрана (или null). */
  pick(clientX: number, clientY: number): string | null {
    const rect = this.stage.canvas.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, this.stage.camera);
    const mine = new Set((this.state?.hands[0] ?? []).map((card) => (card ? `c:${cardLabel(card)}` : '')));
    const meshes = this.cards.filter((card) => card.mesh.visible && mine.has(card.key)).map((card) => card.mesh);
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return hit ? (hit.object.userData.card3d as Card3D).key.slice(2) : null;
  }

  /** Где на экране (по горизонтали) стоят карты моей руки — по порядку веера. */
  handScreenX(): { label: string; x: number }[] {
    const mine = this.state?.hands[0] ?? [];
    return mine.flatMap((card) => {
      if (!card) return [];
      const label = cardLabel(card);
      const card3d = this.cards.find((c) => c.key === `c:${label}`);
      return card3d ? [{ label, x: this.stage.toScreen(card3d.mesh.position).x }] : [];
    });
  }

  /** Есть ли карты в полёте. */
  get busy(): boolean {
    return this.cards.some((card) => card.mesh.visible && card.moving);
  }

  private update(time: number, delta: number): void {
    for (const card of this.cards) card.update(delta);
    this.trumpCard.update(delta);

    // Показ козыря закончился: карта ложится на стол рядом с колодой
    // или (в раундах по 9 карт) улетает в руку раздающему.
    if (this.trumpTimer > 0) {
      this.trumpTimer -= delta;
      if (this.trumpTimer <= 0) {
        const seat = this.state?.trumpSeat ?? null;
        if (seat === null) {
          this.trumpCard.setLook('normal');
          void this.trumpCard.moveTo(this.trumpRestPose(), { duration: 0.55, arc: 0.4 });
        } else {
          const anchor = seat === 0 ? null : this.handAnchor(seat)?.position;
          const target: PoseSource = anchor
            ? () => ({ position: anchor.clone(), quaternion: lying(SEATS[seat].angle, false), scale: 0.8 })
            : () => {
                // Ко мне — вниз, в мой веер.
                const camera = this.stage.camera;
                const position = new THREE.Vector3(0, -1.4, -5).applyMatrix4(camera.matrixWorld);
                return { position, quaternion: camera.quaternion.clone(), scale: 1 };
              };
          void this.trumpCard.moveTo(target, { duration: 0.5, arc: 0.4 }).then(() => {
            if (this.trumpTimer <= 0 && (this.state?.trumpSeat ?? null) !== null) this.trumpCard.mesh.visible = false;
          });
        }
      }
    }

    // Кристалл парит над семёркой пик: постоянный знак «джокер у меня» и «джокер на столе».
    const joker = this.cards.find((card) => card.mesh.visible && card.face && isJoker(card.face));
    if (joker) {
      const onTable = this.state?.trick.some((p) => isJoker(p.card)) ?? false;
      const up = new THREE.Vector3(0, 1, 0);
      if (!onTable) up.applyQuaternion(joker.mesh.quaternion); // в руке — над верхним краем карты
      this.crystal.visible = true;
      // Размер и отступ — в масштабе карты: мой веер стоит у самых глаз и уменьшен.
      const size = onTable ? 1 : joker.mesh.scale.x;
      this.crystal.position.copy(joker.mesh.position).addScaledVector(up, ((onTable ? 0.7 : 0.98) + Math.sin(time * 2.4) * 0.05) * size);
      this.crystal.scale.set(1, 1.5, 1).multiplyScalar(onTable ? 1.4 : size);
      this.crystal.rotation.y = time * 2;
    } else {
      this.crystal.visible = false;
    }
  }
}
