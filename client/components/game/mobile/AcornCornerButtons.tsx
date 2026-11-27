'use client';

import { useEffect, useRef, useState } from 'react';
import type { ClientGameState, SideId } from 'shared';
import { PLAY_ASSETS } from '@/lib/playAssets';
import { openAcornShelf } from '../acorn/AcornLayer';

/**
 * 모바일 아래 줄 양 끝의 도토리 카드 버튼(2026-11-28 요청).
 * - 왼쪽(내 동물 열 아래): 내 도토리 카드. **얻기 연출의 빛이 이 버튼으로 날아 들어간다** — AcornLayer는
 *   `[data-acorn-side="나"] [data-acorn-id="그 카드"]`의 첫 요소로 날아가므로, 버튼이 그 표식을 단 보이지 않는 점을 카드마다 품는다
 *   (빛이 닿으면 data-equip이 붙어 버튼이 한 번 튄다 — CSS .m-acorn-button:has([data-equip])).
 *   ⚠️ 체력 막대 위에는 도토리 배지를 그리지 않는다 — 다시 그리면 빛이 그리로 날아간다.
 * - 오른쪽(설정 톱니 왼쪽): 상대 도토리 카드. 상대가 하나면 곧바로 그 사람의 카드를, 여럿이면 먼저 상대를 고르는 작은 목록을 띄운다.
 */
export function MyAcornButton({ gameState, side, className }: { gameState: ClientGameState; side: SideId; className: string }) {
  const owned = gameState.enhance?.acorn?.sides[side]?.owned ?? [];
  return (
    <button
      type="button"
      className={`m-acorn-button ${className}`}
      data-acorn-side={side}
      aria-label={`내 도토리 카드 보기 (${owned.length}장)`}
      title="내 도토리 카드"
      onClick={() => openAcornShelf(side)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={PLAY_ASSETS.iconAcorn} alt="" draggable={false} />
      {owned.map(o => <span key={o.id} className="m-acorn-target" data-acorn-id={o.id} aria-hidden />)}
    </button>
  );
}

export function OppAcornButton({ gameState, opponents, nameOf, colorOf }: {
  gameState: ClientGameState;
  /** 볼 수 있는 상대(나 · 왼쪽 사람 제외) — 하나면 목록 없이 곧바로 연다 */
  opponents: SideId[];
  nameOf: (side: SideId) => string;
  /** 개인전 — 그 사람이 고른 색. 팀전(1:1)은 비운다 */
  colorOf?: (side: SideId) => string;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  // 바깥을 누르면 닫는다
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);
  if (opponents.length === 0) return null;
  const single = opponents.length === 1;
  const countOf = (side: SideId) => gameState.enhance?.acorn?.sides[side]?.owned.length ?? 0;
  return (
    <div className="m-opp-acorn" ref={boxRef}>
      <button
        type="button"
        className="m-acorn-button m-acorn-button-opp"
        aria-label={single ? `${nameOf(opponents[0])}의 도토리 카드 보기` : '상대 도토리 카드 보기 — 상대 고르기'}
        aria-expanded={single ? undefined : open}
        title="상대 도토리 카드"
        onClick={() => (single ? openAcornShelf(opponents[0]) : setOpen(o => !o))}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PLAY_ASSETS.iconAcorn} alt="" draggable={false} />
      </button>
      {open && !single && (
        <div className="m-opp-acorn-list" role="menu" aria-label="누구의 도토리 카드를 볼까요">
          <p className="m-opp-acorn-title">누구의 도토리 카드를 볼까요?</p>
          {opponents.map(side => (
            <button
              key={side}
              type="button"
              role="menuitem"
              className="m-opp-acorn-row"
              onClick={() => { setOpen(false); openAcornShelf(side); }}
            >
              <span className="m-opp-acorn-dot" style={colorOf ? { background: colorOf(side) } : undefined} aria-hidden />
              <span className="m-opp-acorn-name">{nameOf(side)}</span>
              <span className="m-opp-acorn-count tabular-nums">{countOf(side)}장</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
