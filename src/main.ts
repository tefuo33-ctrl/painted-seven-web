// Точка входа веб-версии: 3D-сцена на заднем плане и интерфейс поверх неё.

import './ui/style.css';
import { createStage } from './three/stage';
import { startApp } from './ui/app';

const stageRoot = document.getElementById('stage');
if (stageRoot) createStage(stageRoot);

// Адрес с «?scene» показывает только 3D-сцену, без интерфейса (для проверки картинки).
if (new URLSearchParams(location.search).has('scene')) {
  document.body.classList.add('scene-only');
}

const root = document.getElementById('app');
if (root) startApp(root);
