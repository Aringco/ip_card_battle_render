import type { Animal, GameEvent, GameSettings, GameState, Place, Seat, Team } from './types';

// ─── 클라이언트 → 서버 ───────────────────────────────────────────────────────

export type ClientMessage =
  // settings는 방장(방을 만드는 쪽)만 보낸다 — 값을 정하지 않은 항목은 기본값으로 채워진다.
  // otherTeamName은 방장이 아직 아무도 들어오지 않은 "상대 팀"의 이름까지 미리 정해두는
  // 값이다(팀 이름 짓기가 방장 한쪽에만 있던 걸 보완) — 나중에 그 팀으로 실제 참가하는
  // 사람이 joinRoom에 teamName을 보내도, 이미 정해진 이름이 있으면 그쪽이 우선한다
  // (Room.assignTeamName 참고).
  //
  // team에는 관전석('spectator')도 올 수 있다. 방을 만드는 사람이 관전석을 골랐다면
  // teamName/otherTeamName은 각각 팀 1(A)·팀 2(B)의 이름으로 쓰인다.
  | { type: 'createRoom'; nickname: string; team: Seat; teamName?: string; otherTeamName?: string; settings?: Partial<GameSettings> }
  | { type: 'joinRoom'; roomId: string; nickname: string; team: Seat; teamName?: string }
  | { type: 'createSoloRoom'; nickname: string; teamName?: string; settings?: Partial<GameSettings> } // 싱글 모드 — 컴퓨터(랜덤 클릭)와 즉시 대전
  // ready는 토글이다 — 값을 생략하면 "준비 완료"로 본다(옛 클라이언트 호환).
  | { type: 'ready'; ready?: boolean }
  | { type: 'leaveRoom' } // 대기실에서 스스로 나가기(연결은 유지한 채 방만 벗어난다)
  // ─ 아래는 방장 전용 명령 (단, movePlayer는 자기 자신을 옮길 때만 누구나 쓸 수 있다) ─
  // 대상 지정에는 playerId가 아니라 방 안에서만 통하는 공개 식별자(memberId)를 쓴다 —
  // playerId는 재접속 자격증명이라 다른 참가자에게 노출하면 세션을 가로챌 수 있다.
  | { type: 'movePlayer'; targetMemberId: string; team: Seat } // 관전석으로 보내는 것도 "자리 이동"이다
  | { type: 'kickPlayer'; targetMemberId: string }
  | { type: 'transferHost'; targetMemberId: string }
  | { type: 'setTeamName'; team: Team; name: string }
  | { type: 'updateSettings'; settings: Partial<GameSettings> }
  | { type: 'startGame' } // 방장이 직접 시작(모두 준비 완료 + 양 팀에 한 명 이상일 때만)
  | { type: 'chat'; text: string } // 대기실 채팅 — 게임이 시작된 뒤에는 서버가 무시한다
  | { type: 'drawCard'; place: Place }
  | { type: 'chooseSkill'; animal: Animal } // 턴 종료 시 4가지 스킬 중 하나 선택
  | { type: 'passSkill' } // 턴 종료 시 "아무것도 하지 않음" 선택
  | { type: 'reconnect'; roomId: string; playerId: string }
  // ─ 게임 중 메뉴(⏸) ─
  // 일시정지 요청. 상대 팀에 사람이 한 명도 없으면(싱글 모드·전원 접속 끊김) 곧바로
  // 멈추고, 있으면 그 사람들에게 pauseRequest를 보내 PAUSE_REQUEST_TIMEOUT_SEC 동안 답을 기다린다.
  | { type: 'pauseRequest' }
  | { type: 'pauseRespond'; accept: boolean } // 요청받은 쪽의 대답(네/아니오)
  | { type: 'resumeGame' }                    // 멈춘 게임을 다시 시작 — 멈춘 팀만 풀 수 있다
  // 항복하기(leave 없음)와 나가기(leave: true)는 **승패 처리가 같다** — 상대 팀 승리로
  // 게임이 끝난다. 다른 점은 나가기가 그 뒤 방에서까지 빠져 로비로 돌아간다는 것뿐이다.
  // 관전자가 보내면 승패는 건드리지 않고 나가기만 처리한다(관전자는 어느 팀도 아니다).
  | { type: 'forfeit'; leave?: boolean }
  // ─ 시연 모드 ─
  // 짝이 맞아 멈춰 선 화면에서 [계속 ▶]을 눌렀다. 시연 방이 아니면 서버가 무시한다.
  | { type: 'demoContinue' };

// ─── 서버 → 클라이언트 ──────────────────────────────────────────────────────

export type ServerMessage =
  // 로비 — memberId는 이 방 안에서 나를 가리키는 공개 식별자다(playerId는 재접속
  // 자격증명이라 남에게 보이면 안 되므로, 방장 명령의 대상 지정에는 이 값을 쓴다).
  | { type: 'roomCreated'; roomId: string; playerId: string; memberId: string }
  | { type: 'roomJoined'; roomId: string; playerId: string; memberId: string }
  | {
      type: 'lobbyState';
      players: LobbyPlayer[];
      teamNames: Record<Team, string | null>;
      settings: GameSettings;
      hostMemberId: string | null;
    }
  | { type: 'kicked'; message: string }   // 방장에게 추방당해 방에서 나갔음
  | { type: 'leftRoom' }                  // 스스로 나가기(leaveRoom) 완료
  | { type: 'chatMessage'; message: LobbyChatMessage }     // 새 대기실 채팅 1건
  | { type: 'chatHistory'; messages: LobbyChatMessage[] }  // 입장·재접속 시 최근 기록 전체
  | { type: 'error'; code: ErrorCode; message: string }
  // 게임
  | { type: 'gameStart'; state: ClientGameState }
  | { type: 'gameSnapshot'; state: ClientGameState }   // 재접속용
  | { type: 'actionResult'; events: ClientGameEvent[]; state: ClientGameState }
  // 일시정지 상태가 바뀌었다(멈춤/재개). 멈춤 여부 자체는 state 안에 들어 있어
  // (ClientGameState.paused) 재접속 스냅샷으로도 그대로 복원된다 — 이 메시지는 "지금
  // 바뀌었다"는 알림이자 최신 상태 전달이다.
  | { type: 'pauseState'; state: ClientGameState }
  // 상대가 일시정지를 요청했다 — 요청한 팀의 **상대 팀 사람들에게만** 간다.
  | { type: 'pauseRequest'; fromTeam: Team; fromNickname: string; timeoutMs: number }
  // 그 요청이 끝났다 — 요청자와 요청받은 쪽 **모두**에게 가서 양쪽 창을 함께 닫는다.
  | { type: 'pauseRequestResult'; accepted: boolean; reason: 'accepted' | 'declined' | 'timeout' | 'cancelled' };

export interface LobbyPlayer {
  memberId: string;
  nickname: string;
  team: Seat;      // 'spectator'면 관전석에 앉아 있다는 뜻(게임에 참여하지 않는다)
  ready: boolean;  // 관전자는 준비할 것이 없으므로 서버가 항상 true로 유지한다
  connected: boolean;
}

/**
 * 대기실 채팅 한 줄. `kind: 'system'`은 사람이 친 말이 아니라 방에서 일어난 일
 * (입장·퇴장·추방·팀 변경·방장 위임·규칙 변경)을 알리는 안내줄이다.
 *
 * 시각(타임스탬프)은 일부러 싣지 않는다 — 서버 시계의 절대 시각을 그대로 보내면
 * 클라이언트 PC 시계가 어긋난 만큼 표시가 틀어지고(턴 타이머에서 이미 겪은 문제),
 * 대기실은 몇 분짜리 화면이라 시각 표시가 그 복잡도만큼의 값어치가 없다.
 */
export interface LobbyChatMessage {
  id: number;              // 방 안에서 1부터 증가 — React key이자 중복 수신 방어 기준
  kind: 'chat' | 'system';
  memberId: string | null; // system이면 null
  nickname: string;        // system이면 ''
  team: Seat | null;       // 닉네임을 자리 색으로 칠하는 용도, system이면 null
  // 이 말을 할 때 방장이었는지 — 닉네임 앞 👑 표시에 쓴다. "지금" 방장인지를 화면에서
  // 다시 계산하지 않고 서버가 그 순간의 값을 박아 보내므로, 나중에 방장이 바뀌어도
  // 지난 대화의 왕관은 말했던 그 사람에게 그대로 남는다.
  wasHost: boolean;
  text: string;
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
  | 'NO_PENDING_CHOICE'
  | 'NOT_HOST'          // 방장만 쓸 수 있는 명령을 방장이 아닌 사람이 보냈다
  | 'PLAYER_NOT_FOUND'  // 방장 명령의 대상(memberId)이 방에 없다
  | 'TEAM_NAME_TAKEN'   // 바꾸려는 팀 이름이 상대 팀과 겹친다
  | 'CANNOT_START'      // 아직 시작 조건(양 팀 한 명 이상 + 전원 준비)을 못 채웠다
  | 'PAUSE_UNAVAILABLE' // 지금은 일시정지(또는 재개)를 할 수 없다
  | 'INTERNAL';         // 서버가 그 메시지를 처리하다 예외를 냈다(그 사람에게만 알린다)

// ─── 클라이언트 게임 상태 ─────────────────────────────────────────────────────
// 카드가 뽑히는 즉시 공개되므로(숨겨진 카드 상태가 없음) 서버 GameState를 그대로
// 확장해서 쓴다 — 예전처럼 별도의 클라이언트 전용 board 직렬화가 필요 없다.

/**
 * 시연 모드에서 화면에 내려보내는 진행 상황.
 *
 * ⚠️ **암호(팀명·닉네임)는 여기에 실리지 않는다.** 그 판정은 서버 안에서만 일어나고
 *    (`server/demo/trigger.ts`), 밖으로 나가는 것은 "지금 무엇을 누를 수 있는가"뿐이다.
 *    암호를 shared에 두면 클라이언트 번들에 문자열로 박혀 누구나 찾아낼 수 있다.
 *
 * 시연 시나리오 전문은 저장소 루트의 `DEMO_MODE.md`에 있다.
 */
export interface DemoView {
  chapter: number;
  /** 지금 화면에 띄울 설명 */
  caption: string;
  /** 누를 수 있는 장소. **비어 있으면 전부 잠긴다** */
  allowedPlaces: Place[];
  /** 누를 수 있는 기술. 비어 있으면 전부 잠긴다 */
  allowedSkills: Animal[];
  /**
   * 지금 무엇을 기다리는지.
   * - 'click'    장소를 누를 차례(allowedPlaces 한 곳만 열려 있다)
   * - 'skill'    기술을 고를 차례(allowedSkills 한 칸만 열려 있다)
   * - 'continue' 짝이 맞아 멈춰 섰다 — [계속 ▶]을 누를 때까지 정산하지 않는다
   * - 'done'     그 장이 끝났다
   */
  waiting: 'click' | 'skill' | 'continue' | 'done';
  /** 그 장 안에서의 진행도 — "3 / 10" */
  step: number;
  total: number;
}

export interface ClientGameState extends GameState {
  activePlayerNickname: string;
  /** 시연 모드일 때만 실린다. 없으면 평범한 게임이다. */
  demo?: DemoView;
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
  // 게임이 멈춰 있는지. 멈춘 동안 서버는 턴 타이머·컴퓨터 타이머를 세워두지 않고
  // (남은 시간을 그대로 보관했다가 재개할 때 이어 붙인다) 모든 조작을 거부한다.
  paused: boolean;
  // 멈춘 사람(팀) — 이 팀만 다시 시작할 수 있다. 상대가 곧바로 풀어버릴 수 있으면
  // 일시정지가 아무 의미도 없기 때문이다. 멈춰 있지 않으면 null.
  pausedBy: { team: Team; nickname: string } | null;
  // 상대의 대답을 아직 기다리는 중인가. 묻는 20초 동안에도 판은 멈춰 있으므로
  // (`paused`만으로는 "확정된 일시정지"와 구분되지 않는다) 그 둘을 이 값이 가른다 —
  // 요청한 쪽 버튼이 아직 누를 수 없는 "응답을 기다리는 중"으로 남고, 서버도 이 동안에는
  // 재개를 거부한다. 클라이언트가 스스로 기억하지 않게 상태에 실어 보내는 이유는
  // 재접속·같은 팀의 다른 사람에게도 같은 화면이 보여야 하기 때문이다.
  pausePendingAnswer: boolean;
  // 팀마다 지금까지 쓴 일시정지 횟수(settings.pauseMaxCount까지). 요청하는 순간 올라간다 —
  // 묻는 동안에도 판이 멈추므로 거절당해도 되돌리지 않는다(server/room.ts 참고).
  pauseUsed: Record<Team, number>;
  // 이 방에는 횟수·시간 제한이 없다(혼자 놀기) — 화면이 "3회 남음"이나 자동 재개 안내를
  // 그리지 않게 하는 스위치다. 서버가 같은 값으로 검사하므로 둘이 어긋날 일이 없다.
  pauseUnlimited: boolean;
  // 자동 재개까지 남은 ms(settings.pauseMaxMin 상한). 멈춰 있지 않으면 0.
  // ⚠️ 절대 시각이 아니라 남은 시간이다 — 턴 타이머와 같은 이유(클라이언트 시계가 어긋나도
  // 표시가 틀어지지 않게). 받는 쪽이 그 순간 자기 시계로 마감을 환산한다.
  pauseRemainingMs: number;
}

export type ClientGameEvent = GameEvent;
