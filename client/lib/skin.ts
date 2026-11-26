'use client';

import { useEffect } from 'react';

/**
 * 강화전 겉모양(skin) — 버튼 · 입력칸 · 자리 버튼을 그림 대신 CSS로 그린다(2026-11-27, 견본 "CSS B").
 *
 * `<html data-skin="enhance">` 하나로 갈린다. 규칙은 전부 `styles/19-enhance-skin.css`에 있고, 컴포넌트는
 * 두 모양을 함께 그려 두기만 한다(`SeatFace` — 그림과 CSS 판 중 CSS가 하나를 감춘다). body로 portal되는 창까지
 * 같은 겉모양이 닿도록 로비 상자가 아니라 html에 단다.
 *
 * - 로비: 첫 갈림길에서 **강화전**을 고른 뒤 · 강화 방의 대기실(app/page.tsx)
 * - 게임: 카드 강화 판(`gameState.enhance` — app/room/[roomId]/page.tsx)
 */
export function useEnhanceSkin(on: boolean) {
  useEffect(() => {
    const root = document.documentElement;
    if (on) root.dataset.skin = 'enhance';
    else delete root.dataset.skin;
    return () => { delete root.dataset.skin; };
  }, [on]);
}
