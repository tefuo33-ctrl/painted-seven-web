// Сжатие 3D-моделей для сайта: node scripts/pack-models.mjs [файлы.glb…]
//
// Без аргументов — все .glb в public/models (и во вложенных папках). Геометрия (вершины и индексы)
// кодируется meshopt (расширение EXT_meshopt_compression): файлы в 3–5 раз меньше, а после gzip на
// сервере — ещё меньше. Качество не меняется — сжатие без потерь. Уже сжатые файлы пропускаются.
// Игра читает такие модели через createLoader() (src/three/loader.ts).

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// meshoptimizer уже стоит в node_modules (его тянет @types/three), отдельно ставить не нужно.
import { MeshoptEncoder } from 'meshoptimizer';

const EXT = 'EXT_meshopt_compression';
const COMPONENT_SIZE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function findModels(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return findModels(path);
    return name.endsWith('.glb') ? [path] : [];
  });
}

const align4 = (n) => (n + 3) & ~3;

function readGlb(file) {
  const data = readFileSync(file);
  if (data.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: не GLB`);
  let offset = 12;
  let json = null;
  let bin = Buffer.alloc(0);
  while (offset < data.length) {
    const length = data.readUInt32LE(offset);
    const type = data.readUInt32LE(offset + 4);
    const chunk = data.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString('utf8'));
    if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  return { json, bin };
}

function writeGlb(file, json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc(align4(jsonBytes.length) - jsonBytes.length, 0x20)]);
  const binPadded = Buffer.concat([bin, Buffer.alloc(align4(bin.length) - bin.length)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonPadded.length + 8 + binPadded.length, 8);
  const chunkHeader = (length, type) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(length, 0);
    b.writeUInt32LE(type, 4);
    return b;
  };
  writeFileSync(file, Buffer.concat([header, chunkHeader(jsonPadded.length, 0x4e4f534a), jsonPadded, chunkHeader(binPadded.length, 0x004e4942), binPadded]));
}

function pack(file) {
  const { json, bin } = readGlb(file);
  if ((json.extensionsUsed ?? []).includes(EXT)) return null;
  if ((json.buffers ?? []).length !== 1) return null; // внешние буферы не трогаем

  // Как используется каждый bufferView: вершины (размер элемента) или индексы треугольников.
  const usage = new Map();
  const accessorsOf = new Map();
  (json.accessors ?? []).forEach((accessor) => {
    if (accessor.bufferView === undefined) return;
    accessorsOf.set(accessor.bufferView, [...(accessorsOf.get(accessor.bufferView) ?? []), accessor]);
  });
  const indexAccessors = new Set();
  const triangleAccessors = new Set();
  for (const mesh of json.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      if (primitive.indices === undefined) continue;
      indexAccessors.add(primitive.indices);
      if ((primitive.mode ?? 4) === 4) triangleAccessors.add(primitive.indices);
    }
  }
  (json.bufferViews ?? []).forEach((view, index) => {
    const accessors = accessorsOf.get(index) ?? [];
    if (accessors.length !== 1 || (accessors[0].byteOffset ?? 0) !== 0 || accessors[0].sparse) return;
    const accessor = accessors[0];
    const size = COMPONENT_SIZE[accessor.componentType] * TYPE_COUNT[accessor.type];
    const accessorIndex = json.accessors.indexOf(accessor);
    if (indexAccessors.has(accessorIndex)) {
      if (!triangleAccessors.has(accessorIndex) || accessor.count % 3 !== 0 || (size !== 2 && size !== 4)) return;
      if (view.byteStride !== undefined) return;
      usage.set(index, { mode: 'TRIANGLES', count: accessor.count, size });
      return;
    }
    if (size % 4 !== 0 || size > 256) return;
    if (view.byteStride !== undefined && view.byteStride !== size) return;
    usage.set(index, { mode: 'ATTRIBUTES', count: accessor.count, size });
  });

  // Новый буфер: сжатые данные и несжатые (картинки) — в BIN; распакованный вид — «запасной» буфер 1.
  const parts = [];
  let binLength = 0;
  let fallbackLength = 0;
  const put = (bytes) => {
    const offset = binLength;
    parts.push(Buffer.from(bytes));
    const padding = align4(bytes.length) - bytes.length;
    if (padding) parts.push(Buffer.alloc(padding));
    binLength += align4(bytes.length);
    return offset;
  };
  json.bufferViews.forEach((view, index) => {
    const source = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const use = usage.get(index);
    if (!use) {
      view.byteOffset = put(source);
      view.buffer = 0;
      return;
    }
    const raw = new Uint8Array(source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength));
    const encoded =
      use.mode === 'TRIANGLES'
        ? MeshoptEncoder.encodeIndexBuffer(raw, use.count, use.size)
        : MeshoptEncoder.encodeVertexBuffer(raw, use.count, use.size);
    const byteOffset = put(encoded);
    view.extensions = {
      ...(view.extensions ?? {}),
      [EXT]: { buffer: 0, byteOffset, byteLength: encoded.length, byteStride: use.size, mode: use.mode, count: use.count },
    };
    if (use.mode === 'ATTRIBUTES') view.byteStride = use.size;
    view.buffer = 1;
    view.byteOffset = fallbackLength;
    fallbackLength += align4(view.byteLength);
  });
  json.buffers = [{ byteLength: binLength }, { byteLength: fallbackLength, extensions: { [EXT]: { fallback: true } } }];
  json.extensionsUsed = [...new Set([...(json.extensionsUsed ?? []), EXT])];
  json.extensionsRequired = [...new Set([...(json.extensionsRequired ?? []), EXT])];
  // Индексы атрибутов вершин требуют byteStride только у вершинных bufferView (по стандарту — ок).
  json.bufferViews.forEach((view, index) => {
    if (usage.get(index)?.mode === 'TRIANGLES') delete view.byteStride;
  });
  const before = statSync(file).size;
  writeGlb(file, json, Buffer.concat(parts));
  return { before, after: statSync(file).size };
}

await MeshoptEncoder.ready;
const files = process.argv.length > 2 ? process.argv.slice(2) : findModels('public/models');
for (const file of files) {
  const result = pack(file);
  if (!result) console.log(`${file}: уже сжат или не подходит — пропущен`);
  else console.log(`${file}: ${(result.before / 1e6).toFixed(2)} МБ → ${(result.after / 1e6).toFixed(2)} МБ`);
}
