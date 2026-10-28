import type { Animal, ClientGameState, GameState, ServerMessage } from 'shared';
import {
  ANIMALS,
  ENHANCE_PLACE_DRAWS,
  ENHANCE_SETTINGS,
  enhancePlaceDrawCount,
  THRESHOLDS,
  enhanceCooldown,
  enhanceLevel,
  enhanceMermaidAfter,
  expProgressFor,
  maxTurnOf,
} from 'shared';
import { initEnhanceGame } from '../engine/turnManager';
import { processPass, processPlayerAction, processSkillChoice } from '../engine/gameEngine';
import { applySkillChoice, eligibleAnimals, levelOf } from '../engine/skills';
import { Room } from '../room';

/**
 * 혼자 놀기 '카드 강화'(shared/enhance.ts · ENHANCE_MODE.md) — 엔진 규칙과 방의 시작·컴퓨터.
 * 혼자 놀기와 같은 팀전 1:1(A = 나, B = 컴퓨터) 위에 얹은 판이다.
 * 엔진 테스트는 결정론적 RNG(rng0 = 언제나 0번째 선택)로 상태를 직접 만진다(effects.test.ts와 같은 방식).
 */

const rng0 = () => 0;

/** 효과 숫자를 읽기 쉽게 목표 25(시작 체력 25 · 승리 50)로 둔다 — 기본 규칙(목표 200)은 방 테스트가 따로 본다. */
function newGame(overrides: Partial<typeof ENHANCE_SETTINGS> = {}): GameState {
  return initEnhanceGame(['나'], ['CPU'], rng0, { ...ENHANCE_SETTINGS, targetScore: 25, ...overrides });
}

/**
 * 지금 차례인 편을 곧장 기술 단계로 — 장소를 누르지 않는다. 강화 판은 뽑기에서 짝이 맞으면 효과가 저절로 터져 체력이 바뀌므로,
 * 기술 하나의 효과만 재려면 뽑기를 거치지 않아야 한다(뽑기·짝 효과는 아래 '짝 효과' 묶음이 따로 잰다).
 */
function toChoice(state: GameState): void {
  state.pendingChoice = state.activeTeam;
}

/** 컴퓨터(B) 차례를 그냥 넘기고 다시 내(A) 기술 단계로. */
function cycle(state: GameState): void {
  toChoice(state);
  processPass(state);
  toChoice(state);
}

/** 이 동물의 레벨을 정확히 level로 맞춘다(임계값 × (레벨 − 1)). */
function setLevel(state: GameState, side: string, animal: Animal, level: number): void {
  state.teams[side].exp[animal] = THRESHOLDS[animal] * (level - 1);
}

describe('강화 규칙 표', () => {
  it('레벨업 경험치는 일반 판 그대로 — 실용신양·상표토끼 10, 디자인어·특허랑이 20마다 한 단계, Lv.5에서 멈춘다', () => {
    expect(enhanceLevel('sheep', 0)).toBe(1);
    expect(enhanceLevel('sheep', 9)).toBe(1);
    expect(enhanceLevel('sheep', 10)).toBe(2);
    expect(enhanceLevel('rabbit', 40)).toBe(5);
    expect(enhanceLevel('tiger', 19)).toBe(1);
    expect(enhanceLevel('tiger', 20)).toBe(2);
    expect(enhanceLevel('mermaid', 80)).toBe(5);
    expect(enhanceLevel('rabbit', 99)).toBe(10);
    expect(enhanceLevel('rabbit', 100)).toBe(11); // Lv.Max
    expect(enhanceLevel('tiger', 200)).toBe(11);
    expect(enhanceLevel('mermaid', 9999)).toBe(11);
    expect(expProgressFor(true, 'sheep', 13)).toEqual({ level: 2, inLevel: 3, need: 10 });
    expect(expProgressFor(true, 'tiger', 9999).need).toBeNull();
  });

  it('쿨타임 — 양·토끼 0/1/2, 인어·호랑이 1/2/3 (Lv.3·Lv.5에서 하나씩 늘어난다)', () => {
    expect([1, 2, 3, 4, 5].map(l => enhanceCooldown('sheep', l))).toEqual([0, 0, 1, 1, 2]);
    expect([1, 2, 3, 4, 5].map(l => enhanceCooldown('rabbit', l))).toEqual([0, 0, 1, 1, 2]);
    expect([1, 2, 3, 4, 5].map(l => enhanceCooldown('mermaid', l))).toEqual([1, 1, 2, 2, 3]);
    expect([1, 2, 3, 4, 5].map(l => enhanceCooldown('tiger', l))).toEqual([1, 1, 2, 2, 3]);
    expect([6, 11].map(l => enhanceCooldown('tiger', l))).toEqual([3, 3]); // Lv.6 이후로는 더 늘지 않는다
  });

  it('디자인어 배율 — 처음엔 그 레벨의 배율, 걸려 있으면 증가량만큼 더하되 새로 거는 값보다 작아지지 않는다', () => {
    expect(enhanceMermaidAfter(1, 1)).toBe(2);
    expect(enhanceMermaidAfter(2, 1)).toBe(3);
    expect(enhanceMermaidAfter(8, 5)).toBe(13);
    expect(enhanceMermaidAfter(1, 11)).toBe(10);
    expect(enhanceMermaidAfter(3, 11)).toBe(13);
    expect(enhanceMermaidAfter(2, 4)).toBe(6);
  });
});

describe('강화 판 시작', () => {
  it('혼자 놀기와 같은 팀전 1:1 — 모든 카드가 Lv.1로 열려 있고, 시작 공유 카드도 숫자 1이며, 쿨타임은 0이다', () => {
    const s = newGame();
    expect(s.mode).toBe('team');
    expect(Object.keys(s.teams)).toEqual(['A', 'B']);
    for (const side of ['A', 'B']) {
      for (const a of ANIMALS) expect(levelOf(s, side, a)).toBe(1);
      expect(eligibleAnimals(s, side)).toEqual([...ANIMALS]);
    }
    const cards = ANIMALS.flatMap(a => s.stacks[a]);
    expect(cards.length).toBe(2);
    expect(cards.every(c => c.num === 1)).toBe(true);
    expect(s.enhance?.cooldowns.A).toEqual({ sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 });
    expect(s.teams.A.hp).toBe(25);
  });

  it('선은 firstTeam으로 — A는 사람, B는 컴퓨터', () => {
    expect(newGame({ firstTeam: 'A' }).activeTeam).toBe('A');
    expect(newGame({ firstTeam: 'B' }).activeTeam).toBe('B');
  });

  it('장소를 누르면 여러 장 — 동물 2종 장소(오두막·부둣가) 1~3장, 3종 장소(숲길·강가) 3~5장', () => {
    expect(ENHANCE_PLACE_DRAWS).toEqual({ 2: [1, 3], 3: [3, 5] });
    const lo = () => 0;
    const hi = () => 0.9999;
    expect([enhancePlaceDrawCount('house', lo), enhancePlaceDrawCount('house', hi)]).toEqual([1, 3]);
    expect([enhancePlaceDrawCount('dock', lo), enhancePlaceDrawCount('dock', hi)]).toEqual([1, 3]);
    expect([enhancePlaceDrawCount('forest_road', lo), enhancePlaceDrawCount('forest_road', hi)]).toEqual([3, 5]);
    expect([enhancePlaceDrawCount('river_road', lo), enhancePlaceDrawCount('river_road', hi)]).toEqual([3, 5]);

    const s = newGame();
    for (const a of ANIMALS) s.stacks[a] = [];
    const { events } = processPlayerAction(s, 'forest_road', lo);
    expect(events[0]).toEqual({ type: 'placeDraws', place: 'forest_road', count: 3 });
    expect(events.filter(e => e.type === 'draw').length).toBe(3);
  });
});

describe('강화 판 짝 효과', () => {
  it('뽑는 카드는 모두 1이고, 짝이 맞으면 모인 장수만큼 경험치 + 그 카드의 기술이 곧바로 발동한다', () => {
    const s = newGame();
    for (const a of ANIMALS) s.stacks[a] = [];
    processPlayerAction(s, 'house', rng0); // 오두막 1장 — 0번째 동물(토끼)
    expect(s.stacks.rabbit.map(c => c.num)).toEqual([1]);
    processPass(s);
    const { events } = processPlayerAction(s, 'forest_road', rng0); // 숲길 3장 — 모두 토끼 → 4장 짝
    expect(s.stacks.rabbit.filter(c => c.collectedBy === 'B').length).toBe(4);
    expect(s.teams.B.exp.rabbit).toBe(4);
    const pair = events.find(e => e.type === 'skillApplied');
    expect(pair).toMatchObject({ team: 'B', animal: 'rabbit', level: 1, myHpDelta: 2, pair: true });
    expect(s.teams.B.hp).toBe(27);
    // 짝 효과는 쿨타임을 걸지 않는다 — 고른 기술의 차례는 그대로 열려 있다
    expect(s.pendingChoice).toBe('B');
    expect(s.enhance!.cooldowns.B.rabbit).toBe(0);
  });

  it('레벨은 정산으로 오른 뒤의 값으로 — 이번 짝으로 Lv.2가 되면 Lv.2 효과', () => {
    const s = newGame();
    for (const a of ANIMALS) s.stacks[a] = [];
    s.teams.A.exp.rabbit = 9;                // 짝 2장이면 11 → Lv.2
    s.stacks.rabbit.push({ id: 90001, animal: 'rabbit', num: 1, collectedBy: null });
    processPlayerAction(s, 'house', rng0);   // 토끼 1장 → 2장 짝
    expect(s.teams.A.exp.rabbit).toBe(11);
    expect(s.teams.A.hp).toBe(25 + 4);
  });

  it('짝 효과는 배율을 쓰지도 소모하지도 않는다', () => {
    const s = newGame();
    for (const a of ANIMALS) s.stacks[a] = [];
    s.teams.A.pendingMultiplier = 3;
    s.stacks.rabbit.push({ id: 90002, animal: 'rabbit', num: 1, collectedBy: null });
    processPlayerAction(s, 'house', rng0);
    expect(s.teams.A.hp).toBe(27);
    expect(s.teams.A.pendingMultiplier).toBe(3);
  });

  it('특허랑이 짝으로 상대가 0이 되면 기술 단계 없이 그 자리에서 이긴다', () => {
    const s = newGame();
    for (const a of ANIMALS) s.stacks[a] = [];
    s.teams.B.hp = 1;
    s.stacks.tiger.push({ id: 90003, animal: 'tiger', num: 1, collectedBy: null });
    const { events } = processPlayerAction(s, 'dock', () => 0.99); // 부둣가 마지막 동물(호랑이) 3장 → 4장 짝
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe('A');
    expect(s.pendingChoice).toBeNull();
    expect(events.at(-1)).toEqual({ type: 'gameEnd', winner: 'A', reason: 'knockout' });
  });
});

describe('강화 판 기술', () => {
  it('기술을 써도 경험치가 줄지 않는다', () => {
    const s = newGame();
    setLevel(s, 'A', 'rabbit', 3);
    toChoice(s);
    const before = s.teams.A.exp.rabbit;
    processSkillChoice(s, 'rabbit');
    expect(s.teams.A.exp.rabbit).toBe(before);
  });

  it.each([
    [1, 2], [2, 4], [3, 8], [4, 12], [5, 16], [6, 20], [7, 24], [8, 28], [9, 32], [10, 36], [11, 40],
  ])('상표토끼 Lv.%i → 체력 +%i', (level, gain) => {
    const s = newGame();
    setLevel(s, 'A', 'rabbit', level);
    toChoice(s);
    processSkillChoice(s, 'rabbit');
    expect(s.teams.A.hp).toBe(25 + gain);
  });

  it.each([
    [1, 1], [2, 2], [3, 4], [4, 6], [5, 8], [6, 10], [7, 12], [8, 14], [9, 16], [10, 18], [11, 20],
  ])('실용신양 Lv.%i → 다음 턴 추가 뽑기 %i장', (level, draws) => {
    const s = newGame();
    setLevel(s, 'A', 'sheep', level);
    toChoice(s);
    processSkillChoice(s, 'sheep');
    expect(s.teams.A.pendingExtraDraws).toBe(draws);
  });

  it.each([
    [1, 1, 0], [2, 2, 0], [3, 4, 0], [4, 6, 0], [5, 8, 0], [6, 10, 4], [7, 12, 6], [8, 14, 6], [9, 16, 8], [10, 18, 8], [11, 20, 10],
  ])('특허랑이 Lv.%i → 상대 −%i, 내 체력 +%i (회복은 Lv.6부터)', (level, dmg, heal) => {
    const s = newGame();
    setLevel(s, 'A', 'tiger', level);
    toChoice(s);
    processSkillChoice(s, 'tiger');
    expect(s.teams.B.hp).toBe(25 - dmg);
    expect(s.teams.A.hp).toBe(25 + heal);
  });

  it('디자인어 배율은 다음 기술의 효과(회복까지)에 곱해지고, 쓴 뒤 1로 돌아간다', () => {
    const s = newGame();
    setLevel(s, 'A', 'mermaid', 1); // ×2
    setLevel(s, 'A', 'tiger', 6);   // −10, +4
    toChoice(s);
    processSkillChoice(s, 'mermaid');
    expect(s.teams.A.pendingMultiplier).toBe(2);
    cycle(s);
    processSkillChoice(s, 'tiger');
    expect(s.teams.B.hp).toBe(25 - 20);
    expect(s.teams.A.hp).toBe(25 + 8);
    expect(s.teams.A.pendingMultiplier).toBe(1);
  });

  it('실용신양 Lv.6부터 — 무작위로 고른 내 카드 하나에 경험치(배율 반영)', () => {
    const s = newGame();
    setLevel(s, 'A', 'sheep', 6);
    s.teams.A.pendingMultiplier = 2;
    toChoice(s);
    const ev = applySkillChoice(s, 'A', 'sheep', undefined, () => 0.6); // ANIMALS[2] = 디자인어
    expect(ev).toMatchObject({ extraDrawsQueued: 20, randomExp: { animal: 'mermaid', amount: 2 } });
    expect(s.teams.A.exp.mermaid).toBe(2);
    // Lv.5까지는 경험치를 주지 않는다
    const t = newGame();
    setLevel(t, 'A', 'sheep', 5);
    toChoice(t);
    expect(applySkillChoice(t, 'A', 'sheep', undefined, () => 0.6)).not.toHaveProperty('randomExp');
  });

  it('디자인어 Lv.6부터 — 상대가 쌓아 둔 배율을 깎되 ×1 아래로는 내려가지 않는다', () => {
    const s = newGame();
    setLevel(s, 'A', 'mermaid', 8); // 상대 배율 −3
    s.teams.B.pendingMultiplier = 5;
    toChoice(s);
    expect(processSkillChoice(s, 'mermaid').events[0]).toMatchObject({ oppMultiplierCut: 3 });
    expect(s.teams.B.pendingMultiplier).toBe(2);
    expect(s.teams.A.pendingMultiplier).toBe(5);
    const t = newGame();
    setLevel(t, 'A', 'mermaid', 11); // −10
    t.teams.B.pendingMultiplier = 4;
    toChoice(t);
    processSkillChoice(t, 'mermaid');
    expect(t.teams.B.pendingMultiplier).toBe(1);
  });

  it.each([
    [8, 1], [9, 2], [10, 3], [11, 5],
  ])('디자인어 Lv.%i → 상대의 다음 고른 기술 효과 ÷%i', (level, divide) => {
    const s = newGame();
    setLevel(s, 'A', 'mermaid', level);
    toChoice(s);
    const ev = processSkillChoice(s, 'mermaid').events[0];
    expect(s.enhance!.divisors.B).toBe(divide);
    if (divide > 1) expect(ev).toMatchObject({ oppDivisor: divide });
    else expect(ev).not.toHaveProperty('oppDivisor');
  });

  it('나눗셈은 상대가 다음에 고른 기술에 쓰이고(반올림) 사라진다 — 디자인어를 고르면 그대로 남는다', () => {
    const s = newGame();
    s.enhance!.divisors.A = 3;
    setLevel(s, 'A', 'rabbit', 4); // +12 → ÷3 = 4
    setLevel(s, 'A', 'mermaid', 1);
    toChoice(s);
    processSkillChoice(s, 'mermaid');           // 디자인어는 나눗셈을 쓰지 않는다
    expect(s.enhance!.divisors.A).toBe(3);
    cycle(s);
    const ev = processSkillChoice(s, 'rabbit').events[0]; // 12 × 2(배율) ÷ 3 = 8
    expect(ev).toMatchObject({ myHpDelta: 8, divisorUsed: 3 });
    expect(s.teams.A.hp).toBe(33);
    expect(s.enhance!.divisors.A).toBe(1);
  });

  it('나눗셈의 소수점은 반올림 — 특허랑이 Lv.2(−2) ÷5 = 0, Lv.3(−4) ÷3 = 1, Lv.1(+2 토끼) ÷3 = 1', () => {
    const s = newGame();
    s.enhance!.divisors.A = 5;
    setLevel(s, 'A', 'tiger', 2);
    toChoice(s);
    processSkillChoice(s, 'tiger');
    expect(s.teams.B.hp).toBe(25);
    const t = newGame();
    t.enhance!.divisors.A = 3;
    setLevel(t, 'A', 'tiger', 3);
    toChoice(t);
    processSkillChoice(t, 'tiger');
    expect(t.teams.B.hp).toBe(24);
    const u = newGame();
    u.enhance!.divisors.A = 3;
    toChoice(u);
    processSkillChoice(u, 'rabbit');
    expect(u.teams.A.hp).toBe(26);
  });

  it('나눗셈은 짝 효과를 나누지도 소모하지도 않는다', () => {
    const s = newGame();
    for (const a of ANIMALS) s.stacks[a] = [];
    s.enhance!.divisors.A = 5;
    s.stacks.rabbit.push({ id: 90004, animal: 'rabbit', num: 1, collectedBy: null });
    processPlayerAction(s, 'house', rng0);
    expect(s.teams.A.hp).toBe(27);
    expect(s.enhance!.divisors.A).toBe(5);
  });

  it('쿨타임 — 특허랑이 Lv.1은 쓴 다음 내 차례 하나를 쉬고, 그다음 차례에 다시 열린다', () => {
    const s = newGame();
    toChoice(s);
    processSkillChoice(s, 'tiger');
    expect(s.enhance!.cooldowns.A.tiger).toBe(1);
    cycle(s);
    expect(eligibleAnimals(s, 'A')).not.toContain('tiger');
    expect(processSkillChoice(s, 'tiger').events).toEqual([]);
    processPass(s);
    cycle(s);
    expect(s.enhance!.cooldowns.A.tiger).toBe(0);
    expect(eligibleAnimals(s, 'A')).toContain('tiger');
  });

  it('쿨타임 — 상표토끼 Lv.1·2는 매 차례 쓸 수 있고, Lv.3부터 한 차례 쉰다', () => {
    const s = newGame();
    toChoice(s);
    processSkillChoice(s, 'rabbit');
    expect(s.enhance!.cooldowns.A.rabbit).toBe(0);
    setLevel(s, 'A', 'rabbit', 3);
    cycle(s);
    processSkillChoice(s, 'rabbit');
    expect(s.enhance!.cooldowns.A.rabbit).toBe(1);
  });
});

describe('강화 판 끝', () => {
  it('턴 제한이 없다 — 20턴이 지나도 체력이 승부를 가르기 전까지 계속된다', () => {
    const s = newGame();
    expect(maxTurnOf(s)).toBe(Infinity);
    for (let i = 0; i < 60 && s.phase === 'playing'; i++) {
      toChoice(s); // 뽑지 않는다 — 짝 효과로 체력이 움직여 판이 끝나지 않게
      processPass(s);
    }
    expect(s.turn).toBeGreaterThan(25);
    expect(s.phase).toBe('playing');
  });

  it('상대 체력을 0으로 만들면 그 자리에서 이긴다', () => {
    const s = newGame();
    setLevel(s, 'A', 'tiger', 5);
    s.teams.B.hp = 5;
    toChoice(s);
    const { events } = processSkillChoice(s, 'tiger');
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe('A');
    expect(events.at(-1)).toEqual({ type: 'gameEnd', winner: 'A', reason: 'knockout' });
  });

  it('목표 체력(목표 점수 × 2)에 닿으면 그 자리에서 이긴다', () => {
    const s = newGame();
    setLevel(s, 'A', 'rabbit', 5);
    s.teams.A.hp = 45;
    toChoice(s);
    processSkillChoice(s, 'rabbit');
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe('A');
  });
});

// ─── 방 — 혼자 놀기 '카드 강화'로 시작하고 컴퓨터가 B로 둔다 ─────────────────
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

describe('방 — 카드 강화 혼자 놀기', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  it('혼자 놀기와 같은 팀전 1:1(A 나 · B 컴퓨터)로 시작하고 강화 상태·규칙이 실린다', () => {
    const ws = fakeSocket();
    const room = new Room('ENH1', () => {});
    room.addSoloPlayer(ws as never, 'me', '나', '민트팀', { ...ENHANCE_SETTINGS }, true);
    room.startSoloGame();
    const s = lastState(ws);
    expect(s.mode).toBe('team');
    expect(s.enhance).toBeDefined();
    expect(s.memberIds).toEqual({ A: ['me'], B: ['CPU'] });
    expect(s.teamNames.A).toBe('민트팀');
    expect(s.settings.targetScore).toBe(200);
    expect(s.settings.festivalTurn).toBe(6);
    expect(s.settings.festivalDrawIncreaseInterval).toBe(4);
    expect(s.teams.A.hp).toBe(200);
    expect(s.settings.drawTimeSec).toBe(15);
    expect(s.pauseUnlimited).toBe(true);
  });

  it('내가 차례를 넘기면 컴퓨터(B)가 장소를 고르고 기술 단계까지 마쳐 내 차례로 돌아온다', () => {
    const ws = fakeSocket();
    const room = new Room('ENH2', () => {});
    room.addSoloPlayer(ws as never, 'me', '나', undefined, { ...ENHANCE_SETTINGS }, true);
    room.startSoloGame();
    room.handleDrawCard('me', 'house');
    room.handlePassSkill('me');
    expect(lastState(ws).activeTeam).toBe('B');
    jest.advanceTimersByTime(12_000); // 컴퓨터의 두 수(장소 2.2~3.2초 + 연출 유예 + 기술 1~1.5초)만큼 — 내 뽑기 제한시간(15초)보다는 짧게
    const s = lastState(ws);
    expect(s.activeTeam).toBe('A');
    expect(s.pendingChoice).toBeNull();
    expect(ws.sent.some(m => m.type === 'error')).toBe(false);
  });
});
