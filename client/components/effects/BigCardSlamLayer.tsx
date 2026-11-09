'use client';

import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { BigSlamItem } from '@/hooks/useAnimationQueue';
import { hop, useQuakeDust } from '@/components/game/SkillQuake';
import { playRandomSound } from '@/lib/sounds';

/**
 * 카드 강화의 배수 카드(×5 · ×10 · ×100 · ×1000) 착지 연출(2026-11-02 요청).
 * 카드가 나올 순간 그 장소 칸에서 떠올라 **화면 가운데로 커지며** 날아오고, 잠깐 멈췄다가 **줄의 제자리로 쿵** 떨어진다.
 * 닿는 순간: 쿵 소리 · 흙먼지 · 같은 줄의 카드가 충격파로 들썩 · (×100부터) 판이 흔들린다. 배수가 클수록 크게 · 세게.
 * 줄의 진짜 카드는 닿는 순간 나타난다(useAnimationQueue가 그때 reveal한다) — 이 층은 날아가는 사본만 그린다.
 *
 * 움직임은 모두 WAAPI다(SkillQuake와 같은 이유 — 카드들의 transform 연출과 겹치지 않게 이웃 카드에는 translate · rotate만 쓴다).
 * 시간은 item.dur · item.land(shared enhanceSlamMs · enhanceSlamLandMs — 서버 연출 유예도 같은 값을 쓴다).
 */

// 배수별 세기 — 0(×5) ~ 1(×1000). 가운데에서 커지는 배율 · 흙먼지 · 흔들림이 이것을 따른다.
function strengthOf(num: number): number {
  return num >= 1000 ? 1 : num >= 100 ? 0.65 : num >= 10 ? 0.38 : 0.15;
}
// 가운데에 떠 있을 때의 크기(카드 높이 대비 화면 높이의 비율) — ×1000이 가장 크다
function centerHeightOf(num: number): number {
  return num >= 1000 ? 0.62 : num >= 100 ? 0.5 : num >= 10 ? 0.4 : 0.32;
}

const OVERLAP_RATIO = 46 / 88; // AnimalStackArea · globals.css와 같은 겹침 비율

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function BigCardSlamLayer({ slams }: { slams: BigSlamItem[] }) {
  const dust = useQuakeDust();
  if (typeof document === 'undefined') return null;
  return (
    <>
      {slams.length > 0 &&
        createPortal(
          <>
            {slams.map(s => (
              <SlamCard key={s.id} item={s} onLand={dust.spawn} />
            ))}
          </>,
          document.body,
        )}
      {dust.layer}
    </>
  );
}

function SlamCard({ item, onLand }: { item: BigSlamItem; onLand: (x: number, y: number, w: number, q: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const q = strengthOf(item.num);
    const row = document.querySelector(`[data-stack-area="${item.animal}"] .stack-cards-wrap`) as HTMLElement | null;
    const rowCards = row ? (Array.from(row.querySelectorAll('.stack-card')) as HTMLElement[]) : [];
    const anyCard = rowCards[rowCards.length - 1] ?? (document.querySelector('.stack-card') as HTMLElement | null);
    // 카드 크기 — 줄에 있는 카드(줄이 줄어 있으면 그 배율까지 반영된 크기)를 잰다. 없으면 줄 높이에서 어림한다.
    let w = anyCard?.getBoundingClientRect().width ?? 0;
    let h = anyCard?.getBoundingClientRect().height ?? 0;
    if (!w || !h) {
      const rh = row?.getBoundingClientRect().height ?? 60;
      h = rh * 0.85;
      w = (h * 88) / 116;
    }
    // 제자리 — 줄의 마지막 카드 다음 자리(겹침만큼 왼쪽으로). 줄이 비었으면 줄의 왼쪽 끝.
    const last = rowCards[rowCards.length - 1];
    let tx: number;
    let ty: number;
    if (last) {
      const r = last.getBoundingClientRect();
      tx = r.left + w * (1 - OVERLAP_RATIO) + w / 2;
      ty = r.top + r.height / 2;
    } else if (row) {
      const r = row.getBoundingClientRect();
      tx = r.left + w / 2;
      ty = r.top + r.height / 2;
    } else {
      tx = window.innerWidth / 2;
      ty = window.innerHeight / 2;
    }
    // 출발점 — 그 장소 칸 가운데
    const placeEl = document.querySelector(`[data-place-key="${item.place}"]`);
    const pr = placeEl?.getBoundingClientRect();
    const sx = pr ? pr.left + pr.width / 2 : tx;
    const sy = pr ? pr.top + pr.height / 2 : ty;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const bigScale = Math.max(1.4, (window.innerHeight * centerHeightOf(item.num)) / h);

    el.style.setProperty('--slam-w', `${w}px`);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.left = `${tx - w / 2}px`;
    el.style.top = `${ty - h / 2}px`;

    const still = reducedMotion();
    const land = item.land / item.dur;
    const at = (x: number, y: number) => `${(x - tx).toFixed(1)}px ${(y - ty).toFixed(1)}px`;
    const anim = el.animate(
      still
        ? [{ opacity: 0 }, { opacity: 1, offset: land }, { opacity: 1 }, { opacity: 0 }]
        : [
            { translate: at(sx, sy), scale: '0.4', rotate: '-8deg', opacity: 0, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
            // 가운데로 커지며 떠오른다
            { translate: at(cx, cy), scale: String(bigScale), rotate: '3deg', opacity: 1, offset: land * 0.42, easing: 'ease-in-out' },
            // 잠깐 떠 있다(무거운 것일수록 살짝 더 들린다)
            { translate: at(cx, cy - h * 0.12 * (1 + q)), scale: String(bigScale * 1.04), rotate: '-1deg', opacity: 1, offset: land * 0.7, easing: 'cubic-bezier(0.6, 0, 1, 0.6)' },
            // 제자리로 쿵 — 가속하며 떨어진다
            { translate: at(tx, ty), scale: '1', rotate: '0deg', opacity: 1, offset: land, easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
            // 닿아서 찌그러졌다가 펴진다
            { translate: at(tx, ty + h * 0.04), scale: `${(1.12 + 0.1 * q).toFixed(2)} ${(0.82 - 0.08 * q).toFixed(2)}`, opacity: 1, offset: land + (1 - land) * 0.35 },
            { translate: at(tx, ty), scale: '1', rotate: '0deg', opacity: 1, offset: land + (1 - land) * 0.8 },
            { translate: at(tx, ty), scale: '1', rotate: '0deg', opacity: 0 },
          ],
      { duration: item.dur, fill: 'forwards' },
    );

    const timer = window.setTimeout(() => {
      // 무거울수록 낮고 크게(재생 속도를 늦추면 음이 내려간다)
      playRandomSound('thud', 1.1 - 0.3 * q, 0.35 + 0.65 * q);
      onLand(tx, ty + h / 2, w * (1 + q), 0.25 + 0.75 * q);
      if (still) return;
      // 충격파 — 같은 줄의 카드가 닿은 곳에서 멀수록 늦게 들썩인다. 다른 줄은 ×100부터 약하게.
      rowCards.forEach((c, i) => {
        const dist = rowCards.length - i;
        hop(c, c.getBoundingClientRect().height * (0.18 + 0.32 * q) / Math.sqrt(dist), dist * 35, i % 2 ? 1 : -1, q);
      });
      if (q >= 0.6) {
        document.querySelectorAll(`[data-stack-area]:not([data-stack-area="${item.animal}"]) .stack-card`).forEach((c, i) => {
          hop(c as HTMLElement, (c as HTMLElement).getBoundingClientRect().height * 0.2 * q, 60 + ((i * 47) % 120), i % 2 ? 1 : -1, q * 0.6);
        });
        const field = row?.closest('.play-frame, .play-frame-css, .m-board') as HTMLElement | null;
        if (field) {
          const amp = 3 + 9 * q;
          const ks = [0, -1, 0.8, -0.55, 0.35, -0.18, 0];
          field.animate(
            ks.map((k, i) => ({ translate: `${(-(ks[i + 1] ?? 0) * amp * 0.5).toFixed(1)}px ${(k * amp).toFixed(1)}px` })),
            { duration: Math.round(380 + 420 * q), easing: 'ease-out' },
          );
        }
      }
    }, item.land);

    return () => {
      window.clearTimeout(timer);
      anim.cancel();
    };
    // 한 번 정한 경로로 끝까지 — item은 id마다 고정이다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={ref} className="big-slam" aria-hidden>
      <div className={`stack-card big-slam-card stack-card-denom stack-card-denom-${item.num}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/howto/face_${item.animal}.webp`} alt="" className="w-[68%] h-auto object-contain" />
        <span className="stack-card-denom-count font-black tabular-nums">×{item.num}</span>
      </div>
    </div>
  );
}
