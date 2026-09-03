/**
 * 로비 화면 에셋 경로 — 지금은 전부 임시(placeholder)다.
 *
 * 실제 디자인 에셋이 나오면 이 파일의 경로 문자열만 바꾸면 되고, 컴포넌트 코드는
 * 손댈 필요가 없다. 교체가 끝나면 TMP_ASSETS_IN_USE를 false로 내려 화면의
 * "임시 에셋" 배지를 없애고 client/public/tmp/ 폴더를 삭제한다.
 *
 * 각 파일이 어떤 비율을 전제로 하는지는 client/public/tmp/README.md 참조.
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
  /** 상단 로고 박스 배경 — 가로:세로 ≈ 10:3 */
  logo: '/tmp/logo.png',
  /** 싱글플레이 패널 배경 — ≈ 5:6 */
  solo: '/tmp/panel_solo_bg.svg',
  /** 멀티플레이 패널 배경 — ≈ 5:6 */
  multi: '/tmp/panel_multi_bg.svg',
  /** 방 만들기 패널 배경 — ≈ 5:3 */
  create: '/tmp/panel_create_bg.svg',
  /** 방 참가하기 패널 배경 — ≈ 5:3 */
  join: '/tmp/panel_join_bg.svg',
} as const;

/**
 * 위 경로들이 아직 임시 에셋인지 여부.
 * true인 동안 화면 우측 하단에 작은 "임시 에셋" 배지가 뜬다 — 확정 에셋으로
 * 교체하는 것을 잊지 않기 위한 표식이다.
 */
export const TMP_ASSETS_IN_USE = true;

/**
 * 배경이 아직 임시 스탠드인인지 여부.
 * 실제 배경 이미지로 교체하면 false로 내린다 — 화면의 "STANDIN" 표식이 사라진다.
 */
export const TABLE_IS_STANDIN = false;

// 확정 로고(떱카드 T.U.P.D. 엠블럼)가 들어와 이모지+텍스트 임시 표기는 제거됐다.
// LOGO_IS_TEXT_FALLBACK 플래그도 더 이상 쓰이지 않아 함께 삭제.
