// Интерфейс поверх 3D-сцены: меню, гардероб, лобби, таблички игроков, подсказки, окна.
// Здесь только HTML-строки. Правила берутся из движка (src/engine), тексты — из переводов (src/i18n).

import {
  type GameState,
  type JokerDemand,
  type JokerMode,
  type RoundSpec,
  type RuleSettings,
  type Suit,
  SUITS,
  SUIT_SYMBOL,
  bidBan,
  currentRound,
  hasBidding,
  isJoker,
  jokerDemandsFor,
  leadSuit,
  legalCardsFor,
  requestedCards,
  totals,
  winners,
} from '../engine';
import { type Language, type TextKey, LANGUAGES, cardsCount, getLanguage, localName, t, tKey } from '../i18n';
import type { SeatInfo } from '../net/protocol';
import { cardImage } from '../three/cardAtlas';
import { seatOfPlayer } from '../three/tableState';
import {
  type Skin,
  ACCESSORIES_FEMALE,
  ACCESSORIES_MALE,
  HAIR_COLORS,
  HAIR_FEMALE,
  HAIR_MALE,
  SHIRTS,
  SHOES_FEMALE,
  SHOES_MALE,
  SKIRTS,
  SUITS_MALE,
  TIES,
} from '../three/character';
import { gfx, hex } from '../three/gfx';
import type { Profile } from './profile';

export const HUMAN = 0;

/** Что сейчас открыто поверх стола. */
export type Modal =
  | { kind: 'none' }
  | { kind: 'sheet' }
  | { kind: 'rules' }
  | { kind: 'quit' }
  | { kind: 'settings' }
  | { kind: 'joker'; mode: JokerMode | null; pickSuit: boolean };

export interface OnlineState {
  status: 'connecting' | 'ready';
  code: string | null;
  seats: (SeatInfo | null)[];
  host: boolean;
  started: boolean;
  botLevel: RuleSettings['botLevel'];
  bots: number;
  freeSeats: number;
  /** Ключ перевода или готовый текст ошибки. */
  error: string | null;
}

export type WardrobeTab = Exclude<keyof Skin, 'gender'>;

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
  wardrobeTab: WardrobeTab;
  /** Выбранная карта в руке (первое нажатие выбирает, второе — ходит). */
  selected: string | null;
  /** Идёт анимация (раздача, сбор взятки) — подсказка это учитывает. */
  dealing: boolean;
  /** Игрок повернул камеру — показываем кнопку «вернуть вид». */
  viewChanged: boolean;
  /** Короткое сообщение поверх стола (например, о штрафе за время). */
  notice: string | null;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

/** Число с настоящим знаком «минус». */
function plain(n: number): string {
  return n < 0 ? `−${Math.abs(n)}` : String(n);
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function suitHtml(suit: Suit): string {
  const red = suit === 'diamonds' || suit === 'hearts';
  return `<span class="suit ${red ? 'red' : 'black'}">${SUIT_SYMBOL[suit]}</span>`;
}

/** Название раунда на языке интерфейса: «5 карт», «Без козыря», … */
export function roundTitle(spec: RoundSpec): string {
  switch (spec.mode) {
    case 'normal':
      return cardsCount(spec.cards);
    case 'noTrump':
      return t('round.noTrump');
    case 'dark':
      return t('round.dark');
    case 'minus':
      return t('round.minus');
    case 'plus':
      return t('round.plus');
  }
}

/** Имя игрока для показа: «Вы» вместо собственного пустого имени. */
function playerName(game: GameState, player: number): string {
  return escapeHtml(localName(game.playerNames[player] || t('common.you')));
}

// ---------- Выпадающие списки ----------

function selectHtml(attribute: string, label: string, options: [string, string][], current: string): string {
  const items = options
    .map(([value, text]) => `<option value="${value}" ${value === current ? 'selected' : ''}>${text}</option>`)
    .join('');
  return `<label class="setting"><span>${label}</span><select ${attribute}>${items}</select></label>`;
}

function ruleSelect(key: keyof RuleSettings, label: string, options: [string, string][], settings: RuleSettings): string {
  return selectHtml(`data-setting="${key}"`, label, options, String(settings[key]));
}

function botLevelOptions(): [string, string][] {
  return [
    ['easy', t('bot.easy')],
    ['normal', t('bot.normal')],
    ['hard', t('bot.hard')],
    ['expert', t('bot.expert')],
  ];
}

function languageSwitchHtml(): string {
  const current = getLanguage();
  const buttons = (Object.keys(LANGUAGES) as Language[])
    .map((code) => `<button class="btn lang ${code === current ? 'active' : ''}" data-action="language" data-value="${code}" title="${LANGUAGES[code].name}">${LANGUAGES[code].short}</button>`)
    .join('');
  return `<div class="lang-switch">${buttons}</div>`;
}

// ---------- Главное меню ----------

function menuHtml(ui: UiState): string {
  const s = ui.settings;
  return `<div class="menu">
    ${languageSwitchHtml()}
    <div class="menu-card">
      <h1>${t('app.title')}</h1>
      <p class="subtitle">${t('app.subtitle')}</p>
      <p class="lead">${t('app.lead')}</p>
      <button class="btn primary" data-action="start">${t('menu.playBots')}</button>
      ${ui.hasSave ? `<button class="btn" data-action="continue">${t('menu.continue')}</button>` : ''}
      <button class="btn" data-action="open-lobby">${t('menu.friends')}</button>
      <button class="btn" data-action="open-wardrobe">${t('menu.wardrobe')}</button>
      <div class="menu-row">
        <button class="btn" data-action="open-settings">${t('menu.settings')}</button>
        <button class="btn" data-action="open-rules">${t('menu.rules')}</button>
      </div>
      <details class="settings">
        <summary>${t('menu.ruleSettings')}</summary>
        ${ruleSelect('gameLength', t('rule.length'), [
          ['full', t('rule.length.full')],
          ['short', t('rule.length.short')],
        ], s)}
        ${ruleSelect('botLevel', t('rule.bots'), botLevelOptions(), s)}
        ${ruleSelect('turnSeconds', t('rule.timer'), [
          ['30', t('rule.timer.seconds', { n: 30 })],
          ['60', t('rule.timer.seconds', { n: 60 })],
          ['0', t('rule.timer.off')],
        ], s)}
        ${ruleSelect('forbidSumEqualsCards', t('rule.sum'), [
          ['true', t('rule.sum.forbidden')],
          ['false', t('rule.sum.allowed')],
        ], s)}
        ${ruleSelect('maxPassesInRow', t('rule.passes'), [
          ['2', t('rule.passes.limit', { n: 2 })],
          ['0', t('rule.passes.any')],
        ], s)}
        ${ruleSelect('underbidRule', t('rule.underbid'), [
          ['perMissing', t('rule.underbid.missing')],
          ['perBid', t('rule.underbid.bid')],
        ], s)}
        ${ruleSelect('zeroBidPoints', t('rule.zero'), [
          ['0', t('rule.points', { n: 0 })],
          ['5', t('rule.points', { n: '+5' })],
          ['10', t('rule.points', { n: '+10' })],
        ], s)}
        ${ruleSelect('minusStarBonus', t('rule.minusStar'), [
          ['20', '+20'],
          ['50', '+50'],
          ['100', '+100'],
        ], s)}
        ${ruleSelect('jokerRequests', t('rule.jokerDemand'), [
          ['true', t('rule.allowed')],
          ['false', t('rule.forbidden')],
        ], s)}
        <p class="hint">${t('menu.settingsNote')}</p>
      </details>
    </div>
  </div>`;
}

// ---------- Гардероб ----------

interface WardrobeOption {
  key: string;
  color?: number;
}

/** Какие разделы есть у мужчины и у женщины и какие в них варианты. */
function wardrobeTabs(skin: Skin): { tab: WardrobeTab; options: WardrobeOption[] }[] {
  if (skin.gender === 'male') {
    return [
      { tab: 'suit', options: SUITS_MALE },
      { tab: 'shirt', options: SHIRTS },
      { tab: 'tie', options: TIES },
      { tab: 'hair', options: HAIR_MALE },
      { tab: 'hairColor', options: HAIR_COLORS },
      { tab: 'shoes', options: SHOES_MALE },
      { tab: 'accessory', options: ACCESSORIES_MALE },
    ];
  }
  return [
    { tab: 'shirt', options: SHIRTS },
    { tab: 'skirt', options: SKIRTS },
    { tab: 'hair', options: HAIR_FEMALE },
    { tab: 'hairColor', options: HAIR_COLORS },
    { tab: 'shoes', options: SHOES_FEMALE },
    { tab: 'accessory', options: ACCESSORIES_FEMALE },
  ];
}

function wardrobeHtml(ui: UiState): string {
  const { skin, name } = ui.profile;
  const male = skin.gender === 'male';
  const tabs = wardrobeTabs(skin);
  const active = tabs.find((entry) => entry.tab === ui.wardrobeTab) ?? tabs[0];

  const tabButtons = tabs
    .map((entry) => `<button class="btn tab ${entry === active ? 'active' : ''}" data-action="wardrobe-tab" data-value="${entry.tab}">${t(`tab.${entry.tab}` as TextKey)}</button>`)
    .join('');
  const current = skin[active.tab];
  const options = active.options
    .map((option, index) => {
      const swatch = option.color !== undefined ? `<span class="swatch" style="background:${hex(option.color)}"></span>` : '';
      return `<button class="btn option ${index === current ? 'active' : ''}" data-action="skin" data-value="${active.tab}:${index}">
        ${swatch}<span>${tKey(option.key)}</span></button>`;
    })
    .join('');

  return `<div class="wardrobe">
    <div class="wardrobe-head">
      <h2>${t('wardrobe.title')}</h2>
      <button class="btn primary" data-action="close-wardrobe">${t('common.done')}</button>
    </div>
    <label class="name-field">${t('wardrobe.name')}
      <input type="text" data-profile="name" maxlength="14" value="${escapeHtml(name)}" placeholder="${t('common.you')}" autocomplete="off">
    </label>
    <div class="row">
      <button class="btn seg ${male ? 'active' : ''}" data-action="skin" data-value="gender:male">${t('wardrobe.male')}</button>
      <button class="btn seg ${male ? '' : 'active'}" data-action="skin" data-value="gender:female">${t('wardrobe.female')}</button>
    </div>
    <div class="tabs">${tabButtons}</div>
    <div class="options">${options}</div>
    <p class="hint">${t('wardrobe.hint')}</p>
    ${ui.viewChanged ? `<button class="btn small" data-action="reset-view">⟲ ${t('hud.resetView')}</button>` : ''}
  </div>`;
}

// ---------- Игра с друзьями ----------

function errorText(error: string | null): string {
  return error ? `<p class="error">${escapeHtml(tKey(error))}</p>` : '';
}

function lobbyHtml(ui: UiState): string {
  const online = ui.online;
  const error = errorText(online?.error ?? null);
  const back = `<button class="btn" data-action="leave-lobby">${t('common.back')}</button>`;

  if (!online?.code) {
    // Ещё не в комнате: создать свою или войти по коду.
    const busy = online?.status === 'connecting';
    return `<div class="menu"><div class="menu-card">
      <h1>${t('lobby.title')}</h1>
      <p class="lead">${t('lobby.lead')}</p>
      ${error}
      <button class="btn primary" data-action="create-room" ${busy ? 'disabled' : ''}>${t('lobby.create')}</button>
      <div class="join-row">
        <input type="text" data-join-code maxlength="5" placeholder="${t('lobby.code')}" value="${escapeHtml(ui.joinCode)}" autocomplete="off" autocapitalize="characters">
        <button class="btn" data-action="join-room" ${busy ? 'disabled' : ''}>${t('lobby.join')}</button>
      </div>
      ${busy ? `<p class="hint">${t('lobby.connecting')}</p>` : ''}
      ${back}
    </div></div>`;
  }

  const seats = online.seats
    .map((seat, index) => {
      if (!seat) return `<li class="seat-free">${t('lobby.free')}</li>`;
      const you = index === 0 ? ` <span class="badge">${t('common.youBadge')}</span>` : '';
      const bot = seat.bot ? ` <span class="badge dim">${t('lobby.bot')}</span>` : '';
      const off = seat.connected ? '' : ` (${t('lobby.offline')})`;
      return `<li>${escapeHtml(localName(seat.name))}${you}${bot}${off}</li>`;
    })
    .join('');
  const humans = online.seats.filter((seat) => seat && !seat.bot).length;
  const link = `${location.origin}${location.pathname}?room=${online.code}`;
  // Сложность ботов выбирает создатель комнаты; остальные её видят.
  const level = online.host
    ? selectHtml('data-room-level', t('lobby.botLevel'), botLevelOptions(), online.botLevel)
    : `<p class="hint">${t('lobby.botLevel')}: ${t(`bot.${online.botLevel}` as TextKey)}</p>`;
  // Сколько ботов посадить: от «столько, чтобы было хотя бы двое» до всех свободных мест.
  const minBots = Math.max(0, 2 - humans);
  const botOptions: [string, string][] = [];
  for (let n = minBots; n <= online.freeSeats; n++) botOptions.push([String(n), String(n)]);
  const botCount = online.host && online.freeSeats > 0
    ? selectHtml('data-room-bots', t('lobby.botCount'), botOptions, String(online.bots))
    : '';
  const start = online.host
    ? `<button class="btn primary" data-action="start-room">${t('lobby.start')}</button>`
    : `<p class="hint">${t('lobby.waitHost')}</p>`;
  return `<div class="menu"><div class="menu-card">
    <h1>${t('lobby.room')}</h1>
    <p class="room-code">${online.code}</p>
    <div class="join-row">
      <input type="text" readonly value="${link}" data-room-link>
      <button class="btn" data-action="copy-link">${ui.linkCopied ? t('lobby.copied') : t('lobby.copy')}</button>
    </div>
    <ol class="seat-list">${seats}</ol>
    <p class="hint">${t('lobby.players', { humans, bots: online.bots })}</p>
    ${botCount}
    ${online.bots > 0 ? level : ''}
    ${error}
    ${start}
    ${back}
  </div></div>`;
}

// ---------- Игра ----------

/** Козырь в левом верхнем углу: карта, показавшая его, и название масти. */
function trumpHtml(game: GameState): string {
  const round = currentRound(game);
  if (round.mode === 'noTrump') return `<div class="trump-box"><span class="trump-none">${t('trump.none')}</span></div>`;
  if (!game.trumpCard) return `<div class="trump-box"><span class="trump-none">${t('trump.hidden')}</span></div>`;
  const image = `<img class="trump-card" src="${cardImage(game.trumpCard)}" alt="">`;
  // Козырь показала семёрка пик — раунд без козыря.
  const label = game.trump
    ? `${t('trump.label')}: ${suitHtml(game.trump)} ${t(`suit.${game.trump}` as TextKey)}`
    : t('trump.none');
  return `<div class="trump-box">${image}<span>${label}</span></div>`;
}

function topbarHtml(ui: UiState, game: GameState): string {
  const round = currentRound(game);
  return `<header class="topbar">
    <div class="top-left">
      <div class="round-info">
        <b>${t('round.label', { n: game.roundIndex + 1, total: game.rounds.length })}</b>
        <span class="mode">«${roundTitle(round)}»</span>
      </div>
      ${trumpHtml(game)}
    </div>
    <div class="top-buttons">
      ${ui.viewChanged ? `<button class="btn small" data-action="reset-view" title="${t('hud.resetView')}">⟲</button>` : ''}
      <button class="btn small" data-action="open-sheet">${t('hud.sheet')}</button>
      <button class="btn small" data-action="open-quit" aria-label="${t('hud.menu')}">☰</button>
    </div>
  </header>`;
}

/** «Заказал / взял», например «2 / 1». В режимах без заказа — только взятки. */
function bidLine(game: GameState, player: number): string {
  const taken = game.taken[player];
  if (!hasBidding(currentRound(game).mode)) return t('hud.taken', { n: `<b>${taken}</b>` });
  const bid = game.bids[player];
  return `<b>${bid === null ? '—' : bid}</b> / <b>${taken}</b>`;
}

/** Табличка игрока. Для соперников её положение задаёт 3D-сцена (см. app.ts). */
function plateHtml(game: GameState, player: number): string {
  const active = (game.phase === 'bidding' || game.phase === 'playing') && game.turn === player;
  const dealer = game.dealer === player ? `<span class="badge" title="${t('hud.dealer')}">${t('hud.dealerShort')}</span>` : '';
  const auto = game.autoPlay[player] ? `<span class="badge dim">${t('hud.auto')}</span>` : '';
  // Таймер хода: время подставляет app.ts каждый кадр.
  const timer = active && game.settings.turnSeconds > 0 && !game.autoPlay[player] ? '<span class="timer" data-timer></span>' : '';
  const penalty = game.penalties[player] < 0 ? `<span class="plate-penalty">⏱ ${plain(game.penalties[player])}</span>` : '';
  const seat = seatOfPlayer(game.playerNames.length, player);
  return `<div class="plate ${active ? 'active' : ''} ${player === HUMAN ? 'mine' : ''}" data-seat="${seat}">
    <span class="plate-name">${playerName(game, player)}${dealer}${auto}</span>
    <span class="plate-bid" title="${t('hud.bidTaken')}">${bidLine(game, player)}</span>
    <span class="plate-score">${plain(totals(game)[player])}</span>
    ${penalty}${timer}
  </div>`;
}

function demandText(demand: JokerDemand, suit?: Suit): string {
  if (demand === 'suit') return t('demand.suit', { suit: suit ? `${SUIT_SYMBOL[suit]} ${t(`suit.${suit}` as TextKey)}` : '' });
  return t(`demand.${demand}` as TextKey);
}

/** Подсказка: что сейчас происходит и что должен сделать человек. */
function statusText(ui: UiState, game: GameState): string {
  const round = currentRound(game);
  if (ui.notice) return ui.notice;
  switch (game.phase) {
    case 'deal':
      return game.dealer === HUMAN ? t('status.youDeal') : t('status.deals', { name: playerName(game, game.dealer) });
    case 'bidding':
      if (ui.dealing) return t('status.dealing');
      if (game.turn !== HUMAN || game.autoPlay[HUMAN]) return t('status.thinksBid', { name: playerName(game, game.turn) });
      return round.mode === 'dark' ? t('status.yourBidDark') : t('status.yourBid');
    case 'playing':
      if (ui.dealing) return t('status.dealing');
      if (game.turn !== HUMAN || game.autoPlay[HUMAN]) return t('status.plays', { name: playerName(game, game.turn) });
      return humanTurnText(ui, game);
    case 'trickEnd':
      return game.trickWinner === HUMAN ? t('status.youTake') : t('status.takes', { name: playerName(game, game.trickWinner ?? 0) });
    default:
      return '';
  }
}

function humanTurnText(ui: UiState, game: GameState): string {
  if (ui.selected) return t('status.tapAgain');
  const hand = game.hands[HUMAN];
  if (game.trick.length === 0) return t('status.lead');

  const first = game.trick[0];
  if (first.joker?.demand && requestedCards(hand, first.joker.demand, game.trump, first.joker.suit).length > 0) {
    return t('status.demand', { name: playerName(game, first.player), what: demandText(first.joker.demand, first.joker.suit) });
  }
  const suit = leadSuit(game.trick);
  const legal = legalCardsFor(game, HUMAN);
  if (suit === null || legal.length === hand.length) return t('status.any');
  const normal = hand.filter((c) => !isJoker(c));
  if (normal.some((c) => c.suit === suit)) {
    return t('status.follow', { suit: `${t(`suit.${suit}` as TextKey)} ${SUIT_SYMBOL[suit]}` });
  }
  return t('status.mustTrump', { suit: game.trump ? SUIT_SYMBOL[game.trump] : '' });
}

function actionsHtml(ui: UiState, game: GameState): string {
  if (game.phase !== 'bidding' || game.turn !== HUMAN || ui.dealing || game.autoPlay[HUMAN]) return '';
  const max = currentRound(game).cards;
  let buttons = '';
  const notes: string[] = [];
  for (let bid = 0; bid <= max; bid++) {
    const ban = bidBan(game, HUMAN, bid);
    if (ban === 'sum') notes.push(t('bid.banSum', { n: bid }));
    if (ban === 'pass') notes.push(t('bid.banPass'));
    buttons += `<button class="btn bid" data-action="bid" data-value="${bid}" ${ban ? 'disabled' : ''}>${bid}</button>`;
  }
  return `<div class="bids">${buttons}</div>${notes.map((note) => `<p class="bid-note">${note}</p>`).join('')}`;
}

function hudHtml(ui: UiState, game: GameState): string {
  let plates = '';
  for (let player = 1; player < game.playerNames.length; player++) plates += plateHtml(game, player);
  const hasJoker = game.hands[HUMAN]?.some(isJoker) ?? false;
  const kicked = game.autoPlay[HUMAN] ? `<p class="kicked">${t('hud.kicked')}</p>` : '';
  return `<div class="hud">
    ${topbarHtml(ui, game)}
    ${plates}
    <div class="bottom">
      ${kicked}
      <p class="status-text">${statusText(ui, game)}</p>
      <div class="actions">${actionsHtml(ui, game)}</div>
      <div class="mine-row">
        ${plateHtml(game, HUMAN)}
        ${hasJoker ? `<span class="joker-badge">★ ${t('hud.joker')}</span>` : ''}
      </div>
    </div>
  </div>`;
}

// ---------- Таблица очков ----------

function cellHtml(round: RoundSpec, cell: GameState['sheet'][number]['cells'][number]): string {
  const top = hasBidding(round.mode) ? `${cell.bid}/${cell.tricks}` : `${cell.tricks}`;
  const cls = cell.points > 0 ? 'pos' : cell.points < 0 ? 'neg' : '';
  const marks = `${cell.star ? ' ★' : ''}${cell.penalty < 0 ? ' ⏱' : ''}`;
  return `<td><span class="bt">${top}${marks}</span><b class="${cls}">${signed(cell.points)}</b></td>`;
}

export function sheetHtml(game: GameState): string {
  const head = game.playerNames.map((_, i) => `<th>${playerName(game, i)}</th>`).join('');
  let rows = '';
  game.rounds.forEach((round, index) => {
    const row = game.sheet[index];
    const current = index === game.roundIndex && game.phase !== 'gameOver';
    const trump = row ? (row.trump ? suitHtml(row.trump) : '—') : '';
    const cells = row
      ? row.cells.map((cell) => cellHtml(row.round, cell)).join('')
      : '<td></td>'.repeat(game.playerNames.length);
    rows += `<tr class="${current ? 'current' : ''}">
      <td class="num">${index + 1}</td>
      <td class="rname">${roundTitle(round)}</td>
      <td class="tr">${trump}</td>${cells}</tr>`;
  });
  const sums = totals(game);
  const best = game.phase === 'gameOver' ? winners(sums) : [];
  const foot = sums.map((sum, i) => `<td class="${best.includes(i) ? 'best' : ''}">${plain(sum)}</td>`).join('');
  return `<div class="sheet-wrap"><table class="sheet">
    <thead><tr><th>№</th><th>${t('sheet.round')}</th><th>${t('sheet.trump')}</th>${head}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3">${t('sheet.total')}</td>${foot}</tr></tfoot>
  </table></div>
  <p class="hint">${t('sheet.note')}</p>`;
}

// ---------- Окна ----------

function modalHtml(title: string, body: string, buttons: string, wide = false): string {
  return `<div class="overlay"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-label="${title}">
    <h2>${title}</h2>
    <div class="modal-body">${body}</div>
    <div class="modal-buttons">${buttons}</div>
  </div></div>`;
}

function closeButton(): string {
  return `<button class="btn primary" data-action="close-modal">${t('common.close')}</button>`;
}

function rulesHtml(): string {
  const items = (['rules.1', 'rules.2', 'rules.3', 'rules.4', 'rules.5', 'rules.6', 'rules.7', 'rules.8'] as TextKey[])
    .map((key) => `<li>${t(key)}</li>`)
    .join('');
  return `<ul class="rules">${items}</ul>`;
}

function sliderHtml(key: string, label: string, value: number, enabled: boolean): string {
  return `<label class="setting slider"><span>${label}: <b data-value-of="${key}">${value}</b></span>
    <input type="range" min="0" max="100" step="1" value="${value}" data-gfx="${key}" ${enabled ? '' : 'disabled'}></label>`;
}

function settingsHtml(): string {
  const onOff: [string, string][] = [
    ['true', t('common.on')],
    ['false', t('common.off')],
  ];
  const languages = (Object.keys(LANGUAGES) as Language[]).map((code): [string, string] => [code, LANGUAGES[code].name]);
  return `${selectHtml('data-language', t('settings.language'), languages, getLanguage())}
    ${selectHtml('data-gfx="music"', t('settings.music'), onOff, String(gfx.music))}
    ${sliderHtml('musicVolume', t('settings.musicVolume'), gfx.musicVolume, gfx.music)}
    ${selectHtml('data-gfx="sfx"', t('settings.sfx'), onOff, String(gfx.sfx))}
    ${sliderHtml('sfxVolume', t('settings.sfxVolume'), gfx.sfxVolume, gfx.sfx)}
    ${selectHtml('data-gfx="quality"', t('settings.quality'), [
      ['high', t('settings.quality.high')],
      ['low', t('settings.quality.low')],
    ], gfx.quality)}
    ${selectHtml('data-gfx="pixelScale"', t('settings.sharpness'), [
      ['1', t('settings.sharpness.full')],
      ['2', t('settings.sharpness.soft')],
      ['3', t('settings.sharpness.retro')],
    ], String(gfx.pixelScale))}
    ${selectHtml('data-gfx="bloom"', t('settings.bloom'), onOff, String(gfx.bloom))}`;
}

function choiceButton(action: string, value: string, title: string, note: string): string {
  return `<button class="btn choice-btn" data-action="${action}" data-value="${value}"><b>${title}</b><small>${note}</small></button>`;
}

function jokerModalHtml(game: GameState, mode: JokerMode | null, pickSuit: boolean): string {
  const cancel = `<button class="btn" data-action="close-modal">${t('common.cancel')}</button>`;
  if (mode === null) {
    const body = `<div class="choice">
      ${choiceButton('joker-mode', 'high', t('joker.high'), t('joker.highNote'))}
      ${choiceButton('joker-mode', 'low', t('joker.low'), t('joker.lowNote'))}
    </div>`;
    return modalHtml(t('joker.title'), body, cancel);
  }
  if (pickSuit) {
    // Без козыря: какую масть потребовать.
    const suits = SUITS.map((suit) =>
      `<button class="btn suit-btn" data-action="joker-suit" data-value="${suit}">${suitHtml(suit)}<small>${t(`suit.${suit}` as TextKey)}</small></button>`,
    ).join('');
    return modalHtml(t('joker.suitTitle'), `<div class="suit-choice">${suits}</div>`, cancel);
  }
  // Заход с джокера: можно что-то потребовать у остальных.
  const demands = jokerDemandsFor(game)
    .map((demand) =>
      choiceButton(
        'joker-demand',
        demand,
        demand === 'suit' ? t('joker.demand', { what: t('joker.suitWhat') }) : t('joker.demand', { what: demandText(demand) }),
        t('joker.fromAll'),
      ),
    )
    .join('');
  const body = `<div class="choice">
    ${choiceButton('joker-demand', '', t('joker.nothing'), t('joker.nothingNote'))}
    ${demands}
  </div>`;
  return modalHtml(t('joker.demandTitle'), body, cancel);
}

function roundEndHtml(ui: UiState, game: GameState): string {
  const row = game.sheet[game.sheet.length - 1];
  const withBids = hasBidding(row.round.mode);
  const withPenalty = row.cells.some((cell) => cell.penalty < 0);
  const seats = ui.online?.seats ?? [];
  const lines = row.cells
    .map((cell, player) => {
      const cls = cell.points > 0 ? 'pos' : cell.points < 0 ? 'neg' : '';
      const ready = ui.online && seats[player]?.ready ? ` <span class="badge">${t('result.readyMark')}</span>` : '';
      return `<tr>
        <td class="left">${playerName(game, player)}${ready}</td>
        ${withBids ? `<td>${cell.bid}</td>` : ''}
        <td>${cell.tricks}${cell.star ? ' ★' : ''}</td>
        ${withPenalty ? `<td>${cell.penalty < 0 ? plain(cell.penalty) : ''}</td>` : ''}
        <td><b class="${cls}">${signed(cell.points)}</b></td>
        <td><b>${plain(cell.total)}</b></td>
      </tr>`;
    })
    .join('');
  const last = game.roundIndex + 1 >= game.rounds.length;
  let body = `<table class="result">
    <thead><tr><th class="left">${t('result.player')}</th>${withBids ? `<th>${t('result.bid')}</th>` : ''}<th>${t('result.taken')}</th>${withPenalty ? `<th>${t('result.penalty')}</th>` : ''}<th>${t('result.points')}</th><th>${t('result.total')}</th></tr></thead>
    <tbody>${lines}</tbody></table>`;

  let action: string;
  if (ui.online) {
    // С друзьями: следующий раунд начнётся, когда готовы все люди.
    const mine = seats[HUMAN]?.ready === true;
    const waiting = seats.flatMap((seat) => (seat && !seat.bot && seat.connected && !seat.ready ? [escapeHtml(localName(seat.name))] : []));
    if (mine) body += `<p class="hint">${waiting.length ? t('result.waiting', { names: waiting.join(', ') }) : t('result.youReady')}</p>`;
    action = mine
      ? `<button class="btn primary" disabled>${t('result.readyMark')} ✓</button>`
      : `<button class="btn primary" data-action="next-round">${t('result.ready')}</button>`;
  } else {
    action = `<button class="btn primary" data-action="next-round">${last ? t('result.final') : t('result.next')}</button>`;
  }
  const buttons = `<button class="btn" data-action="open-sheet">${t('result.sheet')}</button>${action}`;
  return modalHtml(t('result.title', { n: game.roundIndex + 1, name: roundTitle(row.round) }), body, buttons);
}

function gameOverHtml(game: GameState): string {
  const best = winners(totals(game));
  const title = best.includes(HUMAN)
    ? best.length > 1
      ? t('over.draw')
      : t('over.youWin')
    : t('over.winner', { names: best.map((p) => playerName(game, p)).join(', ') });
  return modalHtml(title, sheetHtml(game), `<button class="btn primary" data-action="to-menu">${t('over.newGame')}</button>`, true);
}

function overlayHtml(ui: UiState): string {
  const game = ui.game;
  switch (ui.modal.kind) {
    case 'rules':
      return modalHtml(t('rules.title'), rulesHtml(), closeButton());
    case 'settings':
      return modalHtml(t('settings.title'), settingsHtml(), closeButton());
    case 'sheet':
      return game ? modalHtml(t('sheet.title'), sheetHtml(game), closeButton(), true) : '';
    case 'quit':
      return modalHtml(
        t('quit.title'),
        `<p>${ui.online ? t('quit.online') : t('quit.solo')}</p><p class="hint">${t('hud.cameraHint')}</p>`,
        `<button class="btn" data-action="open-settings">${t('menu.settings')}</button>
         <button class="btn" data-action="open-rules">${t('menu.rules')}</button>
         <button class="btn" data-action="to-menu">${t('quit.leave')}</button>
         <button class="btn primary" data-action="close-modal">${t('quit.resume')}</button>`,
      );
    case 'joker':
      return game ? jokerModalHtml(game, ui.modal.mode, ui.modal.pickSuit) : '';
    case 'none':
      if (ui.screen !== 'game' || !game) return '';
      if (game.phase === 'roundEnd') return roundEndHtml(ui, game);
      if (game.phase === 'gameOver') return gameOverHtml(game);
      return '';
  }
}

export function appHtml(ui: UiState): string {
  if (ui.screen === 'wardrobe') return wardrobeHtml(ui) + overlayHtml(ui);
  if (ui.screen === 'lobby') return lobbyHtml(ui) + overlayHtml(ui);
  if (ui.screen === 'menu' || !ui.game) return menuHtml(ui) + overlayHtml(ui);
  return hudHtml(ui, ui.game) + overlayHtml(ui);
}
