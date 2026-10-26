import type { ServerMessage } from 'shared';
import {
  BEAT_DEV_SETTINGS, PLACES, SCORE_RACE_CPU_HP, SCORE_RACE_INTRO_MS, SCORE_RACE_INTRO_WAIT_MS, SCORE_RACE_START_SCORE, SCORE_RACE_TARGET_MAX,
  SCORE_RACE_TARGET_MIN, SCORE_RACE_TURNS, SETTINGS_LIMITS,
} from 'shared';
import { Room } from '../room';
import type { EventGameResult } from '../room';
import { RoomManager } from '../roomManager';
import { RecordStore } from '../records/store';
import { EventHub } from '../events/hub';
import type { EventConn } from '../events/hub';

/**
 * 이벤트 모드 — 방(Room)의 이벤트 판과 이벤트 허브(개발자 대기·도전자 줄·매칭).
 * 방이 실제 타이머를 걸므로 가짜 타이머로 감싼다(spectator.test.ts와 같은 이유).
 */

interface FakeSocket {
  readyState: number;
  sent: ServerMessage[];
  send(data: string): void;
}

function fakeSocket(): FakeSocket {
  const sent: ServerMessage[] = [];
  return { readyState: 1, sent, send(data: string) { sent.push(JSON.parse(data) as ServerMessage); } };
}

function lastOf<T extends ServerMessage['type']>(ws: FakeSocket, type: T): Extract<ServerMessage, { type: T }> | undefined {
  for (let i = ws.sent.length - 1; i >= 0; i--) {
    if (ws.sent[i].type === type) return ws.sent[i] as Extract<ServerMessage, { type: T }>;
  }
  return undefined;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

// ─── 방 ────────────────────────────────────────────────────────────────────

describe('이벤트 방 — 목표점수 달성하기', () => {
  function setup(target = 17) {
    const ws = fakeSocket();
    const room = new Room('EVT1', () => {});
    const results: EventGameResult[] = [];
    room.setupEventSolo(ws as never, 'p1', '도전자', {
      kind: 'timeAttack',
      target,
      onEnd: async r => { results.push(r); return 7; },
    });
    room.startEventGame();
    return { ws, room, results };
  }

  /** 도전자가 아무것도 안 해도(시간초과 → 서버가 대신 둔다) 컴퓨터와 함께 판이 굴러가게 시계를 돌린다. */
  function playOut(ws: FakeSocket) {
    for (let i = 0; i < 4000; i++) {
      const last = ws.sent.filter(m => m.type === 'actionResult').pop() as Extract<ServerMessage, { type: 'actionResult' }> | undefined;
      if (last?.state.phase === 'ended') return last;
      jest.advanceTimersByTime(1000);
    }
    throw new Error('판이 끝나지 않았다');
  }

  it('도전자 0점 · 컴퓨터 SCORE_RACE_CPU_HP에서 시작하고, 목표·턴 수가 첫 스냅샷부터 실린다', () => {
    const { ws } = setup(17);
    const start = lastOf(ws, 'gameStart')!.state;
    expect(start.scoreRace).toEqual({ side: 'A', target: 17, maxTurn: SCORE_RACE_TURNS });
    expect(start.teams.A.hp).toBe(SCORE_RACE_START_SCORE);
    expect(start.teams.B.hp).toBe(SCORE_RACE_CPU_HP);
    expect(start.settings.pauseMaxCount).toBe(0);
    expect(start.event).toMatchObject({ kind: 'timeAttack', success: null });
  });

  it('시작 룰렛은 게임 화면이 붙는 순간 시작하고, 그동안 판이 멈춰 있다(첫 턴 타이머가 늦고 클릭은 거부)', () => {
    const { ws, room } = setup();
    // 로비에 있는 동안 — 아직 돌지 않는다. 클릭도 받지 않는다(게임 화면을 기다리는 중).
    jest.advanceTimersByTime(3000);
    room.handleDrawCard('p1', PLACES[0]);
    expect(lastOf(ws, 'error')).toMatchObject({ code: 'GAME_NOT_STARTED' });

    // 게임 화면이 붙었다 — 그 스냅샷에 룰렛 한 바퀴 길이가 실리고, 첫 턴 타이머는 그만큼 뒤로 밀린다.
    const game = fakeSocket();
    room.handleReconnect(game as never, 'p1');
    const snap = lastOf(game, 'gameSnapshot')!.state;
    expect(snap.event?.introRemainingMs).toBe(SCORE_RACE_INTRO_MS);
    expect(snap.turnRemainingMs).toBeGreaterThanOrEqual(snap.turnTotalMs + SCORE_RACE_INTRO_MS);
    jest.advanceTimersByTime(SCORE_RACE_INTRO_MS - 100);
    room.handleDrawCard('p1', PLACES[0]);
    expect(game.sent.some(m => m.type === 'actionResult')).toBe(false);

    jest.advanceTimersByTime(100);
    room.handleDrawCard('p1', PLACES[0]);
    const after = game.sent.filter(m => m.type === 'actionResult').pop() as Extract<ServerMessage, { type: 'actionResult' }>;
    expect(after).toBeDefined();
    // 룰렛이 끝난 뒤의 상태에는 더 실리지 않는다 — F5로 다시 붙어도 다시 돌지 않는다.
    expect(after.state.event?.introRemainingMs).toBeUndefined();
    const again = fakeSocket();
    room.handleReconnect(again as never, 'p1');
    expect(lastOf(again, 'gameSnapshot')!.state.event?.introRemainingMs).toBeUndefined();
  });

  it('게임 화면이 끝내 붙지 않으면 대기 상한 뒤 룰렛 없이 판이 흐른다', () => {
    const { ws, room } = setup();
    jest.advanceTimersByTime(SCORE_RACE_INTRO_WAIT_MS + SCORE_RACE_INTRO_MS);
    room.handleDrawCard('p1', PLACES[0]);
    expect(ws.sent.some(m => m.type === 'actionResult')).toBe(true);
  });

  it('일시정지를 거부한다', () => {
    const { ws, room } = setup();
    room.handlePauseRequest('p1');
    expect(lastOf(ws, 'error')).toMatchObject({ code: 'PAUSE_UNAVAILABLE' });
  });

  it('0점에서 시작해도 넉아웃으로 끝나지 않고, 10턴이 지나야 target으로 끝난다 — 컴퓨터는 상표토끼를 쓰지 않는다', async () => {
    const { ws, results } = setup(20);
    const end = playOut(ws);
    const gameEnd = end.events.find(e => e.type === 'gameEnd');
    expect(gameEnd).toMatchObject({ reason: 'target' });
    expect(end.state.turn).toBe(SCORE_RACE_TURNS + 1);
    const reached = end.state.teams.A.hp >= 20;
    expect(end.state.winner).toBe(reached ? 'A' : 'B');
    for (const m of ws.sent) {
      if (m.type !== 'actionResult') continue;
      for (const e of m.events) if (e.type === 'skillApplied' && e.team === 'B') expect(e.animal).not.toBe('rabbit');
    }
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ kind: 'timeAttack', won: reached, target: 20, finalScore: end.state.teams.A.hp });
    // 카드별 기술 최고 효과 — 도전자(A)가 쓴 skillApplied에서 방이 잰다(순위표·동물의 왕)
    const best: Record<string, number> = { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 };
    for (const m of ws.sent) {
      if (m.type !== 'actionResult') continue;
      for (const e of m.events) {
        if (e.type !== 'skillApplied' || e.team !== 'A' || e.level <= 0) continue;
        const v = e.animal === 'sheep' ? e.extraDrawsQueued : e.animal === 'rabbit' ? e.myHpDelta
          : e.animal === 'mermaid' ? e.multiplierAfter : -e.oppHpDelta;
        best[e.animal] = Math.max(best[e.animal], v);
      }
    }
    expect(results[0].peakSkill).toEqual(best);
    // 저장이 끝나면 기록 번호가 따로 온다.
    await Promise.resolve();
    await Promise.resolve();
    expect(lastOf(ws, 'eventRecorded')).toEqual({ type: 'eventRecorded', recordId: 7 });
  });

  it('항복하면 forfeit로 실패 기록된다', () => {
    const { room, results } = setup();
    room.forfeit('p1');
    expect(results[0]).toMatchObject({ won: false, endReason: 'forfeit' });
  });
});

describe('이벤트 방 — 한 우물만 파기', () => {
  it('첫 스냅샷부터 잠금이 실려 있다', () => {
    const ws = fakeSocket();
    const room = new Room('EVT2', () => {});
    room.setupEventSolo(ws as never, 'p1', '도전자', { kind: 'oneWell', onEnd: async () => null });
    room.startEventGame();
    // 기본 배율(상표토끼 2 · 특허랑이 3)도 판에 실려 있다 — 화면의 미리보기가 같은 값을 쓴다
    expect(lastOf(ws, 'gameStart')!.state.oneWell).toEqual({ side: 'A', allowed: ['rabbit', 'tiger'], locked: null, multipliers: { rabbit: 2, tiger: 3 } });
  });
});

// ─── 허브 ──────────────────────────────────────────────────────────────────

interface FakeConn extends EventConn {
  sock: FakeSocket;
  room: { roomId: string; playerId: string } | null;
  open: boolean;
}

function fakeConn(id: string): FakeConn {
  const sock = fakeSocket();
  const conn: FakeConn = {
    id,
    ws: sock as never,
    sock,
    room: null,
    open: true,
    isOpen: () => conn.open,
    send: msg => sock.sent.push(msg),
    enterRoom: (roomId, playerId) => { conn.room = { roomId, playerId }; },
  };
  return conn;
}

function setupHub() {
  const rooms = new RoomManager();
  const store = new RecordStore({ log: () => {} });
  const hub = new EventHub(rooms, store, { devToken: 'devpw', adminToken: 'adminpw', matchCountdownMs: 3000 });
  return { rooms, store, hub };
}

/** 마이크로태스크(닉네임 등록 await)를 비운다. */
async function flush() {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('이벤트 허브 — 개발자 인증', () => {
  it('암호가 틀리면 EVENT_AUTH, 맞으면 대기 상태가 된다', () => {
    const { hub } = setupHub();
    const dev = fakeConn('d1');
    hub.devStandby(dev, 'wrong', '김개발');
    expect(lastOf(dev.sock, 'error')).toMatchObject({ code: 'EVENT_AUTH' });
    hub.devStandby(dev, 'devpw', '김개발');
    expect(lastOf(dev.sock, 'eventDevStatus')!.status).toMatchObject({ name: '김개발', state: 'idle', queueLength: 0 });
  });

  it('다섯 번 틀리면 맞는 암호도 잠시 받지 않는다', () => {
    const { hub } = setupHub();
    const dev = fakeConn('d1');
    for (let i = 0; i < 5; i++) hub.devStandby(dev, 'x', '김개발');
    hub.devStandby(dev, 'devpw', '김개발');
    expect(lastOf(dev.sock, 'error')!.message).toContain('잠시 막혔');
    jest.advanceTimersByTime(30_001);
    hub.devStandby(dev, 'devpw', '김개발');
    expect(lastOf(dev.sock, 'eventDevStatus')!.status?.state).toBe('idle');
  });
});

describe('이벤트 허브 — 매칭', () => {
  it('도전자가 줄을 서면 쉬는 개발자와 맞물리고, 카운트다운 뒤 roomJoined → gameStart 순서로 시작한다', async () => {
    const { hub, rooms } = setupHub();
    const dev = fakeConn('d1');
    const ch = fakeConn('c1');
    hub.devStandby(dev, 'devpw', '김개발');
    await hub.challenge(ch, 'beatDev', '도전왕', '1234');
    expect(lastOf(ch.sock, 'eventRegistered')).toEqual({ type: 'eventRegistered', name: '도전왕', firstTime: true });
    expect(lastOf(ch.sock, 'eventMatched')).toMatchObject({ role: 'challenger', opponentName: '김개발' });
    expect(lastOf(dev.sock, 'eventMatched')).toMatchObject({ role: 'developer', opponentName: '도전왕' });

    jest.advanceTimersByTime(3000);
    for (const c of [dev, ch]) {
      const types = c.sock.sent.map(m => m.type);
      const joined = types.lastIndexOf('roomJoined');
      const started = types.lastIndexOf('gameStart');
      expect(joined).toBeGreaterThanOrEqual(0);
      expect(started).toBeGreaterThan(joined);
    }
    expect(dev.room?.roomId).toBe(ch.room?.roomId);
    const start = lastOf(ch.sock, 'gameStart')!.state;
    expect(start.settings.targetScore).toBe(3);
    expect(start.startingTeam).toBe('A'); // 도전자 선공(§7-4)
    expect(start.event).toMatchObject({ kind: 'beatDev', challengerName: '도전왕', developerName: '김개발' });
    expect(lastOf(dev.sock, 'eventDevStatus')!.status?.state).toBe('playing');
    expect(rooms.getRoom(ch.room!.roomId)?.isInProgress()).toBe(true);
  });

  it('판이 끝나면 결과가 저장되고(동물의 왕 재료), 개발자는 다시 대기하면 다음 도전자를 받는다', async () => {
    const { hub, rooms, store } = setupHub();
    const dev = fakeConn('d1');
    const ch1 = fakeConn('c1');
    const ch2 = fakeConn('c2');
    hub.devStandby(dev, 'devpw', '김개발');
    const devId = lastOf(dev.sock, 'eventDevStatus')!.status!.devId;
    await hub.challenge(ch1, 'beatDev', '첫째', '1111');
    await hub.challenge(ch2, 'beatDev', '둘째', '2222');
    expect(lastOf(ch2.sock, 'eventQueue')!.status).toMatchObject({ position: 1 });
    jest.advanceTimersByTime(3000);

    // 개발자가 항복 → 도전자 승리로 끝난다.
    const room = rooms.getRoom(dev.room!.roomId)!;
    room.forfeit(dev.room!.playerId);
    await flush();
    expect(store.results()).toHaveLength(1);
    expect(store.results()[0]).toMatchObject({ event: 'beatDev', playerName: '첫째', developer: '김개발', won: true, detail: { devForfeit: true } });

    // 결과 화면을 보는 동안에는 다음 판으로 끌려가지 않는다 — 대기실로 돌아와 다시 대기해야 받는다.
    expect(lastOf(ch2.sock, 'eventMatched')).toBeUndefined();
    const devAgain = fakeConn('d2'); // 로비로 돌아온 새 연결
    hub.devStandby(devAgain, 'devpw', '김개발', devId);
    expect(lastOf(ch2.sock, 'eventMatched')).toMatchObject({ opponentName: '김개발' });
    expect(lastOf(devAgain.sock, 'eventDevStatus')!.status).toMatchObject({ devId, losses: 1, wins: 0 });
  });

  it('자리 비움 중에는 매칭되지 않는다', async () => {
    const { hub } = setupHub();
    const dev = fakeConn('d1');
    const ch = fakeConn('c1');
    hub.devStandby(dev, 'devpw', '김개발');
    hub.devAway(dev, true);
    await hub.challenge(ch, 'beatDev', '도전왕', '1234');
    expect(lastOf(ch.sock, 'eventMatched')).toBeUndefined();
    expect(lastOf(ch.sock, 'eventQueue')!.status).toMatchObject({ position: 1, developersOnline: 1, developersIdle: 0 });
    hub.devAway(dev, false);
    expect(lastOf(ch.sock, 'eventMatched')).toBeDefined();
  });

  it('카운트다운 중 개발자가 끊기면 도전자는 줄 맨 앞으로 돌아간다', async () => {
    const { hub } = setupHub();
    const dev = fakeConn('d1');
    const ch = fakeConn('c1');
    hub.devStandby(dev, 'devpw', '김개발');
    await hub.challenge(ch, 'beatDev', '도전왕', '1234');
    dev.open = false;
    hub.connectionClosed(dev);
    jest.advanceTimersByTime(3000);
    expect(ch.room).toBeNull();
    expect(lastOf(ch.sock, 'eventQueue')!.status).toMatchObject({ position: 1, developersOnline: 0 });
  });

  it('줄에 선 도전자가 끊기면 줄에서 빠지고 이름도 풀린다', async () => {
    const { hub } = setupHub();
    const ch = fakeConn('c1');
    await hub.challenge(ch, 'beatDev', '도전왕', '1234');
    ch.open = false;
    hub.connectionClosed(ch);
    const again = fakeConn('c2');
    await hub.challenge(again, 'beatDev', '도전왕', '1234'); // 같은 사람의 재도전(같은 PIN)
    expect(lastOf(again.sock, 'eventRegistered')).toMatchObject({ name: '도전왕', firstTime: false });
  });
});

describe('이벤트 허브 — 닉네임', () => {
  it('이미 쓴 닉네임은 PIN이 다르면 NICKNAME_TAKEN', async () => {
    const { hub } = setupHub();
    const a = fakeConn('a');
    const b = fakeConn('b');
    await hub.challenge(a, 'oneWell', '곰돌이', '1234');
    await hub.challenge(b, 'oneWell', ' 곰돌이 ', '5678');
    expect(lastOf(b.sock, 'error')).toMatchObject({ code: 'NICKNAME_TAKEN' });
  });

  it('지금 도전 중인 닉네임은 PIN이 같아도 동시에 쓸 수 없다', async () => {
    const { hub } = setupHub();
    const a = fakeConn('a');
    const b = fakeConn('b');
    await hub.challenge(a, 'beatDev', '곰돌이', '1234');
    await hub.challenge(b, 'beatDev', '곰돌이', '1234');
    expect(lastOf(b.sock, 'error')).toMatchObject({ code: 'NICKNAME_TAKEN' });
  });

  it('PIN이 숫자 4자리가 아니면 EVENT_PIN', async () => {
    const { hub } = setupHub();
    const a = fakeConn('a');
    await hub.challenge(a, 'oneWell', '곰돌이', '12a4');
    expect(lastOf(a.sock, 'error')).toMatchObject({ code: 'EVENT_PIN' });
  });

  it('닉네임을 비워 두면 쓰이지 않은 무작위 이름을 지어 준다', async () => {
    const { hub } = setupHub();
    const a = fakeConn('a');
    await hub.challenge(a, 'oneWell', '   ', '1234');
    const reg = lastOf(a.sock, 'eventRegistered')!;
    expect(reg.name.trim().length).toBeGreaterThan(0);
    expect(reg.firstTime).toBe(true);
  });
});

describe('이벤트 허브 — 컴퓨터 대전 시작', () => {
  it('목표점수 달성하기는 roomCreated → gameStart 순서로 곧바로 시작하고, 목표는 10~20 사이에서 서버가 뽑는다', async () => {
    const { hub } = setupHub();
    const seen = new Set<number>();
    for (let i = 0; i < 40; i++) {
      const a = fakeConn(`a${i}`);
      await hub.challenge(a, 'timeAttack', `도전왕${i}`, '1234');
      const types = a.sock.sent.map(m => m.type);
      expect(types.indexOf('gameStart')).toBeGreaterThan(types.indexOf('roomCreated'));
      const race = lastOf(a.sock, 'gameStart')!.state.scoreRace!;
      expect(race.target).toBeGreaterThanOrEqual(SCORE_RACE_TARGET_MIN);
      expect(race.target).toBeLessThanOrEqual(SCORE_RACE_TARGET_MAX);
      expect(Number.isInteger(race.target)).toBe(true);
      seen.add(race.target);
    }
    expect(seen.size).toBeGreaterThan(1); // 고정값이 아니다
  });
});

describe('이벤트 허브 — 개발자가 정하는 규칙', () => {
  async function startMatch(hub: EventHub, dev: FakeConn) {
    const ch = fakeConn(`c${Math.random()}`);
    await hub.challenge(ch, 'beatDev', `도전${Math.floor(Math.random() * 1e6)}`, '1234');
    jest.advanceTimersByTime(3000);
    return lastOf(ch.sock, 'gameStart')!.state.settings;
  }

  it('대기할 때 보낸 규칙이 판에 그대로 쓰이고, 상태에도 실린다(일시정지는 언제나 0)', async () => {
    const { hub } = setupHub();
    const dev = fakeConn('d1');
    hub.devStandby(dev, 'devpw', '김개발', undefined, { targetScore: 5, festivalTurn: 4, drawTimeSec: 20, pauseMaxCount: 3 });
    expect(lastOf(dev.sock, 'eventDevStatus')!.status!.settings).toMatchObject({ targetScore: 5, festivalTurn: 4, pauseMaxCount: 0 });
    const settings = await startMatch(hub, dev);
    expect(settings).toMatchObject({ targetScore: 5, festivalTurn: 4, drawTimeSec: 20, pauseMaxCount: 0 });
  });

  it('대기 중 바꾼 규칙은 다음 판부터 적용되고, 범위를 넘는 값은 서버가 잘라 낸다', async () => {
    const { hub } = setupHub();
    const dev = fakeConn('d1');
    hub.devStandby(dev, 'devpw', '김개발');
    expect(lastOf(dev.sock, 'eventDevStatus')!.status!.settings).toMatchObject({ targetScore: BEAT_DEV_SETTINGS.targetScore });
    hub.devSettings(dev, { targetScore: 99999 });
    const clamped = lastOf(dev.sock, 'eventDevStatus')!.status!.settings.targetScore;
    expect(clamped).toBe(SETTINGS_LIMITS.targetScore.max);
    const settings = await startMatch(hub, dev);
    expect(settings.targetScore).toBe(clamped);
  });

  it('다시 대기할 때 규칙을 안 보내면 전에 정한 규칙이 남는다', () => {
    const { hub } = setupHub();
    const dev = fakeConn('d1');
    hub.devStandby(dev, 'devpw', '김개발', undefined, { targetScore: 6 });
    const devId = lastOf(dev.sock, 'eventDevStatus')!.status!.devId;
    const again = fakeConn('d2');
    hub.devStandby(again, 'devpw', '김개발', devId);
    expect(lastOf(again.sock, 'eventDevStatus')!.status!.settings.targetScore).toBe(6);
  });

  it('개발자가 아닌 연결의 규칙 변경은 무시된다', () => {
    const { hub } = setupHub();
    const x = fakeConn('x');
    hub.devSettings(x, { targetScore: 7 });
    expect(x.sock.sent).toHaveLength(0);
  });
});

describe('이벤트 허브 — 운영자', () => {
  it('토큰이 맞을 때만 상태를 준다', async () => {
    const { hub } = setupHub();
    const op = fakeConn('op');
    await hub.admin(op, { type: 'eventAdmin', token: 'nope', action: 'state' });
    expect(lastOf(op.sock, 'error')).toMatchObject({ code: 'EVENT_AUTH' });
    await hub.admin(op, { type: 'eventAdmin', token: 'adminpw', action: 'state' });
    expect(lastOf(op.sock, 'eventAdminState')!.state).toMatchObject({ storage: 'memory' });
  });

  it('토큰이 서버에 설정돼 있지 않으면 기능이 꺼져 있다', async () => {
    const hub = new EventHub(new RoomManager(), new RecordStore({ log: () => {} }), { devToken: null, adminToken: null });
    const op = fakeConn('op');
    hub.devStandby(op, '', '김개발');
    expect(lastOf(op.sock, 'error')).toMatchObject({ code: 'EVENT_AUTH' });
  });
});

describe('이벤트 허브 — 컴퓨터 대전 규칙(행사 전체, 개발자가 정한다)', () => {
  it('대기실에 들어온 개발자만 바꿀 수 있고, 다음 판의 목표 범위·규칙이 그 값을 따른다', async () => {
    const { hub } = setupHub();
    const stranger = fakeConn('x');
    hub.devConfig(stranger, { timeAttack: { targetMin: 30, targetMax: 30, settings: {} }, oneWell: { settings: {} } } as never);
    expect(hub.config().timeAttack.targetMin).toBe(SCORE_RACE_TARGET_MIN); // 무시됐다

    const dev = fakeConn('d');
    hub.devStandby(dev, 'devpw', '김개발');
    hub.devConfig(dev, {
      timeAttack: { targetMin: 15, targetMax: 12, settings: { festivalTurn: 2, pauseMaxCount: 5 } },
      oneWell: { settings: { targetScore: 5, festivalDrawCount: 3 }, multipliers: { rabbit: 4, tiger: 99 } },
    } as never);
    const cfg = lastOf(dev.sock, 'eventDevStatus')!.status!.config;
    expect([cfg.timeAttack.targetMin, cfg.timeAttack.targetMax]).toEqual([12, 15]); // 거꾸로 온 범위는 바꾼다
    expect(cfg.timeAttack.settings).toMatchObject({ festivalTurn: 2, pauseMaxCount: 0, firstTeam: 'A' }); // 일시정지·선공은 고정

    for (let i = 0; i < 20; i++) {
      const a = fakeConn(`a${i}`);
      await hub.challenge(a, 'timeAttack', `목표${i}`, '1234');
      const start = lastOf(a.sock, 'gameStart')!;
      expect(start.state.scoreRace!.target).toBeGreaterThanOrEqual(12);
      expect(start.state.scoreRace!.target).toBeLessThanOrEqual(15);
      expect(start.state.settings.festivalTurn).toBe(2);
      expect(start.state.event?.targetRange).toEqual({ min: 12, max: 15 });
    }
    const w = fakeConn('w');
    await hub.challenge(w, 'oneWell', '우물', '1234');
    const wellStart = lastOf(w.sock, 'gameStart')!.state;
    expect(wellStart.settings).toMatchObject({ targetScore: 5, festivalDrawCount: 3, festivalTurn: 3 });
    // 배율은 판에 실린다 — 한계(1~10)로 잘린다
    expect(wellStart.oneWell?.multipliers).toEqual({ rabbit: 4, tiger: 10 });
  });

  it('한 우물만 파기의 기본 규칙 — 축제 3턴부터, 뽑기는 2턴마다 는다(2026-10-27)', async () => {
    const { hub } = setupHub();
    const w = fakeConn('w');
    await hub.challenge(w, 'oneWell', '우물', '1234');
    const st = lastOf(w.sock, 'gameStart')!.state;
    expect(st.settings).toMatchObject({ festivalTurn: 3, festivalDrawIncreaseInterval: 2, pauseMaxCount: 0 });
    expect(st.oneWell?.multipliers).toEqual({ rabbit: 2, tiger: 3 });
  });
});
