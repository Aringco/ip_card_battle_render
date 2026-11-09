// 홈 화면 아이콘(PWA) 만들기 — 게임 로고(public/lobby/logo.png)를 나무색 바탕 가운데에 앉힌다(2026-11-06 — 그 전에는 네 동물 얼굴 2×2).
//
//   cd client && node scripts/makeAppIcons.mjs
//
// 결과:
//   app/icon.png                  512 — 브라우저 탭 아이콘(Next가 <link rel="icon">을 자동으로 넣는다)
//   app/apple-icon.png            180 — iOS 홈 화면(<link rel="apple-touch-icon">, 투명 금지라 바탕을 깐다)
//   public/icons/icon-192.png     192 — manifest
//   public/icons/icon-512.png     512 — manifest
//   public/icons/icon-maskable-512.png — manifest(maskable): 안드로이드가 원·물방울로 잘라도 로고가 안 잘리게 가운데 70%에만 그린다
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOGO = join(root, 'public/lobby/logo.png');

function background(size) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
      <defs><radialGradient id="g" cx="50%" cy="45%" r="70%">
        <stop offset="0" stop-color="#2f6b3c"/><stop offset="1" stop-color="#0f2a17"/>
      </radialGradient></defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
    </svg>`,
  );
}

/** content: 로고가 차지하는 가운데 정사각형의 비율(1 = 아이콘 전체) — 로고는 여백을 잘라낸 뒤 비율 그대로 그 안에 맞춘다 */
async function makeIcon(size, content, out) {
  const box = Math.round(size * content);
  const logo = await sharp(LOGO).trim().resize(box, box, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const offset = Math.round((size - box) / 2);
  mkdirSync(dirname(out), { recursive: true });
  await sharp(background(size)).composite([{ input: logo, left: offset, top: offset }]).png().toFile(out);
  console.log('wrote', out);
}

await makeIcon(512, 0.86, join(root, 'app/icon.png'));
await makeIcon(180, 0.86, join(root, 'app/apple-icon.png'));
await makeIcon(192, 0.86, join(root, 'public/icons/icon-192.png'));
await makeIcon(512, 0.86, join(root, 'public/icons/icon-512.png'));
await makeIcon(512, 0.7, join(root, 'public/icons/icon-maskable-512.png'));
