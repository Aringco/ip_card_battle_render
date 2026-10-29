/**
 * 개인전 '강화' 방 봇 시뮬레이션 — 턴 제한이 없는 판이 언제나 끝나는지, 얼마나 걸리는지 보는 **보고용** 도구다(2026-10-30).
 * 규칙·기본값은 이 스크립트가 바꾸지 않는다.
 *
 * 봇: 무작위 장소(직전 장소 제외) + 쓸 수 있는 기술 중 무작위(대상이 필요하면 — needsTarget — 대상도 무작위), 없으면 패스.
 *
 * 실행: cd server && npx ts-node scripts/individualEnhanceSim.ts [판수=200] [targetScore=200]
 */
import { initIndividualGame } from '../engine/turnManager';
import { processPlayerAction, processSkillChoice, processPass } from '../engine/gameEngine';
import { eligibleAnimals, levelOf } from '../engine/skills';
import { ENHANCE_SETTINGS, PLACES, PLAYER_COLORS, needsTarget, opponentsOf } from 'shared';
import type { GameState } from 'shared';

function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const TURN_GUARD = 2000;

function runGame(n: number, seed: number, targetScore: number): { turn: number; wins: number; outs: number } {
  const rng = makeLCG(seed);
  const players = Array.from({ length: n }, (_, i) => ({ side: `p${i + 1}`, nickname: `bot${i + 1}`, color: PLAYER_COLORS[i].id }));
  const state: GameState = initIndividualGame(players, rng, { ...ENHANCE_SETTINGS, targetScore }, true);

  while (state.phase === 'playing') {
    if (state.turn > TURN_GUARD) throw new Error(`${TURN_GUARD}턴을 넘겼다 (n=${n}, seed=${seed})`);
    const options = PLACES.filter(p => p !== state.lastPlace);
    processPlayerAction(state, options[Math.floor(rng() * options.length)], rng);
    let guard = 0;
    while (state.phase === 'playing' && state.pendingChoice !== null) {
      if (guard++ > 10) throw new Error('기술 단계가 끝나지 않는다');
      const side = state.pendingChoice;
      const eligible = eligibleAnimals(state, side);
      if (eligible.length === 0) {
        processPass(state);
        continue;
      }
      const animal = eligible[Math.floor(rng() * eligible.length)];
      const foes = opponentsOf(state, side);
      const target = needsTarget(state, animal, levelOf(state, side, animal)) ? foes[Math.floor(rng() * foes.length)] : undefined;
      const before = state.skillsUsedThisTurn;
      const { events } = processSkillChoice(state, animal, target);
      if (events.length === 0 || (state.pendingChoice === side && state.skillsUsedThisTurn === before)) processPass(state);
    }
  }
  const finishes = Object.values(state.teams).map(t => t.finish?.reason);
  return { turn: state.turn, wins: finishes.filter(r => r === 'win').length, outs: finishes.filter(r => r === 'out').length };
}

const games = Number(process.argv[2] ?? 200);
const targetScore = Number(process.argv[3] ?? ENHANCE_SETTINGS.targetScore);
for (const n of [2, 3, 4, 5, 8]) {
  const results = Array.from({ length: games }, (_, i) => runGame(n, 1000 * n + i, targetScore));
  const turns = results.map(r => r.turn).sort((a, b) => a - b);
  const avg = turns.reduce((a, b) => a + b, 0) / turns.length;
  const p90 = turns[Math.floor(turns.length * 0.9)];
  const wins = results.reduce((a, r) => a + r.wins, 0) / games;
  const outs = results.reduce((a, r) => a + r.outs, 0) / games;
  console.log(`${n}명 · 목표 ${targetScore}: 평균 ${avg.toFixed(1)}턴 · 90% ${p90}턴 · 최장 ${turns.at(-1)}턴 · 판당 승리 ${wins.toFixed(2)}명 · 탈락 ${outs.toFixed(2)}명`);
}
