'use client';

import { useEffect, useRef, useState } from 'react';

export type MobilePhaseKind = 'draw' | 'choice' | 'opponent';

/** 크게 뜬 판이 칩 자리로 날아가 사라지기까지 — globals.css mPhaseHero(1.5s)와 같은 값. MobileLayout이 카드 레벨을 이만큼 붙든다. */
export const PHASE_HERO_MS = 1500;

const PHASE_TEXT: Record<MobilePhaseKind, { step: string; title: string; sub: string }> = {
  draw: { step: '1단계', title: '장소 선택', sub: '장소를 눌러 카드를 뽑으세요' },
  choice: { step: '2단계', title: '행동 선택', sub: '기술 카드를 눌러 고르고, 한 번 더 눌러 사용하세요' },
  opponent: { step: '', title: '상대 차례', sub: '' },
};

/**
 * 모바일 배치의 단계 표시 — 내 차례의 두 단계(장소 선택 → 행동 선택)가 시작될 때마다 화면의 50%쯤 되는 판으로 크게 알린 뒤,
 * 그 판이 **왼쪽 위로 날아가 작아지며** 늘 떠 있는 표시(칩)가 된다. 상대 차례에는 칩만 바뀐다(크게 띄우지 않는다).
 *
 * 크게 띄우는 기준은 "그 차례 · 그 단계"(key) — 한 차례에 기술을 2장 쓰는 판에서 두 번째 기술 때 다시 띄우지 않는다.
 * 판은 클릭을 가로채지 않는다(pointer-events: none) — 뜨는 동안에도 장소를 누를 수 있다.
 *
 * ⚠️ 판을 걷는 것은 타이머가 아니라 **애니메이션이 끝나는 순간**(onAnimationEnd)이다. 타이머를 이펙트에 걸었더니 개발 모드의
 *    StrictMode가 이펙트를 한 번 걷었다 다시 거는 사이에 타이머만 지워져, 다 날아간(투명한) 판이 남고 칩이 영영 숨었다.
 */
export function MobilePhase({ phase, phaseKey, turnLabel }: { phase: MobilePhaseKind; phaseKey: string; turnLabel: string }) {
  const [hero, setHero] = useState<{ id: number; phase: MobilePhaseKind } | null>(null);
  const prevKey = useRef<string | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (prevKey.current === phaseKey) return;
    prevKey.current = phaseKey;
    setHero(phase === 'opponent' ? null : { id: ++seq.current, phase });
  }, [phase, phaseKey]);

  const text = PHASE_TEXT[phase];
  return (
    <>
      <div className="m-phase-chip" data-phase={phase} data-arriving={hero ? '' : undefined}>
        <span className="m-phase-turn tabular-nums">{turnLabel}</span>
        <span className="m-phase-name">{text.title}</span>
      </div>
      {hero && (
        <div
          key={hero.id}
          className="m-phase-hero"
          data-phase={hero.phase}
          aria-hidden
          onAnimationEnd={e => {
            if (e.target === e.currentTarget) setHero(h => (h?.id === hero.id ? null : h));
          }}
        >
          <span className="m-phase-hero-step">{PHASE_TEXT[hero.phase].step}</span>
          <span className="m-phase-hero-title">{PHASE_TEXT[hero.phase].title}</span>
          <span className="m-phase-hero-sub">{PHASE_TEXT[hero.phase].sub}</span>
        </div>
      )}
    </>
  );
}
