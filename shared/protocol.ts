import type { Animal, GameEvent, GameSettings, GameState, Place, Team } from './types';

// ─── 클라이언트 → 서버 ───────────────────────────────────────────────────────

export type ClientMessage =
  // settings는 방장(방을 만드는 쪽)만 보낸다 — 값을 정하지 않은 항목은 기본값으로 채워진다.
  | { type: 'createRoom'; nickname: string; team: Team; teamName?: string; settings?: Partial<GameSettings> }
  | { type: 'joinRoom'; roomId: string; nickname: string; team: Team; teamName?: string }
  | { type: 'createSoloRoom'; nickname: string; teamName?: string; settings?: Partial<GameSettings> } // 싱글 모드 — 컴퓨터(랜덤 클릭)와 즉시 대전
  | { type: 'ready' }
  | { type: 'drawCard'; place: Place }
  | { type: 'chooseSkill'; animal: Animal } // 턴 종료 시 4가지 스킬 중 하나 선택
  | { type: 'passSkill' } // 턴 종료 시 "아무것도 하지 않음" 선택
  | { type: 'reconnect'; roomId: string; playerId: string };

// ─── 서버 → 클라이언트 ──────────────────────────────────────────────────────

export type ServerMessage =
  // 로비
  | { type: 'roomCreated'; roomId: string; playerId: string }
  | { type: 'roomJoined'; roomId: string; playerId: string }
  | { type: 'lobbyState'; players: LobbyPlayer[]; teamNames: Record<Team, string | null>; settings: GameSettings }
  | { type: 'error'; code: ErrorCode; message: string }
  // 게임
  | { type: 'gameStart'; state: ClientGameState }
  | { type: 'gameSnapshot'; state: ClientGameState }   // 재접속용
  | { type: 'actionResult'; events: ClientGameEvent[]; state: ClientGameState };

export interface LobbyPlayer {
  nickname: string;
  team: Team;
  ready: boolean;
}

export type ErrorCode =
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'NICKNAME_TAKEN'
  | 'NOT_YOUR_TURN'
  | 'CARD_NOT_AVAILABLE'
  | 'GAME_NOT_STARTED'
  | 'GAME_ALREADY_STARTED'
  | 'INVALID_RECONNECT'
  | 'NO_PENDING_CHOICE';

// ─── 클라이언트 게임 상태 ─────────────────────────────────────────────────────
// 카드가 뽑히는 즉시 공개되므로(숨겨진 카드 상태가 없음) 서버 GameState를 그대로
// 확장해서 쓴다 — 예전처럼 별도의 클라이언트 전용 board 직렬화가 필요 없다.

export interface ClientGameState extends GameState {
  activePlayerNickname: string;
  // 남은 턴 제한시간(ms) — 서버가 이 상태를 직렬화하는 순간을 기준으로 잰 "상대 시간"이다.
  // 예전에는 서버 시계의 절대 시각(turnDeadline)을 그대로 보냈는데, 그러면 클라이언트 PC
  // 시계가 서버와 어긋난 만큼 표시가 그대로 틀어졌다(엉뚱한 숫자에서 시작해 0에 멈춰
  // 있는데도 턴은 계속 흐르는 증상). 상대 시간으로 보내고 클라이언트가 자기 시계로
  // 데드라인을 다시 계산하면 시계 오차의 영향을 받지 않는다.
  turnRemainingMs: number;
  // 타이머 게이지 100%에 해당하는 시간(ms) — 방 설정값(drawTimeSec/actionTimeSec/
  // noActionTimeSec)에 실용신양·도토리 축제 예약 뽑기로 늘어난 시간까지 더한, 이번 턴에
  // 실제로 주어진 시간이다. 클라이언트가 방 설정값만 보고 게이지 폭을 정하면 늘어난
  // 시간을 반영하지 못해 눈금과 숫자가 어긋나므로 서버가 직접 알려준다.
  // (연출 유예 시간은 여기에 포함하지 않는다 — 아래 turnRemainingMs가 이 값을 잠시
  //  넘을 수 있고, 그 구간에는 게이지가 가득 찬 상태로 표시된다.)
  turnTotalMs: number;
  teamNames: Record<Team, string>; // 방장이 정했거나 무작위로 배정된 팀 이름("A팀"/"B팀" 대신 표시)
  memberIds: Record<Team, string[]>; // teams[team].members와 같은 순서의 playerId — 클라이언트가 "지금 활성 플레이어가 바로 나인지"를 판별하는 데 쓴다
}

export type ClientGameEvent = GameEvent;
