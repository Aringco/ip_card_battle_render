'use client';

import { useSyncExternalStore } from 'react';

/**
 * 모바일 UI(가로 폰 전용 배치 — components/game/mobile/)를 켤지.
 *
 * 시범이라 **혼자 놀기에만** 쓴다(방 화면이 판의 종류를 함께 본다). 이 훅은 "화면이 가로로 눕힌 폰인가"만 답한다.
 *
 * 기준: 가로 화면 + 높이 500px 이하. 폰을 가로로 들면 높이가 344~430px이고, 데스크톱 창·태블릿은 500을 넘는다.
 * 세로 화면은 언제나 아니다 — 그쪽은 회전 안내(RotateHint)가 덮는다.
 *
 * 데스크톱에서 확인하려면 주소에 `?ui=mobile`(끄려면 `?ui=pc`)을 붙인다 — 그 탭이 닫힐 때까지 기억한다(sessionStorage).
 * 강제로 켜도 세로 화면이면 회전 안내가 덮는 것은 같다.
 *
 * ⚠️ 서버 렌더와 첫 클라이언트 렌더는 언제나 false다(useSyncExternalStore의 서버 값) — 게임 화면은 상태가 WS로 도착한 뒤에
 *    그려지므로 그 사이에 바뀌어도 보이는 깜빡임이 없다.
 */
const QUERY = '(orientation: landscape) and (max-height: 500px)';
const FORCE_KEY = 'cardBattle_ui';

/**
 * 가로 폰 · 세로 폰 조건 — 게임 밖 화면(로비 · 대기실 · 게임 방법)의 폰 배치도 **같은 문자열**을 CSS 미디어 쿼리로 쓴다
 * (globals.css 끝의 "게임 밖 화면 — 폰" 절). 로비에서 가로 폰으로 보이던 화면이 게임에 들어가면 모바일 배치가 되도록, 둘을 함께 고칠 것.
 */
export const PHONE_LANDSCAPE_QUERY = QUERY;
export const PHONE_PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 767px)';

function forced(): 'mobile' | 'pc' | null {
  try {
    const param = new URLSearchParams(window.location.search).get('ui');
    if (param === 'mobile' || param === 'pc') sessionStorage.setItem(FORCE_KEY, param);
    const saved = sessionStorage.getItem(FORCE_KEY);
    return saved === 'mobile' || saved === 'pc' ? saved : null;
  } catch {
    return null;
  }
}

function subscribe(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  window.addEventListener('resize', onChange);
  return () => {
    mq.removeEventListener('change', onChange);
    window.removeEventListener('resize', onChange);
  };
}

function snapshot(): boolean {
  const force = forced();
  if (force === 'mobile') return window.matchMedia('(orientation: landscape)').matches;
  if (force === 'pc') return false;
  return window.matchMedia(QUERY).matches;
}

export function useMobileLayout(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
