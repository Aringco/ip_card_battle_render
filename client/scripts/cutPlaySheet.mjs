// 플레이 화면 UI 에셋 자르기 — 시트 한 장 → public/play/*.webp
//
//   node scripts/cutPlaySheet.mjs
//
// 입력은 `public/ui/_src/play_ui_sheet.png`(받은 원본, **알파 없는 3채널**)이다.
// 편집기의 체커보드가 픽셀로 구워져 있어, 먼저 그것을 지워 투명도를 되살린 뒤 자른다.
//
// ── 왜 이렇게 자르는가 ────────────────────────────────────────────────────
// ① **전역 임계값으로 "밝은 회색 = 배경"이라 지우면 안 된다.** 그림 안의 밝은 회색
//    (돌·양피지 하이라이트)까지 뚫린다. 테두리에서 **연결된 것만** flood fill로 지운다.
// ② **사각형으로 자르면 이웃 조각이 딸려 온다.** 시트는 조각들이 빽빽해 경계상자
//    안에 옆 그림의 잎사귀가 들어온다(실제로 board_h 위·아래에 들어왔다). 그래서
//    **연결 성분 단위**로 골라 그 성분이 아닌 화소는 알파 0으로 지운다.
// ③ **조각은 자기 경계상자에 바짝 자른다.** border-image의 슬라이스는 그림 가장자리
//    부터 재므로 투명 여백이 끼면 그만큼 어긋난다.
//
// ⚠️ 여기서 나온 크기가 바뀌면 globals.css의 슬라이스/테두리 값도 함께 고쳐야 한다.
//    대응표는 `client/public/play/README.md`에 있다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// ⚠️ 원본은 `public/` **밖**에 둔다 — 4.6MB짜리 시트가 public에 있으면 쓰이지도 않으면서
//    빌드 산출물에 그대로 복사돼 배포에 실린다.
const SRC = path.join(__dirname, '..', 'assets-src', 'play_ui_sheet.png');
const OUT_DIR = path.join(__dirname, '..', 'public', 'play');

/**
 * 잘라낼 조각 — `at`은 그 조각의 **연결 성분 경계상자**(cutPlaySheet가 처음 시트를
 * 훑어 찍어 준 값)다. 이 값으로 성분을 고르고, 그 성분만 남겨 경계상자에 자른다.
 *
 *   sub   … 그 성분 안에서 다시 잘라낼 구역(시트 좌표). 맨 윗줄처럼 두 조각이
 *           덩굴로 이어져 한 성분이 된 경우에만 쓴다.
 *   mirror… 왼쪽 끝을 오른쪽 끝의 좌우 반전으로 만들어 붙인다(들보 전용).
 */
const PIECES = [
  // ── 맨 윗줄: 이름표 + 긴 들보가 덩굴로 이어져 한 성분(2499×239)이다 ──
  { name: 'nameplate', at: [31, 14, 2499, 239], sub: [31, 14, 490, 239] },
  { name: 'beam', at: [31, 14, 2499, 239], sub: [540, 14, 1990, 239], mirrorCap: 200 },

  // ── 나무 액자 + 양피지 (9분할) ──
  { name: 'board_h', at: [19, 235, 754, 550] },   // 가로형 큰 판
  { name: 'board_sq', at: [1566, 394, 503, 456] }, // 정사각에 가까운 판
  { name: 'board_v', at: [768, 439, 271, 376] },   // 세로형 작은 판

  // ── 줄 노트 (9분할) ──
  { name: 'note_green', at: [632, 958, 266, 365] },
  { name: 'note_pink', at: [915, 957, 271, 375] },
  { name: 'note_green_rows', at: [22, 936, 289, 403] },
  { name: 'note_pink_rows', at: [327, 936, 293, 404] },

  // ── 알약·띠 (가로 3분할) ──
  { name: 'pill_green', at: [1336, 255, 208, 115] },
  { name: 'pill_gold', at: [1568, 255, 191, 116] },
  { name: 'pill_wood', at: [1782, 260, 247, 100] },
  { name: 'pill_leaf', at: [2047, 245, 278, 125] },
  { name: 'pill_sm_green', at: [1060, 766, 156, 81] },
  { name: 'pill_sm_wood', at: [1234, 766, 154, 80] },
  { name: 'pill_sm_gold', at: [1405, 760, 146, 85] },
  { name: 'acorn_bar', at: [25, 772, 621, 164] },
  { name: 'bar_dark', at: [1048, 430, 511, 186] },
  { name: 'bar_light', at: [1044, 612, 517, 139] },
  { name: 'bar_sm', at: [665, 824, 373, 119] },
  { name: 'plank', at: [781, 245, 532, 197] },
  { name: 'label_small', at: [2268, 617, 255, 180] },

  // ── 게이지 ──
  // ⚠️ 위 13줄은 캡슐이 아니라 옆 조각에서 가늘게 이어진 흰 부스러기 둘이다
  //    (성분이 얇은 다리로 붙어 있어 성분 단위로 걸러도 남는다) — 잘라낸다.
  { name: 'gauge', at: [1063, 855, 502, 73], trimTop: 13 }, // 모래시계 + 트랙 + 파란 채움 한 벌
  { name: 'gauge_fill', at: [1595, 872, 239, 53] },  // 초록 캡슐(채움만)
  { name: 'gauge_track', at: [1856, 872, 168, 54] }, // 빈 크림 캡슐(트랙만)

  // ── 고정 크기 ──
  { name: 'arrow_green', at: [2350, 260, 195, 113] },
  { name: 'arrow_wood', at: [2134, 387, 361, 221] },
  { name: 'badge_crown', at: [2067, 631, 182, 182] },
  { name: 'icon_lock', at: [1375, 1232, 94, 113] },
  { name: 'icon_acorn', at: [1240, 1240, 76, 99] },
  { name: 'icon_cog', at: [1678, 1241, 99, 103] },

  // ── 귀퉁이 장식 ──
  { name: 'decor_log', at: [1206, 946, 407, 136] },
  { name: 'decor_bush', at: [2105, 975, 171, 152] },
  { name: 'decor_grass', at: [1216, 1085, 204, 136] },
  { name: 'decor_stump', at: [2213, 848, 142, 119] },
  { name: 'decor_cattail', at: [2366, 803, 168, 172] },
  { name: 'decor_stones', at: [2383, 1256, 150, 72] },
  { name: 'decor_mushroom', at: [2021, 1205, 127, 137] },
];

const isChecker = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx - mn <= 12 && (r + g + b) / 3 >= 193;
};

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width, H = info.height, C = info.channels, N = W * H;

// ── ① 체커보드 지우기 (테두리에서 연결된 것만) ──
const alpha = new Uint8Array(N).fill(255);
{
  const seen = new Uint8Array(N);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (seen[i]) return;
    const o = i * C;
    if (!isChecker(data[o], data[o + 1], data[o + 2])) return;
    seen[i] = 1; alpha[i] = 0; stack.push(i);
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const i = stack.pop(); const x = i % W, y = (i / W) | 0;
    push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
  }
  // 경계 한 겹은 체커와 그림이 섞인 화소라 그대로 두면 흰 테가 남는다 — 회색기가
  // 강할수록 많이 깎는다.
  const edge = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (!alpha[i]) continue;
    if (alpha[i - 1] && alpha[i + 1] && alpha[i - W] && alpha[i + W]) continue;
    const o = i * C, r = data[o], g = data[o + 1], b = data[o + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), br = (r + g + b) / 3;
    if (mx - mn <= 20 && br >= 175) edge.push([i, Math.max(0, Math.round(255 * (1 - (br - 175) / 80)))]);
  }
  for (const [i, a] of edge) alpha[i] = a;
}

// ── ② 연결 성분 ──
const label = new Int32Array(N).fill(-1);
const boxes = [];
for (let s = 0; s < N; s++) {
  if (label[s] !== -1 || alpha[s] <= 16) continue;
  const id = boxes.length; const st = [s]; label[s] = id;
  let minx = W, miny = H, maxx = -1, maxy = -1;
  while (st.length) {
    const i = st.pop(); const x = i % W, y = (i / W) | 0;
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
    for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const j = ny * W + nx;
      if (label[j] !== -1 || alpha[j] <= 16) continue;
      label[j] = id; st.push(j);
    }
  }
  boxes.push([minx, miny, maxx - minx + 1, maxy - miny + 1]);
}
const findComp = ([x, y, w, h]) => {
  const i = boxes.findIndex(b => b[0] === x && b[1] === y && b[2] === w && b[3] === h);
  if (i === -1) throw new Error(`성분을 못 찾음: ${x},${y},${w},${h} — 시트가 바뀌었으면 경계상자를 다시 찍을 것`);
  return i;
};

/** 성분 하나만 남긴 RGBA 버퍼를 만든다(지정 구역으로 자른 뒤 알파 경계상자에 바짝 자름). */
function extractComp(compId, rect) {
  const [rx, ry, rw, rh] = rect;
  let minx = rw, miny = rh, maxx = -1, maxy = -1;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const i = (ry + y) * W + (rx + x);
    if (label[i] !== compId || alpha[i] <= 8) continue;
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  const w = maxx - minx + 1, h = maxy - miny + 1;
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (ry + miny + y) * W + (rx + minx + x);
    const di = (y * w + x) * 4;
    if (label[si] !== compId) continue; // 이웃 조각은 지운다
    const o = si * C;
    buf[di] = data[o]; buf[di + 1] = data[o + 1]; buf[di + 2] = data[o + 2]; buf[di + 3] = alpha[si];
  }
  return { buf, w, h };
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const report = [];

for (const piece of PIECES) {
  const compId = findComp(piece.at);
  const rect = piece.sub ?? piece.at;
  let { buf, w, h } = extractComp(compId, rect);

  if (piece.trimTop) {
    buf = await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left: 0, top: piece.trimTop, width: w, height: h - piece.trimTop })
      .raw().toBuffer();
    h -= piece.trimTop;
  }

  // 들보만 — 왼쪽 끝을 오른쪽 끝의 좌우 반전으로 만들어 붙인다. 시트의 들보는 왼쪽
  // 끝이 이름표에 가려 마무리가 없어서, 그대로 쓰면 잘린 단면이 드러난다.
  if (piece.mirrorCap) {
    const cap = piece.mirrorCap;
    const capBuf = await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left: w - cap, top: 0, width: cap, height: h }).flop().png().toBuffer();
    const body = await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
    buf = await sharp({ create: { width: w + cap, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: capBuf, left: 0, top: 0 }, { input: body, left: cap, top: 0 }])
      .raw().toBuffer();
    w += cap;
  }

  const file = path.join(OUT_DIR, `${piece.name}.webp`);
  await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 92 }).toFile(file);
  report.push([piece.name, w, h, fs.statSync(file).size]);
}

console.log('이름'.padEnd(18) + '크기'.padEnd(14) + '용량');
let total = 0;
for (const [n, w, h, size] of report) {
  total += size;
  console.log(n.padEnd(20) + `${w}×${h}`.padEnd(14) + `${(size / 1024).toFixed(1)}KB`);
}
console.log(`\n조각 ${report.length}개 · 합계 ${(total / 1024).toFixed(0)}KB → ${OUT_DIR}`);
