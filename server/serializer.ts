import type { GameEvent, GameState, Team } from 'shared';
import type { ClientGameEvent, ClientGameState } from 'shared';

/**
 * 서버 GameState → 클라이언트 전송용 ClientGameState 변환.
 * 카드는 뽑히는 즉시 공개되므로 숨길 정보가 없어, 활성 플레이어 닉네임과
 * 턴 데드라인, 팀 이름만 덧붙이면 된다.
 */
export function serializeState(
  state: GameState,
  turnDeadline: number,
  teamNames: Record<Team, string>,
  memberIds: Record<Team, string[]>,
): ClientGameState {
  const activeTeam = state.teams[state.activeTeam];
  const activePlayerNickname = activeTeam.members[state.activePlayerIndex] ?? '';

  return {
    phase: state.phase,
    turn: state.turn,
    activeTeam: state.activeTeam,
    activePlayerIndex: state.activePlayerIndex,
    activePlayerNickname,
    turnDeadline,
    teamNames,
    memberIds: { A: [...memberIds.A], B: [...memberIds.B] },
    stacks: {
      sheep: [...state.stacks.sheep],
      rabbit: [...state.stacks.rabbit],
      mermaid: [...state.stacks.mermaid],
      tiger: [...state.stacks.tiger],
    },
    festival: state.festival,
    pendingChoice: state.pendingChoice,
    teams: {
      A: {
        members: state.teams.A.members,
        exp: { ...state.teams.A.exp },
        hp: state.teams.A.hp,
        pendingMultiplier: state.teams.A.pendingMultiplier,
        pendingExtraDraws: state.teams.A.pendingExtraDraws,
        pendingFestivalDraws: state.teams.A.pendingFestivalDraws,
        playerIndex: state.teams.A.playerIndex,
        skillStats: {
          sheep: { ...state.teams.A.skillStats.sheep },
          rabbit: { ...state.teams.A.skillStats.rabbit },
          mermaid: { ...state.teams.A.skillStats.mermaid },
          tiger: { ...state.teams.A.skillStats.tiger },
        },
      },
      B: {
        members: state.teams.B.members,
        exp: { ...state.teams.B.exp },
        hp: state.teams.B.hp,
        pendingMultiplier: state.teams.B.pendingMultiplier,
        pendingExtraDraws: state.teams.B.pendingExtraDraws,
        pendingFestivalDraws: state.teams.B.pendingFestivalDraws,
        playerIndex: state.teams.B.playerIndex,
        skillStats: {
          sheep: { ...state.teams.B.skillStats.sheep },
          rabbit: { ...state.teams.B.skillStats.rabbit },
          mermaid: { ...state.teams.B.skillStats.mermaid },
          tiger: { ...state.teams.B.skillStats.tiger },
        },
      },
    },
    winner: state.winner,
    settings: state.settings,
    startingTeam: state.startingTeam,
    startingTeamReason: state.startingTeamReason,
  };
}

/** GameEvent와 ClientGameEvent는 동일한 형태라 그대로 통과시킨다. */
export function serializeEvents(events: GameEvent[]): ClientGameEvent[] {
  return events;
}
