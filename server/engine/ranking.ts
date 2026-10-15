import { LOSE_HP, activeSides } from 'shared';
import type { FinishReason, GameEvent, GameState, SideId } from 'shared';

// 개인전(순위전)의 순위 판정 — INDIVIDUAL_MODE_ROADMAP.md §2-4와 부록 D가 규칙의 전부다.
//
// - 승리선(targetScore × 2)에 닿으면 **승리**: 승리한 순서대로 1위, 2위, …
// - 체력이 0 이하가 되면 **패배(탈락)**: 패배한 순서대로 꼴찌, 꼴찌−1, …
// - 순위가 정해진 사람은 판에서 빠진다(차례가 오지 않고, 특허랑이의 대상이 될 수 없다).
// - 순위가 정해지지 않은 사람이 1명 이하가 되면 판이 끝나고, 남은 1명이 남은 순위를 받는다.
//
// ⚠️ 팀전의 checkKnockout(turnManager.ts)을 개인전 경로에서 부르지 말 것 — 그것은 "한쪽이 0이면
//    곧바로 판 끝"이라, 한 사람이 탈락하는 순간 전원의 판이 끝난다. 개인전은 항상 이 파일을 거친다.
//
// ⚠️ 순위(rank)는 반드시 **이미 기록된 사람 수**에서 구한다. 별도 카운터를 두면 항복(방에서 일어난다)과
//    기술(엔진에서 일어난다)이 각자 세다가 어긋난다. 위에서는 'win'의 수, 아래에서는 'out'·'forfeit'의 수다.

/** 이 사유로 순위가 정해진 편의 수. */
function countByReason(state: GameState, ...reasons: FinishReason[]): number {
  return Object.values(state.teams).filter(t => t.finish && reasons.includes(t.finish.reason)).length;
}

function record(state: GameState, side: SideId, rank: number, reason: FinishReason): GameEvent {
  state.teams[side].finish = { rank, reason };
  state.ranks[side] = rank;
  return { type: 'ranked', team: side, rank, reason };
}

/** 판을 끝낸다 — winner는 1위(공동 1위면 'draw'), pendingChoice는 비운다. */
function endRankedGame(state: GameState, reason: 'ranked' | 'turnLimit'): GameEvent {
  const firsts = state.turnOrder.filter(side => state.teams[side].finish?.rank === 1);
  const winner: SideId | 'draw' = firsts.length === 1 ? firsts[0] : 'draw';
  state.phase = 'ended';
  state.winner = winner;
  state.pendingChoice = null;
  return { type: 'gameEnd', winner, reason };
}

/**
 * 판의 끝 검사 — 순위가 정해지지 않은 사람이 1명 이하면 남은 사람에게 남은 순위를 주고 판을 끝낸다.
 * 기술(resolveRanks)과 항복·나가기(gameEngine.processForfeit)가 함께 쓴다.
 */
export function settleIfFinished(state: GameState): GameEvent[] {
  const left = activeSides(state);
  if (left.length > 1) return [];

  const events: GameEvent[] = [];
  if (left.length === 1) {
    // 위에서 다음 빈 순위 — 승리한 사람 수 + 1. 위·아래에서 채운 순위가 만나는 자리가 이 사람이다.
    events.push(record(state, left[0], 1 + countByReason(state, 'win'), 'last'));
  }
  events.push(endRankedGame(state, 'ranked'));
  return events;
}

/**
 * 기술 하나를 적용한 직후 부른다. 승리선에 닿은 사람과 체력이 0이 된 사람의 순위를 기록하고,
 * 판이 끝났으면 gameEnd까지 이벤트로 돌려준다. 승리 쪽을 먼저 기록한다.
 */
export function resolveRanks(state: GameState): GameEvent[] {
  if (state.mode !== 'individual' || state.phase !== 'playing') return [];

  const events: GameEvent[] = [];
  const winHp = state.settings.targetScore * 2;
  const total = state.turnOrder.length;

  // ① 승리 — 위에서부터
  for (const side of state.turnOrder) {
    const t = state.teams[side];
    if (t.finish) continue;
    if (t.hp >= winHp) {
      events.push(record(state, side, 1 + countByReason(state, 'win'), 'win'));
    }
  }

  // ② 패배 — 아래에서부터 (항복도 같은 칸을 쓴다)
  for (const side of state.turnOrder) {
    const t = state.teams[side];
    if (t.finish) continue;
    if (t.hp <= LOSE_HP) {
      events.push(record(state, side, total - countByReason(state, 'out', 'forfeit'), 'out'));
    }
  }

  // ③ 판의 끝
  events.push(...settleIfFinished(state));
  return events;
}

/**
 * 턴 제한(MAX_TURN 초과)으로 끝날 때 — 순위가 정해지지 않은 사람들을 체력이 높은 순서대로 남은
 * 순위를 위에서부터 준다. 체력이 같으면 같은 순위이고, 다음 순위는 그 인원만큼 건너뛴다
 * (남은 순위가 2위부터이고 체력이 10·10·5면 2위·2위·4위).
 */
export function rankByHpAndEnd(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const left = activeSides(state)
    .map((side, order) => ({ side, order, hp: state.teams[side].hp }))
    .sort((a, b) => b.hp - a.hp || a.order - b.order);

  const first = 1 + countByReason(state, 'win');
  let prevRank = 0;
  let prevHp = Number.NaN;
  for (let i = 0; i < left.length; i++) {
    const rank = left[i].hp === prevHp ? prevRank : first + i;
    events.push(record(state, left[i].side, rank, 'turnLimit'));
    prevRank = rank;
    prevHp = left[i].hp;
  }

  events.push(endRankedGame(state, 'turnLimit'));
  return events;
}

/**
 * 항복·나가기 — 그 사람은 패배(꼴찌 쪽부터 순위)이고 판은 계속된다. 이미 순위가 정해진 사람이면 무시.
 * 판의 끝 검사까지 함께 한다. 지금 차례가 그 사람이었을 때 다음 사람에게 넘기는 일은 호출하는 쪽
 * (gameEngine.processForfeit)이 한다 — 차례 넘김은 turnManager에 있고, 이 파일은 turnManager를 모른다.
 */
export function forfeitRank(state: GameState, side: SideId): GameEvent[] {
  if (state.mode !== 'individual' || state.phase !== 'playing') return [];
  const t = state.teams[side];
  if (!t || t.finish) return [];

  const rank = state.turnOrder.length - countByReason(state, 'out', 'forfeit');
  return [record(state, side, rank, 'forfeit'), ...settleIfFinished(state)];
}
