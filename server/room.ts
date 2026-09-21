import type { WebSocket } from 'ws';
import type { Animal, Place, Seat, Team } from 'shared';
import type { ServerMessage } from 'shared';
import { processPlayerAction, processSkillChoice, processPass, processTimeout, initGame } from './engine/gameEngine';
import { eligibleAnimals, levelOf } from './engine/skills';
import type { GameEvent, GameSettings, GameState, LobbyChatMessage } from 'shared';
import {
  SHEEP_EXTRA_TIME_PER_DRAW_SEC,
  SHEEP_TIMER_EXTRA_DRAW_CAP,
  PLACES,
  randomNickname,
  randomTeamName,
  NICKNAME_MAX_LEN,
  TEAM_NAME_MAX_LEN,
  CHAT_MAX_LEN,
  CHAT_HISTORY_MAX,
  CHAT_MIN_INTERVAL_MS,
  DEFAULT_SETTINGS,
  SPECTATOR,
  PAUSE_REQUEST_TIMEOUT_SEC,
  isPlayingSeat,
  clampSettings,
} from 'shared';
import { serializeEvents, serializeState } from './serializer';

// 싱글 모드 컴퓨터 플레이어는 실제 WebSocket 연결이 없으므로 고정 ID로 취급한다.
const CPU_PLAYER_ID = 'CPU';
const CPU_NICKNAME = 'CPU 병사';
const CPU_TEAM_NAME = 'AI 군단';
// 클라이언트의 스킬 발동 연출(디자인어 팝업 2000ms 등)이 끝나기 전에 컴퓨터가 다음 수를
// 두면, 그 사이 상대 턴 배경색이 거의 안 보이고 곧바로 내 턴으로 돌아온 것처럼 보인다.
// 가장 긴 연출보다 여유 있게 최소 대기 시간을 잡아 그런 일이 최대한 드물게 한다.
const CPU_THINK_MIN_MS = 2200;
const CPU_THINK_MAX_MS = 3200;
// 행동(스킬) 선택은 위 값을 그대로 쓰면 안 된다 — 서버는 뽑기를 처리하는 즉시 pendingChoice를
// 세우지만, 화면에는 슬롯 → 카드 등장 → 페어 정산 연출이 다 끝나야 [행동 선택] 단계가 뜬다.
// 처리 시각부터 세면 그 연출이 끝나기도 전에 컴퓨터가 골라버려서, 사람 눈에는 행동 선택
// 단계를 통째로 건너뛴 것처럼 보인다. 그래서 아래 대기 시간은 "연출이 끝난 시각"(settleGraceMs)
// 부터 다시 세고, 그 위에 짧게 생각하는 척하는 시간만 얹는다.
const CPU_SKILL_THINK_MIN_MS = 1000;
const CPU_SKILL_THINK_MAX_MS = 1500;

/**
 * 닉네임 정리 — 클라이언트가 이미 12자로 자르고 빈 이름을 막지만, 서버도 같은 기준을
 * 다시 세운다(직접 만든 WS 클라이언트나 옛 버전 화면이 보낸 값이 그대로 팀 패널·채팅에
 * 박히면 레이아웃이 깨지거나 이름 없는 참가자가 생긴다). 비어 있으면 클라이언트가
 * 입력창에 보여주던 것과 같은 방식으로 무작위 이름을 지어준다.
 */
function normalizeNickname(nickname: string): string {
  return nickname.trim().slice(0, NICKNAME_MAX_LEN) || randomNickname();
}
// ─── 연출 유예(settle grace) ──────────────────────────────────────────────
// 서버는 액션을 처리하는 즉시 다음 턴 타이머를 시작하지만, 클라이언트는 그 액션의
// 연출(슬롯 → 카드 등장 → 페어 정산 → 행동 효과)이 다 끝나야 비로소 조작을 받는다.
// 그 연출 시간이 제한시간에서 그대로 깎이면 "방에서 설정한 시간보다 적은 숫자에서
// 카운트다운이 시작"되고, 연출이 길면 화면에 타이머가 뜨기도 전에 시간이 다 가버린다.
// 그래서 이번 액션의 연출 길이를 추정해 그만큼을 제한시간 위에 얹는다.
//
// 아래 값들은 client/lib/drawTiming.ts와 client/hooks/useAnimationQueue.ts의 실제
// 연출 타이밍에서 가져온 근사치다. 정확히 일치할 필요는 없고(연출이 조금 바뀌어도
// 게임 규칙은 그대로다), 모자라기보다 조금 넉넉한 쪽이 안전하다.
const SETTLE_DRAW_MS = 1430;        // SLOT_TOTAL_DUR(1350) + EMPTY_GAP(80) — 마지막 한 장
const SETTLE_ROLL_STEP_MS = 300;    // SHEEP_DRAW_STEP — 연쇄 뽑기는 0.3초 간격으로 겹쳐 재생된다
const SETTLE_ROLL_ENTER_MS = 500;   // WOOL_BALL_DUR — 예약 뽑기 롤에 진입하는 울 볼/도토리
const SETTLE_COLLECT_MS = 1080;     // SHAKE_CHECK_DUR(550) + COLLECT_FLING_DUR(450) + 80
const SETTLE_SKILL_MS = 1500;       // 행동 효과 연출(가장 긴 특허랑이 기준)
const SETTLE_FESTIVAL_MS = 700;     // 축제 시작 연출
// 연출 유예가 한 턴을 통째로 삼키지 않도록 상한을 둔다(대규모 연쇄 뽑기 대비).
const SETTLE_GRACE_MAX_MS = 15000;

/** 방금 브로드캐스트한 이벤트들의 클라이언트 연출이 끝나기까지 걸리는 시간(ms) 추정치. */
function settleGraceMs(events: GameEvent[]): number {
  let draws = 0;
  let rolls = 0;
  let collects = 0;
  let skills = 0;
  let festivals = 0;

  for (const ev of events) {
    if (ev.type === 'draw') draws++;
    else if (ev.type === 'bonusDraws' || ev.type === 'festivalDraws') rolls++;
    else if (ev.type === 'collect') collects++;
    else if (ev.type === 'skillApplied') skills++;
    else if (ev.type === 'festival') festivals++;
  }

  const ms =
    (draws > 0 ? SETTLE_DRAW_MS + (draws - 1) * SETTLE_ROLL_STEP_MS : 0) +
    rolls * SETTLE_ROLL_ENTER_MS +
    collects * SETTLE_COLLECT_MS +
    skills * SETTLE_SKILL_MS +
    festivals * SETTLE_FESTIVAL_MS;

  return Math.min(ms, SETTLE_GRACE_MAX_MS);
}

// 연출 길이 추정이 조금 모자라도 서버 타임아웃이 클라이언트보다 먼저 터지지 않도록 하는
// 여유분. 유예 구간은 화면에 드러나지 않으므로(게이지는 turnTotalMs 기준으로 가득 찬
// 상태를 유지한다) 이 값을 늘려도 표시되는 숫자는 변하지 않는다.
const SETTLE_GRACE_MARGIN_MS = 600;

/**
 * 싱글 모드 컴퓨터의 행동 선택 — 기본은 무작위지만, 지금 당장 이길 수 있는 수(상표토끼로
 * 체력이 WIN_HP에 닿거나 특허랑이로 상대를 0으로 만드는 경우)가 있으면 그걸 최우선으로
 * 고른다. 그 외에는 완전히 무작위라 사람 상대처럼 실수도 한다.
 */
function pickComputerSkill(state: GameState, team: Team): Animal | null {
  const options = eligibleAnimals(state, team);
  if (options.length === 0) return null;

  const opponent: Team = team === 'A' ? 'B' : 'A';
  const me = state.teams[team];
  const foe = state.teams[opponent];
  const winHp = state.settings.targetScore * 2;

  for (const animal of options) {
    if (animal === 'sheep' || animal === 'mermaid') continue;
    const amount = levelOf(state, team, animal) * me.pendingMultiplier;
    if (animal === 'rabbit' && me.hp + amount >= winHp) return animal;
    if (animal === 'tiger' && amount >= foe.hp) return animal;
  }

  return options[Math.floor(Math.random() * options.length)];
}

interface PlayerConnection {
  ws: WebSocket;
  playerId: string;
  // 방 안에서만 통하는 공개 식별자 — 방장 명령(이동/추방/위임)의 대상 지정에 쓴다.
  // playerId를 그대로 노출하면 그 값만으로 reconnect가 통과해(handleReconnect 참고)
  // 남의 세션을 가로챌 수 있으므로, 로비 목록에는 이 값만 싣는다.
  memberId: string;
  nickname: string;
  // 이 사람이 앉은 자리 — 두 팀 중 하나이거나 관전석('spectator')이다.
  team: Seat;
  // 관전자는 준비할 것이 없으므로 언제나 true로 유지한다(관전자 한 명 때문에
  // 방장이 시작 버튼을 못 누르는 일이 없도록).
  ready: boolean;
  connected: boolean;
  // 마지막으로 채팅을 보낸 시각 — 과속 전송을 걸러내는 데만 쓴다.
  lastChatAt: number;
}

export class Room {
  private players = new Map<string, PlayerConnection>();  // playerId → PlayerConnection
  // 자리별 playerId 목록. A/B는 그대로 게임의 팀 순번(activePlayerIndex)이 되고,
  // spectator 칸은 게임에 전혀 쓰이지 않는다(직렬화할 때도 A/B만 넘긴다).
  private teamPlayerIds: Record<Seat, string[]> = { A: [], B: [], [SPECTATOR]: [] };
  private teamNames: Record<Team, string | null> = { A: null, B: null };
  // 방장 = 방을 처음 만든 사람. 로비에서 이 사람이 나가면 남아 있는 다음 사람에게 넘어간다.
  private hostPlayerId: string | null = null;
  private memberIdSeq = 0;
  // 대기실 채팅 기록(링 버퍼) — 나중에 들어오거나 재접속한 사람에게 그대로 넘겨준다.
  private chatLog: LobbyChatMessage[] = [];
  private chatSeq = 0;
  // 방장(방을 만든 쪽)이 정한 게임 규칙 — 로비에서는 방장이 계속 바꿀 수 있고, 게임이
  // 시작되면(state !== null) 불변이다.
  private settings: GameSettings = DEFAULT_SETTINGS;
  private state: GameState | null = null;
  private turnDeadline = 0;
  // 타이머 게이지 100%에 해당하는 시간 — turnDeadline까지 남은 시간에서 연출 유예를
  // 뺀 "이번 턴에 실제로 주어진 생각할 시간"이다(ClientGameState.turnTotalMs 참고).
  private turnTotalMs = 0;
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  private vsComputer = false;
  private computerTimer: ReturnType<typeof setTimeout> | null = null;
  // 컴퓨터 타이머가 터질 예정인 시각 — 일시정지할 때 "얼마나 남았는지"를 재려면
  // 핸들만으로는 알 수 없어 따로 기억해둔다.
  private computerDeadline = 0;

  // ─── 일시정지 ────────────────────────────────────────────────────────────
  // 멈춰 있는 동안 서버에는 **타이머가 하나도 걸려 있지 않다.** 남은 시간을 아래 두
  // 값에 보관했다가 재개할 때 그대로 이어 붙인다 — 데드라인을 그대로 둔 채 타이머만
  // 멈추면, 재개 순간 이미 지난 시각이 되어 턴이 곧바로 시간초과로 날아간다.
  private paused = false;
  private pausedBy: { playerId: string; team: Team; nickname: string } | null = null;
  private pausedTurnRemainingMs = 0;
  // 게이지 100%에 해당하는 시간도 함께 보관한다 — clearTimer가 turnTotalMs까지 0으로
  // 되돌리기 때문이다(게임이 끝난 방의 스냅샷에 유령 카운트다운이 실리지 않게 하려고).
  // 이 값을 챙기지 않으면 멈춘 동안의 게이지 폭이 0이 되고, 재개한 뒤에도 0으로 남아
  // 남은 시간이 1초에 고정된 채 얼어붙는다(TurnTimer가 maxSeconds로 잘라 표시한다).
  private pausedTurnTotalMs = 0;
  private pausedCpuRemainingMs: number | null = null;
  // 상대의 대답을 기다리는 중인 일시정지 요청(멀티 플레이 전용).
  private pauseRequest: { playerId: string; team: Team; nickname: string } | null = null;
  private pauseRequestTimer: ReturnType<typeof setTimeout> | null = null;
  // 팀마다 쓴 일시정지 횟수(settings.pauseMaxCount까지). **요청하는 순간** 하나 깎는다 —
  // 상대가 고르는 20초 동안에도 판은 이미 멈춰 있으므로, 수락 여부와 무관하게 그 요청
  // 자체가 판을 멈춘 것이다. 깎지 않으면 거절당할 때마다 다시 요청해 판을 계속 얼릴 수 있다.
  private pauseUsed: Record<Team, number> = { A: 0, B: 0 };
  // 한 번의 일시정지가 settings.pauseMaxMin을 넘기면 서버가 대신 풀어준다 — 멈춘 팀이
  // 자리를 뜨면 상대가 영영 기다리게 되기 때문이다. 남은 시간은 화면 카운트다운에도 쓴다.
  private pauseAutoResumeTimer: ReturnType<typeof setTimeout> | null = null;
  private pauseAutoResumeDeadline = 0;

  constructor(
    readonly roomId: string,
    private onEmpty: () => void,
  ) {}

  // ─── 로비 ────────────────────────────────────────────────────────────────

  /** 이 방의 방장인지. */
  isHost(playerId: string): boolean {
    return this.hostPlayerId !== null && this.hostPlayerId === playerId;
  }

  /** 로비 목록에 실리는 공개 식별자 — 없는 플레이어면 null. */
  memberIdOf(playerId: string): string | null {
    return this.players.get(playerId)?.memberId ?? null;
  }

  /** 공개 식별자로 플레이어를 찾는다(방장 명령의 대상 조회). */
  private findByMemberId(memberId: string): PlayerConnection | undefined {
    for (const p of this.players.values()) {
      if (p.memberId === memberId) return p;
    }
    return undefined;
  }

  /** 게임이 이미 시작됐는지 — 로비 전용 명령은 모두 이걸로 먼저 막는다. */
  private get started(): boolean {
    return this.state !== null;
  }

  /**
   * 방장 전용 명령의 공통 관문. 통과하지 못하면 요청자에게 에러를 보내고 false를 준다.
   * 로비 상태가 아닐 때(게임 시작 후)도 함께 막는다.
   */
  private requireHost(playerId: string): boolean {
    if (this.started) {
      this.sendTo(playerId, { type: 'error', code: 'GAME_ALREADY_STARTED', message: '이미 게임이 시작되어 대기실 설정을 바꿀 수 없습니다.' });
      return false;
    }
    if (!this.isHost(playerId)) {
      this.sendTo(playerId, { type: 'error', code: 'NOT_HOST', message: '방장만 할 수 있는 동작입니다.' });
      return false;
    }
    return true;
  }

  // ─── 대기실 채팅 ─────────────────────────────────────────────────────────

  /** 채팅 한 줄을 기록에 남기고 방 전체에 중계한다. */
  private pushChat(msg: Omit<LobbyChatMessage, 'id'>): void {
    this.chatSeq += 1;
    const message: LobbyChatMessage = { ...msg, id: this.chatSeq };
    this.chatLog.push(message);
    if (this.chatLog.length > CHAT_HISTORY_MAX) this.chatLog.shift();
    this.broadcast({ type: 'chatMessage', message });
  }

  /** 방에서 일어난 일(입장·퇴장·팀 변경 등)을 채팅창에 안내줄로 남긴다. */
  private pushSystem(text: string): void {
    this.pushChat({ kind: 'system', memberId: null, nickname: '', team: null, wasHost: false, text });
  }

  /** 지금까지의 대화 기록을 한 사람에게만 보낸다(입장·재접속 직후). */
  private sendChatHistory(playerId: string): void {
    this.sendTo(playerId, { type: 'chatHistory', messages: this.chatLog });
  }

  /** 자리 이름을 화면 표기용으로 — 팀 이름이 아직 없으면 "팀 1"/"팀 2", 관전석은 "관전석". */
  private teamLabel(seat: Seat): string {
    if (!isPlayingSeat(seat)) return '관전석';
    return this.teamNames[seat] ?? (seat === 'A' ? '팀 1' : '팀 2');
  }

  /**
   * 대기실 채팅 전송. 거절 사유는 모두 조용히 버린다 — 실사용자는 클라이언트 쪽 억제에
   * 먼저 걸려 여기까지 오지 않으므로, 빨간 에러 배너를 띄우면 소음만 된다.
   */
  handleChat(playerId: string, text: string): void {
    if (this.started) return;
    const p = this.players.get(playerId);
    if (!p) return;

    const trimmed = text.trim();
    if (!trimmed) return;

    const now = Date.now();
    if (now - p.lastChatAt < CHAT_MIN_INTERVAL_MS) return;
    p.lastChatAt = now;

    this.pushChat({
      kind: 'chat',
      memberId: p.memberId,
      nickname: p.nickname,
      team: p.team,
      // 보낸 그 순간의 방장 여부를 박아둔다 — 나중에 방장이 바뀌어도 지난 대화의
      // 왕관은 말했던 사람에게 그대로 남는다.
      wasHost: this.isHost(playerId),
      text: trimmed.slice(0, CHAT_MAX_LEN),
    });
  }

  /** 팀 이름을 확정한다. 이미 정해져 있으면 무시하고, 요청한 이름이 상대 팀과 겹치면 무작위로 대체한다. */
  private assignTeamName(team: Team, requested?: string): void {
    if (this.teamNames[team]) return;
    const other = this.teamNames[team === 'A' ? 'B' : 'A'];
    const trimmed = requested?.trim().slice(0, TEAM_NAME_MAX_LEN);
    if (trimmed && trimmed !== other) {
      this.teamNames[team] = trimmed;
      return;
    }
    this.teamNames[team] = randomTeamName(other);
  }

  addPlayer(
    ws: WebSocket,
    playerId: string,
    nickname: string,
    team: Seat,
    teamName?: string,
    settings?: Partial<GameSettings>,
    // 방을 처음 만드는 사람만 넘겨준다 — 아직 아무도 들어오지 않은 반대편 팀의 이름.
    otherTeamName?: string,
  ): 'ok' | 'game_started' | 'nickname_taken' {
    if (this.state !== null) return 'game_started';

    nickname = normalizeNickname(nickname);
    for (const p of this.players.values()) {
      if (p.nickname === nickname) return 'nickname_taken';
    }

    // 방을 처음 만드는 쪽(=이 방에 아직 아무도 없을 때)만 규칙을 정할 수 있다.
    const isRoomCreator = this.players.size === 0;
    if (isRoomCreator && settings) {
      this.settings = clampSettings(settings);
    }

    // 방장은 따로 "준비"를 누르지 않는다 — 준비 버튼 대신 "게임 시작" 버튼을 쥔다.
    // 관전자도 준비할 것이 없으므로 처음부터 준비 완료로 둔다.
    this.players.set(playerId, {
      ws, playerId, memberId: this.nextMemberId(), nickname, team,
      ready: isRoomCreator || !isPlayingSeat(team), connected: true, lastChatAt: 0,
    });
    if (isRoomCreator) this.hostPlayerId = playerId;
    // 이전 대화를 먼저 넘겨준 뒤에 입장 안내를 방송한다 — 순서가 뒤바뀌면 새로 들어온
    // 사람이 자기 입장 메시지를 chatMessage로 한 번, chatHistory로 또 한 번 받게 된다.
    this.sendChatHistory(playerId);
    this.pushSystem(
      isPlayingSeat(team) ? `${nickname} 님이 들어왔어요` : `${nickname} 님이 관전자로 들어왔어요`,
    );
    this.teamPlayerIds[team].push(playerId);
    // 방을 만드는 순간 양 팀 이름을 모두 확정한다 — 방장이 상대 팀 이름을 비워뒀더라도
    // 무작위로 채운다. 예전에는 "그 팀에 실제로 참가하는 사람이 직접 고를 기회"를 남기려고
    // 비워뒀지만, 참가 화면에는 팀 이름 입력칸이 아예 없어서 그 기회는 쓰이지 못하고
    // 대기실에 "팀 2 (미정)"만 덩그러니 남았다.
    if (isRoomCreator) {
      // 방장이 관전석을 골랐다면 자기 팀이 없으므로 teamName/otherTeamName이 곧
      // 팀 1(A)·팀 2(B)의 이름이다. 먼저 부른 쪽이 이름 우선권을 가지므로(겹치면
      // 나중 쪽이 무작위로 대체된다) 방장 자신의 팀부터 확정한다.
      const own: Team = isPlayingSeat(team) ? team : 'A';
      this.assignTeamName(own, teamName);
      this.assignTeamName(own === 'A' ? 'B' : 'A', otherTeamName);
    } else if (isPlayingSeat(team)) {
      this.assignTeamName(team, teamName);
    }
    this.broadcastLobbyState();
    return 'ok';
  }

  private nextMemberId(): string {
    this.memberIdSeq += 1;
    return `m${this.memberIdSeq}`;
  }

  /**
   * 싱글 모드 — 사람은 A팀에 앉히고 B팀은 컴퓨터(랜덤 클릭)로 채운다.
   *
   * ⚠️ **여기서 게임을 시작하지 않는다.** 시작은 부르는 쪽이 startSoloGame()으로
   * 따로 한다 — 그래야 그 사이에 roomCreated(내 방 코드와 playerId)를 먼저 보낼 수
   * 있다. 예전에는 이 함수가 곧바로 시작해 gameStart가 roomCreated보다 **먼저**
   * 도착했는데, 그러면 "방에 새로 들어왔으니 옛 게임 상태를 비운다"는 클라이언트
   * 규칙이 방금 받은 새 게임을 지워버려 혼자 놀기가 로비에서 한 발짝도 못 나간다.
   */
  addSoloPlayer(ws: WebSocket, playerId: string, nickname: string, teamName?: string, settings?: Partial<GameSettings>): void {
    this.vsComputer = true;
    if (settings) this.settings = clampSettings(settings);
    this.players.set(playerId, {
      ws, playerId, memberId: this.nextMemberId(), nickname: normalizeNickname(nickname), team: 'A',
      ready: true, connected: true, lastChatAt: 0,
    });
    this.hostPlayerId = playerId;
    this.teamPlayerIds.A.push(playerId);
    this.teamPlayerIds.B.push(CPU_PLAYER_ID);
    this.assignTeamName('A', teamName);
    this.teamNames.B = CPU_TEAM_NAME;
  }

  /** 싱글 모드 시작 — addSoloPlayer로 자리를 만들고 roomCreated를 보낸 뒤에 부른다. */
  startSoloGame(): void {
    this.tryStartGame();
  }

  setReady(playerId: string, ready = true): void {
    const p = this.players.get(playerId);
    if (!p || this.started) return;
    // 방장은 준비 상태를 내릴 수 없다(시작 버튼을 쥔 쪽이라 준비 개념 자체가 없다).
    if (this.isHost(playerId)) return;
    // 관전자도 마찬가지 — 준비를 내릴 수 있으면 게임에 나서지도 않는 사람이 시작을 막는다.
    if (!isPlayingSeat(p.team)) return;
    p.ready = ready;
    this.broadcastLobbyState();
  }

  // ─── 방장 명령 ───────────────────────────────────────────────────────────

  /**
   * 참가자를 다른 자리(팀 1/팀 2/관전석)로 옮긴다. 방장은 누구든, 그 외에는 자기
   * 자신만 옮길 수 있다.
   */
  movePlayer(playerId: string, targetMemberId: string, team: Seat): void {
    if (this.started) {
      this.sendTo(playerId, { type: 'error', code: 'GAME_ALREADY_STARTED', message: '이미 게임이 시작되어 자리를 바꿀 수 없습니다.' });
      return;
    }
    const target = this.findByMemberId(targetMemberId);
    if (!target) {
      this.sendTo(playerId, { type: 'error', code: 'PLAYER_NOT_FOUND', message: '대상 참가자를 찾을 수 없습니다.' });
      return;
    }
    if (target.playerId !== playerId && !this.isHost(playerId)) {
      this.sendTo(playerId, { type: 'error', code: 'NOT_HOST', message: '다른 참가자의 자리는 방장만 바꿀 수 있습니다.' });
      return;
    }
    if (target.team === team) return;

    const prevSeat = target.team;
    const from = this.teamPlayerIds[prevSeat];
    const idx = from.indexOf(target.playerId);
    if (idx !== -1) from.splice(idx, 1);
    target.team = team;
    this.teamPlayerIds[team].push(target.playerId);
    // 관전석에 앉으면 준비할 것이 없으므로 준비 완료, 관전석에서 팀으로 나오면 이제부터
    // 실제로 뛰는 사람이므로 다시 준비를 눌러야 한다. 팀↔팀 이동은 예전 그대로 준비
    // 상태를 건드리지 않고, 방장은 애초에 준비 개념이 없어 어느 경우든 제외한다.
    if (!this.isHost(target.playerId) && isPlayingSeat(prevSeat) !== isPlayingSeat(team)) {
      target.ready = !isPlayingSeat(team);
    }
    // 팀 이름은 방을 만드는 순간 양쪽 다 정해지므로(addPlayer) 여기서 손댈 것이 없다.
    const where = isPlayingSeat(team) ? `${this.teamLabel(team)} 팀으로` : '관전석으로';
    this.pushSystem(
      target.playerId === playerId
        ? `${target.nickname} 님이 ${where} 옮겼어요`
        : `방장이 ${target.nickname} 님을 ${where} 옮겼어요`,
    );
    this.broadcastLobbyState();
  }

  /** 참가자를 방에서 내보낸다. 대상에게는 kicked를 보내 클라이언트가 홈으로 돌아가게 한다. */
  kickPlayer(playerId: string, targetMemberId: string): void {
    if (!this.requireHost(playerId)) return;
    const target = this.findByMemberId(targetMemberId);
    if (!target) {
      this.sendTo(playerId, { type: 'error', code: 'PLAYER_NOT_FOUND', message: '대상 참가자를 찾을 수 없습니다.' });
      return;
    }
    if (target.playerId === playerId) return; // 방장은 자기 자신을 추방할 수 없다

    this.sendTo(target.playerId, { type: 'kicked', message: '방장이 당신을 방에서 내보냈습니다.' });
    this.removePlayer(target.playerId, 'kicked');
  }

  /** 방장 자리를 다른 참가자에게 넘긴다. 넘긴 사람은 일반 참가자(준비 완료 상태)가 된다. */
  transferHost(playerId: string, targetMemberId: string): void {
    if (!this.requireHost(playerId)) return;
    const target = this.findByMemberId(targetMemberId);
    if (!target) {
      this.sendTo(playerId, { type: 'error', code: 'PLAYER_NOT_FOUND', message: '대상 참가자를 찾을 수 없습니다.' });
      return;
    }
    if (target.playerId === playerId) return;

    const prev = this.players.get(playerId);
    if (prev) prev.ready = true; // 방장에서 내려온 사람은 이미 참가 의사를 밝힌 상태로 둔다
    this.hostPlayerId = target.playerId;
    target.ready = true;
    this.pushSystem(`이제 ${target.nickname} 님이 방장이에요`);
    this.broadcastLobbyState();
  }

  /** 팀 이름 변경 — 무작위로 배정됐던 이름도 게임 시작 전이면 방장이 다시 지을 수 있다. */
  setTeamName(playerId: string, team: Team, name: string): void {
    if (!this.requireHost(playerId)) return;
    const other = this.teamNames[team === 'A' ? 'B' : 'A'];
    const trimmed = name.trim().slice(0, TEAM_NAME_MAX_LEN);
    if (!trimmed) {
      // 빈 이름은 "다시 무작위로"로 취급한다 — 이름 없는 팀을 남기지 않는다.
      const next = randomTeamName(other);
      this.pushSystem(`${this.teamLabel(team)} 팀 이름이 "${next}"(으)로 다시 정해졌어요`);
      this.teamNames[team] = next;
      this.broadcastLobbyState();
      return;
    }
    if (trimmed === other) {
      this.sendTo(playerId, { type: 'error', code: 'TEAM_NAME_TAKEN', message: '상대 팀과 같은 이름은 쓸 수 없습니다.' });
      return;
    }
    // 안내문에는 바뀌기 "전" 이름을 써야 어느 팀 얘기인지 알아볼 수 있다.
    this.pushSystem(`${this.teamLabel(team)} 팀 이름이 "${trimmed}"(으)로 바뀌었어요`);
    this.teamNames[team] = trimmed;
    this.broadcastLobbyState();
  }

  /** 게임 규칙 변경 — 로비에서만 가능하고, 게임이 시작되면 state.settings로 굳는다. */
  updateSettings(playerId: string, settings: Partial<GameSettings>): void {
    if (!this.requireHost(playerId)) return;
    this.settings = clampSettings({ ...this.settings, ...settings });
    this.pushSystem('방장이 게임 규칙을 바꿨어요');
    this.broadcastLobbyState();
  }

  /** 방장이 누르는 시작 버튼. 조건을 못 채우면 이유를 방장에게만 알려준다. */
  startGame(playerId: string): void {
    if (!this.requireHost(playerId)) return;
    const blocked = this.startBlockReason();
    if (blocked) {
      this.sendTo(playerId, { type: 'error', code: 'CANNOT_START', message: blocked });
      return;
    }
    this.tryStartGame();
  }

  /** 지금 게임을 시작할 수 없는 이유(없으면 null). */
  private startBlockReason(): string | null {
    const all = [...this.players.values()];
    // 인원수는 관전자를 빼고 센다 — 양 팀에 한 명씩만 있으면 그것으로 충분하고,
    // 관전자만 잔뜩 있어도 게임은 시작될 수 없다(아래 조건이 그대로 걸러낸다).
    if (this.teamPlayerIds.A.length === 0 || this.teamPlayerIds.B.length === 0) {
      return '양 팀에 각각 한 명 이상 있어야 합니다(관전자는 인원에 들어가지 않아요).';
    }
    if (!all.every(p => p.ready)) return '아직 준비하지 않은 참가자가 있습니다.';
    // setTeamName이 겹치는 이름을 이미 막지만, 게임에 들어가고 나면 두 팀을 구분할 방법이
    // 이름밖에 없으므로 시작 직전에 한 번 더 확인한다.
    if (this.teamNames.A !== null && this.teamNames.A === this.teamNames.B) {
      return '양 팀의 이름이 같아 시작할 수 없습니다. 한쪽 이름을 바꿔주세요.';
    }
    return null;
  }

  /**
   * 로비에서 플레이어를 완전히 제거하고(팀 목록 포함) 필요하면 방장을 넘긴다.
   * reason은 채팅창 안내 문구만 가른다 — 'left'는 자진 퇴장·연결 끊김, 'kicked'는 추방.
   */
  private removePlayer(playerId: string, reason: 'left' | 'kicked'): void {
    const p = this.players.get(playerId);
    if (!p) return;
    this.players.delete(playerId);
    const idx = this.teamPlayerIds[p.team].indexOf(playerId);
    if (idx !== -1) this.teamPlayerIds[p.team].splice(idx, 1);

    this.pushSystem(
      reason === 'kicked'
        ? `방장이 ${p.nickname} 님을 내보냈어요`
        : `${p.nickname} 님이 나갔어요`,
    );

    if (this.hostPlayerId === playerId) {
      // 방장이 빠지면 남아 있는 사람 중 가장 먼저 들어온 사람이 이어받는다 — 안 그러면
      // 아무도 시작 버튼을 누를 수 없어 방이 통째로 멈춘다.
      const next = this.players.values().next().value as PlayerConnection | undefined;
      this.hostPlayerId = next?.playerId ?? null;
      if (next) {
        next.ready = true;
        this.pushSystem(`방장이 나가서 ${next.nickname} 님이 방장이 되었어요`);
      }
    }

    if (this.players.size === 0) {
      this.onEmpty();
      return;
    }
    this.broadcastLobbyState();
  }

  /**
   * 대기실에서 스스로 나가기 — 연결은 유지한 채 방에서만 빠진다.
   * 실제로 나갔을 때만 true. 게임이 이미 시작됐다면 나가지 않는다(false) — 호출한 쪽이
   * 이 값을 보고 연결의 방 정보를 지우므로, 여기서 거짓말을 하면 게임 중인 플레이어의
   * 조작이 통째로 먹통이 된다.
   */
  leaveRoom(playerId: string): boolean {
    if (this.started) return false;
    if (!this.players.has(playerId)) return false;
    this.sendTo(playerId, { type: 'leftRoom' });
    this.removePlayer(playerId, 'left');
    return true;
  }

  private tryStartGame(): void {
    const all = [...this.players.values()];
    if (!all.every(p => p.ready)) return;
    // 양 팀이 한 명씩만 차 있으면 시작할 수 있다 — 관전자 수는 여기에 영향을 주지 않는다.
    if (this.teamPlayerIds.A.length === 0 || this.teamPlayerIds.B.length === 0) return;

    const nickA = this.teamPlayerIds.A.map(id => this.players.get(id)?.nickname ?? CPU_NICKNAME);
    const nickB = this.teamPlayerIds.B.map(id => this.players.get(id)?.nickname ?? CPU_NICKNAME);
    this.state = initGame(nickA, nickB, Math.random, this.settings);
    this.assignTeamName('A');
    this.assignTeamName('B');

    this.resetTimer();
    const clientState = this.snapshot();
    this.broadcast({ type: 'gameStart', state: clientState });
    this.scheduleComputerActionIfNeeded();
  }

  /**
   * 지금 방 상태를 클라이언트용으로 직렬화한다. 이 방의 **모든** 상태 전송(gameStart ·
   * gameSnapshot · actionResult · pauseState)이 이 한 곳을 지나므로, 일시정지처럼
   * 엔진 밖에 있는 상태를 새로 실어야 할 때 빠뜨릴 자리가 없다.
   *
   * ⚠️ 멈춰 있을 때는 turnDeadline이 아니라 **보관해둔 남은 시간**으로 데드라인을 다시
   * 만든다 — 멈추는 순간 turnDeadline은 이미 쓸모없는 과거 시각이고, 그대로 보내면
   * 화면의 게이지가 0에 붙은 채 얼어붙는다(재개하면 제 시간이 돌아오는데도).
   */
  private snapshot() {
    if (!this.state) throw new Error('게임이 시작되지 않은 방에서 snapshot을 만들 수 없습니다.');
    const deadline = this.paused
      ? (this.pausedTurnRemainingMs > 0 ? Date.now() + this.pausedTurnRemainingMs : 0)
      : this.turnDeadline;
    const totalMs = this.paused ? this.pausedTurnTotalMs : this.turnTotalMs;
    return serializeState(this.state, deadline, totalMs, this.finalTeamNames(), this.teamPlayerIds, {
      paused: this.paused,
      pausedBy: this.pausedBy ? { team: this.pausedBy.team, nickname: this.pausedBy.nickname } : null,
      pendingAnswer: this.pauseRequest !== null,
      used: { ...this.pauseUsed },
      unlimited: this.vsComputer,
      // 절대 시각이 아니라 **남은 ms**를 보낸다 — 턴 타이머와 같은 이유다(CLAUDE.md의
      // "턴 타이머를 화면에 그리는 규칙 3가지" 참고). 멈춰 있지 않으면 0.
      remainingMs: this.paused ? Math.max(0, this.pauseAutoResumeDeadline - Date.now()) : 0,
    });
  }

  private finalTeamNames(): Record<Team, string> {
    return {
      A: this.teamNames.A ?? 'A팀',
      B: this.teamNames.B ?? 'B팀',
    };
  }

  // ─── 게임 진행 ───────────────────────────────────────────────────────────

  /** 지금 결정을 내려야 하는 팀의 "대표 플레이어"(현재 activePlayerIndex)의 id. */
  private expectedPlayerId(team: Team): string | undefined {
    if (!this.state) return undefined;
    return this.teamPlayerIds[team][this.state.activePlayerIndex];
  }

  /**
   * 관전자의 게임 조작은 애초에 성립하지 않는다. 아래 expectedPlayerId 비교만으로도
   * (관전자의 playerId는 A/B 어느 목록에도 없으므로) 걸러지지만, 그러면 "지금은 당신의
   * 차례가 아닙니다"라는 엉뚱한 안내가 나가므로 이유를 정확히 알려준다.
   */
  private rejectIfSpectator(playerId: string): boolean {
    const p = this.players.get(playerId);
    if (!p || isPlayingSeat(p.team)) return false;
    this.sendTo(playerId, { type: 'error', code: 'NOT_YOUR_TURN', message: '관전자는 게임에 참여할 수 없습니다.' });
    return true;
  }

  /**
   * 멈춰 있는 동안의 조작은 전부 거부한다. 화면이 이미 덮여 있어 실제로는 누를 수
   * 없지만, 멈추기 직전에 떠난 클릭이 늦게 도착하거나 직접 만든 클라이언트가 보내는
   * 경우가 있다 — 그걸 받아주면 멈춘 채로 판이 흘러가 버린다.
   */
  private rejectIfPaused(playerId: string): boolean {
    if (!this.paused) return false;
    this.sendTo(playerId, { type: 'error', code: 'PAUSE_UNAVAILABLE', message: '게임이 일시정지 중입니다.' });
    return true;
  }

  handleDrawCard(playerId: string, place: Place): void {
    if (this.rejectIfSpectator(playerId)) return;
    if (this.rejectIfPaused(playerId)) return;
    if (!this.state || this.state.phase !== 'playing') {
      this.sendTo(playerId, { type: 'error', code: 'GAME_NOT_STARTED', message: '게임이 시작되지 않았습니다.' });
      return;
    }
    if (this.state.pendingChoice !== null) {
      this.sendTo(playerId, { type: 'error', code: 'NO_PENDING_CHOICE', message: '지금은 스킬을 선택할 차례입니다.' });
      return;
    }

    const expectedId = this.expectedPlayerId(this.state.activeTeam);
    if (playerId !== expectedId) {
      this.sendTo(playerId, { type: 'error', code: 'NOT_YOUR_TURN', message: '지금은 당신의 차례가 아닙니다.' });
      return;
    }

    const { state, events } = processPlayerAction(this.state, place);
    this.state = state;
    if (this.state.phase === 'ended') this.clearTimer();
    else this.resetTimer(events);
    this.broadcastResult(events);

    if (this.state.phase === 'playing') this.scheduleComputerActionIfNeeded(events);
  }

  handleChooseSkill(playerId: string, animal: Animal): void {
    if (this.rejectIfSpectator(playerId)) return;
    if (this.rejectIfPaused(playerId)) return;
    if (!this.state || this.state.phase !== 'playing' || this.state.pendingChoice === null) {
      this.sendTo(playerId, { type: 'error', code: 'NO_PENDING_CHOICE', message: '지금은 스킬을 선택할 차례가 아닙니다.' });
      return;
    }

    const expectedId = this.expectedPlayerId(this.state.pendingChoice);
    if (playerId !== expectedId) {
      this.sendTo(playerId, { type: 'error', code: 'NOT_YOUR_TURN', message: '지금은 당신의 차례가 아닙니다.' });
      return;
    }

    const { state, events } = processSkillChoice(this.state, animal);
    this.state = state;
    if (this.state.phase === 'ended') this.clearTimer();
    else this.resetTimer(events);
    this.broadcastResult(events);

    if (this.state.phase === 'playing') this.scheduleComputerActionIfNeeded(events);
  }

  handlePassSkill(playerId: string): void {
    if (this.rejectIfSpectator(playerId)) return;
    if (this.rejectIfPaused(playerId)) return;
    if (!this.state || this.state.phase !== 'playing' || this.state.pendingChoice === null) {
      this.sendTo(playerId, { type: 'error', code: 'NO_PENDING_CHOICE', message: '지금은 스킬을 선택할 차례가 아닙니다.' });
      return;
    }

    const expectedId = this.expectedPlayerId(this.state.pendingChoice);
    if (playerId !== expectedId) {
      this.sendTo(playerId, { type: 'error', code: 'NOT_YOUR_TURN', message: '지금은 당신의 차례가 아닙니다.' });
      return;
    }

    const { state, events } = processPass(this.state);
    this.state = state;
    if (this.state.phase === 'ended') this.clearTimer();
    else this.resetTimer(events);
    this.broadcastResult(events);

    if (this.state.phase === 'playing') this.scheduleComputerActionIfNeeded(events);
  }

  /**
   * 싱글 모드 — 컴퓨터(B팀) 차례(장소 클릭 또는 스킬 선택)가 되면 잠시 "생각하는" 척한 뒤
   * 무작위로 진행한다. lastActionEvents는 방금 브로드캐스트한 액션의 이벤트로, 행동 선택
   * 차례일 때 그 연출이 화면에서 끝날 때까지 기다리는 데 쓴다(CPU_SKILL_THINK_* 참고).
   */
  private scheduleComputerActionIfNeeded(lastActionEvents?: GameEvent[]): void {
    if (this.paused) return;
    if (!this.vsComputer || !this.state || this.state.phase !== 'playing') return;
    const waitingTeam = this.state.pendingChoice ?? this.state.activeTeam;
    if (waitingTeam !== 'B') return;
    if (this.computerTimer !== null) return;

    // 행동 선택은 자기가 방금 뽑은 카드의 연출이 끝난 뒤부터 시간을 센다. 장소 선택은
    // 직전 액션이 이미 상대 턴에 끝나 있으므로 기존대로 처리 시각부터 그대로 센다.
    const isSkillChoice = this.state.pendingChoice === 'B';
    const [minMs, maxMs] = isSkillChoice
      ? [CPU_SKILL_THINK_MIN_MS, CPU_SKILL_THINK_MAX_MS]
      : [CPU_THINK_MIN_MS, CPU_THINK_MAX_MS];
    const graceMs = isSkillChoice && lastActionEvents ? settleGraceMs(lastActionEvents) : 0;

    const delay = graceMs + minMs + Math.floor(Math.random() * (maxMs - minMs));
    this.startComputerTimer(delay);
  }

  /** 컴퓨터가 다음 수를 두기까지의 대기 타이머 — 일시정지 재개에서도 같은 길을 쓴다. */
  private startComputerTimer(delayMs: number): void {
    this.computerDeadline = Date.now() + delayMs;
    this.computerTimer = setTimeout(() => {
      this.computerTimer = null;
      this.performComputerAction();
    }, delayMs);
  }

  private performComputerAction(): void {
    if (!this.state || this.state.phase !== 'playing') return;

    let result: { state: GameState; events: ReturnType<typeof processPlayerAction>['events'] };
    if (this.state.pendingChoice === 'B') {
      const animal = pickComputerSkill(this.state, 'B');
      result = animal === null ? processPass(this.state) : processSkillChoice(this.state, animal);
    } else if (this.state.activeTeam === 'B' && this.state.pendingChoice === null) {
      // 컴퓨터도 "직전 장소 금지" 규칙을 지켜야 한다 — 안 그러면 거부당한 뒤 다시
      // 무작위로 고르느라 한 텀을 허비한다(화면엔 아무 변화 없이 몇 초가 그냥 지나감).
      const options = PLACES.filter(p => p !== this.state!.lastPlace);
      const place = options[Math.floor(Math.random() * options.length)];
      result = processPlayerAction(this.state, place);
    } else {
      return;
    }

    this.state = result.state;
    if (this.state.phase === 'ended') this.clearTimer();
    else this.resetTimer(result.events);
    this.broadcastResult(result.events);

    if (this.state.phase === 'playing') this.scheduleComputerActionIfNeeded(result.events);
  }

  handleTimeout(): void {
    if (!this.state || this.state.phase !== 'playing') return;

    const { state, events } = processTimeout(this.state);
    this.state = state;

    const firstEv = events.find(e => e.type === 'draw');
    const timeoutPlace = firstEv?.type === 'draw' ? firstEv.place : null;

    const clientEvents = serializeEvents(events);
    if (timeoutPlace) {
      clientEvents.unshift({ type: 'timeout', place: timeoutPlace });
    }

    if (this.state.phase === 'playing') {
      this.resetTimer(events);
    } else {
      this.clearTimer();
    }

    const clientState = this.snapshot();
    this.broadcast({ type: 'actionResult', events: clientEvents, state: clientState });

    if (this.state.phase === 'playing') this.scheduleComputerActionIfNeeded(events);
  }

  private broadcastResult(events: ReturnType<typeof processPlayerAction>['events']): void {
    if (!this.state) return;
    const clientEvents = serializeEvents(events);
    const clientState = this.snapshot();
    this.broadcast({ type: 'actionResult', events: clientEvents, state: clientState });
  }

  // ─── 타이머 ──────────────────────────────────────────────────────────────

  /**
   * 카드 선택(장소 클릭) 대기 중이면 settings.drawTimeSec을, 행동 선택 대기 중이면
   * settings.actionTimeSec을 기본으로 쓴다. 지금 막 시작된 턴에 실용신양 스킬 또는
   * 도토리 축제로 예약해둔 추가 뽑기가 있다면 그 합계만큼(뽑기 1회당 10초) 시간을
   * 더 준다 — "이번에 결정해야 할 팀"의 예약된 추가 뽑기 수를 기준으로 계산하며,
   * 행동 선택 대기 중에는 그 팀이 이미 이번 액션에서 소모했으므로 자연히 0이 되어
   * 순수 actionTimeSec으로 돌아간다. 고를 수 있는 행동이 하나도 없으면 게임 템포가
   * 늘어지지 않도록 훨씬 짧은 settings.noActionTimeSec을 쓴다.
   *
   * 여기까지가 "플레이어가 실제로 쓸 수 있는 생각할 시간"(turnTotalMs)이고, 그 위에
   * 직전 액션의 연출이 재생되는 동안의 유예(settleGraceMs)를 얹어 실제 타임아웃
   * 시각을 잡는다 — 연출 때문에 아직 조작할 수 없는 시간까지 제한시간에서 깎이면
   * 화면의 카운트다운이 설정값보다 적은 숫자에서 시작해버리기 때문이다.
   */
  private resetTimer(events: GameEvent[] = []): void {
    this.clearTimer();
    if (!this.state) return;
    const settings = this.state.settings;
    const waitingTeam = this.state.pendingChoice ?? this.state.activeTeam;
    const pendingDraws =
      this.state.teams[waitingTeam].pendingExtraDraws + this.state.teams[waitingTeam].pendingFestivalDraws;
    // 배율이 실린 예약 뽑기가 턴 제한시간을 무한정 늘리지 않도록, 시간 연장 계산에는
    // 상한을 둔다(실제 뽑기 횟수 자체는 이 상한과 무관하게 그대로 진행된다).
    const timerDraws = Math.min(pendingDraws, SHEEP_TIMER_EXTRA_DRAW_CAP);

    const noEligibleChoice =
      this.state.pendingChoice != null &&
      eligibleAnimals(this.state, this.state.pendingChoice).length === 0;

    const baseSec = this.state.pendingChoice != null ? settings.actionTimeSec : settings.drawTimeSec;
    const totalMs = noEligibleChoice
      ? settings.noActionTimeSec * 1000
      : (baseSec + SHEEP_EXTRA_TIME_PER_DRAW_SEC * timerDraws) * 1000;
    const durationMs = totalMs + settleGraceMs(events) + SETTLE_GRACE_MARGIN_MS;

    this.turnTotalMs = totalMs;
    this.turnDeadline = Date.now() + durationMs;
    this.timerHandle = setTimeout(() => this.handleTimeout(), durationMs);
  }

  private clearTimer(): void {
    if (this.timerHandle !== null) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
    if (this.computerTimer !== null) {
      clearTimeout(this.computerTimer);
      this.computerTimer = null;
    }
    // 종료된 게임의 스냅샷·재접속에 유령 카운트다운이 실리지 않도록 초기화한다.
    this.turnDeadline = 0;
    this.turnTotalMs = 0;
  }

  // ─── 일시정지 · 항복 · 나가기 ─────────────────────────────────────────────

  /** 그 자리에 실제로 앉아 게임을 뛰고 있는 사람인지 — 아니면 이유를 알려주고 null. */
  private playingMember(playerId: string): PlayerConnection | null {
    const p = this.players.get(playerId);
    if (!p) return null;
    if (!isPlayingSeat(p.team)) {
      this.sendTo(playerId, { type: 'error', code: 'NOT_YOUR_TURN', message: '관전자는 게임에 참여할 수 없습니다.' });
      return null;
    }
    return p;
  }

  /** 그 팀에서 지금 접속해 있는 **사람** 목록(컴퓨터는 players에 없으므로 자연히 빠진다). */
  private connectedHumansOf(team: Team): PlayerConnection[] {
    return this.teamPlayerIds[team]
      .map(id => this.players.get(id))
      .filter((p): p is PlayerConnection => p !== undefined && p.connected);
  }

  /**
   * 일시정지 요청.
   *
   * 상대 팀에 사람이 한 명도 없으면(싱글 모드이거나 상대가 전부 끊긴 경우) 물어볼
   * 사람이 없으므로 곧바로 멈춘다. 있으면 그 사람들에게 물어보는데, **묻는 동안에도
   * 판은 이미 멈춰 있다** — 답을 기다리는 PAUSE_REQUEST_TIMEOUT_SEC 동안 시계가 계속
   * 흐르면, 요청을 띄운 쪽은 창에 가려 아무것도 못 하는 사이 자기 턴이 시간초과로
   * 날아가고 답하는 쪽도 판을 보지 못한 채 시간을 잃는다. 거절·무응답이면
   * `settlePauseRequest`가 그 즉시 풀어주고, **멈춰 있던 동안 흐른 시간은 남은 시간에서
   * 깎이지 않는다**(applyPause/applyResume이 남은 시간을 그대로 보관했다 이어 붙인다).
   */
  handlePauseRequest(playerId: string): void {
    if (!this.state || this.state.phase !== 'playing') {
      this.sendTo(playerId, { type: 'error', code: 'GAME_NOT_STARTED', message: '진행 중인 게임이 없습니다.' });
      return;
    }
    const p = this.playingMember(playerId);
    if (!p || !isPlayingSeat(p.team)) return;
    if (this.paused) return; // 이미 멈춰 있다 — 화면은 곧 pauseState로 맞춰진다
    if (this.pauseRequest) {
      this.sendTo(playerId, { type: 'error', code: 'PAUSE_UNAVAILABLE', message: '이미 일시정지 요청이 진행 중입니다.' });
      return;
    }
    // 팀마다 정해진 횟수까지만. 0으로 둔 방에서는 아무도 멈출 수 없다.
    // ⚠️ 혼자 놀기는 제한이 없다 — 기다리게 할 상대가 없으니 제한이 보호하는 것이 없고,
    //    그래서 로비에서도 이 두 항목을 아예 보여주지 않는다(GameRulesFields의 hidePause).
    const maxCount = this.vsComputer ? Infinity : this.state.settings.pauseMaxCount;
    if (this.pauseUsed[p.team] >= maxCount) {
      this.sendTo(playerId, {
        type: 'error',
        code: 'PAUSE_UNAVAILABLE',
        message: maxCount === 0 ? '이 방은 일시정지를 쓸 수 없습니다.' : `일시정지를 ${maxCount}번 모두 썼습니다.`,
      });
      return;
    }
    // ⚠️ 횟수는 **여기서** 깎는다(수락된 뒤가 아니라). 묻는 20초 동안에도 판이 멈추므로,
    // 거절당할 때마다 다시 요청하면 횟수 제한이 무의미해진다.
    this.pauseUsed[p.team] += 1;

    const opponent: Team = p.team === 'A' ? 'B' : 'A';
    const askable = this.connectedHumansOf(opponent);
    if (askable.length === 0) {
      this.applyPause({ playerId, team: p.team, nickname: p.nickname });
      return;
    }

    this.pauseRequest = { playerId, team: p.team, nickname: p.nickname };
    // 답을 기다리는 동안에도 멈춰 둔다(위 주석 참고). pauseState를 먼저 보내야 요청
    // 창이 뜬 화면의 뒤쪽 판이 이미 회색으로 죽어 있어, 무엇을 고르는 중인지 읽힌다.
    this.applyPause({ playerId, team: p.team, nickname: p.nickname });
    const timeoutMs = PAUSE_REQUEST_TIMEOUT_SEC * 1000;
    for (const o of askable) {
      this.sendTo(o.playerId, { type: 'pauseRequest', fromTeam: p.team, fromNickname: p.nickname, timeoutMs });
    }
    this.pauseRequestTimer = setTimeout(() => this.settlePauseRequest(false, 'timeout'), timeoutMs);
  }

  /** 요청받은 쪽의 대답. 요청한 팀 사람은 자기 요청에 스스로 답할 수 없다. */
  handlePauseRespond(playerId: string, accept: boolean): void {
    const req = this.pauseRequest;
    if (!req) return;
    const p = this.playingMember(playerId);
    if (!p || p.team === req.team) return;
    this.settlePauseRequest(accept, accept ? 'accepted' : 'declined');
  }

  /**
   * 멈춘 게임을 다시 시작한다. **멈춘 팀만** 풀 수 있다 — 상대가 곧바로 풀어버릴 수
   * 있으면 일시정지가 아무 의미도 없기 때문이다(그 팀이 전부 끊기면 handleDisconnect가
   * 대신 풀어주므로 판이 영영 멈춰 있을 일은 없다).
   */
  handleResume(playerId: string): void {
    if (!this.paused) return;
    const p = this.players.get(playerId);
    if (!p) return;
    // 상대가 아직 고르는 중이면 풀지 않는다 — 그 20초는 "멈춤"이 아니라 "묻는 중"이고,
    // 여기서 풀어버리면 답이 도착했을 때 이미 흐르는 판을 다시 멈추게 된다.
    if (this.pauseRequest) {
      this.sendTo(playerId, { type: 'error', code: 'PAUSE_UNAVAILABLE', message: '상대의 답을 기다리는 중입니다.' });
      return;
    }
    if (this.pausedBy && p.team !== this.pausedBy.team) {
      this.sendTo(playerId, { type: 'error', code: 'PAUSE_UNAVAILABLE', message: '일시정지를 요청한 쪽만 다시 시작할 수 있습니다.' });
      return;
    }
    this.applyResume();
  }

  private settlePauseRequest(accepted: boolean, reason: 'accepted' | 'declined' | 'timeout' | 'cancelled'): void {
    const req = this.pauseRequest;
    if (!req) return;
    this.pauseRequest = null;
    if (this.pauseRequestTimer !== null) {
      clearTimeout(this.pauseRequestTimer);
      this.pauseRequestTimer = null;
    }
    // 요청자와 요청받은 쪽의 창을 **함께** 닫아야 하므로 방 전체에 알린다.
    this.broadcast({ type: 'pauseRequestResult', accepted, reason });
    // 묻는 동안 이미 멈춰 있었다(handlePauseRequest 참고). 수락이면 그대로 두고,
    // 거절·무응답·요청자 이탈이면 그 자리에서 풀어 판을 되돌린다.
    if (!accepted) {
      this.applyResume();
    } else if (this.paused) {
      // ⚠️ 멈춤 자체는 달라진 것이 없어도 **한 번 더 보내야 한다** — 방금 pauseRequest를
      // 비웠으니 pausePendingAnswer가 false로 바뀌었고, 그걸 알리지 않으면 요청한 쪽
      // 버튼이 "응답을 기다리는 중"에 붙박인다(applyPause는 이미 멈춘 방에서 아무것도 안 한다).
      this.broadcast({ type: 'pauseState', state: this.snapshot() });
    } else {
      this.applyPause(req);
    }
  }

  /**
   * 실제로 멈춘다 — 걸려 있던 타이머를 **남은 시간만 챙겨** 모두 걷어낸다.
   * 데드라인을 그대로 둔 채 타이머만 멈추면, 재개하는 순간 이미 지나간 시각이 되어
   * 그 턴이 곧바로 시간초과로 날아간다.
   */
  private applyPause(by: { playerId: string; team: Team; nickname: string }): void {
    if (!this.state || this.state.phase !== 'playing' || this.paused) return;
    this.pausedTurnRemainingMs = this.turnDeadline === 0 ? 0 : Math.max(0, this.turnDeadline - Date.now());
    this.pausedTurnTotalMs = this.turnTotalMs;
    this.pausedCpuRemainingMs =
      this.computerTimer !== null ? Math.max(0, this.computerDeadline - Date.now()) : null;
    this.clearTimer(); // ⚠️ turnDeadline·turnTotalMs를 0으로 되돌린다 — 위에서 먼저 챙긴 이유다.
    this.paused = true;
    this.pausedBy = by;
    // 한 번의 일시정지에 상한을 둔다 — 멈춘 팀이 자리를 뜨면 상대는 풀 수도 없어
    // 영영 기다리게 된다(푸는 것은 멈춘 팀뿐이다). 시간이 다 되면 서버가 대신 푼다.
    // 혼자 놀기에는 기다릴 상대가 없으므로 상한을 두지 않는다(원하는 만큼 멈춰둔다).
    if (this.vsComputer) {
      this.broadcast({ type: 'pauseState', state: this.snapshot() });
      return;
    }
    const maxMs = this.state.settings.pauseMaxMin * 60_000;
    this.pauseAutoResumeDeadline = Date.now() + maxMs;
    this.pauseAutoResumeTimer = setTimeout(() => {
      // 묻는 중에 시간이 다 되는 일은 없다(20초 < 최소 1분)지만, 설정을 바꿔도 안전하도록
      // 대기 중인 요청을 먼저 거절과 같이 정리한다 — 그쪽이 applyResume까지 마친다.
      if (this.pauseRequest) this.settlePauseRequest(false, 'timeout');
      else this.applyResume();
    }, maxMs);
    this.broadcast({ type: 'pauseState', state: this.snapshot() });
  }

  private applyResume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.pausedBy = null;
    this.clearPauseAutoResume();

    const turnMs = this.pausedTurnRemainingMs;
    const totalMs = this.pausedTurnTotalMs;
    const cpuMs = this.pausedCpuRemainingMs;
    this.pausedTurnRemainingMs = 0;
    this.pausedTurnTotalMs = 0;
    this.pausedCpuRemainingMs = null;

    if (this.state && this.state.phase === 'playing') {
      if (turnMs > 0) {
        this.turnTotalMs = totalMs;
        this.turnDeadline = Date.now() + turnMs;
        this.timerHandle = setTimeout(() => this.handleTimeout(), turnMs);
      } else {
        // 남은 시간이 0이면(멈추기 직전에 이미 다 써버린 경우) 그 턴을 그대로 시간초과로
        // 날리지 않고 새로 시간을 준다 — 멈춰 있는 동안에는 아무도 생각할 수 없었다.
        this.resetTimer();
      }
      if (cpuMs !== null) this.startComputerTimer(cpuMs);
    }

    this.broadcast({ type: 'pauseState', state: this.snapshot() });
  }

  /** 최대 시간 타이머만 걷어낸다 — 재개·종료 양쪽이 함께 쓴다. */
  private clearPauseAutoResume(): void {
    if (this.pauseAutoResumeTimer !== null) {
      clearTimeout(this.pauseAutoResumeTimer);
      this.pauseAutoResumeTimer = null;
    }
    this.pauseAutoResumeDeadline = 0;
  }

  /** 게임이 끝났을 때 남아 있는 일시정지 상태·요청을 조용히 걷어낸다(알림 없음). */
  private clearPauseState(): void {
    this.paused = false;
    this.pausedBy = null;
    this.clearPauseAutoResume();
    this.pausedTurnRemainingMs = 0;
    this.pausedTurnTotalMs = 0;
    this.pausedCpuRemainingMs = null;
    this.pauseRequest = null;
    if (this.pauseRequestTimer !== null) {
      clearTimeout(this.pauseRequestTimer);
      this.pauseRequestTimer = null;
    }
  }

  /**
   * 항복하기(leave 없음)와 나가기(leave: true).
   *
   * **승패 처리는 똑같다** — 포기한 사람의 팀이 지고 상대 팀이 이긴다. 다른 점은
   * 나가기가 그 뒤 방에서까지 빠진다는 것뿐이다. 관전자는 어느 팀도 아니므로 승패를
   * 건드리지 않고 나가기만 한다.
   */
  forfeit(playerId: string, leave = false): void {
    const p = this.players.get(playerId);
    if (!p) return;

    if (this.state && this.state.phase === 'playing' && isPlayingSeat(p.team)) {
      const winner: Team = p.team === 'A' ? 'B' : 'A';
      this.clearPauseState();
      this.clearTimer();
      this.state = { ...this.state, phase: 'ended', winner, forfeitedBy: p.team };
      const events: GameEvent[] = [{ type: 'gameEnd', winner, reason: 'forfeit' }];
      this.broadcast({ type: 'actionResult', events: serializeEvents(events), state: this.snapshot() });
    }

    if (leave) this.removeFromGame(playerId);
  }

  /**
   * 게임이 시작된 방에서 한 사람을 빼낸다. 로비의 removePlayer와 달리 채팅 안내도
   * 방장 승계도 하지 않는다 — 게임 화면에는 채팅도 대기실 목록도 없어 그 안내가
   * 닿을 곳이 없기 때문이다.
   */
  private removeFromGame(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    this.sendTo(playerId, { type: 'leftRoom' });
    this.players.delete(playerId);
    const ids = this.teamPlayerIds[p.team];
    const idx = ids.indexOf(playerId);
    if (idx !== -1) ids.splice(idx, 1);
    if (this.players.size === 0) {
      this.clearTimer();
      this.clearPauseState();
      this.onEmpty();
    }
  }

  /**
   * 이 연결이 **다른 방으로 옮겨갈 때** 지금 방에서 완전히 손을 뗀다.
   *
   * 게임 화면에서 뒤로가기로 로비에 돌아온 뒤 새 방을 만드는 흐름이 이 길을 쓴다.
   * 예전에는 옛 방의 자리를 그대로 둔 채 새 방을 만들어서, 끝나지 않은 혼자 놀기가
   * 남고 새 방과 옛 게임 상태가 한 화면에서 섞였다("방을 찾을 수 없습니다" 화면).
   * 진행 중이던 게임은 나가기와 똑같이 취급한다 — 말없이 사라지면 남은 상대가
   * 오지 않을 차례를 계속 기다리게 된다.
   */
  detach(playerId: string): void {
    if (!this.players.has(playerId)) return;
    if (this.started) this.forfeit(playerId, true);
    else this.removePlayer(playerId, 'left');
  }

  // ─── 재접속/이탈 ─────────────────────────────────────────────────────────

  handleDisconnect(playerId: string, ws: WebSocket): void {
    const p = this.players.get(playerId);
    if (!p) return;
    // 재접속으로 이미 새 WS로 교체된 경우 구 WS의 close 이벤트는 무시
    if (p.ws !== ws) return;
    p.connected = false;

    if (this.state === null) {
      // 로비에서 나가면 플레이어 제거(방장이었다면 남은 사람에게 넘긴다)
      this.removePlayer(playerId, 'left');
      return;
    }
    // 게임 중 이탈: 차례가 오면 타이머 만료로 자동 강제진행

    // 답을 기다리던 사람이 사라지면 그 요청은 성립하지 않는다 — 물어본 쪽 화면에
    // 20초짜리 창만 덩그러니 남지 않도록 곧바로 걷는다.
    if (this.pauseRequest?.playerId === playerId) this.settlePauseRequest(false, 'cancelled');

    // 멈춘 팀에 아무도 남지 않으면 **아무도 다시 시작할 수 없다**(재개는 그 팀만
    // 할 수 있으므로). 판이 영영 멈춘 채로 남지 않도록 여기서 대신 풀어준다.
    if (this.paused && this.pausedBy && this.connectedHumansOf(this.pausedBy.team).length === 0) {
      this.applyResume();
    }
  }

  handleReconnect(ws: WebSocket, playerId: string): boolean {
    const p = this.players.get(playerId);
    if (!p) return false;

    p.ws = ws;
    p.connected = true;

    if (this.state === null) {
      // 대기실 화면이 "내가 누구인지"(memberId)와 방장 여부를 다시 알 수 있도록,
      // 처음 입장 때와 똑같이 roomJoined → lobbyState 순서로 보내고, 끊긴 사이의 대화도
      // 함께 복구해준다.
      this.sendTo(playerId, { type: 'roomJoined', roomId: this.roomId, playerId, memberId: p.memberId });
      this.sendChatHistory(playerId);
      this.broadcastLobbyState();
    } else {
      const clientState = this.snapshot();
      this.sendTo(playerId, { type: 'gameSnapshot', state: clientState });
    }
    return true;
  }

  // ─── 브로드캐스트 ────────────────────────────────────────────────────────

  private broadcast(msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const p of this.players.values()) {
      if (p.connected && p.ws.readyState === 1 /* OPEN */) {
        p.ws.send(data);
      }
    }
  }

  sendTo(playerId: string, msg: ServerMessage): void {
    const p = this.players.get(playerId);
    if (p?.ws.readyState === 1) {
      p.ws.send(JSON.stringify(msg));
    }
  }

  private broadcastLobbyState(): void {
    this.broadcast({
      type: 'lobbyState',
      players: this.buildLobbyPlayers(),
      teamNames: this.teamNames,
      settings: this.settings,
      hostMemberId: this.hostPlayerId ? this.memberIdOf(this.hostPlayerId) : null,
    });
  }

  private buildLobbyPlayers() {
    return [...this.players.values()].map(p => ({
      memberId: p.memberId,
      nickname: p.nickname,
      team: p.team,
      ready: p.ready,
      connected: p.connected,
    }));
  }
}
