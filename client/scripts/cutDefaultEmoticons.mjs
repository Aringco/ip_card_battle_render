// 기본 감정표현(연출 표정) 만들기 — 얼굴 20개가 그려진 시트 한 장을 칸마다 잘라 낸다(2026-11-25).
//
//   assets-src/emoticons/default_sheet.png   → public/emoticon/default/{animal}_{mood}.png
//
// 시트는 투명 바탕에 4열 × 5줄, 아래 순서로 놓여 있다(왼쪽 위부터 가로로 읽는다):
//   호랑이 굳음 · 웃음 · 집중 · 울음 / 호랑이 불꽃 · 양 굳음 · 웃음 · 집중 / 양 울음 · 불꽃 · 토끼 굳음 · 웃음 /
//   토끼 집중 · 울음 · 불꽃 · 인어 굳음 / 인어 웃음 · 집중 · 울음 · 불꽃
// 파일 이름은 그대로다 — 연출(useAnimationQueue의 emoticonFile)과 감정표현 목록(shared/emotes.ts)이 이 이름으로 찾는다.
//
// 칸 경계는 시트의 투명한 틈에서 정한다(가로 · 세로로 불투명 화소가 없는 구간의 가운데). 말풍선 · 불꽃 · 반짝이처럼
// 얼굴과 떨어진 조각도 같은 칸 안에 있으면 함께 잘린다. 잘라 낸 것은 SIZE 정사각 투명 캔버스 가운데에 비율대로 앉힌다.
// 시트의 한 칸이 약 200px이라 그보다 크게 만들어도 또렷해지지 않는다 — 더 큰 원본이 오면 SIZE를 올린다.
//
// 실행: cd client && node scripts/cutDefaultEmoticons.mjs

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'assets-src', 'emoticons', 'default_sheet.png');
const OUT = path.join(__dirname, '..', 'public', 'emoticon', 'default');
const SIZE = 256;   // 캔버스 한 변
const PAD = 10;     // 캔버스 가장자리 여백
const ALPHA = 16;   // 이보다 불투명하면 그림으로 본다

const ORDER = [
  'tiger_stone', 'tiger_happy', 'tiger_focus', 'tiger_cry',
  'tiger_burn', 'sheep_stone', 'sheep_happy', 'sheep_focus',
  'sheep_cry', 'sheep_burn', 'rabbit_stone', 'rabbit_happy',
  'rabbit_focus', 'rabbit_cry', 'rabbit_burn', 'mermaid_stone',
  'mermaid_happy', 'mermaid_focus', 'mermaid_cry', 'mermaid_burn',
];
const COLS = 4;
const ROWS = 5;

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const opaque = (x, y) => data[(y * W + x) * 4 + 3] > ALPHA;

// 불투명 화소가 있는 구간(run)을 찾고, 이웃한 두 구간 사이 틈의 가운데를 칸 경계로 삼는다
function bands(len, count, hasInk) {
  const runs = [];
  let start = -1;
  for (let i = 0; i <= len; i++) {
    const ink = i < len && hasInk(i);
    if (ink && start < 0) start = i;
    if (!ink && start >= 0) { runs.push([start, i - 1]); start = -1; }
  }
  if (runs.length !== count) throw new Error(`칸 수가 맞지 않는다 — ${count}칸이어야 하는데 ${runs.length}구간: ${JSON.stringify(runs)}`);
  const cuts = [0];
  for (let i = 1; i < runs.length; i++) cuts.push(Math.round((runs[i - 1][1] + runs[i][0]) / 2));
  cuts.push(len);
  return cuts;
}
const colCuts = bands(W, COLS, x => { for (let y = 0; y < H; y++) if (opaque(x, y)) return true; return false; });
const rowCuts = bands(H, ROWS, y => { for (let x = 0; x < W; x++) if (opaque(x, y)) return true; return false; });

for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const name = ORDER[r * COLS + c];
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    for (let y = rowCuts[r]; y < rowCuts[r + 1]; y++) {
      for (let x = colCuts[c]; x < colCuts[c + 1]; x++) {
        if (!opaque(x, y)) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    const face = await sharp(SRC)
      .extract({ left: x0, top: y0, width: w, height: h })
      .resize(SIZE - PAD * 2, SIZE - PAD * 2, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    await sharp({ create: { width: SIZE, height: SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: face, left: PAD, top: PAD }])
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT, `${name}.png`));
    console.log(`${name.padEnd(14)} ← (${x0},${y0}) ${w}×${h}`);
  }
}
