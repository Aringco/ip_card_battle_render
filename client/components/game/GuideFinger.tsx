'use client';

import type { Animal, Team } from 'shared';
import { spectatorTeamVars } from '@/lib/teamColors';
import { LOBBY_ASSETS } from '@/lib/lobbyAssets';

/** 행동 칸을 짚는 손 — 그 칸의 주인 캐릭터와 짝이다. */
const HAND: Record<Animal, string> = {
  sheep: LOBBY_ASSETS.handSheep,
  mermaid: LOBBY_ASSETS.handMermaid,
  rabbit: LOBBY_ASSETS.handRabbit,
  tiger: LOBBY_ASSETS.handTiger,
};

/**
 * "여기를 눌러보세요" 손가락 가이드 — 장소 타일과 행동 선택 칸이 함께 쓴다.
 *
 * `animal`을 주면 **그 캐릭터의 손 그림**으로, 안 주면 주인 없는 기본 손으로 그린다.
 * 행동 칸은 칸마다 주인이 있어 손이 누구 것인지가 곧 어느 칸인지의 단서가 되고,
 * 장소 타일은 주인이 없어 기본 손이 맞다.
 *
 * ⚠️ 예전에는 주인 없는 자리를 👇 **이모지**로 그렸다. 이모지는 OS마다 모양이 달라
 * 보는 사람에 따라 화면이 달라지고, 다른 손 넷과 그림체도 겉돌았다 — 그림으로 바꿨다.
 * 그래서 두 갈래가 이제 **같은 모양**이고 그림 파일만 다르다.
 *
 * team이 주어지면 관전 시점이라는 뜻이다. 관전자는 아무것도 누를 수 없으므로 이 손가락은
 * 권유가 아니라 "지금 이 팀이 여기서 고르는 중"이라는 중계 표시이고, 그 팀 색 후광을
 * 두른 모습으로 그린다.
 *
 * 관전 시점에는 후광 **원**을 깔지 않는다 — 세로로 긴 그림 뒤에 원을 두면 손끝만 원
 * 밖으로 삐져나와 어색하다. 대신 팀 색 drop-shadow로 그림의 윤곽을 따라 빛을 두른다
 * (모양을 따라가므로 손 모양 그대로 물든다).
 *
 * 어느 쪽이든 이 손가락은 버튼 위쪽 경계 밖으로 튀어나가므로, 반드시 overflow-hidden이
 * 걸리지 않은 래퍼 안에 두어야 한다(안 그러면 손끝이 잘린다).
 */
export function GuideFinger({
  team = null,
  animal,
  variant = 'card',
}: {
  team?: Team | null;
  /** 주면 그 캐릭터의 손 그림으로, 안 주면 주인 없는 기본 손으로 그린다. */
  animal?: Animal;
  /** 'tile'이면 더 낮게 앉힌다 — 보드 칸이 `overflow: hidden`이라 위로 삐져나오면 잘린다 */
  variant?: 'card' | 'tile';
}) {
  // 행동(기술) 칸은 칸마다 주인이 있으므로 그 캐릭터의 손으로 짚고,
  // 장소 타일처럼 주인이 없는 자리는 기본 손으로 짚는다.
  return (
    <span
      className={`place-guide-hand${variant === 'tile' ? ' place-guide-hand-tile' : ''}${team === null ? '' : ' place-guide-hand-spectator'}`}
      style={team === null ? undefined : spectatorTeamVars(team)}
      aria-hidden
    >
      <img src={animal ? HAND[animal] : LOBBY_ASSETS.handPoint} alt="" draggable={false} />
    </span>
  );
}
