import type { WebSocket } from 'ws';
import type { Animal, Place, Team } from 'shared';
import type { ServerMessage } from 'shared';
import { processPlayerAction, processSkillChoice, processPass, processTimeout, initGame } from './engine/gameEngine';
import { eligibleAnimals, levelOf } from './engine/skills';
import type { GameEvent, GameSettings, GameState } from 'shared';
import {
  SHEEP_EXTRA_TIME_PER_DRAW_SEC,
  SHEEP_TIMER_EXTRA_DRAW_CAP,
  PLACES,
  TEAM_NAME_POOL,
  DEFAULT_SETTINGS,
  clampSettings,
} from 'shared';
import { serializeEvents, serializeState } from './serializer';

// 싱글 모드 컴퓨터 플레이어는 실제 WebSocket 연결이 없으므로 고정 ID로 취급한다.
const CPU_PLAYER_ID = 'CPU';
const CPU_NICKNAME = '컴퓨터';
const CPU_TEAM_NAME = '컴퓨터';
// 클라이언트의 스킬 발동 연출(디자인어 팝업 2000ms 등)이 끝나기 전에 컴퓨터가 다음 수를
// 두면, 그 사이 상대 턴 배경색이 거의 안 보이고 곧바로 내 턴으로 돌아온 것처럼 보인다.
// 가장 긴 연출보다 여유 있게 최소 대기 시간을 잡아 그런 일이 최대한 드물게 한다.
const CPU_THINK_MIN_MS = 2200;
const CPU_THINK_MAX_MS = 3200;
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
  nickname: string;
  team: Team;
  ready: boolean;
  connected: boolean;
}

export class Room {
  private players = new Map<string, PlayerConnection>();  // playerId → PlayerConnection
  private teamPlayerIds: Record<Team, string[]> = { A: [], B: [] };
  private teamNames: Record<Team, string | null> = { A: null, B: null };
  // 방장(방을 만든 쪽)이 정한 게임 규칙 — 방 생성 시 한 번만 설정되고 게임 중 불변이다.
  private settings: GameSettings = DEFAULT_SETTINGS;
  private state: GameState | null = null;
  private turnDeadline = 0;
  // 타이머 게이지 100%에 해당하는 시간 — turnDeadline까지 남은 시간에서 연출 유예를
  // 뺀 "이번 턴에 실제로 주어진 생각할 시간"이다(ClientGameState.turnTotalMs 참고).
  private turnTotalMs = 0;
  private timerHandle: ReturnType<typeof setTimeout> | null = null;
  private vsComputer = false;
  private computerTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    readonly roomId: string,
    private onEmpty: () => void,
  ) {}

  // ─── 로비 ────────────────────────────────────────────────────────────────

  /** 팀 이름을 확정한다. 이미 정해져 있으면 무시하고, 요청한 이름이 상대 팀과 겹치면 무작위로 대체한다. */
  private assignTeamName(team: Team, requested?: string): void {
    if (this.teamNames[team]) return;
    const other = this.teamNames[team === 'A' ? 'B' : 'A'];
    const trimmed = requested?.trim().slice(0, 12);
    if (trimmed && trimmed !== other) {
      this.teamNames[team] = trimmed;
      return;
    }
    const pool = TEAM_NAME_POOL.filter(n => n !== other);
    const name = pool[Math.floor(Math.random() * pool.length)] ?? (team === 'A' ? 'A팀' : 'B팀');
    this.teamNames[team] = name;
  }

  addPlayer(
    ws: WebSocket,
    playerId: string,
    nickname: string,
    team: Team,
    teamName?: string,
    settings?: Partial<GameSettings>,
    // 방을 처음 만드는 사람만 넘겨준다 — 아직 아무도 들어오지 않은 반대편 팀의 이름을
    // 미리 정해둔다(비어 있으면 실제로 그 팀에 참가하는 사람이 나중에 자기 이름을 정한다).
    otherTeamName?: string,
  ): 'ok' | 'game_started' | 'nickname_taken' {
    if (this.state !== null) return 'game_started';

    for (const p of this.players.values()) {
      if (p.nickname === nickname) return 'nickname_taken';
    }

    // 방을 처음 만드는 쪽(=이 방에 아직 아무도 없을 때)만 규칙을 정할 수 있다.
    const isRoomCreator = this.players.size === 0;
    if (isRoomCreator && settings) {
      this.settings = clampSettings(settings);
    }

    this.players.set(playerId, { ws, playerId, nickname, team, ready: false, connected: true });
    this.teamPlayerIds[team].push(playerId);
    this.assignTeamName(team, teamName);
    // 방장만 반대편 팀 이름도 미리 정할 수 있다 — 나중에 참가자가 joinRoom으로 보내는
    // teamName은 assignTeamName이 "이미 정해져 있으면 무시"하므로 이 값이 우선한다.
    // 방장이 비워뒀으면(otherTeamName 없음) 여기서 미리 확정 짓지 않는다 — 그래야 실제로
    // 그 팀에 참가하는 사람이 자기 팀 이름을 직접 고를 기회가 그대로 남는다(정해지지
    // 않은 이름은 게임 시작 시점(tryStartGame)에야 비로소 무작위로 채워진다).
    if (isRoomCreator && otherTeamName?.trim()) {
      this.assignTeamName(team === 'A' ? 'B' : 'A', otherTeamName);
    }
    this.broadcastLobbyState();
    return 'ok';
  }

  /** 싱글 모드 — 사람은 A팀에 즉시 참가시키고, B팀은 컴퓨터(랜덤 클릭)로 채워 곧바로 게임을 시작한다. */
  addSoloPlayer(ws: WebSocket, playerId: string, nickname: string, teamName?: string, settings?: Partial<GameSettings>): void {
    this.vsComputer = true;
    if (settings) this.settings = clampSettings(settings);
    this.players.set(playerId, { ws, playerId, nickname, team: 'A', ready: true, connected: true });
    this.teamPlayerIds.A.push(playerId);
    this.teamPlayerIds.B.push(CPU_PLAYER_ID);
    this.assignTeamName('A', teamName);
    this.teamNames.B = CPU_TEAM_NAME;
    this.tryStartGame();
  }

  setReady(playerId: string): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.ready = true;
    this.broadcastLobbyState();
    this.tryStartGame();
  }

  private tryStartGame(): void {
    const all = [...this.players.values()];
    const minPlayers = this.vsComputer ? 1 : 2;
    if (all.length < minPlayers) return;
    if (!all.every(p => p.ready)) return;
    if (this.teamPlayerIds.A.length === 0 || this.teamPlayerIds.B.length === 0) return;

    const nickA = this.teamPlayerIds.A.map(id => this.players.get(id)?.nickname ?? CPU_NICKNAME);
    const nickB = this.teamPlayerIds.B.map(id => this.players.get(id)?.nickname ?? CPU_NICKNAME);
    this.state = initGame(nickA, nickB, Math.random, this.settings);
    this.assignTeamName('A');
    this.assignTeamName('B');

    this.resetTimer();
    const clientState = serializeState(this.state, this.turnDeadline, this.turnTotalMs, this.finalTeamNames(), this.teamPlayerIds);
    this.broadcast({ type: 'gameStart', state: clientState });
    this.scheduleComputerActionIfNeeded();
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

  handleDrawCard(playerId: string, place: Place): void {
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

    if (this.state.phase === 'playing') this.scheduleComputerActionIfNeeded();
  }

  handleChooseSkill(playerId: string, animal: Animal): void {
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

    if (this.state.phase === 'playing') this.scheduleComputerActionIfNeeded();
  }

  handlePassSkill(playerId: string): void {
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

    if (this.state.phase === 'playing') this.scheduleComputerActionIfNeeded();
  }

  /** 싱글 모드 — 컴퓨터(B팀) 차례(장소 클릭 또는 스킬 선택)가 되면 잠시 "생각하는" 척한 뒤 무작위로 진행한다. */
  private scheduleComputerActionIfNeeded(): void {
    if (!this.vsComputer || !this.state || this.state.phase !== 'playing') return;
    const waitingTeam = this.state.pendingChoice ?? this.state.activeTeam;
    if (waitingTeam !== 'B') return;
    if (this.computerTimer !== null) return;

    const delay = CPU_THINK_MIN_MS + Math.floor(Math.random() * (CPU_THINK_MAX_MS - CPU_THINK_MIN_MS));
    this.computerTimer = setTimeout(() => {
      this.computerTimer = null;
      this.performComputerAction();
    }, delay);
  }

  private performComputerAction(): void {
    if (!this.state || this.state.phase !== 'playing') return;

    let result: { state: GameState; events: ReturnType<typeof processPlayerAction>['events'] };
    if (this.state.pendingChoice === 'B') {
      const animal = pickComputerSkill(this.state, 'B');
      result = animal === null ? processPass(this.state) : processSkillChoice(this.state, animal);
    } else if (this.state.activeTeam === 'B' && this.state.pendingChoice === null) {
      const place = PLACES[Math.floor(Math.random() * PLACES.length)];
      result = processPlayerAction(this.state, place);
    } else {
      return;
    }

    this.state = result.state;
    if (this.state.phase === 'ended') this.clearTimer();
    else this.resetTimer(result.events);
    this.broadcastResult(result.events);

    if (this.state.phase === 'playing') this.scheduleComputerActionIfNeeded();
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

    const clientState = serializeState(this.state, this.turnDeadline, this.turnTotalMs, this.finalTeamNames(), this.teamPlayerIds);
    this.broadcast({ type: 'actionResult', events: clientEvents, state: clientState });

    if (this.state.phase === 'playing') this.scheduleComputerActionIfNeeded();
  }

  private broadcastResult(events: ReturnType<typeof processPlayerAction>['events']): void {
    if (!this.state) return;
    const clientEvents = serializeEvents(events);
    const clientState = serializeState(this.state, this.turnDeadline, this.turnTotalMs, this.finalTeamNames(), this.teamPlayerIds);
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

  // ─── 재접속/이탈 ─────────────────────────────────────────────────────────

  handleDisconnect(playerId: string, ws: WebSocket): void {
    const p = this.players.get(playerId);
    if (!p) return;
    // 재접속으로 이미 새 WS로 교체된 경우 구 WS의 close 이벤트는 무시
    if (p.ws !== ws) return;
    p.connected = false;

    if (this.state === null) {
      // 로비에서 나가면 플레이어 제거
      this.players.delete(playerId);
      const idx = this.teamPlayerIds[p.team].indexOf(playerId);
      if (idx !== -1) this.teamPlayerIds[p.team].splice(idx, 1);
      this.broadcastLobbyState();

      if (this.players.size === 0) this.onEmpty();
    }
    // 게임 중 이탈: 차례가 오면 타이머 만료로 자동 강제진행
  }

  handleReconnect(ws: WebSocket, playerId: string): boolean {
    const p = this.players.get(playerId);
    if (!p) return false;

    p.ws = ws;
    p.connected = true;

    if (this.state === null) {
      this.sendTo(playerId, { type: 'lobbyState', players: this.buildLobbyPlayers(), teamNames: this.teamNames, settings: this.settings });
    } else {
      const clientState = serializeState(this.state, this.turnDeadline, this.turnTotalMs, this.finalTeamNames(), this.teamPlayerIds);
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
    this.broadcast({ type: 'lobbyState', players: this.buildLobbyPlayers(), teamNames: this.teamNames, settings: this.settings });
  }

  private buildLobbyPlayers() {
    return [...this.players.values()].map(p => ({
      nickname: p.nickname,
      team: p.team,
      ready: p.ready,
    }));
  }
}
