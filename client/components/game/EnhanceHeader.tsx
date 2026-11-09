'use client';

import type { ClientGameState, SideId } from 'shared';
import { maxTurnOf } from 'shared';
import { AcornFestivalBadge } from './acorn/AcornBadges';

/**
 * PC 카드 강화 판의 위 띠(2026-11-07 — 그림 들보 · 팻말 · 나무 알약을 CSS로 바꿨다). 모바일 위 띠(.m-top)를 본떠
 * [내 이름 · 단계] [지금 차례] [축제 · 상대 이름 · 일시정지 자리]로 좌우 대칭이다. 일시정지 버튼은 전역(fixed)이라 자리만 비운다.
 * 단계 판단은 GameHeader와 같다 — 서버가 pendingChoice를 세워도 정산 연출이 끝나기 전까지는 아직 "장소 선택"이다.
 */
export function EnhanceHeader({
  gameState,
  myTeam,
  displayedActiveTeam,
  displayedActivePlayerIndex,
  isSettling,
}: {
  gameState: ClientGameState;
  myTeam: SideId | null;
  displayedActiveTeam: SideId;
  displayedActivePlayerIndex: number;
  isSettling: boolean;
}) {
  const left: SideId = 'A';
  const right: SideId = 'B';
  const isDrawPhase = gameState.pendingChoice === null;
  const isChoicePhase = !isDrawPhase && !isSettling;
  const maxTurn = maxTurnOf(gameState);
  const nickname = gameState.teams[displayedActiveTeam]?.members[displayedActivePlayerIndex] ?? gameState.teamNames[displayedActiveTeam];
  // 관전 시점에는 "우리/상대"가 없다 — 그 사람 이름의 차례로만 쓴다
  const tone = myTeam === null ? 'neutral' : displayedActiveTeam === myTeam ? 'mine' : 'enemy';
  const whose = tone === 'mine' ? '내 차례' : tone === 'enemy' ? '상대 차례' : `${nickname} 차례`;

  return (
    <header className="enh-top">
      <div className="enh-top-side">
        <span className="m-name" data-tone={myTeam === right ? 'enemy' : 'mine'} title={gameState.teamNames[left]}>
          {gameState.teamNames[left]}
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
        <span className="m-name" data-tone={myTeam === left ? 'enemy' : myTeam === right ? 'mine' : 'enemy'} title={gameState.teamNames[right]}>
          {gameState.teamNames[right]}
        </span>
        <AcornFestivalBadge gameState={gameState} />
      </div>
    </header>
  );
}
