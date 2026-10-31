import { initIndividualGame } from '../engine/turnManager';
import { processPass, processPlayerAction, processSkillChoice } from '../engine/gameEngine';
import { ENHANCE_SETTINGS, ENHANCE_TARGET_SCORE_MAX, PLAYER_COLORS, THRESHOLDS, maxTurnOf, needsTarget } from 'shared';
import type { Animal, GameEvent, GameState, ServerMessage, SideId } from 'shared';
import { Room } from '../room';

// 개인전 '강화' 방(2026-10-30) — 혼자 놀기 카드 강화의 규칙을 개인전 엔진에 얹은 판.
// 패턴은 individual.test.ts · enhance.test.ts와 같다(결정론적 RNG, 시작 공유 카드 걷기, 레벨을 직접 세팅).

const rng0 = () => 0;

function make(n: number, overrides: Partial<typeof ENHANCE_SETTINGS> = {}): GameState {
  const players = Array.from({ length: n }, (_, i) => ({ side: `p${i + 1}`, nickname: `플레이어${i + 1}`, color: PLAYER_COLORS[i].id }));
  const state = initIndividualGame(players, rng0, { ...ENHANCE_SETTINGS, targetScore: 100, ...overrides }, true);
  state.stacks = { sheep: [], rabbit: [], mermaid: [], tiger: [] };
  return state;
}

function setLevel(state: GameState, side: SideId, animal: Animal, level: number): void {
  state.teams[side].exp[animal] = THRESHOLDS[animal] * (level - 1);
}

function toChoice(state: GameState): SideId {
  state.pendingChoice = state.activeTeam;
  return state.activeTeam;
}

const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe('개인전 강화 — 시작', () => {
  it('모든 편이 강화 상태(쿨타임 0 · 나눗셈 1 · 지속 효과 없음)로 시작하고, 턴 제한이 없다', () => {
    const s = make(4);
    expect(s.mode).toBe('individual');
    expect(Object.keys(s.enhance!.cooldowns).sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(s.enhance!.divisors.p3).toBe(1);
    expect(s.enhance!.bleed.p4).toEqual({ turns: 0, amount: 0 });
    expect(maxTurnOf(s)).toBe(Infinity);
    for (const side of s.turnOrder) expect(s.teams[side].hp).toBe(100);
  });

  it('목표 점수 상한은 강화 판의 것(2500)이다', () => {
    expect(make(3, { targetScore: 2500 }).settings.targetScore).toBe(ENHANCE_TARGET_SCORE_MAX);
  });

  it('한 차례 기술 장수 — 4명은 1장부터, 5명 이상은 처음부터 2장(15턴마다 늘어나는 것과 큰 쪽)', () => {
    expect(make(4).skillsPerTurn).toBe(1);
    expect(make(5).skillsPerTurn).toBe(2);
  });
});

describe('개인전 강화 — 대상', () => {
  it('디자인어는 Lv.6부터 대상을 골라야 한다 — 대상 없이 보내면 무시된다', () => {
    const s = make(3);
    expect(needsTarget(s, 'mermaid', 5)).toBe(false);
    expect(needsTarget(s, 'mermaid', 6)).toBe(true);
    expect(needsTarget({ mode: 'team', enhance: s.enhance }, 'mermaid', 11)).toBe(false);

    const me = toChoice(s);
    setLevel(s, me, 'mermaid', 9); // 상대 배율 ÷3
    const [foe, other] = s.turnOrder.filter(x => x !== me);
    s.teams[foe].pendingMultiplier = 6;
    s.teams[other].pendingMultiplier = 6;
    expect(processSkillChoice(s, 'mermaid').events).toEqual([]);

    const ev = processSkillChoice(s, 'mermaid', foe).events[0];
    expect(ev).toMatchObject({ type: 'skillApplied', target: foe, oppMultiplierCut: 4 });
    expect(ev).not.toHaveProperty('oppDivisor'); // 효과 감소(÷N)는 Lv.Max만
    expect(s.teams[foe].pendingMultiplier).toBe(2);
    expect(s.enhance!.divisors[foe]).toBe(1);
    // 고르지 않은 사람에게는 아무 일도 없다
    expect(s.teams[other].pendingMultiplier).toBe(6);
  });

  it('특허랑이의 출혈은 고른 사람에게만 걸리고, 그 사람의 차례가 끝날 때 든다', () => {
    const s = make(3);
    const me = toChoice(s);
    setLevel(s, me, 'tiger', 1); // −42 · 출혈 1턴(턴당 12)
    const foe = s.turnOrder.find(x => x !== me)!;
    processSkillChoice(s, 'tiger', foe);
    expect(s.enhance!.bleed[foe]).toMatchObject({ turns: 1, amount: 12 });
    const hpBefore = s.teams[foe].hp;
    // 차례가 foe에게 올 때까지 넘긴다 — foe의 차례가 끝나는 순간 한 번
    while (s.activeTeam !== foe) {
      toChoice(s);
      processPass(s);
    }
    expect(s.teams[foe].hp).toBe(hpBefore);
    toChoice(s);
    const tick = ofType(processPass(s).events, 'enhanceTick');
    expect(tick).toEqual([expect.objectContaining({ team: foe, kind: 'bleed', amount: 12 })]);
    expect(s.teams[foe].hp).toBe(hpBefore - 12);
  });
});

describe('개인전 강화 — 순위', () => {
  it('출혈로 체력이 0이 되면 꼴찌로 순위가 정해지고, 판은 나머지로 계속된다', () => {
    const s = make(3);
    const me = s.activeTeam;
    s.teams[me].hp = 10;
    s.enhance!.bleed[me] = { turns: 2, amount: 20 };
    toChoice(s);
    const events = processPass(s).events;
    expect(ofType(events, 'ranked')).toEqual([expect.objectContaining({ team: me, rank: 3, reason: 'out' })]);
    expect(s.phase).toBe('playing');
    expect(s.activeTeam).not.toBe(me);
  });

  it('짝(상표토끼)이 맞아도 기술은 발동하지 않는다 — 승리선 바로 아래여도 순위가 정해지지 않고 기술 단계로 간다(2026-10-31 짝 효과 해제)', () => {
    const s = make(3, { targetScore: 25 });
    const me = s.activeTeam;
    s.teams[me].hp = 49;
    // 오두막은 rng0이면 한 장 · 첫 동물(상표토끼)이 나온다 — 깔린 상표토끼 한 장과 짝이 맞는다
    s.stacks.rabbit = [{ id: 9001, animal: 'rabbit', num: 1, collectedBy: null }];
    s.stacks.tiger = [{ id: 9002, animal: 'tiger', num: 1, collectedBy: null }]; // 싹쓸이를 피하는 구경꾼
    const { events } = processPlayerAction(s, 'house', rng0);
    expect(ofType(events, 'collect')[0]).toMatchObject({ team: me, animal: 'rabbit' });
    expect(ofType(events, 'skillApplied')).toEqual([]);
    expect(ofType(events, 'ranked')).toEqual([]);
    expect(s.teams[me].hp).toBe(49);
    expect(s.pendingChoice).toBe(me);
  });
});

describe('개인전 강화 방', () => {
  function fakeWs() {
    const sent: ServerMessage[] = [];
    return { sent, ws: { readyState: 1, send: (d: string) => sent.push(JSON.parse(d)) } as unknown as import('ws').WebSocket };
  }

  it('강화 방은 강화 규칙(목표 상한 2500)으로 자르고, 대기실 상태에 enhance를 싣고, 강화 판으로 시작한다', () => {
    jest.useFakeTimers();
    try {
      const room = new Room('TEST', () => {});
      const host = fakeWs();
      room.addPlayer(host.ws, 'h', '방장', 'player', undefined, { ...ENHANCE_SETTINGS, targetScore: 2500 }, undefined, 'individual', true);
      const lobby = host.sent.filter(m => m.type === 'lobbyState').at(-1) as Extract<ServerMessage, { type: 'lobbyState' }>;
      expect(lobby.enhance).toBe(true);
      expect(lobby.settings.targetScore).toBe(2500);

      // 방장이 규칙을 바꿔도 강화 범위로 자른다
      room.updateSettings('h', { targetScore: 2000 });
      const after = host.sent.filter(m => m.type === 'lobbyState').at(-1) as Extract<ServerMessage, { type: 'lobbyState' }>;
      expect(after.settings.targetScore).toBe(2000);

      const guest = fakeWs();
      room.addPlayer(guest.ws, 'g', '손님', 'A');
      room.setReady('g', true);
      room.startGame('h');
      const start = host.sent.find(m => m.type === 'gameStart') as Extract<ServerMessage, { type: 'gameStart' }>;
      expect(start.state.mode).toBe('individual');
      expect(start.state.enhance).toBeTruthy();
      expect(start.state.settings.targetScore).toBe(2000);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('팀전 방에 enhance를 보내도 무시한다', () => {
    const room = new Room('TEST', () => {});
    const host = fakeWs();
    room.addPlayer(host.ws, 'h', '방장', 'A', undefined, undefined, undefined, 'team', true);
    const lobby = host.sent.filter(m => m.type === 'lobbyState').at(-1) as Extract<ServerMessage, { type: 'lobbyState' }>;
    expect(lobby.enhance).toBe(false);
  });
});
