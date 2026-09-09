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
 * `animal`을 주면 **그 캐릭터의 손 그림**으로, 안 주면 👇 이모지로 그린다.
 * 행동 칸은 칸마다 주인이 있어 손이 누구 것인지가 곧 어느 칸인지의 단서가 되지만,
 * 장소 타일은 주인이 없어 이모지가 맞다.
 *
 * team이 주어지면 관전 시점이라는 뜻이다. 관전자는 아무것도 누를 수 없으므로 이 손가락은
 * 권유가 아니라 "지금 이 팀이 여기서 고르는 중"이라는 중계 표시이고, 그 팀 색 후광을
 * 두른 모습으로 그린다.
 *
 * 관전자용은 후광과 손가락을 **서로 다른 요소**로 나눈다 — 예전처럼 바깥 span 하나에
 * filter/opacity를 걸면 그 효과가 손가락과 후광 양쪽에 똑같이 적용돼서, 후광만 옅게
 * 하거나 후광만 작게 만들 수가 없었다(후광에까지 drop-shadow가 겹쳐 크게 번졌다).
 * 지금은 후광 = .place-guide-finger-halo, 손가락 = .place-guide-finger-glyph로 분리돼
 * 있어 둘의 크기·투명도를 따로 조절할 수 있다.
 *
 * 어느 쪽이든 이 손가락은 버튼 위쪽 경계 밖으로 튀어나가므로, 반드시 overflow-hidden이
 * 걸리지 않은 래퍼 안에 두어야 한다(안 그러면 손끝이 잘린다).
 */
export function GuideFinger({
  team = null,
  animal,
}: {
  team?: Team | null;
  /** 주면 그 캐릭터의 손 그림으로, 안 주면 👇 이모지로 그린다. */
  animal?: Animal;
}) {
  // 행동(기술) 칸은 칸마다 주인이 있으므로 그 캐릭터의 손으로 짚는다.
  // 장소 타일처럼 주인이 없는 자리는 그대로 이모지다.
  if (animal) {
    return (
      <span
        className={`place-guide-hand${team === null ? '' : ' place-guide-hand-spectator'}`}
        style={team === null ? undefined : spectatorTeamVars(team)}
        aria-hidden
      >
        <img src={HAND[animal]} alt="" draggable={false} />
      </span>
    );
  }

  if (team === null) {
    return (
      <span className="place-guide-finger" aria-hidden>
        👇
      </span>
    );
  }

  return (
    <span
      className="place-guide-finger place-guide-finger-spectator"
      style={spectatorTeamVars(team)}
      aria-hidden
    >
      <span className="place-guide-finger-halo" />
      <span className="place-guide-finger-glyph">👇</span>
    </span>
  );
}
