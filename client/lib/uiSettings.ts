'use client';

// 글씨 크기 설정 — 레이아웃(여백·카드·아이콘 영역)은 그대로 두고 글자만 5단계로 조절한다.
//
// 루트 font-size를 바꾸는 방식(globals.css의 html { font-size: 80% })은 rem 기반
// 여백까지 전부 같이 커지므로 여기서는 쓰지 않는다. 대신 Tailwind v4의 텍스트
// 토큰(--text-xs ~ --text-9xl)만 --font-scale 배수로 정의해두고(app/globals.css),
// 이 값만 바꿔 글자 크기만 비례시킨다.

export const FONT_SCALE_STEPS = [0.85, 0.92, 1, 1.12, 1.25] as const;
export const DEFAULT_FONT_STEP = 3; // 1~5 중 3단계가 기존 크기

const STORAGE_KEY = 'cardBattle_fontStep';

let step: number = DEFAULT_FONT_STEP;
const listeners = new Set<() => void>();

function clampStep(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_FONT_STEP;
  return Math.min(FONT_SCALE_STEPS.length, Math.max(1, Math.round(v)));
}

/** 현재 단계를 실제 CSS 변수에 반영한다. */
function apply(): void {
  if (typeof document === 'undefined') return;
  document.documentElement.style.setProperty('--font-scale', String(FONT_SCALE_STEPS[step - 1]));
}

function load(): void {
  if (typeof window === 'undefined') return;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== null) step = clampStep(Number(raw));
  apply();
}
load();

export function getFontStep(): number {
  return step;
}

export function setFontStep(next: number): void {
  step = clampStep(next);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, String(step));
  }
  apply();
  listeners.forEach(fn => fn());
}

export function subscribeUiSettings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
