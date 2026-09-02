'use client';

import { useLayoutEffect, useState } from 'react';
import type { CSSProperties } from 'react';

const BURST_COUNT = 15;

interface Spot {
  x: number;
  y: number;
  delay: number;
}

// 도토리 축제 시작 순간 — 보드 여기저기 15군데에서 도토리가 폭죽처럼 시차를 두고
// 터지며 축제 시작을 알린다. active가 true로 바뀔 때 한 번만 재생된다.
export function FestivalStartBurstLayer({ active }: { active: boolean }) {
  const [spots, setSpots] = useState<Spot[] | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setSpots(null);
      return;
    }
    const board = document.querySelector('[data-board-root]');
    if (!board) return;
    const r = board.getBoundingClientRect();
    const next: Spot[] = Array.from({ length: BURST_COUNT }, (_, i) => ({
      x: r.left + 20 + Math.random() * (r.width - 40),
      y: r.top + 20 + Math.random() * (r.height - 40),
      delay: (i / BURST_COUNT) * 900 + Math.random() * 120,
    }));
    setSpots(next);
  }, [active]);

  if (!spots) return null;

  return (
    <>
      {spots.map((spot, i) => (
        <span
          key={i}
          className="festival-acorn-burst"
          style={
            {
              position: 'fixed',
              left: spot.x,
              top: spot.y,
              zIndex: 61,
              pointerEvents: 'none',
              animationDelay: `${spot.delay}ms`,
            } as CSSProperties
          }
        >
          🌰
        </span>
      ))}
    </>
  );
}
