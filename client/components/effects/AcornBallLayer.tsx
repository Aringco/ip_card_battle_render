'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { WOOL_BALL_DUR as ACORN_DUR } from '@/lib/drawTiming';
import type { AcornBallItem } from '@/hooks/useAnimationQueue';

// 도토리 축제 랜덤 뽑기 — 실용신양의 예약 뽑기(WoolBallLayer, 🐑)와 완전히 같은 방식으로
// 발동한 그 팀 프로필에서 장소로 도토리(🌰)가 날아가 찍는다.
export function AcornBallLayer({ items }: { items: AcornBallItem[] }) {
  return (
    <>
      {items.map(item => (
        <AcornBall key={item.id} item={item} />
      ))}
    </>
  );
}

function AcornBall({ item }: { item: AcornBallItem }) {
  const [pos, setPos] = useState<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [flying, setFlying] = useState(false);

  useLayoutEffect(() => {
    const originEl = document.querySelector(`[data-player-anchor="${item.team}:0"]`);
    const targetEl = document.querySelector(`[data-place-key="${item.place}"]`);
    if (!originEl || !targetEl) return;
    const or = originEl.getBoundingClientRect();
    const tr = targetEl.getBoundingClientRect();
    setPos({
      x: or.left + or.width / 2,
      y: or.top + or.height / 2,
      tx: tr.left + tr.width / 2,
      ty: tr.top + tr.height / 2,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    const t = setTimeout(() => setFlying(true), 30);
    return () => clearTimeout(t);
  }, []);

  if (!pos) return null;

  const style: React.CSSProperties = flying
    ? {
        left: pos.tx,
        top: pos.ty,
        opacity: 0,
        transition: `left ${ACORN_DUR}ms ease-in-out, top ${ACORN_DUR}ms ease-in-out, opacity ${ACORN_DUR}ms ease-in`,
      }
    : { left: pos.x, top: pos.y, opacity: 1 };

  return (
    <span
      className="acorn-ball"
      style={{ position: 'fixed', transform: 'translate(-50%, -50%)', zIndex: 57, ...style }}
    >
      🌰
    </span>
  );
}
