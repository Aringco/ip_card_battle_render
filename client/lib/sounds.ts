'use client';

import { getSfxVolume } from './audioSettings';

type SoundAnimal = 'sheep' | 'mermaid' | 'tiger' | 'rabbit' | 'card' | 'bomb';

type Manifest = Record<SoundAnimal, string[]>;

const EMPTY_MANIFEST: Manifest = { sheep: [], mermaid: [], tiger: [], rabbit: [], card: [], bomb: [] };

let manifest: Manifest = EMPTY_MANIFEST;
const audioCache = new Map<string, HTMLAudioElement>();

function loadManifest(): void {
  fetch('/api/sounds')
    .then(res => (res.ok ? res.json() : null))
    .then((data: Manifest | null) => {
      if (!data) return;
      manifest = data;
      Object.values(data)
        .flat()
        .forEach(src => {
          const audio = new Audio(src);
          audio.preload = 'auto';
          audioCache.set(src, audio);
        });
    })
    .catch(() => {});
}

if (typeof window !== 'undefined') {
  loadManifest();
}

function playSrc(src: string, rate = 1, volume = 1) {
  const effectiveVolume = Math.min(1, Math.max(0, volume)) * getSfxVolume();
  if (effectiveVolume <= 0) return;
  const base = audioCache.get(src);
  const audio = base ? (base.cloneNode(true) as HTMLAudioElement) : new Audio(src);
  audio.playbackRate = rate;
  audio.volume = effectiveVolume;
  audio.play().catch(() => {});
}

export function playRandomSound(animal: SoundAnimal, rate = 1, volume = 1, fallback?: SoundAnimal) {
  const files = manifest[animal];
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
