/**
 * 카드 강화 — 기술 카드 표의 밸런스를 **전략끼리 붙여** 보는 보고용 도구다(ENHANCE_MODE.md §3). 규칙은 바꾸지 않는다.
 * enhanceBalance.ts가 "판이 얼마나 걸리나"를 본다면, 이쪽은 "어느 카드에 기대는 쪽이 이기나 · 체력이 어디서 움직이나"를 본다.
 *
 * 봇 둘이 팀전 1:1(혼자 놀기 강화와 같은 판)로 붙는다. 장소는 enhanceBalance.ts와 같은 "짝이 될 확률이 가장 높은 곳".
 * 전략(기술 고르기):
 *   greedy  — 방의 컴퓨터와 같은 생각(끝낼 수 있으면 그것 → 가끔 디자인어 → 지금 얻는 값이 큰 카드, ×0.7~1.3로 흔든다)
 *   tiger   — 특허랑이부터(없으면 디자인어 → 실용신양 → 상표토끼)
 *   rabbit  — 상표토끼부터(없으면 디자인어 → 실용신양 → 특허랑이)
 *   sheep   — 실용신양부터(레벨 올리기 — 없으면 greedy)
 *   combo   — 배율이 없으면 디자인어로 먼저 걸고, 걸려 있으면 특허랑이/상표토끼 중 큰 쪽
 *   random  — 쓸 수 있는 카드 중 무작위
 * 각 짝마다 선을 번갈아 N판씩 둔다.
 *
 * 실행: cd server && npx ts-node --transpile-only scripts/enhanceStrategySim.ts [판수=400]
 */
import { initEnhanceGame } from '../engine/turnManager';
import { processPlayerAction, processSkillChoice, processPass } from '../engine/gameEngine';
import { eligibleAnimals, levelOf } from '../engine/skills';
import {
  ANIMALS,
  ENHANCE_SETTINGS,
  PLACES,
  PLACE_ANIMALS,
  enhanceAmount,
  enhanceDivisorOf,
  enhanceHealAfterCut,
  enhanceHealCutOf,
  enhanceOverMultiplier,
  enhanceValue,
  enhanceSheepExp,
  enhanceSheepExpStack,
  opponentsOf,
  THRESHOLDS,
} from 'shared';
import type { Animal, GameEvent, GameState, Place, SideId } from 'shared';

function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pickPlace(state: GameState, rng: () => number): Place {
  const options = PLACES.filter(p => p !== state.lastPlace);
  const odd = (a: Animal) => state.stacks[a].filter(c => c.collectedBy === null).length % 2 === 1;
  let best: Place[] = [];
  let bestP = -1;
  for (const p of options) {
    const pairP = PLACE_ANIMALS[p].filter(odd).length / PLACE_ANIMALS[p].length;
    if (pairP > bestP + 1e-9) { best = [p]; bestP = pairP; }
    else if (Math.abs(pairP - bestP) < 1e-9) best.push(p);
  }
  return best[Math.floor(rng() * best.length)];
}

type Strategy = 'greedy' | 'tiger' | 'rabbit' | 'sheep' | 'combo' | 'random';
const STRATEGIES: Strategy[] = ['greedy', 'tiger', 'rabbit', 'sheep', 'combo', 'random'];

/** 이 편이 지금 이 카드를 고르면 얻는 즉시 값(엔진과 같은 공식 — 배율 × Max 별도 배수 ÷ 나눗셈, 회복은 회복 효율 감소를 거친다) */
function valueOf(state: GameState, side: SideId, a: Animal): number {
  const me = state.teams[side];
  const v = enhanceAmount(enhanceValue(a, levelOf(state, side, a)), me.pendingMultiplier * enhanceOverMultiplier(a, me.exp[a]), enhanceDivisorOf(state, side));
  return a === 'rabbit' ? enhanceHealAfterCut(v, enhanceHealCutOf(state, side)) : v;
}

function pickSkill(strategy: Strategy, state: GameState, side: SideId, rng: () => number): Animal | null {
  const options = eligibleAnimals(state, side);
  if (options.length === 0) return null;
  const foe = opponentsOf(state, side)[0];
  const me = state.teams[side];
  const foeHp = state.teams[foe]?.hp ?? 0;
  const winHp = state.settings.targetScore * 2;
  const has = (a: Animal) => options.includes(a);
  // 어느 전략이든 끝낼 수 있으면 끝낸다(사람도 그렇게 한다)
  if (has('tiger') && valueOf(state, side, 'tiger') >= foeHp) return 'tiger';
  if (has('rabbit') && me.hp + valueOf(state, side, 'rabbit') >= winHp) return 'rabbit';
  const firstOf = (order: Animal[]) => order.find(has) ?? null;
  switch (strategy) {
    case 'random':
      return options[Math.floor(rng() * options.length)];
    case 'tiger':
      return firstOf(me.pendingMultiplier === 1 ? ['tiger', 'mermaid', 'sheep', 'rabbit'] : ['tiger', 'sheep', 'rabbit', 'mermaid']);
    case 'rabbit':
      return firstOf(me.pendingMultiplier === 1 ? ['rabbit', 'mermaid', 'sheep', 'tiger'] : ['rabbit', 'sheep', 'tiger', 'mermaid']);
    case 'sheep':
      if (has('sheep')) return 'sheep';
      return pickSkill('greedy', state, side, rng);
    case 'combo': {
      if (me.pendingMultiplier === 1 && has('mermaid')) return 'mermaid';
      const t = has('tiger') ? Math.min(valueOf(state, side, 'tiger'), foeHp) : -1;
      const r = has('rabbit') ? valueOf(state, side, 'rabbit') : -1;
      if (t < 0 && r < 0) return firstOf(['sheep', 'mermaid']);
      return t >= r ? 'tiger' : 'rabbit';
    }
    case 'greedy': {
      const mult = me.pendingMultiplier;
      if (has('mermaid') && mult === 1 && options.length > 1 && rng() < 0.35) return 'mermaid';
      const gain = (a: Animal): number => {
        if (a === 'tiger') return Math.min(valueOf(state, side, a), foeHp);
        if (a === 'rabbit') return valueOf(state, side, a);
        if (a === 'sheep') return valueOf(state, side, a) + enhanceSheepExp(levelOf(state, side, a)) * enhanceSheepExpStack(levelOf(state, side, a)); // room.ts와 같다
        return mult === 1 ? 1.5 : 0;
      };
      let best = options[0];
      let score = -Infinity;
      for (const a of options) {
        const s = gain(a) * (0.7 + rng() * 0.6);
        if (s > score) { best = a; score = s; }
      }
      return best;
    }
  }
}

/** 한 판 동안 체력이 어디서 움직였나(편마다) */
interface Flow {
  tigerHit: number;   // 특허랑이 즉시 피해(고른 것)
  tigerPair: number;  // 특허랑이 짝 효과 피해
  bleed: number;      // 출혈로 깎인 양(이 편이 **받은** 것이 아니라 이 편이 건 것 — 상대가 받은 출혈)
  rabbitHeal: number; // 상표토끼 즉시 회복(고른 것 + 짝)
  regen: number;      // 지속 회복
  evaded: number;     // 상대의 공격을 피한 횟수
  skills: Record<Animal, number>;
}
const emptyFlow = (): Flow => ({ tigerHit: 0, tigerPair: 0, bleed: 0, rabbitHeal: 0, regen: 0, evaded: 0, skills: { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 } });

interface Result {
  winner: SideId | 'draw' | null;
  turns: number;
  reason: string;
  flow: Record<SideId, Flow>;
  peakHp: number;
  maxTop: number;
}

function runGame(seed: number, sA: Strategy, sB: Strategy, firstTeam: 'A' | 'B', startAtMax = false): Result {
  const rng = makeLCG(seed);
  const state = initEnhanceGame(['a'], ['b'], rng, { ...ENHANCE_SETTINGS, firstTeam, ...(startAtMax ? { targetScore: 2500 } : {}) });
  // 끝판 장면 — 두 편의 네 카드가 모두 Lv.Max(별도 배수 ×1)에서 시작한다
  if (startAtMax) for (const x of ['A', 'B']) for (const a of ANIMALS) state.teams[x].exp[a] = THRESHOLDS[a] * 10;
  const strat: Record<SideId, Strategy> = { A: sA, B: sB };
  const flow: Record<SideId, Flow> = { A: emptyFlow(), B: emptyFlow() };
  let reason = '';
  let peakHp = 0;
  const eat = (events: GameEvent[]) => {
    for (const e of events) {
      if (e.type === 'skillApplied') {
        const f = flow[e.team];
        if (!e.pair) f.skills[e.animal] += 1;
        if (e.animal === 'tiger') { if (e.pair) f.tigerPair -= e.oppHpDelta; else f.tigerHit -= e.oppHpDelta; }
        if (e.animal === 'rabbit') f.rabbitHeal += e.myHpDelta;
        if (e.evaded) {
          const target = e.target ?? opponentsOf(state, e.team)[0];
          flow[target].evaded += 1;
        }
      } else if (e.type === 'enhanceTick') {
        if (e.kind === 'regen') flow[e.team].regen += e.amount;
        else flow[opponentsOf(state, e.team)[0]].bleed += e.amount;
      }
    }
    for (const s of ['A', 'B']) peakHp = Math.max(peakHp, state.teams[s].hp);
  };
  let guard = 0;
  while (state.phase === 'playing') {
    if (guard++ > 20_000) throw new Error(`무한루프 (seed=${seed})`);
    eat(processPlayerAction(state, pickPlace(state, rng), rng).events);
    while (state.phase === 'playing' && state.pendingChoice !== null) {
      const side = state.pendingChoice;
      const pick = pickSkill(strat[side], state, side, rng);
      eat((pick ? processSkillChoice(state, pick) : processPass(state)).events);
    }
  }
  // 끝난 이유 — 누군가 0이 됐으면 'zero', 아니면 승리선(목표 × 2) 도달
  reason = ['A', 'B'].some(x => state.teams[x].hp <= 0) ? 'zero' : 'winLine';
  return {
    winner: state.winner,
    turns: state.turn,
    reason,
    flow,
    peakHp,
    maxTop: Math.max(...['A', 'B'].flatMap(s => ANIMALS.map(a => levelOf(state, s, a)))),
  };
}

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
const quantile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

const N = Number(process.argv[2] ?? 400);
let seed = 5000;

console.log(`== 카드 강화 전략 대결 — 짝마다 ${N}판(선 번갈아), 목표 ${ENHANCE_SETTINGS.targetScore}`);

// 1) 같은 전략끼리 — 판 길이 · 선 승률 · 체력 흐름
console.log('\n[같은 전략끼리] 끝난 턴(10%/중앙/90%/최대) · 선 승률 · 끝난 이유 · 한 판 평균 체력 흐름(한 편)');
for (const s of STRATEGIES) {
  const rs = Array.from({ length: N }, (_, i) => runGame(seed++, s, s, i % 2 === 0 ? 'A' : 'B'));
  const turns = rs.map(r => r.turns);
  const firstWins = rs.filter((r, i) => r.winner === (i % 2 === 0 ? 'A' : 'B')).length;
  const knock = rs.filter(r => r.reason === 'zero').length;
  const flows = rs.flatMap(r => [r.flow.A, r.flow.B]);
  const f = (k: keyof Omit<Flow, 'skills'>) => mean(flows.map(x => x[k])).toFixed(0);
  console.log(
    `  ${s.padEnd(6)} 턴 ${quantile(turns, 0.1)}/${quantile(turns, 0.5)}/${quantile(turns, 0.9)}/${Math.max(...turns)} · 선 ${pct(firstWins, N)} · 상대 0점으로 끝 ${pct(knock, N)}`
    + ` · 호랑이 ${f('tigerHit')}+짝 ${f('tigerPair')} · 출혈 ${f('bleed')} · 토끼 ${f('rabbitHeal')} · 지속회복 ${f('regen')} · 회피 ${mean(flows.map(x => x.evaded)).toFixed(2)}회`
    + ` · 최고 체력 중앙 ${quantile(rs.map(r => r.peakHp), 0.5)} · Lv.Max 도달 ${pct(rs.filter(r => r.maxTop >= 11).length, N)}`,
  );
}

// 2) 전략 대 greedy — 승률
console.log('\n[전략 vs greedy] 그 전략 쪽 승률(선 번갈아) · 중앙 턴');
for (const s of STRATEGIES.filter(x => x !== 'greedy')) {
  const rs = Array.from({ length: N }, (_, i) => runGame(seed++, s, 'greedy', i % 2 === 0 ? 'A' : 'B'));
  console.log(`  ${s.padEnd(6)} ${pct(rs.filter(r => r.winner === 'A').length, N)} · 중앙 ${quantile(rs.map(r => r.turns), 0.5)}턴`);
}

// 3) 순수 전략끼리 — 한 장에 기대는 쪽 중 누가 강한가
console.log('\n[한 장 전략끼리] 행 쪽 승률');
const pure: Strategy[] = ['tiger', 'rabbit', 'sheep', 'combo'];
console.log(`         ${pure.map(p => p.padStart(7)).join('')}`);
for (const a of pure) {
  const row = pure.map(b => {
    if (a === b) return '      -';
    const rs = Array.from({ length: N }, (_, i) => runGame(seed++, a, b, i % 2 === 0 ? 'A' : 'B'));
    return pct(rs.filter(r => r.winner === 'A').length, N).padStart(7);
  });
  console.log(`  ${a.padEnd(6)} ${row.join('')}`);
}

// 4) 끝판 장면 — 네 카드가 모두 Lv.Max에서 시작(Lv.6+ 효과끼리의 밸런스 — 목표 2500으로 둔다. 500이면 짝 효과만으로 1~2턴에 끝난다)
console.log('\n[끝판 장면 — 모두 Lv.Max에서 시작] 끝난 턴(10%/중앙/90%/최대) · 선 승률 · 상대 0점으로 끝 · 체력 흐름 · 회피');
for (const s of ['greedy', 'tiger', 'rabbit', 'combo'] as Strategy[]) {
  const rs = Array.from({ length: N }, (_, i) => runGame(seed++, s, s, i % 2 === 0 ? 'A' : 'B', true));
  const turns = rs.map(r => r.turns);
  const flows = rs.flatMap(r => [r.flow.A, r.flow.B]);
  const f = (k: keyof Omit<Flow, 'skills'>) => mean(flows.map(x => x[k])).toFixed(0);
  console.log(
    `  ${s.padEnd(6)} 턴 ${quantile(turns, 0.1)}/${quantile(turns, 0.5)}/${quantile(turns, 0.9)}/${Math.max(...turns)} · 선 ${pct(rs.filter((r, i) => r.winner === (i % 2 === 0 ? 'A' : 'B')).length, N)}`
    + ` · 0점 ${pct(rs.filter(r => r.reason === 'zero').length, N)} · 호랑이 ${f('tigerHit')}+짝 ${f('tigerPair')} · 출혈 ${f('bleed')} · 토끼 ${f('rabbitHeal')} · 지속회복 ${f('regen')} · 회피 ${mean(flows.map(x => x.evaded)).toFixed(2)}회`,
  );
}
console.log('\n[끝판 장면 — 전략 vs greedy] 그 전략 쪽 승률');
for (const s of ['tiger', 'rabbit', 'sheep', 'combo'] as Strategy[]) {
  const rs = Array.from({ length: N }, (_, i) => runGame(seed++, s, 'greedy', i % 2 === 0 ? 'A' : 'B', true));
  console.log(`  ${s.padEnd(6)} ${pct(rs.filter(r => r.winner === 'A').length, N)} · 중앙 ${quantile(rs.map(r => r.turns), 0.5)}턴`);
}
