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

function playSrc(src: string, rate = 1, volume = 1) {
  const effectiveVolume = Math.min(1, Math.max(0, volume)) * getSfxVolume();
  if (effectiveVolume <= 0) return;
  const audio = getBaseAudio(src).cloneNode(true) as HTMLAudioElement;
  audio.playbackRate = rate;
  audio.volume = effectiveVolume;
  audio.play().catch(() => {});
}

export function playRandomSound(animal: SoundAnimal, rate = 1, volume = 1, fallback?: SoundAnimal) {
  const files = SFX_MANIFEST[animal];
  if (!files || files.length === 0) {
    if (fallback) playRandomSound(fallback, rate, volume);
    return;
  }
  const src = files[Math.floor(Math.random() * files.length)];
  playSrc(src, rate, volume);
}

export function playRandomSoundSequence(animal: SoundAnimal, count: number, intervalMs = 150, fallback?: SoundAnimal) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => playRandomSound(animal, 1, 1, fallback), i * intervalMs);
  }
}
