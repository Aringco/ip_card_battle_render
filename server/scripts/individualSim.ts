/**
 * 개인전(순위전) 봇 시뮬레이션 — 밸런스 수치를 정하기 위한 **보고용** 도구다.
 * 규칙·기본값은 이 스크립트가 바꾸지 않는다(INDIVIDUAL_MODE_ROADMAP.md §2-7).
 *
 * 봇: 무작위 장소(직전 장소 제외) + 쓸 수 있는 기술 중 무작위(특허랑이 대상도 무작위),
 *     쓸 수 있는 기술이 없으면 패스.
 *
 * 실행: cd server && npx ts-node scripts/individualSim.ts [판수=500] [targetScore]
 */
import { initIndividualGame } from '../engine/turnManager';
import { processPlayerAction, processSkillChoice, processPass } from '../engine/gameEngine';
import { eligibleAnimals } from '../engine/skills';
import { MAX_TURN, PLACES, PLAYER_COLORS, opponentsOf } from 'shared';
import type { Animal, GameEvent, GameState } from 'shared';

function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

interface GameResult {
  finalTurn: number;
  endReason: 'ranked' | 'turnLimit';
  firstPlaceReason: 'win' | 'last' | 'turnLimit';
  wins: number;      // 승리선에 닿아 순위가 정해진 사람 수
  outs: number;      // 체력 0으로 순위가 정해진 사람 수
  turnsPlayed: number;       // 기술을 한 번이라도 고른 차례 수
  twoSkillTurns: number;     // 기술을 두 번 쓴 차례 수
  mermaidThenTiger: number;  // 그중 인어 → 특허랑이로 이어진 차례 수
}

function runGame(n: number, seed: number, targetScore?: number): GameResult {
  const rng = makeLCG(seed);
  const players = Array.from({ length: n }, (_, i) => ({
    side: `p${i + 1}`, nickname: `bot${i + 1}`, color: PLAYER_COLORS[i].id,
  }));
  const state: GameState = initIndividualGame(players, rng, targetScore ? { targetScore } : undefined);

  let endReason: GameResult['endReason'] = 'turnLimit';
  let turnsPlayed = 0;
  let twoSkillTurns = 0;
  let mermaidThenTiger = 0;
  let guard = 0;

  while (state.phase === 'playing') {
    if (guard++ > 100_000) throw new Error(`무한루프 감지 (n=${n}, seed=${seed})`);

    const options = PLACES.filter(p => p !== state.lastPlace);
    const place = options[Math.floor(rng() * options.length)];
    processPlayerAction(state, place, rng);

    const skills: Animal[] = [];
    while (state.phase === 'playing' && state.pendingChoice !== null) {
      const side = state.pendingChoice;
      const eligible = eligibleAnimals(state, side);
      let events: GameEvent[];
      if (eligible.length === 0) {
        events = processPass(state).events;
      } else {
        const animal = eligible[Math.floor(rng() * eligible.length)];
        const foes = opponentsOf(state, side);
        const target = animal === 'tiger' ? foes[Math.floor(rng() * foes.length)] : undefined;
        skills.push(animal);
        events = processSkillChoice(state, animal, target).events;
      }
      const end = events.find((e): e is Extract<GameEvent, { type: 'gameEnd' }> => e.type === 'gameEnd');
      if (end) endReason = end.reason === 'turnLimit' ? 'turnLimit' : 'ranked';
    }
    if (skills.length > 0) turnsPlayed++;
    if (skills.length >= 2) {
      twoSkillTurns++;
      if (skills[0] === 'mermaid' && skills[1] === 'tiger') mermaidThenTiger++;
    }
  }

  const finishes = Object.values(state.teams).map(t => t.finish!);
  const first = finishes.find(f => f.rank === 1)!;
  return {
    finalTurn: state.turn,
    endReason,
    firstPlaceReason: first.reason === 'win' ? 'win' : first.reason === 'last' ? 'last' : 'turnLimit',
    wins: finishes.filter(f => f.reason === 'win').length,
    outs: finishes.filter(f => f.reason === 'out').length,
    turnsPlayed,
    twoSkillTurns,
    mermaidThenTiger,
  };
}

const games = Number(process.argv[2] ?? 500);
const targetScore = process.argv[3] ? Number(process.argv[3]) : undefined;
const pct = (a: number, b: number) => (b === 0 ? '-' : `${((a / b) * 100).toFixed(1)}%`);

console.log(`\n개인전 봇 시뮬레이션 — 인원별 ${games}판${targetScore ? ` · 목표 점수 ${targetScore}` : ' · 기본 규칙'} (턴 제한 ${MAX_TURN})\n`);
console.log('| 인원 | 기술/차례 | 평균 종료 라운드 | 최대 | 순위 확정으로 끝남 | 턴 제한으로 끝남 | 1위 경로: 승리선 / 마지막 생존 / 턴제한 | 순위 중 승리 : 탈락 | 인어→특허 콤보 (2장 쓴 차례 중) |');
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');

for (const n of [2, 4, 5, 8]) {
  const results: GameResult[] = [];
  for (let g = 0; g < games; g++) results.push(runGame(n, 1000 + g * 7919 + n, targetScore));

  const sum = (f: (r: GameResult) => number) => results.reduce((a, r) => a + f(r), 0);
  const ranked = results.filter(r => r.endReason === 'ranked').length;
  const wins = sum(r => r.wins);
  const outs = sum(r => r.outs);
  const two = sum(r => r.twoSkillTurns);
  const combo = sum(r => r.mermaidThenTiger);
  const maxTurn = Math.max(...results.map(r => r.finalTurn));
  const f = (k: GameResult['firstPlaceReason']) => results.filter(r => r.firstPlaceReason === k).length;

  console.log(
    `| ${n}명 | ${n >= 5 ? 2 : 1} | ${(sum(r => r.finalTurn) / games).toFixed(1)} | ${maxTurn} | ${pct(ranked, games)} | ${pct(games - ranked, games)} | ` +
    `${pct(f('win'), games)} / ${pct(f('last'), games)} / ${pct(f('turnLimit'), games)} | ${wins} : ${outs} | ` +
    `${n >= 5 ? `${combo}회 (${pct(combo, two)})` : '-'} |`,
  );
}
console.log('\n※ 모든 판이 유한 라운드 안에 끝났다(무한루프 가드 통과).');
