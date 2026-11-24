/**
 * 혼자 놀기 봇 난이도 점검(docs/AI_ROADMAP.md §3-2) — 개인전 판에서 난이도끼리 붙여 쉬움 < 보통 < 어려움인지 본다.
 *   1:1 — 보통 vs 쉬움, 어려움 vs 보통(선은 판마다 엔진이 섞는다)
 *   4명 — 어려움 · 보통 · 쉬움 · 쉬움, 난이도별 평균 순위
 * 어려움은 서버와 같은 worker 풀로 둔다(AI_WORKERS).
 *
 * 실행: cd server && npx ts-node --transpile-only scripts/aiLevels.ts [판 수=100] [예산ms=100] [enhance|normal=enhance]
 */
import { initIndividualGame } from '../engine/turnManager';
import { acornOfferOpen } from '../engine/acorn';
import { applyDecision, heuristicDecision, type BotDecision } from '../ai/searchBot';
import { BotPool, configFromEnv } from '../ai/pool';
import { ENHANCE_SETTINGS, PLAYER_COLORS } from 'shared';
import type { BotLevel, GameState, SideId } from 'shared';

const GAMES = Number(process.argv[2] ?? 100);
const BUDGET = Number(process.argv[3] ?? 100);
const ENHANCE = (process.argv[4] ?? 'enhance') === 'enhance';
const config = { ...configFromEnv(), budgetMs: BUDGET, minBudgetMs: Math.min(BUDGET, 20) };
const pool = new BotPool(config);

function actorOf(s: GameState): SideId | null {
  const offer = s.enhance?.acorn?.offer;
  if (offer && acornOfferOpen(s)) return Object.keys(offer.picked).find(k => offer.picked[k] === null) ?? null;
  return s.pendingChoice ?? s.activeTeam;
}

async function play(levels: BotLevel[]): Promise<number[]> {
  const sides = levels.map((_, i) => ({ side: `p${i + 1}`, nickname: `b${i}`, color: PLAYER_COLORS[i].id }));
  const s = initIndividualGame(sides, Math.random, ENHANCE ? ENHANCE_SETTINGS : undefined, ENHANCE);
  const levelOf = (side: SideId) => levels[Number(side.slice(1)) - 1];
  for (let step = 0; s.phase === 'playing' && step < 30000; step++) {
    const side = actorOf(s);
    if (side === null) break;
    const lv = levelOf(side);
    let d: BotDecision | null = null;
    if (lv === 'hard') d = await pool.decide(s, side, BUDGET * 20 + 1000);
    d ??= heuristicDecision(s, side, Math.random, lv === 'easy' ? 'easy' : 'normal');
    if (d === null) break;
    applyDecision(s, side, d, Math.random);
  }
  return levels.map((_, i) => s.teams[`p${i + 1}`].finish?.rank ?? levels.length);
}

async function series(label: string, levels: BotLevel[], games: number) {
  const t0 = Date.now();
  const ranks: number[][] = [];
  let next = 0;
  const lanes = Array.from({ length: levels.includes('hard') ? config.workers : 1 }, async () => {
    while (next < games) { next++; ranks.push(await play(levels)); }
  });
  await Promise.all(lanes);
  const avg = levels.map((_, i) => ranks.reduce((a, r) => a + r[i], 0) / ranks.length);
  const wins = levels.map((_, i) => ranks.filter(r => r[i] === 1).length / ranks.length);
  console.log(`  ${label}: ` + levels.map((lv, i) => `${lv} 1위 ${(wins[i] * 100).toFixed(0)}% · 평균 ${avg[i].toFixed(2)}위`).join(' | ') +
    ` (${ranks.length}판 · ${((Date.now() - t0) / 1000).toFixed(0)}초)`);
}

(async () => {
  console.log(`개인전 ${ENHANCE ? '강화' : '일반'} · 판 ${GAMES} · 어려움 예산 ${BUDGET}ms · worker ${config.workers}`);
  await series('1:1 보통 vs 쉬움', ['normal', 'easy'], GAMES * 2);
  await series('1:1 어려움 vs 보통', ['hard', 'normal'], GAMES);
  await series('4명', ['hard', 'normal', 'easy', 'easy'], Math.max(20, Math.floor(GAMES / 2)));
  await pool.close();
})();
