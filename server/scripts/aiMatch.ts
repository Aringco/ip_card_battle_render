/**
 * 탐색 봇의 강함 — 혼자 놀기와 같은 자리(사람 = A 선공, 컴퓨터 = B 후공)에서 수천 판을 둬 B의 승률을 잰다.
 *   기준선: A · B 모두 지금의 컴퓨터(heuristicDecision) — 후공 자리의 유불리
 *   탐색 봇: A는 지금의 컴퓨터, B는 탐색 봇(서버와 같은 worker 풀로 — 풀 자체의 시험도 겸한다)
 * 로드맵의 목표는 "탐색 봇 B 승률이 기준선보다 확실히 높다(65%+)"이다.
 *
 * 실행: cd server && npx ts-node --transpile-only scripts/aiMatch.ts [판 수=200] [예산ms=100] [enhance|normal|both=both]
 *   예산을 서버 설정(AI_BUDGET_MS, 기본 300)보다 낮게 두면 빨리 끝나는 대신 봇이 조금 약하게 나온다.
 *   AI_WORKERS로 worker 수를 정한다(기본 min(2, 코어 − 2)).
 */
import { initEnhanceGame, initGame } from '../engine/turnManager';
import { acornOfferOpen } from '../engine/acorn';
import { applyDecision, heuristicDecision, type BotDecision } from '../ai/searchBot';
import { BotPool, configFromEnv, formatStats } from '../ai/pool';
import { ENHANCE_SETTINGS } from 'shared';
import type { GameState, SideId } from 'shared';

const GAMES = Number(process.argv[2] ?? 200);
const BUDGET = Number(process.argv[3] ?? 100);
const WHICH = (process.argv[4] ?? 'both') as 'enhance' | 'normal' | 'both';

const config = { ...configFromEnv(), budgetMs: BUDGET, minBudgetMs: Math.min(BUDGET, 20) };
const pool = new BotPool(config);

function makeGame(enhance: boolean): GameState {
  return enhance ? initEnhanceGame(['사람'], ['컴퓨터'], Math.random, ENHANCE_SETTINGS) : initGame(['사람'], ['컴퓨터'], Math.random);
}

/** 지금 둘 편 — 도토리 카드 고르기 중이면 아직 안 고른 편 하나 */
function actorOf(s: GameState): SideId | null {
  const offer = s.enhance?.acorn?.offer;
  if (offer && acornOfferOpen(s)) return (['A', 'B'] as SideId[]).find(x => offer.picked[x] === null) ?? null;
  return s.pendingChoice ?? s.activeTeam;
}

async function playGame(enhance: boolean, search: boolean): Promise<{ winner: string; turns: number; fallbacks: number }> {
  const s = makeGame(enhance);
  let fallbacks = 0;
  for (let step = 0; s.phase === 'playing' && step < 20000; step++) {
    const side = actorOf(s);
    if (side === null) break;
    let d: BotDecision | null = null;
    if (side === 'B' && search) {
      d = await pool.decide(s, 'B', BUDGET * 20 + 1000);
      if (d === null) fallbacks++;
    }
    d ??= heuristicDecision(s, side);
    if (d === null) break;
    applyDecision(s, side, d, Math.random);
  }
  return { winner: String(s.winner), turns: s.turn, fallbacks };
}

async function run(enhance: boolean, search: boolean) {
  const t0 = Date.now();
  const results: Awaited<ReturnType<typeof playGame>>[] = [];
  let next = 0;
  // 동시에 worker 수만큼 — 더 얹으면 풀이 "바쁘다"고 보고 예산을 줄여 봇이 약하게 잰다
  const lanes = Array.from({ length: search ? config.workers : 1 }, async () => {
    while (next < GAMES) { next++; results.push(await playGame(enhance, search)); }
  });
  await Promise.all(lanes);
  const b = results.filter(r => r.winner === 'B').length;
  const draw = results.filter(r => r.winner === 'draw').length;
  const turns = results.map(r => r.turns).sort((x, y) => x - y);
  const fb = results.reduce((a, r) => a + r.fallbacks, 0);
  const rate = b / results.length;
  const ci = 1.96 * Math.sqrt((rate * (1 - rate)) / results.length);
  console.log(
    `  ${search ? `탐색 봇(${BUDGET}ms)` : '기준선(지금 컴퓨터)'} — B 승률 ${(rate * 100).toFixed(1)}% ±${(ci * 100).toFixed(1)}` +
    ` · 무승부 ${draw} · 턴 중앙값 ${turns[Math.floor(turns.length / 2)]} · 대신 둔 수 ${fb} · ${((Date.now() - t0) / 1000).toFixed(0)}초`,
  );
}

(async () => {
  console.log(`판 ${GAMES} · 예산 ${BUDGET}ms · worker ${config.workers}`);
  for (const enhance of WHICH === 'both' ? [false, true] : [WHICH === 'enhance']) {
    console.log(enhance ? '■ 혼자 놀기 강화 1:1' : '■ 혼자 놀기 일반 1:1');
    await run(enhance, false);
    await run(enhance, true);
  }
  console.log(formatStats(pool.stats()));
  await pool.close();
})();
