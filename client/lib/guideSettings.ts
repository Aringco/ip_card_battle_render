'use client';

import { useEffect, useState } from 'react';

// 턴 안내(장소·행동 손가락 가이드) 표시 여부 — 예전엔 "게임당 첫 턴에만" 잠깐 보여주고
// 다시는 안 떴는데, 그 순간을 놓치면 규칙을 다시 확인할 방법이 없어 "규칙을 모르겠다"는
// 피드백으로 이어졌다. 이제는 내 턴마다 계속 보여주는 대신, 브라우저에 저장되는 이
// on/off 설정으로 원하는 사람만 끌 수 있게 한다(설정 패널 ⚙️ 참고).
const STORAGE_KEY = 'cardBattle_guideEnabled';

let enabled = true;
const listeners = new Set<() => void>();

function load(): void {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== null) enabled = raw === '1';
}
load();

export function getGuideEnabled(): boolean {
  return enabled;
}

export function setGuideEnabled(next: boolean): void {
  enabled = next;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  }
  listeners.forEach(fn => fn());
}

export function subscribeGuideSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * 장소/행동 가이드를 그리는 컴포넌트에서 반응형으로 켜짐 여부를 구독한다.
 *
 * 첫 렌더는 서버·클라이언트 구분 없이 항상 기본값(true)으로 시작하고, 실제
 * localStorage 값은 마운트 후 effect에서만 반영한다 — 렌더 중에 곧바로
 * getGuideEnabled()를 읽으면, 사용자가 예전에 껐던 경우 서버 렌더(항상 true)와
 * 클라이언트 첫 렌더(localStorage의 false)가 달라져 hydration mismatch가 난다
 * (client/components/ui/LoadingScreen.tsx의 팁 문구에서 겪었던 것과 같은 문제).
 */
export function useGuideEnabled(): boolean {
  const [value, setValue] = useState(true);
  useEffect(() => {
    setValue(getGuideEnabled());
    return subscribeGuideSettings(() => setValue(getGuideEnabled()));
  }, []);
  return value;
}
