// Разовая утилита: перекодирует WAV в MP3 для сайта.
// Запуск: npm install --no-save @breezystack/lamejs && node tools/encode-soundtrack.mjs "путь/к/файлу.wav"
import { readFileSync, writeFileSync } from 'node:fs';
import { Mp3Encoder } from '@breezystack/lamejs';

const input = process.argv[2];
const output = process.argv[3] ?? 'public/audio/soundtrack.mp3';
const file = readFileSync(input);

// Разбор заголовка WAV: ищем блоки «fmt » и «data».
let offset = 12;
let format = null;
let data = null;
while (offset + 8 <= file.length) {
  const id = file.toString('ascii', offset, offset + 4);
  const size = file.readUInt32LE(offset + 4);
  if (id === 'fmt ') {
    format = {
      tag: file.readUInt16LE(offset + 8),
      channels: file.readUInt16LE(offset + 10),
      rate: file.readUInt32LE(offset + 12),
      bits: file.readUInt16LE(offset + 22),
    };
  } else if (id === 'data') {
    data = file.subarray(offset + 8, Math.min(file.length, offset + 8 + size));
  }
  offset += 8 + size + (size % 2);
}
if (!format || !data) throw new Error('Не удалось разобрать WAV');
console.log('WAV:', format, 'секунд:', (data.length / (format.rate * format.channels * (format.bits / 8))).toFixed(1));

const bytes = format.bits / 8;
const frames = Math.floor(data.length / (bytes * format.channels));
const left = new Int16Array(frames);
const right = new Int16Array(frames);
for (let i = 0; i < frames; i++) {
  for (let c = 0; c < Math.min(2, format.channels); c++) {
    const p = (i * format.channels + c) * bytes;
    let sample;
    if (format.tag === 3) sample = Math.max(-1, Math.min(1, file.readFloatLE(data.byteOffset + p))) * 32767;
    else if (bytes === 2) sample = data.readInt16LE(p);
    else if (bytes === 3) sample = data.readIntLE(p, 3) >> 8;
    else sample = data.readInt32LE(p) >> 16;
    (c === 0 ? left : right)[i] = sample;
  }
  if (format.channels === 1) right[i] = left[i];
}

const encoder = new Mp3Encoder(2, format.rate, 128);
const chunks = [];
const block = 1152 * 40;
for (let i = 0; i < frames; i += block) {
  const part = encoder.encodeBuffer(left.subarray(i, i + block), right.subarray(i, i + block));
  if (part.length) chunks.push(Buffer.from(part));
}
const tail = encoder.flush();
if (tail.length) chunks.push(Buffer.from(tail));
writeFileSync(output, Buffer.concat(chunks));
console.log('MP3:', output, (Buffer.concat(chunks).length / 1048576).toFixed(2), 'МБ');
