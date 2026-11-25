'use client';

import { memo, useId, useLayoutEffect, useRef, useState } from 'react';

/**
 * PC 게임 판의 액자 — 변이 살짝 부푼 판 · 원기둥 단면의 테 · 음영 레이어를 SVG로 그린다(2026-11-26,
 * reference/web-game-ui-notes의 6 · 9 · 10 · 11장과 예시 이미지 06 · 07 "A. 경로 겹치기").
 *
 * 판(.play-frame-css)의 **첫 자식**으로 넣으면 그 상자를 꽉 채운다(absolute). 칸들은 이 뒤에 그려진다 — 판의 자식은 모두
 * position이 있어야 이 위에 온다(17-enhance-pc.css의 .has-board-frame 절). 크기가 바뀌면 ResizeObserver로 경로를 다시 계산한다
 * (이미지를 늘이면 곡선이 찌그러진다 — 노트 6장).
 *
 *  1. 바닥 그림자 — 같은 모양을 아래로 민 것(블러 없는 카툰 그림자)
 *  2. 테 — 바깥 경로에서 안쪽으로 조금씩 줄인 경로를 N겹 쌓고, 겹마다 단면 밝기(PROFILE)로 칠한다 → 둥근 원기둥 단면
 *  3. 테 덮개 — 위 밝게 · 아래 어둡게(광원은 위 하나 — 노트 10장 "빛 방향 통일"). 색은 진한 고동색(아래 BASE)
 *  4. 안쪽 판 — 크림색 + 비네팅(가운데 밝고 가장자리 어둡게) + 안쪽 그림자(테가 판 위쪽에 드리운다, 판이 움푹 파여 보인다)
 *  5. 경계선 — 안쪽 판 둘레 · 바깥 외곽선
 *  6. 나뭇결 — 테 안쪽으로 들인 **판 윤곽선을 그대로 따라가는** 결 선 여러 줄(2026-11-26 요청: 규칙적인 광택 줄이 플라스틱처럼 보였다).
 *     줄마다 테 안의 위치 · 굵기 · 진하기 · 끊기는 마디(점선 길이 · 간격 · 시작점)가 다르다 — 고정 씨앗의 난수라 매번 같은 모양이다.
 *     윤곽선을 따르므로 둥근 모서리에서도 결이 함께 휜다(⚠️ 직선 노이즈를 45°로 잘라 붙였더니 모서리 곡선을 못 따라갔다).
 *     결은 모두 **테보다 어두운** 갈색 두 단계다(밝은 결은 걷었다 — 요청)
 * 어두운 쪽은 검정 대신 같은 계열의 진한 갈색이다(노트 10장).
 *
 * ⚠️ 변과 모서리는 **접선을 맞춰** 잇는다(노트 9장) — 변 곡선이 끝나는 방향 위에 모서리 곡선의 첫 제어점을 둔다. 축 방향 제어점으로
 *    이으면 볼록한 변과 모서리가 만나는 점이 꺾인다.
 */

/** 단면 밝기: 0 = 바깥 가장자리, 1 = 안쪽 가장자리 / 음수 = 어둡게, 양수 = 밝게(노트 11장 · 부록 A). 하이라이트(0.33)를 바깥쪽에 두어 테가 부풀어 보인다.
 *  하이라이트는 0.55 — 1이면 위쪽 테가 번들거려 플라스틱처럼 보였다(2026-11-26 요청: 빛을 낮출 것) */
const PROFILE: [number, number][] = [[0, -0.9], [0.12, -0.35], [0.33, 0.55], [0.55, 0.2], [0.8, -0.25], [1, -0.85]];
/** 밝은 쪽으로 섞는 비율 — 하이라이트를 낮게(0.8 → 0.55) */
const LITE_MIX = 0.55;
const RINGS = 26;
// 테 색 — 이전 판의 진한 고동색(#6b4423 · #4e2f17)을 기준으로(2026-11-26 요청 — 노트의 캐러멜 #dca56f은 너무 밝았다).
// 밝은 쪽은 같은 계열의 밝은 갈색, 어두운 쪽은 검정 대신 아주 진한 갈색(노트 10장)
const BASE: [number, number, number] = [98, 60, 30]; // #623c1e
const LITE: [number, number, number] = [205, 156, 104]; // #cd9c68
const DARK: [number, number, number] = [24, 11, 3]; // #180b03

function prof(u: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    if (u <= PROFILE[i][0]) {
      const [a, va] = PROFILE[i - 1];
      const [b, vb] = PROFILE[i];
      return va + ((vb - va) * (u - a)) / (b - a);
    }
  }
  return PROFILE[PROFILE.length - 1][1];
}
const mix = (c1: number[], c2: number[], t: number) => c1.map((c, i) => Math.round(c + (c2[i] - c) * t));

/** 고정 씨앗 난수(mulberry32) — 나뭇결이 그릴 때마다 바뀌지 않게 */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** 나뭇결 줄 수 · 두 단계 색(테 기준색 #623c1e보다 어둡게) */
const GRAIN_LINES = 18;
const GRAIN_COLORS = ['#3a2210', '#1e0e04'];

const f = (n: number) => Math.round(n * 100) / 100;
const pt = (p: number[]) => `${f(p[0])} ${f(p[1])}`;
const nrm = (x: number, y: number) => {
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
};

/** (x0,y0)-(x1,y1)에 변이 b만큼 부푼 둥근 판 — 모서리 크기 r, 변과 모서리는 접선 맞춤(노트 부록 boardPath 그대로) */
function boardPath(x0: number, y0: number, x1: number, y1: number, r: number, b: number): string {
  const mx = (x0 + x1) / 2;
  const my = (y0 + y1) / 2;
  const E = [
    [[x0 + r, y0 + b], [mx, y0 - b], [x1 - r, y0 + b]],
    [[x1 - b, y0 + r], [x1 + b, my], [x1 - b, y1 - r]],
    [[x1 - r, y1 - b], [mx, y1 + b], [x0 + r, y1 - b]],
    [[x0 + b, y1 - r], [x0 - b, my], [x0 + b, y0 + r]],
  ];
  const L = (r - b) * 0.56;
  let d = `M${pt(E[0][0])}`;
  for (let k = 0; k < 4; k++) {
    const e = E[k];
    const n = E[(k + 1) % 4];
    d += `Q${pt(e[1])} ${pt(e[2])}`;
    const o = nrm(e[2][0] - e[1][0], e[2][1] - e[1][1]);
    const i = nrm(n[1][0] - n[0][0], n[1][1] - n[0][1]);
    d += `C${pt([e[2][0] + o[0] * L, e[2][1] + o[1] * L])} ${pt([n[0][0] - i[0] * L, n[0][1] - i[1] * L])} ${pt(n[0])}`;
  }
  return `${d}Z`;
}

export const BoardFrame = memo(function BoardFrame({ rimRatio }: {
  /** 테 두께 = 판 폭 × 이 값 — CSS가 판의 안여백을 같은 값으로 잡아(--board-rim) 칸이 테를 덮지 않는다 */
  rimRatio: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  useLayoutEffect(() => {
    const host = ref.current?.parentElement;
    if (!host) return;
    // offset* — 레이아웃 크기(흔들림 연출의 transform에 흔들리지 않는다)
    const measure = () => setBox(prev => {
      const w = host.offsetWidth;
      const h = host.offsetHeight;
      return prev && prev.w === w && prev.h === h ? prev : { w, h };
    });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  let body = null;
  if (box && box.w > 0 && box.h > 0) {
    const { w, h } = box;
    const T = w * rimRatio; // 테 두께
    const r = T * 2.1; // 바깥 모서리 크기
    const b = Math.min(w, h) * 0.008; // 변 볼록함
    const inset = (t: number) => boardPath(t, t, w - t, h - t, Math.max(r - t * 0.7, 4), Math.max(b - t * 0.12, 0));
    const outer = inset(0);
    const inner = inset(T);
    const drop = Math.max(3, T * 0.4);
    // 나뭇결 — 줄마다 테 안의 위치(t) · 굵기 · 진하기 · 끊기는 마디가 다르다. 둘레(per)에 맞춘 점선이라 줄이 끊어졌다 이어진다
    const rand = seeded(20261126);
    const per = 2 * (w + h);
    const grain = Array.from({ length: GRAIN_LINES }, (_, i) => {
      const t = T * (0.1 + 0.8 * rand());
      const dashes: number[] = [];
      for (let k = 0; k < 7; k++) dashes.push(f(per * (0.03 + 0.16 * rand())), f(per * (0.004 + 0.05 * rand())));
      return (
        <path
          key={i}
          d={inset(t)}
          stroke={GRAIN_COLORS[rand() < 0.65 ? 0 : 1]}
          strokeOpacity={f(0.18 + 0.32 * rand())}
          strokeWidth={f(Math.max(0.6, T * (0.025 + 0.06 * rand())))}
          strokeDasharray={dashes.join(' ')}
          strokeDashoffset={f(per * rand())}
        />
      );
    });
    const rings = Array.from({ length: RINGS }, (_, i) => {
      const v = prof((i + 0.5) / RINGS);
      const c = v >= 0 ? mix(BASE, LITE, v * LITE_MIX) : mix(BASE, DARK, -v * 0.65);
      return <path key={i} d={`${inset((T * i) / RINGS)} ${inner}`} fillRule="evenodd" fill={`rgb(${c.join(',')})`} />;
    });
    body = (
      <>
        <defs>
          <linearGradient id={`${uid}l`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#ffe9c8" stopOpacity="0.08" />
            <stop offset="0.45" stopColor="#ffe9c8" stopOpacity="0" />
            <stop offset="0.6" stopColor="#1a0c03" stopOpacity="0" />
            <stop offset="1" stopColor="#1a0c03" stopOpacity="0.45" />
          </linearGradient>
          <radialGradient id={`${uid}v`} cx="0.5" cy="0.42" r="0.75">
            <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
            <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
            <stop offset="1" stopColor="#7a4a1e" stopOpacity="0.28" />
          </radialGradient>
          <clipPath id={`${uid}c`}>
            <path d={inner} />
          </clipPath>
          <filter id={`${uid}b`} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={T * 0.35} />
          </filter>
          <clipPath id={`${uid}r`}>
            <path d={`${outer} ${inner}`} clipRule="evenodd" />
          </clipPath>
        </defs>
        {/* 1. 바닥 그림자 */}
        <path d={outer} transform={`translate(0 ${f(drop)})`} fill="#140902" opacity="0.6" />
        {/* 2. 테 — 원기둥 단면 */}
        {rings}
        {/* 6. 나뭇결 — 판 윤곽을 따라가는 결 선(모서리에서도 함께 휜다), 테 안에서만 */}
        <g clipPath={`url(#${uid}r)`} fill="none" strokeLinecap="round">
          {grain}
        </g>
        {/* 3. 테 덮개 — 위 밝게 · 아래 어둡게 */}
        <path d={`${outer} ${inner}`} fillRule="evenodd" fill={`url(#${uid}l)`} />
        {/* 4. 안쪽 판 — 크림 · 비네팅 · 안쪽 그림자 */}
        <path d={inner} fill="#f6e1bd" />
        <path d={inner} fill={`url(#${uid}v)`} />
        <g clipPath={`url(#${uid}c)`}>
          <path
            d={inner}
            transform={`translate(0 ${f(T * 0.3)})`}
            fill="none"
            stroke="#5c3214"
            strokeOpacity="0.5"
            strokeWidth={T * 0.9}
            filter={`url(#${uid}b)`}
          />
        </g>
        {/* 5. 경계선 */}
        <path d={inner} fill="none" stroke="#3d2311" strokeOpacity="0.8" strokeWidth={Math.max(1, T * 0.08)} />
        <path d={outer} fill="none" stroke="#140902" strokeWidth={Math.max(1.5, T * 0.12)} />
      </>
    );
  }

  return (
    <svg ref={ref} className="board-frame-svg" width={box?.w ?? 0} height={box?.h ?? 0} aria-hidden focusable="false">
      {body}
    </svg>
  );
});
