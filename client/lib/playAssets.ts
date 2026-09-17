/**
 * 플레이 화면 에셋 경로 — **여기 한 곳에서만 참조한다**(로비의 `lobbyAssets.ts`와 같은 원칙).
 *
 * 전부 `client/assets-src/play_ui_sheet.png` 한 장에서 잘라냈다. 다시 자르려면
 *   cd client && node scripts/cutPlaySheet.mjs
 * 조각 크기와 분할 값(슬라이스·테두리)은 `client/public/play/README.md`에 있다.
 *
 * ⚠️ 이 파일은 **경로만** 담는다. 분할 값은 CSS(globals.css의 "플레이 화면 — 나무 UI"
 * 절)에 있다 — 한 에셋을 크기가 다른 두 자리에 쓰면 테두리 두께가 달라져야 하는데,
 * 그건 그 자리를 아는 CSS가 정할 일이기 때문이다.
 */
export const PLAY_ASSETS = {
  /**
   * 플레이 화면 배경 — 숲길 일러스트 (2560×1360 WebP).
   *
   * 판(팀 패널·카드판·해설판)은 나무테와 양피지로 불투명하니, 이 그림이 실제로 보이는
   * 곳은 판 **사이의 틈**과 화면 가장자리다. 그래서 밝고 복잡해도 글자 읽기를 방해하지
   * 않는다 — 대신 틈이 좁아 그림의 구도가 거의 안 보이므로, 갈아끼울 때 "가운데에 무엇이
   * 있는가"보다 **전체 색조**가 UI와 어울리는지를 먼저 본다.
   */
  background: '/play/play_bg.webp',
  /**
   * 상단 바 — **들보와 팻말이 한 몸인** 통짜 그림(2500×233).
   *
   * 가로 3분할의 **왼쪽 마구리가 곧 팻말**이라, 팀 이름과 "○○ 차례"를 그 양피지
   * 자리에 글자만 얹는다. 좌표는 전부 `--beam-h` 하나에서 파생한다(globals.css의
   * `.play-beam` / `.play-nameplate`) — 높이가 화면 따라 바뀌는데 마구리를 고정
   * px로 두면 팻말만 홀로 찌그러지기 때문이다.
   *
   * ⚠️ 이 그림은 **알파가 살아 있는 4채널**로 왔다. 그래서 `cutPlaySheet.mjs`가
   * 소스 알파를 물려받도록 고쳤다 — 255로 채우고 시작하던 예전 코드로는 투명한
   * 자리까지 불투명으로 잡혀 조각이 그림 전체 크기로 잘린다.
   */
  upperBar: '/play/upper_bar.webp',

  /**
   * 플레이 화면 **통짜 액자**(1654×847) — 칸막이까지 그려진 한 장.
   *
   * ⚠️ 받은 원본(`play_frame_src.png`)은 **좌우가 비대칭**이었다(체력칸 117 대 131).
   * `scripts/mirrorPlayFrame.mjs`가 왼쪽 절반을 뒤집어 붙여 대칭본을 만든다 —
   * 원본을 갈아끼우면 그 스크립트를 **다시 돌려야** 한다.
   *
   * 칸 10개(윗줄 3 · 아랫줄 7)의 자리가 그림 안에 이미 정해져 있어, 화면 배치를
   * 정하는 주체가 CSS가 아니라 **이 그림**이다. 칸 좌표는 globals.css의
   * `.play-cell-*`에 %로 적혀 있다.
   *
   * ⚠️ **9분할로 늘리지 않는다.** 칸막이가 늘어나는 가운데 영역에 있어 칸 간격이
   * 따로 논다 — 상단 바처럼 통째로 확대한다.
   * ⚠️ 칸은 **투명**이다. 양피지 바탕은 칸마다 CSS가 따로 깐다.
   * ⚠️ 폭은 상단 바와 **같은 값**(`--stage-w`)을 쓴다 — 따로 계산하면 화면 비율에
   * 따라 둘의 폭이 어긋나고, 전체화면에서는 둘 다 화면 끝까지 붙어 맞닿는다.
   */
  playFrame: '/play/play_frame.webp',

  /** 나무 액자 + 양피지 — 9분할로 늘린다. 네 귀퉁이에 잎 덩어리가 함께 그려져 있다 */
  boardH: '/play/board_h.webp',   // 가로형 큰 판 (754×550)
  boardSq: '/play/board_sq.webp', // 정사각에 가까운 판 (503×456)
  boardV: '/play/board_v.webp',   // 세로형 작은 판 (271×376)

  /** 줄이 그어진 노트 — 팀 패널·체력판 */
  noteGreen: '/play/note_green.webp',
  notePink: '/play/note_pink.webp',
  /** 알약 줄이 네 칸 그려진 노트 — 동물 4종 표와 칸 수가 맞는다 */
  noteGreenRows: '/play/note_green_rows.webp',
  notePinkRows: '/play/note_pink_rows.webp',

  /** 알약 — 단계 표시·플레이어 이름표. 글씨가 들어가므로 가로 3분할.
   *
   *  `pillGreen`/`pillRed`는 팀 이름표로, **다른 시트**(`team_pills.png`)에서 한 벌로
   *  잘라낸 것이다. 예전에는 연두 하나에 `hue-rotate`를 걸어 빨강을 만들었는데 양 끝
   *  잎사귀까지 함께 돌아 분홍이 됐다 — 이제 빨강이 그림으로 따로 와서 잎이 제 색이다. */
  pillGreen: '/play/pill_green.webp',
  pillRed: '/play/pill_red.webp',
  pillGold: '/play/pill_gold.webp',
  pillWood: '/play/pill_wood.webp',
  pillLeaf: '/play/pill_leaf.webp',
  pillSmGreen: '/play/pill_sm_green.webp',
  pillSmWood: '/play/pill_sm_wood.webp',
  pillSmGold: '/play/pill_sm_gold.webp',

  /** 도토리 두 알이 달린 짙은 나무 바 — 도토리 축제 안내 */
  acornBar: '/play/acorn_bar.webp',
  /** 나무 띠 3종 — 해설판·진행도처럼 가로로 긴 자리 */
  barDark: '/play/bar_dark.webp',
  barLight: '/play/bar_light.webp',
  barSm: '/play/bar_sm.webp',
  plank: '/play/plank.webp',
  labelSmall: '/play/label_small.webp',

  /** 게이지 — `gauge`는 모래시계까지 한 벌로 그려진 완성품이고,
   *  `gaugeTrack`/`gaugeFill`은 색을 바꿔가며 쓰려고 따로 자른 조각이다. */
  gauge: '/play/gauge.webp',
  gaugeTrack: '/play/gauge_track.webp',
  gaugeFill: '/play/gauge_fill.webp',

  arrowGreen: '/play/arrow_green.webp',
  arrowWood: '/play/arrow_wood.webp',
  badgeCrown: '/play/badge_crown.webp',
  iconLock: '/play/icon_lock.webp',
  iconAcorn: '/play/icon_acorn.webp',
  iconCog: '/play/icon_cog.webp',

  decorLog: '/play/decor_log.webp',
  decorBush: '/play/decor_bush.webp',
  decorGrass: '/play/decor_grass.webp',
  decorStump: '/play/decor_stump.webp',
  decorCattail: '/play/decor_cattail.webp',
  decorStones: '/play/decor_stones.webp',
  decorMushroom: '/play/decor_mushroom.webp',

  /**
   * 카드(기술 칸)를 감싸는 **금색 액자** — 별도 시트(`card_frame_sheet.png`)에서 잘랐다.
   *
   * ⚠️ 액자와 모서리 장식을 **합치지 않는다.** 액자는 9분할로 늘어나야 하는데, 장식을
   * 거기 합쳐 넣으면 모서리 조각(두께 × 두께 = 11px)에 통째로 눌려 금색 얼룩이 된다.
   * 장식은 고정 크기 배경으로 따로 얹는다(globals.css의 `.play-card-frame`).
   *
   * ⚠️ 이 시트의 액자는 **안쪽이 막혀 있어** 테두리에서 출발하는 flood fill이 닿지
   * 못했다 — 가운데에서 한 번 더 뚫었다(cutPlaySheet의 `hollow`).
   */
  cardFrame: '/play/card_frame.webp',
  cardCornerTL: '/play/card_corner_tl.webp',
  cardCornerTR: '/play/card_corner_tr.webp',
  cardCornerBL: '/play/card_corner_bl.webp',
  cardCornerBR: '/play/card_corner_br.webp',
  /** 잎 데칼 4종 — 액자 변 한가운데에 얹는 작은 장식 */
  leafDecal1: '/play/leaf_decal_1.webp',
  leafDecal2: '/play/leaf_decal_2.webp',
  leafDecal3: '/play/leaf_decal_3.webp',
  leafDecal4: '/play/leaf_decal_4.webp',
  /** 금색 액자에 딸린 이름표 칸 — **아직 쓰지 않는다**(요청에 따라 에셋만 만들어 둠) */
  cardPlaque: '/play/card_plaque.webp',

  /**
   * 나무 액자 3종 + 양피지 3종 (`frames_sheet.png`).
   *
   * **액자와 종이가 따로** 그려져 있고, 가로/정사각/세로 세 비율이 한 벌씩이라
   * 쓸 자리의 비율에 가까운 것을 골라야 9분할로 조금만 늘리고 끝난다.
   *
   * ⚠️ 이 액자는 **모서리 잎 덩어리가 나무 개구부보다 훨씬 크다**(정사각 기준 215 vs 125).
   * 그래서 요소의 `border`로 그리면 내용이 필요 이상으로 밀린다 — 액자는 `::after`로
   * 띄워 그리고 내용이 시작하는 자리는 `padding`이 따로 정한다.
   * 자세한 계산은 globals.css의 `.wood-panel` 절에 있다.
   *
   * ⚠️ 액자는 자를 때 **가운데를 뚫어야 한다**(cutPlaySheet의 `hollow`) —
   * 나무가 사방을 막고 있어 테두리에서 출발하는 flood fill이 안쪽에 닿지 못한다.
   */
  /** ⚠️ 액자 셋은 **더 이상 화면에 쓰이지 않는다.** 팀 패널·카드판을 따로 두르던
   *  방식이 통짜 액자(`playFrame`) 한 장으로 대체됐다. 양피지 색(#fee9bb)을 여기서
   *  뽑았고 되돌릴 여지가 있어 조각은 남겨 둔다. */
  frameWide: '/play/frame_wide.webp',     // 1153×752 — (미사용)
  frameSquare: '/play/frame_square.webp', // 703×782 — (미사용)
  frameTall: '/play/frame_tall.webp',     // 482×861 — (예비)
  paperWide: '/play/paper_wide.webp',
  paperSquare: '/play/paper_square.webp',
  paperTall: '/play/paper_tall.webp',     // (예비)

  /** 양피지만 따로 있는 예전 시트(`frame_sheet.png`). 나무테(`wf_*`)와 통나무 바는
   *  위 액자 3종으로 대체돼 걷어냈고, 종이 여섯 장만 남아 아직 쓰인다. */
  pgCard: '/play/pg_card.webp',
  pgBarLg: '/play/pg_bar_lg.webp',
  pgBarMd: '/play/pg_bar_md.webp',    // 가운데 스택 네 줄이 쓴다
  pgBarSm: '/play/pg_bar_sm.webp',
  pgSquare: '/play/pg_square.webp',
  pgStrip: '/play/pg_strip.webp',     // 해설판이 쓴다(가늘고 긴 종이)
} as const;
