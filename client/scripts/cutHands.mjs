/**
 * 가이드 손 그림 자르기 — `assets-src/hands/hand_0N.png` → `public/ui/hand_*.webp`
 *
 *   node scripts/cutHands.mjs
 *
 * ── 왜 "가장 큰 성분"만 남기는가 ────────────────────────────────────────────
 * 받은 그림에는 손끝 **아래에 작은 불꽃 표시 세 개**가 따로 떠 있다. 그대로 두면
 * 그림의 아래쪽 10% 남짓이 손이 아닌 것으로 채워지는데, 이 손은 CSS가 **자기 높이의
 * 비율로** 자리를 잡으므로(`.place-guide-hand`의 translate) 손끝이 그만큼 위로 밀린다.
 * 게다가 이 손은 이미 통통 튀는 애니메이션(`guideHandBounce`)이 걸려 있어, 정지한
 * 불꽃 표시가 함께 튀면 움직임이 두 겹으로 보인다.
 *
 * 그래서 **연결 성분 중 가장 큰 것(= 손)** 만 남기고 그 경계상자로 바짝 자른다.
 * 기존 손 그림들과 구도가 같아져(손끝이 그림 맨 아래) CSS를 한 줄도 고치지 않아도 된다.
 *
 * ⚠️ 불꽃 표시를 살리려면 이 필터를 끄고 `.place-guide-hand`의 translate와 width를
 *    **함께** 다시 잡아야 한다 — 손끝 위치와 손의 겉보기 크기가 둘 다 달라진다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(__dirname, '..', 'assets-src', 'hands');
const OUT = path.join(__dirname, '..', 'public', 'ui');

/** 받은 번호 → 쓰이는 이름. 번호만으로는 누구 손인지 알 수 없으므로 여기서 이어 둔다. */
const MAP = [
  { src: 'hand_01.png', out: 'hand_tiger.webp', who: '특허랑이 — 줄무늬 + 톱니' },
  { src: 'hand_02.png', out: 'hand_sheep.webp', who: '실용신양 — 양털 + 가죽 벨트' },
  { src: 'hand_03.png', out: 'hand_mermaid.webp', who: '디자인어 — 초록 손수건 + 산호' },
  { src: 'hand_04.png', out: 'hand_rabbit.webp', who: '상표토끼 — 분홍 털 + 도토리' },
  { src: 'hand_05.png', out: 'hand_computer.webp', who: '모이퓨터 — 금속 손' },
  { src: 'hand_06.png', out: 'hand_point.webp', who: '기본 — 주인 없는 자리(👇 대체)' },
];

/** 그림에서 가장 큰 연결 성분을 찾는다(= 손). 경계상자와 **그 성분의 화소 표식**을 함께 준다.
 *  ⚠️ 경계상자만으로 잘라내면 안 된다 — 불꽃 표시가 손의 경계상자 **안쪽까지** 올라와 있어
 *     사각형으로 자르면 그 윗부분이 딸려 온다(실제로 주황 조각이 남았다). */
function biggestComponent(alpha, W, H) {
  const label = new Int32Array(W * H).fill(-1);
  let id = 0, best = null;
  for (let s = 0; s < W * H; s++) {
    if (alpha[s] <= 128 || label[s] >= 0) continue;
    const mine = id++;
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
    const st = [s];
    label[s] = mine;
    while (st.length) {
      const i = st.pop(); const x = i % W, y = (i / W) | 0;
      n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (alpha[j] > 128 && label[j] < 0) { label[j] = mine; st.push(j); }
      }
    }
    if (!best || n > best.n) best = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n, id: mine };
  }
  return best ? { ...best, label } : null;
}

fs.mkdirSync(OUT, { recursive: true });
const rows = [];
for (const { src, out, who } of MAP) {
  const file = path.join(SRC, src);
  if (!fs.existsSync(file)) throw new Error(`원본이 없다: ${file}`);
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;
  const alpha = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) alpha[i] = data[i * C + 3];

  const box = biggestComponent(alpha, W, H);
  if (!box) throw new Error(`${src}: 성분을 못 찾음`);
  const dropped = H - (box.y + box.h);

  // 성분 밖 화소(불꽃 표시)를 지운 뒤 경계상자로 바짝 자른다 — 손끝이 그림 맨 아래에 온다.
  const cut = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const si = ((box.y + y) * W + (box.x + x));
      const di = (y * box.w + x) * 4;
      const mine = box.label[si] === box.id;
      cut[di] = data[si * C]; cut[di + 1] = data[si * C + 1]; cut[di + 2] = data[si * C + 2];
      cut[di + 3] = mine ? data[si * C + 3] : 0;
    }
  }
  // 세로 500px로 맞춘다 — 화면에서는 3.4rem(≈54px)로 그려지므로 9배가 넘는다.
  const buf = await sharp(cut, { raw: { width: box.w, height: box.h, channels: 4 } })
    .resize({ height: 500 })
    .webp({ quality: 92 })
    .toBuffer();
  fs.writeFileSync(path.join(OUT, out), buf);
  const m = await sharp(buf).metadata();
  rows.push({ src, out, who, size: `${m.width}×${m.height}`, kb: (buf.length / 1024).toFixed(1), dropped });
}

console.log('원본        →  결과                크기       용량     아래로 버린 px(불꽃 표시)');
for (const r of rows) {
  console.log(
    `${r.src.padEnd(12)}→  ${r.out.padEnd(20)}${r.size.padEnd(11)}${(r.kb + 'KB').padEnd(9)}${r.dropped}`,
  );
}
console.log('\n' + rows.map(r => `  ${r.out.replace('.webp', '').padEnd(14)}${r.who}`).join('\n'));
