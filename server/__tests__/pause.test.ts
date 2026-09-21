import type { ServerMessage } from 'shared';
import { PAUSE_REQUEST_TIMEOUT_SEC, SPECTATOR } from 'shared';
import { Room } from '../room';

/**
 * 게임 중 메뉴(⏸)의 규칙 — 일시정지 · 항복하기 · 나가기.
 *
 * 전부 방(Room) 단위의 일이라(엔진은 두 팀이 끝까지 두는 경우만 안다) `spectator.test.ts`와
 * 같은 방식으로 가짜 WebSocket을 꽂아 방을 직접 세운다.
 *
 * 게임을 시작하면 방이 실제 턴 타이머를 걸므로 반드시 가짜 타이머를 쓴다 — 그러지 않으면
 * 테스트가 끝나도 30초짜리 타이머가 남아 프로세스를 붙든다.
 */

interface FakeSocket {
  readyState: number;
  sent: ServerMessage[];
  send(data: string): void;
}

function fakeSocket(): FakeSocket {
  const sent: ServerMessage[] = [];
  return {
    readyState: 1, // OPEN
    sent,
    send(data: string) {
      sent.push(JSON.parse(data) as ServerMessage);
    },
  };
}

function lastOf<T extends ServerMessage['type']>(
  ws: FakeSocket,
  type: T,
): Extract<ServerMessage, { type: T }> | undefined {
  for (let i = ws.sent.length - 1; i >= 0; i--) {
    if (ws.sent[i].type === type) return ws.sent[i] as Extract<ServerMessage, { type: T }>;
  }
  return undefined;
}

/** A팀 앨리스 · B팀 밥 · 관전자 한 명이 실제로 게임을 시작한 방. */
function playingRoom() {
  const alice = fakeSocket();
  const bob = fakeSocket();
  const watcher = fakeSocket();
  let emptied = false;
  const room = new Room('TEST', () => { emptied = true; });

  room.addPlayer(alice as never, 'p-alice', '앨리스', 'A', '민트팀', undefined, '핑크팀');
  room.addPlayer(bob as never, 'p-bob', '밥', 'B');
  room.addPlayer(watcher as never, 'p-watch', '구경꾼', SPECTATOR);
  room.setReady('p-bob', true);
  room.startGame('p-alice');

  return { room, alice, bob, watcher, isEmpty: () => emptied };
}

/** 사람 상대가 없는 방(혼자 놀기) — 컴퓨터는 players에 없으므로 물어볼 상대가 없다. */
function soloRoom() {
  const me = fakeSocket();
  const room = new Room('SOLO', () => {});
  room.addSoloPlayer(me as never, 'p-me', '나', '민트팀');
  room.startSoloGame();
  return { room, me };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('일시정지', () => {
  it('상대가 사람이 아니면(혼자 놀기) 묻지 않고 곧바로 멈춘다', () => {
    const { room, me } = soloRoom();
    room.handlePauseRequest('p-me');

    const paused = lastOf(me, 'pauseState')!;
    expect(paused.state.paused).toBe(true);
    expect(paused.state.pausedBy).toEqual({ team: 'A', nickname: '나' });
    // 물어본 적이 없으므로 요청 메시지는 오가지 않는다.
    expect(me.sent.some(m => m.type === 'pauseRequest')).toBe(false);
  });

  it('사람 상대가 있으면 그 상대에게만 물어보고, 답을 기다리는 동안에도 멈춰 있다', () => {
    const { room, alice, bob, watcher } = playingRoom();
    room.handlePauseRequest('p-alice');

    expect(lastOf(bob, 'pauseRequest')).toMatchObject({ fromTeam: 'A', fromNickname: '앨리스' });
    // 요청자 자신과 관전자에게는 묻지 않는다.
    expect(alice.sent.some(m => m.type === 'pauseRequest')).toBe(false);
    expect(watcher.sent.some(m => m.type === 'pauseRequest')).toBe(false);
    // 고르는 20초 동안 판이 흐르면 요청 창에 가린 채 턴이 날아간다 — 먼저 멈춰 둔다.
    expect(lastOf(alice, 'pauseState')!.state.paused).toBe(true);
    expect(lastOf(bob, 'pauseState')!.state.paused).toBe(true);
  });

  it('답을 기다리는 동안에는 요청한 쪽도 풀 수 없다', () => {
    const { room, alice, bob } = playingRoom();
    room.handlePauseRequest('p-alice');
    // "묻는 중"과 "확정된 일시정지"는 화면에서 달리 보여야 한다(버튼이 아직 눌리면 안 된다).
    expect(lastOf(alice, 'pauseState')!.state.pausePendingAnswer).toBe(true);

    room.handleResume('p-alice');
    expect(lastOf(alice, 'error')).toMatchObject({ code: 'PAUSE_UNAVAILABLE' });
    expect(lastOf(alice, 'pauseState')!.state.paused).toBe(true);

    room.handlePauseRespond('p-bob', true);
    expect(lastOf(alice, 'pauseState')!.state.pausePendingAnswer).toBe(false);
    room.handleResume('p-alice');
    expect(lastOf(bob, 'pauseState')!.state.paused).toBe(false);
  });

  it('수락하면 멈춘 채로 남고, 거절하면 그 자리에서 다시 흐른다', () => {
    const declined = playingRoom();
    declined.room.handlePauseRequest('p-alice');
    declined.room.handlePauseRespond('p-bob', false);
    expect(lastOf(declined.alice, 'pauseRequestResult')).toMatchObject({ accepted: false, reason: 'declined' });
    expect(lastOf(declined.alice, 'pauseState')!.state.paused).toBe(false);

    const accepted = playingRoom();
    accepted.room.handlePauseRequest('p-alice');
    accepted.room.handlePauseRespond('p-bob', true);
    expect(lastOf(accepted.alice, 'pauseState')!.state.paused).toBe(true);
    expect(lastOf(accepted.bob, 'pauseState')!.state.paused).toBe(true);
  });

  it('제한시간 안에 답하지 않으면 거절과 같이 처리되고, 그동안 흐른 시간은 깎이지 않는다', () => {
    const { room, alice } = playingRoom();
    const before = lastOf(alice, 'gameStart')!.state.turnRemainingMs;
    room.handlePauseRequest('p-alice');
    jest.advanceTimersByTime(PAUSE_REQUEST_TIMEOUT_SEC * 1000 + 10);

    expect(lastOf(alice, 'pauseRequestResult')).toMatchObject({ accepted: false, reason: 'timeout' });
    const resumed = lastOf(alice, 'pauseState')!.state;
    expect(resumed.paused).toBe(false);
    // 20초를 기다렸지만 남은 시간은 요청 직전 그대로다(오차 50ms).
    expect(resumed.turnRemainingMs).toBeGreaterThanOrEqual(before - 50);
  });

  it('멈춘 동안에는 조작이 거부되고, 턴 타이머도 흐르지 않는다', () => {
    const { room, alice } = playingRoom();
    room.handlePauseRequest('p-alice');
    room.handlePauseRespond('p-bob', true);

    const before = alice.sent.length;
    room.handleDrawCard('p-alice', 'house');
    expect(lastOf(alice, 'error')).toMatchObject({ code: 'PAUSE_UNAVAILABLE' });
    expect(alice.sent.slice(before).some(m => m.type === 'actionResult')).toBe(false);

    // 턴 제한시간을 한참 넘겨도(단, 일시정지 상한 안에서) 시간초과가 일어나지 않는다.
    jest.advanceTimersByTime(2 * 60 * 1000);
    expect(alice.sent.some(m => m.type === 'actionResult')).toBe(false);
  });

  it('팀마다 정해진 횟수까지만 쓸 수 있다', () => {
    const { room, alice } = playingRoom();
    const max = lastOf(alice, 'gameStart')!.state.settings.pauseMaxCount;

    for (let i = 0; i < max; i++) {
      room.handlePauseRequest('p-alice');
      // 거절당해도 횟수는 돌아오지 않는다 — 묻는 20초 동안에도 판은 멈춰 있었다.
      room.handlePauseRespond('p-bob', false);
      expect(lastOf(alice, 'pauseState')!.state.pauseUsed.A).toBe(i + 1);
    }

    room.handlePauseRequest('p-alice');
    expect(lastOf(alice, 'error')).toMatchObject({ code: 'PAUSE_UNAVAILABLE' });
    expect(lastOf(alice, 'pauseState')!.state.paused).toBe(false);
    // 상대 팀 몫은 그대로 남아 있다(팀별 계산이다).
    room.handlePauseRequest('p-bob');
    expect(lastOf(alice, 'pauseState')!.state.pauseUsed.B).toBe(1);
  });

  it('혼자 놀기에는 횟수·시간 제한이 없다', () => {
    const { room, me } = soloRoom();
    const max = lastOf(me, 'gameStart')!.state.settings.pauseMaxCount;

    // 설정값보다 많이 눌러도 계속 멈출 수 있다(기다리게 할 상대가 없다).
    for (let i = 0; i < max + 2; i++) {
      room.handlePauseRequest('p-me');
      expect(lastOf(me, 'pauseState')!.state.paused).toBe(true);
      room.handleResume('p-me');
      expect(lastOf(me, 'pauseState')!.state.paused).toBe(false);
    }
    expect(me.sent.some(m => m.type === 'error')).toBe(false);

    // 상한 시간도 없다 — 한참 두어도 저절로 풀리지 않는다.
    room.handlePauseRequest('p-me');
    const paused = lastOf(me, 'pauseState')!.state;
    expect(paused.pauseUnlimited).toBe(true);
    expect(paused.pauseRemainingMs).toBe(0); // 카운트다운을 그릴 것이 없다
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(lastOf(me, 'pauseState')!.state.paused).toBe(true);
  });

  it('상한 시간이 지나면 서버가 알아서 다시 시작한다', () => {
    const { room, alice, bob } = playingRoom();
    const maxMin = lastOf(alice, 'gameStart')!.state.settings.pauseMaxMin;
    room.handlePauseRequest('p-alice');
    room.handlePauseRespond('p-bob', true);

    const paused = lastOf(alice, 'pauseState')!.state;
    expect(paused.paused).toBe(true);
    // 자동 재개까지 남은 시간도 함께 실려야 화면이 카운트다운을 그릴 수 있다.
    expect(paused.pauseRemainingMs).toBeGreaterThan(maxMin * 60_000 - 1000);

    jest.advanceTimersByTime(maxMin * 60_000 + 10);
    expect(lastOf(bob, 'pauseState')!.state.paused).toBe(false);
  });

  it('멈춘 팀만 다시 시작할 수 있고, 재개하면 남은 시간이 그대로 이어진다', () => {
    const { room, alice, bob } = playingRoom();
    const total = lastOf(alice, 'gameStart')!.state.turnTotalMs;

    jest.advanceTimersByTime(4000);
    room.handlePauseRequest('p-alice');
    room.handlePauseRespond('p-bob', true);
    const pausedState = lastOf(alice, 'pauseState')!.state;
    // 멈춘 순간의 남은 시간과 게이지 폭이 그대로 실려 있어야 화면이 얼어붙지 않는다.
    expect(pausedState.turnTotalMs).toBe(total);
    expect(pausedState.turnRemainingMs).toBeGreaterThan(0);

    // 수락한 쪽(상대 팀)은 풀 수 없다.
    room.handleResume('p-bob');
    expect(lastOf(bob, 'error')).toMatchObject({ code: 'PAUSE_UNAVAILABLE' });
    expect(lastOf(bob, 'pauseState')!.state.paused).toBe(true);

    jest.advanceTimersByTime(30000); // 멈춰 있는 동안 흐른 시간은 제한시간에서 깎이지 않는다
    room.handleResume('p-alice');
    const resumed = lastOf(alice, 'pauseState')!.state;
    expect(resumed.paused).toBe(false);
    expect(resumed.turnTotalMs).toBe(total);
    expect(resumed.turnRemainingMs).toBeGreaterThanOrEqual(pausedState.turnRemainingMs - 50);
  });

  it('멈춘 팀이 모두 끊기면 아무도 풀 수 없으므로 서버가 대신 풀어준다', () => {
    const { room, alice, bob } = playingRoom();
    room.handlePauseRequest('p-alice');
    room.handlePauseRespond('p-bob', true);
    expect(lastOf(bob, 'pauseState')!.state.paused).toBe(true);

    room.handleDisconnect('p-alice', alice as never);
    expect(lastOf(bob, 'pauseState')!.state.paused).toBe(false);
  });

  it('관전자는 일시정지를 걸 수 없다', () => {
    const { room, watcher } = playingRoom();
    room.handlePauseRequest('p-watch');
    expect(lastOf(watcher, 'error')).toMatchObject({ code: 'NOT_YOUR_TURN' });
    expect(watcher.sent.some(m => m.type === 'pauseState')).toBe(false);
  });
});

describe('항복하기 · 나가기', () => {
  it('항복하면 상대 팀 승리로 끝나고, 항복한 팀이 기록에 남는다', () => {
    const { room, alice, bob } = playingRoom();
    room.forfeit('p-alice');

    const result = lastOf(bob, 'actionResult')!;
    expect(result.events).toEqual([{ type: 'gameEnd', winner: 'B', reason: 'forfeit' }]);
    expect(result.state.phase).toBe('ended');
    expect(result.state.winner).toBe('B');
    expect(result.state.forfeitedBy).toBe('A');
    // 항복한 사람은 방에 남아 결과 화면을 본다(나가기와 다른 점은 이것뿐이다).
    expect(alice.sent.some(m => m.type === 'leftRoom')).toBe(false);
  });

  it('나가기는 같은 승패 처리 뒤 방에서까지 빠진다', () => {
    const { room, alice, bob } = playingRoom();
    room.forfeit('p-alice', true);

    expect(lastOf(bob, 'actionResult')!.state.winner).toBe('B');
    expect(lastOf(alice, 'leftRoom')).toBeDefined();
  });

  it('이미 끝난 게임에서 나가면 승패를 다시 건드리지 않는다', () => {
    const { room, alice, bob } = playingRoom();
    room.forfeit('p-alice');            // B팀 승리로 종료
    const endedAt = bob.sent.length;
    room.forfeit('p-alice', true);      // 결과 화면에서 로비로
    expect(bob.sent.slice(endedAt).some(m => m.type === 'actionResult')).toBe(false);
    expect(lastOf(alice, 'leftRoom')).toBeDefined();
  });

  it('관전자가 나가도 승패는 그대로다', () => {
    const { room, bob, watcher } = playingRoom();
    const before = bob.sent.length;
    room.forfeit('p-watch', true);

    expect(bob.sent.slice(before).some(m => m.type === 'actionResult')).toBe(false);
    expect(lastOf(watcher, 'leftRoom')).toBeDefined();
  });

  it('다른 방으로 옮겨가면(detach) 진행 중이던 게임은 나가기와 같이 처리된다', () => {
    const { room, bob } = playingRoom();
    room.detach('p-alice');
    expect(lastOf(bob, 'actionResult')!.state.winner).toBe('B');
  });

  it('혼자 놀기에서 나가면 방이 비어 정리된다', () => {
    const me = fakeSocket();
    let emptied = false;
    const room = new Room('SOLO', () => { emptied = true; });
    room.addSoloPlayer(me as never, 'p-me', '나');
    room.startSoloGame();

    room.forfeit('p-me', true);
    expect(lastOf(me, 'actionResult')!.state.winner).toBe('B'); // 컴퓨터 팀
    expect(emptied).toBe(true);
  });
});
