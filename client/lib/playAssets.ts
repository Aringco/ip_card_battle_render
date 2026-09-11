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
  /** 상단 헤더 바닥에 까는 긴 나무 들보. 양 끝이 덩굴로 감긴 마무리다 —
   *  시트의 들보는 왼쪽 끝이 이름표에 가려 마무리가 없어, 오른쪽 끝을 좌우 반전해 붙였다. */
  beam: '/play/beam.webp',
  /** 잎 달린 나무틀 + 양피지 이름표. 헤더 왼쪽 "○○ 차례"가 여기 앉는다 */
  nameplate: '/play/nameplate.webp',

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

  /** 알약 — 단계 표시·플레이어 이름표. 글씨가 들어가므로 가로 3분할 */
  pillGreen: '/play/pill_green.webp',
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
   * 목재 프레임 + 양피지 (`frame_sheet.png`).
   *
   * 이 시트의 요령은 **나무테와 양피지가 따로 그려져 있다**는 것이다(시트의 "조합 예시"는
   * 둘을 겹쳐 본 견본일 뿐, 그런 파일이 따로 있는 게 아니다). 그래서 CSS에서도 두 층으로
   * 쌓는다 — 나무테는 요소의 진짜 `border`, 양피지는 그 안쪽(padding box)을 채우는
   * `::before`다. globals.css의 `.wood-panel` 참고.
   *
   * ⚠️ 나무테(`wf_*`)는 자를 때 **가운데를 뚫어야 한다**(cutPlaySheet의 `hollow`) —
   * 나무가 사방을 막고 있어 테두리에서 출발하는 flood fill이 안쪽에 닿지 못한다.
   */
  pgCard: '/play/pg_card.webp',       // 양피지 — 세로 카드
  pgBarLg: '/play/pg_bar_lg.webp',
  pgBarMd: '/play/pg_bar_md.webp',    // 가운데 스택 네 줄이 쓴다
  pgBarSm: '/play/pg_bar_sm.webp',
  pgSquare: '/play/pg_square.webp',
  pgStrip: '/play/pg_strip.webp',     // 해설판이 쓴다(가늘고 긴 종이)
  wfCard: '/play/wf_card.webp',       // 나무테 — 팀 패널·카드판·장소 타일
  wfBarLg: '/play/wf_bar_lg.webp',
  wfBarMd: '/play/wf_bar_md.webp',
  wfStrip: '/play/wf_strip.webp',
  wfSquare: '/play/wf_square.webp',
  wfPlaque: '/play/wf_plaque.webp',   // 짙은 나무 명패(속이 찬 판)
  logBar: '/play/log_bar.webp',       // 긴 통나무 장식 바
} as const;
