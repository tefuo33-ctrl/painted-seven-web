// Загрузчик 3D-моделей. Модели в public/models сжаты (EXT_meshopt_compression, scripts/pack-models.mjs):
// в 3–5 раз меньше, поэтому игра открывается быстрее. Для них нужен декодер meshopt.

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

export function createLoader(): GLTFLoader {
  return new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
}
