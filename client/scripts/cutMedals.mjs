// 메달 두 장(medal_1 · medal_2)을 원본 한 장에서 잘라낸다.
//
//   사용법  cd client && node scripts/cutMedals.mjs
//
// 원본(`assets-src/medal_sheet.png`)은 금·은 메달이 **위아래로 하나씩** 놓인 그림이다.
// 좌표를 손으로 적어두지 않는 이유는, 그림을 다시 받으면 그 숫자가 곧바로 낡기
// 때문이다 — 알파가 0인 가로줄로 두 덩어리를 가르고, 각 덩어리의 경계상자를 그 자리에서
// 잰다. `public/ui/README.md`의 월계수·메달 절에 있는 "연결 성분 단위로 자른다"와 같은
// 뜻이되, 여기서는 덩어리가 위아래 둘뿐이라 가로줄만으로 충분하다.
//
// ⚠️ **바짝 자르지 않고 여백을 남긴다.** 결과 화면은 메달을 높이(h-[12.15rem] 등)로
// 재서 `object-contain`으로 그리므로, 여백이 없어지면 같은 CSS 높이에서 그림만 커진다.
// 그래서 예전 에셋과 **같은 비율의 여백**(내용이 전체 높이의 금 92.6% · 은 90.9%)을
// 다시 만들어 준다 — 그래야 이 교체가 크기 변화 없는 순수한 그림 교체가 된다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'assets-src', 'medal_sheet.png');
const OUT_DIR = path.join(__dirname, '..', 'public', 'ui');

// 위에서부터 나오는 순서대로.
//   contentRatio — 그림이 파일 전체 높이에서 차지할 비율(위 주석 참고)
//   outHeight    — 저장할 높이. 화면에 그려지는 높이(GameEndScreen의 h-[12.15rem]=156px,
//                  h-[8.1rem]=104px)의 **3배**로 잡는다. 3배 DPR 화면까지 또렷하면
//                  충분하고, 원본 그대로(509/434) 두면 금메달만 150KB에 달한다 —
//                  LoadingScreen이 이미지를 전부 미리 받으므로 그 무게가 첫 대기시간에
//                  그대로 얹힌다.
const TARGETS = [
  { file: 'medal_1.webp', contentRatio: 162 / 175, outHeight: 470 },
  { file: 'medal_2.webp', contentRatio: 120 / 132, outHeight: 315 },
];

const ALPHA_MIN = 16; // 이보다 옅은 화소는 없는 것으로 친다

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const alphaAt = (x, y) => data[(y * W + x) * C + 3];

// ── 알파가 0인 가로줄로 덩어리를 가른다 ────────────────────────────────
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
  const { file, contentRatio, outHeight } = TARGETS[i];
  // 그 덩어리의 경계상자
  let x0 = W, x1 = -1, y0 = H, y1 = -1;
  for (let y = ya; y <= yb; y++) {
    for (let x = 0; x < W; x++) {
      if (alphaAt(x, y) <= ALPHA_MIN) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  // ⚠️ **sharp는 부르는 차례가 아니라 정해진 차례로 처리한다** — extract → resize →
  // extend다. 그래서 extend를 먼저 불러도 여백은 축소되지 않고 원본 두께로 남는다
  // (그렇게 짰다가 금메달이 1276×508로 나왔다). 두 값을 **출력 크기 기준으로** 미리
  // 풀어 둔다: 그림을 contentH로 줄이고, 나머지를 여백으로 나눠 갖는다.
  const contentH = Math.round(outHeight * contentRatio);
  const pad = Math.round((outHeight - contentH) / 2);

  const out = path.join(OUT_DIR, file);
  await sharp(SRC)
    .extract({ left: x0, top: y0, width: w, height: h })
    .resize({ height: contentH })
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90 })
    .toFile(out);

  const meta = await sharp(out).metadata();
  const kb = (fs.statSync(out).size / 1024).toFixed(1);
  console.log(`${file}  내용 ${w}×${h} + 여백 ${pad}px → ${meta.width}×${meta.height}  ${kb}KB`);
}
