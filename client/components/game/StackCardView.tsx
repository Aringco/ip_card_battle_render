'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { StackedCard } from 'shared';

// 정산되어 팀 쪽으로 날아갈 때, 그 동물 칸이 어느 방향에 있는지조차 몰라도(폴백) 최소한
// 자기 팀 쪽(왼쪽=A/오른쪽=B)으로는 날아가도록 뷰포트 기준 대략적인 좌표를 남겨둔다.
const FALLBACK_DXY: Record<'left' | 'right', { dx: string; dy: string }> = {
  left: { dx: '-42vw', dy: '38vh' },
  right: { dx: '42vw', dy: '38vh' },
};

export function StackCardView({
  card,
  index,
  isNew,
  flingDirection,
  shakeVariant,
}: {
  card: StackedCard;
  index: number;
  isNew: boolean;
  flingDirection: 'left' | 'right' | null; // 짝이 맞아 팀 쪽으로 날아가는 중 (셔플/흔들기가 끝난 뒤에만 활성화) — 팀(A/B) 기준 폴백 방향
  shakeVariant: 'a' | 'b' | null; // 정산 직전 "짝 확인" 흔들림 — 홀수/짝수 번째가 반대 방향으로 흔들린다
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const [flingVars, setFlingVars] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!flingDirection) {
      setFlingVars(null);
      return;
    }
    const el = elRef.current;
    const fallback = FALLBACK_DXY[flingDirection];
    if (!el) {
      setFlingVars({ '--fling-dx': fallback.dx, '--fling-dy': fallback.dy, '--fling-rot': flingDirection === 'left' ? '-22deg' : '22deg' } as CSSProperties);
      return;
    }

    // 그 팀의 그 동물 칸(ScorePanel의 data-team-score-row) 정중앙을 목적지로 삼는다 —
    // 찾지 못하면(스크롤/레이아웃 변경 등) 팀 방향으로만 대략 날아가는 폴백을 쓴다.
    const target = card.collectedBy
      ? document.querySelector(`[data-team-score-row="${card.collectedBy}:${card.animal}"]`)
      : null;

    if (target) {
      const from = el.getBoundingClientRect();
      const to = target.getBoundingClientRect();
      const dx = to.left + to.width / 2 - (from.left + from.width / 2);
      const dy = to.top + to.height / 2 - (from.top + from.height / 2);
      setFlingVars({
        '--fling-dx': `${dx}px`,
        '--fling-dy': `${dy}px`,
        '--fling-rot': dx < 0 ? '-22deg' : '22deg',
      } as CSSProperties);
    } else {
      setFlingVars({ '--fling-dx': fallback.dx, '--fling-dy': fallback.dy, '--fling-rot': flingDirection === 'left' ? '-22deg' : '22deg' } as CSSProperties);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flingDirection]);

  const flingClass = flingDirection && flingVars ? 'stack-card-fling' : '';
  const shakeClass = !flingDirection && shakeVariant ? `stack-card-shake-${shakeVariant}` : '';

  return (
    <div
      ref={elRef}
      data-stack-card-id={card.id}
      className={`stack-card card-shadow ${flingClass} ${shakeClass} ${isNew ? 'stack-card-new' : ''}`}
      style={{ zIndex: index, marginLeft: index === 0 ? 0 : -46, ...flingVars }}
    >
      <img
        src={`/emoticon/${card.animal}_focus.png`}
        alt={card.animal}
        className="w-[68%] h-auto object-contain"
      />
      <span className="text-2xl font-black text-jungle-900 tabular-nums">{card.num}</span>
    </div>
  );
}
