// 감정표현 그림 만들기 — 개인전 감정표현(EmotePicker)의 'SP'·'손동작' 묶음을 원본에서 만든다.
//
//   assets-src/emoticons/spticon/*.{bmp,png}   → public/emoticon/spticon/{slug}.webp
//   assets-src/emoticons/hand_emoticons.png    → public/emoticon/hands/{slug}.webp  (한 장에 다섯 손을 잘라 낸다)
//
// '기본' 묶음(public/emoticon/default/*.png)은 원래 있던 그림을 그대로 쓴다 — 여기서 만들지 않는다.
// 파일 이름(slug)과 화면에 보일 이름은 shared/emotes.ts의 목록과 짝이다 — 한쪽만 고치면 그림이 안 뜬다.
//
// 왜 BMP를 변환하나: 받은 SP 그림 대부분이 BMP(무압축, 장당 수백 KB~1MB)라 그대로 두면 로딩 화면이
// 미리 받는 양이 크게 늘고, 한글 파일 이름은 URL에서 매번 인코딩해야 한다. sharp(libvips)는 BMP를 못 읽어
// 아래에 작은 BMP 해석기를 뒀다(무압축 8/24/32비트만 — 받은 파일이 모두 그 형식이다).
//
// 실행: cd client && node scripts/cutEmoticons.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'assets-src', 'emoticons');
const OUT = path.join(__dirname, '..', 'public', 'emoticon');
const MAX = 256; // 풍선은 180px — 고해상도 화면을 위해 조금 넉넉히(작은 원본은 키우지 않는다)

// 원본 파일 이름(확장자 뺀 것) → slug. shared/emotes.ts의 SP 목록과 같은 순서·이름이다.
const SP = {
  '따봉성표': 'thumbs_up',
  '역따봉성표': 'thumbs_down',
  '흐뭇성표_확대': 'pleased',
  '색시성표': 'sexy',
  '합장표': 'pray',
  '머쓱표': 'awkward',
  '꾸짖성표': 'scold',
  '부들성표': 'trembling',
  '크아악성표': 'argh',
  '티어스엉표_확대': 'tears',
  '헝그리성표': 'hungry',
  '혹성표': 'bump',
  '리치성표_확대': 'rich',
  '삭제된대화입니표': 'deleted',
  '표이스26': 'face26',
};

// 손동작 — 그림 속 다섯 손의 대략적인 중심(1536×1024 기준). 알파로 떨어진 조각(손·반짝이 표시)을 가장 가까운 중심에 붙인다.
const HANDS = [
  { slug: 'thumbs_up',   cx: 280,  cy: 290 },
  { slug: 'thumbs_down', cx: 760,  cy: 300 },
  { slug: 'point',       cx: 1280, cy: 290 },
  { slug: 'wave',        cx: 490,  cy: 750 },
  { slug: 'fist',        cx: 1060, cy: 760 },
];

/** 무압축 BMP(8비트 팔레트 · 24 · 32비트) → RGBA 버퍼 */
function decodeBmp(buf) {
  if (buf.toString('ascii', 0, 2) !== 'BM') throw new Error('BMP가 아님');
  const offset = buf.readUInt32LE(10);
  const headerSize = buf.readUInt32LE(14);
  const width = buf.readInt32LE(18);
  const rawH = buf.readInt32LE(22);
  const height = Math.abs(rawH);
  const bottomUp = rawH > 0;
  const bpp = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  if (compression !== 0 && compression !== 3) throw new Error(`압축 BMP(${compression})는 지원하지 않음`);
  const stride = Math.ceil((width * bpp) / 32) * 4;
  let palette = null;
  if (bpp === 8) {
    const colors = buf.readUInt32LE(46) || 256;
    const start = 14 + headerSize;
    palette = [];
    for (let i = 0; i < colors; i++) palette.push([buf[start + i * 4 + 2], buf[start + i * 4 + 1], buf[start + i * 4]]);
  }
  const out = Buffer.alloc(width * height * 4);
  let alphaSeen = false;
  for (let y = 0; y < height; y++) {
    const row = offset + (bottomUp ? height - 1 - y : y) * stride;
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      if (bpp === 8) {
        const [r, g, b] = palette[buf[row + x]];
        out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
      } else if (bpp === 24) {
        const p = row + x * 3;
        out[o] = buf[p + 2]; out[o + 1] = buf[p + 1]; out[o + 2] = buf[p]; out[o + 3] = 255;
      } else if (bpp === 32) {
        const p = row + x * 4;
        out[o] = buf[p + 2]; out[o + 1] = buf[p + 1]; out[o + 2] = buf[p]; out[o + 3] = buf[p + 3];
        if (buf[p + 3] !== 0) alphaSeen = true;
      } else {
        throw new Error(`${bpp}비트 BMP는 지원하지 않음`);
      }
    }
  }
  // 32비트 BMP는 알파 칸을 비워 둔(전부 0) 경우가 흔하다 — 그때는 불투명으로 본다.
  if (bpp === 32 && !alphaSeen) for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return { data: out, width, height };
}

async function toWebp(input, file) {
  await input
    .resize(MAX, MAX, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 100 })
    .toFile(file);
}

// ── SP ──
fs.mkdirSync(path.join(OUT, 'spticon'), { recursive: true });
for (const file of fs.readdirSync(path.join(SRC, 'spticon'))) {
  const name = path.parse(file).name;
  const slug = SP[name.normalize('NFC')];
  if (!slug) { console.warn(`  ? 목록에 없는 SP 그림: ${file}`); continue; }
  const src = path.join(SRC, 'spticon', file);
  const input = file.toLowerCase().endsWith('.bmp')
    ? (() => { const { data, width, height } = decodeBmp(fs.readFileSync(src)); return sharp(data, { raw: { width, height, channels: 4 } }); })()
    : sharp(src).ensureAlpha();
  const dest = path.join(OUT, 'spticon', `${slug}.webp`);
  await toWebp(input, dest);
  console.log(`  SP  ${file} → spticon/${slug}.webp (${fs.statSync(dest).size} B)`);
}

// ── 손동작 ──
{
  const { data, info } = await sharp(path.join(SRC, 'hand_emoticons.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const ALPHA_MIN = 8; // 이보다 옅은 픽셀은 바깥 번짐으로 보고 조각을 나누는 데 쓰지 않는다(잘라 낸 그림에는 그대로 남는다)
  const label = new Int32Array(W * H).fill(-1);
  const boxes = HANDS.map(() => ({ x0: W, y0: H, x1: -1, y1: -1 }));
  const stack = [];
  for (let start = 0; start < W * H; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] < ALPHA_MIN) continue;
    // 한 조각을 칠하면서 무게중심을 잰다
    const pixels = [];
    stack.push(start);
    label[start] = -2;
    let sx = 0, sy = 0;
    while (stack.length) {
      const k = stack.pop();
      pixels.push(k);
      const x = k % W, y = (k / W) | 0;
      sx += x; sy += y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (label[nk] !== -1 || data[nk * 4 + 3] < ALPHA_MIN) continue;
        label[nk] = -2;
        stack.push(nk);
      }
    }
    if (pixels.length < 30) continue; // 티끌
    const cx = sx / pixels.length, cy = sy / pixels.length;
    let best = 0, bestD = Infinity;
    HANDS.forEach((h, i) => { const d = (h.cx - cx) ** 2 + (h.cy - cy) ** 2; if (d < bestD) { bestD = d; best = i; } });
    const b = boxes[best];
    for (const k of pixels) {
      label[k] = best;
      const x = k % W, y = (k / W) | 0;
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
    }
  }

  fs.mkdirSync(path.join(OUT, 'hands'), { recursive: true });
  const PAD = 24; // 바깥 번짐(옅은 알파)이 잘리지 않게
  for (let i = 0; i < HANDS.length; i++) {
    const b = boxes[i];
    if (b.x1 < 0) throw new Error(`손 ${HANDS[i].slug}을 찾지 못함`);
    const x0 = Math.max(0, b.x0 - PAD), y0 = Math.max(0, b.y0 - PAD);
    const x1 = Math.min(W - 1, b.x1 + PAD), y1 = Math.min(H - 1, b.y1 + PAD);
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    // 이 손에 속하지 않은 조각(옆 손의 끝자락)은 지운다 — 상자가 겹칠 수 있다
    const crop = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const k = (y0 + y) * W + (x0 + x);
        const o = (y * w + x) * 4;
        const own = label[k] === i || (label[k] === -1 && nearestOwner(x0 + x, y0 + y) === i);
        if (!own) continue;
        data.copy(crop, o, k * 4, k * 4 + 4);
      }
    }
    const dest = path.join(OUT, 'hands', `${HANDS[i].slug}.webp`);
    await toWebp(sharp(crop, { raw: { width: w, height: h, channels: 4 } }), dest);
    console.log(`  손  ${HANDS[i].slug} ${w}×${h} → hands/${HANDS[i].slug}.webp (${fs.statSync(dest).size} B)`);
  }

  // 옅은 번짐 픽셀(조각에 안 든 것)은 가장 가까운 손 중심의 것으로 친다
  function nearestOwner(x, y) {
    let best = 0, bestD = Infinity;
    HANDS.forEach((h, i) => { const d = (h.cx - x) ** 2 + (h.cy - y) ** 2; if (d < bestD) { bestD = d; best = i; } });
    return best;
  }
}
