// Управление игрой в браузере: клики человека, ходы ботов по таймеру, сохранение партии.
// Правила здесь не проверяются — это делает движок (src/engine).

import { chooseBid, chooseMove } from '../ai/bot';
import {
  type GameState,
  type JokerMode,
  type RuleSettings,
  DEFAULT_SETTINGS,
  cardLabel,
  createGame,
  dealCards,
  finishTrick,
  firstPlayer,
  isJoker,
  isRequestMode,
  jokerOptionsFor,
  nextRound,
  placeBid,
  playCard,
} from '../engine';
import { type UiState, HUMAN, appHtml } from './view';

const SAVE_KEY = 'painted-seven-save-v1';
const SETTINGS_KEY = 'painted-seven-settings-v1';

// Паузы, чтобы человек успевал следить за игрой (в миллисекундах).
const BOT_DELAY = 700;
const DEAL_DELAY = 900;
const TRICK_DELAY = 1600;

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

export function startApp(root: HTMLElement): void {
  const ui: UiState = {
    screen: 'menu',
    game: null,
    settings: { ...DEFAULT_SETTINGS, ...(load<Partial<RuleSettings>>(SETTINGS_KEY) ?? {}) },
    hasSave: load<GameState>(SAVE_KEY) !== null,
    modal: { kind: 'none' },
  };
  let timer: number | undefined;

  function render(): void {
    root.innerHTML = appHtml(ui);
  }

  /** Перерисовать и, если сейчас очередь бота, запланировать его действие. */
  function update(): void {
    render();
    window.clearTimeout(timer);
    const game = ui.game;
    if (ui.screen !== 'game' || !game) return;

    store(SAVE_KEY, game.phase === 'gameOver' ? null : game);
    ui.hasSave = game.phase !== 'gameOver';

    switch (game.phase) {
      case 'deal':
        // Человек участвует в срезе, если он раздаёт или сидит следующим за раздающим.
        if (game.dealer !== HUMAN && firstPlayer(game) !== HUMAN) {
          timer = window.setTimeout(() => act(() => dealCards(game, true)), DEAL_DELAY);
        }
        break;
      case 'bidding':
        if (game.turn !== HUMAN) {
          timer = window.setTimeout(
            () => act(() => placeBid(game, game.turn, chooseBid(game, game.turn))),
            BOT_DELAY,
          );
        }
        break;
      case 'playing':
        if (game.turn !== HUMAN) {
          timer = window.setTimeout(
            () =>
              act(() => {
                const move = chooseMove(game, game.turn);
                playCard(game, game.turn, move.card, move.joker);
              }),
            BOT_DELAY,
          );
        }
        break;
      case 'trickEnd':
        timer = window.setTimeout(() => act(() => finishTrick(game)), TRICK_DELAY);
        break;
      default:
        break;
    }
  }

  /** Выполнить действие над игрой и обновить экран. */
  function act(action: () => void): void {
    try {
      action();
    } catch (error) {
      console.error(error); // нелегальное действие движок отклоняет — состояние не портится
    }
    update();
  }

  function playHumanCard(label: string): void {
    const game = ui.game;
    if (!game || game.phase !== 'playing' || game.turn !== HUMAN) return;
    const card = game.hands[HUMAN].find((c) => cardLabel(c) === label);
    if (!card) return;
    if (isJoker(card)) {
      ui.modal = { kind: 'joker', mode: null }; // сначала спросим режим джокера
      update();
      return;
    }
    act(() => playCard(game, HUMAN, card));
  }

  function playHumanJoker(mode: JokerMode, target?: number): void {
    const game = ui.game;
    if (!game) return;
    const card = game.hands[HUMAN].find(isJoker);
    if (!card) return;
    ui.modal = { kind: 'none' };
    act(() => playCard(game, HUMAN, card, { mode, target }));
  }

  function chooseJokerMode(mode: JokerMode): void {
    const game = ui.game;
    if (!game) return;
    if (!isRequestMode(mode)) {
      playHumanJoker(mode);
      return;
    }
    const targets = jokerOptionsFor(game, HUMAN).find((o) => o.mode === mode)?.targets ?? [];
    if (targets.length === 1) {
      playHumanJoker(mode, targets[0]);
    } else {
      ui.modal = { kind: 'joker', mode };
      update();
    }
  }

  function handleAction(action: string, value: string): void {
    const game = ui.game;
    switch (action) {
      case 'start':
        ui.game = createGame({ settings: ui.settings });
        ui.screen = 'game';
        ui.modal = { kind: 'none' };
        update();
        break;
      case 'continue': {
        const saved = load<GameState>(SAVE_KEY);
        if (saved) {
          ui.game = saved;
          ui.screen = 'game';
          ui.modal = { kind: 'none' };
        }
        update();
        break;
      }
      case 'to-menu':
        ui.screen = 'menu';
        ui.modal = { kind: 'none' };
        update();
        break;
      case 'open-rules':
        ui.modal = { kind: 'rules' };
        update();
        break;
      case 'open-sheet':
        ui.modal = { kind: 'sheet' };
        update();
        break;
      case 'open-quit':
        ui.modal = { kind: 'quit' };
        update();
        break;
      case 'close-modal':
        ui.modal = { kind: 'none' };
        update();
        break;
      case 'deal-cut':
        if (game) act(() => dealCards(game, true));
        break;
      case 'deal-nocut':
        if (game) act(() => dealCards(game, false));
        break;
      case 'bid':
        if (game) act(() => placeBid(game, HUMAN, Number(value)));
        break;
      case 'card':
        playHumanCard(value);
        break;
      case 'joker-mode':
        chooseJokerMode(value as JokerMode);
        break;
      case 'joker-target':
        if (ui.modal.kind === 'joker' && ui.modal.mode) {
          playHumanJoker(ui.modal.mode, Number(value));
        }
        break;
      case 'skip':
        // Нажатие на стол сразу забирает сыгранную взятку.
        if (game && game.phase === 'trickEnd') act(() => finishTrick(game));
        break;
      case 'next-round':
        ui.modal = { kind: 'none' };
        if (game) act(() => nextRound(game));
        break;
      default:
        break;
    }
  }

  // Один обработчик на всё приложение: ищем ближайший элемент с data-action.
  root.addEventListener('click', (event) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!element || (element as HTMLButtonElement).disabled) return;
    handleAction(element.dataset.action ?? '', element.dataset.value ?? '');
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

  update();
}
