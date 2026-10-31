'use client';

import type { ClientGameState, SideId } from 'shared';
import { festivalDrawInfoAt, maxTurnOf } from 'shared';
import type { AnimationState } from '@/hooks/useAnimationQueue';
import { PLAY_ASSETS } from '@/lib/playAssets';

/**
 * 모바일 배치의 오른쪽 위 안내 — PC에서 화면 가운데 · 들보에 뜨던 진행 문구를 한 자리에 모은다.
 * 우선순위: 실용신양 예약 뽑기 진행 → 도토리 축제 뽑기 진행 → 축제 시작 안내(그 순간 한 번) → 축제 중 표시(늘).
 * 진행 숫자는 연출 큐가 세는 값(sheepProgress · festivalProgress)이라 뽑기 연출과 함께 오른다.
 */
export function MobileNotice({
  gameState,
  animState,
  myTeam,
  nameOf,
}: {
  gameState: ClientGameState;
  animState: AnimationState;
  myTeam: SideId | null;
  /** 개인전 — 상대를 "상대" 대신 닉네임으로 부른다 */
  nameOf?: (side: SideId) => string;
}) {
  const sheep = animState.sheepProgress;
  const fest = animState.festivalProgress;
  const start = animState.festivalStartInfo;
  const mineOf = (team: SideId) => (team === myTeam ? '내' : nameOf ? nameOf(team) : '상대');

  if (sheep) {
    return (
      <div className="m-notice m-notice-sheep" role="status">
        <span>🐑 {mineOf(sheep.team)} 추가 뽑기</span>
        <b className="tabular-nums">
          {sheep.current} / {sheep.total}
        </b>
      </div>
    );
  }
  if (fest) {
    return (
      <div className="m-notice m-notice-acorn" role="status">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PLAY_ASSETS.iconAcorn} alt="" className="m-notice-icon" />
        <span>{mineOf(fest.team)} 축제 뽑기</span>
        <b className="tabular-nums">
          {fest.current} / {fest.total}
        </b>
      </div>
    );
  }
  if (start) {
    return (
      <div key={start.id} className="m-notice m-notice-acorn m-notice-pop" role="status">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PLAY_ASSETS.iconAcorn} alt="" className="m-notice-icon" />
        <span>
          도토리 축제 시작! {start.increaseInterval}턴마다 +{start.drawCount}회
        </span>
      </div>
    );
  }
  if (gameState.festival) {
    const info = festivalDrawInfoAt(gameState.turn, gameState.settings, maxTurnOf(gameState));
    return (
      <div className="m-notice m-notice-acorn m-notice-quiet">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={PLAY_ASSETS.iconAcorn} alt="" className="m-notice-icon" />
        <span>도토리 축제 +{info.count}회</span>
      </div>
    );
  }
  return null;
}
