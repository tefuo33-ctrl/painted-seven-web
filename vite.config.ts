import { type Plugin, loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

/** Адрес сервера игры с друзьями (как в src/net/client.ts). */
const PUBLIC_SERVER_URL = 'wss://painted-seven-web.onrender.com';

/**
 * Политика безопасности страницы (Content-Security-Policy) в собранной игре: скрипты — только
 * свои (никаких вставленных в страницу), связь — только со своим сервером. Даже если чужой
 * HTML как-то попадёт на страницу, браузер не выполнит из него ни одного скрипта.
 * При разработке (npm run dev) не добавляется: там Vite сам вставляет стили и скрипты.
 */
function contentSecurityPolicy(serverUrl: string): Plugin {
  const policy = [
    "default-src 'self'",
    // 'wasm-unsafe-eval' — для распаковщика сжатых 3D-моделей (meshopt, WebAssembly).
    "script-src 'self' 'wasm-unsafe-eval'",
    // Стили: свой файл и положение табличек над игроками (style="…", задаёт код игры).
    "style-src 'self' 'unsafe-inline'",
    // Картинки карт рисуются в canvas (data:), текстуры моделей — blob:.
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    `connect-src 'self' data: blob: ${serverUrl} ws://localhost:8787 ws://127.0.0.1:8787`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

// base: './' — чтобы собранная игра работала из любой папки:
// на GitHub Pages, внутри Capacitor (телефон) и Tauri (компьютер).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    base: './',
    plugins: [contentSecurityPolicy(env.VITE_SERVER_URL || PUBLIC_SERVER_URL)],
    test: {
      include: ['tests/**/*.test.ts'],
    },
  };
});
