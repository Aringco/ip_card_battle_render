'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Animal, ClientGameState, EnhanceCardTier, SideId } from 'shared';
import { ENHANCE_GOLD_FROM, ENHANCE_MAX_LEVEL, ENHANCE_SILVER_FROM, enhanceCardTier, enhanceLevelLabel } from 'shared';
import { cooldownOf, cooldownShownOf, finishingMove, previewSkill } from '@/lib/skills';
import { SKILL_TITLE, SKILL_COLOR, describeEnhanceSkill, describeSkill } from '@/lib/skillInfo';
import { useGuideEnabled } from '@/lib/guideSettings';
import { skillArtSrc } from '@/lib/playAssets';
import { spectatorTeamVars } from '@/lib/teamColors';
import { emVar, maxLineEm } from '@/lib/textFit';
import { playRandomSound } from '@/lib/sounds';
import { GuideFinger } from './GuideFinger';
import { quakeStageOf, useSkillQuake } from './SkillQuake';

const ANIMAL_ORDER: Animal[] = ['sheep', 'rabbit', 'mermaid', 'tiger'];

// 홀로 카드 — 포인터를 따라 기울어지고 사선 반사 띠가 지나가는 효과(요구 G6, 팀전·개인전 공통).
// 기법만 참고하고 새로 썼다: 포인터 좌표를 카드 기준 0~1로 바꿔 CSS 변수(--mx/--my 광택 위치,
// --rx/--ry 기울기 각도)에 쓰고, 나머지는 전부 CSS(globals.css의 .holo-*)가 그린다.
// ⚠️ 참고한 사이트(poke-holo.simey.me)의 원본 저장소는 GPL-3.0이라 코드를 가져오지 않는다.
const HOLO_TILT_DEG = 14; // 가장자리에서의 최대 기울기
// 카드 두께(px) — 드러나는 옆면의 길이는 기울기와 상관없이 언제나 이 값이고, 기울기는 **방향만** 정한다
// (기울지 않으면 아래로). globals.css의 .holo-edge.
// 변천: 기울기 1도당 0.4px + 기본 2px → 절반(0.2 / 1, 가장자리에서 약 3.8px) → 두께 2px 고정 → 3px → **2px**(요청).
const HOLO_EDGE_PX = 2;

/**
 * 카드 한 칸을 감싸는 칸 — **기울기와 확대는 버튼이 아니라 이 칸에 건다.** 버튼은 모서리를 다듬느라
 * overflow-hidden이라 버튼 자신을 확대하면 튀어나온 부분이 잘린다(가이드 손가락을 버튼 밖에 그리는 것과
 * 같은 이유). 잠긴 카드(enabled=false)에는 효과를 걸지 않는다. pointermove는 requestAnimationFrame으로
 * 묶어 프레임당 한 번만 쓰고, 터치는 hover가 없으므로 마우스일 때만 반응한다.
 */
function HoloCell({
  enabled,
  className,
  children,
  shine = true,
  flat = false,
}: {
  enabled: boolean;
  className: string;
  children: React.ReactNode;
  /** 사선 반사 띠(광택)를 그릴지 — [턴 마치기]는 기울기(입체 움직임)만 쓴다(2026-10-30 요청) */
  shine?: boolean;
  /** 입체 움직임(떠오름·확대·기울기·옆면)을 끄고 광택만 남긴다 — 내가 행동을 고르는 단계(interactive)가 아닐 때(2026-10-30 요청 — 처음엔 "상대 차례"였다가 같은 날 "내 행동 선택 페이즈에만"으로 좁혔다. 내 장소 선택 단계도 flat. globals.css의 [data-flat]) */
  flat?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const point = useRef<{ x: number; y: number } | null>(null);

  const reset = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    point.current = null;
    const el = ref.current;
    if (!el) return;
    delete el.dataset.hover;
    el.style.setProperty('--mx', '50%');
    el.style.setProperty('--my', '50%');
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.style.setProperty('--ex', '0');
    el.style.setProperty('--ey', String(HOLO_EDGE_PX));
  };

  // 칸이 잠기는 순간(차례가 끝남) 남아 있던 기울기를 걷어낸다 — 안 걷으면 기울어진 채 굳는다.
  useEffect(() => {
    if (!enabled) reset();
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [enabled]);

  // ⚠️ "가리키고 있다"는 CSS :hover가 아니라 여기서 다는 data-hover로 판단한다(globals.css .holo-cell 절).
  // 미디어 쿼리((any-)hover)는 브라우저의 기기 판정에 달려 있어, 터치스크린 노트북처럼 판정이 어긋나는 PC에서는
  // 마우스로 가리켜도 효과가 꺼졌다. 포인터의 실제 종류를 보면 그 판정과 무관하고, 터치는 켜지지 않는다.
  // 카드 강화의 내려찍기(SkillQuake — data-slam) 동안에는 다시 떠오르지 않는다 — 커서가 그대로 카드 위에 있어도.
  const canHover = (e: React.PointerEvent) =>
    (e.pointerType === 'mouse' || e.pointerType === 'pen') && !ref.current?.hasAttribute('data-slam');
  const onPointerEnter = (e: React.PointerEvent<HTMLDivElement>) => {
    if (enabled && canHover(e)) ref.current?.setAttribute('data-hover', '');
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || !canHover(e)) return;
    // 카드가 커서 아래에서 새로 활성화되면(차례가 넘어옴) pointerenter가 오지 않는다 — 움직임으로도 켠다.
    if (ref.current && !('hover' in ref.current.dataset)) ref.current.setAttribute('data-hover', '');
    point.current = { x: e.clientX, y: e.clientY };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = ref.current;
      const p = point.current;
      if (!el || !p) return;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const px = Math.min(1, Math.max(0, (p.x - r.left) / r.width));
      const py = Math.min(1, Math.max(0, (p.y - r.top) / r.height));
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
      // 위쪽을 가리키면 위가 뒤로 젖혀지고, 오른쪽을 가리키면 오른쪽이 들어간다.
      const rx = (0.5 - py) * 2 * HOLO_TILT_DEG;
      const ry = (px - 0.5) * 2 * HOLO_TILT_DEG;
      el.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
      el.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
      // 옆면 — 오른쪽이 들어가면(ry > 0) 왼쪽 옆면이, 위가 젖혀지면(rx > 0) 아래 옆면이 보인다.
      // 방향은 "기본 아래쪽 + 기울기"로 정하고 길이는 두께(HOLO_EDGE_PX)로 맞춘다. 위가 앞으로 숙여진
      // 가운데(방향이 0에 가까움)에서는 옆면이 보이지 않는 게 맞으므로 그 길이만큼 줄어든다.
      const dx = -ry / HOLO_TILT_DEG;
      const dy = 1 + rx / HOLO_TILT_DEG;
      const len = Math.hypot(dx, dy);
      const k = len > 1 ? HOLO_EDGE_PX / len : HOLO_EDGE_PX;
      el.style.setProperty('--ex', (dx * k).toFixed(2));
      el.style.setProperty('--ey', (dy * k).toFixed(2));
    });
  };

  return (
    <div
      ref={ref}
      className={`holo-cell ${className}`}
      data-holo={enabled || undefined}
      data-flat={flat || undefined}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={reset}
    >
      {children}
      {/* 사선 반사 띠 층 — 카드 위에 얹히되 클릭은 가로채지 않는다(CSS). */}
      {enabled && (
        <>
          {/* 카드 옆면(두께) — 카드 뒤에 깔린다 */}
          <span className="holo-edge" aria-hidden />
          {shine && <span className="holo-shine" aria-hidden />}
        </>
      )}
    </div>
  );
}

// 카드 강화 판 — 레벨이 오른 순간 그 카드에서 터지는 파티클(globals.css의 .enh-burst). 조각마다 방향·거리·색·지연을 정해 둔다
// (무작위로 뽑으면 렌더마다 달라진다 — 한 번 정한 모양을 매번 쓴다). 무지개 순서로 돌며 퍼진다.
const BURST_PIECES = Array.from({ length: 22 }, (_, i) => {
  const angle = (i / 22) * Math.PI * 2 + (i % 2 ? 0.14 : -0.1);
  const dist = 38 + ((i * 37) % 5) * 10; // 칸 크기에 대한 %
  return {
    dx: Math.cos(angle) * dist,
    dy: Math.sin(angle) * dist * 0.8,
    hue: (i * 360) / 22,
    delay: (i % 4) * 40,
    size: 6 + (i % 3) * 3,
  };
});

/**
 * 쿨타임 중인 카드의 문구 — shown은 다시 쓰기까지 건너뛸 내 차례 수(lib/skills.ts의 cooldownShownOf).
 * 0은 "이번 차례에 이미 썼고 다음 차례에 다시 열린다"다(한 차례 기술 2장 이상인 판).
 */
function coolingLabel(shown: number): string {
  return shown > 0 ? `⏳ 쿨타임\n${shown}턴 남음` : '✔ 이번 차례 사용\n다음 차례에 다시';
}

/** 레벨이 오른 순간 한 번 — key가 바뀔 때마다 처음부터 다시 터진다. 클릭은 가로채지 않는다. */
function LevelUpBurst({ level }: { level: number }) {
  return (
    <span className="enh-burst" aria-hidden>
      <span className="enh-burst-ring" />
      {BURST_PIECES.map((p, i) => (
        <span
          key={i}
          className="enh-burst-piece"
          style={{
            ['--dx' as string]: `${p.dx.toFixed(1)}%`,
            ['--dy' as string]: `${p.dy.toFixed(1)}%`,
            ['--hue' as string]: String(Math.round(p.hue)),
            ['--size' as string]: `${p.size}px`,
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
      <span className="enh-burst-text skill-outline-text">{level >= ENHANCE_MAX_LEVEL ? 'Lv.Max!' : `Lv.${level}!`}</span>
    </span>
  );
}

// [승격] — 등급(브론즈 → 실버 → 골드 → 무지개, shared의 enhanceCardTier)이 바뀐 순간의 폭죽. 레벨업(22조각)보다 조각이 훨씬 많고 카드 밖으로 멀리 퍼진다.
// 가운데에서 크게 한 번 터진 뒤, 카드 위쪽 세 곳에서 작은 폭죽이 이어 터진다(--ox/--oy가 터지는 자리). 모양은 레벨업과 같이 미리 정해 둔다.
const PROMO_PIECES = [
  ...Array.from({ length: 44 }, (_, i) => {
    const angle = (i / 44) * Math.PI * 2 + (i % 2 ? 0.07 : -0.05);
    const dist = 62 + ((i * 29) % 7) * 9;
    return { ox: 50, oy: 50, dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist * 0.85, k: i, delay: (i % 5) * 35, size: 5 + (i % 4) * 2.5 };
  }),
  ...[
    { ox: 24, oy: 26, at: 480 },
    { ox: 76, oy: 32, at: 760 },
    { ox: 50, oy: 14, at: 1040 },
  ].flatMap(({ ox, oy, at }, w) =>
    Array.from({ length: 16 }, (_, i) => {
      const angle = (i / 16) * Math.PI * 2 + w * 0.3;
      const dist = 24 + (i % 3) * 8;
      return { ox, oy, dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist * 0.85, k: i * 3 + w * 7, delay: at + (i % 3) * 30, size: 4 + (i % 3) * 2 };
    }),
  ),
];

/** 등급마다 깔리는 홀로 한 겹(globals.css) */
const TIER_HOLO: Record<EnhanceCardTier, string> = { bronze: 'enh-sheen', silver: 'enh-silver', gold: 'enh-gold', rainbow: 'enh-rainbow' };

/** 승격 연출 한 번의 길이 — globals.css의 .enh-promo-* 애니메이션(2600ms)과 같은 값 */
const PROMO_MS = 2600;

// 승격하는 동안 카드 뒤로 번지는 빛 그림자의 색 — 금빛은 금색끼리, 무지개는 색상환을 돌며 바뀐다(키프레임마다 한 칸씩)
const PROMO_SHADOW: Record<EnhanceCardTier, string[]> = {
  bronze: ['rgba(214, 140, 80, 0.9)'],
  silver: ['rgba(226, 232, 240, 0.95)', 'rgba(186, 214, 255, 0.9)', 'rgba(255, 255, 255, 0.95)'],
  gold: ['rgba(255, 200, 60, 0.95)', 'rgba(255, 228, 130, 0.9)', 'rgba(255, 176, 32, 0.95)'],
  rainbow: ['hsla(0, 100%, 70%, 0.95)', 'hsla(48, 100%, 65%, 0.95)', 'hsla(140, 90%, 62%, 0.95)', 'hsla(200, 100%, 68%, 0.95)', 'hsla(275, 100%, 72%, 0.95)'],
};

// 접점의 불꽃 — 경계선 위 가로 자리(x %)에서 튀어 오르거나 옆으로 흩어진 뒤 떨어진다(sx/sy px). 짧게(dur) 되풀이하며, 지연을 흩어 늘 몇 개씩 튄다.
const PROMO_SPARKS = Array.from({ length: 26 }, (_, i) => {
  const x = ((i * 37) % 100) + 0.5;
  const side = i % 2 ? 1 : -1;
  return {
    x,
    sx: side * (6 + ((i * 13) % 22)),
    sy: -(8 + ((i * 7) % 20)),
    rot: side * (20 + ((i * 17) % 50)),
    k: i * 5,
    delay: (i * 83) % 600,
    dur: 380 + ((i * 47) % 260),
  };
});

// 승격 폭죽 조각의 색 — 금빛 승격은 금 · 흰빛 다섯 가지, 은빛 승격은 은 · 푸른 흰빛 다섯 가지를 돌고,
// 무지개 승격은 색상환을 돈다(k는 조각마다 정해 둔 번호)
const PROMO_GOLD_COLORS = ['#ffd54a', '#fff3b0', '#ffb300', '#ffffff', '#ffe082'];
const PROMO_SILVER_COLORS = ['#e5e7eb', '#ffffff', '#cbd5e1', '#dbeafe', '#f1f5f9'];
function promoPieceColor(tier: EnhanceCardTier, k: number): string {
  if (tier === 'rainbow') return `hsl(${(k * 37) % 360} 100% 72%)`;
  const colors = tier === 'silver' ? PROMO_SILVER_COLORS : PROMO_GOLD_COLORS;
  return colors[k % colors.length];
}

/**
 * [승격] 연출 — 카드 밖으로 폭죽이 퍼지고, 카드 전체가 새 등급의 빛(금빛 · 무지개빛)으로 덮였다가
 * 그 빛이 **아래부터 걷히며** 새 등급의 카드가 드러난다(globals.css의 .enh-promo — 빛나는 경계선이 걷히는 자리를 따라 올라간다).
 * 아래 카드는 이미 새 등급으로 그려져 있다(레벨이 오른 그 렌더에 등급도 바뀐다) — 이 층은 그것을 덮었다 걷을 뿐이다.
 */
function PromotionBurst({ tier, level }: { tier: EnhanceCardTier; level: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  // 카드(칸) 자체에 거는 두 가지 — ① 승격하는 동안 1.1배로 커졌다 돌아온다(강조) ② 카드 뒤로 새 등급 색의 빛 그림자가 번진다.
  // ⚠️ 칸의 transform · filter는 hover(globals.css .holo-cell)가, translate · rotate는 내려찍기(SkillQuake)가 쓴다 — 그래서 확대는
  //    개별 속성 `scale`로 건다(셋이 서로 덮지 않고 곱해진다). 그림자는 filter라 hover의 그림자를 잠깐 덮지만 2.6초 뒤 걷힌다.
  //    WAAPI라 승격이 이어서 또 일어나도(key가 바뀌어 다시 마운트) 처음부터 다시 돈다. 커진 카드가 이웃 카드 위에 오도록 z-index도 잠깐 올린다.
  useEffect(() => {
    const cell = ref.current?.closest('.holo-cell');
    if (!(cell instanceof HTMLElement) || typeof cell.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const shadows = PROMO_SHADOW[tier];
    const shadowAt = (i: number, a: number) =>
      `drop-shadow(0 0 ${Math.round(18 * a)}px ${shadows[i % shadows.length]}) drop-shadow(0 0 ${Math.round(38 * a)}px ${shadows[(i + 1) % shadows.length]})`;
    // ⚠️ 곡선(easing)은 키프레임마다 단다 — 전체 timing에 걸면 진행률 자체가 휘어 offset이 어긋난다(1.1배 머묾이 일찍 풀렸다).
    const timing = { duration: PROMO_MS };
    const ease = 'ease-in-out';
    const anims = [
      cell.animate(
        [
          { scale: '1', easing: ease },
          { scale: '1.1', offset: 0.14 },
          { scale: '1.1', offset: 0.86, easing: ease },
          { scale: '1' },
        ],
        timing,
      ),
      cell.animate(
        [
          { filter: shadowAt(0, 0), offset: 0, easing: ease },
          { filter: shadowAt(0, 1), offset: 0.18, easing: ease },
          { filter: shadowAt(1, 1.15), offset: 0.4, easing: ease },
          { filter: shadowAt(2, 1), offset: 0.62, easing: ease },
          { filter: shadowAt(3, 1.15), offset: 0.84, easing: ease },
          { filter: shadowAt(4, 0), offset: 1 },
        ],
        timing,
      ),
    ];
    cell.style.zIndex = '40';
    const done = () => {
      cell.style.zIndex = '';
    };
    anims[0].onfinish = done;
    return () => {
      anims.forEach(a => a.cancel());
      done();
    };
  }, [tier]);

  return (
    <span ref={ref} className="enh-promo" data-tier={tier} aria-hidden>
      <span className="enh-promo-glow" />
      <span className="enh-promo-edge" />
      {/* 빛이 걷히는 접점(경계선)을 따라 올라가며 튀는 불꽃 — 경계선과 같은 시간표로 움직이는 줄 위에서 조각마다 되풀이해 튄다 */}
      <span className="enh-promo-sparks">
        {PROMO_SPARKS.map((s, i) => (
          <span
            key={i}
            className="enh-promo-spark"
            style={{
              ['--x' as string]: `${s.x}%`,
              ['--sx' as string]: `${s.sx}px`,
              ['--sy' as string]: `${s.sy}px`,
              ['--rot' as string]: `${s.rot}deg`,
              ['--c' as string]: promoPieceColor(tier, s.k),
              animationDelay: `${s.delay}ms`,
              animationDuration: `${s.dur}ms`,
            }}
          />
        ))}
      </span>
      <span className="enh-promo-ring" />
      {PROMO_PIECES.map((p, i) => (
        <span
          key={i}
          className="enh-promo-piece"
          style={{
            ['--ox' as string]: `${p.ox}%`,
            ['--oy' as string]: `${p.oy}%`,
            ['--dx' as string]: `${p.dx.toFixed(1)}%`,
            ['--dy' as string]: `${p.dy.toFixed(1)}%`,
            ['--c' as string]: promoPieceColor(tier, p.k),
            ['--size' as string]: `${p.size}px`,
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
      <span className="enh-promo-text skill-outline-text">
        <span className="enh-promo-title">승격!</span>
        <span className="enh-promo-lv">{level >= ENHANCE_MAX_LEVEL ? 'Lv.Max' : `Lv.${level}`}</span>
      </span>
    </span>
  );
}

/**
 * n: 연출 번호(key) · promo: 승격이면 새 등급 · hold: 승격 직후 잠깐 그대로 보여 줄 **옛 등급**(그림 · 테두리 · 홀로).
 * 레벨이 오른 렌더에 카드는 곧바로 새 등급이 되지만, 승격의 빛(.enh-promo-glow)이 카드를 다 덮기 전에 새 그림이 비치면
 * "빛에 덮였다가 아래부터 새 카드가 드러난다"가 깨진다 — 그래서 빛이 다 덮는 순간(PROMO_HOLD_MS)까지 옛 등급으로 그린다.
 */
type CardBurst = { n: number; promo: EnhanceCardTier | null; hold: EnhanceCardTier | null };

/** 승격의 빛이 카드를 완전히 덮는 시각 — globals.css enhPromoGlow의 16%(2600ms 중) */
const PROMO_HOLD_MS = Math.round(PROMO_MS * 0.16);

/**
 * 카드 강화 판 — 레벨이 오른 카드마다 파티클 번호를 하나씩 올린다(그 번호가 LevelUpBurst · PromotionBurst의 key).
 * 등급이 바뀌었으면(Lv.3 → 4 · Lv.7 → 8 · Lv.10 → Max — 한 번에 여러 단계를 건너도) 레벨업 대신 승격 연출이다.
 * 보는 편이 바뀌면(관전자 화면의 차례 교대) 비교하지 않고 기준만 새로 잡는다 — 남의 레벨을 "올랐다"고 터뜨리지 않게.
 * 레벨은 화면상 경험치(withDisplayedExp)로 계산된 값이라, 카드가 내 칸에 도착한 뒤에 터진다.
 */
function useLevelUpBursts(enabled: boolean, team: SideId, levels: number[]): CardBurst[] {
  const prev = useRef<{ team: SideId; levels: number[] } | null>(null);
  const [bursts, setBursts] = useState<CardBurst[]>(() => levels.map(() => ({ n: 0, promo: null, hold: null })));
  const holdTimers = useRef<number[]>([]);
  useEffect(() => () => holdTimers.current.forEach(t => window.clearTimeout(t)), []);
  const key = levels.join(',');
  // ⚠️ 레이아웃 이펙트다 — 옛 등급 붙들기(hold)가 **첫 페인트 전에** 들어가야 새 그림이 한 프레임도 먼저 비치지 않는다.
  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = { team, levels };
    if (!enabled || !before || before.team !== team) return;
    if (levels.every((l, i) => l <= before.levels[i])) return;
    setBursts(b =>
      b.map((x, i) => {
        if (levels[i] <= before.levels[i]) return x;
        const from = enhanceCardTier(before.levels[i]);
        const to = enhanceCardTier(levels[i]);
        if (to === from) return { n: x.n + 1, promo: null, hold: null };
        const n = x.n + 1;
        // 빛이 다 덮은 뒤 새 등급으로 — 그사이 또 오르면(n이 바뀜) 그쪽이 다시 정한다
        holdTimers.current.push(
          window.setTimeout(() => setBursts(c => c.map((y, j) => (j === i && y.n === n ? { ...y, hold: null } : y))), PROMO_HOLD_MS),
        );
        return { n, promo: to, hold: x.hold ?? from };
      }),
    );
    // 효과음은 한 번에 하나 — 여러 장이 함께 올라도 겹쳐 울리지 않게, 그중 하나라도 승격이면 승격 소리(promotion.mp3), 아니면 레벨업(level_up.mp3)
    // 레벨업은 받은 소리의 앞 1초만 쓴다(2026-10-31 — scripts/trimSound.mjs로 자른 파일, 원본은 assets-src/sounds). 잘린 끝은 0.15초 동안 줄인다.
    const promoted = levels.some((l, i) => l > before.levels[i] && enhanceCardTier(l) !== enhanceCardTier(before.levels[i]));
    if (promoted) playRandomSound('promotion');
    else playRandomSound('level_up', 1, 1, undefined, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, team, key]);
  return bursts;
}

/**
 * 강화 판 제목("[실용신양] Lv.Max ×3")의 폭(em) — 레벨 · 배수 글자는 제목보다 작게(.enh-title-lv · .enh-title-over 0.82em) 그리므로 그만큼 줄여 더한다.
 * CSS가 `가용폭 ÷ 이 값`으로 제목 크기의 상한을 정해, 한 줄이 카드 폭을 넘지 않는다.
 */
function titleEmVar(title: string, level: number, over: number): React.CSSProperties {
  const tail = ` Lv.${enhanceLevelLabel(level)}${over > 1 ? ` ×${over}` : ''}`;
  return { ['--title-em' as string]: (maxLineEm(`[${title}]`) + maxLineEm(tail) * 0.82).toFixed(2) };
}

/** 등급 안에서의 세기 — 0 = 그 등급의 첫 레벨 … 1 = 마지막 레벨. 금빛(--gold, Lv.8~10) · 은빛(--silver, Lv.4~7) 홀로의 짙기 · 속도가 이 값을 따른다. */
function tierStep(level: number, from: number, to: number): number {
  return Math.min(1, Math.max(0, (level - from) / (to - from)));
}

// 줄바꿈은 여기서 정해진 그대로 그려진다(CSS가 `white-space: pre`) — 길면 접히는 게
// 아니라 글자가 작아진다. 그래서 문구와 함께 상수로 꺼내 두고 폭을 재어 넘긴다.
const PASS_TEXT = '지금은 할 수 있는게 없네요.\n레벨을 높이고,\n한 번에 몰아치는 방법도 좋답니다.';

// 턴을 마친 뒤 행동을 고르는 영역 — 화면을 덮는 모달이 아니라 항상 보드 아래
// (양 팀 합계 사이)에 자리한다. 로직은 기존과 동일하게 "내 팀의 행동 선택
// 차례"일 때만 클릭이 가능하고, 그 외에는 마우스를 올려 설명만 미리 볼 수 있다.
// 지금 누를 수 있는 패널(레벨이 있어 고를 수 있는 행동, 그리고 항상 고를 수
// 있는 "아무것도 하지 않음")은 은은하게 빛나 무엇을 눌러야 할지 강조해준다.
export function SkillChoiceBar({
  gameState,
  team,
  interactive,
  spectatorGuideTeam = null,
  myTeamChoosing = false,
  demoAllowed = null,
  hideGuide = false,
  wellOpen = null,
  onChoose,
  onPass,
}: {
  gameState: ClientGameState;
  team: SideId;
  interactive: boolean; // 지금이 실제로 이 팀(=나)이 행동을 고를 차례인지
  // 관전 시점일 때만 채워진다 — 지금 행동을 고르고 있는 팀. 관전자는 누를 수 없으므로
  // 그 팀 색 손가락으로 "이 중에서 고르는 중"이라는 진행만 중계한다.
  spectatorGuideTeam?: SideId | null;
  // 우리 팀이 행동을 고르는 단계인지(팀 안의 다른 사람 차례여도 참) — 이 띠 전체가
  // 은은하게 빛나 "이번엔 여기를 봐야 한다"고 알린다. 장소 선택 단계에는 대신 카드판이
  // 빛나고 이 값은 false다(GameLayout이 두 곳을 번갈아 켠다).
  myTeamChoosing?: boolean;
  /**
   * 시연 모드에서 지금 누를 수 있는 기술 — 대본이 열어 준 한 칸만 담겨 온다.
   * null이면 평범한 게임이라 아무것도 달라지지 않는다.
   *
   * ⚠️ **빈 배열은 "전부 잠금"이다**(null과 다르다). 시연 중 장소를 누를 차례에는
   *    기술 칸이 하나도 열리지 않아야 하므로, `?? true` 같은 기본값으로 뭉개지 말 것.
   * ⚠️ 시연에는 [턴 마치기]도 없다 — 누르면 턴이 넘어가 대본이 끊긴다(서버도 무시한다).
   */
  demoAllowed?: Animal[] | null;
  /**
   * 손가락 가이드를 숨긴다 — 개인전의 상대 선택 화면(TargetPicker)이 떠 있는 동안. 가이드 손(z-index 95)은
   * 그 오버레이(80)보다 위에 그려져, 어두워진 화면 위로 손가락만 환하게 남는다.
   */
  hideGuide?: boolean;
  /**
   * 이벤트 '한 우물만 파기'에서 지금 쓸 수 있는 카드(lib/skills.ts의 oneWellOpen). null이면 잠금이 없는 평범한 판.
   * 나머지 카드는 레벨이 있어도 🔒로 잠기고 누를 수 없다 — 서버(eligibleAnimals)도 같은 규칙으로 거부한다.
   */
  wellOpen?: readonly Animal[] | null;
  onChoose: (animal: Animal) => void;
  onPass: () => void;
}) {
  const previews = ANIMAL_ORDER.map(animal => previewSkill(gameState, team, animal));
  // 카드 강화 판(혼자 놀기) — 모든 카드가 Lv.1부터 열려 있고, 레벨이 오를수록 카드가 밝아지고 무지개 홀로가 짙어진다.
  // 쓴 카드는 쿨타임 동안 잠긴다(서버 eligibleAnimals와 같은 규칙 — lib/skills.ts의 cooldownOf).
  const enhance = !!gameState.enhance;
  const bursts = useLevelUpBursts(enhance, team, previews.map(p => p.level));
  // 고르는 순간의 무게 — 배율이 높을수록 무겁게 내리꽂히고 판이 흔들린다(SkillQuake.tsx)
  const quake = useSkillQuake();

  // 예전엔 이 팀의 첫 행동이 해금된 그 순간에만(평생 1회) 손가락 가이드를 보여줬는데,
  // 그 순간을 놓치면 다시 볼 방법이 없었다. 이제는 행동을 고를 수 있는 턴마다 매번
  // 보여주고, 설정 패널(⚙️)에서 원하는 사람만 끌 수 있게 했다.
  const guideEnabled = useGuideEnabled();
  const showSkillGuide = guideEnabled && !hideGuide && (interactive || spectatorGuideTeam !== null);
  // 시연은 대본이 열어 준 칸만 누를 수 있고, 손가락도 그 한 칸만 짚는다(빈 배열=전부 잠금).
  const demoOpen = (animal: Animal) => (demoAllowed ? demoAllowed.includes(animal) : true);
  // 한 우물만 파기 — 잠긴 카드(🔒)는 레벨이 있어도 누를 수 없다(서버 eligibleAnimals와 같은 규칙).
  const wellOk = (animal: Animal) => (wellOpen ? wellOpen.includes(animal) : true);
  const open = (animal: Animal) => demoOpen(animal) && wellOk(animal);
  // [턴 마치기]는 평소 언제나 누를 수 있지만, 시연에서는 턴이 넘어가는 순간 대본이
  // 끊기므로(상대 차례가 온다) 아예 잠근다 — 서버도 같은 이유로 무시한다.
  const passable = interactive && demoAllowed === null;

  // 행동 선택 단계에만 이 띠가 빛난다. 관전자는 지금 고르는 팀의 색으로(그 팀 색 변수를
  // 함께 심어준다), 플레이어는 우리 팀 차례일 때 연두색으로.
  const glowClass = spectatorGuideTeam
    ? 'skill-bar-spectator-turn'
    : myTeamChoosing
      ? 'skill-bar-my-turn'
      : '';

  return (
    // 마우스를 올리면 그 칸이 살짝 떠오르며 커지는 연출을 넣으려면 각 버튼이 이 컨테이너
    // 밖으로 튀어나갈 수 있어야 한다 — 그래서 여기서는 overflow-hidden을 쓰지 않는다
    // (전체 띠의 둥근 모서리는 대신 양 끝 버튼 각각에 rounded-l/r-2xl + overflow-hidden으로 준다).
    <div
      // 칸 사이를 가르던 divide-x를 걷고 **여백(gap+padding)** 으로 바꿨다 — 다섯 칸이
      // 맞붙은 한 덩어리가 아니라, 낱장으로 떨어진 카드 다섯 장처럼 보이게 하려는 것이다.
      // ⚠️ 바탕도 안여백도 없다. 칸 다섯 개의 자리와 폭은 액자 그림이 정하므로
      // (globals.css의 .play-cards-grid — 칸마다 폭이 248~267px로 다르다) 여기서
      // grid-cols-5로 균등 분할하면 가운데 칸이 나무 구멍과 어긋난다.
      className={`play-cards-grid min-h-0 ${glowClass}`}
      style={spectatorGuideTeam ? spectatorTeamVars(spectatorGuideTeam) : undefined}
    >
      {ANIMAL_ORDER.map((animal, i) => {
        const preview = previews[i];
        const cooling = cooldownOf(gameState, team, animal);
        const eligible = preview.level > 0 && cooling === 0;
        const clickable = interactive && eligible && open(animal);
        const desc = enhance ? describeEnhanceSkill(animal, preview.level) : describeSkill(animal, preview.level);
        // 특허랑이처럼 효과가 둘 이상인 행동은 문구가 그냥 이어 붙어 "체력 +4상대 체력 -4"처럼
        // 읽히므로, 각 효과를 조각으로 모아 **줄을 바꿔** 한 줄에 하나씩 둔다(요청 — 줄 끝의 쉼표는
        // 2026-10-30 요청으로 뺐다). 한 줄로 이으면 "내 체력 +1, 상대 체력 -1"이 카드 폭을 넘겨 제멋대로
        // 접혔다 — 어디서 접힐지는 글자 수에 달려 있어 그때그때 달랐다.
        const effectParts: string[] = [];
        if (preview.extraDraws > 0) effectParts.push(`다음 턴 카드 +${preview.extraDraws}회`);
        if (preview.myHpDelta > 0) effectParts.push(`내 체력 ${preview.oppHpIsMax ? '최대 ' : ''}+${preview.myHpDelta}`);
        if (preview.oppHpDelta < 0) effectParts.push(`상대 체력 ${preview.oppHpIsMax ? '최대 ' : ''}${preview.oppHpDelta}`);
        if (animal === 'mermaid') effectParts.push(`다음 행동 ×${preview.multiplierAfter}`);
        // 카드 강화의 덧붙는 효과 — 연출 캡션(useAnimationQueue Pass 1.6)과 같은 문구
        if (preview.oppMultiplierDivide && preview.oppMultiplierDivide > 1) {
          effectParts.push(Number.isFinite(preview.oppMultiplierDivide) ? `상대 배율 ÷${preview.oppMultiplierDivide}` : '상대 배율 제거');
        }
        if (preview.randomExp) effectParts.push(`무작위 경험치 +${preview.randomExp}`);
        if (preview.oppDivisor && preview.oppDivisor > 1) effectParts.push(`상대 효과 ÷${preview.oppDivisor}(${preview.oppDivisorTurns}턴)`);
        // 배율 무관 — 연출 캡션과 같은 문구
        if (preview.cooldownCut) {
          const cards = (preview.cooldownCards ?? 1) > 1 ? ` ${preview.cooldownCards}장` : '';
          effectParts.push(Number.isFinite(preview.cooldownCut) ? `쿨타임 -${preview.cooldownCut}턴${cards}` : `쿨타임 초기화${cards}`);
        }
        if (preview.cleanse) effectParts.push(Number.isFinite(preview.cleanse) ? `부정 효과 -${preview.cleanse}턴` : '부정 효과 정화');
        if (preview.regenTurns) effectParts.push(`지속 회복 +${preview.regenTurns}턴`);
        if (preview.regenStack) effectParts.push(`회복 중첩 +${preview.regenStack}`);
        if (preview.bleedTurns) effectParts.push(`출혈 +${preview.bleedTurns}턴`);
        if (preview.bleedStack) effectParts.push(`출혈 계수 +${preview.bleedStack}`);
        if (preview.evadePct) effectParts.push(`회피 ${preview.evadePct}%`);
        if (preview.oppHealCut) effectParts.push(preview.oppHealCut >= 100 ? '상대 회복 금지' : `상대 회복 -${preview.oppHealCut}%`);
        if (preview.purge) effectParts.push('이로운 효과 제거');
        // 상대 디자인어(Lv.Max)에 걸려 이 카드의 효과가 나뉘어 있다 · 상대 특허랑이에 걸려 회복이 줄어 있다 — 위 숫자는 이미 반영한 값이다
        if (preview.divisor && preview.divisor > 1) effectParts.push(`(÷${preview.divisor} 적용)`);
        if (preview.healCut) effectParts.push(`(회복 -${preview.healCut}% 적용)`);
        const effectLabel = !wellOk(animal)
          ? '🔒 사용 불가'
          : cooling > 0
            ? coolingLabel(cooldownShownOf(gameState, team, animal))
            : eligible ? effectParts.join('\n') : '레벨 부족';
        // 강화 단계 0~1 — 카드의 밝은 그라데이션과 무지개 홀로가 이 값을 따라 짙어진다(globals.css의 .enh-*)
        const enhStep = enhance ? (preview.level - 1) / (ENHANCE_MAX_LEVEL - 1) : 0;
        // 등급 — 테두리 색과 홀로 겹이 이것으로 갈린다(강화 판이 아니면 null)
        // 승격 직후 잠깐은 옛 등급으로 그린다(빛이 카드를 다 덮을 때까지 — CardBurst.hold)
        const tier = enhance ? (bursts[i].hold ?? enhanceCardTier(preview.level)) : null;

        // 가이드 손가락이 버튼 위쪽 경계 밖으로 튀어나가는데, 버튼 자체는(모서리를 둥글게
        // 다듬으려고, 특히 맨 왼쪽 sheep은) overflow-hidden이라 그 안에 두면 잘려 보인다
        // — 그래서 가이드는 이 바깥의, 잘리지 않는 래퍼에 그린다(패스 버튼과 동일한 처리).
        return (
          // 홀로 효과는 "지금 누를 수 있는가"가 아니라 "레벨이 있어 활성인가"로 켠다 — 상대 차례에도 내 활성 카드는
          // 빛난다. (시연은 대본이 열어 준 칸만.) 잠긴(레벨 0) 카드에는 걸지 않는다.
          // 이 기술 하나로 판을 끝낼 수 있으면(상표토끼·특허랑이) 카드 둘레에 빨간 빛 — lib/skills.ts의 finishingMove.
          // 시연은 대본대로만 진행하므로 표시하지 않는다.
          <HoloCell
            key={animal}
            enabled={eligible && open(animal)}
            flat={!interactive}
            className={`relative h-full ${demoAllowed === null && finishingMove(gameState, team, animal).finishes ? 'skill-card-lethal' : ''}`}
          >
            <button
              onClick={e => {
                if (!clickable) return;
                if (enhance) {
                  const cell = e.currentTarget.closest('.holo-cell');
                  // 그 카드가 실제로 받는 배율 — 디자인어 배율 × Lv.Max 별도 배수
                  const mult = gameState.teams[team].pendingMultiplier * (preview.over ?? 1);
                  if (cell instanceof HTMLElement) quake.trigger(cell, quakeStageOf(mult));
                }
                onChoose(animal);
              }}
              disabled={!clickable}
              // play-card-frame이 ::after로 금색 액자를, ::before로 네 모서리 장식과
              // 잎 데칼을 얹는다 — 컷신 이미지 위에 덧그릴 뿐 그림은 그대로다.
              // 다섯 장이 각자 제 나무 구멍에 앉으므로 **모두** 같은 둥글기를 쓴다
              // (예전에는 한 덩어리 띠라 양 끝만 둥글렸다).
              className={`play-card-frame skill-choice-panel play-card-cell group relative flex flex-col items-stretch justify-end text-left w-full h-full ${
                clickable ? 'skill-choice-glow' : ''
              }`}
              data-enh-level={enhance ? preview.level : undefined}
              data-enh-tier={tier ?? undefined}
              style={
                enhance
                  ? ({
                      ['--enh' as string]: enhStep.toFixed(3),
                      ['--gold' as string]: tierStep(preview.level, ENHANCE_GOLD_FROM, ENHANCE_MAX_LEVEL - 1).toFixed(3),
                      ['--silver' as string]: tierStep(preview.level, ENHANCE_SILVER_FROM, ENHANCE_GOLD_FROM - 1).toFixed(3),
                    } as React.CSSProperties)
                  : undefined
              }
            >
              {/* 컷신 이미지 어둡게 하는 filter는 이 배경 레이어에만 걸어야 한다 — 예전처럼
                  버튼 전체에 filter를 걸면 그 위에 z-index로 얹은 자막(제목·설명·레벨
                  표시)까지 함께 어두워져 "레벨 부족"일 때 글자가 거의 안 보였다. */}
              {/* ⚠️ 어둡게 하는 기준은 `eligible`이 아니라 **지금 누를 수 있는가**다.
                  시연에서 대본이 잠가 둔 칸을 밝은 채로 두면 눌러도 되는 것처럼 보여
                  관람객이 계속 누르는데 아무 일도 일어나지 않는다(장소 타일은 이미
                  잠기면 어두워진다 — 그쪽과 같은 신호를 준다). 글씨는 그대로 둔다:
                  레벨이 모자란 것이 아니라 "지금은 아닌" 것이라 "레벨 부족"이 아니다. */}
              <div
                className={`skill-choice-bg play-frame-inset absolute ${eligible && open(animal) ? '' : 'skill-choice-bg-disabled'}`}
                // 그림은 등급마다 한 벌(브론즈 · 일반 판 v1 / 실버 · 골드 v2 / 무지개 vmax — lib/playAssets.ts의 skillArtSrc)
                style={{ backgroundImage: `url(${skillArtSrc(animal, tier)})` }}
              />
              {/* 카드 강화 — 홀로(빛 효과)는 등급마다 **한 겹뿐이다**(쿨타임 중엔 옅게, globals.css의 .enh-*):
                  브론즈(Lv.1~3) 빛 반사 · 실버(Lv.4~7) 은빛 · 골드(Lv.8~10) 금빛 · 무지개(Max) 무지개빛 */}
              {tier && (
                <div className={`${TIER_HOLO[tier]} play-frame-inset absolute ${cooling > 0 ? 'enh-cooling' : ''}`} aria-hidden />
              )}
              <div className="skill-choice-dim play-frame-inset absolute" />
              {/* 레벨이 있을 때는(활성) 이 자리에 "레벨 N 소모" 대신 실제 효과(카드 추가
                  뽑기·체력 강탈 등, 노란색)를 보여준다 — 레벨이 없으면(비활성) 흰색
                  "레벨 부족"으로 돌아간다. 예전엔 효과 문구를 좌상단에 따로 뒀는데, 우상단
                  한 곳으로 합쳐 중복 표시를 없앴다. */}
              {/* ⚠️ 모서리 장식 **아래로** 내려 앉힌다. top-2에 두면 우상단 장식이
                  "레벨 부족"의 끝글자를, 긴 효과 문구는 좌상단 장식이 첫글자를 덮는다.
                  거리는 --deco에서 뽑으므로 카드가 짧아지면 함께 올라온다. */}
              {/* 줄바꿈은 문구가 정하고(쉼표 뒤), 카드 폭이 모자라면 CSS가 글자를 줄인다 —
                  그 판단에 필요한 "가장 긴 줄의 폭(em)"을 여기서 재어 넘긴다. */}
              <span
                className={`skill-effect-label skill-outline-text absolute z-10 text-lg font-bold ${
                  eligible ? 'text-amber-300' : 'text-white'
                }`}
                style={emVar('label-em', effectLabel)}
              >
                {effectLabel}
              </span>
              {/* 아래 안여백은 **아래쪽 모서리 장식**만큼이다(.skill-text-block) —
                  p-3으로만 두면 대사 마지막 줄이 잎 뒤로 숨는다(실제로 숨었다). */}
              <div className="skill-text-block relative z-10 flex flex-col gap-1.5 p-3 min-h-0">
                {/* Lv.Max의 별도 배수(경험치를 더 채울수록 ×2 · ×3 …) — 위 효과 숫자에는 이미 곱해져 있다.
                    "Lv.Max ×3"을 **한 줄**에 이어 쓴다(2026-10-31 요청 — 하루 전에는 접히지 않게 "Lv.Max" 아래에 겹쳐 썼다).
                    대신 제목이 카드 폭을 넘으면 제목 전체가 작아진다(--title-em — 설명 줄과 같은 폭 맞춤, globals.css .skill-text-title). */}
                <h3
                  className="skill-text-title skill-outline-text font-extrabold"
                  style={{ color: SKILL_COLOR[animal], ...(enhance ? titleEmVar(SKILL_TITLE[animal], preview.level, preview.over ?? 1) : {}) }}
                >
                  [{SKILL_TITLE[animal]}]
                  {enhance && <span className="enh-title-lv"> Lv.{enhanceLevelLabel(preview.level)}</span>}
                  {enhance && (preview.over ?? 1) > 1 && <span className="enh-title-over"> ×{preview.over}</span>}
                </h3>
                {/* ⚠️ `whitespace-pre-line`이 아니라 `pre`다(CSS의 .skill-text-desc) —
                    줄바꿈은 살리되 **그 밖의 줄바꿈은 일어나지 않아야** 한다. 대신 줄이
                    길면 글자가 작아진다(--desc-em). */}
                <p className="skill-text-desc skill-outline-text text-white leading-snug" style={emVar('desc-em', desc.effect)}>
                  {desc.effect}
                </p>
                <p
                  className="skill-text-quote skill-outline-text font-bold leading-snug"
                  style={{ color: SKILL_COLOR[animal], ...emVar('quote-em', `"${desc.catchphrase}"`) }}
                >
                  &quot;{desc.catchphrase}&quot;
                </p>
              </div>
            </button>

            {/* 지금 고를 수 있는(레벨이 있는) 행동마다, 내가 행동을 고를 수 있는 턴이면 매번 뜬다.
                손은 그 칸의 주인 캐릭터 것이라, 어느 칸을 짚고 있는지 손만 봐도 안다. */}
            {showSkillGuide && eligible && open(animal) && (
              <GuideFinger team={spectatorGuideTeam} />
            )}
            {enhance && bursts[i].n > 0 &&
              (bursts[i].promo ? (
                <PromotionBurst key={bursts[i].n} tier={bursts[i].promo} level={preview.level} />
              ) : (
                <LevelUpBurst key={bursts[i].n} level={preview.level} />
              ))}
          </HoloCell>
        );
      })}

      {/* 가이드 손가락이 버튼 위쪽 경계 밖으로 튀어나가는데, 버튼 자체는(모서리를 둥글게
          다듬으려고) overflow-hidden이라 그 안에 두면 잘려 보인다 — 그래서 가이드는
          이 바깥의, 잘리지 않는 래퍼에 그린다(장소 타일에서 겪었던 것과 같은 문제). */}
      {/* 턴 마치기도 기술 카드처럼 가리키면 기운다(2026-10-30 요청) — 기술 카드가 "레벨이 있어 활성인가"로 켜듯, 이 칸은 언제나
          활성이라 상대 차례에도 켠다(시연은 내내 잠겨 있어 끈다 — 내 행동 선택 단계가 아니면 flat이라 아무 움직임도 없다). **입체 움직임만** 준다 — 광택 띠와 강화 판의 Lv.Max 빛(무지개 · 금빛)을
          한 번 입혀 봤다가 같은 날 요청으로 걷었다(shine={false}). */}
      <HoloCell enabled={demoAllowed === null} shine={false} flat={!interactive} className="relative">
        <button
          onClick={e => {
            if (!passable) return;
            // 카드 강화 판 — 기술 카드처럼 내려놓는다(2026-10-30 요청). 배율이 없는 칸이라 언제나 진도 1(내려찍기만)이다.
            if (enhance) {
              const cell = e.currentTarget.closest('.holo-cell');
              if (cell instanceof HTMLElement) quake.trigger(cell, 1);
            }
            onPass();
          }}
          disabled={!passable}
          className={`play-card-frame skill-choice-panel play-card-cell group relative flex flex-col items-stretch justify-end text-left w-full h-full ${
            passable ? 'skill-choice-glow' : ''
          }`}
        >
          {/* 시연에서는 이 칸이 내내 잠겨 있으므로 함께 어둡게 둔다(위 주석과 같은 이유). */}
          <div className={`skill-choice-bg pass-panel-bg play-frame-inset absolute ${demoAllowed === null ? '' : 'skill-choice-bg-disabled'}`} />
          <div className="skill-choice-dim play-frame-inset absolute" />
          <div className="skill-text-block relative z-10 flex flex-col gap-1.5 p-3 min-h-0">
            <h3 className="skill-text-title skill-outline-text font-extrabold text-jungle-200">[턴 마치기]</h3>
            <p className="skill-text-desc skill-outline-text text-white leading-snug" style={emVar('desc-em', PASS_TEXT)}>
              {PASS_TEXT}
            </p>
          </div>
        </button>

        {/* 언제나 누를 수 있는 이 버튼도, 행동 선택 차례마다 손가락으로 짚어준다
            (시연에서는 잠겨 있으므로 짚지 않는다 — 누를 수 없는 곳을 가리키면 안 된다). */}
        {showSkillGuide && demoAllowed === null && <GuideFinger team={spectatorGuideTeam} />}
      </HoloCell>
      {quake.layer}
    </div>
  );
}
