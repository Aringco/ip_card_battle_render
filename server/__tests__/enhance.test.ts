import type { Animal, ClientGameState, GameState, ServerMessage } from 'shared';
import {
  ANIMALS,
  ENHANCE_PLACE_DRAWS,
  ENHANCE_SETTINGS,
  ENHANCE_USE_EXP,
  ENHANCE_TARGET_SCORE_MAX,
  SHEEP_SAFETY_CAP,
  SETTINGS_LIMITS,
  clampEnhanceSettings,
  clampSettings,
  PLAYER_COLORS,
  enhancePlaceDrawCount,
  enhanceSkillsPerTurn,
  THRESHOLDS,
  enhanceCooldown,
  enhanceCooldownShown,
  enhanceCardTier,
  enhanceLevel,
  enhanceMermaidAfter,
  enhanceValue,
  expProgressFor,
  maxTurnOf,
  rollDrawStep,
  enhancePlaceDrawRange,
  enhanceSlamLandMs,
  splitEnhanceCount,
  enhanceDenomTier,
} from 'shared';
import { settleStacks } from '../engine/drawCard';
import { initEnhanceGame, initIndividualGame } from '../engine/turnManager';
import { processPass, processPlayerAction, processSkillChoice, processTimeout } from '../engine/gameEngine';
import { applySkillChoice, eligibleAnimals, levelOf } from '../engine/skills';
import { Room } from '../room';
import { settleGraceMs } from '../settleTiming';

/**
 * 혼자 놀기 '카드 강화'(shared/enhance.ts · ENHANCE_MODE.md) — 엔진 규칙과 방의 시작·컴퓨터.
 * 혼자 놀기와 같은 팀전 1:1(A = 나, B = 컴퓨터) 위에 얹은 판이다.
 * 엔진 테스트는 결정론적 RNG(rng0 = 언제나 0번째 선택)로 상태를 직접 만진다(effects.test.ts와 같은 방식).
 */

const rng0 = () => 0;

/**
 * 목표 500(시작 체력 500 · 승리 1000 — 기본 규칙과 같다)으로 둔다. 6차 표는 Lv.1부터 효과가 커서(특허랑이 −42 · 상표토끼 +27)
 * 예전처럼 목표 25로 두면 기술 한 번에 판이 끝난다.
 */
function newGame(overrides: Partial<typeof ENHANCE_SETTINGS> = {}): GameState {
  // 도토리 축제(카드 고르기 — acorn.test.ts가 따로 잰다)는 끈다: 고르는 동안 판이 멈춰 턴을 넘기는 아래 반복이 서 버린다
  // 후공 보상도 끈다 — 경험치를 정확한 숫자로 재는 테스트가 많다(보상 자체는 맨 아래 "후공 보상" 절)
  return initEnhanceGame(['나'], ['CPU'], rng0, { ...ENHANCE_SETTINGS, targetScore: 500, festivalTurn: 999, secondComp: 'off', ...overrides });
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

  it('쿨타임 — 승격 때만 오른다: 양·토끼 0/1/2, 인어·호랑이 1/2/3 (Lv.1~5 / 6~10 / Max)', () => {
    expect([1, 2, 3, 4, 5].map(l => enhanceCooldown('sheep', l))).toEqual([0, 0, 0, 0, 0]);
    expect([1, 2, 3, 4, 5].map(l => enhanceCooldown('rabbit', l))).toEqual([0, 0, 0, 0, 0]);
    expect([1, 2, 3, 4, 5].map(l => enhanceCooldown('mermaid', l))).toEqual([1, 1, 1, 1, 1]);
    expect([1, 2, 3, 4, 5].map(l => enhanceCooldown('tiger', l))).toEqual([1, 1, 1, 1, 1]);
    // 금 등급(Lv.6)에서 +1, Lv.6~10 사이에서는 늘지 않는다
    expect([6, 10].map(l => enhanceCooldown('sheep', l))).toEqual([1, 1]);
    expect([6, 10].map(l => enhanceCooldown('tiger', l))).toEqual([2, 2]);
    // 무지개 등급(Lv.Max)에서 또 +1 — 실용신양·상표토끼 2 · 디자인어·특허랑이 3
    expect(ANIMALS.map(a => enhanceCooldown(a, 11))).toEqual([2, 2, 3, 3]);
  });

  it('디자인어 배율 — 처음엔 그 레벨의 배율, 걸려 있으면 증가량을 더하되(6차 표는 곱하는 레벨이 없다), 새로 거는 값보다 작아지지 않는다', () => {
    expect(enhanceMermaidAfter(1, 1)).toBe(2);
    expect(enhanceMermaidAfter(2, 1)).toBe(3);
    expect(enhanceMermaidAfter(8, 5)).toBe(11);  // 8 + 3
    expect(enhanceMermaidAfter(2, 4)).toBe(5);   // 2 + 3
    expect(enhanceMermaidAfter(1, 6)).toBe(4);
    expect(enhanceMermaidAfter(2, 7)).toBe(6);   // 2 + 4 = 6 > 새로 거는 ×5
    expect(enhanceMermaidAfter(10, 7)).toBe(14); // 10 + 4 — 곱하지 않는다(5차 표는 ×30)
    expect(enhanceMermaidAfter(30, 10)).toBe(36);
    expect(enhanceMermaidAfter(1, 11)).toBe(8);
    expect(enhanceMermaidAfter(5, 11)).toBe(13); // Max는 +8
  });

  it('디자인어는 레벨마다 무언가 오른다 — 처음 배율과 겹칠 때 더하는 양이 번갈아 하나씩', () => {
    const shape = (l: number) => [enhanceValue('mermaid', l), enhanceMermaidAfter(2, l) - 2];
    for (let l = 2; l <= 11; l++) expect(shape(l)).not.toEqual(shape(l - 1));
  });
});

describe('카드 등급 — 브론즈 · 실버 · 골드 · 무지개', () => {
  it('브론즈 Lv.1~3 · 실버 Lv.4~7 · 골드 Lv.8~10 · 무지개 Max', () => {
    const lv = Array.from({ length: 11 }, (_, i) => i + 1);
    expect(lv.map(l => enhanceCardTier(l))).toEqual([...Array(3).fill('bronze'), ...Array(4).fill('silver'), ...Array(3).fill('gold'), 'rainbow']);
  });

  it('등급의 경계는 화면만 정한다 — 규칙의 계단(쿨타임 +1)은 그대로 Lv.6 · Max', () => {
    expect([5, 6, 7, 8, 10, 11].map(l => enhanceCooldown('tiger', l))).toEqual([1, 2, 2, 2, 2, 3]);
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
    expect(s.teams.A.hp).toBe(500);
  });

  it('선은 firstTeam으로 — A는 사람, B는 컴퓨터', () => {
    expect(newGame({ firstTeam: 'A' }).activeTeam).toBe('A');
    expect(newGame({ firstTeam: 'B' }).activeTeam).toBe('B');
  });

  it('장소를 누르면 여러 장 — 동물 2종 장소(오두막·부둣가) 1~3장, 3종 장소(숲길·강가) 4~6장(3장 단위 단계)', () => {
    expect(ENHANCE_PLACE_DRAWS).toEqual({ 2: [1, 3], 3: [4, 6] });
    const lo = () => 0;
    const hi = () => 0.9999;
    expect([enhancePlaceDrawCount('house', lo), enhancePlaceDrawCount('house', hi)]).toEqual([1, 3]);
    expect([enhancePlaceDrawCount('dock', lo), enhancePlaceDrawCount('dock', hi)]).toEqual([1, 3]);
    expect([enhancePlaceDrawCount('forest_road', lo), enhancePlaceDrawCount('forest_road', hi)]).toEqual([4, 6]);
    expect([enhancePlaceDrawCount('river_road', lo), enhancePlaceDrawCount('river_road', hi)]).toEqual([4, 6]);

    const s = newGame();
    for (const a of ANIMALS) s.stacks[a] = [];
    const { events } = processPlayerAction(s, 'forest_road', lo);
    // 4장 = 1 네 장(×5 아래)
    expect(events[0]).toMatchObject({ type: 'placeDraws', place: 'forest_road', count: 4, total: 4 });
    expect(events.filter(e => e.type === 'draw').length).toBe(4);
  });

  it('도토리 축제(2026-11-06 — 도토리 카드 고르기)는 장소의 장수를 바꾸지 않는다 — 늘 오두막 1~3장 · 숲길 4~6장', () => {
    expect(enhancePlaceDrawRange('house')).toEqual([1, 3]);
    expect(enhancePlaceDrawRange('forest_road')).toEqual([4, 6]);
    const s = newGame({ festivalTurn: 1 });
    expect(s.enhance!.acorn!.offer).not.toBeNull(); // 1턴 축제 — 고르기부터
    s.enhance!.acorn!.offer = null;
    const { events } = processPlayerAction(s, 'house', () => 0);
    expect(events.find(e => e.type === 'placeDraws')).toMatchObject({ place: 'house', total: 1 });
    expect(events.some(e => e.type === 'festivalDraws')).toBe(false);
  });

  it('나온 장수는 동물마다 배수 카드(×1000 · ×100 · ×10 · ×5 · 1)로 묶이고, 짝은 카드가 뜻하는 장수의 합으로 센다', () => {
    expect(splitEnhanceCount(128)).toEqual([1, 1, 1, 5, 10, 10, 100]);
    expect(splitEnhanceCount(2345)).toEqual([5, 10, 10, 10, 10, 100, 100, 100, 2000]);
    expect(splitEnhanceCount(53210)).toEqual([10, 100, 100, 3000, 50000]);
    expect([999, 1000, 9999, 10000, 50000].map(enhanceDenomTier)).toEqual([999, 1000, 1000, 10000, 10000]);
    expect(splitEnhanceCount(0)).toEqual([]);

    // 숲길에서 예약 201장 + 장소 4장 = 205장(홀수), rng0이면 모두 0번째 동물
    const s = newGame();
    for (const a of ANIMALS) s.stacks[a] = [];
    s.stacks.tiger.push({ id: 90003, animal: 'tiger', num: 1, collectedBy: null }); // 싹쓸이 방지
    s.teams.A.pendingExtraDraws = 201;
    const { events } = processPlayerAction(s, 'forest_road', rng0);
    const draws = events.filter(e => e.type === 'draw').map(e => (e.type === 'draw' ? e.card.num : 0));
    expect(draws).toEqual([1, 100, 100, 1, 1, 1, 1]);
    // 205(홀수)는 정산되지 않는다
    const animal = (events.find(e => e.type === 'draw') as Extract<typeof events[number], { type: 'draw' }>).card.animal;
    expect(s.stacks[animal].filter(c => c.collectedBy === null).reduce((n, c) => n + c.num, 0)).toBe(205);
    expect(events.some(e => e.type === 'collect')).toBe(false);
    // 한 장 더(합 짝수)면 장수의 합만큼 경험치가 오른다
    s.stacks[animal].push({ id: 90004, animal, num: 1, collectedBy: null });
    const settled = settleStacks(s, rng0);
    expect(settled).toEqual([expect.objectContaining({ type: 'collect', animal, exp: 412 })]); // 승격 전이라 2배
  });
});

describe('강화 판 짝', () => {
  it('승격 전(Lv.1~3)만 짝 경험치가 2배 — 승격(Lv.4)부터는 그대로', () => {
    for (const [exp, gained] of [[29, 8], [30, 4]] as const) { // 상표토끼 임계값 10: 29 = Lv.3 · 30 = Lv.4
      const s = newGame();
      for (const a of ANIMALS) s.stacks[a] = [];
      s.teams[s.activeTeam].exp.rabbit = exp;
      for (let id = 0; id < 4; id++) s.stacks.rabbit.push({ id: 90010 + id, animal: 'rabbit', num: 1, collectedBy: null });
      expect(settleStacks(s, rng0)).toEqual([expect.objectContaining({ type: 'collect', animal: 'rabbit', exp: gained })]);
    }
  });

  it('뽑는 카드는 모두 1이고, 짝이 맞으면 모인 장수만큼 경험치만 오른다 — 그 카드의 기술은 발동하지 않는다(2026-10-31 짝 효과 해제)', () => {
    const s = newGame();
    for (const a of ANIMALS) s.stacks[a] = [];
    s.stacks.tiger.push({ id: 90002, animal: 'tiger', num: 1, collectedBy: null }); // 필드를 비우지 않는 구경꾼(비면 싹쓸이)
    processPlayerAction(s, 'dock', rng0); // 부둣가 1장 — 0번째 동물(인어)
    expect(s.stacks.mermaid.map(c => c.num)).toEqual([1]);
    processPass(s);
    const { events } = processPlayerAction(s, 'forest_road', rng0); // 숲길 4장 — 모두 토끼 → 4장 짝
    expect(s.stacks.rabbit.filter(c => c.collectedBy === 'B').length).toBe(4);
    expect(s.teams.B.exp.rabbit).toBe(8); // 4장 × 승격 전 2배
    expect(events.some(e => e.type === 'skillApplied')).toBe(false);
    expect(s.teams.B.hp).toBe(500);
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
    // 줄지 않고 오히려 쓴 카드에 경험치가 붙는다(2026-11-07 — 실용신양 · 상표토끼 +1, 디자인어 · 특허랑이 +2)
    expect(s.teams.A.exp.rabbit).toBe(before + ENHANCE_USE_EXP.rabbit);
  });

  // 즉시 회복 · 지속 회복 턴 · 한 턴의 양 = 즉시 회복의 50%(2026-11-07 — 중첩 없음)
  it.each([
    [1, 25, 1, 13], [2, 35, 1, 18], [3, 42, 2, 21], [4, 47, 2, 24], [5, 50, 2, 25],
    [6, 53, 2, 27], [7, 55, 3, 28], [8, 57, 3, 29], [9, 58, 3, 29], [10, 60, 3, 30], [11, 73, 4, 37],
  ])('상표토끼 Lv.%i → 체력 +%i · 지속 회복 +%i턴(한 턴 +%i)', (level, gain, regen, tick) => {
    const s = newGame({ targetScore: 200 });
    setLevel(s, 'A', 'rabbit', level);
    toChoice(s);
    const ev = processSkillChoice(s, 'rabbit').events[0];
    expect(s.teams.A.hp).toBe(200 + gain);
    expect(ev).toMatchObject({ regenAdded: { turns: regen, amount: tick } });
  });

  // 보호막 = 즉시 회복의 등급별 %(브론즈 20 · 실버 30 · 골드 40 · Max 60 — 2026-11-17), 상한 없음
  it.each([
    [1, 5], [3, 8], [4, 14], [7, 17], [8, 23], [10, 24], [11, 44],
  ])('상표토끼 Lv.%i → 보호막 +%i', (level, shield) => {
    const s = newGame({ targetScore: 200 });
    setLevel(s, 'A', 'rabbit', level);
    toChoice(s);
    const ev = processSkillChoice(s, 'rabbit').events[0];
    expect(ev).toMatchObject({ shieldAdded: shield });
    expect(s.enhance!.shield!.A).toBe(shield);
  });

  it('상표토끼 보호막은 상한 없이 쌓인다', () => {
    const s = newGame({ targetScore: 200 });
    setLevel(s, 'A', 'rabbit', 11);
    s.enhance!.shield = { A: 30, B: 0 };
    toChoice(s);
    expect(processSkillChoice(s, 'rabbit').events[0]).toMatchObject({ shieldAdded: 44 });
    expect(s.enhance!.shield!.A).toBe(74);
  });

  it.each([
    [1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [6, 9], [7, 9], [8, 10], [9, 10], [10, 11], [11, 14],
  ])('실용신양 Lv.%i → 다음 턴 추가 뽑기 %i장', (level, draws) => {
    const s = newGame();
    setLevel(s, 'A', 'sheep', level);
    toChoice(s);
    processSkillChoice(s, 'sheep');
    expect(s.teams.A.pendingExtraDraws).toBe(draws);
  });

  // 출혈 한 턴의 양 = 공격력의 50%(2026-11-07 — 계수 없음)
  it.each([
    [1, 44, 1, 22], [2, 68, 2, 34], [3, 82, 2, 41], [4, 92, 3, 46], [5, 100, 3, 50],
    [6, 106, 3, 53], [7, 111, 3, 56], [8, 115, 3, 58], [9, 119, 3, 60], [10, 122, 3, 61], [11, 146, 4, 73],
  ])('특허랑이 Lv.%i → 상대 −%i · 출혈 +%i턴(한 턴 −%i, 내 체력은 그대로)', (level, dmg, bleed, tick) => {
    const s = newGame({ targetScore: 2500 });
    setLevel(s, 'A', 'tiger', level);
    toChoice(s);
    const ev = processSkillChoice(s, 'tiger').events[0];
    // 출혈은 상대의 차례가 **끝날 때** 든다 — 내 기술로 차례가 넘어간 지금은 아직 즉시 피해뿐이다
    expect(s.teams.B.hp).toBe(2500 - dmg);
    expect(s.teams.A.hp).toBe(2500);
    expect(ev).toMatchObject({ myHpDelta: 0, bleedAdded: { turns: bleed, amount: tick } });
  });

  it('디자인어 배율은 다음 기술의 효과에 곱해지고, 쓴 뒤 1로 돌아간다', () => {
    const s = newGame();
    setLevel(s, 'A', 'mermaid', 1); // ×2
    setLevel(s, 'A', 'tiger', 1);   // −44
    toChoice(s);
    processSkillChoice(s, 'mermaid');
    expect(s.teams.A.pendingMultiplier).toBe(2);
    cycle(s);
    processSkillChoice(s, 'tiger');
    expect(s.teams.B.hp).toBe(500 - 88);
    expect(s.teams.A.pendingMultiplier).toBe(1);
  });

  it('실용신양 — 배율은 장수에만 걸리고, 무작위 카드의 경험치는 표의 값 × 경험치 중첩 배수(Lv.6+ 그 한 번의 곱)', () => {
    const s = newGame();
    setLevel(s, 'A', 'sheep', 3);
    s.teams.A.pendingMultiplier = 2;
    toChoice(s);
    const ev = applySkillChoice(s, 'A', 'sheep', undefined, () => 0.6); // ANIMALS[2] = 디자인어
    expect(ev).toMatchObject({ extraDrawsQueued: 12, randomExp: { animal: 'mermaid', amount: 14 } });
    expect(ev).not.toHaveProperty('randomExp.stack');
    expect(s.teams.A.exp.mermaid).toBe(14);

    // Lv.7 — 경험치 9 × 중첩 배수 2 = 18(배율 2는 장수에만 — 9 × 2 = 18장)
    const t = newGame();
    setLevel(t, 'A', 'sheep', 7);
    t.teams.A.pendingMultiplier = 2;
    toChoice(t);
    expect(applySkillChoice(t, 'A', 'sheep', undefined, () => 0.6)).toMatchObject({
      extraDrawsQueued: 18, randomExp: { animal: 'mermaid', amount: 18, stack: 2 },
    });
    expect(t.teams.A.exp.mermaid).toBe(18);

    // Lv.Max — 14장 · 경험치 12 × 3 = 36
    const u = newGame();
    setLevel(u, 'A', 'sheep', 11);
    toChoice(u);
    expect(applySkillChoice(u, 'A', 'sheep', undefined, () => 0.6)).toMatchObject({
      extraDrawsQueued: 14, randomExp: { animal: 'mermaid', amount: 36, stack: 3 },
    });
  });

  it('디자인어 Lv.6부터 — 상대가 쌓아 둔 배율을 ÷N(반올림, ×1 아래로는 안 내려간다), Max는 ×1로', () => {
    const s = newGame();
    setLevel(s, 'A', 'mermaid', 9); // 상대 배율 ÷3
    s.teams.B.pendingMultiplier = 12;
    toChoice(s);
    expect(processSkillChoice(s, 'mermaid').events[0]).toMatchObject({ oppMultiplierCut: 8 });
    expect(s.teams.B.pendingMultiplier).toBe(4);
    expect(s.teams.A.pendingMultiplier).toBe(6);
    const t = newGame();
    setLevel(t, 'A', 'mermaid', 11);
    t.teams.B.pendingMultiplier = 50;
    toChoice(t);
    processSkillChoice(t, 'mermaid');
    expect(t.teams.B.pendingMultiplier).toBe(1);
    expect(t.teams.A.pendingMultiplier).toBe(8);
  });

  it('디자인어 Lv.Max만 상대 기술 효과 ÷2(1턴)를 건다 — 다시 걸면 턴을 더하고 최대 3턴', () => {
    const s = newGame();
    setLevel(s, 'A', 'mermaid', 10);
    toChoice(s);
    expect(processSkillChoice(s, 'mermaid').events[0]).not.toHaveProperty('oppDivisor');
    expect(s.enhance!.divisors.B).toBe(1);

    const t = newGame();
    setLevel(t, 'A', 'mermaid', 11);
    toChoice(t);
    expect(processSkillChoice(t, 'mermaid').events[0]).toMatchObject({ oppDivisor: 2, oppDivisorTurns: 1 });
    expect(t.enhance!.divisors.B).toBe(2);

    const u = newGame();
    setLevel(u, 'A', 'mermaid', 11);
    u.enhance!.divisors.B = 2;
    u.enhance!.divisorTurns.B = 3;
    toChoice(u);
    expect(processSkillChoice(u, 'mermaid').events[0]).toMatchObject({ oppDivisorTurns: 3 });
  });

  it('나눗셈은 걸려 있는 동안 고르는 기술마다 쓰이고(반올림) 남는다 — 디자인어는 나뉘지 않는다', () => {
    const s = newGame({ targetScore: 200 }); // 지속 회복이 쌓여도 승리선에 닿지 않게
    s.enhance!.divisors.A = 10;
    s.enhance!.divisorTurns.A = 3;
    setLevel(s, 'A', 'rabbit', 4); // +47 ÷10 = 5
    toChoice(s);
    expect(processSkillChoice(s, 'rabbit').events[0]).toMatchObject({ myHpDelta: 5, divisorUsed: 10 });
    expect(s.enhance!.divisors.A).toBe(10);
    expect(s.enhance!.divisorTurns.A).toBe(2); // 내 차례가 끝나며 하나 준다
    cycle(s);
    expect(processSkillChoice(s, 'tiger').events[0]).toMatchObject({ oppHpDelta: -4, divisorUsed: 10 });
    cycle(s);
    const mermaid = processSkillChoice(s, 'mermaid').events[0];
    expect(mermaid).toMatchObject({ multiplierAfter: 2 });
    expect(mermaid).not.toHaveProperty('divisorUsed');
    expect(s.enhance!.divisors.A).toBe(1); // 3턴이 다 지나 사라졌다
  });

  it('나눗셈의 소수점은 반올림 — 특허랑이 Lv.1(−44) ÷10 = 4, 상표토끼 Lv.1(+25) ÷10 = 3(2.5 반올림)', () => {
    const s = newGame();
    s.enhance!.divisors.A = 10;
    s.enhance!.divisorTurns.A = 1;
    toChoice(s);
    processSkillChoice(s, 'tiger');
    expect(s.teams.B.hp).toBe(496);
    const u = newGame();
    u.enhance!.divisors.A = 10;
    u.enhance!.divisorTurns.A = 1;
    toChoice(u);
    processSkillChoice(u, 'rabbit');
    expect(u.teams.A.hp).toBe(503);
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

  it('쿨타임 — 상표토끼 Lv.1~5는 매 차례 쓸 수 있고, 금 등급(Lv.6)부터 한 차례 쉰다', () => {
    const s = newGame();
    setLevel(s, 'A', 'rabbit', 5);
    toChoice(s);
    processSkillChoice(s, 'rabbit');
    expect(s.enhance!.cooldowns.A.rabbit).toBe(0);
    setLevel(s, 'A', 'rabbit', 6);
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

describe('강화 판 지속 효과 · 중첩 · 회복 효율 · 정화 · 쿨타임 감소 · 회피 · Max 별도 배수(6차 표)', () => {
  it('특허랑이 — 출혈은 상대가 기술을 모두 쓰고 차례가 끝날 때마다 든다(한 턴의 양 = 배율까지 든 공격력의 50%)', () => {
    const s = newGame({ targetScore: 500 });
    setLevel(s, 'A', 'tiger', 5);
    s.teams.A.pendingMultiplier = 3; // 100 × 3 = 300 → 출혈 150
    toChoice(s);
    const { events } = processSkillChoice(s, 'tiger');
    expect(events[0]).toMatchObject({ oppHpDelta: -300, bleedAdded: { turns: 3, amount: 150 } });
    // 내 차례가 끝나 상대 차례가 시작될 때는 들지 않는다
    expect(events.find(e => e.type === 'enhanceTick')).toBeUndefined();
    expect(s.teams.B.hp).toBe(500 - 300);
    expect(s.enhance!.bleed.B).toMatchObject({ turns: 3, amount: 150 });
    // B가 자기 차례(발동 턴의 다음 턴)를 마치는 순간 든다
    toChoice(s);
    const end = processPass(s).events;
    expect(end.find(e => e.type === 'enhanceTick')).toMatchObject({ team: 'B', kind: 'bleed', amount: 150, turnsLeft: 2 });
    expect(s.teams.B.hp).toBe(50);
    // 내 차례가 끝날 때는 B의 출혈이 들지 않는다
    toChoice(s);
    processPass(s);
    expect(s.teams.B.hp).toBe(50);
  });

  it('출혈 · 지속 회복은 쌓이지 않는다 — 다시 걸면 턴만 더하고 한 턴의 양은 새로 건 값(카드 수치의 50%)', () => {
    const s = newGame({ targetScore: 2500 });
    setLevel(s, 'A', 'tiger', 6);
    toChoice(s);
    applySkillChoice(s, 'A', 'tiger');
    expect(s.enhance!.bleed.B).toMatchObject({ turns: 3, amount: 53 });
    applySkillChoice(s, 'A', 'tiger');
    expect(s.enhance!.bleed.B).toMatchObject({ turns: 6, amount: 53 });
    setLevel(s, 'A', 'rabbit', 11);
    applySkillChoice(s, 'A', 'rabbit');
    applySkillChoice(s, 'A', 'rabbit');
    expect(s.enhance!.regen.A).toMatchObject({ turns: 8, amount: 37 });
    expect(s.enhance!.regen.A).not.toHaveProperty('stack');
  });

  it('상표토끼 — 지속 회복은 건 차례에는 들지 않고, 내 다음 차례가 끝날 때부터 든다(한 턴의 양 = 즉시 회복의 50%)', () => {
    const s = newGame({ targetScore: 200 });
    setLevel(s, 'A', 'rabbit', 3); // +42 · 지속 회복 2턴(턴당 21)
    toChoice(s);
    const { events } = processSkillChoice(s, 'rabbit');
    expect(events[0]).toMatchObject({ myHpDelta: 42, regenAdded: { turns: 2, amount: 21 } });
    expect(events.find(e => e.type === 'enhanceTick')).toBeUndefined();
    expect(s.teams.A.hp).toBe(242);
    expect(s.enhance!.regen.A).toMatchObject({ turns: 2, amount: 21 });
    toChoice(s);
    processPass(s); // B
    expect(s.teams.A.hp).toBe(242);
    toChoice(s);
    expect(processPass(s).events.find(e => e.type === 'enhanceTick')).toMatchObject({ team: 'A', kind: 'regen', amount: 21, turnsLeft: 1 });
    expect(s.teams.A.hp).toBe(263);

    // 이미 걸려 있던 몫은 다시 걸어도 이번 차례 끝에 그대로 든다 — 새로 더한 턴만 다음 차례부터
    const t = newGame({ targetScore: 200 });
    t.enhance!.regen.A = { turns: 2, amount: 4 };
    toChoice(t);
    processSkillChoice(t, 'rabbit'); // Lv.1 — +25 · 지속 회복 +1턴
    // 한 턴의 양은 새로 건 값(25의 50% = 13)으로 바뀐다
    expect(t.teams.A.hp).toBe(200 + 25 + 13);
    expect(t.enhance!.regen.A.turns).toBe(2);
  });

  it('지속 회복은 최대 8턴, 출혈은 최대 12턴까지만 쌓인다 — 꽉 차면 턴은 그대로', () => {
    const s = newGame({ targetScore: 2500 });
    setLevel(s, 'A', 'tiger', 11);
    s.enhance!.bleed.B = { turns: 10, amount: 45 };
    toChoice(s);
    // 10 + 4 → 12에서 잘린다(더해진 것은 2턴)
    expect(processSkillChoice(s, 'tiger').events[0]).toMatchObject({ bleedAdded: { turns: 2, amount: 73 } });
    expect(s.enhance!.bleed.B.turns).toBe(12);

    const u = newGame({ targetScore: 2500 });
    u.enhance!.regen.A = { turns: 8, amount: 4 };
    toChoice(u);
    // 이미 8이면 턴은 더하지 않고 한 턴의 양만 새 값(25의 50%)으로. 내 차례가 끝나며 한 번 들어 7이 남는다
    expect(processSkillChoice(u, 'rabbit').events[0]).toMatchObject({ regenAdded: { turns: 0, amount: 13 } });
    expect(u.enhance!.regen.A.turns).toBe(7);
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
    setLevel(s, 'A', 'tiger', 8); // −115 · 회복 효율 −30%
    toChoice(s);
    expect(processSkillChoice(s, 'tiger').events[0]).toMatchObject({ oppHpDelta: -115, healCutAdded: { pct: 30, turns: 1 } });
    s.enhance!.bleed.B = { turns: 0, amount: 0 }; // 회복만 보려고 출혈은 걷는다
    s.enhance!.regen.B = { turns: 2, amount: 20 };
    setLevel(s, 'B', 'rabbit', 4); // +47 → ×0.7 = 33
    toChoice(s);
    const { events } = processSkillChoice(s, 'rabbit');
    expect(events[0]).toMatchObject({ myHpDelta: 33, healCutUsed: 30 });
    // 그 차례 끝의 지속 회복도 줄어든다 — 이번에 건 47의 50%(24) × 0.7 = 17
    expect(events.find(e => e.type === 'enhanceTick')).toMatchObject({ kind: 'regen', amount: 17, healCutUsed: 30 });
    expect(s.teams.B.hp).toBe(385 + 33 + 17);
    expect(s.enhance!.healCut.B).toEqual({ turns: 0, pct: 0 });

    // Lv.Max는 −60%(6차 표 — 회복 금지는 상표토끼를 통째로 지워 두지 않는다): +25 → ×0.4 = 10
    const t = newGame({ targetScore: 2500 });
    setLevel(t, 'A', 'tiger', 11);
    toChoice(t);
    processSkillChoice(t, 'tiger');
    t.enhance!.bleed.B = { turns: 0, amount: 0 };
    toChoice(t);
    expect(processSkillChoice(t, 'rabbit').events[0]).toMatchObject({ myHpDelta: 10, healCutUsed: 60 });
  });

  it('특허랑이 Lv.Max — 상대의 이로운 효과(지속 회복 · 배율 · 다음 턴 추가 뽑기 · 회피)를 모두 걷는다', () => {
    const s = newGame({ targetScore: 2500 });
    setLevel(s, 'A', 'tiger', 11);
    s.enhance!.regen.B = { turns: 5, amount: 64 };
    s.enhance!.evade!.B = 20;
    s.teams.B.pendingMultiplier = 7;
    s.teams.B.pendingExtraDraws = 12;
    toChoice(s);
    // 회피를 굴리는 첫 rng(0.99 → 99%)는 빗나간다
    const ev = applySkillChoice(s, 'A', 'tiger', undefined, () => 0.99);
    expect(ev).toMatchObject({ purged: { regenTurns: 5, multiplier: 7, extraDraws: 12 } });
    expect(s.enhance!.regen.B.turns).toBe(0);
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
    expect(s.teams.A.hp).toBe(200 - 106);
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

  it('상표토끼 Lv.6+ — 나에게 걸린 부정한 효과 하나의 남은 턴을 줄이고, Max는 정화한다', () => {
    const s = newGame({ targetScore: 200 });
    s.enhance!.bleed.A = { turns: 4, amount: 20 };
    setLevel(s, 'A', 'rabbit', 7);
    toChoice(s);
    const ev = processSkillChoice(s, 'rabbit').events[0];
    expect(ev).toMatchObject({ cleanse: { kind: 'bleed', before: 4, after: 3 } });
    // 정화(Lv.7 −1턴)로 3이 되고, 내 차례가 끝나며 한 번 들어 2가 남는다
    expect(s.enhance!.bleed.A.turns).toBe(2);

    const t = newGame({ targetScore: 2500 });
    t.enhance!.bleed.A = { turns: 4, amount: 112 };
    setLevel(t, 'A', 'rabbit', 11);
    toChoice(t);
    processSkillChoice(t, 'rabbit');
    expect(t.enhance!.bleed.A).toMatchObject({ turns: 0, amount: 0 });
  });

  it('상표토끼의 정화는 걸려 있는 효과 감소도 고를 수 있다(나눗셈은 쓴다고 사라지지 않는다)', () => {
    const s = newGame({ targetScore: 200 });
    s.enhance!.divisors.A = 10;
    s.enhance!.divisorTurns.A = 2;
    s.enhance!.bleed.A = { turns: 3, amount: 10 };
    setLevel(s, 'A', 'rabbit', 6); // 53 ÷10 = 5
    toChoice(s);
    const ev = applySkillChoice(s, 'A', 'rabbit', undefined, () => 0.99); // [출혈, 효과 감소] 중 뒤쪽
    expect(ev).toMatchObject({ myHpDelta: 5, divisorUsed: 10, cleanse: { kind: 'divisor', before: 2, after: 1 } });
    expect(s.enhance!.divisors.A).toBe(10);
  });

  it('디자인어 Lv.Max — 효과 감소는 상대 차례가 끝나면 사라진다(다시 걸어 3턴까지 쌓으면 그만큼 남는다)', () => {
    const s = newGame({ targetScore: 200 });
    setLevel(s, 'A', 'mermaid', 11);
    s.enhance!.divisors.B = 2;
    s.enhance!.divisorTurns.B = 1;
    toChoice(s);
    expect(processSkillChoice(s, 'mermaid').events[0]).toMatchObject({ oppDivisor: 2, oppDivisorTurns: 2 });
    for (let i = 0; i < 2; i++) {
      expect(s.enhance!.divisors.B).toBe(2);
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
    expect(applySkillChoice(u, 'A', 'sheep', undefined, rng0)).toMatchObject({ cooldownCuts: [{ animal: 'tiger', before: 4, after: 2 }] });

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
    expect(ev).toMatchObject({ overMultiplier: 3, extraDrawsQueued: 14 * 21, randomExp: { animal: 'sheep', amount: 36 } });
  });

  it('Lv.Max 별도 배수는 디자인어 자신에게는 걸리지 않는다', () => {
    const s = newGame({ targetScore: 2500 });
    s.teams.A.exp.mermaid = 20 * 11; // ×2
    toChoice(s);
    const mermaid = processSkillChoice(s, 'mermaid').events[0];
    expect(mermaid).toMatchObject({ multiplierAfter: 8 });
    expect(mermaid).not.toHaveProperty('overMultiplier');
  });

  it('Lv.Max 별도 배수는 그 카드를 쓰면 ×1로 돌아간다 — 다음 배수까지 쌓던 나머지는 남는다', () => {
    const s = newGame({ targetScore: 2500 });
    s.teams.A.exp.sheep = 10 * 13 + 7; // Max(100) + 37 → ×4, 나머지 7
    toChoice(s);
    // 효과에는 ×4가 그대로 곱해지고, 그 뒤 (4 − 1) × 10 = 30을 깎는다(무작위 경험치는 디자인어에게)
    expect(applySkillChoice(s, 'A', 'sheep', undefined, () => 0.6)).toMatchObject({ overMultiplier: 4, extraDrawsQueued: 14 * 4, expSpent: 30 });
    // + 쓴 카드 경험치 1(ENHANCE_USE_EXP)
    expect(s.teams.A.exp.sheep).toBe(108);
    expect(expProgressFor(true, 'sheep', s.teams.A.exp.sheep)).toMatchObject({ level: 11, over: 1, inLevel: 8 });

    // 실용신양이 자기 자신에게 경험치를 더했으면 그 몫은 남는다(깎는 것은 쓰기 전의 배수 몫뿐)
    const t = newGame({ targetScore: 2500 });
    t.teams.A.exp.sheep = 137;
    toChoice(t);
    applySkillChoice(t, 'A', 'sheep', undefined, rng0); // 무작위 경험치 12 × 3이 실용신양에게
    expect(t.teams.A.exp.sheep).toBe(137 - 30 + 36 + ENHANCE_USE_EXP.sheep);

    // Max가 아니면 깎을 것이 없다
    const v = newGame();
    setLevel(v, 'A', 'tiger', 10);
    toChoice(v);
    expect(applySkillChoice(v, 'A', 'tiger')).toMatchObject({ expSpent: 0 });
    expect(v.teams.A.exp.tiger).toBe(20 * 9 + ENHANCE_USE_EXP.tiger); // 쓴 카드 경험치만 붙는다
  });
});

describe('강화 판 한계', () => {
  it(`예약 뽑기는 일반 판의 SHEEP_SAFETY_CAP(${SHEEP_SAFETY_CAP})에서 자르지 않고, 상한도 없다(1000 단위는 카드 한 장)`, () => {
    const s = newGame();
    s.teams.A.pendingExtraDraws = 100;
    const { events } = processPlayerAction(s, 'house', rng0);
    expect(events.find(e => e.type === 'bonusDraws')).toMatchObject({ total: 100 });
    // 실용신양 예약 뽑기도 누른 장소에서(2026-11-02) — 100장을 동물마다 센 뒤 배수 카드로(rng0이면 모두 토끼 → ×100 한 장). 축제 뽑기도 모두 오두막
    expect(events.find(e => e.type === 'bonusDraws')).toMatchObject({ count: 1, total: 100 });
    expect(events.filter(e => e.type === 'draw').every(e => e.type === 'draw' && e.place === 'house')).toBe(true);
    expect(events.some(e => e.type === 'festivalDraws')).toBe(false);
    expect(events.find(e => e.type === 'placeDraws')).toMatchObject({ total: 1 });
    expect(s.teams.A.pendingExtraDraws).toBe(0);

    const t = newGame();
    t.teams.A.pendingExtraDraws = 256 * 100;
    const big = processPlayerAction(t, 'house', rng0).events;
    // rng0이면 모두 토끼 — 25600장 = ×20000 무지개 + ×5000 다이아 + ×100 여섯 장
    expect(big.find(e => e.type === 'bonusDraws')).toMatchObject({ total: 25600, count: 8 });
    expect(t.teams.A.pendingExtraDraws).toBe(0);

    // 10만 장 넘게는 근사로 나눈다 — 합은 정확히 맞고, 카드 수는 동물마다 몇 장뿐이다
    const u = newGame();
    u.teams.A.pendingExtraDraws = 5_000_000;
    let seed = 7;
    const rngL = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const huge = processPlayerAction(u, 'river_road', rngL).events;
    const bd = huge.find(e => e.type === 'bonusDraws');
    expect(bd).toMatchObject({ total: 5_000_000 });
    expect(bd && bd.type === 'bonusDraws' && bd.count).toBeLessThan(60);
  });

  it('목표 점수 상한 — 시작 체력 5만(화면의 목표 점수 = 승리선 10만) · 방과 엔진이 같은 범위로 자른다', () => {
    expect(SETTINGS_LIMITS.targetScore.max).toBe(50000);
    expect(ENHANCE_TARGET_SCORE_MAX).toBe(50000);
    expect(clampEnhanceSettings({ targetScore: 2000 }).targetScore).toBe(2000);
    expect(clampEnhanceSettings({ targetScore: 1e12 }).targetScore).toBe(50000);
    const s = initEnhanceGame(['나'], ['CPU'], rng0, { ...ENHANCE_SETTINGS, targetScore: 99999 });
    expect(s.settings.targetScore).toBe(50000);
    expect(s.teams.A.hp).toBe(50000);
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

  it('예약 300장 뽑기는 배수 카드가 차례로 쿵 떨어지는 화면 타임라인만큼 기다린다', () => {
    const s = newGame();
    s.teams.A.pendingExtraDraws = 300;
    const { events } = processPlayerAction(s, 'house', rng0);
    // 큰 카드(×5~)는 앞 카드가 닿은 뒤에 떠오른다 — 그 닿는 시각의 합 + 마지막 카드의 슬롯(1.35초)보다 길어야 한다
    const slams = events.reduce((ms, e) => ms + (e.type === 'draw' && e.card.num >= 5 ? enhanceSlamLandMs(e.card.num) : 0), 0);
    expect(slams).toBeGreaterThan(0);
    expect(settleGraceMs(events, true)).toBeGreaterThan(slams + 1350);
    expect(settleGraceMs(events, true)).toBeLessThanOrEqual(60_000);
  });

  it('보통의 뽑기(일반 판 크기)는 예전 근사식 그대로다', () => {
    const s = newGame();
    s.teams.A.pendingExtraDraws = 3;
    const { events } = processPlayerAction(s, 'house', rng0);
    expect(settleGraceMs(events)).toBeLessThanOrEqual(15_000);
  });
});

describe('강화 판 한 차례 여러 장', () => {
  it('기본 규칙 — 12턴마다 한 장씩 늘어 최대 2장: 1~12턴 1장 · 13턴부터 2장', () => {
    expect([1, 12, 13, 24, 25, 100].map(t => enhanceSkillsPerTurn(t))).toEqual([1, 1, 2, 2, 2, 2]);
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

  it('턴이 13이 되는 순간 판의 skillsPerTurn이 2가 되고, 그 뒤로는 늘지 않는다(기본 최대 2장)', () => {
    const s = newGame();
    expect(s.skillsPerTurn).toBe(1);
    while (s.turn < 13) { toChoice(s); processPass(s); }
    expect(s.skillsPerTurn).toBe(2);
    while (s.turn < 40) { toChoice(s); processPass(s); }
    expect(s.skillsPerTurn).toBe(2);
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
    processSkillChoice(s, 'rabbit');  // Lv.1 +25 ×2
    expect(s.teams.A.hp).toBe(hp + 50);
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
    s.teams.A.hp = 990;
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
    expect(s.settings.targetScore).toBe(1600); // 2026-11-08 — 판 길이 평균 15~17턴
    expect(s.settings.festivalTurn).toBe(3); // 도토리 축제(카드 고르기) 3 · 7 · 11 …턴(2026-11-07)
    expect(s.settings.drawGrowthTurns).toBe(1);
    expect(s.settings.festivalDrawIncreaseInterval).toBe(4);
    expect(s.settings.skillGrowthTurns).toBe(12);
    expect(s.settings.skillGrowthMax).toBe(2);
    expect(s.teams.A.hp).toBe(1600);
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

describe('후공 보상 (secondComp)', () => {
  const rng0 = () => 0;
  const expOf = (s: GameState, side: string) => s.teams[side].exp;

  it('1:1 — 강이면 후공만 양·토끼 +5 · 인어·호랑이 +8, 약이면 +3/+5, 끔이면 0', () => {
    const want = { off: [0, 0], weak: [3, 5], strong: [5, 8] } as const;
    for (const comp of ['off', 'weak', 'strong'] as const) {
      const s = initEnhanceGame(['a'], ['b'], rng0, { secondComp: comp, festivalTurn: 999 });
      const [first, second] = s.turnOrder;
      expect(expOf(s, first)).toEqual({ sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 });
      const [small, big] = want[comp];
      expect(expOf(s, second)).toEqual({ sheep: small, rabbit: small, mermaid: big, tiger: big });
    }
  });

  it('3명 이상 — 자리 비례(선 0 · 가운데 절반 · 마지막이 1:1 후공과 같은 몫)', () => {
    const players = ['p1', 'p2', 'p3'].map((side, i) => ({ side, nickname: side, color: PLAYER_COLORS[i].id }));
    const s = initIndividualGame(players, rng0, { ...ENHANCE_SETTINGS, secondComp: 'strong', festivalTurn: 999 }, true);
    const [a, b, c] = s.turnOrder;
    expect(expOf(s, a).tiger).toBe(0);
    expect(expOf(s, b)).toEqual({ sheep: 3, rabbit: 3, mermaid: 4, tiger: 4 });
    expect(expOf(s, c)).toEqual({ sheep: 5, rabbit: 5, mermaid: 8, tiger: 8 });
  });

  it('잘못된 값은 끔으로 — 강화 판 기본값은 강', () => {
    expect(clampSettings({ secondComp: 'max' as never }).secondComp).toBe('off');
    expect(clampEnhanceSettings(undefined).secondComp).toBe('strong');
  });
});
