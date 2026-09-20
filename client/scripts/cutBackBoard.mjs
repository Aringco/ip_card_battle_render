// 판 백보드를 액자와 양피지 두 장으로 가른다.
//
//   사용법  cd client && node scripts/cutBackBoard.mjs
//
// 원본(`assets-src/back_board_split.png`)은 **속이 빈 나무 액자**와 **양피지 판**이
// 위아래로 하나씩 놓인 그림이다. 예전 `back_board.png`는 이 둘이 합쳐진 한 장이라
// 양피지만 따로 반투명하게 만들 수 없었다 — 그래서 갈랐다.
//
// `cutMedals.mjs`와 같은 방식이다: 알파가 0인 가로줄로 두 덩어리를 가르고 경계상자를
// 그 자리에서 잰다. 좌표를 적어두면 그림을 다시 받는 순간 낡기 때문이다.
//
// 자른 뒤 **9분할에 쓸 슬라이스 값을 함께 출력한다.** globals.css의
// `--board-slice`(액자)와 `.board-plate`의 슬라이스가 그 숫자를 받아 적은 것이고,
// 그림을 갈아끼우면 여기 출력이 곧 고쳐야 할 값이다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'assets-src', 'back_board_split.png');
const OUT_DIR = path.join(__dirname, '..', 'public', 'ui');

/** 위에서부터 나오는 순서대로 */
const TARGETS = [
  { file: 'back_board_frame.webp', what: '나무 액자(속이 빔)' },
  { file: 'back_board_plate.webp', what: '양피지 판' },
];

// 받은 그림에는 두 덩어리 사이에 **알파 6 이하의 빨강·노랑 점**이 흩어져 있다(5673개).
// 눈에는 보이지 않지만 경계상자를 흐트러뜨리므로 없는 것으로 친다. 30 이하를 지우는
// 귀퉁이 장식(ui/README.md)과 달리 여기서는 8이면 충분했다 — 실제 그림의 가장 옅은
// 안티에일리어싱 화소가 그보다 진하다.
const ALPHA_MIN = 8;

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const alphaAt = (x, y) => data[(y * W + x) * C + 3];

const bands = [];
let start = null;
for (let y = 0; y < H; y++) {
  let any = false;
  for (let x = 0; x < W; x++) if (alphaAt(x, y) > ALPHA_MIN) { any = true; break; }
  if (any) { if (start === null) start = y; }
  else if (start !== null) { bands.push([start, y - 1]); start = null; }
}
if (start !== null) bands.push([start, H - 1]);

if (bands.length !== TARGETS.length) {
  throw new Error(`덩어리가 ${bands.length}개다 — ${TARGETS.length}개여야 한다. 원본을 확인할 것.`);
}

for (const [i, [ya, yb]] of bands.entries()) {
  const { file, what } = TARGETS[i];
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = ya; y <= yb; y++) {
    for (let x = 0; x < W; x++) {
      if (alphaAt(x, y) <= ALPHA_MIN) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;

  const out = path.join(OUT_DIR, file);
  await sharp(SRC)
    .extract({ left: x0, top: y0, width: w, height: h })
    // 보이지 않는 점까지 확실히 지운다 — 알파 8 이하를 0으로 눌러 버린다
    .ensureAlpha()
    .linear([1, 1, 1, 255 / (255 - ALPHA_MIN)], [0, 0, 0, -ALPHA_MIN * 255 / (255 - ALPHA_MIN)])
    .webp({ quality: 92 })
    .toFile(out);

  // ── 9분할 슬라이스 실측 ────────────────────────────────────────────
  // 가운데 가로줄·세로줄에서 불투명한 띠의 두께를 재면 그것이 곧 테두리 두께다.
  const mid = (arr) => arr;
  const rowRuns = (yy) => { const r = []; let s = null;
    for (let x = x0; x <= x1; x++) { const on = alphaAt(x, yy) > ALPHA_MIN;
      if (on) { if (s === null) s = x; } else if (s !== null) { r.push([s, x - 1]); s = null; } }
    if (s !== null) r.push([s, x1]); return r; };
  const colRuns = (xx) => { const r = []; let s = null;
    for (let y = y0; y <= y1; y++) { const on = alphaAt(xx, y) > ALPHA_MIN;
      if (on) { if (s === null) s = y; } else if (s !== null) { r.push([s, y - 1]); s = null; } }
    if (s !== null) r.push([s, y1]); return r; };
  const hr = mid(rowRuns(Math.round((y0 + y1) / 2)));
  const vr = mid(colRuns(Math.round((x0 + x1) / 2)));
  const edges = hr.length === 2 && vr.length === 2
    ? { 좌: hr[0][1] - hr[0][0] + 1, 우: hr[1][1] - hr[1][0] + 1,
        상: vr[0][1] - vr[0][0] + 1, 하: vr[1][1] - vr[1][0] + 1 }
    : null;

  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(`${file}  ${what}  ${w}×${h}  ${kb}KB`);
  if (edges) {
    const need = Math.max(...Object.values(edges)) + 1;
    console.log(`    테두리 두께 상${edges.상} 우${edges.우} 하${edges.하} 좌${edges.좌}  → 슬라이스 ${need} 이상`);
  } else {
    console.log('    속이 차 있어 테두리 두께를 잴 수 없다 — 슬라이스는 모서리 장식이 들어갈 만큼만 잡을 것');
  }
}
