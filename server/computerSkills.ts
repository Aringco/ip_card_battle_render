import { eligibleAnimals, levelOf } from './engine/skills';
import { enhanceAmount, enhanceDivisorOf, enhanceHealAfterCut, enhanceHealCutOf, enhanceOverMultiplier, enhanceSheepExp, enhanceSheepExpStack, enhanceValue, opponentsOf } from 'shared';
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
export function pickEnhanceComputerSkill(state: GameState, side: SideId): Animal | null {
  const options = eligibleAnimals(state, side);
  if (options.length === 0) return null;
  const foe = opponentsOf(state, side)[0];
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

  if (options.includes('tiger') && value('tiger') >= foeHp) return 'tiger';
  if (options.includes('rabbit') && me.hp + rabbitHeal() >= winHp) return 'rabbit';
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
