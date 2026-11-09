// 도토리 그림(2026-11-06 — 도토리 카드 기획과 함께 받은 acorn.png)을 게임용으로 자른다.
//
//   cd client && node scripts/makeAcornArt.mjs
//
// 결과:
//   public/play/icon_acorn.webp   그대로의 색(축제 · 날아가는 도토리 · 게임 방법 — AcornIcon). 둘레의 옅은 빛은 잘라 낸다
//   public/play/acorn_mask.webp   흰 실루엣 — CSS mask로 쓴다(카드 뒷면의 단계 색 도토리 · 효과 표시의 검은 도토리)
import sharp from 'sharp';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'assets-src/acorn.png');
const OUT = join(root, 'public/play');
const H = 256;

const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
// 그림 본체(불투명)의 상자 — 빛(반투명)은 빼고 잰다
let x0 = w, y0 = h, x1 = 0, y1 = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  if (data[(y * w + x) * 4 + 3] > 160) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
}
const pad = 6;
const box = { left: Math.max(0, x0 - pad), top: Math.max(0, y0 - pad), width: Math.min(w, x1 + pad) - Math.max(0, x0 - pad), height: Math.min(h, y1 + pad) - Math.max(0, y0 - pad) };

// 색 그림 — 본체 둘레의 빛을 걷어 작은 크기에서도 또렷하게(알파 160 아래는 빠르게 사라지게)
const color = Buffer.from(data);
for (let i = 3; i < color.length; i += 4) color[i] = color[i] > 160 ? 255 : Math.max(0, Math.round((color[i] - 100) * 4.25));
await sharp(color, { raw: info }).extract(box).resize({ height: H }).webp({ quality: 90 }).toFile(join(OUT, 'icon_acorn.webp'));

// 실루엣 — 흰색, 알파만 남긴다
const mask = Buffer.alloc(data.length);
for (let i = 0; i < data.length; i += 4) {
  mask[i] = mask[i + 1] = mask[i + 2] = 255;
  mask[i + 3] = data[i + 3] > 160 ? 255 : 0;
}
await sharp(mask, { raw: info }).extract(box).resize({ height: H }).webp({ quality: 90 }).toFile(join(OUT, 'acorn_mask.webp'));
console.log('acorn', box);
