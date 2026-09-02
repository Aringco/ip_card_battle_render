'use client';

import { useLayoutEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { RabbitFlight } from '@/hooks/useAnimationQueue';

const SWARM_SIZE = 25;

// 상표토끼 스킬 발동 — 보드 여기저기서 크고작은 토끼떼가 우르르 그 팀의 체력 쪽으로 달려간다.
export function RabbitFlightLayer({ flights }: { flights: RabbitFlight[] }) {
  return (
    <>
      {flights.map(f => (
        <FlightGroup key={f.id} flight={f} />
      ))}
    </>
  );
}

interface RabbitSpec {
  x: number;
  y: number;
  fx: number;
  fy: number;
  size: number; // rem — 크고작은 토끼가 섞이도록 무작위
  delay: number; // ms — 한꺼번에 출발하지 않고 우르르 흩어져 출발한다
}

function FlightGroup({ flight }: { flight: RabbitFlight }) {
  const [rabbits, setRabbits] = useState<RabbitSpec[] | null>(null);

  useLayoutEffect(() => {
    const boardEl = document.querySelector('[data-board-root]');
    const targetEl = document.querySelector(`[data-rabbit-target="${flight.team}"]`);
    if (!boardEl || !targetEl) return;
    const br = boardEl.getBoundingClientRect();
    const tr = targetEl.getBoundingClientRect();
    const tx = tr.left + tr.width / 2;
    const ty = tr.top + tr.height / 2;

    const next: RabbitSpec[] = Array.from({ length: SWARM_SIZE }, () => {
      // 보드 가장자리에 몰리지 않도록 10~90% 범위 안에서 출발점을 무작위로 고른다.
      const x = br.left + br.width * (0.1 + Math.random() * 0.8);
      const y = br.top + br.height * (0.1 + Math.random() * 0.8);
      return {
        x,
        y,
        fx: tx - x + (Math.random() - 0.5) * 40,
        fy: ty - y + (Math.random() - 0.5) * 40,
        size: 0.9 + Math.random() * 1.6,
        delay: Math.random() * 400,
      };
    });
    setRabbits(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight.id]);

  if (!rabbits) return null;

  return (
    <>
      {rabbits.map((r, i) => (
        <span
          key={i}
          className="rabbit-flight-inner"
          style={
            {
              position: 'fixed',
              left: r.x,
              top: r.y,
              fontSize: `${r.size}rem`,
              '--fx': `${r.fx}px`,
              '--fy': `${r.fy}px`,
              animationDelay: `${r.delay}ms`,
              zIndex: 59,
              pointerEvents: 'none',
            } as CSSProperties
          }
        >
          🐰
        </span>
      ))}
    </>
  );
}
