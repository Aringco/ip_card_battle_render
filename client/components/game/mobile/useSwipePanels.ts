'use client';

import { useRef } from 'react';

export type SwipeDir = 'up' | 'down' | 'left' | 'right';

/** 스와이프로 친다 — 이만큼 이상 움직이고, 한 축이 다른 축의 1.4배 이상이며, 0.8초 안에 손을 뗀 것 */
const SWIPE_MIN_PX = 48;
const SWIPE_AXIS_RATIO = 1.4;
const SWIPE_MAX_MS = 800;
/** 손짓 뒤 이 시간 안에 오는 click만 삼킨다(브라우저는 손을 뗀 직후 click을 보낸다) */
const SWALLOW_MS = 400;

/**
 * 모바일 배치의 손짓 — 화면 루트(.m-layout)에 다는 포인터 핸들러를 돌려준다. **무엇을 열고 닫을지는 레이아웃이 정한다**
 * (팀전 MobileLayout · 개인전 MobileIndividualLayout이 창의 종류가 다르다):
 *   onSwipe(방향) — 스와이프로 친 손짓. 방향은 손가락이 움직인 쪽이다('left' = 오른쪽 → 왼쪽으로 민 것).
 *   onTap(누른 요소) — 움직이지 않은 누름. 레이아웃이 그 누름으로 창을 닫았으면 true를 돌려준다 — 그러면 그 누름은 판에 전하지 않는다.
 *
 * ⚠️ 닫기는 pointerdown이 아니라 **손을 뗄 때** 판단한다 — pointerdown에서 닫으면 "상세 창을 반대로 밀어 닫는" 동작이
 *    눌리는 순간 이미 닫혀, 손을 뗄 때 반대편 창이 새로 열렸다.
 * ⚠️ 스와이프 · 닫기 누름 뒤에 따라오는 click은 삼킨다(capture) — 밀다가 손을 뗀 자리가 장소 타일이면 카드를 뽑아 버린다.
 * ⚠️ 고른 기술 카드(떠 있는 카드) 위에서 시작한 끌기는 스와이프가 아니다 — 그 카드를 기울이는 손짓이다(SkillChoiceBar의 tapFocus).
 */
export function useSwipeGestures({ onSwipe, onTap }: { onSwipe: (dir: SwipeDir) => void; onTap: (target: Element | null) => boolean }) {
  const start = useRef<{ x: number; y: number; t: number; id: number; skip: boolean } | null>(null);
  // 삼킬 click의 마감 시각 — 손짓을 끝낸 직후(SWALLOW_MS)에 오는 click만 삼킨다.
  // ⚠️ 깃발(true/false)로 두면 안 된다 — 스와이프 뒤에는 click이 오지 않는 경우가 많아 깃발이 남고, 다음 누름의 click(목록의 줄 고르기 ·
  //    대상 확정)까지 삼켰다(2026-10-31 — 스와이프 바로 뒤의 누름이 먹통이었다).
  const swallowUntil = useRef(0);

  const onPointerDown = (e: React.PointerEvent) => {
    swallowUntil.current = 0;
    if (!e.isPrimary) return;
    const target = e.target instanceof Element ? e.target : null;
    start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId, skip: !!target?.closest('.holo-cell[data-hover]') };
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    const dist = Math.hypot(dx, dy);
    const isSwipe =
      !s.skip &&
      dist >= SWIPE_MIN_PX &&
      e.timeStamp - s.t <= SWIPE_MAX_MS &&
      Math.max(Math.abs(dx), Math.abs(dy)) >= SWIPE_AXIS_RATIO * Math.min(Math.abs(dx), Math.abs(dy));
    if (isSwipe) {
      swallowUntil.current = e.timeStamp + SWALLOW_MS;
      onSwipe(Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 'up' : 'down') : dx > 0 ? 'right' : 'left');
      return;
    }
    if (dist < SWIPE_MIN_PX && onTap(e.target instanceof Element ? e.target : null)) swallowUntil.current = e.timeStamp + SWALLOW_MS;
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (e.timeStamp > swallowUntil.current) return;
    swallowUntil.current = 0;
    e.stopPropagation();
    e.preventDefault();
  };

  return { onPointerDown, onPointerUp, onPointerCancel: () => (start.current = null), onClickCapture };
}

/** 팀전(혼자 놀기) 화면의 창 — 'cards' 기술 카드 띠 · 'mine' 내 카드 상세 · 'opp' 상대 카드 상세 */
export type SwipePanel = 'cards' | 'mine' | 'opp';

/** 열린 창마다 "그 창 안"으로 치는 곳 — 그 밖을 누르면 닫는다 */
export const PANEL_AREA: Record<string, string> = {
  cards: '.m-cards',
  mine: '.m-sheet[data-side="left"]',
  opp: '.m-sheet[data-side="right"]',
  oppList: '.m-opp-list',
  oppDetail: '.m-sheet[data-side="right"]',
};

/**
 * 팀전의 창 규칙 — 아래 → 위: 기술 카드 띠를 연다(위 → 아래로 닫는다) · 왼 → 오: 내 카드 상세(상대 상세가 열려 있으면 닫는다) ·
 * 오 → 왼: 상대 카드 상세(내 상세가 열려 있으면 닫는다) · 창이 열린 채 그 밖을 누르면 닫는다.
 */
export function useSwipePanels(panel: SwipePanel | null, setPanel: (next: SwipePanel | null) => void) {
  return useSwipeGestures({
    onSwipe: dir => {
      if (dir === 'up') {
        if (panel === null) setPanel('cards');
      } else if (dir === 'down') {
        if (panel === 'cards') setPanel(null);
      } else if (dir === 'right') {
        if (panel === 'opp') setPanel(null);
        else if (panel === null) setPanel('mine');
      } else {
        if (panel === 'mine') setPanel(null);
        else if (panel === null) setPanel('opp');
      }
    },
    onTap: target => {
      if (panel === null || target?.closest(PANEL_AREA[panel])) return false;
      setPanel(null);
      return true;
    },
  });
}
