/*
 * 도토리 증강팩의 모양 — reference/card-pack-opening 5 · 6장("스타디움 단면", "단면 기반 입체 음영")을 이 팩의 좌표로 옮겼다.
 *
 * 팩 그림은 200 × 310(PackArt). 원본 데모의 팩은 폭 240이라 길이는 모두 S(= 200/240)배다.
 * 위에서 본 단면이 스타디움(가운데 평평 + 양끝 반원)이라, 살짝 내려다보면 뜯는 선(앞 입술)이 가운데에서 E만큼 처지고
 * 양끝 반원 구간에서만 올라간다. 몸통 아래 경계도 같은 곡선이라 앞면이 봉합부 위로 살짝 튀어나와 보인다.
 *
 * ⚠️ 시점 값은 원본 데모의 **기본값**이다(시점 5 · 입구 50 → VIEW .05 · OPEN_MAX .5, 내려다보는 각도 약 5°).
 *    입구 속을 더 보여 주고 싶으면 시점은 두고 OPEN_MAX만 .7 ~ .9로 올린다(원본 문서의 권고).
 * 뜯는 선 · 띠의 클립 · 몸통의 클립 · 입구가 모두 TEAR_PTS 하나에서 나온다 — 따로 만들면 이음매가 벌어진다.
 */

export type Pt = [number, number];
export const VW = 200;
export const VH = 310;
const S = VW / 240;

/** 시점 각도(0~1) · 카드가 나올 때 입구가 벌어지는 정도(1 = 실제 두께만큼) — 원본 기본값 */
export const VIEW = 0.05;
export const OPEN_MAX = 0.5;
/** 화면에서 절단선이 처지는 양 */
export const E = (2 + VIEW * 20) * S;

/** 뜯는 선의 높이 · 아래 봉합부가 시작하는 높이 */
export const TEAR_Y = 50;
export const BOTTOM_Y = 294;

/** 단면 — 양끝 반원 반지름 · 가운데 평평한 구간의 절반 */
export const SIDE_R = 35 * S;
export const FLAT_HALF = 85 * S;
const MID = VW / 2;

/** 단면 프로파일 — 가운데 1, 반원 구간에서 원호로 0까지 */
export function prof(x: number): number {
  const d = Math.abs(x - MID);
  if (d <= FLAT_HALF) return 1;
  const s = Math.min(1, (d - FLAT_HALF) / SIDE_R);
  return Math.sqrt(Math.max(0, 1 - s * s));
}

/** 반원 구간은 촘촘하게, 평평한 구간은 성기게 */
export const XS: number[] = (() => {
  const a: number[] = [];
  const left = MID - FLAT_HALF;
  const right = MID + FLAT_HALF;
  for (let x = 0; x < left; x += 2) a.push(x);
  for (let x = left; x < right; x += 14) a.push(x);
  for (let x = right; x <= VW + 0.01; x += 2) a.push(Math.min(VW, x));
  if (a[a.length - 1] !== VW) a.push(VW);
  return a;
})();
/** 진행도 가중치 — 점 사이 간격이 달라 x 길이로 센다 */
export const TEAR_W: number[] = XS.map((x, i) => ((XS[i + 1] ?? x) - (XS[i - 1] ?? x)) / 2);
export const TEAR_WSUM = TEAR_W.reduce((a, b) => a + b, 0);

/** 앞 입술 = 뜯는 선 */
export const TEAR_PTS: Pt[] = XS.map(x => [x, TEAR_Y + E * prof(x)]);
/** 몸통 아래 경계(앞면이 봉합부 위로 튀어나온 곡선) */
export const BOTTOM_PTS: Pt[] = XS.map(x => [x, BOTTOM_Y + E * prof(x)]);

const fx = (n: number) => Math.round(n * 100) / 100;
export const ptsStr = (a: Pt[]) => a.map(p => `${fx(p[0])},${fx(p[1])}`).join(' ');
export const pathStr = (a: Pt[]) => 'M' + ptsStr(a).replace(/ /g, 'L');

/** 입구 — 앞 입술과 뒤 입술(TEAR_Y − E·prof·o) 사이. o = 벌어짐 */
export function mouthPath(o: number): string {
  if (o < 0.01) return '';
  const back: Pt[] = XS.map(x => [x, TEAR_Y - E * prof(x) * o]);
  return `${pathStr(back)}L${ptsStr(TEAR_PTS.slice().reverse()).replace(/ /g, 'L')}Z`;
}
export function backLipPts(o: number): string {
  return o < 0.01 ? '' : ptsStr(XS.map(x => [x, TEAR_Y - E * prof(x) * o] as Pt));
}

// ─── 단면 기반 음영(원본 6장) — x마다 표면 법선으로 조명을 계산해 그라데이션 정지점을 만든다 ───────────
/** 정지점의 x — 반원 구간마다 18개 + 가운데 */
export const SHADE_X: number[] = (() => {
  const a = [0];
  for (let i = 1; i <= 18; i++) a.push((SIDE_R * i) / 18);
  a.push(MID);
  for (let i = 0; i <= 18; i++) a.push(VW - SIDE_R + (SIDE_R * i) / 18);
  return a;
})();
function normalAt(x: number): [number, number] {
  if (x < SIDE_R) { const s = Math.min(1, (SIDE_R - x) / SIDE_R); return [-s, Math.sqrt(1 - s * s)]; }
  if (x > VW - SIDE_R) { const s = Math.min(1, (x - (VW - SIDE_R)) / SIDE_R); return [s, Math.sqrt(1 - s * s)]; }
  return [0, 1];
}
/**
 * nx(-1~1, 포인터 · 대기 흔들림)에 따라 빛 방향을 살짝 옮긴다 — 빛은 왼쪽 위 앞에서 온다.
 * 돌려주는 것은 정지점마다 [어둠 불투명도, 밝음 불투명도] — PackOpener가 CSS 변수(--sd{i} · --sl{i})로 넘긴다.
 */
export function shadeStops(nx: number): [number, number][] {
  let L = [-0.42 + nx * 0.55, -0.32, 0.85];
  const ll = Math.hypot(L[0], L[1], L[2]);
  L = L.map(v => v / ll);
  let H = [L[0], L[1], L[2] + 1];
  const hl = Math.hypot(H[0], H[1], H[2]);
  H = H.map(v => v / hl);
  const amb = 0.3;
  const base = amb + (1 - amb) * L[2];
  return SHADE_X.map(x => {
    const n = normalAt(x);
    const dif = Math.max(0, n[0] * L[0] + n[1] * L[2]);
    const lum = (amb + (1 - amb) * dif) / base;
    const spec = Math.pow(Math.max(0, n[0] * H[0] + n[1] * H[2]), 46) * 0.62;
    return [Math.min(0.82, Math.max(0, 1 - lum) * 0.95), Math.min(0.85, Math.max(0, lum - 1) * 1.1 + spec)];
  });
}
