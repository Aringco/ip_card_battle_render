'use client';

import { useState } from 'react';
import type { ClientGameState, SideId } from 'shared';
import { acornCard, acornSkinOf } from 'shared';
import { AcornCard } from './AcornCard';
import { openAcornShelf, type AcornShelfMode } from './AcornLayer';

/** 더미 두께로 그리는 장수 상한 — 그 이상은 두께가 더 늘지 않고 장수 표시만 오른다 */
const MAX_SHEETS = 12;
const MODES: { mode: AcornShelfMode; label: string }[] = [
  { mode: 'cards', label: '카드' },
  { mode: 'list', label: '목록' },
  { mode: 'summary', label: '요약' },
];

/**
 * PC 카드 강화 판의 도토리 카드 더미(2026-11-28 요청 — 체력 구슬 자리). 왼쪽은 나, 오른쪽은 상대.
 * 축제에서 고를 때마다 한 장씩 쌓이고 **가장 최근에 고른 카드가 맨 위**(앞면)다. 그 아래 카드는 가장자리만 보이는 종이 층으로 그려
 * 한 장 쌓일 때마다 더미가 그만큼 두꺼워진다(층 색은 그 카드의 단계). 위의 [카드] · [목록] · [요약]은 모바일과 같은 보기 창을 그 방식으로 연다.
 *
 * 얻기 연출의 빛은 `[data-acorn-side] [data-acorn-id]`의 첫 요소로 날아와 앉는다(AcornLayer) — 그래서 맨 위 카드가 그 표식을 단다.
 * ⚠️ PC 판에서는 체력 막대(MobileHpBar)의 배지를 끈다(acorns={false}) — 켜 두면 빛이 더미가 아니라 막대 위 배지로 날아간다.
 */
export function AcornDeck({ gameState, side, label }: { gameState: ClientGameState; side: SideId; label: string }) {
  const owned = gameState.enhance?.acorn?.sides[side]?.owned ?? [];
  const n = owned.length;
  const top = n > 0 ? owned[n - 1] : null;
  const sheets = Math.min(Math.max(0, n - 1), MAX_SHEETS);
  // 한 장 늘어난 순간 — 맨 위 카드가 떨어져 앉고 "+1"이 떠오른다(렌더 도중 보정: 이펙트 타이머는 StrictMode가 지운다)
  const [prevN, setPrevN] = useState(n);
  const [added, setAdded] = useState(0);
  if (n !== prevN) {
    setPrevN(n);
    if (n > prevN) setAdded(a => a + 1);
  }
  const def = top ? acornCard(top.id) : null;
  return (
    <div className="acorn-deck">
      <div className="acorn-deck-modes" role="group" aria-label={`${label}의 도토리 카드 보기`}>
        {MODES.map(m => (
          <button key={m.mode} type="button" onClick={() => openAcornShelf(side, m.mode)}>
            {m.label}
          </button>
        ))}
      </div>
      <div className="acorn-deck-pile" data-acorn-side={side} style={{ ['--n' as string]: sheets } as React.CSSProperties}>
        {!top || !def ? (
          <span className="acorn-deck-empty">도토리 카드</span>
        ) : (
          <>
            {/* 아래 층 — 아래(오래된 것)부터 차례로 한 층씩 올라간다 */}
            {owned.slice(Math.max(0, n - 1 - MAX_SHEETS), n - 1).map((o, i) => (
              <span
                key={o.id}
                className="acorn-deck-sheet"
                data-skin={acornSkinOf(o.id, o.tier)}
                // --jx — 층마다 조금씩 어긋나게(가지런히 맞추면 한 덩어리 판자처럼 보인다)
                style={{ ['--i' as string]: i, ['--jx' as string]: `${(((i * 37) % 5) - 2) * 0.7}px` } as React.CSSProperties}
                aria-hidden
              />
            ))}
            <button
              key={top.id}
              type="button"
              className="acorn-deck-top"
              data-acorn-id={top.id}
              data-skin={acornSkinOf(top.id, top.tier)}
              onClick={() => openAcornShelf(side, 'cards')}
              aria-label={`${label}의 도토리 카드 ${n}장 — 맨 위 ${def.name}`}
            >
              <AcornCard id={top.id} tier={top.tier} compact />
            </button>
            <span className="acorn-deck-count tabular-nums">{n}장</span>
            {added > 0 && <span key={added} className="acorn-deck-plus" aria-hidden>+1</span>}
          </>
        )}
      </div>
    </div>
  );
}
