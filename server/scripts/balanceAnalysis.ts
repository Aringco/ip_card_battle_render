/**
 * 행동 밸런스 분석 스크립트 — 체력(HP) 승부 + 디자인어(인어) 대기 배율 규칙에서
 * 각 행동(실용신양·상표토끼·디자인어·특허랑이)이 실제로 얼마나 자주/크게
 * 기여하는지 확인한다. 봇이 행동을 고를 때마다 "지금 고를 수 있는 행동들의
 * 즉시 가치"를 직접 계산해 가장 높은 것을 고르는 탐욕적(greedy) 전략을 쓰게 하고,
 * 각 동물이 실제로 얼마나 자주/얼마나 크게 기여했는지를 집계한다.
 *
 * 디자인어(인어)는 즉시 효과가 없는 대신 다음 행동의 배율을 키우는 스킬이라,
 * 1수 앞을 보지 않는 그리디 봇에게는 항상 가치 0으로 보인다 — 그러면 절대
 * 선택되지 않아 분석 자체가 무의미해지므로, "배율 증가분 × 예상 다음 사용
 * 레벨" 이라는 근사 휴리스틱으로 값을 매긴다(§7 참고).
 *
 * 실행: cd server && npx ts-node scripts/balanceAnalysis.ts [게임수]
 */
import { initGame } from '../engine/turnManager';
import { processPlayerAction, processSkillChoice, processPass } from '../engine/gameEngine';
import { eligibleAnimals, levelOf } from '../engine/skills';
import { PLACES, ANIMALS, MERMAID_MULTIPLIER_BASE, WIN_HP, LOSE_HP } from 'shared';
import type { Animal, GameState, Team } from 'shared';

function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// 실용신양의 "추가로 N장 더 뽑는다"는 직접적인 체력 가치가 아니라서, 뽑은 카드가
// 짝을 이뤄 경험치가 되는 정도를 대략적인 상대 가치로 환산한다(상대 비교용 근사치).
const SHEEP_DRAW_VALUE = 2;
// 인어는 즉시 가치가 0이라, "배율 증가분 × 다음에 대략 이 정도 레벨로 쓸 것이다"를
// 가정한 근사 기대값으로 평가한다. 실제 최적 플레이보다 보수적인 값이다.
const MERMAID_EXPECTED_NEXT_LEVEL = 2;

function skillValue(state: GameState, team: Team, animal: Animal): number {
  const opponent: Team = team === 'A' ? 'B' : 'A';
  const level = levelOf(state, team, animal);
  const mult = state.teams[team].pendingMultiplier;

  if (animal === 'sheep') return level * mult * SHEEP_DRAW_VALUE;
  if (animal === 'rabbit') return level * mult;
  if (animal === 'tiger') return Math.min(level * mult, state.teams[opponent].hp);

  // mermaid
  const newMultiplier = mult * MERMAID_MULTIPLIER_BASE ** level;
  return (newMultiplier - mult) * MERMAID_EXPECTED_NEXT_LEVEL;
}

/** 지금 이 팀이 고를 수 있는 행동들의 "즉시 가치"를 계산해 가장 높은 것을 고르는 탐욕적 선택. */
function greedyPick(state: GameState, team: Team): Animal | null {
  const options = eligibleAnimals(state, team);
  if (options.length === 0) return null;

  let best: Animal = options[0];
  let bestValue = -Infinity;
  for (const animal of options) {
    const value = skillValue(state, team, animal);
    if (value > bestValue) {
      bestValue = value;
      best = animal;
    }
  }
  return best;
}

// "인내심 있는" 전략 — 레벨이 PATIENCE_LEVEL 이상으로 쌓인 행동만 고르고,
// 그렇지 않으면 패스하며 레벨을 더 모은다(다음을 노리기).
const PATIENCE_LEVEL = 3;
function patientPick(state: GameState, team: Team): Animal | null {
  const options = eligibleAnimals(state, team).filter(a => levelOf(state, team, a) >= PATIENCE_LEVEL);
  if (options.length === 0) return null;

  let best: Animal = options[0];
  let bestValue = -Infinity;
  for (const animal of options) {
    const value = skillValue(state, team, animal);
    if (value > bestValue) {
      bestValue = value;
      best = animal;
    }
  }
  return best;
}

interface AnimalStat {
  picks: number;
  totalLevel: number;
  totalHpImpact: number; // 이 행동으로 실제 오간 체력의 절대값 합(myHpDelta + |oppHpDelta|)
}

function emptyStat(): AnimalStat {
  return { picks: 0, totalLevel: 0, totalHpImpact: 0 };
}

type PickFn = (state: GameState, team: Team) => Animal | null;

function runGame(
  seed: number,
  pick: PickFn,
  stats: Record<Animal, AnimalStat>,
  winnerAnimalImpact: Record<Animal, number>,
  loserAnimalImpact: Record<Animal, number>,
) {
  const rng = makeLCG(seed);
  const state = initGame(['botA'], ['botB'], rng);

  const perTeamAnimalImpact: Record<Team, Record<Animal, number>> = {
    A: { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 },
    B: { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 },
  };

  let safety = 0;
  while (state.phase === 'playing') {
    if (safety++ > 200_000) throw new Error(`무한루프 감지 seed=${seed}`);

    const place = PLACES[Math.floor(rng() * PLACES.length)];
    processPlayerAction(state, place, rng);

    if (state.pendingChoice !== null) {
      const team = state.pendingChoice;
      const animal = pick(state, team);
      if (animal === null) {
        processPass(state);
      } else {
        const level = levelOf(state, team, animal);
        const { events } = processSkillChoice(state, animal);
        const ev = events.find(e => e.type === 'skillApplied');
        let impact = 0;
        if (ev && ev.type === 'skillApplied') {
          impact = animal === 'sheep' ? level * SHEEP_DRAW_VALUE : ev.myHpDelta + Math.abs(ev.oppHpDelta);
        }
        stats[animal].picks += 1;
        stats[animal].totalLevel += level;
        stats[animal].totalHpImpact += impact;
        perTeamAnimalImpact[team][animal] += impact;
      }
    }
  }

  const winner = state.winner ?? 'draw';

  if (winner !== 'draw') {
    const loser: Team = winner === 'A' ? 'B' : 'A';
    for (const a of ANIMALS) {
      winnerAnimalImpact[a] += perTeamAnimalImpact[winner][a];
      loserAnimalImpact[a] += perTeamAnimalImpact[loser][a];
    }
  }

  return {
    winner,
    finalTurn: state.turn,
    hpA: state.teams.A.hp,
    hpB: state.teams.B.hp,
  };
}

function runBatch(label: string, pick: PickFn, gameCount: number) {
  const stats: Record<Animal, AnimalStat> = {
    sheep: emptyStat(), rabbit: emptyStat(), mermaid: emptyStat(), tiger: emptyStat(),
  };
  const winnerAnimalImpact: Record<Animal, number> = { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 };
  const loserAnimalImpact: Record<Animal, number> = { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 };

  let aWins = 0, bWins = 0, draws = 0;
  let totalTurns = 0;
  let knockouts = 0;

  for (let seed = 1; seed <= gameCount; seed++) {
    const { winner, finalTurn, hpA, hpB } = runGame(seed, pick, stats, winnerAnimalImpact, loserAnimalImpact);
    if (winner === 'A') aWins++;
    else if (winner === 'B') bWins++;
    else draws++;
    totalTurns += finalTurn;
    if (hpA >= WIN_HP || hpB >= WIN_HP || hpA <= LOSE_HP || hpB <= LOSE_HP) knockouts++;
  }

  console.log(`\n=== ${label} (${gameCount}게임) ===\n`);
  console.log(`A팀 승 ${aWins} (${(100 * aWins / gameCount).toFixed(1)}%) / B팀 승 ${bWins} (${(100 * bWins / gameCount).toFixed(1)}%) / 무승부 ${draws}`);
  console.log(`평균 종료 턴: ${(totalTurns / gameCount).toFixed(1)}  /  녹아웃 비율: ${(100 * knockouts / gameCount).toFixed(1)}%\n`);

  const totalImpactAll = ANIMALS.reduce((s, a) => s + stats[a].totalHpImpact, 0);
  const totalPicksAll = ANIMALS.reduce((s, a) => s + stats[a].picks, 0);

  console.log('동물별 선택 횟수 / 평균 레벨(고를 때) / 총 체력 영향(근사) / 비중 / 1회당 평균 영향');
  for (const a of ANIMALS) {
    const s = stats[a];
    const avgLevel = s.picks > 0 ? s.totalLevel / s.picks : 0;
    const impactShare = totalImpactAll > 0 ? (100 * s.totalHpImpact / totalImpactAll) : 0;
    const pickShare = totalPicksAll > 0 ? (100 * s.picks / totalPicksAll) : 0;
    const avgImpactPerPick = s.picks > 0 ? s.totalHpImpact / s.picks : 0;
    console.log(
      `  ${a.padEnd(8)} picks=${String(s.picks).padStart(6)} (${pickShare.toFixed(1)}%)  ` +
      `avgLv=${avgLevel.toFixed(2)}  totalImpact=${Math.round(s.totalHpImpact).toString().padStart(7)} (${impactShare.toFixed(1)}%)  ` +
      `avgImpact/pick=${avgImpactPerPick.toFixed(2)}`
    );
  }

  console.log('\n승리팀 vs 패배팀의 동물별 평균 체력 영향(승리팀이 유의미하게 높으면 그 행동이 승패에 강하게 기여한다는 뜻)');
  for (const a of ANIMALS) {
    const w = winnerAnimalImpact[a] / gameCount;
    const l = loserAnimalImpact[a] / gameCount;
    const ratio = l > 0 ? (w / l).toFixed(2) : (w > 0 ? '∞' : '-');
    console.log(`  ${a.padEnd(8)} 승리팀 평균=${w.toFixed(2)}  패배팀 평균=${l.toFixed(2)}  비율(승/패)=${ratio}`);
  }
  console.log('');
}

function main() {
  const gameCount = Number(process.argv[2] ?? 3000);
  runBatch('탐욕적 봇(레벨 1이라도 즉시 최고가치 행동 선택)', greedyPick, gameCount);
  runBatch(`인내심 있는 봇(레벨 ${PATIENCE_LEVEL} 이상 쌓일 때까지 패스 후 최고가치 행동 선택)`, patientPick, gameCount);
}

main();
