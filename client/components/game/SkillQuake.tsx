'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { playRandomSound } from '@/lib/sounds';

/**
 * 카드 강화 판 — 기술 카드를 고르는 순간의 "무게"(2026-10-30 요청).
 * 배율이 높은 카드일수록 무겁다: 더 빨리 내리꽂히고(무게 가속), 닿는 순간 판이 흔들리며, 카드 밑에서 흙먼지가 일고,
 * 옆의 기술 카드와 필드의 카드가 들썩 튀어오른다. 진도 10이면 쿵 소리가 나고 판 전체가 1초 동안 뿌옇다.
 *
 * 진도(1~10)는 배율 5마다 한 단계다 — ×1~5 → 1, ×6~10 → 2 … ×46 이상 → 10(×100도 10). 진도 1은 내려찍기만 있고
 * 진동·흙먼지·소리·튀어오름이 없다. 배율은 지금 걸린 디자인어 배율 × Lv.Max 별도 배수(그 카드가 실제로 받는 배율)다.
 *
 * 움직임은 모두 Web Animations API의 **개별 transform 속성(translate·rotate)** 으로 건다 — 기술 카드 칸(.holo-cell)의
 * hover 기울기, 필드 카드의 흔들림·등장 연출이 이미 `transform`을 쓰므로, 같은 속성을 덮으면 그것들이 끊긴다.
 * 고른 카드의 내려찍기만 `transform`을 쓴다(떠올라 있던 hover 자세에서 출발해야 하므로). 배치는 바꾸지 않는다.
 */
export function quakeStageOf(multiplier: number): number {
  return Math.min(10, Math.max(1, Math.ceil(multiplier / 5)));
}

interface Dust {
  id: number;
  x: number; // 카드 아래 변 가운데(뷰포트 px)
  y: number;
  w: number; // 카드 폭
  q: number; // 0(진도 1) ~ 1(진도 10)
}

// 흙먼지 덩이 — 자리·방향·크기·지연을 정해 둔다(렌더마다 무작위면 같은 진도에도 모양이 들쭉날쭉하다).
// 바깥쪽 덩이는 진도가 높을 때만 쓴다(덩이 수가 진도를 따라 는다).
const PUFFS = Array.from({ length: 16 }, (_, i) => {
  const side = i % 2 === 0 ? 1 : -1;
  const reach = 0.25 + (Math.floor(i / 2) / 7) * 0.75; // 0.25 ~ 1
  return { side, reach, rise: 0.15 + ((i * 37) % 7) / 10, size: 0.7 + ((i * 53) % 5) / 10, delay: (i % 4) * 30 };
});

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * 고른 카드 칸(.holo-cell)을 넘기면 그 자리에서 진도만큼의 연출을 낸다. 흙먼지 층은 body로 portal해 그린다 —
 * 기술 카드 띠와 판의 칸은 overflow를 잘라 카드 밖으로 퍼지는 먼지가 보이지 않는다.
 */
export function useSkillQuake() {
  const [dusts, setDusts] = useState<Dust[]>([]);
  const timers = useRef<number[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(t => window.clearTimeout(t));
  }, []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const trigger = useCallback((cell: HTMLElement, stage: number) => {
    const q = (stage - 1) / 9;
    const still = reducedMotion();
    const rect = cell.getBoundingClientRect();

    // ① 내려찍기 — 떠올라 있던 자세(hover)에서 아래로 가속하며 떨어져 찌그러졌다가 제자리로. 무거울수록 빨리 떨어진다.
    //    떨어지는 동안 다시 떠오르지 않게 hover를 걷고 잠근다(HoloCell이 data-slam을 보면 hover를 켜지 않는다).
    const dropMs = Math.round(260 - 150 * q);
    const settleMs = 240;
    let from = getComputedStyle(cell).transform;
    if (!from || from === 'none') from = 'perspective(900px) translateY(-8%) scale(1.06)';
    cell.setAttribute('data-slam', '');
    delete cell.dataset.hover;
    if (!still) {
      cell.animate(
        [
          { transform: from, easing: 'cubic-bezier(0.55, 0, 1, 0.45)' },
          { transform: `perspective(900px) translateY(${(2 + 4 * q).toFixed(1)}%) scale(${(0.98 - 0.04 * q).toFixed(3)}, ${(0.97 - 0.07 * q).toFixed(3)})`, offset: dropMs / (dropMs + settleMs), easing: 'cubic-bezier(0.2, 0.8, 0.3, 1)' },
          { transform: 'none' },
        ],
        { duration: dropMs + settleMs },
      );
    }
    later(() => cell.removeAttribute('data-slam'), dropMs + settleMs + 120);

    if (stage <= 1) return;

    // ② 닿는 순간 — 소리 · 판 진동 · 흙먼지 · 주변 카드 튀어오름
    later(() => {
      // 무거울수록 크고 낮게(재생 속도를 늦추면 음이 내려간다)
      playRandomSound('thud', 1.12 - 0.27 * q, 0.15 + 0.85 * q);

      const field = cell.closest('.play-frame, .play-frame-css') as HTMLElement | null;
      if (field && !still) {
        const amp = 1.5 + 12.5 * q;
        // 세로로 크게, 가로는 반 박자 어긋나게 작게 — 둘 다 번갈아 잦아든다
        const ks = [0, -1, 0.85, -0.65, 0.45, -0.28, 0.14, 0];
        const shake = ks.map((k, i) => ({
          translate: `${(-(ks[i + 1] ?? 0) * amp * 0.55).toFixed(1)}px ${(k * amp).toFixed(1)}px`,
        }));
        field.animate(shake, { duration: Math.round(320 + 480 * q), easing: 'ease-out' });
      }

      const dustId = ++idRef.current;
      setDusts(prev => [...prev, { id: dustId, x: rect.left + rect.width / 2, y: rect.bottom, w: rect.width, q }]);
      later(() => setDusts(prev => prev.filter(d => d.id !== dustId)), Math.round(400 + 600 * q) + 200);

      if (still) return;
      // 옆의 기술 카드 — 고른 카드에서 멀수록 조금 늦게(충격이 퍼져 나간다). 진도 10이면 제 높이의 절반까지 뛴다.
      const row = cell.parentElement;
      const cells = row ? (Array.from(row.children) as HTMLElement[]) : [];
      const at = cells.indexOf(cell);
      cells.forEach((other, i) => {
        if (other === cell) return;
        hop(other, other.getBoundingClientRect().height * 0.5 * q, Math.abs(i - at) * 45, i % 2 ? 1 : -1, q);
      });
      // 필드의 카드 — 낱장마다 조금씩 어긋나게. 많으면 앞의 일부만(묶음 표시라 화면에 보이는 장수가 많지 않다).
      const stackCards = field ? (Array.from(field.querySelectorAll('.stack-cards-wrap > div > *')) as HTMLElement[]).slice(0, 80) : [];
      stackCards.forEach((card, i) => {
        hop(card, card.getBoundingClientRect().height * 0.5 * q, 40 + ((i * 47) % 140), i % 2 ? 1 : -1, q);
      });
    }, dropMs);
  }, []);

  const layer =
    typeof document === 'undefined' || dusts.length === 0
      ? null
      : createPortal(
          <>
            {dusts.map(d => (
              <div key={d.id} className="quake-dust" aria-hidden>
                {/* 진도 10에 가까울수록 판 전체가 뿌옇게(1초) */}
                {d.q > 0 && <div className="quake-haze" style={{ ['--haze' as string]: (0.42 * d.q).toFixed(3), ['--dur' as string]: `${Math.round(400 + 600 * d.q)}ms` }} />}
                {PUFFS.slice(0, 4 + Math.round(12 * d.q)).map((p, i) => {
                  const size = d.w * (0.32 + 0.45 * d.q) * p.size;
                  return (
                    <span
                      key={i}
                      className="quake-puff"
                      style={{
                        left: d.x,
                        top: d.y,
                        width: size,
                        height: size * 0.62,
                        animationDelay: `${p.delay}ms`,
                        ['--dx' as string]: `${(p.side * p.reach * d.w * (0.7 + 1.5 * d.q)).toFixed(0)}px`,
                        ['--dy' as string]: `${(-p.rise * d.w * (0.15 + 0.35 * d.q)).toFixed(0)}px`,
                        ['--op' as string]: (0.35 + 0.5 * d.q).toFixed(2),
                        ['--dur' as string]: `${Math.round(400 + 600 * d.q)}ms`,
                      } as React.CSSProperties}
                    />
                  );
                })}
              </div>
            ))}
          </>,
          document.body,
        );

  return { trigger, layer };
}

/** 한 요소를 height px만큼 튀어 올렸다가 떨어뜨린다(올라갈 때 감속, 내려올 때 가속 — 던져 올린 것처럼). */
function hop(el: HTMLElement, height: number, delay: number, tilt: number, q: number) {
  if (height < 1) return;
  const deg = (tilt * (1.5 + 5 * q)).toFixed(1);
  el.animate(
    [
      { translate: '0 0', rotate: '0deg', easing: 'cubic-bezier(0.2, 0.7, 0.4, 1)' },
      { translate: `0 ${(-height).toFixed(1)}px`, rotate: `${deg}deg`, offset: 0.42, easing: 'cubic-bezier(0.6, 0, 0.9, 0.5)' },
      { translate: '0 0', rotate: '0deg', offset: 0.8 },
      { translate: `0 ${(-height * 0.08).toFixed(1)}px`, rotate: '0deg', offset: 0.9 },
      { translate: '0 0', rotate: '0deg' },
    ],
    { duration: Math.round(380 + 320 * q), delay },
  );
}
