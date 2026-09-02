'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { WOOL_BALL_DUR as WOOL_DUR } from '@/lib/drawTiming';
import type { WoolBallItem } from '@/hooks/useAnimationQueue';

export function WoolBallLayer({ items }: { items: WoolBallItem[] }) {
  return (
    <>
      {items.map(item => (
        <WoolBall key={item.id} item={item} />
      ))}
    </>
  );
}

function WoolBall({ item }: { item: WoolBallItem }) {
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
        transition: `left ${WOOL_DUR}ms ease-in-out, top ${WOOL_DUR}ms ease-in-out, opacity ${WOOL_DUR}ms ease-in`,
      }
    : { left: pos.x, top: pos.y, opacity: 1 };

  return (
    <span
      className="wool-ball"
      style={{ position: 'fixed', transform: 'translate(-50%, -50%)', zIndex: 57, ...style }}
    >
      🐑
    </span>
  );
}
