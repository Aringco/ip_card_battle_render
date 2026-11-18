import type { Animal, GameState, SideId } from './types';
import { MAX_TURN } from './constants';
import { enhanceMermaidOppDivide } from './enhance';

/**
 * 이 판의 턴 상한 — 평소에는 MAX_TURN(20)이다.
 * 혼자 놀기 '카드 강화'(enhance)는 **상한이 없다**(Infinity) — 목표 체력·상대 체력 0으로만 끝난다. 화면은 이때 "n턴"만 쓴다.
 * 서버의 종료 판정(turnManager)과 화면의 "n / 20턴" 표시가 같은 값을 써야 하므로 여기 한 곳에 둔다.
 */
export function maxTurnOf(state: Pick<GameState, 'enhance'>): number {
  return state.enhance ? Infinity : MAX_TURN;
}

// "상대가 누구인가"를 구하는 유일한 길 — 팀전은 편이 둘이라 `team === 'A' ? 'B' : 'A'`로 뒤집으면
// 됐지만, 개인전은 편이 최대 8개라 그 뒤집기가 조용히 없는 편을 가리킨다. 엔진·방·화면 어디서든
// 반대편이 필요하면 아래 함수를 쓴다(server/__tests__/noTeamFlip.test.ts가 뒤집기 재발을 막는다).

/** 순위가 정해지지 않은(아직 판에 있는) 편들 — turnOrder 순서 그대로. 팀전은 언제나 두 편이다. */
export function activeSides(state: GameState): SideId[] {
  return state.turnOrder.filter(side => !state.teams[side]?.finish);
}

/** side를 뺀 나머지 활성 편들. 팀전이면 언제나 [반대편] 하나다. */
export function opponentsOf(state: GameState, side: SideId): SideId[] {
  return activeSides(state).filter(s => s !== side);
}

/**
 * turnOrder에서 from 다음의 활성 편. from 자신이 이미 순위가 정해졌어도(그 기술로 승리·탈락한
 * 직후에 차례를 넘길 때) 그 자리에서부터 센다. from 말고 활성 편이 없으면 null.
 */
export function nextActiveSide(state: GameState, from: SideId): SideId | null {
  const order = state.turnOrder;
  const start = order.indexOf(from);
  if (start < 0) return null;
  for (let i = 1; i < order.length; i++) {
    const candidate = order[(start + i) % order.length];
    if (!state.teams[candidate]?.finish) return candidate;
  }
  return null;
}

/**
 * 개인전에서 이 기술을 쓰려면 상대를 골라야 하는가 — 특허랑이는 언제나, 디자인어는 **강화 방에서 Lv.6부터**(상대 배율 −N ·
 * Lv.9부터 상대 효과 ÷N이 붙는다 — 2026-10-30, 개인전 강화). 팀전은 상대가 하나뿐이라 언제나 false다.
 * 서버(gameEngine.processIndividualSkill — 대상 없으면 무시)와 화면(상대 고르기 창)이 같은 판정을 써야 한다.
 */
export function needsTarget(state: Pick<GameState, 'mode' | 'enhance'>, animal: Animal, level: number): boolean {
  if (state.mode !== 'individual') return false;
  if (animal === 'tiger') return true;
  return animal === 'mermaid' && !!state.enhance && enhanceMermaidOppDivide(level) > 1;
}

/**
 * 승리 방식(2026-11-17, 방 규칙 winMode — 강화 판 · 일반 개인전 폼에서 고른다, 팀전 일반 판은 기본값 그대로) — 무엇으로 판이 끝나는가.
 * 섬멸전: 승리선에 닿아도 끝나지 않는다(체력 0으로만) · 번영전: 체력 0이어도 지지 않는다(승리선 도달로만 — 0에 머문 채 계속 둔다).
 * 서버 판정(checkKnockout · resolveRanks · tickEnhanceStatus) · 컴퓨터 · 화면의 "끝내는 수" 표시가 모두 이 둘을 거친다.
 */
export function winsByReach(state: { settings: { winMode?: string } }): boolean {
  return state.settings.winMode !== 'annihilate';
}
export function losesAtZero(state: { settings: { winMode?: string } }): boolean {
  return state.settings.winMode !== 'recovery';
}
