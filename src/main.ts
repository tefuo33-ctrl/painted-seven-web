// Точка входа веб-версии: 3D-сцена на заднем плане и интерфейс поверх неё.

import './ui/style.css';
import { createGame, dealCards } from './engine';
import { createStage } from './three/stage';
import { tableStateFromGame } from './three/tableState';
import { TableView } from './three/tableView';
import { startApp } from './ui/app';

const stageRoot = document.getElementById('stage');
const stage = stageRoot ? createStage(stageRoot) : null;

// Адрес с «?scene» показывает только 3D-сцену, без интерфейса (для проверки картинки).
// «?scene=deal» дополнительно показывает раздачу карт.
const sceneMode = new URLSearchParams(location.search).get('scene');
if (sceneMode !== null) document.body.classList.add('scene-only');

if (stage && sceneMode === 'deal') {
  const table = new TableView(stage);
  const game = createGame({ seed: 7, firstDealer: 3 });
  game.rounds = [{ mode: 'normal', cards: 9 }];
  void table.shuffle().then(() => {
    dealCards(game);
    table.sync(tableStateFromGame(game, 0), { deal: true, firstSeat: 0 });
  });
  // Для ручной проверки в консоли браузера.
  Object.assign(window, { demo: { table, game, sync: () => table.sync(tableStateFromGame(game, 0)) } });
}

const root = document.getElementById('app');
if (root) startApp(root);
