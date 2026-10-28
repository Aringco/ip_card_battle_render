import type { ClientGameState, ServerMessage } from 'shared';
import { EMOTE_MIN_INTERVAL_MS, INDIVIDUAL_MAX_PLAYERS, PLAYER_COLORS, SPECTATOR } from 'shared';
import { Room } from '../room';

/**
 * 개인전(순위전) 방 규칙 — INDIVIDUAL_MODE_ROADMAP.md 부록 C의 R1~R9.
 * 가짜 WebSocket으로 로비 명령과 게임 메시지를 넣고 브로드캐스트를 읽는다(spectator.test.ts와 같은 방식).
 * 게임을 시작하면 방이 실제 턴 타이머를 걸므로 가짜 타이머가 필수다.
 */

interface FakeSocket {
  readyState: number;
  sent: ServerMessage[];
  send(data: string): void;
}

function fakeSocket(): FakeSocket {
  const sent: ServerMessage[] = [];
  return {
    readyState: 1,
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

function allOf<T extends ServerMessage['type']>(ws: FakeSocket, type: T): Extract<ServerMessage, { type: T }>[] {
  return ws.sent.filter((m): m is Extract<ServerMessage, { type: T }> => m.type === type);
}

interface Seat {
  id: string;
  ws: FakeSocket;
}

/** 방장 1명 + (n-1)명이 들어와 있는 개인전 대기실. 참가자는 참가 화면처럼 'A'로 들어온다. */
function setupRoom(n: number) {
  const room = new Room('TEST', () => {});
  const seats: Seat[] = [];
  const host: Seat = { id: 'p-1', ws: fakeSocket() };
  room.addPlayer(host.ws as never, host.id, '플레이어1', 'player', undefined, undefined, undefined, 'individual');
  seats.push(host);
  for (let i = 2; i <= n; i++) {
    const s: Seat = { id: `p-${i}`, ws: fakeSocket() };
    room.addPlayer(s.ws as never, s.id, `플레이어${i}`, 'A');
    seats.push(s);
  }
  return { room, seats, host };
}

/** 전원 준비 후 방장이 시작. */
function startGame(room: Room, seats: Seat[]) {
  for (const s of seats.slice(1)) room.setReady(s.id, true);
  room.startGame(seats[0].id);
}

function gameState(seat: Seat): ClientGameState {
  return lastOf(seat.ws, 'gameStart')!.state;
}

/** 지금 차례인 사람(Seat). */
function activeSeat(seats: Seat[], state: ClientGameState): Seat {
  const id = state.memberIds[state.activeTeam][0];
  return seats.find(s => s.id === id)!;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('개인전 대기실 (R1~R5)', () => {
  it('lobbyState가 방의 종류를 알려준다', () => {
    const { host } = setupRoom(2);
    expect(lastOf(host.ws, 'lobbyState')!.mode).toBe('individual');
  });

  it('R1 8명이 차면 9번째는(team A로 보내도) 관전석으로 들어가고 안내줄이 남는다', () => {
    const { room, host } = setupRoom(INDIVIDUAL_MAX_PLAYERS);
    const ninth = fakeSocket();
    expect(room.addPlayer(ninth as never, 'p-9', '아홉째', 'A')).toBe('ok');

    const players = lastOf(host.ws, 'lobbyState')!.players;
    expect(players.find(p => p.nickname === '아홉째')).toMatchObject({ team: SPECTATOR, ready: true });
    expect(players.filter(p => p.team === 'player')).toHaveLength(INDIVIDUAL_MAX_PLAYERS);
    const notices = allOf(host.ws, 'chatMessage').filter(m => m.message.kind === 'system');
    expect(notices.some(m => m.message.text.includes('가득'))).toBe(true);
  });

  it('R1b 참가 화면이 team B로 보내도 플레이어석으로 받는다', () => {
    const { room, host } = setupRoom(1);
    room.addPlayer(fakeSocket() as never, 'p-b', '비', 'B');
    const players = lastOf(host.ws, 'lobbyState')!.players;
    expect(players.find(p => p.nickname === '비')!.team).toBe('player');
  });

  it('R2 입장하면 서로 다른 색이 자동으로 배정된다', () => {
    const { host } = setupRoom(8);
    const players = lastOf(host.ws, 'lobbyState')!.players;
    const colors = players.map(p => p.color);
    expect(colors.every(c => c !== undefined)).toBe(true);
    expect(new Set(colors).size).toBe(8);
  });

  it('관전자에게는 색이 없다', () => {
    const { room, host } = setupRoom(2);
    room.addPlayer(fakeSocket() as never, 'p-w', '구경꾼', SPECTATOR);
    const w = lastOf(host.ws, 'lobbyState')!.players.find(p => p.nickname === '구경꾼')!;
    expect(w.color).toBeUndefined();
  });

  it('R3 남이 쓰는 색을 고르면 COLOR_TAKEN, 내 색은 그대로다', () => {
    const { room, seats } = setupRoom(2);
    const players = lastOf(seats[0].ws, 'lobbyState')!.players;
    const mine = players.find(p => p.nickname === '플레이어2')!.color;
    const theirs = players.find(p => p.nickname === '플레이어1')!.color!;

    room.selectColor('p-2', theirs);
    expect(lastOf(seats[1].ws, 'error')!.code).toBe('COLOR_TAKEN');
    const after = lastOf(seats[0].ws, 'lobbyState')!.players.find(p => p.nickname === '플레이어2')!.color;
    expect(after).toBe(mine);
  });

  it('비어 있는 색은 고를 수 있다', () => {
    const { room, seats } = setupRoom(2);
    const used = new Set(lastOf(seats[0].ws, 'lobbyState')!.players.map(p => p.color));
    const free = PLAYER_COLORS.find(c => !used.has(c.id))!.id;
    room.selectColor('p-2', free);
    expect(lastOf(seats[0].ws, 'lobbyState')!.players.find(p => p.nickname === '플레이어2')!.color).toBe(free);
  });

  it('R4 색을 쓰던 사람이 나가면 그 색을 다른 사람이 고를 수 있다', () => {
    const { room, seats } = setupRoom(3);
    const leaverColor = lastOf(seats[0].ws, 'lobbyState')!.players.find(p => p.nickname === '플레이어3')!.color!;
    room.leaveRoom('p-3');
    room.selectColor('p-2', leaverColor);
    expect(lastOf(seats[0].ws, 'error')).toBeUndefined();
    expect(lastOf(seats[0].ws, 'lobbyState')!.players.find(p => p.nickname === '플레이어2')!.color).toBe(leaverColor);
  });

  it('플레이어석 → 관전석으로 가면 색을 돌려놓고, 되돌아오면 비어 있는 색을 받는다', () => {
    const { room, host } = setupRoom(2);
    const lobby = () => lastOf(host.ws, 'lobbyState')!.players.find(p => p.nickname === '플레이어2')!;
    room.movePlayer('p-1', lobby().memberId, SPECTATOR);
    expect(lobby().color).toBeUndefined();
    room.movePlayer('p-1', lobby().memberId, 'player');
    expect(lobby().color).toBeDefined();
  });

  it('플레이어석이 가득 차면 관전자를 플레이어석으로 옮길 수 없다', () => {
    const { room, host } = setupRoom(INDIVIDUAL_MAX_PLAYERS);
    room.addPlayer(fakeSocket() as never, 'p-w', '구경꾼', SPECTATOR);
    const w = lastOf(host.ws, 'lobbyState')!.players.find(p => p.nickname === '구경꾼')!;
    room.movePlayer('p-1', w.memberId, 'player');
    expect(lastOf(host.ws, 'error')!.code).toBe('ROOM_FULL');
    expect(lastOf(host.ws, 'lobbyState')!.players.find(p => p.nickname === '구경꾼')!.team).toBe(SPECTATOR);
  });

  it('R5 플레이어가 1명뿐이면 시작할 수 없다(관전자는 세지 않는다)', () => {
    const { room, host } = setupRoom(1);
    room.addPlayer(fakeSocket() as never, 'p-w', '구경꾼', SPECTATOR);
    room.startGame('p-1');
    expect(lastOf(host.ws, 'error')!.code).toBe('CANNOT_START');
    expect(lastOf(host.ws, 'gameStart')).toBeUndefined();
  });

  it('준비하지 않은 사람이 있으면 시작할 수 없다', () => {
    const { room, host } = setupRoom(3);
    room.setReady('p-2', true);
    room.startGame('p-1');
    expect(lastOf(host.ws, 'error')!.code).toBe('CANNOT_START');
  });

  it('개인전에서는 팀 이름을 바꿀 수 없다', () => {
    const { room, host } = setupRoom(2);
    room.setTeamName('p-1', 'A', '새이름');
    expect(lastOf(host.ws, 'lobbyState')!.teamNames).toEqual({ A: null, B: null });
  });
});

describe('개인전 게임 시작', () => {
  it('p1…pN 편이 만들어지고 이름 자리에는 닉네임이 실린다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    const state = gameState(seats[0]);
    expect(state.mode).toBe('individual');
    expect(Object.keys(state.teams).sort()).toEqual(['p1', 'p2', 'p3']);
    expect(state.teamNames).toEqual({ p1: '플레이어1', p2: '플레이어2', p3: '플레이어3' });
    expect(state.memberIds).toEqual({ p1: ['p-1'], p2: ['p-2'], p3: ['p-3'] });
    expect(state.pauseUsed).toEqual({ p1: 0, p2: 0, p3: 0 });
    expect(state.teams.p1.color).toBeDefined();
    // 관전자를 포함해 모두에게 같은 게임 화면이 간다
    for (const s of seats) expect(lastOf(s.ws, 'gameStart')).toBeDefined();
  });

  it('차례가 아닌 사람의 조작은 거부된다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    const state = gameState(seats[0]);
    const other = seats.find(s => s !== activeSeat(seats, state))!;
    room.handleDrawCard(other.id, 'house');
    expect(lastOf(other.ws, 'error')!.code).toBe('NOT_YOUR_TURN');
  });

  it('차례인 사람이 장소를 누르면 모두에게 actionResult가 간다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    const active = activeSeat(seats, gameState(seats[0]));
    room.handleDrawCard(active.id, 'house');
    for (const s of seats) {
      const res = lastOf(s.ws, 'actionResult')!;
      expect(res.events.some(e => e.type === 'draw')).toBe(true);
      expect(res.state.pendingChoice).toBe(gameState(seats[0]).activeTeam);
    }
  });

  it('장소를 고르다 시간이 다 되면 서버가 무작위 장소를 대신 고른다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    jest.advanceTimersByTime(31_000); // 장소 제한시간(30초) + 연출 여유 직후, 다음 시간초과 전
    const res = lastOf(seats[0].ws, 'actionResult')!;
    expect(res.events.some(e => e.type === 'timeout')).toBe(true);
  });

  it('기술을 고르다 시간이 다 되면 기술 없이 차례가 끝난다 (서버가 대신 고르지 않는다)', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    const first = gameState(seats[0]).activeTeam;
    const active = activeSeat(seats, gameState(seats[0]));
    room.handleDrawCard(active.id, 'house');
    // 기술을 쓸 수 있도록 만들어 두고(=자동 선택이 있었다면 골랐을 상황) 시간을 흘린다
    (room as unknown as { state: { teams: Record<string, { exp: { rabbit: number } }> } }).state.teams[first].exp.rabbit = 10;
    jest.advanceTimersByTime(60_000);
    const res = lastOf(seats[0].ws, 'actionResult')!;
    expect(res.events.some(e => e.type === 'skillApplied')).toBe(false);
    expect(res.events.some(e => e.type === 'timeoutChoice')).toBe(true);
    expect(res.state.activeTeam).not.toBe(first);
    expect(res.state.teams[first].exp.rabbit).toBe(10);
  });
});

describe('특허랑이의 대상 (R9)', () => {
  function toTigerTurn(n: number) {
    const { room, seats } = setupRoom(n);
    startGame(room, seats);
    const state = gameState(seats[0]);
    const side = state.activeTeam;
    const active = activeSeat(seats, state);
    // 장소를 눌러 기술 선택 대기로 만든 뒤 호랑이 레벨을 쥐여 준다
    room.handleDrawCard(active.id, 'house');
    const live = (room as unknown as { state: ClientGameState }).state;
    live.teams[side].exp.tiger = 20;
    const foe = state.turnOrder.find(t => t !== side)!;
    return { room, seats, side, active, foe };
  }

  it('R9 대상을 실어 보내면 엔진에 전달되고 이벤트가 그 대상을 가리킨다', () => {
    const { room, seats, active, foe } = toTigerTurn(3);
    room.handleChooseSkill(active.id, 'tiger', foe);
    const res = lastOf(seats[0].ws, 'actionResult')!;
    const ev = res.events.find(e => e.type === 'skillApplied');
    expect(ev).toMatchObject({ animal: 'tiger', target: foe, oppHpDelta: -1 });
  });

  it('대상이 없거나 잘못되면 에러만 돌려주고 아무에게도 갱신을 보내지 않는다', () => {
    const { room, seats, side, active } = toTigerTurn(3);
    const before = allOf(seats[1].ws, 'actionResult').length;
    room.handleChooseSkill(active.id, 'tiger'); // 대상 없음
    room.handleChooseSkill(active.id, 'tiger', side); // 자기 자신
    room.handleChooseSkill(active.id, 'tiger', 'p99'); // 없는 편
    expect(allOf(active.ws, 'error').filter(e => e.code === 'CARD_NOT_AVAILABLE')).toHaveLength(3);
    expect(allOf(seats[1].ws, 'actionResult')).toHaveLength(before);
  });
});

describe('항복·나가기 (R6·R7)', () => {
  it('R6 3명 중 한 명이 항복하면 그 사람이 3위가 되고 판은 계속된다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    room.forfeit('p-2');
    const res = lastOf(seats[0].ws, 'actionResult')!;
    expect(res.events.find(e => e.type === 'ranked')).toMatchObject({ team: 'p2', rank: 3, reason: 'forfeit' });
    expect(res.state.phase).toBe('playing');
    expect(res.state.teams.p2.finish).toEqual({ rank: 3, reason: 'forfeit' });
  });

  it('R7 두 명이 항복하면 남은 한 명이 1위가 되고 판이 끝난다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    room.forfeit('p-2');
    room.forfeit('p-3');
    const res = lastOf(seats[0].ws, 'actionResult')!;
    expect(res.state.phase).toBe('ended');
    expect(res.state.ranks).toEqual({ p1: 1, p2: 3, p3: 2 });
    expect(res.events.find(e => e.type === 'gameEnd')).toMatchObject({ winner: 'p1', reason: 'ranked' });
  });

  it('지금 차례인 사람이 항복하면 다음 사람에게 넘어간다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    const state = gameState(seats[0]);
    const active = activeSeat(seats, state);
    room.forfeit(active.id);
    const res = lastOf(seats[0].ws, 'actionResult')!;
    expect(res.state.activeTeam).not.toBe(state.activeTeam);
    expect(res.state.phase).toBe('playing');
  });

  it('나가기: 연결이 방에서 빠져도 순위표의 자리(memberIds)는 남는다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    room.forfeit('p-2', true);
    const res = lastOf(seats[0].ws, 'actionResult')!;
    expect(res.state.memberIds.p2).toEqual(['p-2']);
    expect(res.state.teamNames.p2).toBe('플레이어2');
    expect(lastOf(seats[1].ws, 'leftRoom')).toBeDefined();
  });

  it('관전자의 나가기는 판에 영향이 없다', () => {
    const { room, seats } = setupRoom(3);
    room.addPlayer(fakeSocket() as never, 'p-w', '구경꾼', SPECTATOR);
    startGame(room, seats);
    const before = allOf(seats[0].ws, 'actionResult').length;
    room.forfeit('p-w', true);
    expect(allOf(seats[0].ws, 'actionResult')).toHaveLength(before);
  });

  it('detach(다른 방으로 옮겨감)는 나가기와 같이 패배로 처리된다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    room.detach('p-3');
    const res = lastOf(seats[0].ws, 'actionResult')!;
    expect(res.state.teams.p3.finish).toEqual({ rank: 3, reason: 'forfeit' });
  });
});

describe('일시정지 (R8)', () => {
  it('R8 아무에게도 묻지 않고 곧바로 멈춘다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    room.handlePauseRequest('p-2');
    for (const s of seats) {
      expect(lastOf(s.ws, 'pauseRequest')).toBeUndefined();
    }
    const paused = lastOf(seats[0].ws, 'pauseState')!.state;
    expect(paused.paused).toBe(true);
    expect(paused.pausedBy).toEqual({ team: 'p2', nickname: '플레이어2' });
    expect(paused.pausePendingAnswer).toBe(false);
    expect(paused.pauseUsed.p2).toBe(1);
  });

  it('멈춘 사람만 다시 시작할 수 있다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    room.handlePauseRequest('p-2');
    room.handleResume('p-3');
    expect(lastOf(seats[2].ws, 'error')!.code).toBe('PAUSE_UNAVAILABLE');
    expect(lastOf(seats[0].ws, 'pauseState')!.state.paused).toBe(true);
    room.handleResume('p-2');
    expect(lastOf(seats[0].ws, 'pauseState')!.state.paused).toBe(false);
  });

  it('횟수는 사람마다 따로 센다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    const max = gameState(seats[0]).settings.pauseMaxCount;
    for (let i = 0; i < max; i++) {
      room.handlePauseRequest('p-2');
      room.handleResume('p-2');
    }
    room.handlePauseRequest('p-2');
    expect(lastOf(seats[1].ws, 'error')!.code).toBe('PAUSE_UNAVAILABLE');
    // 다른 사람은 아직 쓸 수 있다
    room.handlePauseRequest('p-3');
    expect(lastOf(seats[0].ws, 'pauseState')!.state.pausedBy).toMatchObject({ team: 'p3' });
  });

  it('멈춰 있는 동안에는 조작이 거부된다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    const active = activeSeat(seats, gameState(seats[0]));
    room.handlePauseRequest('p-2');
    room.handleDrawCard(active.id, 'house');
    expect(lastOf(active.ws, 'error')!.code).toBe('PAUSE_UNAVAILABLE');
  });

  it('멈춰 둔 사람이 항복하면 일시정지가 풀린다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    room.handlePauseRequest('p-2');
    room.forfeit('p-2');
    expect(lastOf(seats[0].ws, 'pauseState')!.state.paused).toBe(false);
  });

  it('순위가 정해진 사람은 일시정지를 쓸 수 없다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    room.forfeit('p-2');
    room.handlePauseRequest('p-2');
    expect(lastOf(seats[1].ws, 'error')!.code).toBe('PAUSE_UNAVAILABLE');
  });
});

describe('팀전 방은 그대로 (R10)', () => {
  it('팀전 방에 player 자리로 들어오면 A팀으로 받는다', () => {
    const room = new Room('TEST', () => {});
    const host = fakeSocket();
    room.addPlayer(host as never, 'p-h', '방장', 'A', '가팀', undefined, '나팀');
    room.addPlayer(fakeSocket() as never, 'p-x', '엑스', 'player');
    const lobby = lastOf(host, 'lobbyState')!;
    expect(lobby.mode).toBe('team');
    expect(lobby.players.find(p => p.nickname === '엑스')!.team).toBe('A');
    expect(lobby.teamNames).toEqual({ A: '가팀', B: '나팀' });
  });

  it('팀전 방에서는 색 고르기가 무시된다', () => {
    const room = new Room('TEST', () => {});
    const host = fakeSocket();
    room.addPlayer(host as never, 'p-h', '방장', 'A');
    room.selectColor('p-h', 'red');
    expect(lastOf(host, 'error')).toBeUndefined();
    expect(lastOf(host, 'lobbyState')!.players[0].color).toBeUndefined();
  });
});

describe('대기실 채팅의 닉네임 색', () => {
  it('개인전 플레이어석의 말에는 그 순간 고른 색이 실린다', () => {
    const { room, seats } = setupRoom(2);
    room.selectColor(seats[1].id, 'pink');
    room.handleChat(seats[1].id, '안녕');
    const line = lastOf(seats[0].ws, 'chatMessage')!.message;
    expect(line.kind).toBe('chat');
    expect(line.color).toBe('pink');
  });

  it('관전자의 말에는 색이 없다', () => {
    const { room, seats } = setupRoom(2);
    const spec = { id: 'p-s', ws: fakeSocket() };
    room.addPlayer(spec.ws as never, spec.id, '구경꾼', SPECTATOR);
    room.handleChat(spec.id, '구경 중');
    expect(lastOf(seats[0].ws, 'chatMessage')!.message.color).toBeUndefined();
  });
});

describe('감정표현', () => {
  it('판에 앉은 사람이 보내면 보낸 사람의 편과 함께 방 전체에 간다', () => {
    const { room, seats } = setupRoom(3);
    startGame(room, seats);
    const state = gameState(seats[0]);
    const sender = seats[1];
    const side = Object.keys(state.memberIds).find(s => state.memberIds[s].includes(sender.id))!;
    room.handleEmote(sender.id, 'hands/wave');
    for (const s of seats) expect(lastOf(s.ws, 'emote')).toEqual({ type: 'emote', side, emoteId: 'hands/wave' });
  });

  it('목록에 없는 그림·너무 잦은 전송은 조용히 버린다', () => {
    const { room, seats } = setupRoom(2);
    startGame(room, seats);
    room.handleEmote(seats[0].id, 'nope/../../etc');
    expect(allOf(seats[1].ws, 'emote')).toHaveLength(0);
    expect(lastOf(seats[0].ws, 'error')).toBeUndefined();

    room.handleEmote(seats[0].id, 'sp/thumbs_up');
    room.handleEmote(seats[0].id, 'sp/thumbs_down'); // 곧바로 또
    expect(allOf(seats[1].ws, 'emote')).toHaveLength(1);
    jest.advanceTimersByTime(EMOTE_MIN_INTERVAL_MS);
    room.handleEmote(seats[0].id, 'default/tiger_happy');
    expect(allOf(seats[1].ws, 'emote')).toHaveLength(2);
  });

  it('관전자·게임 시작 전에는 보낼 수 없다', () => {
    const { room, seats } = setupRoom(2);
    room.handleEmote(seats[0].id, 'hands/wave'); // 대기실
    const spec = { id: 'p-s', ws: fakeSocket() };
    room.addPlayer(spec.ws as never, spec.id, '구경꾼', SPECTATOR);
    startGame(room, seats);
    room.handleEmote(spec.id, 'hands/wave');
    expect(allOf(seats[0].ws, 'emote')).toHaveLength(0);
  });
});
