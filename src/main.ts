// Точка входа веб-версии: 3D-сцена на заднем плане и интерфейс поверх неё.

import './ui/style.css';
import { getLanguage, loadLanguage } from './i18n';
import { loadGfx } from './three/gfx';
import { createStage } from './three/stage';
import { startApp } from './ui/app';

const stageRoot = document.getElementById('stage');
const root = document.getElementById('app');

// Адрес с «?scene» показывает только 3D-сцену, без интерфейса (для проверки картинки).
if (new URLSearchParams(location.search).has('scene')) {
  document.body.classList.add('scene-only');
}

loadGfx();
loadLanguage();
document.documentElement.lang = getLanguage();

if (stageRoot && root) {
  const stage = createStage(stageRoot);
  startApp(root, stage);
}
