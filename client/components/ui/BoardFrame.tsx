'use client';

import { LOBBY_ASSETS } from '@/lib/lobbyAssets';

/**
 * 나무 액자 + 네 귀퉁이 장식으로 감싼 판.
 *
 * 로비 폼(`FormCard`)이 쓰던 액자를 그 폼 밖에서도 쓸 수 있게 떼어낸 것이다.
 * 지금은 대기실과 게임 결과 창이 함께 쓴다 — 셋이 같은 액자를 두르면 "로비에서
 * 방을 만들고 → 기다리고 → 결과를 본다"가 한 세계 안에서 일어나는 일로 읽힌다.
 *
 * 그림 경로를 CSS가 아니라 여기서 커스텀 속성으로 흘려보내는 이유는, 에셋 경로가
 * `lib/lobbyAssets.ts` 한 곳에만 있어야 교체가 상수 한 줄로 끝나기 때문이다.
 * 액자를 그리는 규칙(9분할 슬라이스·투명 여백 보정·장식 크기)은 globals.css의
 * `.board-frame`에 있고, `.lobby-form-board`와 그 선언을 공유한다.
 *
 * ⚠️ `.board-frame`은 안쪽 배치를 정하지 않는다(폼처럼 zoom·2열 그리드를 갖지 않는다).
 * 배치는 쓰는 쪽이 `className`으로 준다.
 *
 * ## split — 액자와 양피지를 따로 그린다
 *
 * 기본값은 합쳐진 한 장(`back_board.png`)을 9분할해 `fill`로 가운데 양피지까지 함께
 * 그리는 방식이다. `split`을 주면 **속이 빈 액자**와 **양피지 판**을 별도 레이어로
 * 겹친다 — 그래야 양피지에만 투명도를 줄 수 있다(합쳐진 그림에 opacity를 걸면 나무까지
 * 함께 비친다). 지금은 승패 화면(GameEndScreen)만 쓴다. 대기실은 불투명한 카드 하나로
 * 읽혀야 해서 기본값 그대로다.
 */
export function BoardFrame({
  className = '',
  split = false,
  style,
  children,
}: {
  className?: string;
  /** 액자·양피지를 두 장으로 나눠 그리고 양피지를 반투명하게 한다(위 주석 참고) */
  split?: boolean;
  /** 등장 애니메이션처럼 쓰는 쪽에서 얹는 값 — 액자 그림 변수 뒤에 병합된다 */
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`board-frame ${split ? 'board-frame-split' : ''} ${className}`}
      style={{
        ['--form-board' as string]: `url(${split ? LOBBY_ASSETS.formBoardFrame : LOBBY_ASSETS.formBoard})`,
        ['--form-plate' as string]: `url(${LOBBY_ASSETS.formBoardPlate})`,
        ['--orn-tl' as string]: `url(${LOBBY_ASSETS.cornerTL})`,
        ['--orn-tr' as string]: `url(${LOBBY_ASSETS.cornerTR})`,
        ['--orn-bl' as string]: `url(${LOBBY_ASSETS.cornerBL})`,
        ['--orn-br' as string]: `url(${LOBBY_ASSETS.cornerBR})`,
        ...style,
      }}
    >
      {/* 양피지 판 — 액자(::before)보다 아래 층(z-index -3)에 깔린다. 의사요소를
          쓰지 못하는 이유는 ::before가 액자, ::after가 귀퉁이 장식으로 이미 차 있어서다. */}
      {split && <div className="board-plate" aria-hidden />}
      {children}
    </div>
  );
}
