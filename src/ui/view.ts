// Отрисовка: превращает состояние игры в HTML-строки. Здесь нет логики правил —
// всё, что касается правил, берётся из движка (src/engine).

import {
  type Card,
  type GameState,
  type JokerChoice,
  type JokerMode,
  type RoundSpec,
  type RuleSettings,
  type Suit,
  PLAYER_COUNT,
  SUIT_NAME,
  SUIT_SYMBOL,
  allowedBids,
  cardLabel,
  currentRound,
  firstPlayer,
  hasBidding,
  isJoker,
  isRequestMode,
  jokerOptionsFor,
  leadSuit,
  legalCardsFor,
  rankLabel,
  requestedCards,
  roundName,
  sameCard,
  totals,
  winners,
} from '../engine';

export const HUMAN = 0;

/** Что сейчас открыто поверх стола. */
export type Modal =
  | { kind: 'none' }
  | { kind: 'sheet' }
  | { kind: 'rules' }
  | { kind: 'quit' }
  | { kind: 'joker'; mode: JokerMode | null };

export interface UiState {
  screen: 'menu' | 'game';
  game: GameState | null;
  settings: RuleSettings;
  hasSave: boolean;
  modal: Modal;
}

// Родительный падеж имён: «просит у Ани».
const NAME_GENITIVE = ['вас', 'Ани', 'Бориса', 'Веры'];

const JOKER_LABEL: Record<JokerMode, string> = {
  low: 'слабая',
  high: 'сильная',
  askTrump: 'просит козырь',
  askStrongest: 'просит сильнейшую',
  askWeakest: 'просит слабейшую',
};

const REQUEST_TEXT: Record<string, string> = {
  askTrump: 'старший козырь',
  askStrongest: 'самую сильную карту',
  askWeakest: 'самую слабую карту',
};

function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

function isRed(suit: Suit): boolean {
  return suit === 'diamonds' || suit === 'hearts';
}

function suitHtml(suit: Suit): string {
  return `<span class="suit ${isRed(suit) ? 'red' : 'black'}">${SUIT_SYMBOL[suit]}</span>`;
}

function cardHtml(card: Card, extraClass = '', attrs = '', tag: 'div' | 'button' = 'div'): string {
  const joker = isJoker(card);
  const classes = ['card', isRed(card.suit) ? 'red' : 'black', joker ? 'joker' : '', extraClass]
    .filter(Boolean)
    .join(' ');
  return `<${tag} class="${classes}" ${attrs}>
    <span class="corner">${rankLabel(card.rank)}<br>${SUIT_SYMBOL[card.suit]}</span>
    <span class="pip">${joker ? '★' : SUIT_SYMBOL[card.suit]}</span>
  </${tag}>`;
}

/** Рука для показа: джокер первым, масти чередуются по цвету, козыри в конце. */
function sortedHand(hand: Card[], trump: Suit | null): Card[] {
  const order: Suit[] = ['spades', 'hearts', 'clubs', 'diamonds'];
  const suitIndex = (c: Card) => (c.suit === trump ? 10 : order.indexOf(c.suit));
  return hand.slice().sort((a, b) => {
    if (isJoker(a)) return -1;
    if (isJoker(b)) return 1;
    return suitIndex(a) - suitIndex(b) || a.rank - b.rank;
  });
}

function jokerText(choice: JokerChoice | undefined): string {
  if (!choice) return '';
  let text = JOKER_LABEL[choice.mode];
  if (choice.target !== undefined) text += ` у ${NAME_GENITIVE[choice.target]}`;
  return text;
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
      <div class="logo">${cardHtml({ suit: 'spades', rank: 7 }, 'big')}</div>
      <h1>Расписной покер</h1>
      <p class="subtitle">Painted Seven · прототип</p>
      <p class="lead">Вы против трёх ботов. Закажите взятки — и возьмите ровно столько.</p>
      <button class="btn primary" data-action="start">Новая партия</button>
      ${ui.hasSave ? '<button class="btn" data-action="continue">Продолжить партию</button>' : ''}
      <button class="btn" data-action="open-rules">Правила коротко</button>
      <details class="settings">
        <summary>Настройки правил</summary>
        ${select('gameLength', 'Длина партии', [
          ['full', 'Полная — 28 раундов'],
          ['short', 'Короткая — 7 раундов'],
        ], s)}
        ${select('cutPenalty', 'Штраф за пропущенный срез', [
          ['0', 'Выключен'],
          ['10', '−10 очков'],
          ['20', '−20 очков'],
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
        ${select('jokerRequests', 'Джокер: «попросить карту»', [
          ['true', 'Включено'],
          ['false', 'Выключено'],
        ], s)}
        ${select('jokerRequestStrength', 'Джокер с просьбой', [
          ['high', 'Забирает взятку'],
          ['low', 'Не забирает взятку'],
        ], s)}
        <p class="hint">Настройки действуют на новую партию.</p>
      </details>
    </div>
  </div>`;
}

// ---------- Стол ----------

function topbarHtml(game: GameState): string {
  const round = currentRound(game);
  let trump: string;
  if (round.mode === 'noTrump') {
    trump = '<span class="trump-none">без козыря</span>';
  } else if (game.trumpCard) {
    trump = `козырь ${cardHtml(game.trumpCard, 'mini')}`;
  } else {
    trump = '<span class="trump-none">козырь скрыт</span>';
  }
  return `<header class="topbar">
    <div class="round-info">
      <b>Раунд ${game.roundIndex + 1}/${game.rounds.length}</b>
      <span class="mode">«${roundName(round)}»</span>
    </div>
    <div class="trump">${trump}</div>
    <div class="top-buttons">
      <button class="btn small" data-action="open-sheet">Таблица</button>
      <button class="btn small" data-action="open-quit" aria-label="Меню">☰</button>
    </div>
  </header>`;
}

function bidLine(game: GameState, player: number): string {
  const round = currentRound(game);
  const taken = game.taken[player];
  if (!hasBidding(round.mode)) return `взято <b>${taken}</b>`;
  const bid = game.bids[player];
  return `заказ <b>${bid === null ? '—' : bid}</b> · взято <b>${taken}</b>`;
}

function seatHtml(game: GameState, player: number, position: string): string {
  const active =
    (game.phase === 'bidding' || game.phase === 'playing') && game.turn === player;
  const dealer = game.dealer === player ? '<span class="badge" title="Раздаёт">Р</span>' : '';
  const cards = game.hands[player]?.length ?? 0;
  return `<div class="seat seat-${position} ${active ? 'active' : ''}">
    <div class="seat-name">${game.playerNames[player]} ${dealer}</div>
    <div class="seat-score">${totals(game)[player]} очк.</div>
    <div class="seat-bid">${bidLine(game, player)}</div>
    <div class="seat-cards">${cards > 0 ? `<span class="back"></span>×${cards}` : ''}</div>
  </div>`;
}

function trickHtml(game: GameState): string {
  const positions = ['bottom', 'left', 'top', 'right'];
  let slots = '';
  for (let player = 0; player < PLAYER_COUNT; player++) {
    const play = game.trick.find((p) => p.player === player);
    const isWinner = game.phase === 'trickEnd' && game.trickWinner === player;
    const isNewest = play !== undefined && play === game.trick[game.trick.length - 1];
    let inner = '';
    if (play) {
      const label = play.joker ? `<span class="joker-note">${jokerText(play.joker)}</span>` : '';
      inner = cardHtml(play.card, `${isWinner ? 'winner' : ''} ${isNewest ? 'pop' : ''}`) + label;
    }
    slots += `<div class="slot slot-${positions[player]}">${inner}</div>`;
  }
  return `<div class="trick" data-action="skip">${slots}</div>`;
}

/** Подсказка: что сейчас происходит и что должен сделать человек. */
function statusText(game: GameState): string {
  const names = game.playerNames;
  const round = currentRound(game);
  switch (game.phase) {
    case 'deal':
      if (game.dealer === HUMAN) {
        return `Вы раздаёте. Сначала дайте срезать колоду (${names[firstPlayer(game)]}).`;
      }
      if (firstPlayer(game) === HUMAN) return `Раздаёт ${names[game.dealer]}. Срежьте колоду.`;
      return `Раздаёт ${names[game.dealer]}…`;
    case 'bidding':
      if (game.turn !== HUMAN) return `${names[game.turn]} думает над заказом…`;
      return round.mode === 'dark'
        ? 'Тёмная: заказ вслепую, до раздачи. Сколько взяток возьмёте?'
        : 'Ваш заказ: сколько взяток возьмёте?';
    case 'playing': {
      if (game.turn !== HUMAN) return `Ходит ${names[game.turn]}…`;
      return humanTurnText(game);
    }
    case 'trickEnd':
      return game.trickWinner === HUMAN
        ? 'Вы берёте взятку'
        : `Взятку берёт ${names[game.trickWinner ?? 0]}`;
    default:
      return '';
  }
}

function humanTurnText(game: GameState): string {
  const hand = game.hands[HUMAN];
  if (game.trick.length === 0) return 'Ваш ход — заходите с любой карты';

  const jokerPlay = game.trick.find((p) => p.joker);
  if (jokerPlay?.joker && isRequestMode(jokerPlay.joker.mode) && jokerPlay.joker.target === HUMAN) {
    if (requestedCards(hand, jokerPlay.joker.mode, game.trump).length > 0) {
      const who = game.playerNames[jokerPlay.player];
      return `${who} просит у вас ${REQUEST_TEXT[jokerPlay.joker.mode]} — положите её`;
    }
  }

  const suit = leadSuit(game.trick);
  const legal = legalCardsFor(game, HUMAN);
  if (suit === null || legal.length === hand.length) {
    return 'Ваш ход — можно любую карту';
  }
  const normal = hand.filter((c) => !isJoker(c));
  if (normal.some((c) => c.suit === suit)) {
    return `Ваш ход — нужно ходить в масть: ${SUIT_NAME[suit]} ${SUIT_SYMBOL[suit]}`;
  }
  return `Ваш ход — масти нет, нужно бросить козырь ${game.trump ? SUIT_SYMBOL[game.trump] : ''}`;
}

function actionsHtml(game: GameState): string {
  if (game.phase === 'deal' && game.dealer === HUMAN) {
    const penalty = game.settings.cutPenalty;
    const note = penalty > 0 ? ` (штраф −${penalty})` : '';
    return `<button class="btn primary" data-action="deal-cut">Дать срезать и раздать</button>
      <button class="btn" data-action="deal-nocut">Раздать без среза${note}</button>`;
  }
  if (game.phase === 'deal' && firstPlayer(game) === HUMAN) {
    return '<button class="btn primary" data-action="deal-cut">Срезать колоду</button>';
  }
  if (game.phase === 'bidding' && game.turn === HUMAN) {
    const allowed = allowedBids(game, HUMAN);
    const max = currentRound(game).cards;
    let buttons = '';
    for (let bid = 0; bid <= max; bid++) {
      const ok = allowed.includes(bid);
      buttons += `<button class="btn bid" data-action="bid" data-value="${bid}" ${ok ? '' : 'disabled'}>${bid}</button>`;
    }
    return `<div class="bids">${buttons}</div>`;
  }
  return '';
}

function handHtml(game: GameState): string {
  const hand = sortedHand(game.hands[HUMAN] ?? [], game.trump);
  const myTurn = game.phase === 'playing' && game.turn === HUMAN;
  const legal = myTurn ? legalCardsFor(game, HUMAN) : [];
  const cards = hand
    .map((card) => {
      const playable = legal.some((c) => sameCard(c, card));
      const cls = myTurn ? (playable ? 'playable' : 'blocked') : '';
      const attrs = `data-action="card" data-value="${cardLabel(card)}" ${playable ? '' : 'disabled'} aria-label="${cardLabel(card)}"`;
      return `<div class="hand-cell">${cardHtml(card, cls, attrs, 'button')}</div>`;
    })
    .join('');
  const active = (game.phase === 'bidding' || game.phase === 'playing') && game.turn === HUMAN;
  const dealer = game.dealer === HUMAN ? '<span class="badge" title="Раздаёт">Р</span>' : '';
  return `<section class="me ${active ? 'active' : ''}">
    <div class="me-info">
      <span class="seat-name">Вы ${dealer}</span>
      <span>${bidLine(game, HUMAN)}</span>
      <span class="seat-score">${totals(game)[HUMAN]} очк.</span>
    </div>
    <div class="hand">${cards || '<span class="hand-empty">карт пока нет</span>'}</div>
  </section>`;
}

// ---------- Таблица очков ----------

function cellHtml(row: { round: RoundSpec }, cell: GameState['sheet'][number]['cells'][number]): string {
  const top = hasBidding(row.round.mode) ? `${cell.bid}/${cell.tricks}` : `${cell.tricks}`;
  const star = cell.star ? ' ★' : '';
  const cut = cell.penalty < 0 ? ' <span title="Штраф за срез">✂</span>' : '';
  const cls = cell.points > 0 ? 'pos' : cell.points < 0 ? 'neg' : '';
  return `<td><span class="bt">${top}${star}${cut}</span><b class="${cls}">${signed(cell.points)}</b></td>`;
}

export function sheetHtml(game: GameState): string {
  const head = game.playerNames.map((n) => `<th>${n}</th>`).join('');
  let rows = '';
  game.rounds.forEach((round, index) => {
    const row = game.sheet[index];
    const current = index === game.roundIndex && game.phase !== 'gameOver';
    const trump = row
      ? row.trump
        ? suitHtml(row.trump)
        : '—'
      : '';
    const cells = row
      ? row.cells.map((cell) => cellHtml(row, cell)).join('')
      : '<td></td>'.repeat(PLAYER_COUNT);
    rows += `<tr class="${current ? 'current' : ''}">
      <td class="num">${index + 1}</td>
      <td class="rname">${roundName(round)}</td>
      <td class="tr">${trump}</td>${cells}</tr>`;
  });
  const sums = totals(game);
  const best = game.phase === 'gameOver' ? winners(sums) : [];
  const foot = sums
    .map((sum, i) => `<td class="${best.includes(i) ? 'best' : ''}">${sum}</td>`)
    .join('');
  return `<div class="sheet-wrap"><table class="sheet">
    <thead><tr><th>№</th><th>Раунд</th><th>Коз.</th>${head}</tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td colspan="3">Итог</td>${foot}</tr></tfoot>
  </table></div>
  <p class="hint">В ячейке: заказ/взято и очки за раунд. ★ — звёздочка, ✂ — штраф за срез.</p>`;
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
    <li><b>7♠ — джокер.</b> Можно бросить когда угодно. Выбираете: самая слабая, самая сильная или попросить у соперника козырь, сильнейшую или слабейшую карту (тот обязан положить её в эту взятку).</li>
  </ul>`;
}

function jokerModalHtml(game: GameState, mode: JokerMode | null): string {
  const options = jokerOptionsFor(game, HUMAN);
  const cancel = '<button class="btn" data-action="close-modal">Отмена</button>';
  if (mode !== null) {
    const option = options.find((o) => o.mode === mode);
    const targets = (option?.targets ?? [])
      .map((p) => `<button class="btn primary" data-action="joker-target" data-value="${p}">${game.playerNames[p]}</button>`)
      .join('');
    return modalHtml('У кого попросить?', `<div class="choice">${targets}</div>`, cancel);
  }
  const takes = game.settings.jokerRequestStrength === 'high' ? 'джокер берёт взятку' : 'джокер взятку не берёт';
  const text: Record<JokerMode, [string, string]> = {
    low: ['Самая слабая', 'взятку не берёт'],
    high: ['Самая сильная', 'забирает взятку'],
    askTrump: ['Попросить козырь', takes],
    askStrongest: ['Попросить самую сильную карту', takes],
    askWeakest: ['Попросить самую слабую карту', takes],
  };
  const buttons = options
    .map((o) => `<button class="btn choice-btn" data-action="joker-mode" data-value="${o.mode}">
        <b>${text[o.mode][0]}</b><small>${text[o.mode][1]}</small></button>`)
    .join('');
  const note = options.length === 2 && game.settings.jokerRequests
    ? '<p class="hint">Просить карту не у кого: все уже походили.</p>'
    : '';
  return modalHtml('Семёрка пик — джокер', `<div class="choice">${buttons}</div>${note}`, cancel);
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
        <td><b class="${cls}">${signed(cell.points)}</b>${cell.penalty < 0 ? ' ✂' : ''}</td>
        <td><b>${cell.total}</b></td>
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

function overlayHtml(ui: UiState): string {
  const game = ui.game;
  switch (ui.modal.kind) {
    case 'rules':
      return modalHtml('Правила коротко', rulesHtml(), CLOSE_BUTTON);
    case 'sheet':
      return game ? modalHtml('Таблица очков', sheetHtml(game), CLOSE_BUTTON, true) : '';
    case 'quit':
      return modalHtml(
        'Меню',
        '<p>Партия сохраняется автоматически — её можно продолжить позже.</p>',
        `<button class="btn" data-action="open-rules">Правила</button>
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
  if (ui.screen === 'menu' || !ui.game) {
    return menuHtml(ui) + overlayHtml(ui);
  }
  const game = ui.game;
  return `<div class="game">
    ${topbarHtml(game)}
    <main class="table">
      ${seatHtml(game, 2, 'top')}
      ${seatHtml(game, 1, 'left')}
      ${trickHtml(game)}
      ${seatHtml(game, 3, 'right')}
    </main>
    <div class="status">
      <p class="status-text">${statusText(game)}</p>
      <div class="actions">${actionsHtml(game)}</div>
    </div>
    ${handHtml(game)}
  </div>${overlayHtml(ui)}`;
}
