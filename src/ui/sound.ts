// Звук: тихий шум моря, щелчок карты, звон при взятке. Всё синтезируется кодом —
// никаких звуковых файлов. Браузер разрешает звук только после первого нажатия.

let context: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
let seaStarted = false;

function noiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Вызвать при первом нажатии человека: создаёт звук и запускает шум моря. */
export function unlockSound(): void {
  if (!context) {
    const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    context = new AudioContextClass();
    master = context.createGain();
    master.gain.value = enabled ? 1 : 0;
    master.connect(context.destination);
  }
  if (context.state === 'suspended') void context.resume();
  if (!seaStarted) startSea();
}

/** Шум моря: приглушённый шум, который медленно накатывает и отступает. */
function startSea(): void {
  if (!context || !master) return;
  seaStarted = true;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context, 4);
  source.loop = true;
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 520;
  const gain = context.createGain();
  gain.gain.value = 0.035;
  // Медленная «волна» громкости.
  const wave = context.createOscillator();
  wave.frequency.value = 0.11;
  const depth = context.createGain();
  depth.gain.value = 0.02;
  wave.connect(depth).connect(gain.gain);
  source.connect(filter).connect(gain).connect(master);
  source.start();
  wave.start();
}

export function setSoundEnabled(value: boolean): void {
  enabled = value;
  if (master && context) master.gain.setTargetAtTime(value ? 1 : 0, context.currentTime, 0.05);
}

/** Щелчок карты о стол. */
export function playCardSound(): void {
  if (!context || !master || !enabled) return;
  const now = context.currentTime;
  const source = context.createBufferSource();
  source.buffer = noiseBuffer(context, 0.06);
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1900 + Math.random() * 600;
  filter.Q.value = 1.2;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.28, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
  source.connect(filter).connect(gain).connect(master);
  source.start(now);
}

/** Шелест тасуемой колоды. */
export function playShuffleSound(): void {
  for (let i = 0; i < 7; i++) window.setTimeout(playCardSound, i * 70);
}

/** Звон, когда взятка уходит к игроку. */
export function playTrickSound(): void {
  if (!context || !master || !enabled) return;
  const now = context.currentTime;
  [880, 1318.5].forEach((frequency, i) => {
    const tone = context!.createOscillator();
    tone.type = 'sine';
    tone.frequency.value = frequency;
    const gain = context!.createGain();
    const start = now + i * 0.07;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.09, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
    tone.connect(gain).connect(master!);
    tone.start(start);
    tone.stop(start + 0.75);
  });
}
