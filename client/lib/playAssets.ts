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
} as const;
