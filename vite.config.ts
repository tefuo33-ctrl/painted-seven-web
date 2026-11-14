import { defineConfig } from 'vitest/config';

// base: './' — чтобы собранная игра работала из любой папки:
// на GitHub Pages, внутри Capacitor (телефон) и Tauri (компьютер).
export default defineConfig({
  base: './',
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
