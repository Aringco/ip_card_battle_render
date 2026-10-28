import type { GameEvent, GameState, SideId, TeamState } from 'shared';
import type { ClientGameEvent, ClientGameState } from 'shared';

/**
 * 서버 GameState → 클라이언트 전송용 ClientGameState 변환.
 * 카드는 뽑히는 즉시 공개되므로 숨길 정보가 없어, 활성 플레이어 닉네임과
 * 턴 제한시간, 팀 이름만 덧붙이면 된다.
 *
 * 턴 제한시간은 서버 시계의 절대 시각이 아니라 "지금부터 남은 ms"로 보낸다 —
 * 클라이언트 PC 시계가 서버와 어긋나도 표시가 틀어지지 않게 하기 위함이다
 * (ClientGameState.turnRemainingMs 주석 참고).
 */
export function serializeState(
  state: GameState,
  turnDeadline: number,
  turnTotalMs: number,
  teamNames: Record<SideId, string>,
  memberIds: Record<SideId, string[]>,
  // 일시정지는 엔진이 아니라 방(Room)이 들고 있는 상태라 state에 없다 — 그래서 여기로
  // 따로 받아 실어 보낸다. 재접속 스냅샷도 이 경로를 쓰므로 멈춘 방에 다시 들어와도
  // 화면이 멈춘 채로 복원된다.
  pause: {
    paused: boolean;
    pausedBy: { team: SideId; nickname: string } | null;
    pendingAnswer: boolean;
    used: Record<SideId, number>;
    unlimited: boolean;
    remainingMs: number;
  } = { paused: false, pausedBy: null, pendingAnswer: false, used: { A: 0, B: 0 }, unlimited: false, remainingMs: 0 },
): ClientGameState {
  const activeTeam = state.teams[state.activeTeam];
  const activePlayerNickname = activeTeam.members[state.activePlayerIndex] ?? '';

  return {
    phase: state.phase,
    turn: state.turn,
    activeTeam: state.activeTeam,
    activePlayerIndex: state.activePlayerIndex,
    activePlayerNickname,
    turnRemainingMs: turnDeadline === 0 ? 0 : Math.max(0, turnDeadline - Date.now()),
    turnTotalMs,
    paused: pause.paused,
    pausedBy: pause.pausedBy,
    pausePendingAnswer: pause.pendingAnswer,
    pauseUsed: { ...pause.used },
    pauseUnlimited: pause.unlimited,
    pauseRemainingMs: pause.remainingMs,
    teamNames,
    memberIds: copyBySide(state, side => [...(memberIds[side] ?? [])]),
    stacks: {
      sheep: [...state.stacks.sheep],
      rabbit: [...state.stacks.rabbit],
      mermaid: [...state.stacks.mermaid],
      tiger: [...state.stacks.tiger],
    },
    lastPlace: state.lastPlace,
    festival: state.festival,
    pendingChoice: state.pendingChoice,
    // ⚠️ A·B 키를 손으로 하나씩 적지 말 것 — 개인전은 편이 p1…p8까지 있어서, 손으로 복사하면
    //    에러 없이 나머지 편이 통째로 빠진 채 화면에 간다. 항상 state.teams의 키를 돈다.
    teams: copyBySide(state, side => serializeTeam(state.teams[side])),
    winner: state.winner,
    forfeitedBy: state.forfeitedBy ?? null,
    settings: state.settings,
    startingTeam: state.startingTeam,
    startingTeamReason: state.startingTeamReason,
    mode: state.mode,
    turnOrder: [...state.turnOrder],
    skillsPerTurn: state.skillsPerTurn,
    skillsUsedThisTurn: state.skillsUsedThisTurn,
    ranks: { ...state.ranks },
    // 이벤트 '한 우물만 파기'만 — 없는 판의 직렬화 모양은 예전과 똑같이 둔다. ⚠️ 빠뜨리면 F5 뒤 잠금이 풀려 보인다.
    ...(state.oneWell ? { oneWell: { ...state.oneWell, allowed: [...state.oneWell.allowed] } } : {}),
    ...(state.scoreRace ? { scoreRace: { ...state.scoreRace } } : {}),
    // 카드 강화 판만 — 쿨타임은 편마다 새 객체로 복사한다(엔진이 계속 고쳐 쓰는 객체를 그대로 넘기지 않는다).
    ...(state.enhance
      ? {
          enhance: {
            cooldowns: Object.fromEntries(Object.entries(state.enhance.cooldowns).map(([side, cd]) => [side, { ...cd }])),
            divisors: { ...state.enhance.divisors },
          },
        }
      : {}),
  };
}

/** state.teams의 모든 편(팀전 A·B / 개인전 p1…)에 대해 값을 만들어 같은 키로 모은다. */
function copyBySide<T>(state: GameState, make: (side: SideId) => T): Record<SideId, T> {
  const out: Record<SideId, T> = {};
  for (const side of Object.keys(state.teams)) out[side] = make(side);
  return out;
}

function serializeTeam(t: TeamState): TeamState {
  return {
    members: t.members,
    exp: { ...t.exp },
    hp: t.hp,
    pendingMultiplier: t.pendingMultiplier,
    pendingExtraDraws: t.pendingExtraDraws,
    pendingFestivalDraws: t.pendingFestivalDraws,
    playerIndex: t.playerIndex,
    skillStats: {
      sheep: { ...t.skillStats.sheep },
      rabbit: { ...t.skillStats.rabbit },
      mermaid: { ...t.skillStats.mermaid },
      tiger: { ...t.skillStats.tiger },
    },
    // 개인전만 채워지는 필드 — 팀전 직렬화의 모양이 예전과 똑같도록 있을 때만 싣는다.
    ...(t.color !== undefined ? { color: t.color } : {}),
    ...(t.finish !== undefined ? { finish: { ...t.finish } } : {}),
  };
}

/** GameEvent와 ClientGameEvent는 동일한 형태라 그대로 통과시킨다. */
export function serializeEvents(events: GameEvent[]): ClientGameEvent[] {
  return events;
}
