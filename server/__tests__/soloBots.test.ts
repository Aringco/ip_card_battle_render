import type { ClientGameState, LobbyPlayer, ServerMessage } from 'shared';
import { ENHANCE_SETTINGS, INDIVIDUAL_MAX_PLAYERS } from 'shared';
import { Room, SOLO_ABANDON_MS } from '../room';

/**
 * 혼자 놀기 대기실 · 봇(2026-11-24, docs/AI_ROADMAP.md §3-2) — 혼자 놀기는 개인전 방에 나 혼자 + 봇으로 대기실을 열고,
 * 방장인 내가 봇을 넣고 빼며 난이도를 고른다. 일시정지는 무제한이고 [게임 계속하기] 말고는 풀리지 않는다(끊겨도).
 * 가짜 WebSocket · 가짜 타이머(spectator.test.ts와 같은 방식).
 */

interface FakeSocket { readyState: number; sent: ServerMessage[]; send(data: string): void }
function fakeSocket(): FakeSocket {
  const sent: ServerMessage[] = [];
  return { readyState: 1, sent, send(data: string) { sent.push(JSON.parse(data) as ServerMessage); } };
}
function lastOf<T extends ServerMessage['type']>(ws: FakeSocket, type: T): Extract<ServerMessage, { type: T }> | undefined {
  for (let i = ws.sent.length - 1; i >= 0; i--) if (ws.sent[i].type === type) return ws.sent[i] as Extract<ServerMessage, { type: T }>;
  return undefined;
}
function lobby(ws: FakeSocket): LobbyPlayer[] { return lastOf(ws, 'lobbyState')!.players; }
function lastState(ws: FakeSocket): ClientGameState {
  for (let i = ws.sent.length - 1; i >= 0; i--) {
    const m = ws.sent[i];
    if (m.type === 'actionResult' || m.type === 'gameStart' || m.type === 'pauseState' || m.type === 'gameSnapshot') return m.state;
  }
  throw new Error('상태 없음');
}

function soloLobby(enhance = false) {
  const ws = fakeSocket();
  let emptied = false;
  const room = new Room('SOLO', () => { emptied = true; });
  const instant = room.addSoloLobbyPlayer(ws as never, 'me', '나', undefined, enhance ? ENHANCE_SETTINGS : undefined, enhance);
  return { ws, room, instant, emptied: () => emptied };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

describe('혼자 놀기 대기실', () => {
  it('곧바로 시작하지 않고 대기실을 연다 — 나 + 봇 하나(보통), 혼자 놀기 표시', () => {
    const { ws, instant } = soloLobby();
    expect(instant).toBe(false);
    expect(lastOf(ws, 'gameStart')).toBeUndefined();
    const ls = lastOf(ws, 'lobbyState')!;
    expect(ls.solo).toBe(true);
    expect(ls.mode).toBe('individual');
    expect(ls.players).toHaveLength(2);
    expect(ls.players[1]).toMatchObject({ bot: 'normal', ready: true, connected: true, team: 'player' });
    expect(ls.players[1].color).not.toBe(ls.players[0].color);
  });

  it('봇 넣기 · 난이도 바꾸기 · 빼기(내보내기 버튼) — 8자리까지', () => {
    const { ws, room } = soloLobby();
    room.addBot('me', 'hard');
    expect(lobby(ws).filter(p => p.bot)).toHaveLength(2);
    const hard = lobby(ws).find(p => p.bot === 'hard')!;
    room.setBotLevel('me', hard.memberId, 'easy');
    expect(lobby(ws).find(p => p.memberId === hard.memberId)!.bot).toBe('easy');
    room.kickPlayer('me', hard.memberId);
    expect(lobby(ws).some(p => p.memberId === hard.memberId)).toBe(false);
    for (let i = 0; i < 10; i++) room.addBot('me');
    expect(lobby(ws)).toHaveLength(INDIVIDUAL_MAX_PLAYERS);
    expect(lastOf(ws, 'error')!.code).toBe('ROOM_FULL');
    // 이름 · 색이 겹치지 않는다
    expect(new Set(lobby(ws).map(p => p.nickname)).size).toBe(INDIVIDUAL_MAX_PLAYERS);
    expect(new Set(lobby(ws).map(p => p.color)).size).toBe(INDIVIDUAL_MAX_PLAYERS);
  });

  it('다른 사람은 들어올 수 없다', () => {
    const { room } = soloLobby();
    expect(room.addPlayer(fakeSocket() as never, 'other', '친구', 'player')).toBe('solo_room');
  });

  it('봇만 남기고 다 빼면 시작할 수 없다', () => {
    const { ws, room } = soloLobby();
    room.kickPlayer('me', lobby(ws).find(p => p.bot)!.memberId);
    room.startGame('me');
    expect(lastOf(ws, 'error')!.code).toBe('CANNOT_START');
  });

  it.each([false, true])('시작하면 봇들이 스스로 두고 판이 끝까지 간다(강화 %s)', enhance => {
    const { ws, room } = soloLobby(enhance);
    room.addBot('me', 'easy');
    room.addBot('me', 'normal');
    room.startGame('me');
    expect(lastOf(ws, 'gameStart')).toBeDefined();
    // 사람은 시간초과로만 둔다(자리를 비운 사람) — 그래도 봇이 두며 판이 흐른다
    for (let i = 0; i < 4000 && lastState(ws).phase === 'playing'; i++) jest.advanceTimersByTime(5_000);
    const s = lastState(ws);
    expect(s.phase).toBe('ended');
    // 빈 actionResult(화면이 "재접속"으로 읽는다)를 보내지 않았다
    expect(ws.sent.filter(m => m.type === 'actionResult' && m.events.length === 0)).toHaveLength(0);
  });
});

describe('혼자 놀기 일시정지', () => {
  function started() {
    const r = soloLobby();
    r.room.startGame('me');
    return r;
  }

  it('무제한 — 횟수 · 시간 제한이 없다', () => {
    const { ws, room } = started();
    for (let i = 0; i < 6; i++) {
      room.handlePauseRequest('me');
      expect(lastState(ws).paused).toBe(true);
      jest.advanceTimersByTime(60 * 60_000); // 한 시간 멈춰 둬도 저절로 풀리지 않는다
      expect(lastState(ws).paused).toBe(true);
      room.handleResume('me');
      expect(lastState(ws).paused).toBe(false);
    }
    expect(lastState(ws).pauseUnlimited).toBe(true);
  });

  it('멈춘 채 연결이 끊겨도 풀리지 않고, 돌아오면 그대로 멈춰 있다', () => {
    const { ws, room } = started();
    room.handlePauseRequest('me');
    const turn = lastState(ws).turn;
    room.handleDisconnect('me', ws as never);
    jest.advanceTimersByTime(10 * 60_000);
    const ws2 = fakeSocket();
    expect(room.handleReconnect(ws2 as never, 'me')).toBe(true);
    const s = lastState(ws2);
    expect(s.paused).toBe(true);
    expect(s.turn).toBe(turn);
    room.handleResume('me');
    expect(lastState(ws2).paused).toBe(false);
  });

  it('멈춘 채 끝내 돌아오지 않으면 방을 정리한다', () => {
    const { ws, room, emptied } = started();
    room.handlePauseRequest('me');
    room.handleDisconnect('me', ws as never);
    jest.advanceTimersByTime(SOLO_ABANDON_MS + 1000);
    expect(emptied()).toBe(true);
  });
});
