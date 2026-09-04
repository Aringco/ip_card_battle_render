/**
 * 로비 화면 에셋 경로.
 *
 * 실제 디자인 에셋이 나오면 이 파일의 경로 문자열만 바꾸면 되고, 컴포넌트 코드는
 * 손댈 필요가 없다.
 */

export const LOBBY_ASSETS = {
  /**
   * 로비 전체 배경 — 카드테이블 일러스트 (3072×1649 WebP, 약 374KB).
   * 원본 4096×2198 PNG는 12.9MB라 매 접속마다 내려받기엔 너무 무거워 WebP로 줄였다.
   * 원본이 필요하면 git 이력에서 꺼낼 수 있다:
   *   git show b14caba:client/public/lobby/table_bg.png > table_bg.png
   * 안전영역 좌표는 globals.css의 .lobby-table 변수에 있다 (public/lobby/README.md 참조).
   */
  table: '/lobby/table_bg.webp',
  /** 상단 로고 — 투명 배경 "떱카드 T.U.P.D." 엠블럼 (가로:세로 ≈ 10:3) */
  logo: '/lobby/logo.png',
  /**
   * 모드 선택 패널 아트 (각 768×768 WebP, 80~95KB).
   * 원본은 1024² JPEG였고 sharp로 줄였다 — 패널이 실제로 그려지는 크기(넓어야 500px 남짓)의
   * 1.5배면 충분하고, 로비 첫 화면에서 프리로드되는 이미지라 용량이 곧 첫 진입 대기시간이다.
   *
   * 그림은 배경(background-image)으로 깔리므로 `cover`에 잘린다 — 가운데 글자를 피해
   * 인물이 양옆에 배치된 구도를 쓴다. 패널이 어떤 비율로 늘어나도 주인공이 살아남는다.
   */
  panelSolo: '/lobby/panel_solo.webp',
  panelMulti: '/lobby/panel_multi.webp',
  panelCreate: '/lobby/panel_create.webp',
  panelJoin: '/lobby/panel_join.webp',
  /**
   * 폼(혼자 놀기·방 만들기·방 참가하기) 뒤에 깔리는 나무 액자 백보드.
   * 1024² WebP 67KB — 원본은 알파가 있는 PNG(1MB)였고, 팔레트 PNG로 줄여도 364KB라
   * table_bg와 같은 이유로 WebP를 골랐다(로비 프리로드 대상이라 용량이 곧 진입 대기시간).
   *
   * 통째로 늘리지 않고 `border-image`로 9분할해 쓴다 — 모서리 잎 덩어리가 찌그러지지
   * 않아야 하기 때문. 슬라이스 값의 근거는 globals.css의 .lobby-form-board 주석 참조.
   */
  formBoard: '/ui/back_board.webp',
  /**
   * 게임 규칙을 펼쳐 폼이 가로로 넓어졌을 때 쓰는 가로형 백보드 (1226×701 WebP 46KB).
   * score_board.webp에서 왼쪽 아래 나무 팻말을 지우고 액자만 남긴 것이다 — 팻말이
   * 왼쪽 기둥·모서리와 겹쳐 있어 9분할(border-image)의 모서리 조각에 담기지 않았다.
   * 지운 자리는 오른쪽 아래 모서리를 좌우 반전해 메웠다.
   */
  formBoardWide: '/ui/back_board_wide.webp',
  /** 가로형 백보드 원본(팻말 포함) — 점수판용. 아직 어디에도 쓰이지 않는다. */
  scoreBoard: '/ui/score_board.webp',
} as const;

/**
 * 모드 선택 패널(싱글/멀티/방 만들기/방 참가하기)의 배경 톤.
 *
 * 네 패널 모두 그 위에 아트가 덮이지만 톤은 그대로 남겨둔다 — 이미지가 도착하기 전
 * 한 프레임 동안 빈 사각형이 아니라 제 색으로 보이게 하는 바탕이다.
 *
 * 한때는 패널마다 배경 SVG를 한 장씩 깔았지만(`public/tmp/panel_*_bg.svg`), 그건
 * 확정 일러스트가 나올 때까지의 자리표시였고 placeholder 표식(점선 테두리·해치 무늬)이
 * 완성된 카드테이블 배경 위에서 "웬 점선 사각형"으로 보였다. 그림 자체가 담고 있던
 * 정보는 초록 그라디언트 한 줄뿐이었으므로, 파일을 지우고 그 그라디언트만 CSS로 옮겼다.
 * (이미지 4장·HTTP 요청 4번과 프리로드 대상에서도 함께 빠졌다.)
 *
 * 값은 `--panel-a`(위) / `--panel-b`(아래)로 패널 버튼에 실려 `.lobby-panel-bg`가
 * 그라디언트로 그린다 — globals.css의 "로비 — 모드 선택 패널" 절 참조.
 * 나중에 확정 일러스트가 들어오면 이 톤 대신 `background-image: url(...)`을
 * 그 절에서 덮어쓰면 되고, 컴포넌트는 여전히 손댈 필요가 없다.
 *
 * 싱글만 눈에 띄게 밝은 것은 의도다 — 첫 화면의 두 선택지가 같은 초록이면 구분이 안 된다.
 */
export type PanelTone = 'solo' | 'multi' | 'create' | 'join';

/**
 * 배경이 아직 임시 스탠드인인지 여부.
 * 실제 배경 이미지로 교체하면 false로 내린다 — 화면의 "STANDIN" 표식이 사라진다.
 */
export const TABLE_IS_STANDIN = false;

// 확정 로고(떱카드 T.U.P.D. 엠블럼)가 들어와 이모지+텍스트 임시 표기는 제거됐다.
// LOGO_IS_TEXT_FALLBACK 플래그도 더 이상 쓰이지 않아 함께 삭제.
// 패널 배경이 CSS 톤으로 바뀌면서 임시 에셋이 모두 사라져 TMP_ASSETS_IN_USE도 삭제했다
// (배지를 그리던 코드는 그 전에 이미 없어져 상수만 남아 있었다).
