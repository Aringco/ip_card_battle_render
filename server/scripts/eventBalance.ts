/**
 * 이벤트 모드 밸런스 — EVENT_MODE_ROADMAP.md §3-1·§3-2.
 *
 * ① 개발자를 이겨라: 목표 3 · 축제 3턴 · 도전자 선공으로 고정하고, 축제 뽑기 횟수 n × 증가 주기 k를 격자로 돌려
 *    "늘어짐 방지" 지표(판 길이 중앙값 ≤ 5분 · 95% ≤ 8분 · 무승부 ≤ 5%)를 맞추는 조합을 찾는다.
 * ② 목표점수 달성하기: 목표 10~20 각각에서 사람(그리디)이 10턴 안에 목표 점수에 닿는 비율을 잰다.
 *    컴퓨터는 공격형(상표토끼 없음, 특허랑이 우선)이고 도전자는 0점, 컴퓨터는 SCORE_RACE_CPU_HP에서 시작한다.
 * ③ 한 우물만 파기: 상표토끼·특허랑이 중 처음 쓴 카드만 쓰는 사람의 승률.
 *
 * 시간은 서버 연출 유예 상수(room.ts의 SETTLE_*)와 컴퓨터 생각 시간을 그대로 쓰고, 사람의 생각 시간만 가정한다 —
 * 실측(한 턴 ≈ 15~20초)과 맞춰 보며 HUMAN_* 값을 조정한다.
 *
 * 실행: cd server && npx ts-node scripts/eventBalance.ts [게임수=1000]
 */
import { initGame } from '../engine/turnManager';
import { processPlayerAction, processSkillChoice, processPass } from '../engine/gameEngine';
import { eligibleAnimals, levelOf } from '../engine/skills';
import {
  BEAT_DEV_SETTINGS, ONE_WELL_ALLOWED, ONE_WELL_SETTINGS, PLACES, SCORE_RACE_CPU_HP, SCORE_RACE_START_SCORE,
  SCORE_RACE_TARGET_MAX, SCORE_RACE_TARGET_MIN, SCORE_RACE_TURNS, TIME_ATTACK_SETTINGS, clampSettings, opponentsOf,
} from 'shared';
import type { Animal, GameEvent, GameSettings, GameState, Team } from 'shared';

const GAMES = Number(process.argv[2] ?? 1000);

// ── 시간 모형(초) ──
const HUMAN_PLACE_THINK = 4;   // 장소를 고르는 데 쓰는 시간
const HUMAN_SKILL_THINK = 4;   // 기술을 고르는 데 쓰는 시간
const HUMAN_PASS_THINK = 2;    // 쓸 게 없을 때(또는 아끼기로 했을 때)
const CPU_PLACE_THINK = 2.7;   // room.ts CPU_THINK_* 평균
const CPU_SKILL_THINK = 1.25;  // room.ts CPU_SKILL_THINK_* 평균
const NO_ACTION_SEC = 3;       // 고를 게 없으면 noActionTimeSec 뒤 자동 패스
// room.ts settleGraceMs와 같은 근사
const SETTLE_DRAW = 1.43, SETTLE_ROLL_STEP = 0.3, SETTLE_ROLL_ENTER = 0.5, SETTLE_COLLECT = 1.08, SETTLE_SKILL = 1.5, SETTLE_FESTIVAL = 0.7;

function settleSec(events: GameEvent[]): number {
  let draws = 0, rolls = 0, collects = 0, skills = 0, fest = 0;
  for (const e of events) {
    if (e.type === 'draw') draws++;
    else if (e.type === 'bonusDraws' || e.type === 'festivalDraws') rolls++;
    else if (e.type === 'collect') collects++;
    else if (e.type === 'skillApplied') skills++;
    else if (e.type === 'festival') fest++;
  }
  return (draws > 0 ? SETTLE_DRAW + (draws - 1) * SETTLE_ROLL_STEP : 0) + rolls * SETTLE_ROLL_ENTER + collects * SETTLE_COLLECT + skills * SETTLE_SKILL + fest * SETTLE_FESTIVAL;
}

function makeLCG(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

type Picker = (state: GameState, team: Team, rng: () => number) => Animal | null;

// 상대는 opponentsOf로 구한다 — `t === 'A' ? 'B' : 'A'` 뒤집기는 noTeamFlip.test.ts가 막는다(팀전 시뮬레이션이어도 같은 규칙).
const opp = (state: GameState, t: Team): Team => opponentsOf(state, t)[0] as Team;

/** 이길 수 있는 수가 있으면 그것(상표토끼로 승리선 · 특허랑이로 상대 0 또는 승리선) */
function finishingPick(state: GameState, team: Team): Animal | null {
  const me = state.teams[team];
  const foe = state.teams[opp(state, team)];
  const winHp = state.settings.targetScore * 2;
  for (const a of eligibleAnimals(state, team)) {
    const amount = levelOf(state, team, a) * me.pendingMultiplier;
    if (a === 'rabbit' && me.hp + amount >= winHp) return a;
    if (a === 'tiger' && (amount >= foe.hp || me.hp + Math.min(amount, foe.hp) >= winHp)) return a;
  }
  return null;
}

/** 사람 흉내 — 끝낼 수 있으면 끝내고, 아니면 즉시 가치가 가장 큰 것(인어는 배율로 근사). */
const greedy: Picker = (state, team) => {
  const fin = finishingPick(state, team);
  if (fin) return fin;
  const options = eligibleAnimals(state, team);
  if (options.length === 0) return null;
  const me = state.teams[team];
  const foeHp = state.teams[opp(state, team)].hp;
  const value = (a: Animal) => {
    const lv = levelOf(state, team, a);
    if (a === 'sheep') return lv * me.pendingMultiplier * 1.5;
    if (a === 'rabbit') return lv * me.pendingMultiplier;
    if (a === 'tiger') return Math.min(lv * me.pendingMultiplier, foeHp) * 2;
    return lv * 2;
  };
  return options.reduce((best, a) => (value(a) > value(best) ? a : best), options[0]);
};

/** 아끼는 사람 — 끝낼 수 있으면 끝내고, 아니면 레벨 3 이상인 것만 쓴다(그 전엔 모은다). 늘어지는 판의 꼬리를 본다. */
const patient: Picker = (state, team, rng) => {
  const fin = finishingPick(state, team);
  if (fin) return fin;
  if (!eligibleAnimals(state, team).some(a => levelOf(state, team, a) >= 3)) return null;
  return greedy(state, team, rng);
};

/** 혼자 놀기의 컴퓨터 — room.ts pickComputerSkill과 같다(이길 수 있으면 그 수, 아니면 무작위). */
const cpu: Picker = (state, team, rng) => {
  const options = eligibleAnimals(state, team);
  if (options.length === 0) return null;
  const me = state.teams[team];
  const foe = state.teams[opp(state, team)];
  const winHp = state.settings.targetScore * 2;
  for (const a of options) {
    if (a === 'sheep' || a === 'mermaid') continue;
    const amount = levelOf(state, team, a) * me.pendingMultiplier;
    if (a === 'rabbit' && me.hp + amount >= winHp) return a;
    if (a === 'tiger' && amount >= foe.hp) return a;
  }
  return options[Math.floor(rng() * options.length)];
};

interface GameStat { winner: Team | 'draw'; turns: number; seconds: number; finalA: number }

function play(settings: GameSettings, pickA: Picker, pickB: Picker, humanB: boolean, rng: () => number, oneWell = false, raceTarget?: number): GameStat {
  const state = initGame(['A'], ['B'], rng, settings);
  if (oneWell) state.oneWell = { side: 'A', allowed: [...ONE_WELL_ALLOWED], locked: null };
  // room.ts applyEventRules와 같은 세팅
  if (raceTarget !== undefined) {
    state.scoreRace = { side: 'A', target: raceTarget, maxTurn: SCORE_RACE_TURNS };
    state.teams.A.hp = SCORE_RACE_START_SCORE;
    state.teams.B.hp = SCORE_RACE_CPU_HP;
  }
  let seconds = 0;
  let guard = 0;
  while (state.phase === 'playing' && guard++ < 5000) {
    const team = state.activeTeam as Team;
    const human = team === 'A' || humanB;
    const options = PLACES.filter(p => p !== state.lastPlace);
    const { events } = processPlayerAction(state, options[Math.floor(rng() * options.length)], rng);
    seconds += (human ? HUMAN_PLACE_THINK : CPU_PLACE_THINK) + settleSec(events);
    if (state.pendingChoice === null) continue;
    const pick = (team === 'A' ? pickA : pickB)(state, team, rng);
    if (pick === null) {
      seconds += eligibleAnimals(state, team).length === 0 ? (human ? NO_ACTION_SEC : CPU_SKILL_THINK) : HUMAN_PASS_THINK;
      processPass(state);
    } else {
      const res = processSkillChoice(state, pick);
      seconds += (human ? HUMAN_SKILL_THINK : CPU_SKILL_THINK) + settleSec(res.events);
    }
  }
  return { winner: (state.winner ?? 'draw') as Team | 'draw', turns: state.turn, seconds, finalA: state.teams.A.hp };
}

const pct = (sorted: number[], p: number) => (sorted.length === 0 ? NaN : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]);
const fmtMin = (sec: number) => (Number.isFinite(sec) ? `${(sec / 60).toFixed(1)}분` : '-');

// ── ① 개발자를 이겨라 ──
for (const [label, bot] of [['양쪽 그리디', greedy], ['양쪽 아끼기(레벨 3 이상만)', patient]] as const) {
console.log(`\n① 개발자를 이겨라 — 목표 3 · 축제 3턴 · 도전자 선공 · ${label} · ${GAMES}판`);
console.log('n  k  | 턴 중앙 95% | 시간 중앙 95%      | 무승부 | 도전자 승률');
const grid: Array<{ n: number; k: number; med: number; p95: number; draw: number; firstWin: number }> = [];
for (const n of [1, 2, 3]) {
  for (const k of [1, 2, 3]) {
    const settings = clampSettings({ ...BEAT_DEV_SETTINGS, festivalDrawCount: n, festivalDrawIncreaseInterval: k });
    const rng = makeLCG(1000 + n * 10 + k);
    const stats = Array.from({ length: GAMES }, () => play(settings, bot, bot, true, rng));
    const secs = stats.map(s => s.seconds).sort((a, b) => a - b);
    const turns = stats.map(s => s.turns).sort((a, b) => a - b);
    const draw = stats.filter(s => s.winner === 'draw').length / GAMES;
    const firstWin = stats.filter(s => s.winner === 'A').length / GAMES;
    grid.push({ n, k, med: pct(secs, 0.5), p95: pct(secs, 0.95), draw, firstWin });
    console.log(`${n}  ${k}  | ${String(pct(turns, 0.5)).padStart(4)} ${String(pct(turns, 0.95)).padStart(4)} | ${fmtMin(pct(secs, 0.5)).padStart(6)} ${fmtMin(pct(secs, 0.95)).padStart(6)} | ${(draw * 100).toFixed(1).padStart(5)}% | ${(firstWin * 100).toFixed(1)}%`);
  }
}
const ok = grid.filter(g => g.med <= 300 && g.p95 <= 480 && g.draw <= 0.05);
const pick = ok.sort((a, b) => Math.abs(a.firstWin - 0.5) - Math.abs(b.firstWin - 0.5) || a.n - b.n)[0];
console.log(pick
  ? `→ 지표를 맞추는 조합 중 승률이 가장 고른 것: n=${pick.n}, k=${pick.k}`
  : '→ 지표를 모두 맞추는 조합이 없다 — 이벤트 전용 최대 턴(settings.maxTurn)을 검토할 것');
}

// ── ② 목표점수 달성하기 ──
/** 목표점수 달성하기의 컴퓨터 — room.ts pickScoreRaceComputerSkill과 같다(상표토끼 없음, 특허랑이 → 인어 → 양). */
const raceCpu: Picker = (state, team) => {
  const options = eligibleAnimals(state, team).filter(a => a !== 'rabbit');
  const foeHp = state.teams[opp(state, team)].hp;
  if (options.includes('tiger') && foeHp > 0) return 'tiger';
  if (options.includes('mermaid')) return 'mermaid';
  if (options.includes('sheep')) return 'sheep';
  return null;
};

console.log(`\n② 목표점수 달성하기 — ${SCORE_RACE_TURNS}턴 · 도전자 ${SCORE_RACE_START_SCORE}점 / 컴퓨터 ${SCORE_RACE_CPU_HP}점에서 시작 · 사람(그리디) 대 공격형 컴퓨터 · 목표마다 ${GAMES}판`);
console.log('목표 | 승률   | 최종 점수 중앙 25% 75% | 판 길이 중앙');
{
  const settings = clampSettings(TIME_ATTACK_SETTINGS);
  let totalWins = 0;
  for (let target = SCORE_RACE_TARGET_MIN; target <= SCORE_RACE_TARGET_MAX; target++) {
    const rng = makeLCG(2000 + target);
    const stats = Array.from({ length: GAMES }, () => play(settings, greedy, raceCpu, false, rng, false, target));
    const wins = stats.filter(s => s.winner === 'A').length;
    totalWins += wins;
    const scores = stats.map(s => s.finalA).sort((a, b) => a - b);
    const secs = stats.map(s => s.seconds).sort((a, b) => a - b);
    console.log(`${String(target).padStart(4)} | ${((wins / GAMES) * 100).toFixed(1).padStart(5)}% | ${String(pct(scores, 0.5)).padStart(4)} ${String(pct(scores, 0.25)).padStart(4)} ${String(pct(scores, 0.75)).padStart(4)}   | ${fmtMin(pct(secs, 0.5))}`);
  }
  const n = SCORE_RACE_TARGET_MAX - SCORE_RACE_TARGET_MIN + 1;
  console.log(`→ 목표가 고르게 뽑힐 때의 전체 승률 ${((totalWins / (GAMES * n)) * 100).toFixed(1)}%`);
}

// ── ③ 한 우물만 파기 ──
console.log(`\n③ 한 우물만 파기 — 허용 카드만 쓰는 사람(그리디) 대 컴퓨터 · ${GAMES}판`);
{
  const settings = clampSettings(ONE_WELL_SETTINGS);
  const rng = makeLCG(3000);
  const stats = Array.from({ length: GAMES }, () => play(settings, greedy, cpu, false, rng, true));
  const winRate = stats.filter(s => s.winner === 'A').length / GAMES;
  const secs = stats.map(s => s.seconds).sort((a, b) => a - b);
  console.log(`승률 ${(winRate * 100).toFixed(1)}% · 판 길이 중앙 ${fmtMin(pct(secs, 0.5))}`);
}
