'use client';

import { useId, useImperativeHandle, useRef, type Ref } from 'react';
import { PLAY_ASSETS } from '@/lib/playAssets';
import {
  BOTTOM_PTS, BOTTOM_Y, E, SHADE_X, TEAR_PTS, TEAR_Y, VH, VW, backLipPts, mouthPath, pathStr, ptsStr, shadeStops, type Pt,
} from './packGeometry';

/** 도토리 반도체 — 다리가 달린 금빛 칩 위에 도토리 */
export function ChipIcon({ className = '' }: { className?: string }) {
  const id = useId();
  const pins = [7, 12, 17];
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset=".45" stopColor="#d9a128" />
          <stop offset="1" stopColor="#8a5a12" />
        </linearGradient>
      </defs>
      {pins.map(p => (
        <g key={p} stroke="#b9801c" strokeWidth="1.6" strokeLinecap="round">
          <path d={`M${p} 1.8v2.6M${p} 19.6v2.6M1.8 ${p}h2.6M19.6 ${p}h2.6`} />
        </g>
      ))}
      <rect x="4.2" y="4.2" width="15.6" height="15.6" rx="2.6" fill={`url(#${id}b)`} stroke="#6b3f18" strokeWidth="1" />
      <rect x="6.6" y="6.6" width="10.8" height="10.8" rx="1.4" fill="#3a1f0c" opacity=".85" />
      {/* 도토리 — 모자 + 몸 */}
      <path d="M12 9.3c-2.1 0-3.2 1-3.2 1.9h6.4c0-.9-1.1-1.9-3.2-1.9Z" fill="#c98652" />
      <path d="M9.2 11.4h5.6c0 2.3-1.3 3.9-2.8 4.4-1.5-.5-2.8-2.1-2.8-4.4Z" fill="#f2c443" />
      <path d="M12 8.2v1.1" stroke="#c98652" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

/** 위 띠 · 상점에서 쓰는 작은 팩 그림 */
export function PackIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5.5 2.5h13l-.6 1.2.6 1.2v15.8l.6 1.2-.6.6h-13l-.6-.6.6-1.2V4.9l-.6-1.2Z" fill="#b9701f" stroke="#5c3313" strokeWidth="1" strokeLinejoin="round" />
      <path d="M5.5 6.2h13" stroke="#fde68a" strokeWidth=".9" strokeDasharray="1.4 1" />
      <circle cx="12" cy="13" r="3.6" fill="#fde68a" opacity=".9" />
      <path d="M12 11.2c-1.3 0-2 .6-2 1.2h4c0-.6-.7-1.2-2-1.2Z M10.2 12.6h3.6c0 1.4-.8 2.4-1.8 2.7-1-.3-1.8-1.3-1.8-2.7Z" fill="#6b3f18" />
    </svg>
  );
}

const FOIL_STOPS: [string, string][] = [['0', '#7a3f14'], ['.28', '#c27a25'], ['.46', '#ffd98a'], ['.6', '#c8842a'], ['.82', '#8a4a17'], ['1', '#4d250b']];
/** 단면 음영의 정면 빛 값 — CSS 변수가 없는 곳(상점)에서 쓴다 */
const SHADE0 = shadeStops(0);
const rev = (a: Pt[]) => ptsStr(a.slice().reverse()).replace(/ /g, 'L');
/** 몸통(위 봉합부 아래 ~ 아래 볼록 곡선) — 단면 음영 · 조임 그늘을 이 안에만 칠한다 */
const BODY_AREA = `M0 16L${VW} 16L${rev(BOTTOM_PTS)}Z`;
/** 앞면이 아래 봉합부 위로 튀어나온 볼록 */
const BULGE = `M0 ${BOTTOM_Y - 10}L${VW} ${BOTTOM_Y - 10}L${rev(BOTTOM_PTS)}Z`;

/**
 * 도토리 증강팩 앞면(200 × 310) — 모양(뜯는 선 · 아래 볼록 · 단면 음영)은 packGeometry가 정한다(원본 데모의 기본 시점).
 * PackOpener는 같은 그림을 몸통(뜯는 선 아래)과 뜯는 띠(FoldStrip, 위) 두 벌로 그려 **같은 곡선**을 따라 잘라 붙인다.
 * 단면 음영의 정지점 불투명도는 CSS 변수(--sd{i} · --sl{i})로 받는다 — 팩 열기에서는 빛이 포인터 · 대기 흔들림을 따라 움직인다.
 */
export function PackArtBody() {
  const id = useId();
  const u = (k: string) => `url(#${id}${k})`;
  const teeth = (y: number, up: boolean) => {
    let d = `M0 ${y}`;
    for (let x = 0; x < VW; x += 10) d += `L${x + 5} ${up ? y - 6 : y + 6}L${x + 10} ${y}`;
    return d;
  };
  const shadeStop = (i: number, which: 'd' | 'l') => (
    <stop
      key={i}
      offset={(SHADE_X[i] / VW).toFixed(4)}
      stopColor={which === 'd' ? '#2a1206' : '#ffffff'}
      style={{ stopOpacity: `var(--s${which}${i}, ${SHADE0[i][which === 'd' ? 0 : 1].toFixed(3)})` }}
    />
  );
  return (
    <>
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="1" y2="1">
          {FOIL_STOPS.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
        </linearGradient>
        <linearGradient id={`${id}foil`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={VW} y2={VH}>
          {FOIL_STOPS.map(([o, c]) => <stop key={o} offset={o} stopColor={c} />)}
        </linearGradient>
        <linearGradient id={`${id}sd`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={VW} y2="0">
          {SHADE_X.map((_, i) => shadeStop(i, 'd'))}
        </linearGradient>
        <linearGradient id={`${id}sl`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={VW} y2="0">
          {SHADE_X.map((_, i) => shadeStop(i, 'l'))}
        </linearGradient>
        <linearGradient id={`${id}pt`} gradientUnits="userSpaceOnUse" x1="0" y1="16" x2="0" y2="50">
          <stop offset="0" stopColor="#2a1206" stopOpacity=".3" />
          <stop offset="1" stopColor="#2a1206" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${id}pb`} gradientUnits="userSpaceOnUse" x1="0" y1={BOTTOM_Y - 28} x2="0" y2={BOTTOM_Y + 3}>
          <stop offset="0" stopColor="#2a1206" stopOpacity="0" />
          <stop offset="1" stopColor="#2a1206" stopOpacity=".32" />
        </linearGradient>
        <radialGradient id={`${id}g`} cx=".5" cy=".5" r=".5">
          <stop offset="0" stopColor="#fff6d6" stopOpacity=".95" />
          <stop offset=".55" stopColor="#ffd36a" stopOpacity=".45" />
          <stop offset="1" stopColor="#ffd36a" stopOpacity="0" />
        </radialGradient>
        <pattern id={`${id}p`} width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <path d="M0 7h14" stroke="#fff" strokeOpacity=".06" strokeWidth="3" />
        </pattern>
        <linearGradient id={`${id}sh`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".5" stopColor="#fff" stopOpacity=".28" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`${id}body`}><path d={BODY_AREA} /></clipPath>
        <filter id={`${id}soft`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.2" /></filter>
        <filter id={`${id}soft2`} x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="1.8" /></filter>
      </defs>
      {/* 몸 — 위 · 아래 끝은 봉합 띠 + 톱니 */}
      <rect x="0" y="4" width={VW} height="302" fill={u('f')} />
      <rect x="0" y="4" width={VW} height="302" fill={u('p')} />
      <rect x="0" y="0" width={VW} height="16" fill="#5c3313" opacity=".55" />
      <rect x="0" y={BOTTOM_Y} width={VW} height="16" fill="#5c3313" opacity=".55" />
      <path d={teeth(0, false)} fill="none" stroke="#2a1709" strokeOpacity=".5" strokeWidth="1.2" />
      <path d={teeth(VH, true)} fill="none" stroke="#2a1709" strokeOpacity=".5" strokeWidth="1.2" />
      {/* 앞면의 볼록 + 그 아래 봉합부에 맺힌 접촉 그림자 */}
      <path d={pathStr(BOTTOM_PTS.map(p => [p[0], p[1] + 1.2] as Pt))} fill="none" stroke="#2a1206" strokeOpacity=".45" strokeWidth="3.4" filter={u('soft2')} />
      <path d={BULGE} fill={u('foil')} />
      {/* 뜯는 선 — 스타디움 곡선(가운데 평평, 양끝 반원 구간에서 올라간다) */}
      <polyline points={ptsStr(TEAR_PTS.filter(p => p[0] >= 8 && p[0] <= VW - 8))} fill="none" stroke="#fff3cf" strokeWidth="1.6" strokeDasharray="5 4" opacity=".85" />
      <path d={`M0 ${TEAR_Y - 5}L7 ${TEAR_Y}L0 ${TEAR_Y + 5}Z M${VW} ${TEAR_Y - 5}L${VW - 7} ${TEAR_Y}L${VW} ${TEAR_Y + 5}Z`} fill="#2a1709" opacity=".8" />
      <text x="100" y="34" textAnchor="middle" fontSize="13" fontWeight="900" fill="#fff3cf" opacity=".9" style={{ fontFamily: 'inherit', letterSpacing: '0.18em' }}>
        TUPD · ACORN
      </text>
      {/* 가운데 도토리 */}
      <circle cx="100" cy="150" r="62" fill={u('g')} />
      <circle cx="100" cy="150" r="44" fill="#3a1f0c" opacity=".55" stroke="#ffe7a3" strokeWidth="2.4" />
      <image href={PLAY_ASSETS.iconAcorn} x="70" y="114" width="60" height="72" preserveAspectRatio="xMidYMid meet" />
      <text x="100" y="236" textAnchor="middle" fontSize="27" fontWeight="900" fill="#fff8e6" stroke="#4d250b" strokeWidth="5" paintOrder="stroke" style={{ fontFamily: 'inherit' }}>
        도토리 증강팩
      </text>
      <text x="100" y="262" textAnchor="middle" fontSize="13" fontWeight="700" fill="#fde68a" style={{ fontFamily: 'inherit' }}>
        증강 카드 5장
      </text>
      {/* 단면 기반 입체 음영 · 위아래 조임 그늘 · 봉합부 근처 주름(원본 데모 좌표를 그대로 줄여 얹는다) */}
      <g clipPath={u('body')}>
        <rect x="0" y="16" width={VW} height={VH - 16} fill={u('sd')} />
        <rect x="0" y="16" width={VW} height={VH - 16} fill={u('sl')} />
        <rect x="0" y="16" width={VW} height="34" fill={u('pt')} />
        <rect x="0" y={BOTTOM_Y - 28} width={VW} height="34" fill={u('pb')} />
        <g filter={u('soft')} fill="none" strokeLinecap="round" transform={`scale(${VW / 240}) translate(-220 -132)`}>
          <path d="M228 150Q238 166 236 196M246 148Q252 160 258 172M452 150Q442 168 446 200M434 148Q429 158 422 168" stroke="#fff" strokeOpacity=".28" strokeWidth="2.2" />
          <path d="M231 152Q241 168 239 198M449 152Q439 170 443 202" stroke="#2a1206" strokeOpacity=".2" strokeWidth="2" />
          <path d="M230 480Q239 464 237 440M450 480Q441 464 444 438" stroke="#fff" strokeOpacity=".24" strokeWidth="2.2" />
        </g>
      </g>
      {/* 포일 광택 — CSS가 --tx(빛 방향)를 따라 옮긴다 */}
      {/* 원본 데모처럼 가장자리가 부드럽게 사라지는 띠(가운데만 흰빛 .28) — 각진 막대는 작은 팩에서 통째로 바래 보였다 */}
      <rect className="pack-sheen" x="-90" y="0" width="80" height={VH} fill={u('sh')} transform="skewX(-18)" style={{ mixBlendMode: 'screen' }} />
    </>
  );
}

export function PackArt({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" aria-hidden="true">
      <PackArtBody />
    </svg>
  );
}

/**
 * 뜯긴 입구 — 앞 입술(뜯는 선)과 뒤 입술 사이로 보이는 포일 안쪽(은빛 → 어둠). 팩 뒤판 층(z 1)이라 카드가 이 위 · 몸통 아래로 올라온다.
 * o(벌어짐)는 PackOpener가 매 프레임 apiRef로 고쳐 쓴다 — 떨어지는 팩처럼 고정된 곳은 prop o로 그린다.
 */
export interface MouthApi { render: (o: number) => void }
export function PackMouth({ o = 0, apiRef }: { o?: number; apiRef?: Ref<MouthApi> }) {
  const id = useId();
  const mouthRef = useRef<SVGPathElement>(null);
  const sideRef = useRef<SVGPathElement>(null);
  const lipRef = useRef<SVGPolylineElement>(null);
  const gradRef = useRef<SVGLinearGradientElement>(null);
  useImperativeHandle(apiRef, () => ({
    render(v: number) {
      const d = mouthPath(v);
      mouthRef.current?.setAttribute('d', d);
      sideRef.current?.setAttribute('d', d);
      lipRef.current?.setAttribute('points', backLipPts(v));
      gradRef.current?.setAttribute('y1', `${TEAR_Y - E * v}`);
    },
  }), []);
  return (
    <svg className="pk-mouth" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient ref={gradRef} id={`${id}in`} gradientUnits="userSpaceOnUse" x1="0" y1={TEAR_Y - E * o} x2="0" y2={TEAR_Y + E}>
          <stop offset="0" stopColor="#eef1f7" />
          <stop offset=".35" stopColor="#b9bfd0" />
          <stop offset=".75" stopColor="#6b4a2a" />
          <stop offset="1" stopColor="#2a1406" />
        </linearGradient>
        <linearGradient id={`${id}side`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={VW} y2="0">
          <stop offset="0" stopColor="#2a1206" stopOpacity=".65" />
          <stop offset=".16" stopColor="#2a1206" stopOpacity="0" />
          <stop offset=".84" stopColor="#2a1206" stopOpacity="0" />
          <stop offset="1" stopColor="#2a1206" stopOpacity=".65" />
        </linearGradient>
      </defs>
      <path ref={mouthRef} d={mouthPath(o)} fill={`url(#${id}in)`} />
      <path ref={sideRef} d={mouthPath(o)} fill={`url(#${id}side)`} />
      <polyline ref={lipRef} points={backLipPts(o)} fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}
