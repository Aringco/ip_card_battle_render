'use client';

import { SFX_MANIFEST, type SfxName } from './assetManifest';
import { getPreloadedObjectUrl } from './preload';
import { getSfxVolume } from './audioSettings';

type SoundAnimal = SfxName;

// 재생용 Audio 캐시 — 프리로드로 받아둔 blob URL(있으면)로 만들어두고,
// 재생할 때마다 cloneNode로 복제해 겹쳐 울릴 수 있게 한다.
const audioCache = new Map<string, HTMLAudioElement>();

function getBaseAudio(src: string): HTMLAudioElement {
  const cached = audioCache.get(src);
  if (cached) return cached;

  // 프리로드가 끝났다면 네트워크를 타지 않는 blob URL을 쓴다.
  const audio = new Audio(getPreloadedObjectUrl(src) ?? src);
  audio.preload = 'auto';
  audioCache.set(src, audio);
  return audio;
}

function playSrc(src: string, rate = 1, volume = 1, fadeOutMs = 0) {
  const effectiveVolume = Math.min(1, Math.max(0, volume)) * getSfxVolume();
  if (effectiveVolume <= 0) return;
  const audio = getBaseAudio(src).cloneNode(true) as HTMLAudioElement;
  audio.playbackRate = rate;
  audio.volume = effectiveVolume;
  // 끝 fadeOutMs 동안 소리를 줄인다 — 앞만 잘라 낸 파일(scripts/trimSound.mjs)이 뚝 끊기며 딸깍거리지 않게
  if (fadeOutMs > 0) {
    audio.addEventListener(
      'playing',
      () => {
        const totalMs = (audio.duration * 1000) / rate;
        if (!Number.isFinite(totalMs)) return;
        window.setTimeout(() => {
          const start = performance.now();
          const tick = window.setInterval(() => {
            const k = 1 - (performance.now() - start) / fadeOutMs;
            audio.volume = effectiveVolume * Math.max(0, k);
            if (k <= 0) window.clearInterval(tick);
          }, 16);
        }, Math.max(0, totalMs - fadeOutMs));
      },
      { once: true },
    );
  }
  audio.play().catch(() => {});
}

export function playRandomSound(animal: SoundAnimal, rate = 1, volume = 1, fallback?: SoundAnimal, fadeOutMs = 0) {
  const files = SFX_MANIFEST[animal];
  if (!files || files.length === 0) {
    if (fallback) playRandomSound(fallback, rate, volume, undefined, fadeOutMs);
    return;
  }
  const src = files[Math.floor(Math.random() * files.length)];
  playSrc(src, rate, volume, fadeOutMs);
}

export function playRandomSoundSequence(animal: SoundAnimal, count: number, intervalMs = 150, fallback?: SoundAnimal) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => playRandomSound(animal, 1, 1, fallback), i * intervalMs);
  }
}
