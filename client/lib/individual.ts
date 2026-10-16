import type { ClientGameState, FinishReason, SideId } from 'shared';
import { playerColorHex } from 'shared';

// 개인전(순위전) 화면이 공유하는 작은 도우미들 — INDIVIDUAL_MODE_ROADMAP.md.
//
// ⚠️ 개인전의 색은 **사람마다 고정**이다(대기실에서 고른 PLAYER_COLORS). 팀전의 색 체계
//    (client/lib/teamColors.ts — "우리 연두 / 상대 붉은", 관전은 민트·핑크)와 섞지 말 것. 개인전 화면에서
//    팀 색 함수를 부르면 모두 같은 색으로 보인다(주의 8).

/** 그 사람의 색(16진). 색이 없으면(옛 상태) 중립 회색. */
export function sideColor(state: ClientGameState, side: SideId): string {
  return playerColorHex(state.teams[side]?.color);
}

/** 그 사람의 닉네임 — 개인전은 teamNames[side]가 곧 닉네임이다. */
export function sideName(state: ClientGameState, side: SideId): string {
  return state.teamNames[side] ?? state.teams[side]?.members[0] ?? side;
}

/** 내 playerId가 속한 편. 관전자(어느 편에도 없음)면 null. */
export function mySideOf(state: ClientGameState, playerId: string | null): SideId | null {
  if (playerId === null) return null;
  for (const side of Object.keys(state.memberIds)) {
    if (state.memberIds[side].includes(playerId)) return side;
  }
  return null;
}

/** 순위가 정해졌는가(승리·탈락·기권 …) — 정해진 사람은 판에서 빠진 관전자와 같다. */
export function isFinished(state: ClientGameState, side: SideId | null): boolean {
  return side !== null && state.teams[side]?.finish !== undefined;
}

/**
 * 오른쪽 목록에 그릴 편들의 순서 — 기준 편(focus) **다음 차례부터** 한 바퀴 돈다. 그러면 맨 위 칸이
 * 곧 "내 다음에 두는 사람"이라 차례가 오는 순서가 눈으로 읽힌다. focus가 목록에 없으면(관전자)
 * turnOrder 그대로. omit이 주어지면 그 편은 뺀다(내 편은 왼쪽 패널에 있으므로).
 */
export function opponentOrder(state: ClientGameState, focus: SideId | null, omit: SideId | null): SideId[] {
  const order = state.turnOrder;
  const start = focus === null ? -1 : order.indexOf(focus);
  const rotated = start < 0 ? [...order] : [...order.slice(start + 1), ...order.slice(0, start + 1)];
  return rotated.filter(s => s !== omit);
}

const FINISH_WORD: Record<FinishReason, string> = {
  win: '승리',
  out: '탈락',
  forfeit: '기권',
  turnLimit: '턴 제한',
  last: '생존',
};

/** "2위 · 승리" 같은 한 줄. 순위가 아직 없으면 null. */
export function finishLabel(state: ClientGameState, side: SideId): string | null {
  const f = state.teams[side]?.finish;
  return f ? `${f.rank}위 · ${FINISH_WORD[f.reason]}` : null;
}

export { FINISH_WORD };
