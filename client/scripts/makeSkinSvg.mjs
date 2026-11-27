// 강화전 겉모양(styles/19-enhance-skin.css)의 버튼 · 입력칸 · 자리 버튼 그림(SVG)을 만든다.
//   cd client && node scripts/makeSkinSvg.mjs        → public/ui/skin/*.svg
//
// ── 왜 SVG인가(2026-11-27) ─────────────────────────────────────────────────────────────────────
// CSS로 그리던 때(border-radius + em 두께)는 바깥 곡선만 높이에 비례하고 안쪽 층(주황 판 · 밝은 선 · 그림자)은
// "바깥 반지름 − 테 두께"로 브라우저가 따로 계산했다. 테 두께(em)와 높이(rem + px)의 비가 버튼마다 달라
// 주황 판의 곡선이 2~3px로 줄어 사각형이 되는 등, 크기가 바뀔 때마다 모양이 뭉그러졌다.
// 여기서는 **모든 층을 한 좌표계(높이 = 100)에서** 그린다 — 화면에서는 그림째로 늘고 줄 뿐이라 비율이 바뀌지 않는다.
//
// ── 글자 버튼 · 입력칸 · 두 갈래 토글: 왼쪽 끝 · 가운데 띠 · 오른쪽 끝 세 장 ────────────────────────
//   끝(l · r): viewBox 높이 100, 폭 CAP. CSS가 `auto 100%`로 깔아 **높이에 맞춰 비율 그대로** 키운다(폭 = CAP% × 높이).
//   가운데(m): 곧은 가로줄만 있는 띠. `100% 100%`로 늘리므로 preserveAspectRatio="none" — 가로로만 늘어 모양이 안 변한다.
//   바깥 윤곽은 CSS의 border-radius(320px / 1000px — 언제나 가로 0.16H · 세로 0.5H)가 자른다 — 여기 바깥 곡선과 같은 타원이다.
//   층 t(위에서 t만큼 들어간 선)는 바깥과 **같은 비율**(가로/세로 0.32)의 반 타원이고, 옆으로도 t만큼 들어간다
//   (중심 x = t + 0.32·(50 − t)). 그래서 테 두께가 위 · 옆 모두 t로 같다.
//
// ── 자리 버튼(팀 1 · 팀 2 · 관전자 · 무작위): 300 × 191 한 장 ────────────────────────────────────
//   버튼이 그 비율로 고정이라(aspect-ratio) 그림 한 장을 100% 100%로 깐다. 판 · 테 / 밝은 선 · 그림자(캐릭터 위) /
//   캐릭터를 가두는 모양(mask) 세 겹이다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ui', 'skin');
fs.mkdirSync(OUT, { recursive: true });

const f = n => +n.toFixed(2);
const write = (name, svg) => fs.writeFileSync(path.join(OUT, name), svg.replace(/\n\s*/g, '') + '\n');

// ═══ 글자 버튼 계열 ═══════════════════════════════════════════════════════════════════════════
const H = 100;
const RATIO = 0.32;          // 바깥 곡선 가로/세로(= CSS --sk-radius 320/1000) — 바꾸면 CSS도 함께
const CAP = 36;              // 끝 그림의 폭(높이의 36%) — 가장 안쪽 층의 곡선이 끝나는 곳보다 넓어야 한다

/** 층 t의 왼쪽 모양 — 반 타원 + 오른쪽으로 끝까지 뻗는 곧은 띠(그림 밖은 잘린다) */
function capShape(t) {
  const ry = 50 - t;
  const rx = RATIO * ry;
  const cx = t + rx;
  return `M${CAP + 5} ${f(t)}H${f(cx)}A${f(rx)} ${f(ry)} 0 0 0 ${f(cx)} ${f(H - t)}H${CAP + 5}Z`;
}
/** 가운데 띠의 층 t — 곧은 사각형 */
const bandShape = t => `M-1 ${f(t)}H11V${f(H - t)}H-1Z`;
/** 테(바깥 t0 · 안쪽 t1)를 한 경로로 — evenodd */
const ring = (shape, t0, t1) => shape(t0) + shape(t1);

/** 바깥 테 왼쪽 가장자리의 x(높이 y에서) — 홈을 테에 얹을 때 */
function outerX(y) {
  const ry = 50, rx = RATIO * ry;
  const dy = (y - 50) / ry;
  return rx - rx * Math.sqrt(Math.max(0, 1 - dy * dy));
}

/**
 * 한 벌(끝 둘 + 가운데)을 만든다.
 * layers: 바깥에서 안쪽으로 { t, t2?, fill } — t2가 있으면 테(고리), 없으면 t부터 안쪽 전체
 */
function textSkin(prefix, { layers, gradients, notch }) {
  const defs = `<defs>${gradients}</defs>`;
  const paint = shape => layers.map(l => l.t2 === undefined
    ? `<path d="${shape(l.t)}" fill="${l.fill}"/>`
    : `<path d="${ring(shape, l.t, l.t2)}" fill="${l.fill}" fill-rule="evenodd"/>`).join('');
  const notches = notch
    ? [26, 74].map(y => {
      const x = outerX(y);
      return `<path d="M${f(x - 1)} ${f(y - notch.h)}L${f(x + notch.w)} ${y}L${f(x - 1)} ${f(y + notch.h)}Z" fill="${notch.fill}"/>`;
    }).join('')
    : '';
  const left = paint(capShape) + notches;
  write(`${prefix}_l.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CAP} ${H}">${defs}${left}</svg>`);
  write(`${prefix}_r.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CAP} ${H}">${defs}<g transform="translate(${CAP} 0) scale(-1 1)">${left}</g></svg>`);
  write(`${prefix}_m.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 ${H}" preserveAspectRatio="none">${defs}${paint(bandShape)}</svg>`);
}

// 그라데이션은 userSpaceOnUse(높이 0~100)라 끝 그림과 가운데 띠에서 같은 높이에 같은 색이 나온다 — 이음매가 없다
const lin = (id, stops) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${H}">${
    stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;

const WOOD = lin('w', [[0.03, '#e8a86e'], [0.1, '#c47c42'], [0.5, '#af6832'], [0.88, '#7c3f17'], [0.97, '#55260a']]);
const FACE_ORANGE = lin('o', [[0.15, '#fac577'], [0.55, '#f6b466'], [0.85, '#f2a254']]);

/** 음각 그림자 — 밝은 선 안쪽으로 짙게 시작해 옅어지는 고리 넷(흐림 필터 대신: 늘려도 번짐이 그대로다) */
const shade = (from, color, alphas) => {
  const steps = [1.6, 1.6, 2, 2.6];
  let t = from;
  return alphas.map((a, i) => { const l = { t, t2: t + steps[i], fill: `rgba(${color},${a})` }; t += steps[i]; return l; });
};

// 나무 팻말 · 나무틀 버튼 · 주사위 — 주황 판
textSkin('btn', {
  gradients: WOOD + FACE_ORANGE,
  layers: [
    { t: 0, fill: '#451700' },            // 바깥 짙은 선
    { t: 3.2, fill: 'url(#w)' },          // 나무 테
    { t: 13, fill: '#5a2709' },           // 테 안쪽 짙은 선
    { t: 15, fill: 'url(#o)' },           // 주황 판
    { t: 17, t2: 19.2, fill: 'rgba(255,248,200,0.85)' }, // 밝은 선
    ...shade(19.2, '150,62,12', [0.3, 0.19, 0.11, 0.05]),
  ],
  notch: { w: 8, h: 6.5, fill: '#451700' },
});

// 입력칸 · 선택 상자 — 크림 판
textSkin('inp', {
  gradients: WOOD,
  layers: [
    { t: 0, fill: '#451700' },
    { t: 3.2, fill: 'url(#w)' },
    { t: 12.5, fill: '#5a2c10' },
    { t: 14.5, fill: '#f3e2ca' },
    { t: 16.5, t2: 18.5, fill: 'rgba(251,244,230,0.95)' },
    ...shade(18.5, '140,84,38', [0.22, 0.14, 0.08, 0.035]),
  ],
  notch: { w: 7, h: 6, fill: '#451700' },
});

// 두 갈래 토글 — 나무 테 없이 가는 갈색 테두리. 고른 쪽 주황(on) · 안 고른 쪽 크림(off)
textSkin('chip_on', {
  gradients: FACE_ORANGE,
  layers: [
    { t: 0, fill: '#451700' },
    { t: 4.5, fill: '#af6832' },
    { t: 10, fill: 'url(#o)' },
    { t: 12, t2: 14.5, fill: 'rgba(255,246,200,0.8)' },
    ...shade(14.5, '150,62,12', [0.3, 0.19, 0.1, 0.04]),
  ],
});
textSkin('chip_off', {
  gradients: '',
  layers: [
    { t: 0, fill: '#451700' },
    { t: 4.5, fill: '#7c3f17' },
    { t: 10, fill: '#f3e2ca' },
    ...shade(10, '140,84,38', [0.22, 0.14, 0.08, 0.035]),
  ],
});

// ═══ 자리 버튼 ═══════════════════════════════════════════════════════════════════════════════
const SW = 300, SH = 191;
const SRX = 27, SRY = 84;   // 바깥 모서리(= CSS border-radius 9% / 44%)

/** 안으로 (tx, ty) 들인 둥근 사각형 — 모서리는 바깥과 같은 가로/세로 비율 */
function seatShape(tx, ty, ox = 0, oy = 0) {
  const ry = SRY - ty, rx = SRX * ry / SRY;
  const x0 = tx - ox, y0 = ty - oy, x1 = SW - tx - ox, y1 = SH - ty - oy;
  return `M${f(x0 + rx)} ${f(y0)}H${f(x1 - rx)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x1)} ${f(y0 + ry)}V${f(y1 - ry)}` +
    `A${f(rx)} ${f(ry)} 0 0 1 ${f(x1 - rx)} ${f(y1)}H${f(x0 + rx)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x0)} ${f(y1 - ry)}` +
    `V${f(y0 + ry)}A${f(rx)} ${f(ry)} 0 0 1 ${f(x0 + rx)} ${f(y0)}Z`;
}
const seatLin = (id, stops) =>
  `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${SH}">${
    stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;

// 판의 안쪽 가장자리(밝은 선 · 캐릭터 경계)는 판(face)에서 이만큼 들어간다 — 예전 CSS의 cqw × 3
const FACE_TX = 16.5, FACE_TY = 13.37;  // 판: 위아래 7% · 옆 5.5%
const LINE_IN = 2.7, LINE_W = 2.1;      // 밝은 선: 판에서 0.9cqw 들어가 0.7cqw 두께
const CLIP_IN = 4.8;                     // 캐릭터 가두기: 판에서 1.6cqw

function seatNotches(fill) {
  return [0.27, 0.73].map(p => {
    const y = SH * p;
    const dy = (SRY - y) / SRY;
    const x = y < SRY ? SRX - SRX * Math.sqrt(Math.max(0, 1 - dy * dy)) : (y > SH - SRY ? SRX - SRX * Math.sqrt(Math.max(0, 1 - ((y - (SH - SRY)) / SRY) ** 2)) : 0);
    const l = `M${f(x - 1)} ${f(y - 7.5)}L${f(x + 7.5)} ${f(y)}L${f(x - 1)} ${f(y + 7.5)}Z`;
    const r = `M${f(SW - x + 1)} ${f(y - 7.5)}L${f(SW - x - 7.5)} ${f(y)}L${f(SW - x + 1)} ${f(y + 7.5)}Z`;
    return `<path d="${l}" fill="${fill}"/><path d="${r}" fill="${fill}"/>`;
  }).join('');
}

function seatBase(name, { line, rim, inline, face, bolts }) {
  const boltG = bolts
    ? `<radialGradient id="b" cx="0.35" cy="0.35" r="0.75"><stop offset="0" stop-color="#f4f5f6"/><stop offset="0.3" stop-color="#f4f5f6"/><stop offset="0.55" stop-color="#b4b7ba"/><stop offset="0.85" stop-color="#5d6164"/><stop offset="1" stop-color="#3a3d40"/></radialGradient>`
    : '';
  const boltDots = bolts
    ? [[20.6, 21.4], [SW - 20.6, 21.4], [20.6, SH - 21.4], [SW - 20.6, SH - 21.4]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="4.6" fill="url(#b)"/>`).join('')
    : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SW} ${SH}"><defs>${seatLin('r', rim)}${seatLin('f', face)}${boltG}</defs>` +
    `<path d="${seatShape(0, 0)}" fill="${line}"/>` +
    `<path d="${seatShape(3.9, 3.9)}" fill="url(#r)"/>` +
    seatNotches(line) + boltDots +
    `<path d="${seatShape(FACE_TX - 1.5, FACE_TY - 1.5)}" fill="${inline}"/>` +
    `<path d="${seatShape(FACE_TX, FACE_TY)}" fill="url(#f)"/></svg>`;
  write(name, svg);
}

function seatOverlay(name, { bright, shadeRgb }) {
  const t = d => [FACE_TX + d, FACE_TY + d];
  const ringP = (a, b) => `${seatShape(...t(a))}${seatShape(...t(b))}`;
  const steps = [[CLIP_IN, 7, 0.4], [7, 9.5, 0.26], [9.5, 12.5, 0.15], [12.5, 16, 0.07]];
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SW} ${SH}">` +
    steps.map(([a, b, al]) => `<path d="${ringP(a, b)}" fill="rgba(${shadeRgb},${al})" fill-rule="evenodd"/>`).join('') +
    `<path d="${ringP(LINE_IN, LINE_IN + LINE_W)}" fill="${bright}" fill-rule="evenodd"/></svg>`;
  write(name, svg);
}

seatBase('seat_wood.svg', {
  line: '#451700',
  inline: '#5a2709',
  rim: [[0.02, '#e8a86e'], [0.05, '#c47c42'], [0.5, '#af6832'], [0.95, '#7c3f17'], [0.98, '#55260a']],
  face: [[0.1, '#fac577'], [0.55, '#f6b466'], [0.9, '#f2a254']],
});
seatBase('seat_metal.svg', {
  line: '#2b2e31',
  inline: '#45494c',
  rim: [[0.02, '#fbfbfc'], [0.05, '#e4e6e8'], [0.5, '#bdbfc2'], [0.95, '#7b7f83'], [0.98, '#53575a']],
  face: [[0.1, '#d8d8d9'], [0.55, '#cbcbcc'], [0.9, '#b7b7b8']],
  bolts: true,
});
seatOverlay('seat_wood_over.svg', { bright: 'rgba(255,248,200,0.85)', shadeRgb: '150,62,12' });
seatOverlay('seat_metal_over.svg', { bright: 'rgba(250,250,250,0.9)', shadeRgb: '70,74,78' });

// 캐릭터를 가두는 모양 — .skin-seat-clip 상자(판에서 CLIP_IN 들어간 곳) 자신의 좌표로
{
  const [tx, ty] = [FACE_TX + CLIP_IN, FACE_TY + CLIP_IN];
  const w = SW - 2 * tx, h = SH - 2 * ty;
  write('seat_clip.svg',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(w)} ${f(h)}" preserveAspectRatio="none"><path d="${seatShape(tx, ty, tx, ty)}" fill="#000"/></svg>`);
}

console.log('public/ui/skin/ —', fs.readdirSync(OUT).join(' '));
