'use client';

import { useId, useImperativeHandle, useRef, type Ref } from 'react';
import { PackArtBody } from './CardsIcons';
import { TEAR_PTS, TEAR_W, TEAR_WSUM, TEAR_Y, VH, VW, ptsStr as pts, type Pt } from './packGeometry';

/*
 * 도토리 증강팩의 뜯는 띠 — 스티커처럼 접히며 뜯긴다(reference/card-pack-opening 4 · 7장의 방식).
 *
 *   잡은 모서리 G가 포인터 P에 닿도록 종이를 한 번 접는다고 본다 → 접는 선은 선분 GP의 수직이등분선.
 *   그 선의 G쪽(넘어가는 쪽)을 선에 대해 거울 반사해 그리면 접혀 넘어간 뒷면이 된다. 반사는 matrix() 하나다.
 *   남는 쪽 · 넘어가는 쪽 모두 "뜯는 선 위의 띠"(stripC)로 잘라, 포인터를 아래로 끌어도 몸통은 접히지 않는다.
 *
 * ⚠️ 반사 transform은 바깥 <g>(flp)에, clip-path는 안쪽에 둔다 — 그래야 클립이 원래 좌표에서 계산된 뒤 통째로 뒤집힌다.
 * ⚠️ 매 프레임 React 상태를 바꾸지 않는다 — PackOpener의 rAF가 render()로 속성만 고쳐 쓴다.
 * 좌표는 팩 그림과 같은 200 × 310(PackArt). 띠 위로 넘어간 뒷면이 팩 밖으로 나가므로 svg는 overflow: visible이다.
 */

/** 뜯는 선 위의 띠 — 뜯는 선은 packGeometry의 TEAR_PTS(스타디움 단면 곡선) 하나를 몸통 · 입구와 나눠 쓴다 */
const STRIP_PTS: Pt[] = [[0, 0], [VW, 0], ...TEAR_PTS.slice().reverse()];
const BIG: Pt[] = [[-2000, -2000], [2200, -2000], [2200, 2300], [-2000, 2300]];
/** 잡을 수 있는 모서리 — 띠의 왼쪽 위 · 오른쪽 위 */
export const CORNERS: [Pt, Pt] = [[0, 0], [VW, 0]];
/** 띠의 가운데 — 모서리에서 "안쪽"을 정한다 */
const STRIP_C: Pt = [VW / 2, TEAR_Y / 2];

const f = (n: number) => Math.round(n * 100) / 100;

export function inward(C: Pt): Pt {
  const v: Pt = [STRIP_C[0] - C[0], STRIP_C[1] - C[1]];
  const l = Math.hypot(v[0], v[1]);
  return [v[0] / l, v[1] / l];
}
/** 대기 중 살짝 들린 모서리 · 가리킬 때 더 들린 모서리 */
export const restPt = (C: Pt): Pt => { const u = inward(C); return [C[0] + u[0] * 9, C[1] + u[1] * 9]; };
export const hoverPt = (C: Pt): Pt => { const u = inward(C); return [C[0] + u[0] * 19, C[1] + u[1] * 19]; };
/** 모서리 바깥쪽으로는 접히지 않는다 */
export function constrain(C: Pt, q: Pt): Pt {
  const u = inward(C);
  return (q[0] - C[0]) * u[0] + (q[1] - C[1]) * u[1] > 0 ? q : [C[0], C[1]];
}

/** 반평면 잘라내기(Sutherland–Hodgman) — 큰 사각형을 직선(M, n)으로 잘라 s쪽만 남긴다 */
function halfPlane(M: Pt, n: Pt, s: 1 | -1): string {
  const o: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const a = BIG[i];
    const b = BIG[(i + 1) % 4];
    const da = s * ((a[0] - M[0]) * n[0] + (a[1] - M[1]) * n[1]);
    const db = s * ((b[0] - M[0]) * n[0] + (b[1] - M[1]) * n[1]);
    if (da >= 0) o.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      o.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return pts(o);
}

/** 접는 선을 띠 전체 바깥으로 밀어낼 목표점 — 띠가 통째로 넘어간다(놓아서 끝까지 뜯을 때) */
export function finishTarget(G: Pt, P: Pt): Pt {
  const dx = P[0] - G[0];
  const dy = P[1] - G[1];
  const l = Math.hypot(dx, dy);
  const n = l > 1 ? [dx / l, dy / l] : inward(G);
  const maxS = Math.max(...STRIP_PTS.map(p => p[0] * n[0] + p[1] * n[1]));
  const d = maxS + 12 - (G[0] * n[0] + G[1] * n[1]);
  return [G[0] + n[0] * 2 * d, G[1] + n[1] * 2 * d];
}

export interface FoldApi {
  /** 접어서 그린다 — 돌려주는 값은 뜯는 선 중 넘어간 비율(0~1) */
  render: (G: Pt, P: Pt) => number;
}

export function FoldStrip({ apiRef }: { apiRef: Ref<FoldApi> }) {
  const id = useId();
  const baseRef = useRef<SVGPolygonElement>(null);
  const flapRef = useRef<SVGPolygonElement>(null);
  const flpRef = useRef<SVGGElement>(null);
  const fshRef = useRef<SVGGElement>(null);
  const shadowRef = useRef<SVGGElement>(null);
  const foldRRef = useRef<SVGRectElement>(null);
  const curlRef = useRef<SVGLinearGradientElement>(null);
  const foldGRef = useRef<SVGLinearGradientElement>(null);

  useImperativeHandle(apiRef, () => ({
    render(G, P) {
      const base = baseRef.current;
      const flap = flapRef.current;
      const flp = flpRef.current;
      if (!base || !flap || !flp) return 0;
      const dx = P[0] - G[0];
      const dy = P[1] - G[1];
      const len = Math.hypot(dx, dy);
      const folded = [flp, shadowRef.current, foldRRef.current];
      if (len < 0.5) {
        base.setAttribute('points', pts(BIG));
        flap.setAttribute('points', '0,0');
        folded.forEach(e => e?.setAttribute('visibility', 'hidden'));
        return 0;
      }
      folded.forEach(e => e?.setAttribute('visibility', 'visible'));
      const n: Pt = [dx / len, dy / len];
      const M: Pt = [(G[0] + P[0]) / 2, (G[1] + P[1]) / 2];
      const k = M[0] * n[0] + M[1] * n[1];
      base.setAttribute('points', halfPlane(M, n, 1));
      flap.setAttribute('points', halfPlane(M, n, -1));
      const m = `matrix(${f(1 - 2 * n[0] * n[0])} ${f(-2 * n[0] * n[1])} ${f(-2 * n[0] * n[1])} ${f(1 - 2 * n[1] * n[1])} ${f(2 * k * n[0])} ${f(2 * k * n[1])})`;
      flp.setAttribute('transform', m);
      // 들린 만큼 멀어지는 그림자
      const off = Math.min(10, len * 0.07);
      fshRef.current?.setAttribute('transform', `translate(${f(off * 0.3)} ${f(off)}) ${m}`);
      // 뒷면의 접힘 음영 — 반사 그룹 안의 좌표라 M(접는 선, 제자리) → G(반사되면 P) 방향으로 둔다
      const cg = curlRef.current;
      if (cg) { cg.setAttribute('x1', `${f(M[0])}`); cg.setAttribute('y1', `${f(M[1])}`); cg.setAttribute('x2', `${f(G[0])}`); cg.setAttribute('y2', `${f(G[1])}`); }
      // 남은 띠 쪽 — 접힌 선에서 18 동안 짙어졌다 사라지는 그늘
      const fg = foldGRef.current;
      if (fg) { fg.setAttribute('x1', `${f(M[0])}`); fg.setAttribute('y1', `${f(M[1])}`); fg.setAttribute('x2', `${f(M[0] + n[0] * 18)}`); fg.setAttribute('y2', `${f(M[1] + n[1] * 18)}`); }
      // 뜯긴 비율 — 뜯는 선의 점 중 넘어간 쪽(G쪽)에 있는 것
      let c = 0;
      TEAR_PTS.forEach((p, i) => { if ((p[0] - M[0]) * n[0] + (p[1] - M[1]) * n[1] < 0) c += TEAR_W[i]; });
      return c / TEAR_WSUM;
    },
  }), []);

  const u = (s: string) => `url(#${id}${s})`;
  const stripPts = pts(STRIP_PTS);
  const tearLine = pts(TEAR_PTS);
  return (
    <svg className="pk-strip-svg" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <clipPath id={`${id}strip`}><polygon points={stripPts} /></clipPath>
        <clipPath id={`${id}base`}><polygon ref={baseRef} points={pts(BIG)} /></clipPath>
        <clipPath id={`${id}flap`}><polygon ref={flapRef} points="0,0" /></clipPath>
        {/* 포일 안쪽 — 은빛 금속 띠 + 가는 결 */}
        <linearGradient id={`${id}back`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={VW} y2="0">
          <stop offset="0" stopColor="#aeb6c6" />
          <stop offset=".14" stopColor="#e9edf4" />
          <stop offset=".36" stopColor="#c3cad7" />
          <stop offset=".58" stopColor="#f4f6fa" />
          <stop offset=".8" stopColor="#c8cfdb" />
          <stop offset="1" stopColor="#a4adbf" />
        </linearGradient>
        <pattern id={`${id}brushed`} width="19" height="8" patternUnits="userSpaceOnUse">
          <rect x="2" width="1" height="8" fill="#fff" fillOpacity=".35" />
          <rect x="6" width="1.6" height="8" fill="#5a6278" fillOpacity=".08" />
          <rect x="10" width="1" height="8" fill="#fff" fillOpacity=".22" />
          <rect x="15" width="1.3" height="8" fill="#5a6278" fillOpacity=".1" />
        </pattern>
        <pattern id={`${id}crimp`} width="5" height="16" patternUnits="userSpaceOnUse">
          <rect width="2.5" height="16" fill="#fff" fillOpacity=".5" />
          <rect x="2.5" width="2.5" height="16" fill="#5a6278" fillOpacity=".16" />
        </pattern>
        <linearGradient id={`${id}edge`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={VW} y2="0">
          <stop offset="0" stopColor="#1a1530" stopOpacity=".5" />
          <stop offset=".07" stopColor="#1a1530" stopOpacity=".18" />
          <stop offset=".15" stopColor="#1a1530" stopOpacity="0" />
          <stop offset=".85" stopColor="#1a1530" stopOpacity="0" />
          <stop offset=".93" stopColor="#1a1530" stopOpacity=".18" />
          <stop offset="1" stopColor="#1a1530" stopOpacity=".5" />
        </linearGradient>
        {/* 접힌 선: 주름 그늘 → 조금 떨어져 말림 하이라이트 → 끝으로 갈수록 살짝 어둡게 */}
        <linearGradient ref={curlRef} id={`${id}curl`} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1a1530" stopOpacity=".55" />
          <stop offset=".045" stopColor="#1a1530" stopOpacity=".12" />
          <stop offset=".1" stopColor="#fff" stopOpacity=".7" />
          <stop offset=".2" stopColor="#fff" stopOpacity=".12" />
          <stop offset=".32" stopColor="#fff" stopOpacity="0" />
          <stop offset=".75" stopColor="#1a1530" stopOpacity="0" />
          <stop offset="1" stopColor="#1a1530" stopOpacity=".22" />
        </linearGradient>
        <linearGradient ref={foldGRef} id={`${id}foldG`} gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2a1206" stopOpacity=".38" />
          <stop offset="1" stopColor="#2a1206" stopOpacity="0" />
        </linearGradient>
        <filter id={`${id}blur`} x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4" /></filter>
      </defs>

      {/* 몸통 쪽 뜯긴 자리 — 넘어간 만큼만 흰 절단면 */}
      <g clipPath={u('flap')}>
        <polyline points={pts(TEAR_PTS.map(p => [p[0], p[1] + 2] as Pt))} fill="none" stroke="#2a1206" strokeOpacity=".35" strokeWidth="1.6" strokeLinejoin="round" />
        <polyline points={tearLine} fill="none" stroke="#fff7e0" strokeOpacity=".9" strokeWidth="1.5" strokeLinejoin="round" />
      </g>
      {/* 남아 있는 띠 */}
      <g clipPath={u('base')}>
        <g clipPath={u('strip')}>
          <PackArtBody />
          <rect ref={foldRRef} x="0" y="-10" width={VW} height="80" fill={u('foldG')} visibility="hidden" />
        </g>
      </g>
      {/* 접힌 띠가 드리운 그림자 */}
      <g ref={shadowRef} filter={u('blur')} opacity=".38" visibility="hidden">
        <g ref={fshRef}>
          <g clipPath={u('flap')}>
            <g clipPath={u('strip')}>
              <rect x="0" y="-10" width={VW} height="80" fill="#140700" />
            </g>
          </g>
        </g>
      </g>
      {/* 접혀 넘어간 뒷면(포일 안쪽) */}
      <g ref={flpRef} visibility="hidden">
        <g clipPath={u('flap')}>
          <g clipPath={u('strip')}>
            <rect x="0" y="-10" width={VW} height="80" fill={u('back')} />
            <rect x="0" y="-10" width={VW} height="80" fill={u('brushed')} />
            <rect x="0" y="0" width={VW} height="16" fill={u('crimp')} />
            <path d={`M0 16.5H${VW}`} stroke="#5a6278" strokeOpacity=".35" strokeWidth="1.2" />
            <rect x="0" y="-10" width={VW} height="80" fill={u('edge')} />
            <rect x="0" y="-10" width={VW} height="80" fill={u('curl')} />
            <polyline points={tearLine} fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="1.3" strokeLinejoin="round" />
          </g>
        </g>
      </g>
    </svg>
  );
}
