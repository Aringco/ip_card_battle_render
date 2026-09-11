/**
 * 로비 화면 에셋 경로.
 *
 * 실제 디자인 에셋이 나오면 이 파일의 경로 문자열만 바꾸면 되고, 컴포넌트 코드는
 * 손댈 필요가 없다.
 */

export const LOBBY_ASSETS = {
  /**
   * 로비 전체 배경 — 카드테이블 일러스트 (2560×1392 WebP, 약 255KB).
   * 2026-09-11에 새 타이틀 그림으로 교체했다. 이번에는 원본을 줄이지 않고 webp q80으로만
   * 바꿔 넣었는데도 예전 3072px판(374KB)보다 가볍다.
   * 예전 배경이 필요하면 git 이력에서 꺼낼 수 있다:
   *   git show b377777:client/public/lobby/table_bg.webp > table_bg.webp
   * 안전영역 좌표는 globals.css의 .lobby-table 변수에 있다 (public/lobby/README.md 참조).
   */
  table: '/lobby/table_bg.webp',
  /** 상단 로고 — 투명 배경 "떱카드 T.U.P.D." 엠블럼 (가로:세로 ≈ 10:3) */
  logo: '/lobby/logo.png',
  /**
   * 로딩 화면 배경 — 연못 다리에 네 캐릭터가 모여 있는 그림 (2560×1360 WebP, 약 308KB).
   *
   * ⚠️ 이 그림은 **프리로드가 끝나기 전에** 보여야 하는 유일한 배경이다. 그래서
   * `LoadingScreen`이 `background-image`로 직접 깔고, 글자는 그 위에 반투명 판을 얹어
   * 읽는다 — 하늘이 밝고 나무가 어두워 배경 위 맨글씨로는 어디서도 잘 안 읽힌다.
   */
  loading: '/lobby/loading_bg.webp',
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
  /**
   * UI 아이콘 5종 — 한 장짜리 시트(2행 4열, 8개)에서 잘라낸 것.
   *
   * 시트에는 글씨가 없고 아이콘만 들어 있다 — 라벨은 항상 HTML로 따로 쓴다
   * (글꼴을 바꾸거나 문구를 고칠 때 그림을 다시 만들지 않아도 되고, 스크린리더도 읽는다).
   * 자른 좌표와 절차는 client/public/ui/README.md 참조.
   *
   * 이 중 셋(create·cog·help)은 그림 자체가 버튼이다(`IconButton`) — 배경·테두리 없이 그림만 놓인다.
   */
  /**
   * 가로형 나무 팻말 버튼 두 장 — **그림 안에 글씨가 이미 그려져 있다.**
   *
   * 아이콘 5종과 규칙이 정반대다. 저쪽은 그림에 글씨가 없어 라벨을 HTML로 따로 쓰지만,
   * 이 둘은 팻말·그림·글씨가 한 장으로 그려진 완성된 버튼이라 **HTML 라벨을 겹쳐 쓰면
   * 글씨가 두 번 보인다.** 그래서 `BarButton`은 화면에 글자를 내지 않고 `aria-label`과
   * `title`로만 이름을 싣는다(스크린리더·툴팁은 그대로 읽힌다).
   *
   * 받은 원본은 투명 PNG였지만 세션에는 JPEG로 도착해 투명한 자리가 어두운 글로우로
   * 칠해져 있었다 — 되살린 방법은 client/public/ui/README.md 참조.
   */
  /**
   * 행동(기술) 칸을 짚어 주는 **캐릭터별 손** 4종.
   *
   * 예전에는 넷 다 같은 👇 이모지였다. 지금은 지금 짚고 있는 칸의 주인이 누구인지
   * 손만 봐도 알 수 있다 — 실용신양은 털 달린 가죽장갑, 디자인어는 초록 손수건,
   * 상표토끼는 도토리를 매단 분홍 앞발, 특허랑이는 톱니 장식의 줄무늬 손이다.
   *
   * ⚠️ 이모지와 달리 **세로로 긴 그림**(약 0.58:1)이고 손끝이 아래를 가리킨다.
   * 그래서 이모지처럼 가운데를 기준점에 맞추면 안 되고, **손끝**이 칸 위쪽에 오도록
   * 아래쪽 기준으로 앉힌다(globals.css의 `.place-guide-hand` 참고).
   */
  handSheep: '/ui/hand_sheep.webp',      // 실용신양 — 털 달린 가죽장갑
  handMermaid: '/ui/hand_mermaid.webp',  // 디자인어 — 초록 손수건
  handRabbit: '/ui/hand_rabbit.webp',    // 상표토끼 — 도토리를 맨 분홍 앞발
  handTiger: '/ui/hand_tiger.webp',      // 특허랑이 — 톱니 장식의 줄무늬 손

  /**
   * 자리·선 플레이어를 고르는 **그림 버튼** 4종.
   *
   * 셋(팀 1·팀 2·관전자)은 한 시트에서, 무작위는 따로 받은 그림에서 잘랐다.
   * **글씨가 그림 안에 있으므로** HTML 라벨을 겹쳐 쓰지 않는다 — 팻말(`BarButton`)과
   * 같은 규칙이다. 고르지 않은 버튼은 CSS가 흑백으로 눌러 구분한다.
   */
  btnTeamA: '/ui/btn_team_a.webp',        // 팀 1 — 실용신양 + 디자인어
  btnTeamB: '/ui/btn_team_b.webp',        // 팀 2 — 상표토끼 + 특허랑이
  btnSpectator: '/ui/btn_spectator.webp', // 관전자 — 로봇
  btnRandom: '/ui/btn_random.webp',       // 무작위 — 주사위
  /** 닉네임·팀 이름을 다시 뽑는 주사위 버튼. 나무틀까지 그려져 있어 CSS로 상자를 두르지 않는다. */
  btnDice: '/ui/btn_dice.webp',

  barStart: '/ui/btn_start_bar.webp',   // "게임 시작" — 대기실 시작 버튼
  barSolo: '/ui/btn_solo_bar.webp',     // "컴퓨터와 대전하기" — 혼자 놀기 폼의 시작 버튼
  /** 놀이터 재생 버튼. 대기실 시작 버튼에 쓰다가 가로 팻말 `barStart`에 자리를 내주어
      **지금은 어디서도 쓰이지 않는다**(되돌릴 수 있게 파일과 경로는 남겨 둔다). */
  iconStart: '/ui/icon_start.webp',
  iconCreate: '/ui/icon_create.webp',  // 방 만들기 — 통나무집+. 방 만들기 폼의 제출 버튼 그 자체
  iconCog: '/ui/icon_cog.webp',        // 설정 — 톱니바퀴+렌치. 설정 버튼 그 자체 + 규칙 접기/펼치기 라벨 2곳
  iconRank: '/ui/icon_rank.webp',      // 순위 — 왕관 쓴 토끼 방패. 결과 화면 **왼쪽(팀별 점수)** 판의 문장
  iconHelp: '/ui/icon_help.webp',      // 도움말 — 책+돋보기. 로비 "게임 방법" 버튼 그 자체
  /**
   * 게임 결과 화면 장식 — 받은 스프라이트 시트(1024²)에서 잘라낸 세 조각.
   *
   * 사각형으로 자르면 이웃 오브젝트가 모서리에 딸려 오므로(금메달 오른쪽 위에 도토리가
   * 실제로 들어왔다) **연결 성분 단위**로 남기고 나머지를 알파 0으로 지웠다. 잘라낸
   * 좌표와 방법은 `client/public/ui/README.md`에 적어 뒀다.
   */
  /** 버섯+책 월계수 — 결과 화면 **오른쪽(행동 사용 통계)** 판의 문장.
      왼쪽과 다른 그림이어야 나란히 놓인 두 판이 구별된다. */
  crestLaurel: '/ui/laurel_book.webp',
  medalFirst: '/ui/medal_1.webp',        // 금메달 "1" — 승리팀
  medalSecond: '/ui/medal_2.webp',       // 은메달 "2" — 패배팀
  /**
   * 게임 방법 창 — 받은 그림 3장에서 잘라낸 여섯 조각.
   *
   * 배경이 검정/짙은 회색으로 구워져 온 JPEG라, 테두리에서 **연결된 배경만** flood fill로
   * 지웠다(전역 임계값으로 지우면 그림 안의 어두운 윤곽선까지 뚫린다). 자세한 절차는
   * `client/public/ui/README.md` 참조.
   *
   * `howtoBoard`는 9분할(`border-image`)로 늘려 쓴다 — 창 비율이 그림(1289×652)과 달라
   * 통째로 늘리면 모서리 나무가 눌린다. 나머지 다섯은 고정 크기로 얹는다.
   */
  howtoBoard: '/ui/howto_board.webp',        // 나무 액자 + 양피지
  howtoTitle: '/ui/howto_title.webp',        // 잎 달린 팻말 — "HOW TO PLAY"가 얹힌다
  howtoCornerTL: '/ui/howto_corner_tl.webp',
  howtoCornerTR: '/ui/howto_corner_tr.webp',
  howtoCornerBL: '/ui/howto_corner_bl.webp',
  howtoCornerBR: '/ui/howto_corner_br.webp',
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
