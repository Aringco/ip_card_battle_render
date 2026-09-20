// 게임 방법 창의 **왼쪽 위** 귀퉁이 덩굴을 오른쪽 위 것의 거울상으로 다시 만든다.
//
//   사용법  cd client && node scripts/mirrorHowtoCornerTL.mjs
//
// 받은 네 장 중 `howto_corner_tl`만 나머지 셋과 다른 그림이었다. 셋은 잉크가 캔버스
// 모서리에 닿아 액자 귀퉁이를 감싸는데, tl은 잉크가 **캔버스 안쪽으로 68px 오른쪽 ·
// 27px 아래**에서 시작하고 양도 훨씬 적었다(잉크 8.1% vs tr 11.7%). 그래서 화면에서는
// 덩굴이 액자를 놓치고 양피지 위에 떠 있었고, 크기를 키우면 그 어긋남이 **함께 커져**
// 글자 위로 파고들었다 — 크기만으로는 고칠 수 없는 문제다.
//
// 아래·오른쪽 두 장이 서로 거울상에 가깝게 그려져 있으므로, 위쪽도 같은 방식으로
// 맞춘다. 원본은 `assets-src/howto_corner_tl_original.webp`에 남겨 뒀다.
//
//   잉크 경계상자(알파 > 32 기준)
//     tl(원본)  x68..232  y27..265   — 모서리에 닿지 않는다
//     tr        x48..306  y0..246    — 오른쪽·위에 닿는다
//     bl        x1..306   y145..265  — 왼쪽·아래에 닿는다
//     br        x5..306   y110..265  — 오른쪽·아래에 닿는다

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI = path.join(__dirname, '..', 'public', 'ui');
const SRC = path.join(UI, 'howto_corner_tr.webp');
const OUT = path.join(UI, 'howto_corner_tl.webp');

const meta = await sharp(SRC).metadata();
await sharp(SRC).flop().webp({ quality: 92 }).toFile(OUT);

// 확인 — 잉크가 왼쪽·위 모서리에 닿는가
const { data, info } = await sharp(OUT).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
let x0 = W, x1 = -1, y0 = H, y1 = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (data[(y * W + x) * C + 3] <= 32) continue;
  if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
}
const kb = (fs.statSync(OUT).size / 1024).toFixed(1);
console.log(`howto_corner_tl.webp ← howto_corner_tr.webp 좌우 반전  ${meta.width}×${meta.height}  ${kb}KB`);
console.log(`  잉크 x${x0}..${x1} y${y0}..${y1}  (왼쪽 여백 ${x0}px · 위 여백 ${y0}px — 둘 다 0에 가까워야 한다)`);
