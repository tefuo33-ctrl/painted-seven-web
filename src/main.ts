// Точка входа веб-версии: подключает стили и запускает интерфейс.

import './ui/style.css';
import { startApp } from './ui/app';

const root = document.getElementById('app');
if (root) startApp(root);
