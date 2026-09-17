/**
 * 액자의 좌우를 **정확히 대칭**으로 만든다 — 왼쪽 절반을 잘라 오른쪽에 뒤집어 붙인다.
 *
 *   node scripts/mirrorPlayFrame.mjs <입력.png> [출력.png]
 *
 * ── 왜 "세로 기둥을 잘라 폭 맞추기"로는 안 되는가 ────────────────────────────
 * 받은 그림의 비대칭은 두 종류다.
 *
 *   아랫줄  체력칸  왼 117 / 오 131   (14px)
 *   양쪽    바깥 여백 왼 4 / 오 10    (6px)
 *   아랫줄  카드칸  왼 173 / 오 169   (4px)
 *
 * 세로로 한 줄을 지우면 **윗줄과 아랫줄이 함께** 줄어든다. 그런데 두 줄의 칸 경계가
 * 서로 어긋나 있다:
 *
 *   왼쪽  경험치칸 오른쪽 끝(208)이 첫 카드칸 시작(183)보다 **25px 안쪽**
 *   오른쪽 경험치칸 왼쪽 끝(1155)이 끝 카드칸 끝(1164)보다 **9px 바깥**
 *
 * 이 25 대 9를 맞추려면 x 1155~1164 **딱 그 9px 구간에만** 16px을 끼워 넣어야 하는데,
 * 그 구간은 두 줄 모두 **둥근 모서리가 그려진 자리**라 손대면 모서리가 늘어난다.
 * 그래서 칼질(열 삽입·삭제)만으로는 완전한 대칭이 나오지 않는다.
 *
 * ── 그래서 좌우 반전 ────────────────────────────────────────────────────────
 * 왼쪽 절반을 그대로 두고 오른쪽을 그 거울상으로 바꾼다. 늘이거나 줄이는 곳이 한 군데도
 * 없고(그림의 비율·디자인 불변), 모서리도 원본 그대로 옮겨온다. 결과는 **정의상** 완전
 * 대칭이다. 카드칸과 체력칸의 폭이 서로 달라야 한다는 조건도 그대로 지켜진다
 * (카드 172~174 · 체력 117).
 *
 * 반전 축은 **가운데 카드칸의 한가운데**로 잡는다 — 그 칸이 원래 폭(172)을 그대로
 * 유지하고, 축이 지나는 자리가 두 줄 모두 빈 구멍이라 이음매가 나무를 가르지 않는다
 * (가로 들보 세 줄만 축에서 무늬가 마주 보는데, 결이 가로로 흐르는 그림이라 티가 없다).
 *
 * ⚠️ 오른쪽에만 있던 잎 장식은 왼쪽 것의 거울상으로 바뀐다. 장식이 좌우로 짝을 이루게
 *    되는 쪽이 액자로서는 더 정돈돼 보이지만, 원본과 다른 점이므로 적어 둔다.
 */
import path from 'node:path';
import sharp from 'sharp';

const inPath = process.argv[2] ?? 'assets-src/play_frame.png';
const outPath = process.argv[3] ?? inPath;

const { data, info } = await sharp(inPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: W, height: H, channels: C } = info;
const solid = (x, y) => data[(y * W + x) * C + 3] > 128;

// ── ① 액자 경계상자
let fx0 = 1e9, fy0 = 1e9, fx1 = -1, fy1 = -1;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!solid(x, y)) continue;
  if (x < fx0) fx0 = x; if (x > fx1) fx1 = x;
  if (y < fy0) fy0 = y; if (y > fy1) fy1 = y;
}
const FW = fx1 - fx0 + 1, FH = fy1 - fy0 + 1;

// ── ② 반전 축 = 가운데(세 번째) 카드칸의 한가운데
//    아랫줄을 가로로 훑어 구멍 일곱 개를 찾고, 그중 가운데 카드칸을 고른다.
const scanY = fy0 + Math.round(FH * 0.75); // 카드 줄 한복판
const holes = [];
let run = null;
for (let x = 0; x < FW; x++) {
  const s = solid(fx0 + x, scanY);
  if (!s && !run) run = { start: x };
  if (s && run) { holes.push({ ...run, end: x, w: x - run.start }); run = null; }
}
// 양 끝의 바깥 여백(투명)은 구멍이 아니다 — 폭이 큰 것만 남긴다
const cells = holes.filter(h => h.w > 40);
if (cells.length !== 7) throw new Error(`아랫줄에서 칸 7개를 못 찾음(${cells.length}개) — scanY를 조정할 것`);
const mid = cells[3];                       // 체력 + 카드5 중 한가운데 = 세 번째 카드칸
const axis = Math.round((mid.start + mid.end) / 2);
console.log(`액자 ${FW}×${FH} · 아랫줄 칸 폭 ${cells.map(c => c.w).join(' ')}`);
console.log(`반전 축: 액자 기준 x=${axis} (가운데 카드칸 ${mid.start}~${mid.end})`);

// ── ③ 왼쪽 절반 + 그 거울상
const NW = axis * 2;
const out = Buffer.alloc(NW * H * 4);
for (let y = 0; y < H; y++) {
  for (let nx = 0; nx < NW; nx++) {
    // 오른쪽 절반은 왼쪽 절반을 되짚는다: nx와 (NW-1-nx)가 같은 원본 열을 본다
    const srcRel = nx < axis ? nx : NW - 1 - nx;
    const sx = fx0 + srcRel;
    const si = (y * W + sx) * C, di = (y * NW + nx) * 4;
    out[di] = data[si]; out[di + 1] = data[si + 1]; out[di + 2] = data[si + 2];
    out[di + 3] = C === 4 ? data[si + 3] : 255;
  }
}

await sharp(out, { raw: { width: NW, height: H, channels: 4 } }).png().toFile(outPath);
console.log(`→ ${path.basename(outPath)}  ${NW}×${H}  (액자 폭 ${FW} → ${NW})`);
