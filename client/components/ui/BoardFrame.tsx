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
 */
export function BoardFrame({
  className = '',
  style,
  children,
}: {
  className?: string;
  /** 등장 애니메이션처럼 쓰는 쪽에서 얹는 값 — 액자 그림 변수 뒤에 병합된다 */
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`board-frame ${className}`}
      style={{
        ['--form-board' as string]: `url(${LOBBY_ASSETS.formBoard})`,
        ['--orn-tl' as string]: `url(${LOBBY_ASSETS.cornerTL})`,
        ['--orn-tr' as string]: `url(${LOBBY_ASSETS.cornerTR})`,
        ['--orn-bl' as string]: `url(${LOBBY_ASSETS.cornerBL})`,
        ['--orn-br' as string]: `url(${LOBBY_ASSETS.cornerBR})`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
