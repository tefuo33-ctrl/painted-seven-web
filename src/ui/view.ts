// Интерфейс поверх 3D-сцены: меню, таблички игроков, подсказки, заказ, окна.
// Здесь только HTML-строки. Правила берутся из движка (src/engine).

import {
  type GameState,
  type JokerMode,
  type RoundSpec,
  type RuleSettings,
  type Suit,
  PLAYER_COUNT,
  SUIT_NAME,
  SUIT_SYMBOL,
  allowedBids,
  currentRound,
  hasBidding,
  isJoker,
  jokerDemandsFor,
  leadSuit,
  legalCardsFor,
  requestedCards,
  roundName,
  totals,
  winners,
} from '../engine';
import { HAIR_FEMALE, SHIRTS, SUITS_MALE, TIES } from '../three/character';
import { gfx, hex } from '../three/gfx';
import type { SeatInfo } from '../net/protocol';
import type { Profile } from './profile';

export const HUMAN = 0;

/** Что сейчас открыто поверх стола. */
export type Modal =
  | { kind: 'none' }
  | { kind: 'sheet' }
  | { kind: 'rules' }
  | { kind: 'quit' }
  | { kind: 'settings' }
  | { kind: 'joker'; mode: JokerMode | null };

export interface OnlineState {
  status: 'connecting' | 'ready';
  code: string | null;
  seats: (SeatInfo | null)[];
  host: boolean;
  started: boolean;
  error: string | null;
}

export interface UiState {
  screen: 'menu' | 'game' | 'wardrobe' | 'lobby';
  /** Игра с друзьями: состояние комнаты (null — играем одни против ботов). */
  online: OnlineState | null;
  /** Код комнаты, который человек вводит сам. */
  joinCode: string;
  linkCopied: boolean;
  game: GameState | null;
  profile: Profile;
  settings: RuleSettings;
  hasSave: boolean;
  modal: Modal;
  /** Выбранная карта в руке (первое нажатие выбирает, второе — ходит). */
  selected: string | null;
  /** Идёт анимация (раздача, сбор взятки) — подсказка это учитывает. */
  dealing: boolean;
}

const DEMAND_TEXT = {
  trump: 'козырь',
  strongest: 'самую сильную карту',
  weakest: 'самую слабую карту',
} as const;

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

/** Число с настоящим знаком «минус». */
function plain(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

function suitHtml(suit: Suit): string {
  const red = suit === 'diamonds' || suit === 'hearts';
  return `<span class="suit ${red ? 'red' : 'black'}">${SUIT_SYMBOL[suit]}</span>`;
}

// ---------- Меню ----------

function select(
  key: keyof RuleSettings,
  label: string,
  options: [string, string][],
  settings: RuleSettings,
): string {
  const current = String(settings[key]);
  const items = options
    .map(([value, text]) => `<option value="${value}" ${value === current ? 'selected' : ''}>${text}</option>`)
    .join('');
  return `<label class="setting"><span>${label}</span>
    <select data-setting="${key}">${items}</select></label>`;
}

function menuHtml(ui: UiState): string {
  const s = ui.settings;
  return `<div class="menu">
    <div class="menu-card">
      <h1>Расписной покер</h1>
      <p class="subtitle">Painted Seven</p>
      <p class="lead">Закажите взятки — и возьмите ровно столько.</p>
      <button class="btn primary" data-action="start">Играть с ботами</button>
      ${ui.hasSave ? '<button class="btn" data-action="continue">Продолжить партию</button>' : ''}
      <button class="btn" data-action="open-lobby">Играть с друзьями</button>
      <button class="btn" data-action="open-wardrobe">Гардероб</button>
      <button class="btn" data-action="open-settings">Звук и графика</button>
      <button class="btn" data-action="open-rules">Правила коротко</button>
      <details class="settings">
        <summary>Настройки правил</summary>
        ${select('gameLength', 'Длина партии', [
          ['full', 'Полная — 28 раундов'],
          ['short', 'Короткая — 7 раундов'],
        ], s)}
        ${select('underbidRule', 'Недобор', [
          ['perMissing', '−10 за каждую недобранную'],
          ['perBid', '−10 за каждую заказанную'],
        ], s)}
        ${select('zeroBidPoints', 'Заказал 0 и взял 0', [
          ['0', '0 очков'],
          ['5', '+5 очков'],
          ['10', '+10 очков'],
        ], s)}
        ${select('minusStarBonus', 'Звёздочка в «Минусах»', [
          ['20', '+20'],
          ['50', '+50'],
          ['100', '+100'],
        ], s)}
        ${select('forbidSumEqualsCards', 'Сумма заказов = числу карт', [
          ['false', 'Разрешена'],
          ['true', 'Запрещена (ограничивает раздающего)'],
        ], s)}
        ${select('jokerRequests', 'Заход с джокера: требовать карту', [
          ['true', 'Можно'],
          ['false', 'Нельзя'],
        ], s)}
        <p class="hint">Настройки действуют на новую партию.</p>
      </details>
    </div>
  </div>`;
}

// ---------- Гардероб ----------

function segment(key: string, value: number | string, label: string, active: boolean): string {
  return `<button class="btn seg ${active ? 'active' : ''}" data-action="skin" data-value="${key}:${value}">${label}</button>`;
}

function swatches(key: string, items: { name: string; color: number }[], current: number): string {
  return items
    .map(
      (item, i) => `<button class="swatch ${i === current ? 'active' : ''}" data-action="skin" data-value="${key}:${i}"
        style="background:${hex(item.color)}" title="${item.name}" aria-label="${item.name}"></button>`,
    )
    .join('');
}

function wardrobeHtml(ui: UiState): string {
  const { skin, name } = ui.profile;
  const male = skin.gender === 'male';
  const options = male
    ? `<div class="row">${SUITS_MALE.map((s, i) => segment('suit', i, s.name, skin.suit === i)).join('')}</div>
       <p class="row-title">Галстук: ${TIES[skin.tie].name.toLowerCase()}</p>
       <div class="row">${swatches('tie', TIES, skin.tie)}</div>`
    : `<div class="row">${HAIR_FEMALE.map((h, i) => segment('hair', i, h, skin.hair === i)).join('')}</div>
       <p class="row-title">Рубашка: ${SHIRTS[skin.shirt].name.toLowerCase()}</p>
       <div class="row">${swatches('shirt', SHIRTS, skin.shirt)}</div>`;
  return `<div class="wardrobe">
    <h2>Гардероб</h2>
    <label class="name-field">Ваше имя
      <input type="text" data-profile="name" maxlength="14" value="${name.replace(/"/g, '&quot;')}" placeholder="Вы" autocomplete="off">
    </label>
    <div class="row">
      ${segment('gender', 'male', 'Мужчина', male)}
      ${segment('gender', 'female', 'Женщина', !male)}
    </div>
    ${options}
    <button class="btn primary" data-action="close-wardrobe">Готово</button>
  </div>`;
}

// ---------- Игра с друзьями ----------

function lobbyHtml(ui: UiState): string {
  const online = ui.online;
  const error = online?.error ? `<p class="error">${online.error}</p>` : '';
  const back = '<button class="btn" data-action="leave-lobby">Назад в меню</button>';

  if (!online?.code) {
    // Ещё не в комнате: создать свою или войти по коду.
    const busy = online?.status === 'connecting';
    return `<div class="menu"><div class="menu-card">
      <h1>Игра с друзьями</h1>
      <p class="lead">Создайте игру и отправьте друзьям ссылку — или введите код, который прислали вам.</p>
      ${error}
      <button class="btn primary" data-action="create-room" ${busy ? 'disabled' : ''}>Создать игру</button>
      <div class="join-row">
        <input type="text" data-join-code maxlength="5" placeholder="КОД" value="${ui.joinCode}" autocomplete="off" autocapitalize="characters">
        <button class="btn" data-action="join-room" ${busy ? 'disabled' : ''}>Войти</button>
      </div>
      ${busy ? '<p class="hint">Подключение к серверу… Если сервер «спал», это займёт до минуты.</p>' : ''}
      ${back}
    </div></div>`;
  }

  const seats = online.seats
    .map((seat, index) => {
      if (!seat) return '<li class="seat-free">свободно — займёт бот</li>';
      const you = index === 0 ? ' <span class="badge">вы</span>' : '';
      const off = seat.connected ? '' : ' (нет связи)';
      return `<li>${seat.name}${you}${off}</li>`;
    })
    .join('');
  const link = `${location.origin}${location.pathname}?room=${online.code}`;
  const start = online.host
    ? '<button class="btn primary" data-action="start-room">Начать игру</button>'
    : '<p class="hint">Ждём, когда создатель комнаты начнёт игру…</p>';
  return `<div class="menu"><div class="menu-card">
    <h1>Комната</h1>
    <p class="room-code" title="Код комнаты">${online.code}</p>
    <div class="join-row">
      <input type="text" readonly value="${link}" data-room-link>
      <button class="btn" data-action="copy-link">${ui.linkCopied ? 'Скопировано' : 'Копировать'}</button>
    </div>
    <ol class="seat-list">${seats}</ol>
    ${error}
    ${start}
    ${back}
  </div></div>`;
}

// ---------- Игра ----------

function topbarHtml(game: GameState): string {
  const round = currentRound(game);
  let trump = '';
  if (round.mode === 'noTrump') trump = 'без козыря';
  else if (game.trump) trump = `козырь ${suitHtml(game.trump)}`;
  else trump = 'козырь скрыт';
  return `<header class="topbar">
    <div class="round-info">
      <b>Раунд ${game.roundIndex + 1}/${game.rounds.length}</b>
      <span class="mode">«${roundName(round)}» · ${trump}</span>
    </div>
    <div class="top-buttons">
      <button class="btn small ${gfx.sound ? '' : 'off'}" data-action="toggle-sound" aria-label="Звук" title="Звук">♪</button>
      <button class="btn small" data-action="open-sheet">Таблица</button>
      <button class="btn small" data-action="open-quit" aria-label="Меню">☰</button>
    </div>
  </header>`;
}

/** «Заказал / взял», например «2 / 1». В режимах без заказа — только взятки. */
function bidLine(game: GameState, player: number): string {
  const taken = game.taken[player];
  if (!hasBidding(currentRound(game).mode)) return `взято <b>${taken}</b>`;
  const bid = game.bids[player];
  return `<b>${bid === null ? '—' : bid}</b> / <b>${taken}</b>`;
}

/** Табличка игрока. Для соперников её положение задаёт 3D-сцена (см. app.ts). */
function plateHtml(game: GameState, player: number): string {
  const active = (game.phase === 'bidding' || game.phase === 'playing') && game.turn === player;
  const dealer = game.dealer === player ? '<span class="badge" title="Раздаёт">Р</span>' : '';
  return `<div class="plate ${active ? 'active' : ''} ${player === HUMAN ? 'mine' : ''}" data-seat="${player}">
    <span class="plate-name">${game.playerNames[player]}${dealer}</span>
    <span class="plate-bid" title="заказал / взял">${bidLine(game, player)}</span>
    <span class="plate-score">${plain(totals(game)[player])}</span>
  </div>`;
}

/** Подсказка: что сейчас происходит и что должен сделать человек. */
function statusText(ui: UiState, game: GameState): string {
  const names = game.playerNames;
  const round = currentRound(game);
  switch (game.phase) {
    case 'deal':
      return game.dealer === HUMAN ? 'Вы раздаёте…' : `Раздаёт ${names[game.dealer]}…`;
    case 'bidding':
      if (ui.dealing) return 'Раздача…';
      if (game.turn !== HUMAN) return `${names[game.turn]} думает над заказом…`;
      return round.mode === 'dark'
        ? 'Тёмная: заказ вслепую, до раздачи. Сколько взяток возьмёте?'
        : 'Ваш заказ: сколько взяток возьмёте?';
    case 'playing':
      if (ui.dealing) return 'Раздача…';
      if (game.turn !== HUMAN) return `Ходит ${names[game.turn]}…`;
      return humanTurnText(ui, game);
    case 'trickEnd':
      return game.trickWinner === HUMAN ? 'Вы берёте взятку' : `Взятку берёт ${names[game.trickWinner ?? 0]}`;
    default:
      return '';
  }
}

function humanTurnText(ui: UiState, game: GameState): string {
  if (ui.selected) return 'Нажмите на карту ещё раз, чтобы сыграть её';
  const hand = game.hands[HUMAN];
  if (game.trick.length === 0) return 'Ваш ход — заходите с любой карты';

  const first = game.trick[0];
  if (first.joker?.demand && requestedCards(hand, first.joker.demand, game.trump).length > 0) {
    return `${game.playerNames[first.player]} требует ${DEMAND_TEXT[first.joker.demand]} — положите её`;
  }
  const suit = leadSuit(game.trick);
  const legal = legalCardsFor(game, HUMAN);
  if (suit === null || legal.length === hand.length) return 'Ваш ход — можно любую карту';
  const normal = hand.filter((c) => !isJoker(c));
  if (normal.some((c) => c.suit === suit)) {
    return `Ваш ход — нужно ходить в масть: ${SUIT_NAME[suit]} ${SUIT_SYMBOL[suit]}`;
  }
  return `Ваш ход — масти нет, нужно бросить козырь ${game.trump ? SUIT_SYMBOL[game.trump] : ''}`;
}

function actionsHtml(ui: UiState, game: GameState): string {
  if (game.phase !== 'bidding' || game.turn !== HUMAN || ui.dealing) return '';
  const allowed = allowedBids(game, HUMAN);
  const max = currentRound(game).cards;
  let buttons = '';
  for (let bid = 0; bid <= max; bid++) {
    const ok = allowed.includes(bid);
    buttons += `<button class="btn bid" data-action="bid" data-value="${bid}" ${ok ? '' : 'disabled'}>${bid}</button>`;
  }
  return `<div class="bids">${buttons}</div>`;
}

function hudHtml(ui: UiState, game: GameState): string {
  let plates = '';
  for (let player = 1; player < PLAYER_COUNT; player++) plates += plateHtml(game, player);
  return `<div class="hud">
    ${topbarHtml(game)}
    ${plates}
    <div class="bottom">
      <p class="status-text">${statusText(ui, game)}</p>
      <div class="actions">${actionsHtml(ui, game)}</div>
      ${plateHtml(game, HUMAN)}
    </div>
  </div>`;
}

// ---------- Таблица очков ----------

function cellHtml(round: RoundSpec, cell: GameState['sheet'][number]['cells'][number]): string {
  const top = hasBidding(round.mode) ? `${cell.bid}/${cell.tricks}` : `${cell.tricks}`;
  const cls = cell.points > 0 ? 'pos' : cell.points < 0 ? 'neg' : '';
  return `<td><span class="bt">${top}${cell.star ? ' ★' : ''}</span><b class="${cls}">${signed(cell.points)}</b></td>`;
}

export function sheetHtml(game: GameState): string {
  const head = game.playerNames.map((n) => `<th>${n}</th>`).join('');
  let rows = '';
  game.rounds.forEach((round, index) => {
    const row = game.sheet[index];
    const current = index === game.roundIndex && game.phase !== 'gameOver';
    const trump = row ? (row.trump ? suitHtml(row.trump) : '—') : '';
    const cells = row
      ? row.cells.map((cell) => cellHtml(row.round, cell)).join('')
      : '<td></td>'.repeat(PLAYER_COUNT);
    rows += `<tr class="${current ? 'current' : ''}">
      <td class="num">${index + 1}</td>
      <td class="rname">${roundName(round)}</td>
      <td class="tr">${trump}</td>${cells}</tr>`;
  });
  const sums = totals(game);
  const best = game.phase === 'gameOver' ? winners(sums) : [];
  const foot = sums.map((sum, i) => `<td class="${best.includes(i) ? 'best' : ''}">${plain(sum)}</td>`).join('');
  return `<div class="sheet-wrap"><table class="sheet">
    <thead><tr><th>№</th><th>Раунд</th><th>Коз.</th>${head}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3">Итог</td>${foot}</tr></tfoot>
  </table></div>
  <p class="hint">В ячейке: заказ/взято и очки за раунд. ★ — звёздочка.</p>`;
}

// ---------- Окна ----------

function modalHtml(title: string, body: string, buttons: string, wide = false): string {
  return `<div class="overlay"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-label="${title}">
    <h2>${title}</h2>
    <div class="modal-body">${body}</div>
    <div class="modal-buttons">${buttons}</div>
  </div></div>`;
}

const CLOSE_BUTTON = '<button class="btn primary" data-action="close-modal">Закрыть</button>';

function rulesHtml(): string {
  return `<ul class="rules">
    <li><b>Главное правило.</b> Обязан ходить в масть захода. Нет масти — обязан бросить козырь. Нет и козыря — любая карта.</li>
    <li><b>Взятку берёт</b> старший козырь, а без козырей — старшая карта масти захода. Старшинство: 6, 7, 8, 9, 10, В, Д, К, Т.</li>
    <li><b>Заказ.</b> Взял ровно — 10 очков за взятку. Перебрал — 1 очко за взятку. Недобрал — −10 за каждую недобранную. Лучше перебрать, чем недобрать.</li>
    <li><b>Раунды.</b> 1…8 карт, затем 9 карт ×4, «Без козыря» ×4, «Тёмная» ×4 (заказ вслепую), «Минуса» ×4, «Плюса» ×4.</li>
    <li><b>Минуса:</b> каждая взятка −20, ни одной — ★ +50. <b>Плюса:</b> каждая взятка +20, ни одной — ★ −50.</li>
    <li><b>7♠ — джокер.</b> Можно бросить когда угодно. Вы решаете: она самая сильная (забирает взятку) или самая слабая (отдаёт). Заходя с неё, можно потребовать у всех козырь, самую сильную или самую слабую карту.</li>
  </ul>`;
}

function jokerModalHtml(game: GameState, mode: JokerMode | null): string {
  const cancel = '<button class="btn" data-action="close-modal">Отмена</button>';
  if (mode === null) {
    const body = `<div class="choice">
      <button class="btn choice-btn" data-action="joker-mode" data-value="high">
        <b>Самая сильная</b><small>забирает взятку</small></button>
      <button class="btn choice-btn" data-action="joker-mode" data-value="low">
        <b>Самая слабая</b><small>взятку не берёт</small></button>
    </div>`;
    return modalHtml('Семёрка пик — джокер', body, cancel);
  }
  // Заход с джокера: можно что-то потребовать у остальных.
  const demands = jokerDemandsFor(game)
    .map((demand) => `<button class="btn choice-btn" data-action="joker-demand" data-value="${demand}">
        <b>Потребовать ${DEMAND_TEXT[demand]}</b><small>у всех остальных игроков</small></button>`)
    .join('');
  const body = `<div class="choice">
    <button class="btn choice-btn" data-action="joker-demand" data-value="">
      <b>Ничего не требовать</b><small>просто зайти с джокера</small></button>
    ${demands}
  </div>`;
  return modalHtml('Что потребовать у остальных?', body, cancel);
}

function roundEndHtml(game: GameState): string {
  const row = game.sheet[game.sheet.length - 1];
  const withBids = hasBidding(row.round.mode);
  const lines = row.cells
    .map((cell, player) => {
      const cls = cell.points > 0 ? 'pos' : cell.points < 0 ? 'neg' : '';
      return `<tr>
        <td class="left">${game.playerNames[player]}</td>
        ${withBids ? `<td>${cell.bid}</td>` : ''}
        <td>${cell.tricks}${cell.star ? ' ★' : ''}</td>
        <td><b class="${cls}">${signed(cell.points)}</b></td>
        <td><b>${plain(cell.total)}</b></td>
      </tr>`;
    })
    .join('');
  const last = game.roundIndex + 1 >= game.rounds.length;
  const body = `<table class="result">
    <thead><tr><th class="left">Игрок</th>${withBids ? '<th>Заказ</th>' : ''}<th>Взято</th><th>Очки</th><th>Всего</th></tr></thead>
    <tbody>${lines}</tbody></table>`;
  const buttons = `<button class="btn" data-action="open-sheet">Вся таблица</button>
    <button class="btn primary" data-action="next-round">${last ? 'Итоги партии' : 'Следующий раунд'}</button>`;
  return modalHtml(`Раунд ${game.roundIndex + 1} «${roundName(row.round)}» сыгран`, body, buttons);
}

function gameOverHtml(game: GameState): string {
  const best = winners(totals(game));
  const title = best.includes(HUMAN)
    ? best.length > 1
      ? 'Ничья — вы делите победу!'
      : 'Вы победили!'
    : `Победа: ${best.map((p) => game.playerNames[p]).join(' и ')}`;
  return modalHtml(title, sheetHtml(game), '<button class="btn primary" data-action="to-menu">Новая партия</button>', true);
}

function gfxSelect(key: string, label: string, options: [string, string][], current: string): string {
  const items = options
    .map(([value, text]) => `<option value="${value}" ${value === current ? 'selected' : ''}>${text}</option>`)
    .join('');
  return `<label class="setting"><span>${label}</span><select data-gfx="${key}">${items}</select></label>`;
}

function gfxSettingsHtml(): string {
  return `${gfxSelect('sound', 'Звук', [['true', 'Включён'], ['false', 'Выключен']], String(gfx.sound))}
    ${gfxSelect('quality', 'Качество', [['high', 'Высокое'], ['low', 'Низкое (для слабых телефонов)']], gfx.quality)}
    ${gfxSelect('pixelScale', 'Пиксельность', [['2', 'Мелкие пиксели'], ['3', 'Обычные'], ['4', 'Крупные']], String(gfx.pixelScale))}
    ${gfxSelect('bloom', 'Свечение (блум)', [['true', 'Включено'], ['false', 'Выключено']], String(gfx.bloom))}`;
}

function overlayHtml(ui: UiState): string {
  const game = ui.game;
  switch (ui.modal.kind) {
    case 'rules':
      return modalHtml('Правила коротко', rulesHtml(), CLOSE_BUTTON);
    case 'settings':
      return modalHtml('Настройки', gfxSettingsHtml(), CLOSE_BUTTON);
    case 'sheet':
      return game ? modalHtml('Таблица очков', sheetHtml(game), CLOSE_BUTTON, true) : '';
    case 'quit':
      return modalHtml(
        'Меню',
        ui.online
          ? '<p>Если выйти, за вас будет ходить бот. Вернуться можно по той же ссылке.</p>'
          : '<p>Партия сохраняется автоматически — её можно продолжить позже.</p>',
        `<button class="btn" data-action="open-settings">Настройки</button>
         <button class="btn" data-action="open-rules">Правила</button>
         <button class="btn" data-action="to-menu">Выйти в меню</button>
         <button class="btn primary" data-action="close-modal">Вернуться к игре</button>`,
      );
    case 'joker':
      return game ? jokerModalHtml(game, ui.modal.mode) : '';
    case 'none':
      if (ui.screen !== 'game' || !game) return '';
      if (game.phase === 'roundEnd') return roundEndHtml(game);
      if (game.phase === 'gameOver') return gameOverHtml(game);
      return '';
  }
}

export function appHtml(ui: UiState): string {
  if (ui.screen === 'wardrobe') return wardrobeHtml(ui);
  if (ui.screen === 'lobby') return lobbyHtml(ui);
  if (ui.screen === 'menu' || !ui.game) return menuHtml(ui) + overlayHtml(ui);
  return hudHtml(ui, ui.game) + overlayHtml(ui);
}
