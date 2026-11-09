import type { ServerMessage } from 'shared';
import { LOBBY_RECONNECT_GRACE_MS, Room } from '../room';

/**
 * 대기실에서 연결이 끊긴 사람은 곧바로 빠지지 않는다(2026-11-06) — 폰에서 카카오톡으로 초대 링크를 보내고 돌아오는 사이
 * 브라우저가 연결을 끊어도, LOBBY_RECONNECT_GRACE_MS 안에 돌아오면 같은 자리로 복귀한다. 그보다 늦으면 예전처럼 나간 것으로 처리한다.
 */
function fakeSocket() {
  const sent: ServerMessage[] = [];
  return { readyState: 1, sent, send(data: string) { sent.push(JSON.parse(data) as ServerMessage); } };
}
const lobbyNames = (ws: ReturnType<typeof fakeSocket>) => {
  const last = [...ws.sent].reverse().find(m => m.type === 'lobbyState') as Extract<ServerMessage, { type: 'lobbyState' }>;
  return last.players.map(p => `${p.nickname}:${p.connected ? 'on' : 'off'}`);
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

it('끊긴 동안은 자리를 붙들고("연결 끊김"), 시간 안에 돌아오면 그대로 복귀한다', () => {
  const host = fakeSocket();
  const alice = fakeSocket();
  const room = new Room('TEST', () => {});
  room.addPlayer(host as never, 'p-host', '방장', 'A');
  room.addPlayer(alice as never, 'p-alice', '앨리스', 'B');

  room.handleDisconnect('p-host', host as never);
  expect(lobbyNames(alice)).toEqual(['방장:off', '앨리스:on']);

  jest.advanceTimersByTime(LOBBY_RECONNECT_GRACE_MS - 1000);
  const back = fakeSocket();
  expect(room.handleReconnect(back as never, 'p-host')).toBe(true);
  expect(back.sent.some(m => m.type === 'roomJoined')).toBe(true);
  jest.advanceTimersByTime(5000);
  expect(lobbyNames(alice)).toEqual(['방장:on', '앨리스:on']);
});

it('시간이 다 되도록 안 돌아오면 나간 것으로 처리한다', () => {
  const host = fakeSocket();
  const alice = fakeSocket();
  const room = new Room('TEST', () => {});
  room.addPlayer(host as never, 'p-host', '방장', 'A');
  room.addPlayer(alice as never, 'p-alice', '앨리스', 'B');

  room.handleDisconnect('p-alice', alice as never);
  jest.advanceTimersByTime(LOBBY_RECONNECT_GRACE_MS + 10);
  expect(lobbyNames(host)).toEqual(['방장:on']);
  expect(room.handleReconnect(fakeSocket() as never, 'p-alice')).toBe(false);
});
