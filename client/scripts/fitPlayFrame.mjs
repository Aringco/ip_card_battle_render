// 플레이 화면 통짜 액자(play_frame.webp)를 **새 그림으로 갈되 칸 자리는 예전 그대로** 맞춘다(2026-10-30).
//
//   cd client && node scripts/fitPlayFrame.mjs
//
// 입력  assets-src/play_frame_v2.png — 받은 그림(1700×925, 알파 있음, 칸은 투명)
// 출력  public/play/play_frame.webp  — 1965×1000(예전 액자와 같은 크기 · 같은 칸 좌표)
//
// 왜 이렇게 하나: 화면 배치는 CSS가 아니라 이 그림이 정한다 — 칸 10개의 자리가 globals.css의 `.play-cell-*`에 그림 좌표(%)로
// 적혀 있다(lib/playAssets.ts). 새 그림은 비율(1.84 : 1)과 칸 크기가 달라 그대로 쓰면 칸 좌표를 전부 다시 재야 하고 판 비율도
// 바뀐다. 다행히 **나무 두께는 예전과 거의 같아서**(기둥 41 · 43px, 가로대 44 · 49px, 테두리 48 · 50px) 칸 구간만 늘이면 된다.
//
// 방법
// 1. 투명 여백을 걷고(TRIM), 가로 기준선(기둥 · 테두리의 안쪽 선)과 세로 기준선(가로대의 위아래 선)을 새 그림 → 예전 그림 좌표로 짝짓는다.
//    짝은 아래 ANCHORS에 적은 실측값이다(두 그림을 알파 128 기준으로 쟀다 — 예전 값은 예전 play_frame.webp에서).
// 2. 윗줄(칸 3) · 가운데 가로대 · 아랫줄(칸 7)은 기둥 자리가 달라 **세 띠로 나눠** 가로를 따로 맞춘다. 세로는 그림 전체가 같이 맞춘다.
// 3. 기준선 사이를 늘일 때 **칸의 둥근 모서리(CORNER px)와 장식(이끼 · 잎 — 초록 픽셀을 찾아 자동으로, 옹이는 KNOTS에 손으로)** 은
//    늘이지 않고 옮기기만 한다. 남은 구간이 늘어난 몫을 고르게 나눠 갖는다 — 늘어나는 것은 무늬가 단순한 통나무뿐이다.
// 4. 채도를 예전 액자에 맞춘다(SATURATION · BRIGHTNESS — 나무 픽셀 평균 채도 0.78 → 0.53, 예전 0.52).
//
// ⚠️ 결과는 `scripts/measurePlay.mjs --diff`로 "움직인 상자 없음"이어야 한다(칸 좌표가 그대로라는 뜻이다).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'assets-src/play_frame_v2.png');
const OUT = path.join(ROOT, 'public/play/play_frame.webp');

const OUT_W = 1965;
const OUT_H = 1000;
const SATURATION = 0.75;
const BRIGHTNESS = 1.06;
const CORNER = 24; // 칸 모서리에서 늘이지 않는 폭(둥근 모서리 + 테두리 그림자)
const PAD = 6; // 장식 둘레 여유

// [새 그림 좌표, 예전 그림 좌표] — 왼쪽(위)부터
const ANCHORS = {
  // 윗줄: 테두리 바깥 · 칸 3개의 왼쪽/오른쪽 선 · 테두리 바깥
  top: [[16, 0], [64, 50], [300, 332], [341, 375], [1360, 1579], [1400, 1622], [1636, 1901], [1695, 1964]],
  // 아랫줄: 칸 7개
  bottom: [
    [16, 0], [65, 51], [288, 315], [314, 342], [515, 583], [531, 596], [732, 840], [748, 852],
    [953, 1096], [969, 1110], [1169, 1354], [1185, 1367], [1387, 1610], [1412, 1636], [1636, 1900], [1695, 1964],
  ],
  // 가운데 가로대: 기둥이 없다 — 양쪽 테두리만 맞추고 가운데는 통으로 늘인다
  rail: [[16, 0], [64, 50], [1636, 1901], [1695, 1964]],
  // 세로: 위 테두리 · 윗줄 칸 · 가운데 가로대 · 아랫줄 칸 · 아래 테두리
  y: [[18, 1], [70, 59], [492, 552], [536, 601], [827, 941], [884, 999]],
};
// 늘일 구간(칸)의 순번 — 그 사이 구간(기둥 · 테두리)은 거의 1배라 고르게 맞춘다
const STRETCH = {
  top: [1, 3, 5],                       // 칸 3개
  bottom: [1, 3, 5, 7, 9, 11, 13],      // 칸 7개
  rail: [1],                            // 양쪽 테두리 사이
  y: [1, 3],                            // 윗줄 · 아랫줄
};
// 손으로 적는 옹이(초록이 아니라 자동으로 못 찾는다) — 새 그림 좌표
const KNOTS = {
  top: [[655, 725]],   // 위 테두리 가운데 옹이
  rail: [[900, 975]],  // 가운데 가로대 옹이
  bottom: [],
  y: [[300, 395]],     // 왼쪽 기둥 옹이(윗줄)
};
// 띠의 경계(새 그림 y) — 가운데 가로대의 윗선 · 아랫선에서 몇 px 안쪽
const RAIL_TOP = 494;
const RAIL_BOT = 534;

const { data: src, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const SW = info.width, SH = info.height;

// ── 장식(초록) 찾기 — 띠마다 가로 범위, 그림 전체에서 세로 범위 ──
function greenRanges(axis, filter) {
  const hit = new Uint8Array(axis === 'x' ? SW : SH);
  for (let y = 0; y < SH; y++) for (let x = 0; x < SW; x++) {
    const i = (y * SW + x) * 4;
    if (src[i + 3] < 128) continue;
    const r = src[i], g = src[i + 1], b = src[i + 2];
    if (g > r + 15 && g > b + 15 && filter(x, y)) hit[axis === 'x' ? x : y] = 1;
  }
  const out = [];
  for (let v = 0, s = -1; v <= hit.length; v++) {
    if (v < hit.length && hit[v]) { if (s < 0) s = v; } else if (s >= 0) { out.push([s - PAD, v + PAD]); s = -1; }
  }
  return out;
}
const protect = {
  top: [...greenRanges('x', (x, y) => y < RAIL_TOP), ...KNOTS.top],
  rail: [...greenRanges('x', (x, y) => y >= RAIL_TOP && y < RAIL_BOT), ...KNOTS.rail],
  bottom: [...greenRanges('x', (x, y) => y >= RAIL_BOT), ...KNOTS.bottom],
  y: [...greenRanges('y', () => true), ...KNOTS.y],
};

/**
 * 기준선 짝으로 새 그림 → 예전 그림의 단조 사상(꺾인 직선)을 만든다. 늘일 구간에서는 모서리 · 장식 자리를 1배로 두고 나머지가 늘어난 몫을
 * 나눠 갖는다. 돌려주는 것은 [새 좌표, 예전 좌표] 매듭 목록이다.
 */
function buildKnots(anchors, stretch, guards) {
  const knots = [anchors[0]];
  for (let k = 0; k < anchors.length - 1; k++) {
    const [s0, t0] = anchors[k], [s1, t1] = anchors[k + 1];
    if (!stretch.includes(k)) { knots.push([s1, t1]); continue; }
    // 1배로 둘 자리 — 양끝 모서리 + 이 구간에 걸친 장식
    let fixed = [[s0, s0 + CORNER], [s1 - CORNER, s1]];
    for (const [a, b] of guards) if (b > s0 && a < s1) fixed.push([Math.max(s0, a), Math.min(s1, b)]);
    fixed.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const f of fixed) {
      const last = merged.at(-1);
      if (last && f[0] <= last[1]) last[1] = Math.max(last[1], f[1]);
      else merged.push([...f]);
    }
    const fixedLen = merged.reduce((n, [a, b]) => n + (b - a), 0);
    const free = (s1 - s0) - fixedLen;
    const scale = free > 0 ? 1 + ((t1 - t0) - (s1 - s0)) / free : (t1 - t0) / (s1 - s0);
    if (free <= 0 || scale > 1.8) throw new Error(`늘일 자리가 모자란다: ${s0}→${s1} (자유 ${free}px, 배율 ${scale.toFixed(2)})`);
    let s = s0, t = t0;
    for (const [a, b] of merged) {
      if (a > s) { t += (a - s) * scale; s = a; knots.push([s, t]); }
      t += b - s; s = b; knots.push([s, t]);
    }
    knots.push([s1, t1]);
  }
  return knots;
}

/** 매듭 목록(새 → 예전)을 뒤집어 "예전 좌표 v의 새 좌표"를 꺾인 직선으로 구한다. */
function inverse(knots) {
  return v => {
    if (v <= knots[0][1]) return knots[0][0] + (v - knots[0][1]);
    for (let k = 0; k < knots.length - 1; k++) {
      const [s0, t0] = knots[k], [s1, t1] = knots[k + 1];
      if (v <= t1) return t1 === t0 ? s0 : s0 + ((v - t0) * (s1 - s0)) / (t1 - t0);
    }
    const [s, t] = knots.at(-1);
    return s + (v - t);
  };
}

const mapY = inverse(buildKnots(ANCHORS.y, STRETCH.y, protect.y));
const mapX = {
  top: inverse(buildKnots(ANCHORS.top, STRETCH.top, protect.top)),
  rail: inverse(buildKnots(ANCHORS.rail, STRETCH.rail, protect.rail)),
  bottom: inverse(buildKnots(ANCHORS.bottom, STRETCH.bottom, protect.bottom)),
};

// 쌍선형 표본 — 반투명 가장자리가 검게 번지지 않게 알파를 곱한 값으로 섞는다
function sample(x, y, out, o) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  let r = 0, g = 0, b = 0, a = 0;
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const px = x0 + dx, py = y0 + dy;
    if (w === 0 || px < 0 || py < 0 || px >= SW || py >= SH) continue;
    const i = (py * SW + px) * 4, al = src[i + 3] / 255;
    r += src[i] * al * w; g += src[i + 1] * al * w; b += src[i + 2] * al * w; a += al * w;
  }
  out[o + 3] = Math.round(a * 255);
  if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
}

const out = Buffer.alloc(OUT_W * OUT_H * 4);
for (let Y = 0; Y < OUT_H; Y++) {
  const sy = mapY(Y + 0.5) - 0.5;
  const band = sy < RAIL_TOP ? 'top' : sy < RAIL_BOT ? 'rail' : 'bottom';
  const mx = mapX[band];
  for (let X = 0; X < OUT_W; X++) sample(mx(X + 0.5) - 0.5, sy, out, (Y * OUT_W + X) * 4);
}

await sharp(out, { raw: { width: OUT_W, height: OUT_H, channels: 4 } })
  .modulate({ saturation: SATURATION, brightness: BRIGHTNESS })
  .webp({ quality: 92 })
  .toFile(OUT);
console.log(`${path.relative(ROOT, OUT)} ${OUT_W}×${OUT_H}`, {
  보호: Object.fromEntries(Object.entries(protect).map(([k, v]) => [k, v.length])),
});
