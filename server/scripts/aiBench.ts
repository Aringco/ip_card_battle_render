/**
 * 탐색 봇 예산 측정(docs/AI_ROADMAP.md 1단계) — 이 기계에서 엔진이 한 판을 얼마나 빨리 끝까지 두는지,
 * 판 중간 상태를 복사하는 데 얼마나 드는지, 그리고 "한 수 300ms" 안에 판 중간부터 끝까지 몇 번 굴릴 수 있는지를 잰다.
 * 무작위 정책(장소 무작위 · 쓸 수 있는 기술 중 무작위, 15% 패스)이라 실제 봇보다 조금 빠르게 나온다 — 규모를 보는 값이다.
 * 서버(테스트 · 운영 기계)에서 한 번 돌려 로드맵의 판단 시간 예산을 정한다.
 *
 * 실행: cd server && npx ts-node --transpile-only scripts/aiBench.ts
 */
import { initGame, initEnhanceGame, initIndividualGame } from '../engine/turnManager';
import { autoPickAcorns } from '../engine/acorn';
import { processPlayerAction, processSkillChoice, processPass } from '../engine/gameEngine';
import { eligibleAnimals } from '../engine/skills';
import { ENHANCE_SETTINGS, PLACES, PLAYER_COLORS, opponentsOf } from 'shared';
import type { GameState } from 'shared';

function lcg(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(1664525, s) + 1013904223) >>> 0) / 2 ** 32); }

function step(state: GameState, rng: () => number): void {
  const places = PLACES.filter(p => p !== state.lastPlace);
  processPlayerAction(state, places[Math.floor(rng() * places.length)], rng);
  autoPickAcorns(state, rng);
  let guard = 0;
  while (state.phase === 'playing' && state.pendingChoice !== null && guard++ < 10) {
    const side = state.pendingChoice;
    const opts = eligibleAnimals(state, side);
    if (opts.length === 0 || rng() < 0.15) { processPass(state); continue; }
    const foes = opponentsOf(state, side);
    processSkillChoice(state, opts[Math.floor(rng() * opts.length)], foes[Math.floor(rng() * foes.length)]);
  }
}
function playOut(state: GameState, rng: () => number): number {
  let n = 0;
  while (state.phase === 'playing' && n < 5000) { step(state, rng); n++; }
  return n;
}

const makers: Record<string, (r: () => number) => GameState> = {
  '팀전 1:1(일반)': r => initGame(['a'], ['b'], r),
  '강화 1:1': r => initEnhanceGame(['a'], ['b'], r, ENHANCE_SETTINGS),
  '개인전 4명(일반)': r => initIndividualGame([0, 1, 2, 3].map(i => ({ side: `p${i + 1}`, nickname: `b${i}`, color: PLAYER_COLORS[i].id })), r),
  '개인전 4명(강화)': r => initIndividualGame([0, 1, 2, 3].map(i => ({ side: `p${i + 1}`, nickname: `b${i}`, color: PLAYER_COLORS[i].id })), r, ENHANCE_SETTINGS, true),
};

for (const [name, make] of Object.entries(makers)) {
  const N = 300;
  let turns = 0, actions = 0;
  const t0 = performance.now();
  for (let i = 0; i < N; i++) { const s = make(lcg(i + 1)); actions += playOut(s, lcg(i + 1000)); turns += s.turn; }
  const perGame = (performance.now() - t0) / N;

  // 판 중간(전체 행동의 절반쯤) 상태를 만들어 복사 비용과 "300ms 안에 끝까지 굴리는 횟수"를 잰다
  const mid = make(lcg(7));
  const half = Math.max(1, Math.round(actions / N / 2));
  for (let k = 0; k < half && mid.phase === 'playing'; k++) step(mid, lcg(99 + k));
  const json = JSON.stringify(mid).length;
  const c0 = performance.now();
  for (let i = 0; i < 2000; i++) structuredClone(mid);
  const cloneUs = ((performance.now() - c0) / 2000) * 1000;
  let rollouts = 0;
  const r0 = performance.now();
  while (performance.now() - r0 < 300) { playOut(structuredClone(mid), lcg(rollouts + 5)); rollouts++; }

  console.log(`${name}: 한 판 ${perGame.toFixed(2)}ms · 평균 ${(turns / N).toFixed(1)}턴 · 장소 클릭 ${(actions / N).toFixed(0)}번 | 중간 상태 ${(json / 1024).toFixed(0)}KB · 복사 ${cloneUs.toFixed(0)}µs · 300ms에 끝까지 굴리기 ${rollouts}회`);
}
