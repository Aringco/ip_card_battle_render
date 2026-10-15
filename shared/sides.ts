import type { GameState, SideId } from './types';

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
