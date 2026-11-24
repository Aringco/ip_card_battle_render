import { eligibleAnimals, levelOf } from './engine/skills';
import { enhanceAmount, enhanceDivisorOf, enhanceHealAfterCut, enhanceHealCutOf, enhanceOverMultiplier, enhanceSheepExp, enhanceSheepExpStack, enhanceValue, losesAtZero, needsTarget, opponentsOf, winsByReach } from 'shared';
import type { Animal, GameState, SideId, Team } from 'shared';

/**
 * 싱글 모드 컴퓨터의 행동 선택 — 기본은 무작위지만, 지금 당장 이길 수 있는 수(상표토끼로
 * 체력이 WIN_HP에 닿거나 특허랑이로 상대를 0으로 만드는 경우)가 있으면 그걸 최우선으로
 * 고른다. 그 외에는 완전히 무작위라 사람 상대처럼 실수도 한다.
 */
export function pickComputerSkill(state: GameState, team: Team): Animal | null {
  const options = eligibleAnimals(state, team);
  if (options.length === 0) return null;

  const opponent: Team = team === 'A' ? 'B' : 'A';
  const me = state.teams[team];
  const foe = state.teams[opponent];
  const winHp = state.settings.targetScore * 2;

  for (const animal of options) {
    if (animal === 'sheep' || animal === 'mermaid') continue;
    const amount = levelOf(state, team, animal) * state.teams[team].pendingMultiplier;
    if (animal === 'rabbit' && me.hp + amount >= winHp) return animal;
    if (animal === 'tiger' && amount >= foe.hp) return animal;
  }

  return options[Math.floor(Math.random() * options.length)];
}

/**
 * 혼자 놀기 '카드 강화'의 컴퓨터 — 판을 끝낼 수 있으면 그것부터(특허랑이로 0 · 상표토끼로 승리선), 아니면 "지금 얻는 값"이
 * 가장 큰 카드를 고르되 매번 조금씩 흔들어(×0.7~1.3) 사람처럼 실수도 한다. 배율이 걸려 있지 않을 때는 가끔 디자인어로
 * 다음 수를 키운다. 쓸 것이 없으면 넘긴다(null).
 */
export function pickEnhanceComputerSkill(state: GameState, side: SideId, foeOverride?: SideId): Animal | null {
  const options = eligibleAnimals(state, side);
  if (options.length === 0) return null;
  // 개인전은 노릴 상대를 부르는 쪽이 정해 넘긴다(pickTarget) — 팀전 1:1은 상대가 하나뿐이다
  const foe = foeOverride ?? opponentsOf(state, side)[0];
  if (foe === undefined) return null;
  const me = state.teams[side];
  const foeHp = state.teams[foe]?.hp ?? 0;
  const mult = me.pendingMultiplier;
  const winHp = state.settings.targetScore * 2;
  const div = enhanceDivisorOf(state, side);
  const over = (a: Animal) => enhanceOverMultiplier(a, me.exp[a]);
  const value = (a: Animal) => enhanceAmount(enhanceValue(a, levelOf(state, side, a)), mult * over(a), div);
  // 상표토끼 — 즉시 회복에 상대 특허랑이가 건 회복 효율 감소를 거친 값(엔진 applyEnhanceEffect와 같은 계산)
  const rabbitHeal = () => enhanceHealAfterCut(value('rabbit'), enhanceHealCutOf(state, side));

  if (options.includes('tiger') && losesAtZero(state) && value('tiger') >= foeHp) return 'tiger';
  if (options.includes('rabbit') && winsByReach(state) && me.hp + rabbitHeal() >= winHp) return 'rabbit';
  if (options.includes('mermaid') && mult === 1 && options.length > 1 && Math.random() < 0.35) return 'mermaid';

  const gain = (a: Animal): number => {
    if (a === 'tiger') return Math.min(value(a), foeHp);
    if (a === 'rabbit') return rabbitHeal();
    // 실용신양 — 추가 뽑기 + 무작위 경험치(키우는 값). 6차 표의 장수(4~14)만 보면 컴퓨터가 실용신양을 거의 고르지 않는다 —
    // 장수 × 0.6이던 것을 (장수 + 경험치) × 1로 바꿨다(시뮬레이션에서 컴퓨터의 강함은 그대로, ×3이면 오히려 약해진다)
    if (a === 'sheep') return value(a) + enhanceSheepExp(levelOf(state, side, a)) * enhanceSheepExpStack(levelOf(state, side, a));
    return mult === 1 ? 1.5 : 0;              // 디자인어 — 이미 걸려 있으면 굳이 쓰지 않는다
  };
  let best: Animal = options[0];
  let bestScore = -Infinity;
  for (const a of options) {
    const score = gain(a) * (0.7 + Math.random() * 0.6);
    if (score > bestScore) { best = a; bestScore = score; }
  }
  return best;
}

// ─── 혼자 놀기 봇(개인전) — shared/bots.ts의 난이도 ─────────────────────────────

/** 이 편이 지금 특허랑이로 줄 수 있는 피해(엔진과 같은 계산 — 도토리 카드 보정은 빼고 본다) */
function tigerDamage(state: GameState, side: SideId): number {
  const me = state.teams[side];
  const lv = levelOf(state, side, 'tiger');
  if (lv <= 0) return 0;
  if (!state.enhance) return lv * me.pendingMultiplier;
  return enhanceAmount(enhanceValue('tiger', lv), me.pendingMultiplier * enhanceOverMultiplier('tiger', me.exp.tiger), enhanceDivisorOf(state, side));
}

/**
 * 노릴 상대(보통 · 어려움의 롤아웃) — 특허랑이로 지금 끝낼 수 있는 사람이 있으면 그중 체력이 가장 높은 사람(순위를 가장 크게 바꾼다),
 * 아니면 1위(체력이 가장 높은 사람). 디자인어(상대 배율 나누기)는 배율이 가장 큰 사람, 같으면 1위.
 */
export function pickTarget(state: GameState, side: SideId, animal: Animal): SideId | undefined {
  if (!needsTarget(state, animal, levelOf(state, side, animal))) return undefined;
  const foes = opponentsOf(state, side);
  if (foes.length === 0) return undefined;
  const hp = (s: SideId) => state.teams[s]?.hp ?? 0;
  const leader = foes.reduce((a, b) => (hp(b) > hp(a) ? b : a));
  if (animal === 'tiger') {
    const dmg = tigerDamage(state, side);
    const killable = losesAtZero(state) ? foes.filter(f => hp(f) <= dmg) : [];
    return killable.length ? killable.reduce((a, b) => (hp(b) > hp(a) ? b : a)) : leader;
  }
  const mult = (s: SideId) => state.teams[s]?.pendingMultiplier ?? 1;
  return foes.reduce((a, b) => (mult(b) > mult(a) || (mult(b) === mult(a) && hp(b) > hp(a)) ? b : a));
}

export interface BotSkillPick { animal: Animal; target?: SideId }

/**
 * 보통 — 개인전 판단. 강화 판은 pickEnhanceComputerSkill(노릴 상대는 pickTarget), 일반 판은 "끝낼 수 있으면 끝내기, 아니면 무작위"
 * (팀전 pickComputerSkill과 같은 성격 — 그 함수는 상대를 뒤집어 구하는 팀전 전용이라 따로 둔다). 쓸 것이 없으면 null(턴 마치기).
 */
export function pickIndividualSkill(state: GameState, side: SideId, rng: () => number = Math.random): BotSkillPick | null {
  const options = eligibleAnimals(state, side);
  if (options.length === 0) return null;
  if (state.enhance) {
    const animal = pickEnhanceComputerSkill(state, side, pickTarget(state, side, 'tiger'));
    return animal === null ? null : { animal, target: pickTarget(state, side, animal) };
  }
  const me = state.teams[side];
  const winHp = state.settings.targetScore * 2;
  if (options.includes('tiger') && losesAtZero(state)) {
    const dmg = tigerDamage(state, side);
    const target = pickTarget(state, side, 'tiger');
    if (target !== undefined && dmg >= (state.teams[target]?.hp ?? Infinity)) return { animal: 'tiger', target };
  }
  if (options.includes('rabbit') && winsByReach(state) && me.hp + levelOf(state, side, 'rabbit') * me.pendingMultiplier >= winHp) {
    return { animal: 'rabbit' };
  }
  const animal = options[Math.floor(rng() * options.length)];
  return { animal, target: pickTarget(state, side, animal) };
}

/** 쉬움 — 쓸 수 있는 기술 중 무작위, 노릴 상대도 무작위, 넷에 하나는 그냥 넘긴다 */
export function pickEasySkill(state: GameState, side: SideId, rng: () => number = Math.random): BotSkillPick | null {
  const options = eligibleAnimals(state, side);
  if (options.length === 0 || rng() < 0.25) return null;
  const animal = options[Math.floor(rng() * options.length)];
  if (!needsTarget(state, animal, levelOf(state, side, animal))) return { animal };
  const foes = opponentsOf(state, side);
  return foes.length ? { animal, target: foes[Math.floor(rng() * foes.length)] } : null;
}
