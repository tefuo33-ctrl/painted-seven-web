// Управление игрой в браузере: нажатия человека, ходы ботов, анимации 3D-стола, сохранение.
// Правила здесь не проверяются — это делает движок (src/engine).

import * as THREE from 'three';
import { chooseBid, chooseMove } from '../ai/bot';
import {
  type GameState,
  type JokerDemand,
  type JokerMode,
  type RuleSettings,
  DEFAULT_SETTINGS,
  cardLabel,
  createGame,
  dealCards,
  finishTrick,
  firstPlayer,
  isJoker,
  jokerDemandsFor,
  legalCardsFor,
  nextRound,
  placeBid,
  playCard,
} from '../engine';
import { type Net, clientId, connect, serverUrl } from '../net/client';
import type { ServerMessage } from '../net/protocol';
import { pickBotNames } from '../shared/names';
import { type Skin, randomGender, randomSkin } from '../three/character';
import { Players } from '../three/players';
import { gfx, saveGfx } from '../three/gfx';
import type { Stage } from '../three/stage';
import { SEATS } from '../three/table';
import { tableStateFromGame } from '../three/tableState';
import { TableView } from '../three/tableView';
import { TurnMarker } from '../three/turnMarker';
import { displayName, loadProfile, saveProfile } from './profile';
import { playCardSound, playShuffleSound, playTrickSound, setSoundEnabled, unlockSound } from './sound';
import { type UiState, HUMAN, appHtml } from './view';

/** Сохранённая партия: состояние движка и внешний вид игроков за столом. */
interface SavedTable {
  game: GameState;
  skins: (Skin | null)[];
}

const SAVE_KEY = 'painted-seven-save-v3';
const SETTINGS_KEY = 'painted-seven-settings-v2';

// Паузы, чтобы человек успевал следить за игрой (в миллисекундах).
const BOT_DELAY = 700;
const TRICK_DELAY = 1300;

function load<T>(key: string): T | null {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null; // хранилище недоступно (например, приватный режим) — играем без сохранения
  }
}

function store(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // не страшно: просто не сохранится
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function startApp(root: HTMLElement, stage: Stage): void {
  const ui: UiState = {
    screen: 'menu',
    game: null,
    settings: { ...DEFAULT_SETTINGS, ...(load<Partial<RuleSettings>>(SETTINGS_KEY) ?? {}) },
    hasSave: load<SavedTable>(SAVE_KEY) !== null,
    profile: loadProfile(),
    modal: { kind: 'none' },
    selected: null,
    dealing: false,
    online: null,
    joinCode: (new URLSearchParams(location.search).get('room') ?? '').toUpperCase().slice(0, 5),
    linkCopied: false,
  };
  const table = new TableView(stage);
  const marker = new TurnMarker(stage);
  const players = new Players(stage);
  let skins: (Skin | null)[] = [];

  /** Номер «запуска» игры. Меняется при выходе в меню — старые таймеры это видят и молчат. */
  let session = 0;
  /** Идёт ли сейчас автоматическое действие (бот думает, летят карты). */
  let working = false;
  let skipTrickWait: (() => void) | null = null;

  // ---------- Отрисовка ----------

  function render(): void {
    root.innerHTML = appHtml(ui);
    positionPlates();
  }

  let lastTrickLength = 0;

  /** Привести 3D-стол к состоянию партии. */
  function syncTable(options: { deal?: boolean } = {}): void {
    const game = ui.game;
    if (!game) return;
    // Щелчок, когда на стол легла новая карта.
    if (game.trick.length > lastTrickLength) playCardSound();
    lastTrickLength = game.trick.length;
    if (options.deal) playShuffleSound();
    table.selected = ui.selected;
    table.sync(tableStateFromGame(game, HUMAN), {
      deal: options.deal,
      firstSeat: firstPlayer(game),
    });
    const active = !ui.dealing && (game.phase === 'bidding' || game.phase === 'playing') ? game.turn : null;
    marker.show(ui.screen === 'game' ? active : null);
    players.lookAtSeat(active);
  }

  /** Таблички соперников стоят над их креслами: считаем место на экране каждый кадр. */
  const anchor = new THREE.Vector3();
  function positionPlates(): void {
    root.querySelectorAll<HTMLElement>('.plate[data-seat]').forEach((plate) => {
      const seat = Number(plate.dataset.seat);
      if (seat === 0) return;
      const spot = SEATS[seat];
      const point = stage.toScreen(anchor.set(spot.x, 5.2, spot.z));
      // Не даём табличке уйти за край экрана.
      const half = plate.offsetWidth / 2 + 6;
      const x = Math.min(Math.max(point.x, half), root.clientWidth - half);
      plate.style.left = `${x}px`;
      plate.style.top = `${Math.max(point.y, plate.offsetHeight + 52)}px`;
    });
  }
  stage.onFrame(positionPlates);

  function save(): void {
    const game = ui.game;
    if (!game || ui.online) return; // партию с друзьями хранит сервер
    store(SAVE_KEY, game.phase === 'gameOver' ? null : ({ game, skins } satisfies SavedTable));
    ui.hasSave = game.phase !== 'gameOver';
  }

  // ---------- Ход игры ----------

  /** Двигает партию вперёд, пока не понадобится решение человека. */
  async function advance(): Promise<void> {
    if (working) return;
    working = true;
    const mySession = session;
    const alive = () => mySession === session && ui.screen === 'game' && ui.game !== null;
    try {
      while (alive()) {
        const game = ui.game!;
        render();
        syncTable();
        save();

        if (game.phase === 'deal') {
          // Тасование и раздача: только анимация, никаких кнопок.
          ui.dealing = true;
          render();
          await table.shuffle();
          if (!alive()) break;
          dealCards(game);
          syncTable({ deal: true });
          await waitForCards();
          ui.dealing = false;
        } else if (game.phase === 'bidding') {
          if (game.turn === HUMAN) break;
          await sleep(BOT_DELAY);
          if (!alive()) break;
          placeBid(game, game.turn, chooseBid(game, game.turn));
        } else if (game.phase === 'playing') {
          if (game.turn === HUMAN) break;
          await sleep(BOT_DELAY);
          if (!alive()) break;
          const move = chooseMove(game, game.turn);
          players.throwCard(game.turn);
          playCard(game, game.turn, move.card, move.joker);
        } else if (game.phase === 'trickEnd') {
          // Даём рассмотреть взятку (нажатие на стол ускоряет), потом она улетает к победителю.
          await Promise.race([sleep(TRICK_DELAY), new Promise<void>((resolve) => (skipTrickWait = resolve))]);
          skipTrickWait = null;
          if (!alive()) break;
          players.nod(game.trickWinner ?? 0);
          playTrickSound();
          await table.collectTrick(game.trickWinner ?? 0);
          if (!alive()) break;
          finishTrick(game);
        } else {
          break; // roundEnd и gameOver ждут кнопку в окне
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      // Если за это время началась новая партия, её состояние не трогаем.
      if (mySession === session) {
        working = false;
        ui.dealing = false;
        render();
        syncTable();
      }
    }
  }

  async function waitForCards(): Promise<void> {
    for (let i = 0; i < 200 && table.busy; i++) await sleep(50);
  }

  // ---------- Игра с друзьями (через сервер) ----------

  let net: Net | null = null;
  /** Состояния от сервера обрабатываем строго по очереди, чтобы успевали анимации. */
  const incoming: GameState[] = [];
  let processing = false;

  function lobbyError(message: string): void {
    ui.online = { status: 'ready', code: null, seats: [], host: false, started: false, ...(ui.online ?? {}), error: message };
    ui.online.status = 'ready';
    render();
  }

  async function ensureNet(): Promise<Net | null> {
    if (net) return net;
    const url = serverUrl();
    if (!url) {
      lobbyError('Сервер для игры с друзьями ещё не подключён. Как его запустить — в README.');
      return null;
    }
    ui.online = { status: 'connecting', code: null, seats: [], host: false, started: false, error: null };
    render();
    try {
      net = await connect(url, { onMessage: onServerMessage, onClose: onServerClose });
      return net;
    } catch {
      lobbyError('Не удалось подключиться к серверу. Проверьте интернет и попробуйте ещё раз.');
      return null;
    }
  }

  function onServerClose(): void {
    net = null;
    if (!ui.online) return;
    const code = ui.online.code;
    leaveOnline();
    ui.screen = 'lobby';
    ui.joinCode = code ?? ui.joinCode;
    lobbyError('Связь с сервером потеряна. Нажмите «Войти», чтобы вернуться в комнату.');
  }

  function onServerMessage(message: ServerMessage): void {
    if (message.t === 'error') {
      if (ui.screen === 'lobby') lobbyError(message.message);
      else console.error(message.message);
      return;
    }
    if (message.t === 'room') {
      ui.online = {
        status: 'ready',
        code: message.code,
        seats: message.seats,
        host: message.host,
        started: message.started,
        error: null,
      };
      if (message.started) {
        skins = message.seats.map((seat) => seat?.skin ?? null);
        players.seat(skins);
      }
      if (ui.screen === 'lobby') render();
      return;
    }
    incoming.push(message.game);
    void processIncoming();
  }

  /** Показать очередное состояние от сервера, проиграв нужные анимации. */
  async function processIncoming(): Promise<void> {
    if (processing) return;
    processing = true;
    working = true;
    const mySession = session;
    try {
      while (incoming.length > 0 && mySession === session) {
        const next = incoming.shift()!;
        const previous = ui.screen === 'game' ? ui.game : null;

        // Взятка сыграна и на сервере уже забрана — показываем, как она улетает.
        if (previous?.phase === 'trickEnd' && !(next.phase === 'trickEnd' && next.trick.length === 4)) {
          players.nod(previous.trickWinner ?? 0);
          playTrickSound();
          await table.collectTrick(previous.trickWinner ?? 0);
        }
        if (previous && next.trick.length > previous.trick.length) {
          players.throwCard(next.trick[next.trick.length - 1].player);
        }
        const dealtNow = next.dealt && (!previous || !previous.dealt || previous.roundIndex !== next.roundIndex);

        ui.game = next;
        ui.screen = 'game';
        ui.selected = null;
        if (next.phase !== 'roundEnd' && next.phase !== 'gameOver' && ui.modal.kind === 'none') ui.modal = { kind: 'none' };

        if (next.phase === 'deal') {
          ui.dealing = true;
          render();
          syncTable();
          await table.shuffle();
        } else if (dealtNow) {
          ui.dealing = true;
          render();
          syncTable({ deal: true });
          await waitForCards();
          ui.dealing = false;
          render();
          syncTable();
        } else {
          ui.dealing = false;
          render();
          syncTable();
        }
      }
    } finally {
      processing = false;
      if (mySession === session) {
        working = false;
        render();
        syncTable();
      }
    }
  }

  function leaveOnline(): void {
    net?.send({ t: 'leave' });
    net?.close();
    net = null;
    incoming.length = 0;
    ui.online = null;
    session++;
    working = false;
  }

  // ---------- Действия человека ----------

  /** Действие человека: выполнить и продолжить партию. */
  function act(action: () => void): void {
    try {
      action();
    } catch (error) {
      console.error(error); // нелегальное действие движок отклоняет — состояние не портится
    }
    ui.selected = null;
    void advance();
  }

  function myTurnToPlay(): GameState | null {
    const game = ui.game;
    return game && !working && game.phase === 'playing' && game.turn === HUMAN ? game : null;
  }

  /** Нажатие на карту в руке: первое выбирает, второе ходит. */
  function tapCard(label: string): void {
    const game = myTurnToPlay();
    if (!game) return;
    const card = legalCardsFor(game, HUMAN).find((c) => cardLabel(c) === label);
    if (!card) return; // этой картой сейчас ходить нельзя
    if (ui.selected !== label) {
      ui.selected = label;
      render();
      syncTable();
      return;
    }
    if (isJoker(card)) {
      ui.modal = { kind: 'joker', mode: null }; // сначала спросим, как сыграть джокер
      render();
      return;
    }
    if (net) {
      ui.selected = null;
      net.send({ t: 'play', card });
      return;
    }
    act(() => playCard(game, HUMAN, card));
  }

  function playJoker(mode: JokerMode, demand?: JokerDemand): void {
    const game = myTurnToPlay();
    const card = game?.hands[HUMAN].find(isJoker);
    ui.modal = { kind: 'none' };
    if (!game || !card) return;
    if (net) {
      ui.selected = null;
      net.send({ t: 'play', card, joker: { mode, demand } });
      return;
    }
    act(() => playCard(game, HUMAN, card, { mode, demand }));
  }

  function startGame(game: GameState, tableSkins: (Skin | null)[]): void {
    skins = tableSkins;
    players.seat(skins);
    session++;
    working = false;
    ui.game = game;
    ui.screen = 'game';
    ui.modal = { kind: 'none' };
    ui.selected = null;
    void advance();
  }

  function handleAction(action: string, value: string): void {
    const game = ui.game;
    switch (action) {
      case 'start':
        {
          // С каждой новой игрой у ботов новые имена и внешность; имя соответствует полу персонажа.
          const genders = [randomGender(), randomGender(), randomGender()];
          const myName = displayName(ui.profile);
          const names = pickBotNames(genders, [myName]);
          startGame(createGame({ settings: ui.settings, playerNames: [myName, ...names] }), [
            null,
            ...genders.map((gender) => randomSkin(gender)),
          ]);
        }
        break;
      case 'continue': {
        const saved = load<SavedTable>(SAVE_KEY);
        if (saved) startGame(saved.game, saved.skins);
        break;
      }
      case 'open-lobby':
        ui.screen = 'lobby';
        ui.online = null;
        render();
        break;
      case 'leave-lobby':
        leaveOnline();
        ui.screen = 'menu';
        render();
        break;
      case 'create-room':
        void ensureNet().then((connection) =>
          connection?.send({
            t: 'create',
            clientId: clientId(),
            name: displayName(ui.profile),
            skin: ui.profile.skin,
            settings: ui.settings,
          }),
        );
        break;
      case 'join-room':
        if (ui.joinCode.length < 5) {
          lobbyError('Введите код комнаты из пяти символов.');
          break;
        }
        void ensureNet().then((connection) =>
          connection?.send({
            t: 'join',
            clientId: clientId(),
            code: ui.joinCode,
            name: displayName(ui.profile),
            skin: ui.profile.skin,
          }),
        );
        break;
      case 'start-room':
        net?.send({ t: 'start' });
        break;
      case 'copy-link': {
        const link = root.querySelector<HTMLInputElement>('[data-room-link]')?.value ?? '';
        void navigator.clipboard?.writeText(link).then(() => {
          ui.linkCopied = true;
          render();
        });
        break;
      }
      case 'to-menu':
        if (ui.online) leaveOnline();
        session++;
        working = false;
        ui.screen = 'menu';
        ui.modal = { kind: 'none' };
        marker.show(null);
        render();
        break;
      case 'open-wardrobe':
        ui.screen = 'wardrobe';
        players.showWardrobe(ui.profile.skin);
        render();
        break;
      case 'close-wardrobe':
        ui.screen = 'menu';
        players.showWardrobe(null);
        render();
        break;
      case 'skin': {
        // value вида «tie:3» или «gender:female».
        const [key, raw] = value.split(':');
        const skin = { ...ui.profile.skin, [key]: key === 'gender' ? raw : Number(raw) } as Skin;
        ui.profile = { ...ui.profile, skin };
        saveProfile(ui.profile);
        players.showWardrobe(skin);
        render();
        break;
      }
      case 'toggle-sound':
        gfx.sound = !gfx.sound;
        setSoundEnabled(gfx.sound);
        saveGfx();
        render();
        break;
      case 'open-rules':
      case 'open-sheet':
      case 'open-quit':
      case 'open-settings':
        ui.modal = { kind: action.slice(5) as 'rules' | 'sheet' | 'quit' | 'settings' };
        render();
        break;
      case 'close-modal':
        ui.modal = { kind: 'none' };
        render();
        break;
      case 'bid':
        if (game && !working && net) net.send({ t: 'bid', bid: Number(value) });
        else if (game && !working) act(() => placeBid(game, HUMAN, Number(value)));
        break;
      case 'joker-mode': {
        const mode = value as JokerMode;
        // Если это заход — спросим ещё, что потребовать у остальных.
        if (game && jokerDemandsFor(game).length > 0) {
          ui.modal = { kind: 'joker', mode };
          render();
        } else {
          playJoker(mode);
        }
        break;
      }
      case 'joker-demand':
        if (ui.modal.kind === 'joker' && ui.modal.mode) {
          playJoker(ui.modal.mode, value ? (value as JokerDemand) : undefined);
        }
        break;
      case 'next-round':
        ui.modal = { kind: 'none' };
        if (net) net.send({ t: 'next' });
        else if (game) act(() => nextRound(game));
        break;
      default:
        break;
    }
  }

  // Один обработчик на весь интерфейс: ищем ближайший элемент с data-action.
  setSoundEnabled(gfx.sound);
  // Браузер разрешает звук только после первого нажатия человека.
  window.addEventListener('pointerdown', unlockSound, { once: false, passive: true });

  root.addEventListener('click', (event) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!element || (element as HTMLButtonElement).disabled) return;
    handleAction(element.dataset.action ?? '', element.dataset.value ?? '');
  });

  // Нажатия на 3D-сцену: выбор карты в руке или ускорение показа взятки.
  stage.canvas.addEventListener('click', (event) => {
    if (ui.screen !== 'game' || ui.modal.kind !== 'none') return;
    if (skipTrickWait) {
      skipTrickWait();
      return;
    }
    const label = table.pick(event.clientX, event.clientY);
    if (label) {
      tapCard(label);
    } else if (ui.selected) {
      ui.selected = null; // нажали мимо — снимаем выбор
      render();
      syncTable();
    }
  });

  // Имя игрока в «Гардеробе».
  root.addEventListener('input', (event) => {
    const element = event.target as HTMLInputElement;
    if (element.dataset?.joinCode !== undefined) {
      ui.joinCode = element.value.toUpperCase().slice(0, 5);
      return;
    }
    if (element.dataset?.profile !== 'name') return;
    ui.profile = { ...ui.profile, name: element.value };
    saveProfile(ui.profile);
  });

  // Настройки правил в меню.
  root.addEventListener('change', (event) => {
    const element = event.target as HTMLSelectElement;
    const gfxKey = element.dataset?.gfx;
    if (gfxKey) {
      // Настройки звука и графики применяются сразу.
      if (gfxKey === 'sound') gfx.sound = element.value === 'true';
      if (gfxKey === 'bloom') gfx.bloom = element.value === 'true';
      if (gfxKey === 'quality') gfx.quality = element.value === 'low' ? 'low' : 'high';
      if (gfxKey === 'pixelScale') gfx.pixelScale = Number(element.value);
      setSoundEnabled(gfx.sound);
      saveGfx();
      stage.applySettings();
      return;
    }
    const key = element.dataset?.setting as keyof RuleSettings | undefined;
    if (!key) return;
    const raw = element.value;
    const value = raw === 'true' ? true : raw === 'false' ? false : /^-?\d+$/.test(raw) ? Number(raw) : raw;
    ui.settings = { ...ui.settings, [key]: value };
    store(SETTINGS_KEY, ui.settings);
  });

  // Для проверки из консоли браузера.
  Object.assign(window, { paintedSeven: { ui, table, tapCard, isWorking: () => working } });

  // Открыли ссылку-приглашение (?room=КОД) — сразу показываем вход в комнату.
  if (ui.joinCode) ui.screen = 'lobby';
  render();
}
