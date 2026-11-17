import type { ClientGameState, GameState, ServerMessage } from 'shared';
import {
  ACORN_CARDS,
  ACORN_TIER_ODDS,
  acornExpBonus,
  ENHANCE_SETTINGS,
  THRESHOLDS,
  drawAcornOptions,
  emptyAcornSide,
  isAcornFestivalTurn,
  rollAcornTier,
} from 'shared';
import { initEnhanceGame, initIndividualGame } from '../engine/turnManager';
import { processAcornPick, processAcornReroll, processForfeit, processPass, processPlayerAction, processSkillChoice, processTimeout } from '../engine/gameEngine';
import { Room } from '../room';

/**
 * 도토리 카드(증강 — shared/acorn.ts · engine/acorn.ts · ACORN_CARDS.md). 축제 시기 · 단계 · 후보 · 고르기 · 효과 · 방.
 */

const rng0 = () => 0;
/** 차례대로 값을 내놓는 rng(다 쓰면 마지막 값) */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[Math.min(i++, xs.length - 1)];
};

function newGame(overrides: Partial<typeof ENHANCE_SETTINGS> = {}): GameState {
  return initEnhanceGame(['나'], ['CPU'], rng0, { ...ENHANCE_SETTINGS, targetScore: 500, ...overrides });
}
/** 지금 편에게 이 카드를 쥐여 준다(축제를 거치지 않고) */
function give(s: GameState, side: string, id: string, tier: 1 | 2 | 3 | 4 = 1): void {
  s.enhance!.acorn!.sides[side].owned.push({ id, tier, turn: s.turn });
}
/** 축제 하나를 열어 그 편에게 이 카드만 후보로 두고 고르게 한다(고른 순간 효과까지) */
function pickNow(s: GameState, side: string, id: string, tier: 1 | 2 | 3 | 4 = 1, rng = rng0) {
  s.enhance!.acorn!.offer = { no: 9, tier, options: { [side]: [id] }, picked: { [side]: null } };
  return processAcornPick(s, side, id, rng).events;
}
function passTurn(s: GameState): void {
  if (s.enhance?.acorn?.offer) processTimeout(s, rng0);
  s.pendingChoice = s.activeTeam;
  processPass(s);
}

describe('축제 시기 · 단계', () => {
  it('기본 3턴부터 4턴마다(3 · 7 · 11 · 15) — 시작 턴 · 주기는 방 규칙(축제 시작 · 축제 주기)', () => {
    const turns = Array.from({ length: 20 }, (_, i) => i + 1).filter(t => isAcornFestivalTurn(t, ENHANCE_SETTINGS));
    expect(turns).toEqual([3, 7, 11, 15, 19]);
    expect(isAcornFestivalTurn(3, { festivalTurn: 3, festivalDrawIncreaseInterval: 3 })).toBe(true);
    expect(isAcornFestivalTurn(9, { festivalTurn: 3, festivalDrawIncreaseInterval: 3 })).toBe(true);
  });

  it('첫 축제는 네 단계 모두 25%, 그 뒤 50 · 30 · 15 · 5%', () => {
    expect([0.1, 0.3, 0.6, 0.9].map(r => rollAcornTier(1, () => r))).toEqual([1, 2, 3, 4]);
    expect([0.1, 0.6, 0.85, 0.97].map(r => rollAcornTier(2, () => r))).toEqual([1, 2, 3, 4]);
    expect(Object.values(ACORN_TIER_ODDS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('카드 id는 모두 다르고, 동물마다 단계마다 다섯 장 이상 · 다이아 도토리는 모두 플레이어 전체형', () => {
    expect(new Set(ACORN_CARDS.map(c => c.id)).size).toBe(ACORN_CARDS.length);
    for (const fam of ['sheep', 'rabbit', 'mermaid', 'tiger'] as const) {
      for (const t of [1, 2, 3, 4]) expect(ACORN_CARDS.filter(c => c.family === fam && c.tier === t).length).toBeGreaterThanOrEqual(5);
    }
    for (const c of ACORN_CARDS.filter(c => c.family === 'diamond')) expect(c.scope).toBe('player');
  });
});

describe('축제 열기 · 고르기', () => {
  it('3턴이 되는 순간 고르기가 열린다 — 모두 같은 단계, 사람마다 서로 다른 후보 셋 · 그동안 장소 · 기술 · 턴 마치기를 받지 않는다', () => {
    const s = newGame();
    while (s.turn < 3) passTurn(s);
    const offer = s.enhance!.acorn!.offer!;
    expect(offer).not.toBeNull();
    expect(offer.no).toBe(1);
    expect(Object.keys(offer.options).sort()).toEqual(['A', 'B']);
    for (const side of ['A', 'B']) {
      expect(offer.options[side]).toHaveLength(3);
      expect(new Set(offer.options[side]).size).toBe(3);
      // 동물 카드는 모두 그 축제의 단계다
      for (const id of offer.options[side]) {
        const c = ACORN_CARDS.find(x => x.id === id)!;
        if (c.family !== 'diamond') expect(c.tier).toBe(offer.tier);
      }
    }
    expect(processPlayerAction(s, 'house', rng0).events).toEqual([]);
    s.pendingChoice = s.activeTeam;
    expect(processSkillChoice(s, 'sheep').events).toEqual([]);
    expect(processPass(s).events).toEqual([]);
  });

  it('후보에 없는 카드 · 이미 고른 편은 받지 않고, 모두 고르면 닫혀(closed) 판이 다시 흐른다', () => {
    const s = newGame({ festivalTurn: 1 });
    const offer = s.enhance!.acorn!.offer!;
    const notMine = ACORN_CARDS.find(c => !offer.options.A.includes(c.id))!.id;
    expect(processAcornPick(s, 'A', notMine).events).toEqual([]);
    const a = processAcornPick(s, 'A', offer.options.A[0]).events;
    expect(a[0]).toMatchObject({ type: 'acornPicked', team: 'A', id: offer.options.A[0] });
    expect(a[0]).not.toHaveProperty('closed');
    expect(processAcornPick(s, 'A', offer.options.A[1]).events).toEqual([]);
    const b = processAcornPick(s, 'B', offer.options.B[2]).events;
    expect(b[0]).toMatchObject({ closed: true });
    expect(s.enhance!.acorn!.offer).toBeNull();
    expect(s.enhance!.acorn!.sides.A.owned.map(o => o.id)).toEqual([offer.options.A[0]]);
    expect(processPlayerAction(s, 'house', rng0).events.length).toBeGreaterThan(0);
  });

  it('리롤 — 칸마다 축제에 한 번, 같은 단계의 다른 카드로(지금 보이는 후보 · 가진 카드는 안 나온다) · 고른 뒤에는 못 한다', () => {
    const s = newGame({ festivalTurn: 1 });
    const offer = s.enhance!.acorn!.offer!;
    const before = [...offer.options.A];
    const ev = processAcornReroll(s, 'A', 1, () => 0.5).events;
    expect(ev).toEqual([expect.objectContaining({ type: 'acornReroll', team: 'A', slot: 1 })]);
    const now = offer.options.A;
    expect(now[0]).toBe(before[0]);
    expect(now[2]).toBe(before[2]);
    expect(before).not.toContain(now[1]);
    const c = ACORN_CARDS.find(x => x.id === now[1])!;
    if (c.family !== 'diamond') expect(c.tier).toBe(offer.tier);
    expect(processAcornReroll(s, 'A', 1).events).toEqual([]); // 같은 칸 두 번째
    expect(processAcornReroll(s, 'A', 5).events).toEqual([]); // 없는 칸
    expect(processAcornReroll(s, 'A', 0).events).toHaveLength(1); // 다른 칸은 된다
    processAcornPick(s, 'A', offer.options.A[2]);
    expect(processAcornReroll(s, 'A', 2).events).toEqual([]); // 고른 뒤
  });

  it('15초가 지나면(시간초과) 아직 고르지 않은 사람 몫을 후보 중에서 대신 고른다(auto)', () => {
    const s = newGame({ festivalTurn: 1 });
    const offer = s.enhance!.acorn!.offer!;
    processAcornPick(s, 'A', offer.options.A[1]);
    const { events } = processTimeout(s, rng0);
    expect(events).toEqual([expect.objectContaining({ type: 'acornPicked', team: 'B', id: offer.options.B[0], auto: true, closed: true })]);
  });

  it('같은 사람에게 가진 카드는 다시 나오지 않고, 처음 보는 카드부터 — 모자라면 전에 본(고르지 않은) 카드가 다시 나온다', () => {
    const side = emptyAcornSide();
    const tier1 = ACORN_CARDS.filter(c => c.family !== 'diamond' && c.tier === 1).map(c => c.id);
    side.owned = tier1.slice(0, -2).map(id => ({ id, tier: 1 as const, turn: 1 }));
    side.seen = [...tier1];
    // 다이아는 모두 가졌다고 치면 동물 1단계에서 남은 두 장(본 적 있음)만 나온다
    side.owned.push(...ACORN_CARDS.filter(c => c.family === 'diamond').map(c => ({ id: c.id, tier: 1 as const, turn: 1 })));
    const out = drawAcornOptions(side, 1, rng0);
    expect(out.sort()).toEqual(tier1.slice(-2).sort());
    // 본 적 없는 카드가 있으면 그것이 먼저다
    const fresh = emptyAcornSide();
    fresh.seen = tier1.slice(0, 3);
    const opts = drawAcornOptions(fresh, 1, seq(0.9, 0, 0.9, 0, 0.9, 0));
    for (const id of opts) expect(fresh.seen).not.toContain(id);
  });

  it('개인전 — 순위가 정해진 사람은 빼고 연다 · 고르는 중에 항복하면 그 사람을 빼고 센다', () => {
    const players = ['p1', 'p2', 'p3'].map((side, i) => ({ side, nickname: side, color: (['red', 'pink', 'blue'] as const)[i] }));
    const s = initIndividualGame(players, rng0, { ...ENHANCE_SETTINGS, festivalTurn: 1 }, true);
    const offer = s.enhance!.acorn!.offer!;
    expect(Object.keys(offer.options).sort()).toEqual(['p1', 'p2', 'p3']);
    processAcornPick(s, 'p1', offer.options.p1[0]);
    processAcornPick(s, 'p2', offer.options.p2[0]);
    processForfeit(s, 'p3');
    expect(s.enhance!.acorn!.offer).toBeNull();
  });
});

describe('효과', () => {
  it('공격 피해 % — 특허랑이 Lv.1(44) + 140%(35 × ACORN_POWER 4) = 106', () => {
    const s = newGame({ festivalTurn: 999 });
    give(s, 'A', 't4a', 4);
    s.pendingChoice = 'A';
    const { events } = processSkillChoice(s, 'tiger');
    expect(events[0]).toMatchObject({ type: 'skillApplied', oppHpDelta: -106 });
  });

  it('받는 피해 감소 · 보호막 — 감소를 거친 뒤 보호막이 먼저 막고(shieldAbsorbed) 남은 몫만 체력에서 빠진다', () => {
    const s = newGame({ festivalTurn: 999 });
    give(s, 'B', 'r2b', 2); // 받는 피해 −6%
    s.enhance!.shield!.B = 20;
    s.pendingChoice = 'A';
    const { events } = processSkillChoice(s, 'tiger');
    // 44 × 0.94 = 41 → 보호막 20 → 21
    expect(events[0]).toMatchObject({ oppHpDelta: -21, shieldAbsorbed: 20 });
    expect(s.enhance!.shield!.B).toBe(0);
    expect(s.teams.B.hp).toBe(479);
  });

  it('보호막은 상한 없이 쌓인다 · 고른 순간 드는 회복 · 보호막', () => {
    const s = newGame({ festivalTurn: 999 });
    s.teams.A.hp = 300;
    pickNow(s, 'A', 'r1a'); // 체력 +4% = 20
    expect(s.teams.A.hp).toBe(320);
    pickNow(s, 'A', 'r4d', 4); // 보호막 8% = 40
    expect(s.enhance!.shield!.A).toBe(40);
    s.enhance!.shield!.A = 95;
    pickNow(s, 'A', 'r1f'); // +20 — 상한 없음(2026-11-17)
    expect(s.enhance!.shield!.A).toBe(115);
  });

  it('쓰러짐 방지 — 처음 0이 될 피해에 1로 버티고 시작 체력의 10% 회복(판에 1회)', () => {
    const s = newGame({ festivalTurn: 999 });
    pickNow(s, 'B', 'r4a', 4);
    s.teams.B.hp = 10;
    s.pendingChoice = 'A';
    const { events } = processSkillChoice(s, 'tiger');
    expect(s.phase).toBe('playing');
    expect(s.teams.B.hp).toBe(51);
    expect(events[0]).toMatchObject({ rescue: [{ side: 'B', kind: 'survive', amount: 51 }] });
    expect(s.enhance!.acorn!.sides.B.survive).toBe(0);
  });

  it('출혈 무효 · 받는 출혈 감소', () => {
    const s = newGame({ festivalTurn: 999 });
    pickNow(s, 'A', 'r3f', 3); // 출혈 무효 2번
    s.enhance!.bleed.A = { turns: 3, amount: 12 };
    s.activeTeam = 'A';
    s.pendingChoice = 'A';
    const ev = processPass(s).events.find(e => e.type === 'enhanceTick');
    expect(ev).toMatchObject({ kind: 'bleed', amount: 0, blocked: true });
    expect(s.teams.A.hp).toBe(500);
  });

  it('보호막은 출혈을 막지 못한다(2026-11-07) — 보호막이 있어도 출혈은 체력을 깎는다', () => {
    const s = newGame({ festivalTurn: 999 });
    s.enhance!.shield!.A = 50;
    s.enhance!.bleed.A = { turns: 3, amount: 12 };
    s.activeTeam = 'A';
    s.pendingChoice = 'A';
    const ev = processPass(s).events.find(e => e.type === 'enhanceTick');
    expect(ev).toMatchObject({ kind: 'bleed', amount: 12 });
    expect(s.teams.A.hp).toBe(488);
    expect(s.enhance!.shield!.A).toBe(50);
  });

  it('경험치 · 쿨타임 · 다음 장소 카드 +n장 · 상대 배율 제거', () => {
    const s = newGame({ festivalTurn: 999 });
    const before = s.teams.A.exp.sheep + s.teams.A.exp.rabbit + s.teams.A.exp.mermaid + s.teams.A.exp.tiger;
    const ev = pickNow(s, 'A', 's3c', 3)[0]; // 모든 카드 +5 × 4(ACORN_POWER)
    const after = s.teams.A.exp.sheep + s.teams.A.exp.rabbit + s.teams.A.exp.mermaid + s.teams.A.exp.tiger;
    expect(after - before).toBe(80);
    expect(ev).toMatchObject({ gains: { exp: { sheep: 20, rabbit: 20, mermaid: 20, tiger: 20 } } });

    s.enhance!.cooldowns.A.tiger = 3;
    pickNow(s, 'A', 's4b', 4); // 두 장 초기화
    expect(s.enhance!.cooldowns.A.tiger).toBe(0);

    pickNow(s, 'A', 's3b', 3); // 다음 장소 2번 동안 +5장 × 4(ACORN_POWER)
    s.pendingChoice = null;
    s.activeTeam = 'A';
    const first = processPlayerAction(s, 'house', rng0).events;
    expect(first.find(e => e.type === 'bonusDraws')).toMatchObject({ total: 20 });
    expect(s.enhance!.acorn!.sides.A.drawCharges).toEqual([{ n: 20, left: 1 }]);

    s.teams.B.pendingMultiplier = 6;
    pickNow(s, 'A', 'm3b', 3);
    expect(s.teams.B.pendingMultiplier).toBe(1);
  });

  it('다음 기술 +% 는 한 번 쓰면 사라지고, 디자인어에는 쓰이지 않는다 · 짝 경험치 %는 소수점을 이월한다', () => {
    const s = newGame({ festivalTurn: 999 });
    pickNow(s, 'A', 'm2b', 2); // 다음 기술 +30% × 4(ACORN_POWER)
    s.pendingChoice = 'A';
    processSkillChoice(s, 'mermaid');
    expect(s.enhance!.acorn!.sides.A.boost).toBe(120);
    s.enhance!.cooldowns.A = { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 };
    s.activeTeam = 'A';
    s.pendingChoice = 'A';
    const hit = processSkillChoice(s, 'tiger').events[0];
    // 44 × 배율(디자인어 Lv.1 ×2) × 2.2 = 194
    expect(hit).toMatchObject({ oppHpDelta: -194 });
    expect(s.enhance!.acorn!.sides.A.boost).toBe(0);
    // 짝 경험치 +20%(5 × 4) — 3의 20% = 0.6은 이월했다가 다음 짝에서 1이 된다
    const side = s.enhance!.acorn!.sides.A;
    give(s, 'A', 's1c', 1);
    expect(acornExpBonus(side, 3)).toBe(0);
    expect(acornExpBonus(side, 3)).toBe(1);
  });

  it('레벨 한 칸의 % — 실용신양 · 상표토끼는 10, 디자인어 · 특허랑이는 20 기준(100% × ACORN_POWER 4 = 네 칸)', () => {
    const s = newGame({ festivalTurn: 999 });
    const ev = pickNow(s, 'A', 's4d', 4)[0] as { gains: { exp: Record<string, number> } };
    const [animal, amount] = Object.entries(ev.gains.exp)[0];
    expect(amount).toBe(THRESHOLDS[animal as keyof typeof THRESHOLDS] * 4);
  });
});

// ─── 방 — 혼자 놀기 강화: 사람과 컴퓨터가 함께 고르고, 다 고르면 판이 다시 흐른다 ─────────
interface FakeSocket { readyState: number; sent: ServerMessage[]; send(data: string): void }
function fakeSocket(): FakeSocket {
  const sent: ServerMessage[] = [];
  return { readyState: 1, sent, send(d: string) { sent.push(JSON.parse(d) as ServerMessage); } };
}
function lastState(ws: FakeSocket): ClientGameState {
  for (let i = ws.sent.length - 1; i >= 0; i--) {
    const m = ws.sent[i];
    if (m.type === 'gameStart' || m.type === 'actionResult' || m.type === 'gameSnapshot') return m.state;
  }
  throw new Error('상태가 없다');
}

describe('방 — 도토리 카드 고르기', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  function soloRoom(festivalTurn = 1) {
    const ws = fakeSocket();
    const room = new Room('ACRN', () => {});
    room.addSoloPlayer(ws as never, 'me', '나', undefined, { ...ENHANCE_SETTINGS, festivalTurn }, true);
    room.startSoloGame();
    return { ws, room };
  }

  it('컴퓨터는 잠시 뒤 고르고, 내가 고르면 닫혀 내 장소 차례가 이어진다 · 고르는 동안 장소를 누르면 에러', () => {
    const { ws, room } = soloRoom();
    const s0 = lastState(ws);
    expect(s0.enhance!.acorn!.offer).not.toBeNull();
    expect(s0.turnTotalMs).toBe(15_000);
    room.handleDrawCard('me', 'house');
    expect(ws.sent.at(-1)).toMatchObject({ type: 'error' });
    jest.advanceTimersByTime(4_000);
    expect(lastState(ws).enhance!.acorn!.offer!.picked.B).not.toBeNull();
    room.handlePickAcorn('me', s0.enhance!.acorn!.offer!.options.A[0]);
    const s1 = lastState(ws);
    expect(s1.enhance!.acorn!.offer).toBeNull();
    expect(s1.enhance!.acorn!.sides.A.owned).toHaveLength(1);
    expect(s1.turnTotalMs).toBe(ENHANCE_SETTINGS.drawTimeSec * 1000);
  });

  it('15초 안에 고르지 않으면 대신 골라 주고 판이 다시 흐른다', () => {
    const { ws } = soloRoom();
    jest.advanceTimersByTime(17_000);
    const s = lastState(ws);
    expect(s.enhance!.acorn!.offer).toBeNull();
    const picked = ws.sent.flatMap(m => (m.type === 'actionResult' ? m.events : [])).filter(e => e.type === 'acornPicked');
    expect(picked.find(e => e.type === 'acornPicked' && e.team === 'A')).toMatchObject({ auto: true });
  });
});
