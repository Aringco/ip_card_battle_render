/**
 * 탐색 봇(docs/AI_ROADMAP.md 3단계) — 학습 없이, 고를 수 있는 후보마다 "이걸 골랐다고 치고" 엔진으로 앞날을 여러 번
 * 굴려 보고(롤아웃) 결과가 가장 좋았던 후보를 고른다. 후보 사이의 시간 배분은 UCB1(유망한 후보를 더 많이 굴린다).
 *
 * - 순수 함수다 — 방(Room)도 worker도 모른다. worker(./worker.ts)와 스크립트가 함께 쓴다.
 * - 받은 상태를 고치지 않는다(롤아웃마다 structuredClone).
 * - 팀전 1:1(옛 혼자 놀기)과 개인전(혼자 놀기 봇 방 — 2:8편, 특허랑이 · 디자인어의 대상까지 후보로 본다)을 다룬다.
 *
 * ⚠️ 무작위 값: 이 게임의 무작위는 상태에 씨앗이 없는 Math.random이라, 롤아웃이 무엇을 굴려도 실제로 나올 카드를 미리 알 수 없다
 *    (봇이 미래를 엿보는 반칙이 생기지 않는다). 엔진에 씨앗 있는 rng를 상태에 넣게 되면 롤아웃에는 반드시 다른 rng를 넘길 것.
 */
import { processAcornPick, processPass, processPlayerAction, processSkillChoice } from '../engine/gameEngine';
import { acornOfferOpen, autoPickAcorns } from '../engine/acorn';
import { eligibleAnimals, levelOf } from '../engine/skills';
import { pickComputerSkill, pickEasySkill, pickEnhanceComputerSkill, pickIndividualSkill } from '../computerSkills';
import { PLACES, needsTarget, opponentsOf } from 'shared';
import type { Animal, BotLevel, GameState, Place, SideId, Team } from 'shared';

export type BotDecision =
  | { kind: 'place'; place: Place }
  | { kind: 'skill'; animal: Animal; target?: SideId }
  | { kind: 'pass' }
  | { kind: 'acorn'; id: string };

export interface SearchOptions {
  /** 이 시간 안에서 굴린다(ms) */
  budgetMs: number;
  /** 롤아웃 상한(시험 · 재현용) — 없으면 시간만 본다 */
  maxRollouts?: number;
  /** 롤아웃이 현재 턴에서 몇 턴까지 가 보는가 — 넘으면 체력으로 판세를 매긴다(턴 제한이 없는 강화 판에 필요) */
  depthTurns?: number;
  rng?: () => number;
}

export interface SearchResult {
  decision: BotDecision | null;
  rollouts: number;
  /** 후보가 하나뿐이면 굴리지 않는다 */
  candidates: number;
  elapsedMs: number;
}

const DEFAULT_DEPTH_TURNS = 12;
// 롤아웃 한 번이 끝없이 돌지 않게 — 정상 판이면 닿지 않는다
const ROLLOUT_STEP_CAP = 400;

/** 지금 이 편이 무엇을 고를 차례인가 — 고를 차례가 아니면 빈 목록. 대상이 필요한 기술은 상대마다 후보가 하나씩이다 */
export function candidatesOf(state: GameState, side: SideId): BotDecision[] {
  if (state.phase !== 'playing') return [];
  const offer = state.enhance?.acorn?.offer;
  if (offer && acornOfferOpen(state)) {
    if (!(side in offer.picked) || offer.picked[side] !== null) return [];
    return (offer.options[side] ?? []).map(id => ({ kind: 'acorn', id }) as BotDecision);
  }
  if (state.pendingChoice === side) {
    const skills: BotDecision[] = [];
    for (const animal of eligibleAnimals(state, side)) {
      if (needsTarget(state, animal, levelOf(state, side, animal))) {
        for (const target of opponentsOf(state, side)) skills.push({ kind: 'skill', animal, target });
      } else {
        skills.push({ kind: 'skill', animal });
      }
    }
    return [...skills, { kind: 'pass' }];
  }
  if (state.pendingChoice === null && state.activeTeam === side) {
    return PLACES.filter(p => p !== state.lastPlace).map(place => ({ kind: 'place', place }));
  }
  return [];
}

/** 결정이 지금 상태에서 여전히 둘 수 있는 수인가 — 결과가 늦게 와 판이 바뀌었을 수 있다 */
export function isLegalDecision(state: GameState, side: SideId, d: BotDecision): boolean {
  return candidatesOf(state, side).some(c => sameDecision(c, d));
}

function sameDecision(a: BotDecision, b: BotDecision): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'place') return a.place === (b as typeof a).place;
  if (a.kind === 'skill') return a.animal === (b as typeof a).animal && a.target === (b as typeof a).target;
  if (a.kind === 'acorn') return a.id === (b as typeof a).id;
  return true;
}

/** 결정 하나를 상태에 적용한다(상태를 고친다) — 방 밖(롤아웃 · 스크립트)에서만 쓴다 */
export function applyDecision(state: GameState, side: SideId, d: BotDecision, rng: () => number): void {
  switch (d.kind) {
    case 'place': processPlayerAction(state, d.place, rng); break;
    case 'skill': processSkillChoice(state, d.animal, d.target); break;
    case 'pass': processPass(state); break;
    case 'acorn': processAcornPick(state, side, d.id, rng); break;
  }
}

/**
 * 규칙형 봇의 수 — 장소는 무작위(직전 장소 제외), 도토리 카드는 무작위, 기술은 난이도대로.
 *   팀전(옛 혼자 놀기 · 시연 밖): computerSkills.ts의 pickComputerSkill / pickEnhanceComputerSkill
 *   개인전: 보통(·어려움) pickIndividualSkill, 쉬움 pickEasySkill
 * 방이 탐색 봇을 쓰지 않을 때 · 답이 없을 때 이것을 두고, 대전 스크립트의 비교 상대도 이것이다. 고를 차례가 아니면 null.
 */
export function heuristicDecision(
  state: GameState,
  side: SideId,
  rng: () => number = Math.random,
  level: BotLevel = 'normal',
): BotDecision | null {
  if (state.phase !== 'playing') return null;
  const offer = state.enhance?.acorn?.offer;
  if (offer) {
    const opts = offer.options[side];
    if (!opts || offer.picked[side] !== null) return null;
    return { kind: 'acorn', id: opts[Math.floor(rng() * opts.length)] };
  }
  if (state.pendingChoice === side) {
    if (state.mode === 'individual') {
      const pick = level === 'easy' ? pickEasySkill(state, side, rng) : pickIndividualSkill(state, side, rng);
      return pick === null ? { kind: 'pass' } : { kind: 'skill', animal: pick.animal, ...(pick.target ? { target: pick.target } : {}) };
    }
    const animal = state.enhance ? pickEnhanceComputerSkill(state, side) : pickComputerSkill(state, side as Team);
    return animal === null ? { kind: 'pass' } : { kind: 'skill', animal };
  }
  if (state.pendingChoice === null && state.activeTeam === side) {
    // 직전 장소 금지 규칙을 지킨다 — 안 그러면 거부당한 뒤 다시 고르느라 한 텀을 허비한다
    const options = PLACES.filter(p => p !== state.lastPlace);
    return { kind: 'place', place: options[Math.floor(rng() * options.length)] };
  }
  return null;
}

/** 롤아웃 정책 — 보통 봇의 판단(빠르고, 무작위보다 판세를 잘 비춘다) */
function playoutStep(state: GameState, rng: () => number): void {
  if (acornOfferOpen(state)) { autoPickAcorns(state, rng); return; }
  const side = state.pendingChoice ?? state.activeTeam;
  const d = heuristicDecision(state, side, rng);
  if (d === null) { processPass(state); return; }
  applyDecision(state, side, d, rng);
}

/**
 * 판세 — 이 편에게 얼마나 좋은가(0~1). 순위가 정해졌으면 그 순위(1위 1 · 꼴찌 0), 판이 끝났으면 승패,
 * 아니면 체력 차(상대 중 가장 높은 사람과 — 개인전에서는 1위와 겨루는 셈이다).
 */
function evaluate(state: GameState, side: SideId): number {
  const n = state.turnOrder.length;
  const finish = state.teams[side]?.finish;
  if (finish && n > 1) return 1 - (finish.rank - 1) / (n - 1);
  if (state.phase === 'ended') {
    if (state.winner === side) return 1;
    if (state.winner === 'draw') return 0.5;
    return 0;
  }
  const winHp = Math.max(1, state.settings.targetScore * 2);
  const foes = opponentsOf(state, side);
  const best = foes.reduce((m, f) => Math.max(m, state.teams[f]?.hp ?? 0), 0);
  const diff = (state.teams[side]?.hp ?? 0) - best;
  return 0.5 + 0.5 * Math.max(-1, Math.min(1, diff / winHp));
}

export function searchDecision(state: GameState, side: SideId, opts: SearchOptions): SearchResult {
  const t0 = performance.now();
  const rng = opts.rng ?? Math.random;
  const empty = (candidates: number, decision: BotDecision | null = null): SearchResult =>
    ({ decision, rollouts: 0, candidates, elapsedMs: performance.now() - t0 });

  if (state.phase !== 'playing' || !state.teams[side]) return empty(0);
  const cands = candidatesOf(state, side);
  if (cands.length <= 1) return empty(cands.length, cands[0] ?? null);

  const depth = opts.depthTurns ?? DEFAULT_DEPTH_TURNS;
  const stopTurn = state.turn + depth;
  const n = new Array<number>(cands.length).fill(0);
  const sum = new Array<number>(cands.length).fill(0);
  let total = 0;
  const deadline = t0 + Math.max(1, opts.budgetMs);
  const cap = opts.maxRollouts ?? Infinity;

  while (total < cap && (total < cands.length || performance.now() < deadline)) {
    // UCB1 — 아직 한 번도 안 굴린 후보부터, 그다음은 평균 + 탐색 보너스가 큰 쪽
    let pick = 0;
    if (total < cands.length) pick = total;
    else {
      let best = -Infinity;
      const logT = Math.log(total);
      for (let i = 0; i < cands.length; i++) {
        const ucb = sum[i] / n[i] + Math.SQRT2 * Math.sqrt(logT / n[i]);
        if (ucb > best) { best = ucb; pick = i; }
      }
    }
    const s = structuredClone(state);
    applyDecision(s, side, cands[pick], rng);
    let steps = 0;
    // 내 순위가 정해지면 더 굴릴 것이 없다(개인전은 남은 사람끼리 계속 두지만 내 몫은 끝났다)
    while (s.phase === 'playing' && !s.teams[side]?.finish && s.turn < stopTurn && steps++ < ROLLOUT_STEP_CAP) playoutStep(s, rng);
    n[pick]++;
    sum[pick] += evaluate(s, side);
    total++;
  }

  // 가장 많이 굴린 후보(= UCB가 끝까지 믿은 후보)를 고른다 — 평균 최고보다 흔들림이 적다
  let bestIdx = 0;
  for (let i = 1; i < cands.length; i++) {
    if (n[i] > n[bestIdx] || (n[i] === n[bestIdx] && sum[i] / n[i] > sum[bestIdx] / n[bestIdx])) bestIdx = i;
  }
  return { decision: cands[bestIdx], rollouts: total, candidates: cands.length, elapsedMs: performance.now() - t0 };
}
