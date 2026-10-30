import type { Animal, ClientGameState, GameState, ServerMessage } from 'shared';
import {
  ANIMALS,
  ENHANCE_PLACE_DRAWS,
  ENHANCE_SETTINGS,
  ENHANCE_TARGET_SCORE_MAX,
  SHEEP_SAFETY_CAP,
  SETTINGS_LIMITS,
  clampEnhanceSettings,
  enhancePlaceDrawCount,
  enhanceSkillsPerTurn,
  THRESHOLDS,
  enhanceCooldown,
  enhanceLevel,
  enhanceMermaidAfter,
  expProgressFor,
  maxTurnOf,
  rollDrawStep,
} from 'shared';
import { initEnhanceGame } from '../engine/turnManager';
import { processPass, processPlayerAction, processSkillChoice, processTimeout } from '../engine/gameEngine';
import { applySkillChoice, eligibleAnimals, levelOf } from '../engine/skills';
import { Room, settleGraceMs } from '../room';

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
    expect(expProgressFor(true, 'sheep', 13)).toEqual({ level: 2, inLevel: 3, need: 10, over: 1 });
    // Max에서도 막대는 다음 별도 배수까지 찬다 — 특허랑이 Max(200)에서 20을 더 채우면 ×2
    expect(expProgressFor(true, 'tiger', 200)).toEqual({ level: 11, inLevel: 0, need: 20, over: 1 });
    expect(expProgressFor(true, 'tiger', 245)).toEqual({ level: 11, inLevel: 5, need: 20, over: 3 });
  });

  it('쿨타임 — 양·토끼 0/1/2, 인어·호랑이 1/2/3 (Lv.3·Lv.5에서 하나씩 늘어난다)', () => {
    expect([1, 2, 3, 4, 5].map(l => enhanceCooldown('sheep', l))).toEqual([0, 0, 1, 1, 2]);
    expect([1, 2, 3, 4, 5].map(l => enhanceCooldown('rabbit', l))).toEqual([0, 0, 1, 1, 2]);
    expect([1, 2, 3, 4, 5].map(l => enhanceCooldown('mermaid', l))).toEqual([1, 1, 2, 2, 3]);
    expect([1, 2, 3, 4, 5].map(l => enhanceCooldown('tiger', l))).toEqual([1, 1, 2, 2, 3]);
    expect([6, 10].map(l => enhanceCooldown('tiger', l))).toEqual([3, 3]); // Lv.6~10은 더 늘지 않는다
    // Lv.Max(11)에서 또 +1 — 실용신양·상표토끼 3 · 디자인어·특허랑이 4
    expect(ANIMALS.map(a => enhanceCooldown(a, 11))).toEqual([3, 3, 4, 4]);
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
    s.stacks.tiger.push({ id: 90002, animal: 'tiger', num: 1, collectedBy: null }); // 필드를 비우지 않는 구경꾼(비면 싹쓸이)
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
    s.stacks.tiger.push({ id: 90003, animal: 'tiger', num: 1, collectedBy: null }); // 싹쓸이를 피하는 구경꾼
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
    const s = newGame({ targetScore: 100 });
    setLevel(s, 'A', 'tiger', level);
    toChoice(s);
    processSkillChoice(s, 'tiger');
    // Lv.9부터 붙는 출혈은 상대의 차례가 **끝날 때** 든다 — 내 기술로 차례가 넘어간 지금은 아직 즉시 피해뿐이다
    expect(s.teams.B.hp).toBe(100 - dmg);
    expect(s.teams.A.hp).toBe(100 + heal);
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

describe('강화 판 3차 표 — 지속 효과 · 정화 · 쿨타임 감소 · Max 별도 배수', () => {
  it('특허랑이 Lv.9+ — 출혈은 상대가 기술을 모두 쓰고 차례가 끝날 때마다 공격력만큼 깎는다(배율 무관)', () => {
    const s = newGame({ targetScore: 200 });
    setLevel(s, 'A', 'tiger', 11);
    s.teams.A.pendingMultiplier = 3; // 즉시 피해에만 곱해지고 출혈에는 안 곱해진다
    toChoice(s);
    const { events } = processSkillChoice(s, 'tiger');
    expect(events[0]).toMatchObject({ oppHpDelta: -60, bleedAdded: { turns: 4, amount: 20 } });
    // 내 차례가 끝나 상대 차례가 시작될 때는 들지 않는다(2026-10-30 — 예전에는 여기서 들었다)
    expect(events.find(e => e.type === 'enhanceTick')).toBeUndefined();
    expect(s.teams.B.hp).toBe(200 - 60);
    expect(s.enhance!.bleed.B).toEqual({ turns: 4, amount: 20 });
    // B가 자기 차례를 마치는 순간 든다
    toChoice(s);
    const end = processPass(s).events;
    expect(end.find(e => e.type === 'enhanceTick')).toMatchObject({ team: 'B', kind: 'bleed', amount: 20, turnsLeft: 3 });
    expect(s.teams.B.hp).toBe(120);
    // 내 차례가 끝날 때는 B의 출혈이 들지 않는다
    toChoice(s);
    processPass(s);
    expect(s.teams.B.hp).toBe(120);
  });

  it('상표토끼 Lv.9+ — 지속 회복은 내 차례가 끝날 때(기술을 모두 쓴 뒤) 기본 회복량만큼 오른다', () => {
    const s = newGame({ targetScore: 200 });
    setLevel(s, 'A', 'rabbit', 9);
    toChoice(s);
    const { events } = processSkillChoice(s, 'rabbit');
    expect(events[0]).toMatchObject({ myHpDelta: 32, regenAdded: { turns: 1, amount: 32 } });
    // 상표토끼로 차례가 끝나는 그 순간 한 번 든다 — 효과 다음, 차례가 넘어가기 전
    expect(events.find(e => e.type === 'enhanceTick')).toMatchObject({ team: 'A', kind: 'regen', amount: 32, turnsLeft: 0 });
    expect(s.teams.A.hp).toBe(264);
    expect(s.enhance!.regen.A).toEqual({ turns: 0, amount: 0 });
  });

  it('출혈·지속 회복은 최대 10턴까지만 쌓인다 — 꽉 차면 턴은 그대로', () => {
    const s = newGame({ targetScore: 500 });
    setLevel(s, 'A', 'tiger', 11);
    setLevel(s, 'A', 'rabbit', 11);
    s.enhance!.bleed.B = { turns: 8, amount: 20 };
    s.enhance!.regen.A = { turns: 9, amount: 40 };
    toChoice(s);
    s.teams.A.pendingMultiplier = 1;
    const tiger = processSkillChoice(s, 'tiger').events[0];
    // 8 + 4 → 10에서 잘린다(더해진 것은 2턴). B의 차례가 끝나야 든다
    expect(tiger).toMatchObject({ bleedAdded: { turns: 2, amount: 20 } });
    expect(s.enhance!.bleed.B.turns).toBe(10);
    // 지속 회복도 같다 — 이미 10이면 아예 더하지 않는다(regenAdded 없음). 컴퓨터가 넘겨 내 차례로 돌아온 뒤
    toChoice(s);
    processPass(s);
    s.enhance!.regen.A = { turns: 10, amount: 40 };
    s.enhance!.cooldowns.A.rabbit = 0;
    toChoice(s);
    const rabbit = processSkillChoice(s, 'rabbit').events[0];
    expect(rabbit).not.toHaveProperty('regenAdded');
    // 더해지지 않았고, 내 차례가 끝나며 한 번 들어 9가 남는다
    expect(s.enhance!.regen.A.turns).toBe(9);
  });

  it('출혈과 지속 회복이 함께 있으면 출혈이 먼저 — 출혈로 0이 되면 회복 없이 진다', () => {
    const s = newGame({ targetScore: 200 });
    s.enhance!.bleed.A = { turns: 2, amount: 20 };
    s.enhance!.regen.A = { turns: 2, amount: 30 };
    s.activeTeam = 'A';
    toChoice(s);
    const { events } = processPass(s);
    const ticks = events.filter(e => e.type === 'enhanceTick');
    expect(ticks.map(e => (e as { kind: string }).kind)).toEqual(['bleed', 'regen']);
    expect(s.teams.A.hp).toBe(210);

    const t = newGame({ targetScore: 200 });
    t.teams.A.hp = 15;
    t.enhance!.bleed.A = { turns: 2, amount: 20 };
    t.enhance!.regen.A = { turns: 2, amount: 30 };
    t.activeTeam = 'A';
    toChoice(t);
    const end = processPass(t).events;
    expect(end.filter(e => e.type === 'enhanceTick')).toHaveLength(1);
    expect(t.phase).toBe('ended');
    expect(t.winner).toBe('B');
  });

  it('상표토끼 Lv.6+ — 나에게 걸린 부정한 효과 하나의 남은 턴을 줄이고, Max는 정화한다', () => {
    const s = newGame({ targetScore: 200 });
    s.enhance!.bleed.A = { turns: 4, amount: 20 };
    setLevel(s, 'A', 'rabbit', 7);
    toChoice(s);
    const ev = processSkillChoice(s, 'rabbit').events[0];
    expect(ev).toMatchObject({ cleanse: { kind: 'bleed', before: 4, after: 2 } });
    // 정화로 2가 되고, 내 차례가 끝나며 한 번 들어 1이 남는다
    expect(s.enhance!.bleed.A.turns).toBe(1);

    const t = newGame({ targetScore: 200 });
    t.enhance!.bleed.A = { turns: 4, amount: 20 };
    setLevel(t, 'A', 'rabbit', 11);
    toChoice(t);
    processSkillChoice(t, 'rabbit');
    expect(t.enhance!.bleed.A).toEqual({ turns: 0, amount: 0 });
  });

  it('상표토끼의 정화는 이번 기술에 이미 쓰인 효과 감소를 고르지 않는다(나눗셈은 기술을 고르는 순간 사라진다)', () => {
    const s = newGame({ targetScore: 200 });
    s.enhance!.divisors.A = 2;
    s.enhance!.divisorTurns.A = 2;
    s.enhance!.bleed.A = { turns: 3, amount: 10 };
    setLevel(s, 'A', 'rabbit', 6);
    toChoice(s);
    const ev = processSkillChoice(s, 'rabbit').events[0];
    expect(ev).toMatchObject({ myHpDelta: 10, divisorUsed: 2, cleanse: { kind: 'bleed', before: 3, after: 2 } });
  });

  it('디자인어 Lv.9+ — 효과 감소는 상대 차례 N번이 끝나면 저절로 사라진다(그 전에 기술을 고르면 그때 사라진다)', () => {
    const s = newGame({ targetScore: 200 });
    setLevel(s, 'A', 'mermaid', 10);
    toChoice(s);
    const ev = processSkillChoice(s, 'mermaid').events[0];
    expect(ev).toMatchObject({ oppDivisor: 3, oppDivisorTurns: 3 });
    for (let i = 0; i < 3; i++) {
      expect(s.enhance!.divisors.B).toBe(3);
      toChoice(s); processPass(s); // B 넘김
      toChoice(s); processPass(s); // A 넘김
    }
    expect(s.enhance!.divisors.B).toBe(1);
    expect(s.enhance!.divisorTurns.B).toBe(0);
  });

  it('실용신양 Lv.9+ — 다른 카드 중 쿨타임이 걸린 한 장의 쿨타임을 줄이고, Max는 초기화한다(자기 자신은 빠진다)', () => {
    const s = newGame({ targetScore: 200 });
    s.enhance!.cooldowns.A = { sheep: 0, rabbit: 0, mermaid: 0, tiger: 3 };
    setLevel(s, 'A', 'sheep', 10);
    toChoice(s);
    const ev = processSkillChoice(s, 'sheep').events[0];
    expect(ev).toMatchObject({ cooldownCut: { animal: 'tiger', before: 3, after: 1 } });

    const t = newGame({ targetScore: 200 });
    t.enhance!.cooldowns.A = { sheep: 0, rabbit: 0, mermaid: 4, tiger: 0 };
    setLevel(t, 'A', 'sheep', 11);
    toChoice(t);
    processSkillChoice(t, 'sheep');
    expect(t.enhance!.cooldowns.A.mermaid).toBe(0);
    expect(t.enhance!.cooldowns.A.sheep).toBeGreaterThan(0);
  });

  it('Lv.Max 별도 배수 — 임계값을 더 채울 때마다 ×1씩, 지금 걸린 배율에 곱한다(×7 × ×3 = ×21)', () => {
    const s = newGame({ targetScore: 2500 });
    s.teams.A.exp.tiger = 20 * 12; // Max(200) + 40 → ×3
    s.teams.A.pendingMultiplier = 7;
    toChoice(s);
    const ev = processSkillChoice(s, 'tiger').events[0];
    expect(ev).toMatchObject({ overMultiplier: 3, oppHpDelta: -20 * 21, myHpDelta: 10 * 21, bleedAdded: { turns: 4, amount: 20 } });
  });

  it('Lv.Max 별도 배수는 짝 효과에도 걸리고, 디자인어는 거는 배율이 그만큼 커진다', () => {
    const s = newGame({ targetScore: 2500 });
    s.teams.A.exp.mermaid = 20 * 11; // ×2
    toChoice(s);
    expect(processSkillChoice(s, 'mermaid').events[0]).toMatchObject({ overMultiplier: 2, multiplierAfter: 20 });

    const t = newGame({ targetScore: 2500 });
    for (const a of ANIMALS) t.stacks[a] = [];
    t.teams.A.exp.rabbit = 10 * 12 - 1; // 짝(+1)으로 Max + 20 → ×3
    t.stacks.rabbit.push({ id: 90010, animal: 'rabbit', num: 1, collectedBy: null });
    const pair = processPlayerAction(t, 'house', rng0).events.find(e => e.type === 'skillApplied');
    expect(pair).toMatchObject({ pair: true, overMultiplier: 3, myHpDelta: 120 });
  });
});

describe('강화 판 한계', () => {
  it(`예약 뽑기를 SHEEP_SAFETY_CAP(${SHEEP_SAFETY_CAP})에서 자르지 않는다 — 실용신양 100회는 100장`, () => {
    const s = newGame();
    s.teams.A.pendingExtraDraws = 100;
    s.teams.A.pendingFestivalDraws = 70;
    const { events } = processPlayerAction(s, 'house', rng0);
    expect(events.find(e => e.type === 'bonusDraws')).toMatchObject({ count: 100 });
    expect(events.find(e => e.type === 'festivalDraws')).toMatchObject({ count: 70 });
    expect(s.teams.A.pendingExtraDraws).toBe(0);
  });

  it('목표 점수 상한은 일반 판(500)과 달리 2500 — 방과 엔진이 같은 범위로 자른다', () => {
    expect(SETTINGS_LIMITS.targetScore.max).toBe(500);
    expect(ENHANCE_TARGET_SCORE_MAX).toBe(2500);
    expect(clampEnhanceSettings({ targetScore: 2000 }).targetScore).toBe(2000);
    expect(clampEnhanceSettings({ targetScore: 1e12 }).targetScore).toBe(2500);
    const s = initEnhanceGame(['나'], ['CPU'], rng0, { ...ENHANCE_SETTINGS, targetScore: 9999 });
    expect(s.settings.targetScore).toBe(2500);
    expect(s.teams.A.hp).toBe(2500);
  });
});

describe('연출 유예 — 컴퓨터의 다음 수가 큰 연쇄 뽑기 연출 도중에 오지 않게', () => {
  it('예약 뽑기 롤 하나는 장수와 무관하게 마지막 장까지 5초 안에 끝난다(적으면 0.3초 간격 그대로)', () => {
    // 화면: 마지막 장 시작 + 울 볼 0.5초 + 슬롯 1.35초
    const rollMs = (n: number) => (n - 1) * rollDrawStep(n) + 500 + 1350;
    expect(rollDrawStep(5)).toBe(300);
    expect(rollDrawStep(11)).toBe(300);
    for (const n of [12, 17, 40, 100, 300]) expect(rollMs(n)).toBeLessThanOrEqual(5000);
  });

  it('예약 100장 + 축제 60장의 뽑기는 그 화면 타임라인(롤 둘)만큼 기다린다', () => {
    const s = newGame();
    s.teams.A.pendingExtraDraws = 100;
    s.teams.A.pendingFestivalDraws = 60;
    const { events } = processPlayerAction(s, 'house', rng0);
    // 화면: 롤 둘(각각 마지막 장 시작 + 울 볼 0.5초 + 슬롯 1.35초)
    const rolls = (99 * rollDrawStep(100) + 500 + 1350) + (59 * rollDrawStep(60) + 500 + 1350);
    expect(settleGraceMs(events)).toBeGreaterThan(rolls);
    expect(settleGraceMs(events)).toBeLessThanOrEqual(60_000);
  });

  it('보통의 뽑기(일반 판 크기)는 예전 근사식 그대로다', () => {
    const s = newGame();
    s.teams.A.pendingExtraDraws = 3;
    const { events } = processPlayerAction(s, 'house', rng0);
    expect(settleGraceMs(events)).toBeLessThanOrEqual(15_000);
  });
});

describe('강화 판 한 차례 여러 장', () => {
  it('15턴마다 한 장씩 늘어 최대 3장 — 1~15턴 1장 · 16~30턴 2장 · 31턴부터 3장', () => {
    expect([1, 15, 16, 30, 31, 45, 46, 200].map(t => enhanceSkillsPerTurn(t))).toEqual([1, 1, 2, 2, 3, 3, 3, 3]);
  });

  it('방 규칙 — 끄면 언제나 1장, 주기·최대 장수를 바꿀 수 있다(최대 4장)', () => {
    const off = { skillGrowth: false, skillGrowthTurns: 15, skillGrowthMax: 3 };
    expect([1, 16, 31, 200].map(t => enhanceSkillsPerTurn(t, off))).toEqual([1, 1, 1, 1]);
    const fast = { skillGrowth: true, skillGrowthTurns: 5, skillGrowthMax: 4 };
    expect([1, 5, 6, 11, 16, 100].map(t => enhanceSkillsPerTurn(t, fast))).toEqual([1, 1, 2, 3, 4, 4]);
    // 범위 밖은 잘린다 — 최대 장수 2~4, 주기 1~999
    const clamped = clampEnhanceSettings({ skillGrowthMax: 9, skillGrowthTurns: 0 });
    expect(clamped.skillGrowthMax).toBe(4);
    expect(clamped.skillGrowthTurns).toBe(1);
    expect(clampEnhanceSettings({ skillGrowth: 'yes' as unknown as boolean }).skillGrowth).toBe(true);
  });

  it('끈 판은 턴이 올라도 1장, 켠 판은 정한 주기대로 는다', () => {
    const off = newGame({ skillGrowth: false });
    while (off.turn < 40) { toChoice(off); processPass(off); }
    expect(off.skillsPerTurn).toBe(1);
    const on = newGame({ skillGrowthTurns: 3, skillGrowthMax: 4 });
    while (on.turn < 4) { toChoice(on); processPass(on); }
    expect(on.skillsPerTurn).toBe(2);
    while (on.turn < 10) { toChoice(on); processPass(on); }
    expect(on.skillsPerTurn).toBe(4);
  });

  it('턴이 16이 되는 순간 판의 skillsPerTurn이 2가 된다', () => {
    const s = newGame();
    expect(s.skillsPerTurn).toBe(1);
    while (s.turn < 16) { toChoice(s); processPass(s); }
    expect(s.skillsPerTurn).toBe(2);
    while (s.turn < 31) { toChoice(s); processPass(s); }
    expect(s.skillsPerTurn).toBe(3);
  });

  it('2장 차례 — 첫 기술 뒤에도 기술 단계가 남고, 쓴 카드는 다시 못 쓰며, 두 번째 기술로 차례가 넘어간다', () => {
    const s = newGame();
    s.skillsPerTurn = 2;
    toChoice(s);
    processSkillChoice(s, 'rabbit');
    expect(s.pendingChoice).toBe('A');
    expect(s.activeTeam).toBe('A');
    expect(s.skillsUsedThisTurn).toBe(1);
    expect(eligibleAnimals(s, 'A')).not.toContain('rabbit'); // 쿨타임 0 카드도 그 차례 안에서는 잠긴다
    expect(processSkillChoice(s, 'rabbit').events).toEqual([]);
    processSkillChoice(s, 'sheep');
    expect(s.pendingChoice).toBeNull();
    expect(s.activeTeam).toBe('B');
    expect(s.skillsUsedThisTurn).toBe(0);
    // 쿨타임 0이던 두 카드는 내 차례가 끝나며 다시 열린다
    expect(s.enhance!.cooldowns.A.rabbit).toBe(0);
    expect(s.enhance!.cooldowns.A.sheep).toBe(0);
  });

  it('디자인어를 먼저 쓰면 같은 차례의 다음 기술에 배율이 걸린다', () => {
    const s = newGame();
    s.skillsPerTurn = 2;
    const hp = s.teams.A.hp;
    toChoice(s);
    processSkillChoice(s, 'mermaid'); // Lv.1 ×2
    processSkillChoice(s, 'rabbit');  // Lv.1 +2 ×2
    expect(s.teams.A.hp).toBe(hp + 4);
    expect(s.activeTeam).toBe('B');
  });

  it('남은 장수가 있어도 쓸 카드가 없으면 차례가 넘어간다', () => {
    const s = newGame();
    s.skillsPerTurn = 3;
    s.enhance!.cooldowns.A = { sheep: 0, rabbit: 2, mermaid: 2, tiger: 2 };
    toChoice(s);
    processSkillChoice(s, 'sheep');
    expect(s.activeTeam).toBe('B');
  });

  it('첫 기술로 이기면 거기서 끝난다', () => {
    const s = newGame();
    s.skillsPerTurn = 2;
    setLevel(s, 'A', 'tiger', 5);
    s.teams.B.hp = 5;
    toChoice(s);
    processSkillChoice(s, 'tiger');
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe('A');
  });

  it('시간초과 — 첫 장은 서버가 대신 고르고, 이미 쓴 뒤라면 더 고르지 않고 차례만 끝낸다', () => {
    const s = newGame();
    s.skillsPerTurn = 3;
    toChoice(s);
    const first = processTimeout(s, rng0);
    expect(first.events[0]).toMatchObject({ type: 'timeoutChoice' });
    expect((first.events[0] as { animal: Animal | null }).animal).not.toBeNull();
    expect(s.pendingChoice).toBe('A');
    const second = processTimeout(s, rng0);
    expect(second.events[0]).toEqual({ type: 'timeoutChoice', animal: null });
    expect(s.activeTeam).toBe('B');
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
    expect(s.settings.targetScore).toBe(500);
    expect(s.settings.festivalTurn).toBe(2);
    expect(s.settings.festivalDrawCount).toBe(1);
    expect(s.settings.festivalDrawIncreaseInterval).toBe(2);
    expect(s.teams.A.hp).toBe(500);
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
    // 컴퓨터의 두 수(장소 2.2~3.2초 + 연출 유예 + 기술 1~1.5초)만큼 — 짝 효과가 여럿 겹치면 유예가 길어져 12초로는 가끔 모자랐다.
    // 넉넉히 잡아도 된다: 내 뽑기 제한시간(15초)은 내 차례가 돌아온 순간부터 센다.
    jest.advanceTimersByTime(20_000);
    const s = lastState(ws);
    expect(s.activeTeam).toBe('A');
    expect(s.pendingChoice).toBeNull();
    expect(ws.sent.some(m => m.type === 'error')).toBe(false);
  });

  it('한 차례 2장 — 컴퓨터도 기술을 연달아 두 번 쓴다(쓸 카드가 남아 있으면)', () => {
    const ws = fakeSocket();
    const room = new Room('ENH3', () => {});
    room.addSoloPlayer(ws as never, 'me', '나', undefined, { ...ENHANCE_SETTINGS }, true);
    room.startSoloGame();
    const st = (room as unknown as { state: GameState }).state;
    st.skillsPerTurn = 2;
    st.enhance!.cooldowns.B = { sheep: 0, rabbit: 0, mermaid: 2, tiger: 2 }; // 양·토끼 둘만 열어 둔다
    room.handleDrawCard('me', 'house');
    room.handlePassSkill('me');
    jest.advanceTimersByTime(20_000);
    const bSkills = ws.sent.flatMap(m => (m.type === 'actionResult' ? m.events : []))
      .filter(e => e.type === 'skillApplied' && e.team === 'B' && !e.pair); // 짝 효과(pair)는 고른 기술이 아니다
    expect(bSkills.length).toBe(2);
    expect(lastState(ws).activeTeam).toBe('A');
    expect(ws.sent.some(m => m.type === 'error')).toBe(false);
  });
});
