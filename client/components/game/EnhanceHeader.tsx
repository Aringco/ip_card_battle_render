'use client';

import type { ClientGameState, SideId } from 'shared';
import { maxTurnOf } from 'shared';
import { AcornFestivalBadge } from './acorn/AcornBadges';

/**
 * PC 카드 강화 판의 위 띠(2026-11-07 — 그림 들보 · 팻말 · 나무 알약을 CSS로 바꿨다). 모바일 위 띠(.m-top)를 본떠
 * [내 이름 · 단계] [지금 차례] [축제 · 상대 이름 · 일시정지 자리]로 좌우 대칭이다. 일시정지 버튼은 전역(fixed)이라 자리만 비운다.
 * 단계 판단은 GameHeader와 같다 — 서버가 pendingChoice를 세워도 정산 연출이 끝나기 전까지는 아직 "장소 선택"이다.
 *
 * 개인전 강화 3명+(IndividualLayout, 2026-11-25)도 이 띠를 쓴다 — 왼쪽은 내 이름(관전자는 지금 차례인 사람),
 * 오른쪽 이름 칸은 없다(상대가 여럿이다 — 가운데 "○○ 차례"가 지금 차례인 사람을 말한다). 이름은 nameOf로 받는다.
 */
export function EnhanceHeader({
  gameState,
  myTeam,
  displayedActiveTeam,
  displayedActivePlayerIndex,
  isSettling,
  left = 'A',
  right = 'B',
  nameOf,
}: {
  gameState: ClientGameState;
  myTeam: SideId | null;
  displayedActiveTeam: SideId;
  displayedActivePlayerIndex: number;
  isSettling: boolean;
  /** 왼쪽 이름 칸의 편(기본 'A') */
  left?: SideId;
  /** 오른쪽 이름 칸의 편(기본 'B') — null이면 오른쪽 이름 칸을 그리지 않는다(개인전 3명+) */
  right?: SideId | null;
  /** 편 → 보일 이름(기본 teamNames — 개인전은 lib/individual의 sideName) */
  nameOf?: (side: SideId) => string;
}) {
  const label = (side: SideId) => (nameOf ? nameOf(side) : gameState.teamNames[side]);
  const isDrawPhase = gameState.pendingChoice === null;
  const isChoicePhase = !isDrawPhase && !isSettling;
  const maxTurn = maxTurnOf(gameState);
  const nickname = nameOf
    ? nameOf(displayedActiveTeam)
    : gameState.teams[displayedActiveTeam]?.members[displayedActivePlayerIndex] ?? gameState.teamNames[displayedActiveTeam];
  // 관전 시점에는 "우리/상대"가 없다 — 그 사람 이름의 차례로만 쓴다
  const tone = myTeam === null ? 'neutral' : displayedActiveTeam === myTeam ? 'mine' : 'enemy';
  const whose = tone === 'mine' ? '내 차례' : tone === 'enemy' ? '상대 차례' : `${nickname} 차례`;

  return (
    <header className="enh-top">
      <div className="enh-top-side">
        <span className="m-name" data-tone={myTeam !== null && myTeam === right ? 'enemy' : 'mine'} title={label(left)}>
          {label(left)}
        </span>
        <span className="enh-turn tabular-nums">{Number.isFinite(maxTurn) ? `${gameState.turn}/${maxTurn}턴` : `${gameState.turn}턴`}</span>
        <span className="enh-steps" aria-label={isChoicePhase ? '행동 선택' : '장소 선택'}>
          <span className="enh-step" data-phase="draw" data-on={!isChoicePhase || undefined}>장소 선택</span>
          <span className="enh-step-arrow" aria-hidden>›</span>
          <span className="enh-step" data-phase="choice" data-on={isChoicePhase || undefined}>행동 선택</span>
        </span>
      </div>
      <div className="enh-top-center" data-tone={tone}>
        <b>{whose}</b>
        {tone !== 'neutral' && <span className="enh-top-nick">{nickname}</span>}
      </div>
      <div className="enh-top-side enh-top-right">
        <span className="m-pause-slot" aria-hidden />
        {right !== null && (
          <span className="m-name" data-tone={myTeam === left ? 'enemy' : myTeam === right ? 'mine' : 'enemy'} title={label(right)}>
            {label(right)}
          </span>
        )}
        <AcornFestivalBadge gameState={gameState} />
      </div>
    </header>
  );
}
