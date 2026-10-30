import type { Animal, ClientGameState, GameState, ServerMessage } from 'shared';
import {
  ANIMALS,
  ENHANCE_PLACE_DRAWS,
  ENHANCE_SETTINGS,
  ENHANCE_RESERVED_DRAW_CAP,
  ENHANCE_TARGET_SCORE_MAX,
  SHEEP_SAFETY_CAP,
  SETTINGS_LIMITS,
  clampEnhanceSettings,
  enhancePlaceDrawCount,
  enhanceSkillsPerTurn,
  THRESHOLDS,
  enhanceCooldown,
  enhanceCooldownShown,
  enhanceLevel,
  enhanceMermaidAfter,
  enhanceValue,
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
 * 지금 차례인 편을 곧장 기술 단계로 — 장소를 누르지 않는다. 기술 하나의 효과만 재려면 뽑기(짝 · 싹쓸이의 경험치)를 거치지 않는 편이
 * 깔끔하다(뽑기 · 짝은 아래 '강화 판 짝' 묶음이 따로 잰다).
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

  it('디자인어 배율 — 처음엔 그 레벨의 배율, 걸려 있으면 Lv.1~5는 증가량을 더하고 Lv.6부터는 곱하되, 새로 거는 값보다 작아지지 않는다', () => {
    expect(enhanceMermaidAfter(1, 1)).toBe(2);
    expect(enhanceMermaidAfter(2, 1)).toBe(3);
    expect(enhanceMermaidAfter(8, 5)).toBe(13);
    expect(enhanceMermaidAfter(2, 4)).toBe(6);
    expect(enhanceMermaidAfter(1, 6)).toBe(5);
    expect(enhanceMermaidAfter(2, 6)).toBe(5);    // 2 × 2 = 4 < 새로 거는 ×5
    expect(enhanceMermaidAfter(10, 7)).toBe(30);  // 10 × 3
    expect(enhanceMermaidAfter(30, 10)).toBe(300); // 30 × 10
    expect(enhanceMermaidAfter(1, 11)).toBe(5);
    expect(enhanceMermaidAfter(5, 11)).toBe(100); // 5 × 20
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

describe('강화 판 짝', () => {
  it('뽑는 카드는 모두 1이고, 짝이 맞으면 모인 장수만큼 경험치만 오른다 — 그 카드의 기술은 발동하지 않는다(2026-10-31 짝 효과 해제)', () => {
    const s = newGame();
    for (const a of ANIMALS) s.stacks[a] = [];
    s.stacks.tiger.push({ id: 90002, animal: 'tiger', num: 1, collectedBy: null }); // 필드를 비우지 않는 구경꾼(비면 싹쓸이)
    processPlayerAction(s, 'house', rng0); // 오두막 1장 — 0번째 동물(토끼)
    expect(s.stacks.rabbit.map(c => c.num)).toEqual([1]);
    processPass(s);
    const { events } = processPlayerAction(s, 'forest_road', rng0); // 숲길 3장 — 모두 토끼 → 4장 짝
    expect(s.stacks.rabbit.filter(c => c.collectedBy === 'B').length).toBe(4);
    expect(s.teams.B.exp.rabbit).toBe(4);
    expect(events.some(e => e.type === 'skillApplied')).toBe(false);
    expect(s.teams.B.hp).toBe(25);
    expect(s.pendingChoice).toBe('B');
  });

  it('짝은 체력 · 배율 · 나눗셈을 건드리지 않는다 — 특허랑이 짝으로도 판이 끝나지 않는다', () => {
    const s = newGame();
    for (const a of ANIMALS) s.stacks[a] = [];
    s.teams.A.pendingMultiplier = 3;
    s.enhance!.divisors.A = 5;
    s.teams.B.hp = 1;
    s.stacks.tiger.push({ id: 90003, animal: 'tiger', num: 1, collectedBy: null });
    s.stacks.rabbit.push({ id: 90005, animal: 'rabbit', num: 1, collectedBy: null }); // 싹쓸이를 피하는 구경꾼
    const { events } = processPlayerAction(s, 'dock', () => 0.99); // 부둣가 마지막 동물(호랑이) 3장 → 4장 짝
    expect(events.some(e => e.type === 'collect' && e.animal === 'tiger')).toBe(true);
    expect(events.some(e => e.type === 'skillApplied' || e.type === 'gameEnd')).toBe(false);
    expect(s.phase).toBe('playing');
    expect(s.teams.B.hp).toBe(1);
    expect(s.teams.A.pendingMultiplier).toBe(3);
    expect(s.enhance!.divisors.A).toBe(5);
    expect(s.pendingChoice).toBe('A');
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

  // 5차 표(2026-10-30) — 즉시 회복 · 지속 회복 턴 · Lv.6+ 회복 중첩(한 턴의 양 32 × 중첩, 그 전에는 2)
  it.each([
    [1, 2, 1, 0, 2], [2, 4, 2, 0, 2], [3, 8, 3, 0, 2], [4, 16, 4, 0, 2], [5, 32, 5, 0, 2],
    [6, 64, 5, 1, 32], [7, 64, 5, 2, 64], [8, 64, 5, 3, 96], [9, 64, 5, 4, 128], [10, 64, 5, 5, 160], [11, 128, 10, 10, 320],
  ])('상표토끼 Lv.%i → 체력 +%i · 지속 회복 +%i턴 · 중첩 %i(한 턴 +%i)', (level, gain, regen, stack, tick) => {
    const s = newGame({ targetScore: 200 });
    setLevel(s, 'A', 'rabbit', level);
    toChoice(s);
    const ev = processSkillChoice(s, 'rabbit').events[0];
    expect(s.teams.A.hp).toBe(200 + gain);
    expect(ev).toMatchObject({ regenAdded: { turns: regen, amount: tick } });
    if (stack > 0) expect(ev).toMatchObject({ regenAdded: { stackAdded: stack, stack } });
    else expect(ev).not.toHaveProperty('regenAdded.stack');
  });

  it.each([
    [1, 1], [2, 2], [3, 4], [4, 8], [5, 16], [6, 32], [7, 32], [8, 32], [9, 32], [10, 32], [11, 64],
  ])('실용신양 Lv.%i → 다음 턴 추가 뽑기 %i장', (level, draws) => {
    const s = newGame();
    setLevel(s, 'A', 'sheep', level);
    toChoice(s);
    processSkillChoice(s, 'sheep');
    expect(s.teams.A.pendingExtraDraws).toBe(draws);
  });

  // 출혈 한 턴의 양 — 계수가 없으면 10, Lv.6+에 맞으면 80 × (1 + 0.2 × 계수)
  it.each([
    [1, 10, 1, 0, 10], [2, 20, 2, 0, 10], [3, 40, 4, 0, 10], [4, 60, 6, 0, 10], [5, 80, 8, 0, 10],
    [6, 100, 10, 1, 96], [7, 100, 10, 2, 112], [8, 100, 10, 3, 128], [9, 100, 10, 4, 144], [10, 100, 10, 5, 160], [11, 200, 20, 10, 240],
  ])('특허랑이 Lv.%i → 상대 −%i · 출혈 +%i턴 · 계수 %i(한 턴 −%i, 내 체력은 그대로)', (level, dmg, bleed, stack, tick) => {
    const s = newGame({ targetScore: 2500 });
    setLevel(s, 'A', 'tiger', level);
    toChoice(s);
    const ev = processSkillChoice(s, 'tiger').events[0];
    // 출혈은 상대의 차례가 **끝날 때** 든다 — 내 기술로 차례가 넘어간 지금은 아직 즉시 피해뿐이다
    expect(s.teams.B.hp).toBe(2500 - dmg);
    expect(s.teams.A.hp).toBe(2500);
    expect(ev).toMatchObject({ myHpDelta: 0, bleedAdded: { turns: bleed, amount: tick } });
    if (stack > 0) expect(ev).toMatchObject({ bleedAdded: { stackAdded: stack, stack } });
  });

  it('디자인어 배율은 다음 기술의 효과에 곱해지고, 쓴 뒤 1로 돌아간다', () => {
    const s = newGame();
    setLevel(s, 'A', 'mermaid', 1); // ×2
    setLevel(s, 'A', 'tiger', 1);   // −10
    toChoice(s);
    processSkillChoice(s, 'mermaid');
    expect(s.teams.A.pendingMultiplier).toBe(2);
    cycle(s);
    processSkillChoice(s, 'tiger');
    expect(s.teams.B.hp).toBe(25 - 20);
    expect(s.teams.A.pendingMultiplier).toBe(1);
  });

  it('실용신양 — 배율은 장수에만 걸리고, 무작위 카드의 경험치는 표의 값 × 경험치 중첩 배수(Lv.6+ 그 한 번의 곱)', () => {
    const s = newGame();
    setLevel(s, 'A', 'sheep', 3);
    s.teams.A.pendingMultiplier = 2;
    toChoice(s);
    const ev = applySkillChoice(s, 'A', 'sheep', undefined, () => 0.6); // ANIMALS[2] = 디자인어
    expect(ev).toMatchObject({ extraDrawsQueued: 8, randomExp: { animal: 'mermaid', amount: 4 } });
    expect(ev).not.toHaveProperty('randomExp.stack');
    expect(s.teams.A.exp.mermaid).toBe(4);

    // Lv.7 — 경험치 10 × 중첩 배수 2 = 20(배율 2는 장수에만)
    const t = newGame();
    setLevel(t, 'A', 'sheep', 7);
    t.teams.A.pendingMultiplier = 2;
    toChoice(t);
    expect(applySkillChoice(t, 'A', 'sheep', undefined, () => 0.6)).toMatchObject({
      extraDrawsQueued: 64, randomExp: { animal: 'mermaid', amount: 20, stack: 2 },
    });
    expect(levelOf(t, 'A', 'mermaid')).toBe(2);

    // Lv.Max — 64장 · 경험치 20 × 10 = 200
    const u = newGame();
    setLevel(u, 'A', 'sheep', 11);
    toChoice(u);
    expect(applySkillChoice(u, 'A', 'sheep', undefined, () => 0.6)).toMatchObject({
      extraDrawsQueued: 64, randomExp: { animal: 'mermaid', amount: 200, stack: 10 },
    });
  });

  it('디자인어 Lv.6부터 — 상대가 쌓아 둔 배율을 ÷N(반올림, ×1 아래로는 안 내려간다), Max는 ×1로', () => {
    const s = newGame();
    setLevel(s, 'A', 'mermaid', 8); // 상대 배율 ÷4
    s.teams.B.pendingMultiplier = 12;
    toChoice(s);
    expect(processSkillChoice(s, 'mermaid').events[0]).toMatchObject({ oppMultiplierCut: 9 });
    expect(s.teams.B.pendingMultiplier).toBe(3);
    expect(s.teams.A.pendingMultiplier).toBe(5);
    const t = newGame();
    setLevel(t, 'A', 'mermaid', 11);
    t.teams.B.pendingMultiplier = 50;
    toChoice(t);
    processSkillChoice(t, 'mermaid');
    expect(t.teams.B.pendingMultiplier).toBe(1);
    expect(t.teams.A.pendingMultiplier).toBe(5);
  });

  it('디자인어 Lv.Max만 상대 기술 효과 ÷10(2턴)을 건다 — 다시 걸면 턴을 더하고 최대 5턴', () => {
    const s = newGame();
    setLevel(s, 'A', 'mermaid', 10);
    toChoice(s);
    expect(processSkillChoice(s, 'mermaid').events[0]).not.toHaveProperty('oppDivisor');
    expect(s.enhance!.divisors.B).toBe(1);

    const t = newGame();
    setLevel(t, 'A', 'mermaid', 11);
    toChoice(t);
    expect(processSkillChoice(t, 'mermaid').events[0]).toMatchObject({ oppDivisor: 10, oppDivisorTurns: 2 });
    expect(t.enhance!.divisors.B).toBe(10);

    const u = newGame();
    setLevel(u, 'A', 'mermaid', 11);
    u.enhance!.divisors.B = 10;
    u.enhance!.divisorTurns.B = 4;
    toChoice(u);
    expect(processSkillChoice(u, 'mermaid').events[0]).toMatchObject({ oppDivisorTurns: 5 });
  });

  it('나눗셈은 걸려 있는 동안 고르는 기술마다 쓰이고(반올림) 남는다 — 디자인어는 나뉘지 않는다', () => {
    const s = newGame({ targetScore: 200 }); // 지속 회복이 쌓여도 승리선에 닿지 않게
    s.enhance!.divisors.A = 10;
    s.enhance!.divisorTurns.A = 3;
    setLevel(s, 'A', 'rabbit', 4); // +16 ÷10 = 2
    toChoice(s);
    expect(processSkillChoice(s, 'rabbit').events[0]).toMatchObject({ myHpDelta: 2, divisorUsed: 10 });
    expect(s.enhance!.divisors.A).toBe(10);
    expect(s.enhance!.divisorTurns.A).toBe(2); // 내 차례가 끝나며 하나 준다
    cycle(s);
    expect(processSkillChoice(s, 'tiger').events[0]).toMatchObject({ oppHpDelta: -1, divisorUsed: 10 });
    cycle(s);
    const mermaid = processSkillChoice(s, 'mermaid').events[0];
    expect(mermaid).toMatchObject({ multiplierAfter: 2 });
    expect(mermaid).not.toHaveProperty('divisorUsed');
    expect(s.enhance!.divisors.A).toBe(1); // 3턴이 다 지나 사라졌다
  });

  it('나눗셈의 소수점은 반올림 — 특허랑이 Lv.1(−10) ÷10 = 1, 상표토끼 Lv.1(+2) ÷10 = 0', () => {
    const s = newGame();
    s.enhance!.divisors.A = 10;
    s.enhance!.divisorTurns.A = 1;
    toChoice(s);
    processSkillChoice(s, 'tiger');
    expect(s.teams.B.hp).toBe(24);
    const u = newGame();
    u.enhance!.divisors.A = 10;
    u.enhance!.divisorTurns.A = 1;
    toChoice(u);
    processSkillChoice(u, 'rabbit');
    expect(u.teams.A.hp).toBe(25);
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

  it('쿨타임 — 한 차례 2장 판에서 두 번째 기술을 골라도 앞서 쓴 카드의 남은 쿨타임은 줄지 않는다(화면 표시)', () => {
    const s = newGame({ skillGrowth: true, skillGrowthTurns: 1, skillGrowthMax: 2 });
    s.skillsPerTurn = 2;
    toChoice(s);
    processSkillChoice(s, 'tiger');
    // 첫 장 뒤 — 아직 내 차례(기술 하나 더). 저장값에는 이 차례 몫(+1)이 들어 있지만 화면에는 쿨타임 그대로 보인다
    expect(s.pendingChoice).toBe('A');
    expect(s.enhance!.usedThisTurn).toEqual(['tiger']);
    expect(eligibleAnimals(s, 'A')).not.toContain('tiger');
    expect(enhanceCooldownShown(s, 'A', 'tiger')).toBe(enhanceCooldown('tiger', 1));
    // 두 번째 장으로 차례가 끝나도 같은 숫자다 — 고른 횟수가 아니라 내 차례가 끝날 때만 준다
    processSkillChoice(s, 'rabbit');
    expect(s.activeTeam).toBe('B');
    expect(s.enhance!.usedThisTurn).toEqual([]);
    expect(enhanceCooldownShown(s, 'A', 'tiger')).toBe(enhanceCooldown('tiger', 1));
    // 쿨타임 0인 상표토끼는 쓴 차례에만 잠기고(화면 0 = "다음 차례에 다시") 다음 내 차례에 바로 열린다
    expect(s.enhance!.cooldowns.A.rabbit).toBe(0);
    cycle(s);
    expect(eligibleAnimals(s, 'A')).toContain('rabbit');
    expect(eligibleAnimals(s, 'A')).not.toContain('tiger');
    expect(enhanceCooldownShown(s, 'A', 'tiger')).toBe(1);
  });
});

describe('강화 판 5차 표 — 지속 효과 · 중첩 · 회복 효율 · 정화 · 쿨타임 감소 · 회피 · Max 별도 배수', () => {
  it('특허랑이 — 출혈은 상대가 기술을 모두 쓰고 차례가 끝날 때마다 든다(배율 무관 — Lv.1~5는 10)', () => {
    const s = newGame({ targetScore: 500 });
    setLevel(s, 'A', 'tiger', 5);
    s.teams.A.pendingMultiplier = 3; // 즉시 피해에만 곱해지고 출혈에는 안 곱해진다
    toChoice(s);
    const { events } = processSkillChoice(s, 'tiger');
    expect(events[0]).toMatchObject({ oppHpDelta: -240, bleedAdded: { turns: 8, amount: 10 } });
    // 내 차례가 끝나 상대 차례가 시작될 때는 들지 않는다
    expect(events.find(e => e.type === 'enhanceTick')).toBeUndefined();
    expect(s.teams.B.hp).toBe(500 - 240);
    expect(s.enhance!.bleed.B).toMatchObject({ turns: 8, amount: 10 });
    // B가 자기 차례(발동 턴의 다음 턴)를 마치는 순간 든다
    toChoice(s);
    const end = processPass(s).events;
    expect(end.find(e => e.type === 'enhanceTick')).toMatchObject({ team: 'B', kind: 'bleed', amount: 10, turnsLeft: 7 });
    expect(s.teams.B.hp).toBe(250);
    // 내 차례가 끝날 때는 B의 출혈이 들지 않는다
    toChoice(s);
    processPass(s);
    expect(s.teams.B.hp).toBe(250);
  });

  it('특허랑이 Lv.6+ — 출혈 누적 계수가 맞을 때마다 쌓이고(최대 20), 출혈이 끝나면 0으로 돌아간다', () => {
    const s = newGame({ targetScore: 2500 });
    setLevel(s, 'A', 'tiger', 6);
    toChoice(s);
    applySkillChoice(s, 'A', 'tiger');
    expect(s.enhance!.bleed.B).toMatchObject({ turns: 10, amount: 96, stack: 1 });
    applySkillChoice(s, 'A', 'tiger');
    expect(s.enhance!.bleed.B).toMatchObject({ turns: 20, amount: 112, stack: 2 });

    const t = newGame({ targetScore: 2500 });
    setLevel(t, 'A', 'tiger', 11);
    t.enhance!.bleed.B = { turns: 5, amount: 80 * 4, stack: 15 };
    toChoice(t);
    expect(applySkillChoice(t, 'A', 'tiger')).toMatchObject({ bleedAdded: { turns: 20, amount: 400, stackAdded: 5, stack: 20 } });

    // 마지막 한 턴이 들면 계수도 사라진다 — 다음 Lv.1~5 출혈은 다시 10에서
    const u = newGame({ targetScore: 2500 });
    u.enhance!.bleed.B = { turns: 1, amount: 96, stack: 1 };
    u.activeTeam = 'B';
    toChoice(u);
    processPass(u);
    expect(u.enhance!.bleed.B).toMatchObject({ turns: 0, amount: 0, stack: 0 });
  });

  it('상표토끼 — 지속 회복은 건 차례에는 들지 않고, 내 다음 차례가 끝날 때부터 든다(Lv.1~5는 2)', () => {
    const s = newGame({ targetScore: 200 });
    setLevel(s, 'A', 'rabbit', 3); // +8 · 지속 회복 3턴(턴당 2)
    toChoice(s);
    const { events } = processSkillChoice(s, 'rabbit');
    expect(events[0]).toMatchObject({ myHpDelta: 8, regenAdded: { turns: 3, amount: 2 } });
    expect(events.find(e => e.type === 'enhanceTick')).toBeUndefined();
    expect(s.teams.A.hp).toBe(208);
    expect(s.enhance!.regen.A).toMatchObject({ turns: 3, amount: 2 });
    toChoice(s);
    processPass(s); // B
    expect(s.teams.A.hp).toBe(208);
    toChoice(s);
    expect(processPass(s).events.find(e => e.type === 'enhanceTick')).toMatchObject({ team: 'A', kind: 'regen', amount: 2, turnsLeft: 2 });
    expect(s.teams.A.hp).toBe(210);

    // 이미 걸려 있던 몫은 다시 걸어도 이번 차례 끝에 그대로 든다 — 새로 더한 턴만 다음 차례부터
    const t = newGame({ targetScore: 200 });
    t.enhance!.regen.A = { turns: 2, amount: 2 };
    toChoice(t);
    processSkillChoice(t, 'rabbit'); // Lv.1 — +2 · 지속 회복 +1턴
    expect(t.teams.A.hp).toBe(200 + 2 + 2);
    expect(t.enhance!.regen.A.turns).toBe(2);
  });

  it('상표토끼 Lv.6+ — 회복 중첩이 쓸 때마다 쌓이고(최대 20), 한 턴의 양은 32 × 중첩', () => {
    const s = newGame({ targetScore: 2500 });
    setLevel(s, 'A', 'rabbit', 6);
    toChoice(s);
    applySkillChoice(s, 'A', 'rabbit');
    expect(s.enhance!.regen.A).toMatchObject({ turns: 5, amount: 32, stack: 1 });
    setLevel(s, 'A', 'rabbit', 7);
    applySkillChoice(s, 'A', 'rabbit');
    expect(s.enhance!.regen.A).toMatchObject({ turns: 10, amount: 96, stack: 3 });

    const t = newGame({ targetScore: 2500 });
    setLevel(t, 'A', 'rabbit', 11);
    t.enhance!.regen.A = { turns: 2, amount: 32 * 18, stack: 18 };
    toChoice(t);
    expect(applySkillChoice(t, 'A', 'rabbit')).toMatchObject({ regenAdded: { turns: 10, amount: 640, stackAdded: 2, stack: 20 } });
  });

  it('지속 회복은 최대 20턴, 출혈은 최대 40턴까지만 쌓인다 — 꽉 차면 턴은 그대로', () => {
    const s = newGame({ targetScore: 2500 });
    setLevel(s, 'A', 'tiger', 11);
    s.enhance!.bleed.B = { turns: 38, amount: 240, stack: 10 };
    toChoice(s);
    // 38 + 20 → 40에서 잘린다(더해진 것은 2턴)
    expect(processSkillChoice(s, 'tiger').events[0]).toMatchObject({ bleedAdded: { turns: 2, stack: 20 } });
    expect(s.enhance!.bleed.B.turns).toBe(40);

    const u = newGame({ targetScore: 2500 });
    u.enhance!.regen.A = { turns: 20, amount: 2 };
    toChoice(u);
    // 이미 20이면 아예 더하지 않는다(regenAdded 없음). 내 차례가 끝나며 한 번 들어 19가 남는다
    expect(processSkillChoice(u, 'rabbit').events[0]).not.toHaveProperty('regenAdded');
    expect(u.enhance!.regen.A.turns).toBe(19);
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

  it('특허랑이 Lv.6+ — 상대의 다음 1턴 동안 회복(기술 · 지속 회복)이 N% 줄고, 그 차례가 끝나면 풀린다', () => {
    const s = newGame({ targetScore: 500 });
    setLevel(s, 'A', 'tiger', 8); // −100 · 회복 효율 −30%
    toChoice(s);
    expect(processSkillChoice(s, 'tiger').events[0]).toMatchObject({ oppHpDelta: -100, healCutAdded: { pct: 30, turns: 1 } });
    s.enhance!.bleed.B = { turns: 0, amount: 0 }; // 회복만 보려고 출혈은 걷는다
    s.enhance!.regen.B = { turns: 2, amount: 32, stack: 1 };
    setLevel(s, 'B', 'rabbit', 4); // +16 → ×0.7 = 11
    toChoice(s);
    const { events } = processSkillChoice(s, 'rabbit');
    expect(events[0]).toMatchObject({ myHpDelta: 11, healCutUsed: 30 });
    // 그 차례 끝의 지속 회복도 줄어든다 — 32 × 0.7 = 22
    expect(events.find(e => e.type === 'enhanceTick')).toMatchObject({ kind: 'regen', amount: 22, healCutUsed: 30 });
    expect(s.teams.B.hp).toBe(400 + 11 + 22);
    expect(s.enhance!.healCut.B).toEqual({ turns: 0, pct: 0 });

    // Lv.Max는 −100%(회복 금지)
    const t = newGame({ targetScore: 2500 });
    setLevel(t, 'A', 'tiger', 11);
    toChoice(t);
    processSkillChoice(t, 'tiger');
    t.enhance!.bleed.B = { turns: 0, amount: 0 };
    toChoice(t);
    expect(processSkillChoice(t, 'rabbit').events[0]).toMatchObject({ myHpDelta: 0, healCutUsed: 100 });
  });

  it('특허랑이 Lv.Max — 상대의 이로운 효과(지속 회복과 중첩 · 배율 · 다음 턴 추가 뽑기 · 회피)를 모두 걷는다', () => {
    const s = newGame({ targetScore: 2500 });
    setLevel(s, 'A', 'tiger', 11);
    s.enhance!.regen.B = { turns: 5, amount: 64, stack: 2 };
    s.enhance!.evade!.B = 20;
    s.teams.B.pendingMultiplier = 7;
    s.teams.B.pendingExtraDraws = 12;
    toChoice(s);
    // 회피를 굴리는 첫 rng(0.99 → 99%)는 빗나간다
    const ev = applySkillChoice(s, 'A', 'tiger', undefined, () => 0.99);
    expect(ev).toMatchObject({ purged: { regenTurns: 5, multiplier: 7, extraDraws: 12 } });
    expect(s.enhance!.regen.B.turns).toBe(0);
    expect(s.enhance!.regen.B.stack ?? 0).toBe(0);
    expect(s.enhance!.evade!.B).toBe(0);
    expect(s.teams.B.pendingMultiplier).toBe(1);
    expect(s.teams.B.pendingExtraDraws).toBe(0);

    const t = newGame({ targetScore: 2500 });
    setLevel(t, 'A', 'tiger', 10);
    t.teams.B.pendingMultiplier = 7;
    toChoice(t);
    expect(processSkillChoice(t, 'tiger').events[0]).not.toHaveProperty('purged');
    expect(t.teams.B.pendingMultiplier).toBe(7);
  });

  it('디자인어 Lv.Max — 내 다음 차례까지 나를 노리는 기술을 20% 확률로 피한다(공격마다 따로 굴린다)', () => {
    const s = newGame({ targetScore: 200 });
    setLevel(s, 'A', 'mermaid', 11);
    toChoice(s);
    expect(processSkillChoice(s, 'mermaid').events[0]).toMatchObject({ evadeAdded: 20 });
    expect(s.enhance!.evade!.A).toBe(20);
    s.enhance!.divisors.B = 1; // 같은 기술의 ÷10은 걷어 두고 회피만 본다
    s.enhance!.divisorTurns.B = 0;
    // B 차례 — 0.1(10%)이면 피한다: 피해 · 출혈이 하나도 들지 않는다
    setLevel(s, 'B', 'tiger', 6);
    toChoice(s);
    const dodged = applySkillChoice(s, 'B', 'tiger', undefined, () => 0.1);
    expect(dodged).toMatchObject({ evaded: true, oppHpDelta: 0 });
    expect(dodged).not.toHaveProperty('bleedAdded');
    expect(s.teams.A.hp).toBe(200);
    expect(s.enhance!.bleed.A.turns).toBe(0);
    // 다음 공격은 다시 굴린다 — 0.5(50%)면 맞는다
    s.enhance!.cooldowns.B.tiger = 0;
    const hit = applySkillChoice(s, 'B', 'tiger', undefined, () => 0.5);
    expect(hit).not.toHaveProperty('evaded');
    expect(s.teams.A.hp).toBe(100);
    // 디자인어의 배율 나누기도 피한다 — 자기 배율은 그대로 오른다
    s.teams.A.pendingMultiplier = 12;
    setLevel(s, 'B', 'mermaid', 8);
    const div = applySkillChoice(s, 'B', 'mermaid', undefined, () => 0.1);
    expect(div).toMatchObject({ evaded: true, multiplierAfter: 5 });
    expect(div).not.toHaveProperty('oppMultiplierCut');
    expect(s.teams.A.pendingMultiplier).toBe(12);
    // 내 차례가 다시 오면 회피가 끝난다
    toChoice(s);
    processPass(s);
    expect(s.activeTeam).toBe('A');
    expect(s.enhance!.evade!.A).toBe(0);
  });

  it('상표토끼 Lv.6+ — 나에게 걸린 부정한 효과 하나의 남은 턴을 줄이고, Max는 정화한다(계수도 함께)', () => {
    const s = newGame({ targetScore: 200 });
    s.enhance!.bleed.A = { turns: 4, amount: 20 };
    setLevel(s, 'A', 'rabbit', 7);
    toChoice(s);
    const ev = processSkillChoice(s, 'rabbit').events[0];
    expect(ev).toMatchObject({ cleanse: { kind: 'bleed', before: 4, after: 2 } });
    // 정화로 2가 되고, 내 차례가 끝나며 한 번 들어 1이 남는다
    expect(s.enhance!.bleed.A.turns).toBe(1);

    const t = newGame({ targetScore: 2500 });
    t.enhance!.bleed.A = { turns: 4, amount: 112, stack: 2 };
    setLevel(t, 'A', 'rabbit', 11);
    toChoice(t);
    processSkillChoice(t, 'rabbit');
    expect(t.enhance!.bleed.A).toMatchObject({ turns: 0, amount: 0, stack: 0 });
  });

  it('상표토끼의 정화는 걸려 있는 효과 감소도 고를 수 있다(나눗셈은 쓴다고 사라지지 않는다)', () => {
    const s = newGame({ targetScore: 200 });
    s.enhance!.divisors.A = 10;
    s.enhance!.divisorTurns.A = 2;
    s.enhance!.bleed.A = { turns: 3, amount: 10 };
    setLevel(s, 'A', 'rabbit', 6); // 64 ÷10 = 6
    toChoice(s);
    const ev = applySkillChoice(s, 'A', 'rabbit', undefined, () => 0.99); // [출혈, 효과 감소] 중 뒤쪽
    expect(ev).toMatchObject({ myHpDelta: 6, divisorUsed: 10, cleanse: { kind: 'divisor', before: 2, after: 1 } });
    expect(s.enhance!.divisors.A).toBe(10);
  });

  it('디자인어 Lv.Max — 효과 감소는 상대 차례 2번이 끝나면 사라진다(그 사이 기술을 골라도 남는다)', () => {
    const s = newGame({ targetScore: 200 });
    setLevel(s, 'A', 'mermaid', 11);
    toChoice(s);
    expect(processSkillChoice(s, 'mermaid').events[0]).toMatchObject({ oppDivisor: 10, oppDivisorTurns: 2 });
    for (let i = 0; i < 2; i++) {
      expect(s.enhance!.divisors.B).toBe(10);
      toChoice(s); processPass(s); // B 넘김
      toChoice(s); processPass(s); // A 넘김
    }
    expect(s.enhance!.divisors.B).toBe(1);
    expect(s.enhance!.divisorTurns.B).toBe(0);
  });

  it('실용신양 Lv.6+ — 다른 카드 중 쿨타임이 걸린 카드의 쿨타임을 줄이고(배율 무관), Max는 두 장을 초기화한다(자기 자신은 빠진다)', () => {
    const s = newGame({ targetScore: 200 });
    s.enhance!.cooldowns.A = { sheep: 0, rabbit: 0, mermaid: 0, tiger: 3 };
    setLevel(s, 'A', 'sheep', 6);
    s.teams.A.pendingMultiplier = 5;
    toChoice(s);
    expect(applySkillChoice(s, 'A', 'sheep', undefined, rng0)).toMatchObject({ cooldownCuts: [{ animal: 'tiger', before: 3, after: 2 }] });

    const u = newGame({ targetScore: 200 });
    u.enhance!.cooldowns.A = { sheep: 0, rabbit: 0, mermaid: 0, tiger: 4 };
    setLevel(u, 'A', 'sheep', 10);
    toChoice(u);
    expect(applySkillChoice(u, 'A', 'sheep', undefined, rng0)).toMatchObject({ cooldownCuts: [{ animal: 'tiger', before: 4, after: 1 }] });

    const t = newGame({ targetScore: 200 });
    t.enhance!.cooldowns.A = { sheep: 0, rabbit: 2, mermaid: 4, tiger: 3 };
    setLevel(t, 'A', 'sheep', 11);
    toChoice(t);
    const ev = applySkillChoice(t, 'A', 'sheep', undefined, rng0);
    expect(ev).toMatchObject({ cooldownCuts: [{ animal: 'rabbit', after: 0 }, { animal: 'mermaid', after: 0 }] });
    expect(t.enhance!.cooldowns.A).toMatchObject({ rabbit: 0, mermaid: 0, tiger: 3 });
  });

  it('Lv.Max 별도 배수 — 임계값을 더 채울 때마다 ×1씩, 지금 걸린 배율에 곱한다(×7 × ×3 = ×21, 장수에만)', () => {
    const s = newGame({ targetScore: 2500 });
    s.teams.A.exp.sheep = 10 * 12; // Max(100) + 20 → ×3
    s.teams.A.pendingMultiplier = 7;
    toChoice(s);
    const ev = applySkillChoice(s, 'A', 'sheep', undefined, rng0);
    expect(ev).toMatchObject({ overMultiplier: 3, extraDrawsQueued: 64 * 21, randomExp: { animal: 'sheep', amount: 200 } });
  });

  it('Lv.Max 별도 배수는 디자인어 자신에게는 걸리지 않는다', () => {
    const s = newGame({ targetScore: 2500 });
    s.teams.A.exp.mermaid = 20 * 11; // ×2
    toChoice(s);
    const mermaid = processSkillChoice(s, 'mermaid').events[0];
    expect(mermaid).toMatchObject({ multiplierAfter: 5 });
    expect(mermaid).not.toHaveProperty('overMultiplier');
  });

  it('Lv.Max 별도 배수는 그 카드를 쓰면 ×1로 돌아간다 — 다음 배수까지 쌓던 나머지는 남는다', () => {
    const s = newGame({ targetScore: 2500 });
    s.teams.A.exp.sheep = 10 * 13 + 7; // Max(100) + 37 → ×4, 나머지 7
    toChoice(s);
    // 효과에는 ×4가 그대로 곱해지고, 그 뒤 (4 − 1) × 10 = 30을 깎는다(무작위 경험치는 디자인어에게)
    expect(applySkillChoice(s, 'A', 'sheep', undefined, () => 0.6)).toMatchObject({ overMultiplier: 4, extraDrawsQueued: 64 * 4, expSpent: 30 });
    expect(s.teams.A.exp.sheep).toBe(107);
    expect(expProgressFor(true, 'sheep', s.teams.A.exp.sheep)).toMatchObject({ level: 11, over: 1, inLevel: 7 });

    // 실용신양이 자기 자신에게 경험치를 더했으면 그 몫은 남는다(깎는 것은 쓰기 전의 배수 몫뿐)
    const t = newGame({ targetScore: 2500 });
    t.teams.A.exp.sheep = 137;
    toChoice(t);
    applySkillChoice(t, 'A', 'sheep', undefined, rng0); // 무작위 경험치 20 × 10이 실용신양에게
    expect(t.teams.A.exp.sheep).toBe(137 - 30 + 200);

    // Max가 아니면 깎을 것이 없다
    const v = newGame();
    setLevel(v, 'A', 'tiger', 10);
    toChoice(v);
    expect(applySkillChoice(v, 'A', 'tiger')).toMatchObject({ expSpent: 0 });
    expect(v.teams.A.exp.tiger).toBe(20 * 9);
  });
});

describe('강화 판 한계', () => {
  it(`예약 뽑기는 일반 판의 SHEEP_SAFETY_CAP(${SHEEP_SAFETY_CAP})이 아니라 ENHANCE_RESERVED_DRAW_CAP(${ENHANCE_RESERVED_DRAW_CAP})에서 자른다`, () => {
    const s = newGame();
    s.teams.A.pendingExtraDraws = 100;
    s.teams.A.pendingFestivalDraws = 70;
    const { events } = processPlayerAction(s, 'house', rng0);
    expect(events.find(e => e.type === 'bonusDraws')).toMatchObject({ count: 100 });
    expect(events.find(e => e.type === 'festivalDraws')).toMatchObject({ count: 70 });
    expect(s.teams.A.pendingExtraDraws).toBe(0);

    const t = newGame();
    t.teams.A.pendingExtraDraws = 256 * 100;
    const big = processPlayerAction(t, 'house', rng0).events;
    expect(big.find(e => e.type === 'bonusDraws')).toMatchObject({ count: ENHANCE_RESERVED_DRAW_CAP });
    expect(t.teams.A.pendingExtraDraws).toBe(0);
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
      .filter(e => e.type === 'skillApplied' && e.team === 'B');
    expect(bSkills.length).toBe(2);
    expect(lastState(ws).activeTeam).toBe('A');
    expect(ws.sent.some(m => m.type === 'error')).toBe(false);
  });
});
