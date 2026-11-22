// Управление игрой в браузере: нажатия человека, ходы ботов, игра с друзьями через сервер,
// анимации 3D-стола, таймер хода, звук, сохранение.
// Правила здесь не проверяются — это делает движок (src/engine).

import * as THREE from 'three';
import { chooseBid, chooseMove } from '../ai/bot';
import {
  type BotLevel,
  type GameState,
  type JokerDemand,
  type JokerMode,
  type RuleSettings,
  type Suit,
  DEFAULT_SETTINGS,
  cardLabel,
  createGame,
  currentRound,
  dealCards,
  finishTrick,
  firstPlayer,
  isJoker,
  jokerDemandsFor,
  legalCardsFor,
  nextRound,
  placeBid,
  playCard,
  timeoutStrike,
} from '../engine';
import { type Language, getLanguage, onLanguageChange, setLanguage, t } from '../i18n';
import { type Net, clientId, connect, serverUrl } from '../net/client';
import type { ServerMessage } from '../net/protocol';
import { DEAL_TIMING } from '../shared/dealTiming';
import { pickBotNames } from '../shared/names';
import { repaintCardAtlas } from '../three/cardAtlas';
import { type Skin, randomGender, randomSkin, sanitizeSkin } from '../three/character';
import type { ShotName } from '../three/cameraDirector';
import { gfx, saveGfx } from '../three/gfx';
import { Players } from '../three/players';
import type { Stage } from '../three/stage';
import { SEATS } from '../three/table';
import { seatOfPlayer, skinsBySeat, tableStateFromGame } from '../three/tableState';
import { TableView } from '../three/tableView';
import { TurnMarker } from '../three/turnMarker';
import { displayName, loadProfile, saveProfile } from './profile';
import {
  applySoundSettings,
  playCardSound,
  playClickSound,
  playDealSound,
  playJokerSound,
  playPenaltySound,
  playSlideSound,
  playTickSound,
  playTrickSound,
  setSoundScene,
  unlockSound,
} from './sound';
import { type UiState, type WardrobeTab, HUMAN, appHtml } from './view';

/** Сохранённая партия: состояние движка и внешний вид игроков за столом. */
interface SavedTable {
  game: GameState;
  skins: (Skin | null)[];
}

const SAVE_KEY = 'painted-seven-save-v4';
const SETTINGS_KEY = 'painted-seven-settings-v3';

// Паузы, чтобы человек успевал следить за игрой (в миллисекундах).
const BOT_DELAY = 800;
const TRICK_DELAY = 1500;

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

/**
 * Ракурсы во время тасовки и раздачи: склейки, как в кино — строго сверху, сверху сбоку,
 * низкий по диагонали — и снова по кругу. Сколько секунд держим каждый (при скорости 1).
 */
const DEAL_SHOTS: ShotName[] = ['top', 'highSide', 'lowFar'];
const DEAL_SHOT_SECONDS = 3;
/** Сколько камера ещё держит вид сверху, когда дошёл мой ход, прежде чем вернуться к глазам. */
const RETURN_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function startApp(root: HTMLElement, stage: Stage): void {
  const ui: UiState = {
    screen: 'menu',
    online: null,
    joinCode: (new URLSearchParams(location.search).get('room') ?? '').toUpperCase().slice(0, 5),
    linkCopied: false,
    game: null,
    profile: loadProfile(),
    settings: { ...DEFAULT_SETTINGS, ...(load<Partial<RuleSettings>>(SETTINGS_KEY) ?? {}) },
    hasSave: load<SavedTable>(SAVE_KEY) !== null,
    modal: { kind: 'none' },
    wardrobeTab: 'suit',
    selected: null,
    dealing: false,
    topView: false,
    viewChanged: false,
    notice: null,
  };
  const table = new TableView(stage);
  const marker = new TurnMarker(stage);
  const players = new Players(stage);
  table.handAnchor = (seat) => {
    const position = players.handPosition(seat);
    return position ? { position } : null;
  };
  let skins: (Skin | null)[] = [];

  /** Кресло, в котором сидит игрок (вдвоём и втроём кресла заняты не все). */
  function seatOf(game: GameState, player: number): number {
    return seatOfPlayer(game.playerNames.length, player);
  }

  /** Номер «запуска» игры. Меняется при выходе в меню — старые таймеры это видят и молчат. */
  let session = 0;
  /** Идёт ли сейчас автоматическое действие (бот думает, летят карты). */
  let working = false;
  let skipTrickWait: (() => void) | null = null;
  /** Разница между часами сервера и браузера (мс) — для общего таймера хода. */
  let clockOffset = 0;
  let turnTimer = 0;
  let noticeTimer = 0;
  let lastTick = -1;

  // ---------- Отрисовка ----------

  function render(): void {
    // Не сбиваем ввод: если человек печатает имя или код, поле сохраняет фокус и курсор.
    const focused = document.activeElement as HTMLInputElement | null;
    const focusKey = focused?.dataset?.profile ? 'profile' : focused?.dataset?.joinCode !== undefined ? 'join' : null;
    const caret = focusKey ? focused?.selectionStart ?? null : null;
    root.innerHTML = appHtml(ui);
    if (focusKey) {
      const field = root.querySelector<HTMLInputElement>(focusKey === 'profile' ? '[data-profile]' : '[data-join-code]');
      field?.focus();
      if (field && caret !== null) field.setSelectionRange(caret, caret);
    }
    positionPlates();
    setSoundScene(ui.screen === 'game' ? 'game' : 'menu');
  }

  let lastTrickLength = 0;

  /** Привести 3D-стол к состоянию партии. */
  /**
   * Порядок карт в моём веере, который игрок выбрал сам (перетаскиванием).
   * Новые карты (после раздачи) встают в обычном порядке.
   */
  let handOrder: string[] = [];
  function orderHand<T extends { suit: string; rank: number } | null>(hand: T[]): T[] {
    if (handOrder.length === 0) return hand;
    const place = (card: T) => {
      const index = card ? handOrder.indexOf(cardLabel(card as never)) : -1;
      return index < 0 ? handOrder.length : index;
    };
    return hand
      .map((card, i) => ({ card, i }))
      .sort((a, b) => place(a.card) - place(b.card) || a.i - b.i)
      .map(({ card }) => card);
  }

  /** Что видит человек за столом (его карты — в выбранном им порядке). */
  function tableState(game: GameState) {
    const state = tableStateFromGame(game, HUMAN);
    state.hands[0] = orderHand(state.hands[0]);
    return state;
  }

  /**
   * Камера в розыгрыше (та же машина состояний, что и при раздаче): пока ход не мой — смотрю
   * на стол сверху, мой веер убран; дошёл ход до меня — склейка обратно к глазам.
   * Исключение: взятку начинает сосед справа (он ходит прямо передо мной). Тогда камера
   * остаётся у глаз, пока я не брошу карту, — иначе она прыгнула бы вверх и сразу вниз.
   * Дошёл ход до меня — камера ещё секунду держит вид сверху (видно, как легла последняя
   * карта), веер пока убран, и только потом склейка к глазам — без резкого прыжка.
   * Раздачей камера управляет сама. Возвращает true, пока веер должен оставаться убранным.
   */
  function followTrickCamera(game: GameState, handAway: boolean): boolean {
    if (ui.dealing || ui.screen !== 'game') {
      window.clearTimeout(returnTimer);
      returnTimer = 0;
      return false;
    }
    const count = game.playerNames.length;
    const rightNeighbour = (HUMAN + count - 1) % count; // ходит прямо передо мной
    const iPlayed = game.trick.some((play) => play.player === HUMAN);
    const leader = game.trick.length > 0 ? game.trick[0].player : game.turn;
    const rightLeads = game.phase === 'playing' && !iPlayed && leader === rightNeighbour;
    const watchFromTop = handAway && !rightLeads;
    const director = stage.director;
    director.speed = gfx.dealSpeed;
    // Игрок сам включил вид сверху (кнопка внизу справа): держим его, пока не выключит.
    // Веер — маленький у нижнего края: на свой ход можно заказывать и ходить прямо отсюда.
    if (ui.topView) {
      window.clearTimeout(returnTimer);
      returnTimer = 0;
      if (director.mode === 'gameplay' || director.mode === 'toGameplay') director.cutTo('top');
      return false;
    }
    if (watchFromTop) {
      window.clearTimeout(returnTimer);
      returnTimer = 0;
      returnNow = false;
      // Карты выбрасывают — один спокойный вид сверху, без смены ракурсов (склейкой от глаз).
      if (director.mode === 'gameplay' || director.mode === 'toGameplay') director.cutTo('top');
      return false;
    }
    if (director.mode !== 'top' && director.mode !== 'toTop') return false;
    // Игрок сам нажал «Вернуться к своим картам» — сразу, без ожидания.
    if (returnNow) {
      returnNow = false;
      window.clearTimeout(returnTimer);
      returnTimer = 0;
      director.cutTo('gameplay');
      return false;
    }
    // Мой ход: ещё секунду смотрим сверху, потом склейка обратно к глазам.
    if (!returnTimer) {
      returnTimer = window.setTimeout(() => {
        returnTimer = 0;
        if (ui.dealing || ui.screen !== 'game') return;
        stage.director.cutTo('gameplay');
        syncTable(); // веер возвращается на экран
      }, RETURN_DELAY_MS);
    }
    return true;
  }

  /** Таймер склейки обратно к глазам, когда дошёл мой ход (0 — не запущен). */
  let returnTimer = 0;
  /** Игрок только что выключил вид сверху — вернуться к глазам сразу. */
  let returnNow = false;

  /** `pickup` — раздача закончилась, игроки берут карты в руки (значение — скорость анимаций). */
  function syncTable(options: { pickup?: number } = {}): void {
    const game = ui.game;
    if (!game) return;
    // Звук, когда на стол легла новая карта; у джокера — свой.
    if (game.trick.length > lastTrickLength) {
      if (isJoker(game.trick[game.trick.length - 1].card)) playJokerSound();
      else playCardSound();
    }
    lastTrickLength = game.trick.length;
    table.selected = ui.selected;
    table.compactHand = ui.topView;
    const state = tableState(game);
    // Пока камера ещё держит вид сверху перед моим ходом — веер не показываем.
    if (followTrickCamera(game, state.handAway)) state.handAway = true;
    table.sync(state, { pickup: options.pickup });
    const turn = !ui.dealing && (game.phase === 'bidding' || game.phase === 'playing') ? game.turn : null;
    const active = turn === null ? null : seatOf(game, turn);
    marker.show(ui.screen === 'game' ? active : null);
    players.lookAtSeat(active);
  }

  /** Таблички соперников стоят над их головами: считаем место на экране каждый кадр. */
  const anchor = new THREE.Vector3();
  function positionPlates(): void {
    root.querySelectorAll<HTMLElement>('.plate[data-seat]').forEach((plate) => {
      const seat = Number(plate.dataset.seat);
      if (seat === 0) return;
      const spot = SEATS[seat];
      const point = stage.toScreen(anchor.set(spot.x, 5.0, spot.z));
      plate.style.display = point.visible ? '' : 'none';
      // Не даём табличке уйти за край экрана.
      const half = plate.offsetWidth / 2 + 6;
      const x = Math.min(Math.max(point.x, half), root.clientWidth - half);
      plate.style.left = `${x}px`;
      plate.style.top = `${Math.max(point.y, plate.offsetHeight + 56)}px`;
    });
  }

  /** Сколько секунд осталось у ходящего игрока (null — таймера нет). */
  function secondsLeft(): number | null {
    const game = ui.game;
    if (!game || game.settings.turnSeconds <= 0 || game.turnStartedAt === 0) return null;
    if (game.phase !== 'bidding' && game.phase !== 'playing') return null;
    const elapsed = (Date.now() + clockOffset - game.turnStartedAt) / 1000;
    return Math.max(0, game.settings.turnSeconds - elapsed);
  }

  stage.onFrame(() => {
    positionPlates();
    // Таймер хода: цифры и предупреждение на последних секундах.
    const left = secondsLeft();
    const element = root.querySelector<HTMLElement>('[data-timer]');
    if (element) {
      if (left === null) {
        element.textContent = '';
      } else {
        const whole = Math.ceil(left);
        element.textContent = `⏱ ${whole}`;
        element.classList.toggle('warn', whole <= 10);
        const mine = ui.game?.turn === HUMAN;
        if (mine && whole <= 5 && whole !== lastTick && whole > 0) playTickSound();
        lastTick = whole;
      }
    }
    // Кнопка «вернуть вид» появляется, когда игрок повернул камеру.
    const changed = stage.viewChanged();
    if (changed !== ui.viewChanged && (ui.screen === 'game' || ui.screen === 'wardrobe')) {
      ui.viewChanged = changed;
      render();
    }
  });

  function showNotice(text: string): void {
    ui.notice = text;
    window.clearTimeout(noticeTimer);
    noticeTimer = window.setTimeout(() => {
      ui.notice = null;
      render();
    }, 2600);
    render();
  }

  function save(): void {
    const game = ui.game;
    if (!game || ui.online) return; // партию с друзьями хранит сервер
    store(SAVE_KEY, game.phase === 'gameOver' ? null : ({ game, skins } satisfies SavedTable));
    ui.hasSave = game.phase !== 'gameOver';
  }

  // ---------- Одиночная игра ----------

  /** За это место сейчас ходит бот? (бот или человек, выбывший из раунда за бездействие) */
  function automatic(game: GameState, player: number): boolean {
    return player !== HUMAN || game.autoPlay[HUMAN];
  }

  /** Таймер моего хода в одиночной игре: штраф каждые turnSeconds, потом за меня доигрывает бот. */
  function armTurnTimer(): void {
    window.clearTimeout(turnTimer);
    const game = ui.game;
    if (!game || ui.online || game.settings.turnSeconds <= 0) return;
    if ((game.phase !== 'bidding' && game.phase !== 'playing') || automatic(game, game.turn)) return;
    if (game.turnStartedAt === 0) game.turnStartedAt = Date.now();
    const mySession = session;
    const deadline = game.turnStartedAt + game.settings.turnSeconds * 1000;
    turnTimer = window.setTimeout(() => {
      if (mySession !== session || ui.game !== game || ui.screen !== 'game') return;
      if ((game.phase !== 'bidding' && game.phase !== 'playing') || game.turn !== HUMAN) return;
      timeoutStrike(game);
      game.turnStartedAt = Date.now();
      playPenaltySound();
      ui.selected = null;
      ui.modal = { kind: 'none' };
      showNotice(t('timer.penalty', { n: game.settings.timeoutPenalty }));
      void advance(); // если игрок выбыл из раунда — дальше ходит бот
    }, Math.max(0, deadline - Date.now()));
  }

  // ---------- Раздача с камерой сверху ----------
  // PREPARATION → CAMERA TRANSITION → (тасовка) → CARD DISTRIBUTION → DISTRIBUTION COMPLETE →
  // CAMERA RETURN → GAMEPLAY. Кому и какие карты — уже решила логика; здесь только показ.
  // Всё это время ui.dealing и working: нельзя ходить, заказывать и запустить вторую раздачу.

  /** Нажали «Пропустить раздачу» (или вышли из партии): всё сразу встаёт на свои места. */
  let dealSkipped = false;
  /** Колоду в этой раздаче уже потасовали (онлайн тасовка идёт, пока сервер раздаёт). */
  let dealShuffled = false;
  /** Первая раздача с тех пор, как сели за стол: только в ней камера плавно «садится». */
  let firstDeal = true;
  /** Перед раздачей игрок смотрел на стол сверху: после раздачи остаёмся сверху. */
  let keepTopView = false;

  /** PREPARATION + CAMERA TRANSITION: блокируем всё, камера уходит наверх, раздающий тасует. */
  async function dealIntro(): Promise<void> {
    if (!ui.dealing) {
      ui.dealing = true;
      // Раздачей камера управляет сама; если игрок смотрел сверху — после раздачи вид сверху вернётся.
      keepTopView = ui.topView;
      ui.topView = false;
      dealSkipped = false;
      dealShuffled = false;
      handOrder = []; // новая раздача — карты в обычном порядке
      render();
    }
    stage.director.speed = gfx.dealSpeed;
    if (dealSkipped) stage.director.snap('top');
    else if (stage.director.mode !== 'top') {
      // Раздача начинается сразу с вида сверху — склейкой, без подъёма камеры.
      stage.director.cutTo('top');
      // Тасовка и раздача: ракурсы меняются склейками по кругу, не чаще раза в 3 секунды.
      // Режиссёр знает, сколько ещё продлится раздача, и не режет, если новый ракурс не успеет.
      const game = ui.game;
      const total = game ? currentRound(game).cards * game.playerNames.length : 0;
      const t = DEAL_TIMING;
      const left = (dealShuffled ? 0 : t.shuffle) + total * (t.lift + t.flight + t.pause) + t.hold;
      stage.director.play(DEAL_SHOTS, DEAL_SHOT_SECONDS, left);
    }
    if (!dealShuffled && !dealSkipped) {
      dealShuffled = true;
      playDealSound(0);
      await table.shuffle();
    }
  }

  /** CARD DISTRIBUTION → DISTRIBUTION COMPLETE → CAMERA RETURN. Логика уже раздала карты. */
  async function dealOutro(alive: () => boolean): Promise<void> {
    const game = ui.game;
    if (!game) return;
    const speed = gfx.dealSpeed;
    const state = tableState(game);
    await table.deal(state, {
      firstSeat: seatOf(game, firstPlayer(game)),
      speed,
      skipped: () => dealSkipped,
      onLand: () => playCardSound(),
    });
    // Камера не уходит, пока хоть одна карта в воздухе.
    await waitForCards();
    if (!alive()) return;
    // Проверка: у каждого столько карт, сколько раздала логика.
    const cards = currentRound(game).cards;
    if (game.hands.some((hand) => hand.length !== cards)) console.warn('Раздача: число карт не совпадает с раундом', game.hands);
    if (!dealSkipped) await sleep((DEAL_TIMING.hold * 1000) / speed); // итог раздачи (ракурсы ещё меняются)
    if (!alive()) return;
    // Сначала камера возвращается к глазам игрока (карты пока лежат на столе), и только потом
    // игроки берут карты в руки — мои появляются в веере, когда камера уже внизу.
    // Плавно, будто садимся за стол, — только в первой раздаче партии; дальше — склейкой.
    if (keepTopView) {
      // Игрок сам выбрал вид сверху — так и остаёмся (один спокойный ракурс), веер — маленький внизу.
      stage.director.play(['top']);
      stage.director.cutTo('top');
      ui.topView = true;
    } else if (dealSkipped || !firstDeal) stage.director.cutTo('gameplay');
    else await stage.director.goBack();
    firstDeal = false;
    if (!alive()) return;
    syncTable({ pickup: dealSkipped ? 20 : speed });
    await waitForCards();
    if (!alive()) return;
    table.revealTrump();
    ui.dealing = false;
    render();
    syncTable();
  }

  /** Раздачу прервали (выход в меню, новая партия): камеру сразу к игроку. */
  function abortDeal(): void {
    dealSkipped = true;
    ui.dealing = false;
    ui.topView = false;
    keepTopView = false;
    table.holdForDeal(false);
    stage.director.snap('gameplay');
  }

  function skipDeal(): void {
    if (!ui.dealing) return;
    dealSkipped = true;
    if (stage.director.mode === 'toTop') stage.director.snap('top');
    if (stage.director.mode === 'toGameplay') stage.director.snap('gameplay');
  }

  /** Двигает партию вперёд, пока не понадобится решение человека. */
  async function advance(): Promise<void> {
    if (working || ui.online) return;
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
          // Логика раздаёт сразу и не ждёт анимацию; анимация потом показывает готовый результат.
          // Стол (колода у раздающего) уже выставлен syncTable() выше — до раздачи.
          table.holdForDeal(true);
          dealCards(game);
          save();
          await dealIntro();
          if (!alive()) break;
          await dealOutro(alive);
          if (!alive()) break;
        } else if (game.phase === 'bidding' || game.phase === 'playing') {
          if (!automatic(game, game.turn)) break;
          await sleep(BOT_DELAY);
          if (!alive()) break;
          // За выбывшего человека бот играет на обычном уровне.
          const level: BotLevel | undefined = game.turn === HUMAN ? 'normal' : undefined;
          if (game.phase === 'bidding') {
            placeBid(game, game.turn, chooseBid(game, game.turn, level));
          } else {
            const move = chooseMove(game, game.turn, level);
            players.throwCard(seatOf(game, game.turn));
            playCard(game, game.turn, move.card, move.joker);
          }
        } else if (game.phase === 'trickEnd') {
          // Даём рассмотреть взятку (нажатие на стол ускоряет), потом она улетает к победителю.
          await Promise.race([sleep(TRICK_DELAY), new Promise<void>((resolve) => (skipTrickWait = resolve))]);
          skipTrickWait = null;
          if (!alive()) break;
          players.nod(seatOf(game, game.trickWinner ?? 0));
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
        armTurnTimer();
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

  function lobbyError(key: string): void {
    ui.online = {
      status: 'ready',
      code: ui.online?.code ?? null,
      seats: ui.online?.seats ?? [],
      host: ui.online?.host ?? false,
      started: ui.online?.started ?? false,
      botLevel: ui.online?.botLevel ?? 'normal',
      bots: ui.online?.bots ?? 0,
      freeSeats: ui.online?.freeSeats ?? 0,
      error: key,
    };
    render();
  }

  /** Код комнаты, в которой мы сейчас играем: после перезагрузки страницы вернёмся в неё. */
  const ROOM_KEY = 'painted-seven-room';
  function rememberRoom(code: string | null): void {
    try {
      if (code) localStorage.setItem(ROOM_KEY, code);
      else localStorage.removeItem(ROOM_KEY);
    } catch {
      // хранилище недоступно — просто не вернёмся автоматически
    }
  }
  function rememberedRoom(): string {
    try {
      return (localStorage.getItem(ROOM_KEY) ?? '').toUpperCase().slice(0, 5);
    } catch {
      return '';
    }
  }

  async function ensureNet(): Promise<Net | null> {
    if (net) return net;
    const url = serverUrl();
    if (!url) {
      lobbyError('err.noServer');
      return null;
    }
    ui.online = { status: 'connecting', code: null, seats: [], host: false, started: false, botLevel: 'normal', bots: 0, freeSeats: 0, error: null };
    render();
    try {
      net = await connect(url, { onMessage: onServerMessage, onClose: onServerClose });
      return net;
    } catch {
      lobbyError('err.connect');
      return null;
    }
  }

  function onServerClose(): void {
    net = null;
    if (!ui.online) return;
    const code = ui.online.code;
    leaveOnline(false);
    ui.screen = 'lobby';
    ui.joinCode = code ?? ui.joinCode;
    lobbyError('err.lost');
  }

  function onServerMessage(message: ServerMessage): void {
    if (message.t === 'error') {
      // Комнаты больше нет (сервер перезапустился) или партия ушла без нас — не пытаемся вернуться.
      if (message.message === 'err.noRoom' || message.message === 'err.started') rememberRoom(null);
      if (ui.screen === 'lobby') lobbyError(message.message);
      else console.error(message.message);
      return;
    }
    if (message.t === 'room') {
      rememberRoom(message.code);
      ui.online = {
        status: 'ready',
        code: message.code,
        seats: message.seats,
        host: message.host,
        started: message.started,
        botLevel: message.botLevel,
        bots: message.bots,
        freeSeats: message.freeSeats ?? 0,
        error: null,
      };
      if (message.started && skins.length === 0) {
        skins = message.seats.map((seat) => (seat ? sanitizeSkin(seat.skin) : null));
        players.seat(skinsBySeat(skins));
      }
      render(); // лобби и окно итогов показывают, кто готов
      return;
    }
    clockOffset = message.now - Date.now();
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
          players.nod(seatOf(previous, previous.trickWinner ?? 0));
          playTrickSound();
          await table.collectTrick(previous.trickWinner ?? 0);
        }
        if (previous && next.trick.length > previous.trick.length) {
          players.throwCard(seatOf(next, next.trick[next.trick.length - 1].player));
        }
        // Штраф за просроченный ход — сообщаем тому, кого оштрафовали.
        if (previous && next.penalties[HUMAN] < previous.penalties[HUMAN] && next.roundIndex === previous.roundIndex) {
          playPenaltySound();
          showNotice(t('timer.penalty', { n: next.settings.timeoutPenalty }));
        }
        const dealtNow = next.dealt && (!previous || !previous.dealt || previous.roundIndex !== next.roundIndex);

        if (ui.screen !== 'game') firstDeal = true; // только что сели за стол в комнате
        ui.game = next;
        ui.screen = 'game';
        if (previous && previous.turn !== next.turn) ui.selected = null;

        if (next.phase === 'deal') {
          // Сервер скоро раздаст: колода у раздающего, камера уходит наверх, раздающий тасует.
          syncTable();
          await dealIntro();
        } else if (dealtNow) {
          // Сервер раздал — показываем раздачу по одной карте (подъём и тасовку, если их ещё не было).
          // Колода уже у раздающего (она переехала к нему в конце прошлого раунда).
          table.holdForDeal(true);
          await dealIntro();
          if (mySession !== session) break;
          await dealOutro(() => mySession === session);
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

  /** Выйти из комнаты. `forget` — игрок ушёл сам (а не потерял связь): больше не возвращаем его. */
  function leaveOnline(forget = true): void {
    if (forget) rememberRoom(null);
    net?.send({ t: 'leave' });
    net?.close();
    net = null;
    incoming.length = 0;
    ui.online = null;
    skins = [];
    session++;
    abortDeal();
    working = false;
  }

  // ---------- Действия человека ----------

  /** Действие человека в одиночной игре: выполнить и продолжить партию. */
  function act(action: () => void): void {
    try {
      action();
    } catch (error) {
      console.error(error); // нелегальное действие движок отклоняет — состояние не портится
    }
    ui.selected = null;
    window.clearTimeout(turnTimer);
    void advance();
  }

  function myTurnToPlay(): GameState | null {
    const game = ui.game;
    return game && !working && game.phase === 'playing' && game.turn === HUMAN && !game.autoPlay[HUMAN] ? game : null;
  }

  /** Нажатие на карту в руке: первое выбирает, второе ходит. */
  function tapCard(label: string): void {
    const game = myTurnToPlay();
    if (!game) return;
    const card = legalCardsFor(game, HUMAN).find((c) => cardLabel(c) === label);
    if (!card) return; // этой картой сейчас ходить нельзя
    if (ui.selected !== label) {
      ui.selected = label;
      playSlideSound();
      render();
      syncTable();
      return;
    }
    if (isJoker(card)) {
      ui.modal = { kind: 'joker', mode: null, pickSuit: false }; // сначала спросим, как сыграть джокер
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

  function playJoker(mode: JokerMode, demand?: JokerDemand, suit?: Suit): void {
    const game = myTurnToPlay();
    const card = game?.hands[HUMAN].find(isJoker);
    ui.modal = { kind: 'none' };
    if (!game || !card) return;
    const joker = { mode, demand, suit };
    if (net) {
      ui.selected = null;
      net.send({ t: 'play', card, joker });
      return;
    }
    act(() => playCard(game, HUMAN, card, joker));
  }

  function startGame(game: GameState, tableSkins: (Skin | null)[]): void {
    skins = tableSkins.map((skin) => (skin ? sanitizeSkin(skin) : null));
    players.seat(skinsBySeat(skins));
    session++;
    abortDeal();
    firstDeal = true; // сели за стол — первая раздача с плавным «садимся»
    working = false;
    lastTrickLength = game.trick.length;
    ui.game = game;
    ui.screen = 'game';
    ui.modal = { kind: 'none' };
    ui.selected = null;
    stage.resetView();
    void advance();
  }

  function setModal(kind: 'rules' | 'sheet' | 'quit' | 'settings'): void {
    ui.modal = { kind };
    render();
  }

  function handleAction(action: string, value: string): void {
    const game = ui.game;
    switch (action) {
      case 'start': {
        // С каждой новой игрой у ботов новые имена и внешность; имя соответствует полу персонажа.
        const genders = [randomGender(), randomGender(), randomGender()];
        const myName = displayName(ui.profile);
        const names = pickBotNames(genders, [myName]);
        startGame(createGame({ settings: ui.settings, playerNames: [ui.profile.name.trim(), ...names] }), [
          ui.profile.skin,
          ...genders.map((gender) => randomSkin(gender)),
        ]);
        break;
      }
      case 'continue': {
        const saved = load<SavedTable>(SAVE_KEY);
        if (saved) {
          saved.game.turnStartedAt = 0; // время на ход начинается заново, когда партию продолжили
          startGame(saved.game, saved.skins);
        }
        break;
      }
      case 'to-menu':
        if (ui.online) leaveOnline();
        session++;
        abortDeal();
        working = false;
        window.clearTimeout(turnTimer);
        ui.screen = 'menu';
        ui.modal = { kind: 'none' };
        marker.show(null);
        stage.resetView();
        render();
        break;
      case 'language':
        setLanguage(value as Language);
        break;
      case 'reset-view':
        stage.resetView();
        break;
      case 'skip-deal':
        skipDeal();
        break;
      case 'toggle-lamp':
        gfx.lamp = !gfx.lamp;
        saveGfx();
        render();
        break;
      case 'toggle-top-view':
        // Стол сверху ⇄ мои карты. Выключил — камера сразу к глазам (если сейчас мой ход
        // или розыгрыш ещё не идёт; пока ходят другие, остаётся обычный вид сверху).
        if (ui.dealing || ui.screen !== 'game') break;
        ui.topView = !ui.topView;
        returnNow = !ui.topView;
        render();
        syncTable();
        break;
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
          lobbyError('err.codeLength');
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
      case 'wardrobe-tab':
        ui.wardrobeTab = value as WardrobeTab;
        render();
        break;
      case 'skin': {
        // value вида «tie:3» или «gender:female».
        const [key, raw] = value.split(':');
        const skin = sanitizeSkin({ ...ui.profile.skin, [key]: key === 'gender' ? raw : Number(raw) });
        ui.profile = { ...ui.profile, skin };
        saveProfile(ui.profile);
        players.showWardrobe(skin);
        render();
        break;
      }
      case 'open-rules':
      case 'open-sheet':
      case 'open-quit':
      case 'open-settings':
        setModal(action.slice(5) as 'rules' | 'sheet' | 'quit' | 'settings');
        break;
      case 'close-modal':
        ui.modal = { kind: 'none' };
        render();
        break;
      case 'bid':
        if (!game || working) break;
        if (net) net.send({ t: 'bid', bid: Number(value) });
        else act(() => placeBid(game, HUMAN, Number(value)));
        break;
      case 'joker-mode': {
        const mode = value as JokerMode;
        // Если это заход — спросим ещё, что потребовать у остальных.
        if (game && jokerDemandsFor(game).length > 0) {
          ui.modal = { kind: 'joker', mode, pickSuit: false };
          render();
        } else {
          playJoker(mode);
        }
        break;
      }
      case 'joker-demand':
        if (ui.modal.kind !== 'joker' || !ui.modal.mode) break;
        if (value === 'suit') {
          ui.modal = { kind: 'joker', mode: ui.modal.mode, pickSuit: true }; // сначала выберем масть
          render();
        } else {
          playJoker(ui.modal.mode, value ? (value as JokerDemand) : undefined);
        }
        break;
      case 'joker-suit':
        if (ui.modal.kind === 'joker' && ui.modal.mode) playJoker(ui.modal.mode, 'suit', value as Suit);
        break;
      case 'next-round':
        if (net) {
          net.send({ t: 'ready' }); // с друзьями раунд начнётся, когда готовы все
        } else if (game) {
          ui.modal = { kind: 'none' };
          act(() => nextRound(game));
        }
        break;
      default:
        break;
    }
  }

  // Браузер разрешает звук только после первого нажатия человека.
  window.addEventListener('pointerdown', unlockSound, { passive: true });

  // Один обработчик на весь интерфейс: ищем ближайший элемент с data-action.
  root.addEventListener('click', (event) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!element || (element as HTMLButtonElement).disabled) return;
    playClickSound();
    handleAction(element.dataset.action ?? '', element.dataset.value ?? '');
  });

  // Нажатия на 3D-сцену: выбор карты в руке или ускорение показа взятки.
  stage.canvas.addEventListener('click', (event) => {
    if (stage.consumeDrag()) return; // это было вращение камеры, а не нажатие
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

  // Поворот камеры начинается только не с карты руки (с карты — перестановка).
  stage.orbit.canRotate = (x, y) => ui.screen !== 'game' || table.pick(x, y) === null;

  // Перестановка карт в руке: зажать карту и тянуть влево или вправо.
  let dragging: { label: string; startX: number; moved: boolean } | null = null;
  stage.canvas.addEventListener('pointerdown', (event) => {
    if (ui.screen !== 'game' || ui.modal.kind !== 'none' || event.button !== 0) return;
    const label = table.pick(event.clientX, event.clientY);
    dragging = label ? { label, startX: event.clientX, moved: false } : null;
  });
  stage.canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    if (!dragging.moved && Math.abs(event.clientX - dragging.startX) < 14) return;
    dragging.moved = true;
    const positions = table.handScreenX();
    const others = positions.filter((p) => p.label !== dragging!.label);
    // Новое место — сколько других карт левее пальца.
    const index = others.filter((p) => p.x < event.clientX).length;
    const order = others.map((p) => p.label);
    order.splice(index, 0, dragging.label);
    if (order.join() !== positions.map((p) => p.label).join()) {
      handOrder = order;
      syncTable();
    }
  });
  const stopDragging = () => {
    if (dragging?.moved) playSlideSound();
    dragging = null;
  };
  stage.canvas.addEventListener('pointerup', stopDragging);
  stage.canvas.addEventListener('pointercancel', stopDragging);

  // Наведение мыши: карта, которой можно ходить, приподнимается.
  stage.canvas.addEventListener('pointermove', (event) => {
    if (ui.screen !== 'game' || event.pointerType === 'touch') return;
    const hovered = myTurnToPlay() ? table.pick(event.clientX, event.clientY) : null;
    table.hovered = hovered;
    stage.canvas.style.cursor = hovered ? 'pointer' : '';
  });

  // Поля ввода: имя игрока и код комнаты; ползунки громкости.
  root.addEventListener('input', (event) => {
    const element = event.target as HTMLInputElement;
    if (element.dataset?.joinCode !== undefined) {
      ui.joinCode = element.value.toUpperCase().slice(0, 5);
    } else if (element.dataset?.profile === 'name') {
      ui.profile = { ...ui.profile, name: element.value };
      saveProfile(ui.profile);
    } else if (element.dataset?.gfx === 'musicVolume' || element.dataset?.gfx === 'sfxVolume') {
      // Громкость применяется сразу, пока тянут ползунок.
      gfx[element.dataset.gfx as 'musicVolume' | 'sfxVolume'] = Number(element.value);
      const label = root.querySelector(`[data-value-of="${element.dataset.gfx}"]`);
      if (label) label.textContent = element.value;
      applySoundSettings();
      saveGfx();
    }
  });

  // Выпадающие списки: правила партии, язык, звук и графика, сложность ботов в комнате.
  root.addEventListener('change', (event) => {
    const element = event.target as HTMLSelectElement;
    const data = element.dataset ?? {};
    if (data.language !== undefined) {
      setLanguage(element.value as Language);
      return;
    }
    if (data.roomLevel !== undefined) {
      net?.send({ t: 'config', botLevel: element.value as BotLevel });
      return;
    }
    if (data.roomBots !== undefined) {
      net?.send({ t: 'config', bots: Number(element.value) });
      return;
    }
    if (data.gfx) {
      if (data.gfx === 'music') gfx.music = element.value === 'true';
      if (data.gfx === 'sfx') gfx.sfx = element.value === 'true';
      if (data.gfx === 'bloom') gfx.bloom = element.value === 'true';
      if (data.gfx === 'quality') gfx.quality = element.value === 'low' ? 'low' : 'high';
      if (data.gfx === 'pixelScale') gfx.pixelScale = Number(element.value);
      if (data.gfx === 'dealSpeed') gfx.dealSpeed = Number(element.value);
      if (data.gfx === 'musicVolume' || data.gfx === 'sfxVolume') return; // ползунки обработаны выше
      applySoundSettings();
      saveGfx();
      stage.applySettings();
      render();
      return;
    }
    const key = data.setting as keyof RuleSettings | undefined;
    if (!key) return;
    const raw = element.value;
    const value = raw === 'true' ? true : raw === 'false' ? false : /^-?\d+$/.test(raw) ? Number(raw) : raw;
    ui.settings = { ...ui.settings, [key]: value };
    store(SETTINGS_KEY, ui.settings);
  });

  // Смена языка: перерисовать интерфейс и буквы рангов на картах.
  onLanguageChange(() => {
    document.documentElement.lang = getLanguage();
    repaintCardAtlas();
    render();
  });

  // Для проверки из консоли браузера.
  Object.assign(window, { paintedSeven: { ui, table, players, stage, tapCard, isWorking: () => working } });

  // Открыли ссылку-приглашение (?room=КОД) — сразу показываем вход в комнату.
  // Перезагрузили страницу посреди сетевой игры — сразу возвращаемся на своё место.
  const returning = !ui.joinCode && rememberedRoom();
  if (returning) ui.joinCode = returning;
  if (ui.joinCode) ui.screen = 'lobby';
  render();
  if (returning) handleAction('join-room', '');
}
