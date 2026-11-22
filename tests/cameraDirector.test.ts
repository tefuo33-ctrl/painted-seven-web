// Режиссёр камеры: подъём к ракурсу, склейки по очереди ракурсов, возврат к игроку.

import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CameraDirector } from '../src/three/cameraDirector';

/** Камера игрока за столом: у края стола, смотрит через стол. */
function playerCamera(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 500);
  camera.position.set(0, 4.6, 11.7);
  camera.lookAt(0, 2.4, -0.4);
  camera.updateMatrixWorld();
  return camera;
}

/** Прогнать `seconds` секунд кадрами по 1/30 с. Камеру игрока каждый кадр ставит OrbitCamera. */
function run(director: CameraDirector, seconds: number, onFrame?: (camera: THREE.PerspectiveCamera) => void): THREE.PerspectiveCamera {
  let camera = playerCamera();
  for (let t = 0; t < seconds; t += 1 / 30) {
    camera = playerCamera();
    director.apply(camera, 1 / 30, 60);
    onFrame?.(camera);
  }
  return camera;
}

/** Наклон взгляда вниз, градусы (90 — строго вниз). */
function pitch(camera: THREE.PerspectiveCamera): number {
  const direction = camera.getWorldDirection(new THREE.Vector3());
  return Math.round(THREE.MathUtils.radToDeg(Math.asin(-direction.y)));
}

describe('Режиссёр камеры', () => {
  it('плавно поднимается к виду сверху и потом возвращается к игроку', async () => {
    const director = new CameraDirector();
    const up = director.goTop('top');
    expect(director.mode).toBe('toTop');
    const camera = run(director, 2);
    await up;
    expect(director.mode).toBe('top');
    expect(pitch(camera)).toBeGreaterThan(80); // почти строго вниз
    const back = director.goBack();
    run(director, 2);
    await back;
    expect(director.mode).toBe('gameplay');
  });

  it('очередь ракурсов: склейки по кругу через заданное время', () => {
    const director = new CameraDirector();
    director.cutTo('top');
    director.play(['top', 'highSide', 'lowFar'], 2.4);
    const pitches = new Set<number>();
    let jumps = 0;
    let previous: number | null = null;
    run(director, 7.5, (camera) => {
      const now = pitch(camera);
      pitches.add(now);
      if (previous !== null && Math.abs(now - previous) > 10) jumps++; // склейка — резкий скачок, без анимации
      previous = now;
    });
    expect(pitches.size).toBe(3); // побывали на всех трёх ракурсах
    expect(jumps).toBe(3); // сверху → сбоку → низкий → снова сверху
  });

  it('один ракурс без очереди не меняется', () => {
    const director = new CameraDirector();
    director.cutTo('top');
    const pitches = new Set<number>();
    run(director, 8, (camera) => pitches.add(pitch(camera)));
    expect(pitches.size).toBe(1);
  });

  it('склейка к игроку сразу возвращает обычный вид', () => {
    const director = new CameraDirector();
    director.cutTo('top');
    director.cutTo('gameplay');
    expect(director.mode).toBe('gameplay');
    const camera = run(director, 0.1);
    expect(camera.position.z).toBeCloseTo(11.7);
  });
});
