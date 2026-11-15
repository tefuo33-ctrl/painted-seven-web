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
import type { Stage } from '../three/stage';
import { SEATS } from '../three/table';
import { tableStateFromGame } from '../three/tableState';
import { TableView } from '../three/tableView';
import { TurnMarker } from '../three/turnMarker';
import { type UiState, HUMAN, appHtml } from './view';

const SAVE_KEY = 'painted-seven-save-v2';
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
    hasSave: load<GameState>(SAVE_KEY) !== null,
    modal: { kind: 'none' },
    selected: null,
    dealing: false,
  };
  const table = new TableView(stage);
  const marker = new TurnMarker(stage);

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

  /** Привести 3D-стол к состоянию партии. */
  function syncTable(options: { deal?: boolean } = {}): void {
    const game = ui.game;
    if (!game) return;
    table.selected = ui.selected;
    table.sync(tableStateFromGame(game, HUMAN), {
      deal: options.deal,
      firstSeat: firstPlayer(game),
    });
    const active = !ui.dealing && (game.phase === 'bidding' || game.phase === 'playing') ? game.turn : null;
    marker.show(ui.screen === 'game' ? active : null);
  }

  /** Таблички соперников стоят над их креслами: считаем место на экране каждый кадр. */
  const anchor = new THREE.Vector3();
  function positionPlates(): void {
    root.querySelectorAll<HTMLElement>('.plate[data-seat]').forEach((plate) => {
      const seat = Number(plate.dataset.seat);
      if (seat === 0) return;
      const spot = SEATS[seat];
      const point = stage.toScreen(anchor.set(spot.x * 0.94, 4.1, spot.z * 0.94));
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
    if (!game) return;
    store(SAVE_KEY, game.phase === 'gameOver' ? null : game);
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
          playCard(game, game.turn, move.card, move.joker);
        } else if (game.phase === 'trickEnd') {
          // Даём рассмотреть взятку (нажатие на стол ускоряет), потом она улетает к победителю.
          await Promise.race([sleep(TRICK_DELAY), new Promise<void>((resolve) => (skipTrickWait = resolve))]);
          skipTrickWait = null;
          if (!alive()) break;
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
    act(() => playCard(game, HUMAN, card));
  }

  function playJoker(mode: JokerMode, demand?: JokerDemand): void {
    const game = myTurnToPlay();
    const card = game?.hands[HUMAN].find(isJoker);
    ui.modal = { kind: 'none' };
    if (!game || !card) return;
    act(() => playCard(game, HUMAN, card, { mode, demand }));
  }

  function startGame(game: GameState): void {
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
        startGame(createGame({ settings: ui.settings }));
        break;
      case 'continue': {
        const saved = load<GameState>(SAVE_KEY);
        if (saved) startGame(saved);
        break;
      }
      case 'to-menu':
        session++;
        working = false;
        ui.screen = 'menu';
        ui.modal = { kind: 'none' };
        marker.show(null);
        render();
        break;
      case 'open-rules':
      case 'open-sheet':
      case 'open-quit':
        ui.modal = { kind: action.slice(5) as 'rules' | 'sheet' | 'quit' };
        render();
        break;
      case 'close-modal':
        ui.modal = { kind: 'none' };
        render();
        break;
      case 'bid':
        if (game && !working) act(() => placeBid(game, HUMAN, Number(value)));
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
        if (game) act(() => nextRound(game));
        break;
      default:
        break;
    }
  }

  // Один обработчик на весь интерфейс: ищем ближайший элемент с data-action.
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

  // Настройки правил в меню.
  root.addEventListener('change', (event) => {
    const element = event.target as HTMLSelectElement;
    const key = element.dataset?.setting as keyof RuleSettings | undefined;
    if (!key) return;
    const raw = element.value;
    const value = raw === 'true' ? true : raw === 'false' ? false : /^-?\d+$/.test(raw) ? Number(raw) : raw;
    ui.settings = { ...ui.settings, [key]: value };
    store(SETTINGS_KEY, ui.settings);
  });

  // Для проверки из консоли браузера.
  Object.assign(window, { paintedSeven: { ui, table, tapCard, isWorking: () => working } });

  render();
}
