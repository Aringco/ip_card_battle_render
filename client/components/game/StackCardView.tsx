'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { StackedCard } from 'shared';
import { enhanceDenomTier } from 'shared';

// 정산되어 팀 쪽으로 날아갈 때, 그 동물 칸이 어느 방향에 있는지조차 몰라도(폴백) 최소한
// 자기 팀 쪽(왼쪽=A/오른쪽=B)으로는 날아가도록 뷰포트 기준 대략적인 좌표를 남겨둔다.
const FALLBACK_DXY: Record<'left' | 'right', { dx: string; dy: string }> = {
  left: { dx: '-42vw', dy: '38vh' },
  right: { dx: '42vw', dy: '38vh' },
};

export function StackCardView({
  card,
  bundle = null,
  denom = null,
  mergedIds,
  index,
  isNew,
  flingDirection,
  shakeVariant,
}: {
  card: StackedCard;
  /** 10장·100장 묶음(AnimalStackArea의 bundleCards) — card는 그 묶음의 첫 장이고, 숫자 대신 "x10"·"x100"을 쓴다 */
  bundle?: 10 | 100 | null;
  /** 카드 강화의 배수 카드(×5 · ×10 · ×100 · ×1000 — card.num) — 구리 · 은 · 금 · 무지개 테두리에 "×N"을 쓴다 */
  denom?: number | null;
  /** 카드 강화 — 이 칸에 합쳐진 카드들의 id(AnimalStackArea의 mergeEnhanceCards). 짝 캡션이 그중 한 장을 찾아 이 칸에 붙는다. 새로 생긴 칸은 튀어오른다 */
  mergedIds?: number[];
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

  // 카드 강화 — 합쳐져 새로 생긴 배수 칸은 마운트될 때 한 번 튀어오른다. CSS animation(흔들림 · 등장)과 겹치지 않게 WAAPI의 scale로 건다.
  useLayoutEffect(() => {
    if (!mergedIds || flingDirection || !elRef.current) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    elRef.current.animate(
      // 밝기 필터는 쓰지 않는다 — 카드가 들어올 때마다 줄이 다시 나뉘어 반복되면 얼굴이 하얗게 바래 "그림 없는 카드"처럼 보였다(2026-11-02 제보)
      [{ scale: '0.7' }, { scale: '1.1', offset: 0.6 }, { scale: '1' }],
      { duration: 420, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.3)' },
    );
    // 마운트 한 번만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flingClass = flingDirection && flingVars ? 'stack-card-fling' : '';
  const shakeClass = !flingDirection && shakeVariant ? `stack-card-shake-${shakeVariant}` : '';

  return (
    <div
      ref={elRef}
      data-stack-card-id={card.id}
      data-stack-card-ids={mergedIds ? ` ${mergedIds.join(' ')} ` : undefined}
      className={`stack-card card-shadow ${bundle ? `stack-card-bundle stack-card-bundle-${bundle}` : ''} ${denom ? `stack-card-denom stack-card-denom-${enhanceDenomTier(denom)}` : ''} ${flingClass} ${shakeClass} ${isNew ? 'stack-card-new' : ''}`}
      // ⚠️ 겹침 간격(예전 marginLeft: -46)은 이제 CSS(.stack-card + .stack-card)가 맡는다 —
      //    카드 크기가 무대를 따라 줄어들므로 겹침도 같은 비율로 줄어야 한다.
      style={{ zIndex: index, ...flingVars }}
    >
      <img
        src={`/howto/face_${card.animal}.webp`}
        alt={card.animal}
        className="w-[68%] h-auto object-contain"
      />
      {/* 글자 크기는 `.stack-card-num`(globals.css)이 카드 폭에서 뽑는다 */}
      {denom ? (
        <span className="stack-card-denom-count font-black tabular-nums">×{denom}</span>
      ) : bundle ? (
        <span className="stack-card-bundle-count font-black tabular-nums">x{bundle}</span>
      ) : (
        <span className="stack-card-num font-black text-jungle-900 tabular-nums">{card.num}</span>
      )}
    </div>
  );
}
