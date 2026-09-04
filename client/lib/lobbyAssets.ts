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
   * 폼(혼자 놀기·방 만들기·방 참가하기) 뒤에 깔리는 나무 액자와 네 귀퉁이 장식.
   *
   * **액자와 장식을 한 장으로 합치지 않는다.** 액자는 `border-image`로 9분할해
   * 어떤 크기에도 늘어나야 하는데, 귀퉁이 장식을 거기 합쳐 넣으면 모서리 조각
   * (border-width × border-width, 42px 남짓)에 통째로 압축돼 잎·버섯·도토리가
   * 초록 얼룩이 된다. 실제로 한 번 합쳐봤다가 되돌렸다.
   * 장식은 별도 배경 레이어로 **고정 크기**로 얹는다(globals.css의 .lobby-form-board).
   */
  /* 원본 PNG를 **손대지 않고** 그대로 쓴다 — 자르기·축소·장식선 제거 모두 하지 않았다.
     알파가 살아 있는 상태로 도착해 복원 처리도 필요 없었다. 투명 여백(상 73 / 좌 61px)이
     포함돼 있어(네 변이 다르다), globals.css가 그만큼 액자 레이어를 바깥으로 밀어 나무가
     카드 모서리에 맞도록 한다(--board-mt/mr/mb/ml). */
  formBoard: '/ui/back_board.png',
  cornerTL: '/ui/corner_tl.webp',
  cornerTR: '/ui/corner_tr.webp',
  cornerBL: '/ui/corner_bl.webp',
  cornerBR: '/ui/corner_br.webp',
  /** 가로형 백보드 원본(나무 팻말 포함) — 점수판용. 아직 어디에도 쓰이지 않는다. */
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
