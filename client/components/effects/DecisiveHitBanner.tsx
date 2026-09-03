'use client';

import type { Team } from 'shared';

// 체력이 즉시 10 이상/0 이하에 닿아 게임이 끝나는 순간 — 그 결정타를 화면
// 중앙에 크게 강조한다. 종료 화면으로 넘어가기 전 마지막 한 방을 보여준다.
export function DecisiveHitBanner({ hit }: { hit: { winner: Team } | null }) {
  if (!hit) return null;

  return (
    <div key={hit.winner} className="decisive-hit-banner" aria-hidden>
      <span className="decisive-hit-title">GAME OVER!</span>
      <span className="decisive-hit-sub">{hit.winner === 'A' ? '🟢' : '🔵'} 승리!</span>
    </div>
  );
}
