// Звук игры.
//  - Музыка: саундтрек (public/audio/soundtrack.mp3). Играет в меню, в игре звучит тише.
//  - Эффекты: шум моря, чайки, карты, джокер, таймер — синтезируются кодом, без файлов.
// Громкость музыки и эффектов регулируется отдельно (0–100) и применяется сразу.
// Браузер разрешает звук только после первого нажатия человека.

import { gfx } from '../three/gfx';

let context: AudioContext | null = null;
let sfxGain: GainNode | null = null;
let music: HTMLAudioElement | null = null;
let unlocked = false;
let ambienceStarted = false;
let gullTimer = 0;

/** Где сейчас игрок: от этого зависит громкость музыки. */
let scene: 'menu' | 'game' = 'menu';
/** Текущая громкость музыки (0…1) — плавно догоняет нужную. */
let musicLevel = 0;
let fadeTimer = 0;

function musicTarget(): number {
  if (!gfx.music || !unlocked) return 0;
  // В игре музыка уходит на задний план, чтобы не мешать.
  return (gfx.musicVolume / 100) * (scene === 'menu' ? 0.85 : 0.3);
}

/** Плавно подвести громкость музыки к нужной — без резких скачков. */
function fadeMusic(): void {
  window.clearInterval(fadeTimer);
  fadeTimer = window.setInterval(() => {
    if (!music) return;
    const target = musicTarget();
    const step = 0.02;
    musicLevel = Math.abs(target - musicLevel) <= step ? target : musicLevel + Math.sign(target - musicLevel) * step;
    music.volume = musicLevel;
    if (musicLevel > 0 && music.paused) void music.play().catch(() => {});
    if (musicLevel === 0 && target === 0) {
      if (!music.paused) music.pause();
      window.clearInterval(fadeTimer);
    } else if (musicLevel === target) {
      window.clearInterval(fadeTimer);
    }
  }, 60);
}

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Вызвать при первом нажатии человека: включает музыку и фоновые звуки. */
export function unlockSound(): void {
  if (unlocked) return;
  unlocked = true;
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (AudioContextClass) {
    context = new AudioContextClass();
    sfxGain = context.createGain();
    sfxGain.connect(context.destination);
  }
  music = new Audio(`${import.meta.env.BASE_URL}audio/soundtrack.mp3`);
  music.loop = true;
  music.volume = 0;
  music.preload = 'auto';
  applySoundSettings();
  startAmbience();
}

/** Применить настройки громкости (вызывается сразу при их изменении). */
export function applySoundSettings(): void {
  if (sfxGain && context) {
    sfxGain.gain.setTargetAtTime(gfx.sfx ? gfx.sfxVolume / 100 : 0, context.currentTime, 0.05);
  }
  if (music) fadeMusic();
}

/** Сообщить, где игрок: в меню музыка громче, в игре — тише (переход плавный). */
export function setSoundScene(next: 'menu' | 'game'): void {
  if (scene === next) return;
  scene = next;
  if (music) fadeMusic();
}

/** Шум моря и редкие крики чаек. */
function startAmbience(): void {
  if (!context || !sfxGain || ambienceStarted) return;
  ambienceStarted = true;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context, 4);
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 480;
  const gain = context.createGain();
  gain.gain.value = 0.05;
  // Медленная «волна» громкости: прибой накатывает и отступает.
  const wave = context.createOscillator();
  wave.frequency.value = 0.1;
  const depth = context.createGain();
  depth.gain.value = 0.03;
  wave.connect(depth).connect(gain.gain);
  source.connect(filter).connect(gain).connect(sfxGain);
  source.start();
  wave.start();

  const scheduleGull = () => {
    // Чайки кричат время от времени, а не постоянно.
    gullTimer = window.setTimeout(() => {
      playGull();
      scheduleGull();
    }, 14000 + Math.random() * 26000);
  };
  scheduleGull();
}

/** Крик чайки: два-три коротких нисходящих вскрика. */
function playGull(): void {
  if (!context || !sfxGain || document.hidden) return;
  const ctx = context;
  const calls = 2 + Math.floor(Math.random() * 2);
  const pan = ctx.createStereoPanner();
  pan.pan.value = Math.random() * 1.6 - 0.8;
  pan.connect(sfxGain);
  for (let i = 0; i < calls; i++) {
    const start = ctx.currentTime + i * (0.26 + Math.random() * 0.08);
    const tone = ctx.createOscillator();
    tone.type = 'sawtooth';
    const base = 1500 + Math.random() * 300;
    tone.frequency.setValueAtTime(base, start);
    tone.frequency.linearRampToValueAtTime(base * 1.25, start + 0.05);
    tone.frequency.exponentialRampToValueAtTime(base * 0.6, start + 0.22);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1900;
    filter.Q.value = 3;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.035, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    tone.connect(filter).connect(gain).connect(pan);
    tone.start(start);
    tone.stop(start + 0.26);
  }
}

/** Короткий шум с фильтром — основа карточных звуков. */
function noiseHit(frequency: number, duration: number, volume: number, delay = 0, type: BiquadFilterType = 'bandpass'): void {
  if (!context || !sfxGain) return;
  const start = context.currentTime + delay;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context, duration);
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = 1.1;
  const gain = context.createGain();
  gain.gain.setValueAtTime(volume, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
  source.connect(filter).connect(gain).connect(sfxGain);
  source.start(start);
}

function tone(frequency: number, duration: number, volume: number, delay = 0, type: OscillatorType = 'sine'): void {
  if (!context || !sfxGain) return;
  const start = context.currentTime + delay;
  const osc = context.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(sfxGain);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

/** Карта ложится на стол: мягкий шлепок. */
export function playCardSound(): void {
  noiseHit(1700 + Math.random() * 500, 0.07, 0.3);
  noiseHit(320, 0.09, 0.2, 0, 'lowpass');
}

/** Слиток ложится на стол: короткий металлический звон и глухой стук. */
export function playGoldSound(): void {
  const pitch = 0.92 + Math.random() * 0.16;
  tone(2350 * pitch, 0.22, 0.06, 0, 'sine');
  tone(3480 * pitch, 0.16, 0.035, 0, 'sine');
  tone(5210 * pitch, 0.09, 0.02, 0, 'sine');
  noiseHit(900, 0.05, 0.12, 0, 'lowpass');
}

/** Карта скользит (выбор карты в руке). */
export function playSlideSound(): void {
  noiseHit(3200, 0.11, 0.07, 0, 'highpass');
}

/** Раздача: тасование и серия щелчков — по одному на карту. */
export function playDealSound(cards: number): void {
  for (let i = 0; i < 6; i++) noiseHit(2600, 0.05, 0.08, i * 0.055, 'highpass');
  for (let i = 0; i < cards; i++) noiseHit(2100 + (i % 4) * 150, 0.05, 0.12, 0.5 + i * 0.085);
}

/** Взятка уходит к игроку: шелест карт и мягкий звон. */
export function playTrickSound(): void {
  for (let i = 0; i < 4; i++) noiseHit(2800, 0.06, 0.07, i * 0.05, 'highpass');
  tone(880, 0.7, 0.05, 0.12);
  tone(1318.5, 0.7, 0.04, 0.19);
}

/** Особый звук джокера: мерцающее восходящее арпеджио. */
export function playJokerSound(): void {
  [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((frequency, i) => {
    tone(frequency, 0.9, 0.06, i * 0.07, 'triangle');
    tone(frequency * 2.01, 0.6, 0.02, i * 0.07 + 0.02);
  });
}

/** Тик таймера на последних секундах хода. */
export function playTickSound(): void {
  tone(1100, 0.07, 0.05, 0, 'square');
}

/** Время вышло: штраф. */
export function playPenaltySound(): void {
  tone(220, 0.35, 0.09, 0, 'sawtooth');
  tone(165, 0.45, 0.09, 0.16, 'sawtooth');
}

/** Нажатие кнопки, подтверждение готовности. */
export function playClickSound(): void {
  tone(660, 0.08, 0.04);
}

export function stopAmbience(): void {
  window.clearTimeout(gullTimer);
}
