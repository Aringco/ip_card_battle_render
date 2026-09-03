/**
 * 행동 밸런스 종합 시뮬레이션 — 체력(HP) 승부 + 디자인어(인어) 대기 배율 규칙에서
 * 여러 시나리오(봇 전략 조합)로 각각 수천 게임씩 돌려 밸런스를 점검한다.
 * 결과는 콘솔 출력과 동시에 markdown 리포트 파일로도 저장한다.
 *
 * 실행: cd server && npx ts-node scripts/skillBalanceSuite.ts [게임수(기본 6000)]
 */
import fs from 'fs';
import path from 'path';
import { initGame } from '../engine/turnManager';
import { processPlayerAction, processSkillChoice, processPass } from '../engine/gameEngine';
import { eligibleAnimals, levelOf } from '../engine/skills';
import { PLACES, ANIMALS, MAX_TURN, THRESHOLDS, INITIAL_HP, WIN_HP, LOSE_HP, FESTIVAL_TURN } from 'shared';
import type { Animal, GameState, Team } from 'shared';

function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

// 실용신양의 "추가로 N장 더 뽑는다"는 직접 체력 가치가 아니므로 대략적인 상대 가치로
// 환산한 근사치. 인어는 즉시 효과가 없어 "배율 증가분 × 다음에 대략 이 레벨로 쓸
// 것이다"라는 근사 기대값으로 평가한다(1수 앞을 보지 못하면 항상 가치 0이라
// 절대 선택되지 않아 분석 자체가 무의미해지기 때문).
const SHEEP_DRAW_VALUE = 2;
const MERMAID_EXPECTED_NEXT_LEVEL = 2;

function skillValue(state: GameState, team: Team, animal: Animal): number {
  const opponent: Team = team === 'A' ? 'B' : 'A';
  const level = levelOf(state, team, animal);
  const mult = state.teams[team].pendingMultiplier;

  if (animal === 'sheep') return level * mult * SHEEP_DRAW_VALUE;
  if (animal === 'rabbit') return level * mult;
  if (animal === 'tiger') return Math.min(level * mult, state.teams[opponent].hp);

  // 배율에 레벨만큼 더해진다(engine/skills.ts와 동일한 합연산 공식).
  const newMultiplier = mult + level;
  return (newMultiplier - mult) * MERMAID_EXPECTED_NEXT_LEVEL;
}

type PickFn = (state: GameState, team: Team, rng: () => number) => Animal | null;

function bestOf(options: Animal[], state: GameState, team: Team): Animal | null {
  if (options.length === 0) return null;
  let best = options[0];
  let bestValue = -Infinity;
  for (const a of options) {
    const v = skillValue(state, team, a);
    if (v > bestValue) { bestValue = v; best = a; }
  }
  return best;
}

/** 즉시 최고가치 행동을 고르는 탐욕적 전략(레벨 1이라도 바로 사용). */
const greedy: PickFn = (state, team) => bestOf(eligibleAnimals(state, team), state, team);

/** 레벨이 일정 이상 쌓인 행동만 고르고, 아니면 패스하며 더 모으는 전략. */
function patientStrategy(minLevel: number): PickFn {
  return (state, team) => bestOf(eligibleAnimals(state, team).filter(a => levelOf(state, team, a) >= minLevel), state, team);
}

/** 매번 고를 수 있는 것 중 완전 무작위로 고르는 전략(simulation.test.ts의 기본 봇과 동일). */
const random: PickFn = (state, team, rng) => {
  const options = eligibleAnimals(state, team);
  if (options.length === 0) return null;
  return options[Math.floor(rng() * options.length)];
};

/** 인어를 최우선으로 계속 쌓다가, 더 쌓을 게 없으면 특허랑이 > 상표토끼 > 실용신양 순으로 몰아치는 전략. */
const mermaidCombo: PickFn = (state, team) => {
  const options = eligibleAnimals(state, team);
  if (options.length === 0) return null;
  if (options.includes('mermaid')) return 'mermaid';
  const priority: Animal[] = ['tiger', 'rabbit', 'sheep'];
  for (const p of priority) if (options.includes(p)) return p;
  return options[0];
};

/** 특정 동물을 절대 고르지 않는 탐욕적 전략 — 그 행동 하나의 진짜 기여도를 측정하기 위한 대조군. */
function greedyExcluding(banned: Animal): PickFn {
  return (state, team) => bestOf(eligibleAnimals(state, team).filter(a => a !== banned), state, team);
}

interface MatchResult {
  aWins: number; bWins: number; draws: number;
  totalTurns: number; knockouts: number;
  games: number;
}

function runMatch(gameCount: number, pickA: PickFn, pickB: PickFn, seedOffset = 0): MatchResult {
  const result: MatchResult = { aWins: 0, bWins: 0, draws: 0, totalTurns: 0, knockouts: 0, games: gameCount };

  for (let i = 1; i <= gameCount; i++) {
    const seed = seedOffset + i;
    const rng = makeLCG(seed);
    const state = initGame(['botA'], ['botB'], rng);

    let safety = 0;
    while (state.phase === 'playing') {
      if (safety++ > 200_000) throw new Error(`무한루프 감지 seed=${seed}`);
      const place = PLACES[Math.floor(rng() * PLACES.length)];
      processPlayerAction(state, place, rng);

      if (state.pendingChoice !== null) {
        const team = state.pendingChoice;
        const pick = team === 'A' ? pickA : pickB;
        const animal = pick(state, team, rng);
        if (animal === null) processPass(state);
        else processSkillChoice(state, animal);
      }
    }

    result.totalTurns += state.turn;
    if (state.teams.A.hp >= WIN_HP || state.teams.B.hp >= WIN_HP || state.teams.A.hp <= LOSE_HP || state.teams.B.hp <= LOSE_HP) {
      result.knockouts++;
    }
    if (state.winner === 'A') result.aWins++;
    else if (state.winner === 'B') result.bWins++;
    else result.draws++;
  }

  return result;
}

function fmtMatch(r: MatchResult): { aPct: string; bPct: string; drawPct: string; avgTurn: string; koPct: string } {
  return {
    aPct: (100 * r.aWins / r.games).toFixed(1),
    bPct: (100 * r.bWins / r.games).toFixed(1),
    drawPct: (100 * r.draws / r.games).toFixed(1),
    avgTurn: (r.totalTurns / r.games).toFixed(1),
    koPct: (100 * r.knockouts / r.games).toFixed(1),
  };
}

function main() {
  const gameCount = Number(process.argv[2] ?? 6000);
  const lines: string[] = [];
  const log = (s: string = '') => { console.log(s); lines.push(s); };

  log(`# 행동 밸런스 시뮬레이션 리포트 — 체력(HP) 승부 + 축제 규칙`);
  log('');
  log(`생성 시각: ${new Date().toISOString()}`);
  log(`시나리오당 게임 수: ${gameCount}`);
  log(`전제: 체력 ${INITIAL_HP}에서 시작해 ${WIN_HP} 이상이면 즉시 승리, ${LOSE_HP} 이하면 즉시 패배.`);
  log(`레벨업 임계값 — 양·토끼 ${THRESHOLDS.sheep}, 인어·호랑이 ${THRESHOLDS.mermaid} (경험치 기준, 점수 아님).`);
  log(`${FESTIVAL_TURN}턴부터 축제(페어 경험치 2배), 최대 ${MAX_TURN}턴.`);
  log('');
  log('> 카드 숫자 합은 오직 경험치만 채운다. 체력(=점수)은 오직 행동으로만 움직인다:');
  log('> 상표토끼(+레벨×배율 회복), 특허랑이(상대에게서 레벨×배율 강탈), 디자인어(다음');
  log('> 행동의 배율에 레벨만큼 더함, 스스로는 소모하지 않고 계속 누적).');
  log('');
  log(`> ⚠️ 실용신양의 "가치"와 디자인어의 "가치"는 봇이 행동을 비교하기 위한 근사 휴리스틱이다.`);
  log('> 실제 게임 효과(processSkillChoice) 자체는 이 근사와 무관하게 정확한 규칙대로 적용된다.');
  log('> 디자인어는 즉시 효과가 없어(다음 행동의 배율만 키움), "배율 증가분 × 다음에 대략');
  log(`> 레벨 ${MERMAID_EXPECTED_NEXT_LEVEL}로 쓸 것이다"라는 가정으로 값을 매겼다 — 1수만 보는 그리디 봇에게 실제`);
  log('> 최적 플레이보다 보수적인 값이다.');
  log('');

  // ── 시나리오 1: 자기 대전 ──
  log(`## 1. 같은 전략끼리 자기 대전 (좌우 쏠림이 없어야 정상)`);
  log('');
  log('| 시나리오 | A 승률 | B 승률 | 무승부 | 평균 종료 턴 | 녹아웃 비율 |');
  log('|---|---|---|---|---|---|');

  const scenarios1: Array<[string, PickFn]> = [
    ['무작위 선택(simulation.test.ts 기본 봇과 동일)', random],
    ['탐욕적(레벨 1이라도 즉시 최고가치)', greedy],
    ['인내심 Lv.3 (Lv.3 미만은 패스)', patientStrategy(3)],
    ['인내심 Lv.5 (Lv.5 미만은 패스)', patientStrategy(5)],
    ['인어 콤보(계속 쌓다 몰아치기)', mermaidCombo],
  ];
  for (const [name, fn] of scenarios1) {
    const r = runMatch(gameCount, fn, fn, 0);
    const f = fmtMatch(r);
    log(`| ${name} | ${f.aPct}% | ${f.bPct}% | ${f.drawPct}% | ${f.avgTurn} | ${f.koPct}% |`);
  }
  log('');
  log('→ 위 시나리오는 A/B가 동일한 전략을 쓰므로 승률이 50:50 근처여야 정상이다. 선공(A)이');
  log('약간 유리하게 나온다면 그건 카드 뽑기 순서상 자연스러운 선공 이점이지, 행동 밸런스');
  log('문제는 아니다.');
  log('');

  // ── 시나리오 2: 전략 간 맞대결 ──
  log(`## 2. 서로 다른 전략끼리 맞대결`);
  log('');
  log('| A 전략 | B 전략 | A 승률 | B 승률 | 무승부 |');
  log('|---|---|---|---|---|');

  const scenarios2: Array<[string, PickFn, string, PickFn]> = [
    ['탐욕적', greedy, '무작위', random],
    ['인내심 Lv.3', patientStrategy(3), '탐욕적', greedy],
    ['인내심 Lv.5', patientStrategy(5), '탐욕적', greedy],
    ['인어 콤보', mermaidCombo, '무작위', random],
    ['인어 콤보', mermaidCombo, '탐욕적', greedy],
  ];
  for (const [nameA, fnA, nameB, fnB] of scenarios2) {
    const r = runMatch(gameCount, fnA, fnB, 10_000);
    const f = fmtMatch(r);
    log(`| ${nameA} | ${nameB} | ${f.aPct}% | ${f.bPct}% | ${f.drawPct}% |`);
  }
  log('');
  log('→ 마지막 두 행은 "인어를 계속 쌓다가 몰아치는" 전략이 실제로 얼마나 위협적인지 보여준다.');
  log('무작위/탐욕적 상대로 85%를 크게 넘으면 배율이 과하다는 신호다(계획서 8단계 손잡이 참고 —');
  log('배율 상한, 배율 유효기간 1턴, 행동 1회당 체력 상한 순으로 최소 개입한다).');
  log('');

  // ── 시나리오 3: 행동 밴 매치업 ──
  log(`## 3. 행동 밴 매치업 (한쪽만 특정 행동을 절대 못 쓸 때, 둘 다 "탐욕적" 전략)`);
  log('');
  log('| A팀 금지 행동 | A 승률 | B 승률(전체 사용) |');
  log('|---|---|---|');

  const banScenarios: Animal[] = ['sheep', 'rabbit', 'mermaid', 'tiger'];
  for (const banned of banScenarios) {
    const r = runMatch(gameCount, greedyExcluding(banned), greedy, 20_000);
    const f = fmtMatch(r);
    log(`| ${banned} 금지 | ${f.aPct}% | ${f.bPct}% |`);
  }
  log('');
  log('→ 체력 승부에서는 상표토끼·특허랑이가 직접 승패를 결정짓는 행동이라, 이 둘을 금지당한');
  log('쪽이 크게 불리하게 나오는 게 정상이다. 반대로 디자인어 금지가 승률에 거의 영향을 주지');
  log('않는다면(배율 없이도 탐욕적 봇이 충분히 잘 싸운다면) 디자인어의 실전 기여도가 낮다는');
  log('뜻이므로 §8의 튜닝 대상으로 살펴볼 것.');
  log('');

  const outPath = path.join(__dirname, '..', '..', 'SKILL_BALANCE_REPORT.md');
  fs.writeFileSync(outPath, lines.join('\n') + '\n', 'utf-8');
  console.log(`\n리포트 저장됨: ${outPath}`);
}

main();
