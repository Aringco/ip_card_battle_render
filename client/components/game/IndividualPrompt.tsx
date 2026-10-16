'use client';

import type { ClientGameState, SideId } from 'shared';
import { TurnTimer } from './TurnTimer';
import { isFinished, sideName } from '@/lib/individual';

/**
 * 개인전의 안내 쪽지(모래시계·남은 시간·문구) — 팀전 ActionPrompt를 본떴다.
 * ActionPrompt는 "상대 턴이에요 / 내 차례가 아니에요"처럼 **팀**을 전제로 말하고, 관전 시점에는 팀 팔레트(A·B)를
 * 읽으므로 개인전에서는 그대로 쓰지 않는다.
 *
 * 기술을 두 번 쓸 수 있는 판(5명 이상)에서는 지금이 몇 장째인지를 이 문구가 말한다(요구 T6-3) —
 * 새 줄을 만들지 않고 기존 안내 자리의 문구에 얹는다(액자 칸이 한 줄 높이라 새 줄은 아래 칸을 민다).
 */
export function IndividualPrompt({
  gameState,
  mySide,
  displayedActiveTeam,
  isMyDrawTurn,
  interactive,
  noEligible,
  turnDeadline,
  paused,
}: {
  gameState: ClientGameState;
  mySide: SideId | null;
  displayedActiveTeam: SideId;
  isMyDrawTurn: boolean;
  interactive: boolean;
  noEligible: boolean;
  turnDeadline: number;
  paused: boolean;
}) {
  const activeName = sideName(gameState, displayedActiveTeam);
  const finished = isFinished(gameState, mySide);
  const observer = mySide === null || finished;
  const twoSkills = gameState.skillsPerTurn === 2;
  // 지금 고르는 기술이 몇 장째인지 — 서버가 센 값(skillsUsedThisTurn)에 1을 더한다.
  const nth = Math.min(gameState.skillsUsedThisTurn + 1, gameState.skillsPerTurn);
  const nthNote = twoSkills ? ` (기술 ${nth}/${gameState.skillsPerTurn}장째)` : '';

  let text: string | null = null;
  let showTimer = false;
  let urgent = false;

  if (gameState.phase !== 'playing') return null;
  if (observer) {
    text = finished
      ? `순위가 정해졌어요 — ${activeName} 님 차례를 지켜봐요.`
      : `관전 중 — ${activeName} 님 차례예요.`;
    showTimer = true;
  } else if (displayedActiveTeam !== mySide) {
    text = `${activeName} 님 차례예요.`;
  } else if (interactive) {
    text = noEligible
      ? '아쉽게도 IP 에너지가 부족해요. 턴을 종료해주세요.'
      : `이번 턴의 행동을 선택하세요!${nthNote}`;
    showTimer = true;
    urgent = noEligible;
  } else if (isMyDrawTurn) {
    text = '장소를 클릭해 카드를 뽑으세요!';
    showTimer = true;
  }

  if (text === null) return null;

  // 첫 라운드에는 차례 순서가 무작위로 정해졌다는 것과 첫 차례가 누구인지를 알린다.
  const firstNote =
    gameState.turn === 1 && gameState.turnOrder.length > 0
      ? `차례 순서는 무작위예요 — 첫 차례는 ${sideName(gameState, gameState.startingTeam)} 님!`
      : null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="play-timer-window">
        {showTimer && <TurnTimer deadline={turnDeadline} paused={paused} totalMs={gameState.turnTotalMs} />}
        <span className="play-timer-text">
          {firstNote && <span className="play-timer-note">{firstNote}</span>}
          <span style={urgent ? { color: '#b45309' } : undefined}>{text}</span>
        </span>
      </div>
    </div>
  );
}
