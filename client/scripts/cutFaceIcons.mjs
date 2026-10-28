// 동물 얼굴 아이콘 — 감정표현 그림(/emoticon/default/*_happy.png)에서 **흰 바탕만 걷어낸** 작은 투명 그림을 만든다.
//
// 왜: 감정표현 그림은 투명도 없이 흰 바탕(600×600 PNG)이라, 순위표처럼 양피지 위에 얹으면 흰 네모가 뜬다(2026-10-27 제보).
// CSS(mix-blend-mode: multiply)로 지우려 했지만 조상 중 쌓임 맥락을 만드는 요소가 있어 바탕과 섞이지 않았다 — 그림을 고친다.
//
// 방법: 가장자리에서 시작해 **이어진 흰색만** 투명하게 지운다(flood fill). 얼굴 안의 흰색(눈 반사광·이빨)은 가장자리와
// 이어져 있지 않아 남는다. 경계는 흰 정도에 따라 반투명으로 풀어 계단이 지지 않게 한다.
//
// 실행: cd client && node scripts/cutFaceIcons.mjs   → public/emoticon/default/{sheep,rabbit,mermaid,tiger}_icon.webp
// (public/emoticon/default는 generateAssetManifest의 IMAGE_DIRS에 있어 로딩 화면이 미리 받는다.)

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(__dirname, '..', 'public', 'emoticon', 'default');
const ANIMALS = ['sheep', 'rabbit', 'mermaid', 'tiger'];
const SIZE = 128;          // 순위표 아이콘은 1.5em(20~30px) — 고해상도 화면을 위해 넉넉히
const HARD = 238;          // 이보다 밝으면(세 채널 모두) 바탕으로 보고 이어서 칠한다
const SOFT = 200;          // HARD~SOFT 사이는 경계 — 밝은 만큼 반투명

for (const animal of ANIMALS) {
  const src = path.join(dir, `${animal}_happy.png`);
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const at = (x, y) => (y * W + x) * 4;
  const minRGB = i => Math.min(data[i], data[i + 1], data[i + 2]);

  // 가장자리에서 이어진 밝은 픽셀을 찾는다(4방향)
  const seen = new Uint8Array(W * H);
  const stack = [];
  for (let x = 0; x < W; x++) { stack.push([x, 0], [x, H - 1]); }
  for (let y = 0; y < H; y++) { stack.push([0, y], [W - 1, y]); }
  while (stack.length) {
    const [x, y] = stack.pop();
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const k = y * W + x;
    if (seen[k]) continue;
    const m = minRGB(at(x, y));
    if (m < SOFT) continue;               // 그림 — 멈춘다
    seen[k] = 1;
    const i = at(x, y);
    // 아주 밝으면 완전히 투명, 경계 구간은 밝은 만큼 투명
    data[i + 3] = m >= HARD ? 0 : Math.round(255 * (HARD - m) / (HARD - SOFT));
    if (m >= HARD) stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]); // 경계에서는 더 번지지 않는다
  }

  const out = path.join(dir, `${animal}_icon.webp`);
  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .trim({ threshold: 0 })               // 투명 여백을 걷어 아이콘이 칸을 꽉 쓰게
    .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 90, alphaQuality: 100 })
    .toFile(out);
  console.log('→', path.relative(process.cwd(), out));
}
