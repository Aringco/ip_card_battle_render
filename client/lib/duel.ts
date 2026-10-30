import type { ClientGameEvent, ClientGameState, SideId } from 'shared';
import { mySideOf } from './individual';

// 개인전 1:1 — 시작 인원이 두 명(관전자 제외)인 개인전은 **일반(팀전) 화면**으로 그린다(2026-10-30 요청).
//
// 서버는 그대로 개인전이다(편 'p1'·'p2', 순위 판정, 사람마다 즉시 멈추는 일시정지 …). 화면만 바꾸려고, 방 화면이
// 서버 상태·이벤트의 편 id를 팀전의 'A'(왼쪽 = 나)·'B'(오른쪽 = 상대)로 **이름만 바꿔** GameLayout·GameEndScreen과
// 연출 큐(useAnimationQueue)에 넘긴다. 관전자는 차례 순서대로 첫 사람이 왼쪽이다.
//
// ⚠️ 서버로 보내는 것은 언제나 진짜 편 id다 — 특허랑이의 대상은 GameLayout이 고르지 않으므로(팀전은 상대가 하나다)
//    방 화면이 오른쪽 편(duel.right)을 실어 보낸다.
// ⚠️ 이름을 바꾸는 값은 **편 id가 들어가는 칸**(VALUE_KEYS)과 편 id를 키로 쓰는 묶음뿐이다 — 닉네임(members·teamNames의 값)이
//    우연히 'p1'이어도 건드리지 않는다.

export interface DuelMap {
  left: SideId; // 'A'로 그릴 편 — 나(관전자면 차례 순서의 첫 사람)
  right: SideId; // 'B'로 그릴 편
}

/** 개인전 1:1이면 왼쪽·오른쪽 편, 아니면 null. turnOrder는 시작할 때 정해져 바뀌지 않는다(순위가 정해져도 남는다). */
export function duelMapOf(state: ClientGameState, playerId: string | null): DuelMap | null {
  if (state.mode !== 'individual' || state.turnOrder.length !== 2) return null;
  const left = mySideOf(state, playerId) ?? state.turnOrder[0];
  const right = state.turnOrder.find(s => s !== left);
  return right === undefined ? null : { left, right };
}

// 편 id가 값으로 들어가는 칸(shared/types.ts · protocol.ts) — turnOrder는 그 배열이다
const VALUE_KEYS = new Set([
  'team', 'side', 'target', 'winner', 'activeTeam', 'pendingChoice', 'startingTeam', 'forfeitedBy', 'collectedBy', 'turnOrder',
]);

function rename(value: unknown, names: ReadonlyMap<string, string>, isSideValue: boolean): unknown {
  if (typeof value === 'string') return isSideValue ? (names.get(value) ?? value) : value;
  if (Array.isArray(value)) return value.map(v => rename(v, names, isSideValue));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[names.get(k) ?? k] = rename(v, names, VALUE_KEYS.has(k));
    return out;
  }
  return value;
}

const namesOf = (m: DuelMap) => new Map([[m.left, 'A'], [m.right, 'B']]);

/** 서버 상태 → 팀전 화면이 읽는 모양(편 'A'·'B', mode 'team'). 기권으로 끝났으면 forfeitedBy를 채운다(결과 화면의 사유 문구). */
export function duelViewState(state: ClientGameState, m: DuelMap): ClientGameState {
  const view = rename(state, namesOf(m), false) as ClientGameState;
  const forfeited = (['A', 'B'] as const).find(s => view.teams[s]?.finish?.reason === 'forfeit');
  return { ...view, mode: 'team', forfeitedBy: view.forfeitedBy ?? forfeited ?? null };
}

/**
 * 서버 이벤트 → 팀전 화면의 이벤트. 순위 알림('ranked')은 팀전 화면에 없으므로 빼고, 판의 끝(gameEnd reason 'ranked')은
 * 팀전의 사유로 바꾼다 — 기권이 섞였으면 'forfeit', 아니면 체력 즉시 승부('knockout' — "결정타!" 연출이 그것을 본다).
 */
export function duelViewEvents(events: ClientGameEvent[], m: DuelMap): ClientGameEvent[] {
  const names = namesOf(m);
  const forfeit = events.some(e => e.type === 'ranked' && e.reason === 'forfeit');
  return events
    .filter(e => e.type !== 'ranked')
    .map(e => {
      const r = rename(e, names, false) as ClientGameEvent;
      if (r.type === 'gameEnd' && r.reason === 'ranked') return { ...r, reason: forfeit ? 'forfeit' : 'knockout' };
      return r;
    });
}
