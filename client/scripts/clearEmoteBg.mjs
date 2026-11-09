// 감정표현 그림의 흰 바탕 걷기(2026-11-07 — "게임 내에서 사용되는 감정표현의 흰색 배경을 모두 제거").
//
//   public/emoticon/default/*.png   (RGB, 흰 바탕) → 같은 이름의 RGBA PNG
//
// ⚠️ SP 묶음(spticon)은 돌리지 않는다 — 몸이 흰색인 도트 그림이라 외곽선 틈으로 바탕과 이어져 몸까지 지워졌다
//    (2026-11-07에 해 보고 되돌렸다). 그 묶음은 손으로 따낸 원본이 생기면 다시 본다. 손동작(hands)은 처음부터 알파가 있다.
//
// 그림 테두리에서 시작해 **이어진** 거의 흰 픽셀만 지운다(flood fill) — 캐릭터는 짙은 외곽선에 싸여 있어
// 얼굴 안의 흰색(이 · 눈동자 빛)은 바깥과 이어지지 않아 남는다. 지운 자리에 닿은 한 줄은 밝기만큼 반투명으로
// 남겨 가장자리를 부드럽게 한다. 이미 알파가 있는 그림은 건너뛴다(두 번 돌려도 같다).
//
// 실행: cd client && node scripts/clearEmoteBg.mjs
// ⚠️ 저장소의 sharp가 다른 OS용으로 설치돼 있으면 그 OS의 sharp로 돌린다(NEXT_SESSION.md의 환경 구성 참고).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..', 'public', 'emoticon');
const WHITE = 232; // 이 값 이상(세 채널 모두)이면 바탕 후보 — 손실 압축의 얼룩까지 덮는다

async function clear(file) {
  const img = sharp(file);
  const meta = await img.metadata();
  if (meta.hasAlpha) return 'skip';
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const at = (x, y) => (y * w + x) * 4;
  const whiteish = i => data[i] >= WHITE && data[i + 1] >= WHITE && data[i + 2] >= WHITE;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, 0, x, h - 1);
  for (let y = 0; y < h; y++) stack.push(0, y, w - 1, y);
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    if (x < 0 || y < 0 || x >= w || y >= h || seen[y * w + x]) continue;
    const i = at(x, y);
    if (!whiteish(i)) continue;
    seen[y * w + x] = 1;
    data[i + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
  // 가장자리 한 줄 — 지운 자리와 맞닿은 밝은 픽셀은 밝을수록 투명하게
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (seen[y * w + x]) continue;
    const touches = (x > 0 && seen[y * w + x - 1]) || (x < w - 1 && seen[y * w + x + 1]) || (y > 0 && seen[(y - 1) * w + x]) || (y < h - 1 && seen[(y + 1) * w + x]);
    if (!touches) continue;
    const i = at(x, y);
    const light = Math.min(data[i], data[i + 1], data[i + 2]);
    if (light > 180) data[i + 3] = Math.round(255 * (1 - (light - 180) / 75) ** 0.8);
  }
  const out = sharp(data, { raw: { width: w, height: h, channels: 4 } });
  const buf = file.endsWith('.png') ? await out.png({ compressionLevel: 9 }).toBuffer() : await out.webp({ quality: 90, alphaQuality: 100 }).toBuffer();
  fs.writeFileSync(file, buf);
  return 'done';
}

for (const dir of ['default']) {
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    if (!/\.(png|webp)$/.test(name)) continue;
    console.log(dir, name, await clear(path.join(ROOT, dir, name)));
  }
}
