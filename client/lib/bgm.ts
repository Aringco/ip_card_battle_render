'use client';

import { getBgmVolume, subscribeAudioSettings } from './audioSettings';

// 배경음악(BGM) 전용 재생기 — 페이지/컴포넌트가 리마운트되어도 끊기지 않도록
// 모듈 스코프의 싱글턴 Audio 하나만 유지하며, 같은 곡이 이미 재생 중이면
// 볼륨만 갱신하고 처음부터 다시 틀지 않는다.
let audio: HTMLAudioElement | null = null;
let currentSrc: string | null = null;
let currentBaseVolume = 1; // playBgm 호출자가 요청한 트랙별 기준 볼륨(0~1)
let retryBound = false;

function applyVolume(): void {
  if (audio) audio.volume = currentBaseVolume * getBgmVolume();
}

// 설정에서 음량/음소거를 바꾸면 현재 재생 중인 트랙에도 즉시 반영한다.
if (typeof window !== 'undefined') {
  subscribeAudioSettings(applyVolume);
}

function tryPlay() {
  if (!audio) return;
  audio.play().catch(() => {
    // 브라우저 자동재생 정책으로 막히면, 사용자의 첫 상호작용 시 한 번 재시도한다.
    if (retryBound) return;
    retryBound = true;
    const retry = () => {
      audio?.play().catch(() => {});
      document.removeEventListener('pointerdown', retry);
      document.removeEventListener('keydown', retry);
      retryBound = false;
    };
    document.addEventListener('pointerdown', retry, { once: true });
    document.addEventListener('keydown', retry, { once: true });
  });
}

export function playBgm(src: string, volume = 1) {
  if (typeof window === 'undefined') return;

  currentBaseVolume = volume;

  if (currentSrc === src) {
    applyVolume();
    return;
  }

  audio?.pause();
  const next = new Audio(src);
  next.loop = true;
  audio = next;
  currentSrc = src;
  applyVolume();
  tryPlay();
}

export function stopBgm() {
  audio?.pause();
  audio = null;
  currentSrc = null;
}
