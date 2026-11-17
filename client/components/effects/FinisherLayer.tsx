'use client';

import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { SideId } from 'shared';
import { FINISHER_GATHER_DUR, FINISHER_BURST_DUR } from '@/hooks/useAnimationQueue';

// 판을 끝내는 마지막 체력 변화 직전(useAnimationQueue의 finisher) — 그 편의 체력 막대(`data-hp-bar`)가 커지고, 화면의 다른 움직임이
// 느려지며(Web Animations playbackRate), 막대 가운데로 빛이 모였다가 터진다. 터지는 순간 큐가 체력을 움직이고 이어 GAME OVER가 뜬다.
const SLOW_RATE = 0.25;
const SPARKS = Array.from({ length: 14 }, (_, i) => {
  const a = (i / 14) * Math.PI * 2 + (i % 2) * 0.2;
  const r = 110 + (i % 3) * 40;
  return { dx: Math.cos(a) * r, dy: Math.sin(a) * r, delay: (i % 5) * 120 };
});

export function FinisherLayer({ finisher }: { finisher: { id: number; side: SideId; heal?: boolean } | null }) {
  const [pt, setPt] = useState<{ x: number; y: number; r: number; id: number } | null>(null);

  useLayoutEffect(() => {
    if (!finisher) {
      setPt(null);
      return;
    }
    // 체력 막대(팀전 · 모바일) — 없으면 그 사람의 정보창(개인전 PC 내 칸 · 상대 칸, data-rabbit-target)
    const hpBar = document.querySelector<HTMLElement>(`[data-hp-bar="${finisher.side}"]`);
    const bar = hpBar ?? document.querySelector<HTMLElement>(`[data-rabbit-target="${finisher.side}"]`);
    if (!bar) return;
    const r = bar.getBoundingClientRect();
    setPt({ x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(90, Math.max(r.width, r.height) / 2), id: finisher.id });
    // 막대는 키우고(bar), 정보창(panel — 개인전 칸은 overflow: hidden 안이라 키우면 잘린다)은 안쪽 금빛 테두리로 비춘다
    bar.setAttribute('data-finisher', hpBar ? 'bar' : 'panel');
    // 모바일 — 막 고른 기술 카드 띠가 아래 체력 막대를 덮고 있으므로 그동안 걷는다(globals.css html[data-finishing])
    document.documentElement.setAttribute('data-finishing', '');
    // 슬로 모션 — 지금 돌고 있는 다른 연출(카드 · 빛 · 흔들림)을 느리게. 이 층의 연출은 빼고, 터지는 순간 되돌린다
    const slowed = document.getAnimations().filter(a => {
      const t = (a.effect as KeyframeEffect | null)?.target;
      return !(t instanceof Element && t.closest('.finisher-layer'));
    });
    slowed.forEach(a => { a.playbackRate = SLOW_RATE; });
    const restore = () => slowed.forEach(a => { try { a.playbackRate = 1; } catch { /* 이미 끝난 연출 */ } });
    const t = window.setTimeout(() => {
      restore();
      bar.removeAttribute('data-finisher');
      document.documentElement.removeAttribute('data-finishing');
    }, FINISHER_GATHER_DUR);
    return () => {
      window.clearTimeout(t);
      restore();
      bar.removeAttribute('data-finisher');
      document.documentElement.removeAttribute('data-finishing');
    };
  }, [finisher]);

  if (!pt || typeof document === 'undefined') return null;
  return createPortal(
    <div
      key={pt.id}
      className="finisher-layer"
      data-heal={finisher?.heal ? '' : undefined}
      aria-hidden
      style={{
        ['--fx' as string]: `${pt.x}px`,
        ['--fy' as string]: `${pt.y}px`,
        ['--fr' as string]: `${pt.r}px`,
        ['--gather' as string]: `${FINISHER_GATHER_DUR}ms`,
        ['--burst' as string]: `${FINISHER_BURST_DUR}ms`,
      } as React.CSSProperties}
    >
      <div className="finisher-vignette" />
      {/* 모이는 빛 — 터지는 순간(--gather) 통째로 걷힌다 */}
      <div className="finisher-gather">
        <div className="finisher-core" />
        {SPARKS.map((s, i) => (
          <span
            key={i}
            className="finisher-spark"
            style={{ ['--dx' as string]: `${s.dx}px`, ['--dy' as string]: `${s.dy}px`, animationDelay: `${s.delay}ms` } as React.CSSProperties}
          />
        ))}
      </div>
      <div className="finisher-ring" />
      <div className="finisher-flash" />
    </div>,
    document.body,
  );
}
