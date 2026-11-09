/**
 * 혼자 놀기 '카드 강화' 봇 시뮬레이션 — 판이 얼마나 걸리고 레벨이 어디까지 오르는지 보는 **보고용** 도구다(ENHANCE_MODE.md §3).
 * 규칙은 바꾸지 않는다. 이 판에는 턴 제한이 없으므로(목표 체력·상대 체력 0으로만 끝난다) 끝난 턴의 분포가 곧 판 길이다.
 *
 * 봇: 장소는 "짝이 될 확률이 가장 높은 곳"(직전 장소 제외, 동률은 무작위). 기술은 room.ts의 컴퓨터와 같은 생각
 *     (끝낼 수 있으면 그것 → 가끔 디자인어 → 지금 얻는 값이 큰 카드, ×0.7~1.3로 흔든다).
 *
 * 실행: cd server && npx ts-node scripts/enhanceBalance.ts [판수=1000] [목표] [축제 시작 턴] [장소 장수 증가 주기]
 */
import { initEnhanceGame } from '../engine/turnManager';
import { autoPickAcorns } from '../engine/acorn';
import { processPlayerAction, processSkillChoice, processPass } from '../engine/gameEngine';
import { eligibleAnimals, levelOf } from '../engine/skills';
import {
  ANIMALS,
  ENHANCE_MAX_LEVEL,
  ENHANCE_SETTINGS,
  PLACES,
  PLACE_ANIMALS,
  enhanceValue,
  enhanceSheepExp,
  enhanceSheepExpStack,
  opponentsOf,
} from 'shared';
import type { Animal, GameState, Place, SideId } from 'shared';

function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

function pickPlace(state: GameState, rng: () => number): Place {
  const options = PLACES.filter(p => p !== state.lastPlace);
  const odd = (a: Animal) => state.stacks[a].filter(c => c.collectedBy === null).reduce((n, c) => n + c.num, 0) % 2 === 1;
  let best: Place[] = [];
  let bestP = -1;
  for (const p of options) {
    const pairP = PLACE_ANIMALS[p].filter(odd).length / PLACE_ANIMALS[p].length;
    if (pairP > bestP + 1e-9) { best = [p]; bestP = pairP; }
    else if (Math.abs(pairP - bestP) < 1e-9) best.push(p);
  }
  return best[Math.floor(rng() * best.length)];
}

function pickSkill(state: GameState, side: SideId, rng: () => number): Animal | null {
  const options = eligibleAnimals(state, side);
  if (options.length === 0) return null;
  const foe = opponentsOf(state, side)[0];
  const me = state.teams[side];
  const foeHp = state.teams[foe]?.hp ?? 0;
  const mult = me.pendingMultiplier;
  const winHp = state.settings.targetScore * 2;
  const value = (a: Animal) => enhanceValue(a, levelOf(state, side, a)) * mult;
  if (options.includes('tiger') && value('tiger') >= foeHp) return 'tiger';
  if (options.includes('rabbit') && me.hp + value('rabbit') >= winHp) return 'rabbit';
  if (options.includes('mermaid') && mult === 1 && options.length > 1 && rng() < 0.35) return 'mermaid';
  const gain = (a: Animal): number => {
    if (a === 'tiger') return Math.min(value(a), foeHp);
    if (a === 'rabbit') return value(a);
    if (a === 'sheep') return value(a) + enhanceSheepExp(levelOf(state, side, a)) * enhanceSheepExpStack(levelOf(state, side, a)); // room.ts와 같다
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

interface Result {
  turns: number;
  firstWon: boolean;
  byWinLine: boolean;
  topLevel: number[];
  levelSum: number[];
  firstLv3: number | null;
  firstLv6: number | null;
}

function runGame(seed: number): Result {
  const rng = makeLCG(seed);
  const state = initEnhanceGame(['a'], ['b'], rng, { ...ENHANCE_SETTINGS, targetScore: TARGET, festivalTurn: FESTIVAL, drawGrowthTurns: DRAW_GROWTH, ...EXTRA });
  const first = state.activeTeam;
  let firstLv3: number | null = null;
  let firstLv6: number | null = null;
  let guard = 0;
  while (state.phase === 'playing') {
    if (guard++ > 10_000) throw new Error(`무한루프 (seed=${seed})`);
    autoPickAcorns(state, rng); // 도토리 축제 — 후보 중 무작위(컴퓨터와 같다)
    processPlayerAction(state, pickPlace(state, rng), rng);
    for (const side of state.turnOrder) {
      const top = Math.max(...ANIMALS.map(a => levelOf(state, side, a)));
      if (top >= 3 && firstLv3 === null) firstLv3 = state.turn;
      if (top >= 6 && firstLv6 === null) firstLv6 = state.turn;
    }
    // 한 차례에 기술이 여러 장일 수 있다(16턴부터 2장 · 31턴부터 3장) — 기술 단계가 끝날 때까지 고른다
    while (state.phase === 'playing' && state.pendingChoice !== null) {
      const pick = pickSkill(state, state.pendingChoice, rng);
      if (pick) processSkillChoice(state, pick);
      else processPass(state);
    }
  }
  const winHp = state.settings.targetScore * 2;
  return {
    turns: state.turn,
    firstWon: state.winner === first,
    byWinLine: Object.values(state.teams).some(t => t.hp >= winHp),
    topLevel: state.turnOrder.map(s => Math.max(...ANIMALS.map(a => levelOf(state, s, a)))),
    levelSum: state.turnOrder.map(s => ANIMALS.reduce((n, a) => n + levelOf(state, s, a), 0)),
    firstLv3,
    firstLv6,
  };
}

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(1)}%`;
const quantile = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

const N = Number(process.argv[2] ?? 1000);
// 목표 점수(시작 체력) — 기본 500, 둘째 인자로 바꾼다(2500까지)
const TARGET = Number(process.argv[3] ?? ENHANCE_SETTINGS.targetScore);
// 도토리 축제 시작 턴 — 셋째 인자(999면 도토리 카드 없이 — 비교용)
const FESTIVAL = Number(process.argv[4] ?? ENHANCE_SETTINGS.festivalTurn);
// 장소 장수 증가 주기 — 넷째 인자(0이면 끔)
const DRAW_GROWTH = Number(process.argv[5] ?? ENHANCE_SETTINGS.drawGrowthTurns ?? 0);
// 그 밖의 규칙 덮어쓰기 — 환경변수 SETTINGS='{"skillGrowthTurns":8}'
const EXTRA = JSON.parse(process.env.SETTINGS ?? '{}');
const rs = Array.from({ length: N }, (_, i) => runGame(1000 + i));
const turns = rs.map(r => r.turns);
const lv3 = rs.map(r => r.firstLv3).filter((t): t is number => t !== null);
const lv6 = rs.map(r => r.firstLv6).filter((t): t is number => t !== null);
const tops = rs.flatMap(r => r.topLevel);
console.log(`== 카드 강화 — ${N}판 (목표 ${TARGET}, 턴 제한 없음)`);
console.log(`  평균 ${(turns.reduce((a, b) => a + b, 0) / N).toFixed(1)}턴`);
console.log(`  끝난 턴  10% ${quantile(turns, 0.1)} · 중앙값 ${quantile(turns, 0.5)} · 90% ${quantile(turns, 0.9)} · 최대 ${Math.max(...turns)}`);
console.log(`  20턴을 넘긴 판 ${pct(turns.filter(t => t > 20).length, N)} · 목표 체력으로 끝난 판 ${pct(rs.filter(r => r.byWinLine).length, N)} · 선 승률 ${pct(rs.filter(r => r.firstWon).length, N)}`);
console.log(`  처음 Lv.3 턴 중앙값 ${lv3.length ? quantile(lv3, 0.5) : '-'}(${pct(lv3.length, N)}) · 처음 Lv.6 턴 중앙값 ${lv6.length ? quantile(lv6, 0.5) : '-'}(${pct(lv6.length, N)})`);
console.log(`  끝날 때 최고 레벨 ${Array.from({ length: ENHANCE_MAX_LEVEL }, (_, i) => i + 1).filter(l => tops.includes(l)).map(l => `Lv${l} ${pct(tops.filter(t => t === l).length, tops.length)}`).join(' · ')}`);
console.log(`  끝날 때 레벨 합 중앙값 ${quantile(rs.flatMap(r => r.levelSum), 0.5)}`);
