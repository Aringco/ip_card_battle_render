import type { WebSocket } from 'ws';
import { createHash, randomUUID, timingSafeEqual } from 'crypto';
import {
  EVENT_KINDS,
  EVENT_MATCH_COUNTDOWN_MS,
  NICKNAME_MAX_LEN,
  beatDevSettings,
  isValidPin,
  normalizeNameKey,
  randomNickname,
  randomScoreRaceTarget,
} from 'shared';
import type {
  ClientMessage,
  EventAdminState,
  EventDevStatus,
  EventKind,
  EventQueueStatus,
  GameSettings,
  ServerMessage,
} from 'shared';
import type { RoomManager } from '../roomManager';
import type { RecordStore } from '../records/store';
import type { EventGameResult } from '../room';

/**
 * 이벤트 허브 — 개발자 상시 대기 · 도전자 대기 줄 · 자동 매칭 · 이벤트 방 만들기(EVENT_MODE_ROADMAP.md §3-1).
 * RoomManager 옆의 단일 인스턴스이고, 연결 처리기(gameServer)가 이벤트 메시지를 여기로 넘긴다.
 *
 * ⚠️ 개발자는 **연결이 아니라 devId로** 기억한다. 로비 → 게임 화면으로 넘어갈 때마다 페이지가 새 WebSocket을 열기
 *    때문이다 — 연결로 기억하면 매칭되어 게임 화면으로 가는 순간 개발자가 "나간" 것으로 처리된다. 판이 끝나 로비로
 *    돌아온 개발자는 같은 devId로 다시 대기하고(eventDevStandby), 그때 연결이 새로 붙는다.
 * ⚠️ 매칭 순간 메시지 순서는 **roomJoined → gameStart**다. 클라이언트는 방에 새로 들어온 순간 들고 있던 게임 상태를
 *    비우므로, 순서가 뒤집히면 방금 받은 새 게임이 지워진다(혼자 놀기를 addSoloPlayer + startSoloGame으로 나눈 것과 같은 이유).
 */

/** 이벤트 허브가 연결 하나를 다루는 손잡이 — gameServer가 연결마다 만든다. */
export interface EventConn {
  readonly id: string;
  readonly ws: WebSocket;
  isOpen(): boolean;
  send(msg: ServerMessage): void;
  /** 이 연결을 새 방의 일원으로 붙인다 — 옛 방은 정리하고(gameServer의 detach) 방·플레이어 id를 바꾼다. */
  enterRoom(roomId: string, playerId: string): void;
}

interface DevEntry {
  devId: string;
  name: string;
  conn: EventConn | null; // null이면 지금 접속해 있지 않다(매칭되지 않는다)
  state: EventDevStatus['state'];
  roomId: string | null;
  idleSince: number;
  // 이 개발자가 정한 규칙(방 만들기의 게임 규칙과 같은 항목) — 다음 판부터 적용된다. 일시정지는 언제나 0.
  settings: GameSettings;
}

interface QueueEntry {
  conn: EventConn;
  name: string;
  key: string;
}

export interface EventHubOptions {
  /** 개발자 입장 암호 — 없으면 개발자 모드를 쓸 수 없다 */
  devToken?: string | null;
  /** 운영자 화면 토큰 — 없으면 운영자 화면을 쓸 수 없다 */
  adminToken?: string | null;
  matchCountdownMs?: number;
}

type EventAdminMsg = Extract<ClientMessage, { type: 'eventAdmin' }>;

const AUTH_MAX_FAILURES = 5;
const AUTH_LOCK_MS = 30_000;
const RECENT_DURATIONS = 10;

export class EventHub {
  private devs = new Map<string, DevEntry>();
  private queue: QueueEntry[] = [];
  // 지금 줄 서 있거나 경기 중인 도전자 닉네임 — 같은 이름이 동시에 두 판을 뛰지 못하게 한다
  private activeNames = new Set<string>();
  private authFailures = new Map<string, { count: number; until: number }>();
  private recentDurations: number[] = [];
  private readonly countdownMs: number;

  constructor(
    private readonly rooms: RoomManager,
    private readonly store: RecordStore,
    private readonly opts: EventHubOptions = {},
  ) {
    this.countdownMs = opts.matchCountdownMs ?? EVENT_MATCH_COUNTDOWN_MS;
  }

  // ─── 개발자 ────────────────────────────────────────────────────────────────

  /**
   * 개발자로 대기한다. settings는 그 개발자가 정한 규칙(방 만들기의 게임 규칙 — beatDevSettings로 완성한다).
   * 보내지 않으면 이미 정해 둔 규칙(없으면 기본값)을 그대로 쓴다.
   */
  devStandby(conn: EventConn, token: string, rawName: string, devId?: string, settings?: Partial<GameSettings>): void {
    if (!this.checkToken(conn, this.opts.devToken, token, '개발자 암호가 맞지 않습니다.')) return;
    this.removeFromQueue(conn);
    const name = (rawName ?? '').trim().slice(0, NICKNAME_MAX_LEN) || '개발자';

    // 이 연결이 이미 다른 개발자 자리를 쥐고 있었다면 놓는다(한 연결 = 한 개발자).
    for (const d of this.devs.values()) if (d.conn === conn && d.devId !== devId) d.conn = null;

    let dev = devId ? this.devs.get(devId) : undefined;
    if (!dev) {
      dev = {
        devId: randomUUID(), name, conn, state: 'idle', roomId: null, idleSince: Date.now(),
        settings: beatDevSettings(settings),
      };
      this.devs.set(dev.devId, dev);
    } else {
      dev.conn = conn;
      dev.name = name;
      if (settings) dev.settings = beatDevSettings(settings);
      // 판이 아직 진행 중이면(다른 탭에서 로비를 연 경우 등) 그대로 둔다 — 끝났으면 다음 도전자를 받는다.
      const inGame = dev.state === 'playing' && dev.roomId !== null && this.rooms.getRoom(dev.roomId)?.isInProgress();
      if (!inGame && dev.state !== 'matched') {
        dev.state = 'idle';
        dev.roomId = null;
        dev.idleSince = Date.now();
      }
    }
    this.tryMatch();
    this.broadcastStatuses();
  }

  /**
   * 대기 중에 규칙을 바꾼다 — 다음 판부터 적용된다(이미 시작한 판의 규칙은 엔진이 쥐고 있어 바뀌지 않는다).
   * 서버가 다시 잘라 낸다(clampSettings · 일시정지 0) — 화면의 입력 검증만 믿지 않는다.
   */
  devSettings(conn: EventConn, settings: Partial<GameSettings>): void {
    const dev = this.devOf(conn);
    if (!dev) return;
    dev.settings = beatDevSettings({ ...dev.settings, ...settings });
    this.broadcastStatuses();
  }

  devAway(conn: EventConn, away: boolean): void {
    const dev = this.devOf(conn);
    if (!dev || (dev.state !== 'idle' && dev.state !== 'away')) return;
    dev.state = away ? 'away' : 'idle';
    if (!away) dev.idleSince = Date.now();
    this.tryMatch();
    this.broadcastStatuses();
  }

  devLeave(conn: EventConn): void {
    const dev = this.devOf(conn);
    if (!dev) return;
    if (dev.state === 'idle' || dev.state === 'away') this.devs.delete(dev.devId);
    else dev.conn = null;
    conn.send({ type: 'eventDevStatus', status: null });
    this.broadcastStatuses();
  }

  // ─── 도전자 ────────────────────────────────────────────────────────────────

  async challenge(conn: EventConn, kind: EventKind, rawName: string, pin: string): Promise<void> {
    if (!EVENT_KINDS.includes(kind)) return;
    if (!isValidPin(pin)) {
      conn.send({ type: 'error', code: 'EVENT_PIN', message: 'PIN은 숫자 4자리로 입력해 주세요.' });
      return;
    }
    if (this.queue.some(q => q.conn === conn)) {
      conn.send({ type: 'error', code: 'EVENT_UNAVAILABLE', message: '이미 대기 줄에 서 있어요.' });
      return;
    }
    if (this.devOf(conn)) {
      conn.send({ type: 'error', code: 'EVENT_UNAVAILABLE', message: '개발자 대기 중에는 도전할 수 없어요.' });
      return;
    }

    const name = (rawName ?? '').trim().slice(0, NICKNAME_MAX_LEN) || this.freeRandomName();
    const key = normalizeNameKey(name);
    if (this.activeNames.has(key)) {
      conn.send({ type: 'error', code: 'NICKNAME_TAKEN', message: '지금 도전 중인 닉네임이에요. 다른 닉네임을 써 주세요.' });
      return;
    }
    if ([...this.devs.values()].some(d => normalizeNameKey(d.name) === key)) {
      conn.send({ type: 'error', code: 'NICKNAME_TAKEN', message: '이미 사용 중인 닉네임이에요.' });
      return;
    }

    // 등록을 기다리는 동안 같은 이름의 다른 요청이 끼어들지 못하게 먼저 잡아 둔다.
    this.activeNames.add(key);
    let outcome;
    try {
      outcome = await this.store.registerOrVerify(name, pin);
    } catch (err) {
      this.activeNames.delete(key);
      throw err;
    }
    if (!outcome.ok) {
      this.activeNames.delete(key);
      conn.send({
        type: 'error',
        code: 'NICKNAME_TAKEN',
        message: '이미 사용 중인 닉네임이에요. 내 닉네임이라면 처음 정한 PIN을 입력해 주세요.',
      });
      return;
    }
    if (!conn.isOpen()) {
      this.activeNames.delete(key);
      return;
    }
    conn.send({ type: 'eventRegistered', name, firstTime: outcome.firstTime });

    if (kind === 'beatDev') {
      this.queue.push({ conn, name, key });
      this.tryMatch();
      this.broadcastStatuses();
      return;
    }

    // 컴퓨터 대전 — 곧바로 방을 세우고 시작한다(roomCreated → gameStart 순서).
    const { roomId, room } = this.rooms.createRoom();
    const playerId = randomUUID();
    room.setupEventSolo(conn.ws, playerId, name, {
      kind,
      // 목표점수 달성하기 — 목표는 판마다 서버가 10~20에서 뽑는다(모든 무작위는 서버에서만).
      ...(kind === 'timeAttack' ? { target: randomScoreRaceTarget() } : {}),
      onEnd: result => this.onGameEnd(key, result),
    });
    conn.enterRoom(roomId, playerId);
    conn.send({ type: 'roomCreated', roomId, playerId, memberId: room.memberIdOf(playerId) ?? '' });
    room.startEventGame();
  }

  cancel(conn: EventConn): void {
    if (!this.removeFromQueue(conn)) return;
    conn.send({ type: 'eventQueue', status: null });
    this.broadcastStatuses();
  }

  /** 연결이 닫혔다 — 줄에서 빼고, 개발자면 "접속 안 함"으로 둔다(판 중이면 기록은 남긴다). */
  connectionClosed(conn: EventConn): void {
    this.removeFromQueue(conn);
    for (const d of this.devs.values()) {
      if (d.conn === conn) d.conn = null;
    }
    this.authFailures.delete(conn.id);
    this.broadcastStatuses();
  }

  // ─── 순위표 · 운영 ─────────────────────────────────────────────────────────

  sendLeaderboard(conn: EventConn): void {
    conn.send({ type: 'leaderboard', data: this.store.leaderboard() });
  }

  async admin(conn: EventConn, msg: EventAdminMsg): Promise<void> {
    if (!this.checkToken(conn, this.opts.adminToken, msg.token, '운영 토큰이 맞지 않습니다.')) return;
    switch (msg.action) {
      case 'invalidate':
        await this.store.invalidate(Number(msg.recordId), Boolean(msg.invalid));
        break;
      case 'wipe':
        await this.store.wipe();
        break;
      default:
        break;
    }
    conn.send({ type: 'eventAdminState', state: this.adminState() });
  }

  adminState(): EventAdminState {
    return {
      storage: this.store.storageState(),
      pending: this.store.pendingCount(),
      nameConflicts: this.store.nameConflicts(),
      developers: [...this.devs.values()].map(d => ({ name: d.name, state: d.conn ? d.state : 'offline' })),
      queue: this.queue.map(q => q.name),
      results: this.store.results().sort((a, b) => b.createdAt - a.createdAt),
    };
  }

  // ─── 매칭 ──────────────────────────────────────────────────────────────────

  /** 쉬고 있는 개발자(가장 오래 쉰 사람부터)와 줄 맨 앞 도전자를 짝짓는다. */
  private tryMatch(): void {
    while (this.queue.length > 0) {
      const dev = [...this.devs.values()]
        .filter(d => d.state === 'idle' && d.conn?.isOpen())
        .sort((a, b) => a.idleSince - b.idleSince)[0];
      if (!dev) return;
      const ch = this.queue.shift()!;
      if (!ch.conn.isOpen()) {
        this.activeNames.delete(ch.key);
        continue;
      }
      dev.state = 'matched';
      ch.conn.send({ type: 'eventQueue', status: null });
      dev.conn!.send({ type: 'eventMatched', countdownMs: this.countdownMs, opponentName: ch.name, role: 'developer' });
      ch.conn.send({ type: 'eventMatched', countdownMs: this.countdownMs, opponentName: dev.name, role: 'challenger' });
      setTimeout(() => this.startMatch(dev, ch), this.countdownMs);
    }
  }

  private startMatch(dev: DevEntry, ch: QueueEntry): void {
    // 카운트다운 사이 도전자가 떠났다 — 그 이름을 풀고 개발자는 다시 기다린다.
    if (!ch.conn.isOpen()) {
      this.activeNames.delete(ch.key);
      if (dev.state === 'matched') { dev.state = 'idle'; dev.idleSince = Date.now(); }
      this.tryMatch();
      this.broadcastStatuses();
      return;
    }
    // 개발자가 떠났다 — 도전자를 줄 맨 앞으로 되돌린다(도전자 불이익이 없게).
    if (!dev.conn || !dev.conn.isOpen()) {
      if (dev.state === 'matched') dev.state = 'idle';
      this.queue.unshift(ch);
      this.tryMatch();
      this.broadcastStatuses();
      return;
    }

    const { roomId, room } = this.rooms.createRoom();
    const devPlayerId = randomUUID();
    const chPlayerId = randomUUID();
    room.setupEventMatch(
      { ws: dev.conn.ws, playerId: devPlayerId, name: dev.name },
      { ws: ch.conn.ws, playerId: chPlayerId, name: ch.name },
      // 규칙은 그 개발자가 정한 것(대기실에서 바꾼 값) — 매칭 순간의 값으로 굳는다.
      { kind: 'beatDev', settings: dev.settings, onEnd: result => this.onGameEnd(ch.key, result) },
    );
    dev.conn.enterRoom(roomId, devPlayerId);
    ch.conn.enterRoom(roomId, chPlayerId);
    dev.conn.send({ type: 'roomJoined', roomId, playerId: devPlayerId, memberId: room.memberIdOf(devPlayerId) ?? '' });
    ch.conn.send({ type: 'roomJoined', roomId, playerId: chPlayerId, memberId: room.memberIdOf(chPlayerId) ?? '' });
    // ⚠️ roomJoined를 양쪽에 다 보낸 **뒤에** 시작한다(파일 머리 주석).
    room.startEventGame();
    dev.state = 'playing';
    dev.roomId = roomId;
    this.broadcastStatuses();
  }

  /** 이벤트 판이 끝났다 — 이름을 풀고 결과를 저장한다(기록 번호를 돌려준다). */
  private onGameEnd(key: string, r: EventGameResult): Promise<number | null> {
    this.activeNames.delete(key);
    if (r.kind === 'beatDev') {
      this.recentDurations.push(r.durationMs);
      if (this.recentDurations.length > RECENT_DURATIONS) this.recentDurations.shift();
    }
    const saved = this.store.saveResult({
      event: r.kind,
      playerName: r.challengerName,
      developer: r.developerName,
      won: r.won,
      endReason: r.endReason,
      peakLevels: r.peakLevels,
      detail: {
        ...(r.target !== undefined ? { target: r.target } : {}),
        ...(r.kind === 'timeAttack' && r.finalScore !== null ? { finalScore: r.finalScore } : {}),
        ...(r.kind === 'oneWell' ? { lockedAnimal: r.lockedAnimal } : {}),
        ...(r.devForfeit ? { devForfeit: true } : {}),
      },
      turns: r.turns,
      durationMs: r.durationMs,
    });
    // 개발자 전적이 바뀌었다 — 대기실 화면에 곧바로 보인다.
    this.broadcastStatuses();
    return saved;
  }

  // ─── 상태 알림 ─────────────────────────────────────────────────────────────

  private broadcastStatuses(): void {
    for (const d of this.devs.values()) {
      if (d.conn?.isOpen()) d.conn.send({ type: 'eventDevStatus', status: this.devStatus(d) });
    }
    this.queue.forEach((q, i) => {
      if (q.conn.isOpen()) q.conn.send({ type: 'eventQueue', status: this.queueStatus(i + 1) });
    });
  }

  private devStatus(d: DevEntry): EventDevStatus {
    let wins = 0;
    let losses = 0;
    for (const r of this.store.results()) {
      if (r.event !== 'beatDev' || r.invalid || r.developer !== d.name) continue;
      if (r.won) losses += 1;
      else wins += 1;
    }
    return { devId: d.devId, name: d.name, state: d.state, queueLength: this.queue.length, wins, losses, settings: d.settings };
  }

  private queueStatus(position: number): EventQueueStatus {
    const online = [...this.devs.values()].filter(d => d.conn?.isOpen());
    const idle = online.filter(d => d.state === 'idle').length;
    const avgMs = this.recentDurations.length > 0
      ? this.recentDurations.reduce((s, v) => s + v, 0) / this.recentDurations.length
      : null;
    const lanes = Math.max(1, online.length);
    return {
      position,
      developersOnline: online.length,
      developersIdle: idle,
      estimatedWaitSec: avgMs === null ? null : Math.round((avgMs * Math.ceil(position / lanes)) / 1000),
    };
  }

  // ─── 도우미 ────────────────────────────────────────────────────────────────

  private devOf(conn: EventConn): DevEntry | undefined {
    for (const d of this.devs.values()) if (d.conn === conn) return d;
    return undefined;
  }

  private removeFromQueue(conn: EventConn): boolean {
    const idx = this.queue.findIndex(q => q.conn === conn);
    if (idx === -1) return false;
    this.activeNames.delete(this.queue[idx].key);
    this.queue.splice(idx, 1);
    return true;
  }

  /** 아직 아무도 쓰지 않은 무작위 닉네임 — 닉네임을 비워 두고 도전한 사람에게 준다. */
  private freeRandomName(): string {
    for (let i = 0; i < 50; i++) {
      const name = randomNickname();
      const key = normalizeNameKey(name);
      if (!this.store.isRegistered(name) && !this.activeNames.has(key)) return name;
    }
    return `${randomNickname().slice(0, NICKNAME_MAX_LEN - 3)}${Math.floor(Math.random() * 900 + 100)}`;
  }

  /**
   * 암호·토큰 검사 — 서버에 설정돼 있지 않으면 그 기능은 꺼져 있다. 틀리기를 반복하면 잠시 막는다(무차별 대입 방지).
   * 비교는 길이와 무관하게 같은 시간이 걸리도록 해시끼리 timingSafeEqual로 한다.
   */
  private checkToken(conn: EventConn, expected: string | null | undefined, given: string, failMessage: string): boolean {
    const now = Date.now();
    const fail = this.authFailures.get(conn.id);
    if (fail && fail.until > now) {
      conn.send({ type: 'error', code: 'EVENT_AUTH', message: '여러 번 틀려 잠시 막혔어요. 30초 뒤에 다시 해 주세요.' });
      return false;
    }
    if (!expected) {
      conn.send({ type: 'error', code: 'EVENT_AUTH', message: '이 서버에는 이 기능이 설정돼 있지 않습니다(환경변수 확인).' });
      return false;
    }
    const digest = (s: string) => createHash('sha256').update(s ?? '').digest();
    if (timingSafeEqual(digest(expected), digest(given))) {
      this.authFailures.delete(conn.id);
      return true;
    }
    const count = (fail?.count ?? 0) + 1;
    this.authFailures.set(conn.id, { count, until: count >= AUTH_MAX_FAILURES ? now + AUTH_LOCK_MS : 0 });
    conn.send({ type: 'error', code: 'EVENT_AUTH', message: failMessage });
    return false;
  }
}

/**
 * 환경변수로 허브를 만든다(배포·로컬 공통). 개발 빌드에서 암호를 안 정했으면 기본값을 쓰고 콘솔에 알린다 —
 * 프로덕션(NODE_ENV=production)에서는 기본값을 쓰지 않으므로 Render 대시보드에 반드시 넣어야 한다.
 */
export function eventTokensFromEnv(env: NodeJS.ProcessEnv = process.env): { devToken: string | null; adminToken: string | null } {
  const production = env.NODE_ENV === 'production';
  const devToken = env.EVENT_DEV_TOKEN || (production ? null : 'dev1234');
  const adminToken = env.EVENT_ADMIN_TOKEN || (production ? null : 'admin1234');
  if (!env.EVENT_DEV_TOKEN && !production) console.log('[event] EVENT_DEV_TOKEN 없음 — 개발용 기본값(dev1234)을 씁니다.');
  if (!env.EVENT_ADMIN_TOKEN && !production) console.log('[event] EVENT_ADMIN_TOKEN 없음 — 개발용 기본값(admin1234)을 씁니다.');
  if (production && !devToken) console.log('[event] EVENT_DEV_TOKEN이 설정되지 않아 개발자 모드가 꺼져 있습니다.');
  if (production && !adminToken) console.log('[event] EVENT_ADMIN_TOKEN이 설정되지 않아 운영자 화면이 꺼져 있습니다.');
  return { devToken, adminToken };
}
