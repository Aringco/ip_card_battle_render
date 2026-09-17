// 플레이 화면 UI 에셋 자르기 — 시트들 → public/play/*.webp
//
//   node scripts/cutPlaySheet.mjs
//
// 입력은 `client/assets-src/*.png`(받은 원본, **알파 없는 3채널**)이다.
// ⚠️ 원본은 `public/` **밖**에 둔다 — 수 MB짜리 시트가 public에 있으면 쓰이지도
//    않으면서 빌드 산출물에 그대로 복사돼 배포에 실린다.
// 편집기의 체커보드가 픽셀로 구워져 있어, 먼저 그것을 지워 투명도를 되살린 뒤 자른다.
//
// ── 왜 이렇게 자르는가 ────────────────────────────────────────────────────
// ① **전역 임계값으로 "밝은 회색 = 배경"이라 지우면 안 된다.** 그림 안의 밝은 회색
//    (돌·양피지 하이라이트)까지 뚫린다. 테두리에서 **연결된 것만** flood fill로 지운다.
// ② **사각형으로 자르면 이웃 조각이 딸려 온다.** 시트는 조각들이 빽빽해 경계상자
//    안에 옆 그림의 잎사귀가 들어온다(실제로 board_h 위·아래에 들어왔다). 그래서
//    **연결 성분 단위**로 골라 그 성분이 아닌 화소는 알파 0으로 지운다.
// ③ **조각은 자기 경계상자에 바짝 자른다.** border-image의 슬라이스는 그림 가장자리
//    부터 재므로 투명 여백이 끼면 그만큼 어긋난다.
//
// ⚠️ 여기서 나온 크기가 바뀌면 globals.css의 슬라이스/테두리 값도 함께 고쳐야 한다.
//    대응표는 `client/public/play/README.md`에 있다.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.join(__dirname, '..', 'assets-src');
const OUT_DIR = path.join(__dirname, '..', 'public', 'play');

/**
 * 잘라낼 조각 — `at`은 그 조각의 **연결 성분 경계상자**다. 이 값으로 성분을 고르고,
 * 그 성분만 남겨 경계상자에 자른다. 새 시트의 좌표를 찍는 법은 이 파일 맨 아래 주석에.
 *
 *   sub      … 그 성분 안에서 다시 잘라낼 구역(시트 좌표). 맨 윗줄처럼 두 조각이
 *              덩굴로 이어져 한 성분이 된 경우에만 쓴다.
 *   mirrorCap… 왼쪽 끝을 오른쪽 끝의 좌우 반전으로 만들어 붙인다(들보 전용).
 *   trimTop  … 위쪽 몇 줄을 버린다(옆 조각에서 가늘게 이어진 부스러기 제거용).
 * 시트 단위 옵션
 *   stripTop … 시트 맨 위 몇 줄을 통째로 지운다. 배경 제거가 남긴 **가장자리 띠**
 *              전용이다 — 폭 전체를 가로지르므로 그대로 두면 그 줄이 닿는 조각이
 *              전부 한 성분으로 붙어 버린다(실제로 상단 바가 시트 전체 폭으로 잡혔다).
 *
 * 조각 단위 옵션
 *   hollow   … **가운데를 뚫는다.** 테두리에서 출발하는 flood fill은 액자 **안쪽**에
 *              닿지 못해(금색 막대가 막는다) 체커보드가 그대로 남는다 — 가운데에서
 *              한 번 더 fill해 비운다. 안이 비어야 하는 액자에만 쓴다.
 *   holes    … **둘러싸인 흰 칸을 전부 뚫는다**(칸막이가 그려진 통짜 액자용).
 *              true면 넓이 2000px 이상인 흰 덩어리를 칸으로 본다. 숫자를 주면 그 값이 하한.
 */
const SHEETS = [
  {
    // 마스터 시트 — 2560×1376. `play_ui_sheet.png`와 **같은 배치의 깨끗한 재수출본**이다
    // (알파가 제대로 살아 있고, 예전 것은 체커보드가 구워져 있어 경계상자가 2~4px씩
    // 달랐다). 상단 바까지 이 한 장에서 나오므로 예전 시트 둘은 걷어냈다.
    src: 'master_sheet.png',
    stripTop: 6,
    pieces: [
      // 맨 윗줄 통째 = 상단 바(팻말 + 들보 + 덩굴 마무리가 한 몸)
      { name: 'upper_bar', at: [34, 6, 2500, 233] },

      // ── 나무 액자 + 양피지 (9분할) ──
      { name: 'board_h', at: [21, 221, 752, 552] },
      { name: 'board_sq', at: [1568, 379, 502, 459] },
      { name: 'board_v', at: [769, 425, 271, 378] },

      // ── 줄 노트 (9분할) ──
      { name: 'note_green', at: [633, 947, 266, 370] },
      { name: 'note_pink', at: [916, 947, 272, 377] },
      { name: 'note_green_rows', at: [23, 925, 289, 406] },
      { name: 'note_pink_rows', at: [327, 925, 293, 407] },

      // ── 알약·띠 (가로 3분할) ──
      { name: 'pill_gold', at: [1569, 238, 194, 118] },
      { name: 'pill_wood', at: [1784, 244, 248, 101] },
      { name: 'pill_leaf', at: [2049, 230, 278, 125] },
      { name: 'pill_sm_green', at: [1061, 754, 156, 81] },
      { name: 'pill_sm_wood', at: [1235, 754, 154, 80] },
      { name: 'pill_sm_gold', at: [1406, 748, 146, 84] },
      { name: 'acorn_bar', at: [28, 760, 619, 164] },
      { name: 'bar_dark', at: [1050, 415, 510, 186] },
      { name: 'bar_light', at: [1044, 592, 518, 146] },
      { name: 'bar_sm', at: [665, 813, 373, 119] },
      { name: 'plank', at: [781, 230, 535, 196] },
      { name: 'label_small', at: [2269, 604, 256, 182] },

      // ── 게이지 ──
      // 예전 시트에서는 옆 조각의 흰 부스러기가 붙어 trimTop이 필요했는데,
      // 이 재수출본은 깨끗해서 그럴 일이 없다(y가 855 → 867로 그 몫만큼 내려왔다).
      { name: 'gauge', at: [1064, 857, 502, 59] },
      { name: 'gauge_fill', at: [1596, 861, 239, 53] },
      { name: 'gauge_track', at: [1857, 861, 170, 53] },

      // ── 고정 크기 ──
      { name: 'arrow_green', at: [2351, 245, 197, 113] },
      { name: 'arrow_wood', at: [2135, 373, 362, 221] },
      { name: 'badge_crown', at: [2068, 616, 183, 186] },
      { name: 'icon_lock', at: [1377, 1223, 94, 114] },
      { name: 'icon_acorn', at: [1242, 1232, 75, 100] },
      { name: 'icon_cog', at: [1679, 1233, 100, 103] },

      // ── 귀퉁이 장식 ──
      { name: 'decor_log', at: [1207, 935, 407, 138] },
      { name: 'decor_bush', at: [2106, 965, 171, 152] },
      { name: 'decor_grass', at: [1217, 1076, 203, 137] },
      { name: 'decor_stump', at: [2214, 836, 141, 120] },
      { name: 'decor_cattail', at: [2368, 791, 167, 173] },
      { name: 'decor_stones', at: [2385, 1248, 152, 73] },
      { name: 'decor_mushroom', at: [2022, 1196, 127, 138] },
    ],
  },
  {
    // 카드(기술 칸)를 감싸는 금색 액자 시트 — 1920×1040
    src: 'card_frame_sheet.png',
    pieces: [
      { name: 'card_frame', at: [202, 145, 826, 687], hollow: true }, // 금색 사각 액자 (9분할·fill 없음)
      { name: 'card_corner_tl', at: [42, 43, 216, 189] },   // 네 모서리 장식 — 고정 크기
      { name: 'card_corner_tr', at: [977, 43, 211, 188] },
      { name: 'card_corner_bl', at: [50, 735, 191, 229] },
      { name: 'card_corner_br', at: [991, 738, 187, 225] },
      { name: 'card_plaque', at: [1161, 282, 696, 331] },   // 이름표 칸 — **보류**(에셋만 만들어 둔다)
      { name: 'leaf_decal_1', at: [1266, 731, 150, 212] },  // 잎 데칼 4종
      { name: 'leaf_decal_2', at: [1448, 732, 124, 201] },
      { name: 'leaf_decal_3', at: [1602, 776, 109, 170] },
      { name: 'leaf_decal_4', at: [1746, 762, 126, 176] },
    ],
  },
  {
    // 양피지 시트 — 2560×1360. 여기 있던 나무테(`wf_*`)와 통나무 바(`log_bar`)는
    // `frames_sheet.png`의 액자 3종으로 대체돼 걷어냈다. 지금은 종이만 남는다.
    src: 'frame_sheet.png',
    pieces: [
      // 양피지(내부 영역)
      { name: 'pg_card', at: [46, 135, 310, 509] },     // 세로 카드
      { name: 'pg_bar_lg', at: [384, 135, 895, 164] },  // 가로 넓은 띠
      { name: 'pg_bar_md', at: [384, 317, 895, 151] },
      { name: 'pg_bar_sm', at: [384, 487, 601, 155] },
      { name: 'pg_square', at: [1014, 487, 257, 262] }, // 작은 정사각
      { name: 'pg_strip', at: [50, 668, 930, 87] },     // 가늘고 긴 띠
    ],
  },
  {
    // 나무 액자 3종 + 양피지 3종 — 2560×1856. **액자와 종이가 따로** 그려져 있고,
    // 가로/정사각/세로 세 비율이 한 벌씩이라 **쓸 자리의 비율에 맞춰 고른다**
    // (늘여서 맞추는 게 아니라 비슷한 비율을 골라 9분할로 조금만 늘리기 위해서다).
    // ⚠️ 액자는 전부 `hollow` — 나무가 사방을 막아 테두리발 flood fill이 안쪽에 못 닿는다.
    src: 'frames_sheet.png',
    pieces: [
      { name: 'frame_wide', at: [27, 127, 1153, 752], hollow: true },
      { name: 'frame_square', at: [1234, 94, 703, 782], hollow: true },
      { name: 'frame_tall', at: [2053, 51, 482, 861], hollow: true },
      { name: 'paper_wide', at: [51, 999, 1100, 729] },
      { name: 'paper_square', at: [1258, 1003, 643, 737] },
      { name: 'paper_tall', at: [2050, 991, 453, 759] },
    ],
  },
  {
    // 팀 이름표 알약 두 장 — 우리팀(연두) · 상대팀(빨강).
    //
    // ⚠️ 예전에는 연두 알약 하나에 `hue-rotate`를 걸어 빨강을 만들었는데, 그러면 양 끝
    //    **잎사귀까지 함께 돌아 분홍**이 됐다. 이제 빨강이 그림으로 따로 와서 잎이 제 색이다.
    src: 'team_pills.png',
    pieces: [
      { name: 'pill_green', at: [34, 255, 410, 227] },
      { name: 'pill_red', at: [463, 255, 412, 228] },
    ],
  },
  {
    // 플레이 화면 **통짜 액자** — 칸막이가 그려져 있어 칸 10개가 한 그림 안에 있다.
    //
    // ⚠️ **9분할로 늘릴 수 없다.** 안쪽 칸막이가 늘어나는 가운데 영역에 들어 있어,
    //    늘리면 칸막이 간격이 따로 논다. 상단 바와 같은 방식으로 **통째로 확대**하고
    //    내용은 그림 좌표의 비율로 절대배치한다(globals.css의 `.play-frame` 절).
    //    그래서 여기서 나오는 크기 1965×1000은 **CSS의 aspect-ratio와 짝**이다.
    //    흰 배경 JPEG로 받아 칸 10개가 흰 판으로 채워져 있다 — holes로 전부 뚫는다.
    src: 'play_frame.png',
    pieces: [
      { name: 'play_frame', at: [23, 32, 1965, 1000], holes: true },
    ],
  },
];

const isChecker = (r, g, b) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx - mn <= 12 && (r + g + b) / 3 >= 193;
};

/** 시트 하나를 읽어 알파를 되살리고 연결 성분까지 계산한다. */
async function loadSheet(file, { stripTop = 0 } = {}) {
  const { data, info } = await sharp(path.join(SRC_DIR, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, C = info.channels, N = W * H;

  // ── ① 체커보드 지우기 (테두리에서 연결된 것만) ──
  // ⚠️ **소스의 알파를 그대로 물려받고 시작한다.** 255로 채우고 시작하면 알파가 이미
  // 살아 있는 4채널 시트(체커보드가 안 구워진 원본)를 받았을 때 투명한 자리까지 전부
  // 불투명으로 잡혀, 조각이 그림 전체 크기로 잘린다. 3채널 시트는 ensureAlpha가 255를
  // 채워 주므로 이 줄을 바꿔도 예전 동작과 똑같다.
  const alpha = new Uint8Array(N);
  for (let i = 0; i < N; i++) alpha[i] = data[i * C + 3];

  // ── ①-a 가장자리 띠 지우기 ──
  // 배경을 지운 시트에 **폭 전체를 가로지르는 불투명한 줄**이 남아 오는 일이 있다
  // (색 보정본에서 맨 위 6줄이 거의 검은색 alpha 255로 왔다). 체커보드가 아니라서
  // 위의 flood fill로는 지워지지 않고, 그 줄에 닿는 조각이 전부 한 성분으로 붙는다.
  // 성분을 세기 **전에** 지워야 한다.
  for (let y = 0; y < stripTop; y++) for (let x = 0; x < W; x++) alpha[y * W + x] = 0;

  const seen = new Uint8Array(N);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = y * W + x;
    if (seen[i]) return;
    const o = i * C;
    if (!isChecker(data[o], data[o + 1], data[o + 2])) return;
    seen[i] = 1; alpha[i] = 0; stack.push(i);
  };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) {
    const i = stack.pop(); const x = i % W, y = (i / W) | 0;
    push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
  }
  // 경계 한 겹은 체커와 그림이 섞인 화소라 그대로 두면 흰 테가 남는다 — 회색기가
  // 강할수록 많이 깎는다.
  const edge = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    if (!alpha[i]) continue;
    if (alpha[i - 1] && alpha[i + 1] && alpha[i - W] && alpha[i + W]) continue;
    const o = i * C, r = data[o], g = data[o + 1], b = data[o + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), br = (r + g + b) / 3;
    if (mx - mn <= 20 && br >= 175) edge.push([i, Math.max(0, Math.round(255 * (1 - (br - 175) / 80)))]);
  }
  for (const [i, a] of edge) alpha[i] = a;

  // ── ② 연결 성분 ──
  const label = new Int32Array(N).fill(-1);
  const boxes = [];
  for (let s = 0; s < N; s++) {
    if (label[s] !== -1 || alpha[s] <= 16) continue;
    const id = boxes.length; const st = [s]; label[s] = id;
    let minx = W, miny = H, maxx = -1, maxy = -1;
    while (st.length) {
      const i = st.pop(); const x = i % W, y = (i / W) | 0;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (label[j] !== -1 || alpha[j] <= 16) continue;
        label[j] = id; st.push(j);
      }
    }
    boxes.push([minx, miny, maxx - minx + 1, maxy - miny + 1]);
  }
  return { data, alpha, label, boxes, W, H, C };
}

/** 성분 하나만 남긴 RGBA 버퍼를 만든다(지정 구역으로 자른 뒤 알파 경계상자에 바짝 자름). */
function extractComp(sheet, compId, rect) {
  const { data, alpha, label, W, C } = sheet;
  const [rx, ry, rw, rh] = rect;
  let minx = rw, miny = rh, maxx = -1, maxy = -1;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const i = (ry + y) * W + (rx + x);
    if (label[i] !== compId || alpha[i] <= 8) continue;
    if (x < minx) minx = x; if (x > maxx) maxx = x;
    if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  const w = maxx - minx + 1, h = maxy - miny + 1;
  const buf = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (ry + miny + y) * W + (rx + minx + x);
    const di = (y * w + x) * 4;
    if (label[si] !== compId) continue; // 이웃 조각은 지운다
    const o = si * C;
    buf[di] = data[o]; buf[di + 1] = data[o + 1]; buf[di + 2] = data[o + 2]; buf[di + 3] = alpha[si];
  }
  return { buf, w, h };
}

// ── `--list <시트>` — 그 시트의 성분 경계상자를 그대로 찍는다 ─────────────────
// ⚠️ 눈으로 잰 경계상자를 그대로 쓰면 안 된다. 위 loadSheet는 체커보드를 지운 뒤
// **경계 한 겹의 알파를 깎는** 보정까지 하므로, 원본을 그냥 훑어 잰 값과 1~2px 어긋난다
// (실제로 상단 바가 그 차이로 "성분을 못 찾음"이 났다). 반드시 이 명령으로 찍을 것.
const listIdx = process.argv.indexOf('--list');
if (listIdx !== -1) {
  const file = process.argv[listIdx + 1];
  // 그 시트에 등록된 옵션을 그대로 적용한다 — 안 그러면 목록과 실제 자르기가 어긋난다
  // (stripTop 없이 훑으면 가장자리 띠 때문에 조각들이 한 성분으로 붙어 나온다).
  const sheet = await loadSheet(file, SHEETS.find(s => s.src === file) ?? {});
  const rows = sheet.boxes
    .map(b => ({ x: b[0], y: b[1], w: b[2], h: b[3], a: b[2] * b[3] }))
    .filter(b => b.a > 3000)
    .sort((p, q) => p.y - q.y || p.x - q.x);
  console.log(`${file} — 성분 ${sheet.boxes.length}개 중 3000px 초과 ${rows.length}개`);
  for (const b of rows) console.log(`  { at: [${b.x}, ${b.y}, ${b.w}, ${b.h}] },`);
  process.exit(0);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const report = [];

for (const { src, pieces, ...sheetOpts } of SHEETS) {
  const sheet = await loadSheet(src, sheetOpts);
  const findComp = ([x, y, w, h]) => {
    const i = sheet.boxes.findIndex(b => b[0] === x && b[1] === y && b[2] === w && b[3] === h);
    if (i === -1) throw new Error(`${src}에서 성분을 못 찾음: ${x},${y},${w},${h} — 시트가 바뀌었으면 경계상자를 다시 찍을 것`);
    return i;
  };

  for (const piece of pieces) {
    const compId = findComp(piece.at);
    let { buf, w, h } = extractComp(sheet, compId, piece.sub ?? piece.at);

    if (piece.hollow) {
      // 가운데에서 출발해 체커보드 색인 화소만 지운다. 금색 막대·초록 잎은 중성회색이
      // 아니므로 걸리지 않고, 막대에 막혀 바깥으로도 새지 않는다.
      const q = [((h >> 1) * w + (w >> 1))];
      const gone = new Uint8Array(w * h);
      while (q.length) {
        const i = q.pop();
        if (gone[i]) continue;
        const o = i * 4, r = buf[o], g = buf[o + 1], b = buf[o + 2];
        if (buf[o + 3] === 0) { gone[i] = 1; continue; }
        if (!isChecker(r, g, b)) continue;
        gone[i] = 1; buf[o + 3] = 0;
        const x = i % w, y = (i / w) | 0;
        if (x > 0) q.push(i - 1);
        if (x < w - 1) q.push(i + 1);
        if (y > 0) q.push(i - w);
        if (y < h - 1) q.push(i + w);
      }
    }

    if (piece.holes) {
      // 나무에 **둘러싸인 흰 칸을 전부** 뚫는다(칸막이가 그려진 통짜 액자용).
      // hollow는 가운데에서 한 번만 채우므로 칸이 여러 개면 가운데 칸만 비고 나머지는
      // 흰 판으로 남는다. 여기서는 흰 덩어리를 모두 세어, 일정 넓이 이상이면 칸으로 본다 —
      // 나뭇결의 밝은 점 몇 개가 뚫리지 않도록 넓이 하한을 둔다.
      const seen = new Uint8Array(w * h);
      const minArea = piece.holes === true ? 2000 : piece.holes;
      let holeCount = 0;
      for (let s = 0; s < w * h; s++) {
        if (seen[s] || buf[s * 4 + 3] === 0 || !isChecker(buf[s * 4], buf[s * 4 + 1], buf[s * 4 + 2])) continue;
        const region = [s]; seen[s] = 1;
        for (let k = 0; k < region.length; k++) {
          const i = region[k], x = i % w, y = (i / w) | 0;
          for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
            if (j < 0 || seen[j] || buf[j * 4 + 3] === 0) continue;
            if (!isChecker(buf[j * 4], buf[j * 4 + 1], buf[j * 4 + 2])) continue;
            seen[j] = 1; region.push(j);
          }
        }
        if (region.length < minArea) continue;
        holeCount++;
        for (const i of region) buf[i * 4 + 3] = 0;
      }
      // 칸 가장자리 한 겹은 흰색과 나무가 섞인 화소라 그대로 두면 흰 테가 남는다 —
      // 바깥 배경을 지울 때(loadSheet)와 같은 식으로 밝을수록 많이 깎는다.
      const soften = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (!buf[i * 4 + 3]) continue;
        if (buf[(i - 1) * 4 + 3] && buf[(i + 1) * 4 + 3] && buf[(i - w) * 4 + 3] && buf[(i + w) * 4 + 3]) continue;
        const r = buf[i * 4], g = buf[i * 4 + 1], b = buf[i * 4 + 2];
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), br = (r + g + b) / 3;
        if (mx - mn <= 20 && br >= 175) soften.push([i, Math.max(0, Math.round(255 * (1 - (br - 175) / 80)))]);
      }
      for (const [i, a] of soften) buf[i * 4 + 3] = Math.min(buf[i * 4 + 3], a);
      console.log(`  ${piece.name}: 칸 ${holeCount}개를 뚫음`);
    }

    if (piece.trimTop) {
      buf = await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
        .extract({ left: 0, top: piece.trimTop, width: w, height: h - piece.trimTop })
        .raw().toBuffer();
      h -= piece.trimTop;
    }

    // 들보만 — 왼쪽 끝을 오른쪽 끝의 좌우 반전으로 만들어 붙인다. 시트의 들보는 왼쪽
    // 끝이 이름표에 가려 마무리가 없어서, 그대로 쓰면 잘린 단면이 드러난다.
    if (piece.mirrorCap) {
      const cap = piece.mirrorCap;
      const capBuf = await sharp(buf, { raw: { width: w, height: h, channels: 4 } })
        .extract({ left: w - cap, top: 0, width: cap, height: h }).flop().png().toBuffer();
      const body = await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
      buf = await sharp({ create: { width: w + cap, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: capBuf, left: 0, top: 0 }, { input: body, left: cap, top: 0 }])
        .raw().toBuffer();
      w += cap;
    }

    const file = path.join(OUT_DIR, `${piece.name}.webp`);
    await sharp(buf, { raw: { width: w, height: h, channels: 4 } }).webp({ quality: 92 }).toFile(file);
    report.push([piece.name, w, h, fs.statSync(file).size]);
  }
}

console.log('이름'.padEnd(18) + '크기'.padEnd(14) + '용량');
let total = 0;
for (const [n, w, h, size] of report) {
  total += size;
  console.log(n.padEnd(20) + `${w}×${h}`.padEnd(14) + `${(size / 1024).toFixed(1)}KB`);
}
console.log(`\n조각 ${report.length}개 · 합계 ${(total / 1024).toFixed(0)}KB → ${OUT_DIR}`);

// ── 새 시트의 경계상자를 찍으려면 ────────────────────────────────────────────
//   node scripts/cutPlaySheet.mjs --list 새시트.png
