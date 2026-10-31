// 네 동물 얼굴(how_IPs) — 투명 바탕 원본 한 장에서 두 가지를 만든다(2026-10-31, 흰 바탕이던 옛 그림을 갈았다).
//   ① public/howto/how_IPs.png — 2×2 그리드 그대로(좌상 토끼 / 우상 양 / 좌하 호랑이 / 우하 인어). 게임 방법 창(HowToPlayModal)이
//      background-size 200%로 네 칸을 잘라 쓴다 — 배치를 바꾸면 그쪽 FACE_POS도 고칠 것.
//   ② public/howto/face_{animal}.webp — 얼굴 하나씩 정사각형 투명 아이콘. 모바일 배치의 동물 아이콘(AnimalRail)이 쓴다.
//      칸 안의 반짝이·효과선은 빼고 **가장 큰 덩어리(얼굴)** 만 남긴다 — 작은 원 안에서 반짝이까지 넣으면 얼굴이 작아지고,
//      얼굴을 정사각형으로 넓히면 옆 칸 그림의 끝(토끼 턱 · 인어 머리카락)이 딸려 들어온다. 그 밖은 모두 투명으로 지운다.
// 원본은 assets-src/how_IPs.png(1326×1186 PNG, 투명 바탕). 다시 만들려면:
//   cd client && node scripts/makeHowIPs.mjs
// (public/howto는 generateAssetManifest의 IMAGE_DIRS에 있다 — 새 파일을 더했으면 그 스크립트도 다시 돌려 로딩 화면이 미리 받게 한다.)
import sharp from 'sharp';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'assets-src', 'how_IPs.png');
const OUT = join(root, 'public', 'howto');
const GRID_W = 800;   // ① 게임 방법 창의 얼굴은 44px쯤이라 이 정도면 넉넉하다(팔레트 PNG — 옛 그림 362KB → 135KB)
const FACE = 256;     // ② 아이콘 한 변(모바일 아이콘 지름 40~66px × 고해상도 화면)
const ALPHA = 24;     // 이보다 불투명한 픽셀만 "그림"으로 본다
const LAYOUT = [
  ['rabbit', 0, 0],
  ['sheep', 1, 0],
  ['tiger', 0, 1],
  ['mermaid', 1, 1],
];

// ① 그리드
{
  const info = await sharp(SRC).resize({ width: GRID_W }).png({ palette: true, quality: 90, compressionLevel: 9 }).toFile(join(OUT, 'how_IPs.png'));
  console.log(`[how_IPs] grid ${info.width}x${info.height} ${(statSync(join(OUT, 'how_IPs.png')).size / 1024).toFixed(0)}KB`);
}

// ② 얼굴 하나씩
const { data, info } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H } = info;
const opaque = (x, y) => data[(y * W + x) * 4 + 3] > ALPHA;

// 칸 나눔 — 가운데 근처에서 그림이 가장 적게 지나는 세로줄 · 가로줄(얼굴이 정확히 반에 있지 않다)
function quietLine(len, cross, isCol) {
  let best = Math.round(len / 2), bestSum = Infinity;
  for (let p = Math.round(len * 0.35); p <= Math.round(len * 0.65); p++) {
    let s = 0;
    for (let q = 0; q < cross; q++) if (isCol ? opaque(p, q) : opaque(q, p)) s++;
    if (s < bestSum) { bestSum = s; best = p; }
  }
  return best;
}
const splitX = quietLine(W, H, true);
const splitY = quietLine(H, W, false);
console.log(`[how_IPs] split at x=${splitX} y=${splitY}`);

for (const [animal, cx, cy] of LAYOUT) {
  const x0 = cx ? splitX : 0, x1 = cx ? W : splitX;
  const y0 = cy ? splitY : 0, y1 = cy ? H : splitY;
  // 칸 안에서 가장 큰 덩어리(4방향으로 이어진 불투명 픽셀) 찾기 — 덩어리마다 번호(label)를 붙여 둔다
  const label = new Int32Array(W * H);
  let best = null;
  let id = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (label[y * W + x] || !opaque(x, y)) continue;
      const box = { id: ++id, n: 0, l: x, r: x, t: y, b: y };
      const stack = [x, y];
      label[y * W + x] = box.id;
      while (stack.length) {
        const py = stack.pop(), px = stack.pop();
        box.n++;
        if (px < box.l) box.l = px; if (px > box.r) box.r = px;
        if (py < box.t) box.t = py; if (py > box.b) box.b = py;
        for (const [nx, ny] of [[px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]]) {
          if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
          const k = ny * W + nx;
          if (label[k] || !opaque(nx, ny)) continue;
          label[k] = box.id;
          stack.push(nx, ny);
        }
      }
      if (!best || box.n > best.n) best = box;
    }
  }
  // 얼굴 덩어리만 남긴 그림 — 그 밖(반짝이 · 효과선 · 옆 칸 그림)은 투명으로. 덩어리 경계의 반투명 테두리(ALPHA 이하)를
  // 잃지 않게 덩어리를 3px 넓혀서 남긴다.
  const keep = new Uint8Array(W * H);
  const GROW = 3;
  for (let y = best.t; y <= best.b; y++) {
    for (let x = best.l; x <= best.r; x++) {
      if (label[y * W + x] !== best.id) continue;
      for (let dy = -GROW; dy <= GROW; dy++) {
        for (let dx = -GROW; dx <= GROW; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx >= x0 && ny >= y0 && nx < x1 && ny < y1) keep[ny * W + nx] = 1;
        }
      }
    }
  }
  const masked = Buffer.from(data);
  for (let k = 0; k < W * H; k++) if (!keep[k]) masked[k * 4 + 3] = 0;
  // 얼굴 상자를 정사각형으로 — 긴 변에 맞추고 4% 숨통을 둔다(칸 밖으로 나가면 투명으로 채운다)
  const side = Math.round(Math.max(best.r - best.l + 1, best.b - best.t + 1) * 1.04);
  const midX = (best.l + best.r) / 2, midY = (best.t + best.b) / 2;
  const left = Math.round(midX - side / 2), top = Math.round(midY - side / 2);
  const ext = {
    left: Math.max(0, -left), top: Math.max(0, -top),
    right: Math.max(0, left + side - W), bottom: Math.max(0, top + side - H),
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  };
  const out = join(OUT, `face_${animal}.webp`);
  await sharp(masked, { raw: { width: W, height: H, channels: 4 } })
    .extend(ext)
    .extract({ left: left + ext.left, top: top + ext.top, width: side, height: side })
    .resize(FACE, FACE)
    .webp({ quality: 88, alphaQuality: 100 })
    .toFile(out);
  console.log(`[how_IPs] ${animal} box ${best.r - best.l + 1}x${best.b - best.t + 1} → ${FACE}px ${(statSync(out).size / 1024).toFixed(0)}KB`);
}
