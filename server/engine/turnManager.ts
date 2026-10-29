import {
  ENHANCE_SETTINGS_LIMITS,
  enhanceSkillsPerTurn,
  LOSE_HP,
  INDIVIDUAL_TWO_SKILLS_FROM,
  clampSettings,
  cloneEnhanceStatus,
  festivalDrawInfoAt,
  maxTurnOf,
  nextActiveSide,
  opponentsOf,
} from 'shared';
import type { GameEvent, GameSettings, GameState, PlayerColorId, SettingsLimits, SideId, Team, TeamState } from 'shared';
import { dealOpeningSharedCards, initStacks } from './places';
import type { RNG } from './places';
import { rankByHpAndEnd, resolveRanks } from './ranking';

/** 체력이 움직인 뒤의 승패 판정 — 팀전은 즉시 승패(checkKnockout), 개인전은 순위(resolveRanks). */
export function judgeHp(state: GameState): GameEvent[] {
  return state.mode === 'individual' ? resolveRanks(state) : checkKnockout(state);
}

/**
 * 카드 강화 판의 한 차례 기술 장수 — 15턴마다 하나씩 늘어 최대 3장(enhanceSkillsPerTurn). 개인전은 시작 인원 5명 이상이면
 * 처음부터 2장이므로 둘 중 큰 쪽이다(더하면 3장 상한에 너무 일찍 닿는다).
 */
export function enhanceSkillsOf(state: GameState): 1 | 2 | 3 {
  const byTurn = enhanceSkillsPerTurn(state.turn);
  const base = state.mode === 'individual' && state.turnOrder.length >= INDIVIDUAL_TWO_SKILLS_FROM ? 2 : 1;
  return Math.max(byTurn, base) as 1 | 2 | 3;
}

/**
 * 시작 체력 = 목표 점수 그 자체다 — 목표 점수만큼 "더 벌거나 잃어야" 끝나는 게임이므로,
 * 목표 점수가 6이면 6에서 시작해 12에 닿으면 승리, 0에 닿으면 패배다.
 */
function winHpOf(state: GameState): number {
  return state.settings.targetScore * 2;
}

function determineWinnerByHp(state: GameState): Team | 'draw' {
  const a = state.teams.A.hp;
  const b = state.teams.B.hp;
  if (a > b) return 'A';
  if (b > a) return 'B';
  return 'draw';
}

/** 게임 종료를 한 곳에서 처리한다 — phase/winner/pendingChoice를 모두 정리하고 gameEnd를 낸다. */
function endGame(state: GameState, winner: SideId | 'draw', reason: 'knockout' | 'turnLimit' | 'target'): GameEvent[] {
  state.phase = 'ended';
  state.winner = winner;
  state.pendingChoice = null;
  return [{ type: 'gameEnd', winner, reason }];
}

/**
 * 체력 즉시 승패 판정 — 행동을 적용한 직후(=턴을 넘기기 전)에 호출된다.
 * 체력은 오직 상표토끼(자신)·특허랑이(상대에게서 강탈)로만 움직이므로, 이론상 두 팀이
 * 동시에 승리 조건을 만족할 수 없다. 그래도 방어적으로 무승부 분기를 남겨둔다.
 */
export function checkKnockout(state: GameState): GameEvent[] {
  if (state.phase !== 'playing') return [];
  // 이벤트 '목표점수 달성하기'에는 즉시 승패가 없다 — 0점에서 시작하므로 그대로 두면 첫 턴에 넉아웃으로 끝나고,
  // 판정은 마지막 턴이 끝났을 때 점수로만 한다(advanceTurn).
  if (state.scoreRace) return [];

  const winHp = winHpOf(state);
  const aWins = state.teams.A.hp >= winHp || state.teams.B.hp <= LOSE_HP;
  const bWins = state.teams.B.hp >= winHp || state.teams.A.hp <= LOSE_HP;
  if (!aWins && !bWins) return [];
  if (aWins && bWins) return endGame(state, 'draw', 'knockout');
  return endGame(state, aWins ? 'A' : 'B', 'knockout');
}

/**
 * 턴 종료 공통 경로 — 행동 선택(또는 패스) 직후 반드시 이걸 거친다.
 * 즉시 승패가 났으면 턴을 넘기지 않고 그대로 게임을 끝낸다.
 */
export function finishTurn(state: GameState): GameEvent[] {
  const ko = checkKnockout(state);
  if (ko.length > 0) return ko;
  return advanceTurn(state);
}

/**
 * 도토리 축제 랜덤 뽑기 — settings.festivalTurn에 도달한 턴부터는 "그 턴부터 매 턴 계속"
 * n회씩 발동한다(한 번 터지고 끝나는 일회성 보너스가 아니다). 그리고 매 턴 같은 n회가
 * 아니라, settings.festivalDrawIncreaseInterval(k)턴이 지날 때마다 n×1 → n×2 → n×3 ...
 * 으로 단계가 한 번씩 올라가고, 그 단계의 n×stage가 이후 매 턴 유지된다(k를 999에 가깝게
 * 크게 잡으면 MAX_TURN 안에서 절대 2단계로 못 올라간다는 뜻일 뿐, n×1회가 festivalTurn
 * 이후 매 턴 계속 발동하는 것 자체는 그대로 적용된다).
 *
 * 실제 계산식은 shared/constants.ts의 festivalDrawInfoAt에 있다 — 클라이언트 헤더가
 * "지금 몇 회, 몇 턴 후 몇 회로 강화되는지"를 서버 예약과 똑같은 식으로 안내해야 하므로
 * 양쪽이 함께 쓰는 shared에 두었다.
 */

/**
 * 턴 종료 처리 — 행동 선택까지 모두 끝난 뒤에만(또는 checkKnockout이 통과한 뒤에만) 호출된다.
 *
 * 순서:
 * 1. 이미 끝난 게임은 절대 되살리지 않는다.
 * 2. 팀 교대 (선공→후공, 후공→선공)
 * 3. 후공 팀이 플레이를 마친 시점(=한 라운드가 다 돈 시점)에 턴 카운터 증가
 * 4. FESTIVAL_TURN 도달 시 축제 진입(안내는 1회) + 그 뒤로 "매 턴(플레이어 교대마다)" 다음
 *    차례 팀(A/B 구분 없이)에게 도토리 축제 랜덤 뽑기 예약
 * 5. MAX_TURN 초과 시 체력 비교로 게임 종료
 */
export function advanceTurn(state: GameState): GameEvent[] {
  if (state.phase !== 'playing') return [];

  const events: GameEvent[] = [];

  const currentTeam = state.activeTeam;
  const nextTeam = nextActiveSide(state, currentTeam);
  // 다음 차례가 없다는 건 판에 남은 편이 없다는 뜻 — 개인전에서 순위 판정(ranking.ts)이 먼저
  // 판을 끝내므로 정상 경로에서는 오지 않지만, 방어적으로 아무것도 하지 않는다.
  if (nextTeam === null) return events;

  // 카드 강화 — 방금 차례를 마친 편의 지속 효과(출혈 → 회복). **기술을 모두 쓴 뒤**, 차례가 넘어가기 전이다(2026-10-30 요청 —
  // 그 전에는 다음 차례가 **시작될 때** 들어, 상대가 기술을 쓰고 넘긴 순간 내 출혈이 내 차례를 열기도 전에 나를 0으로 만들었다).
  // 체력이 움직이므로 그 자리에서 승패를 보고, 끝났으면 차례를 넘기지 않는다. 순위가 정해진 사람(개인전 항복)은 건너뛴다.
  if (state.enhance && !state.teams[currentTeam].finish) {
    events.push(...tickEnhanceStatus(state, currentTeam));
    events.push(...judgeHp(state));
    if (state.phase !== 'playing') return events;
  }

  // 차례가 넘어갈 때마다 "이번 차례에 쓴 기술 수"를 비운다(개인전의 기술 2장 규칙).
  state.skillsUsedThisTurn = 0;

  // 카드 강화 판 — 방금 차례를 마친 편의 쿨타임을 하나씩 줄인다(쓴 순간 "쿨타임 + 1"로 세워 두었다 — shared/enhance.ts).
  // 차례가 끝나는 길(기술·패스·시간초과·항복)이 모두 여기를 지나므로 이 한 곳이면 된다.
  const cds = state.enhance?.cooldowns[currentTeam];
  if (cds) for (const a of Object.keys(cds) as Array<keyof typeof cds>) cds[a] = Math.max(0, cds[a] - 1);
  // 같은 자리에서 그 편에 걸린 효과 감소(상대 디자인어 Lv.9+ ÷N)의 남은 턴도 하나 준다 — 0이 되면 기술을 안 골랐어도 사라진다.
  const enh = state.enhance;
  if (enh && (enh.divisorTurns[currentTeam] ?? 0) > 0) {
    enh.divisorTurns[currentTeam] -= 1;
    if (enh.divisorTurns[currentTeam] === 0) enh.divisors[currentTeam] = 1;
  }

  // 한 라운드가 다 돈 시점 — turnOrder에서 다음 편의 위치가 지금 편의 위치보다 앞이면
  // 끝까지 돌아 처음으로 되돌아온 것이다. 팀전([선, 후])에서는 후공 팀이 마친 순간과 정확히 같고
  // (선 플레이어를 바꿔도 turnOrder가 함께 바뀐다), 개인전에서는 순위가 정해진 사람을 건너뛰어도
  // 위치 비교라 틀리지 않는다. ⚠️ 축제 시작·단계 상승이 이 카운터에 묶여 있다(festivalDrawInfoAt).
  const roundCompleted = state.turnOrder.indexOf(nextTeam) < state.turnOrder.indexOf(currentTeam);

  // 한 라운드가 끝난 경우 → 턴 카운터 증가
  if (roundCompleted) {
    state.turn++;
    // 카드 강화 판 — 15턴마다 한 차례에 쓰는 기술이 하나씩 는다(최대 3장). 턴이 오르는 이 한 곳에서만 정한다.
    if (state.enhance) state.skillsPerTurn = enhanceSkillsOf(state);

    // settings.festivalTurn 도달 시점부터 축제가 시작된다. festivalTurn이 MAX_TURN보다
    // 크게 설정돼 있으면(입력 자체는 막지 않는다 — SETTINGS_LIMITS 참고) 그 턴엔 아예
    // 도달할 수 없어 축제가 영영 안 열리므로, MAX_TURN을 넘는 값은 암묵적으로 MAX_TURN
    // 그 자체로 취급한다 — 마지막 턴에라도 축제가 열리게 하는 것이다.
    // (턴 상한은 평소 MAX_TURN, 목표점수 달성하기는 그 판의 maxTurn — maxTurnOf)
    const effectiveFestivalTurn = Math.min(state.settings.festivalTurn, maxTurnOf(state));
    if (!state.festival && state.turn >= effectiveFestivalTurn) {
      state.festival = true;
      events.push({ type: 'festival' });
    }
  }

  // 도토리 축제 랜덤 뽑기 — 실용신양과 완전히 동일하게, 즉시 뽑지 않고 다음으로 플레이할
  // 팀(nextTeam)의 pendingFestivalDraws에 예약해둔다. 실제 뽑기는 그 팀이 다음 장소를 클릭할 때
  // (server/engine/drawCard.ts) 실행된다. 축제 시작 이후로는 A/B 어느 팀 차례든 매 턴 계속
  // 예약된다 — "라운드당 한 번"이 아니라 "누구든 자기 턴이 오면 무조건" 받는 보너스다.
  if (state.festival) {
    const drawCount = festivalDrawInfoAt(state.turn, state.settings, maxTurnOf(state)).count;
    if (drawCount > 0) {
      state.teams[nextTeam].pendingFestivalDraws += drawCount;
    }
  }

  // 종료 판정 — 턴 상한 초과 시 체력 비교. 개인전은 승패가 아니라 남은 사람들의 순위를 정한다.
  if (state.turn > maxTurnOf(state)) {
    if (state.mode === 'individual') return [...events, ...rankByHpAndEnd(state)];
    // 목표점수 달성하기 — 마지막 턴이 끝난 순간의 점수가 목표 이상이면 그 편, 아니면 상대가 이긴다(체력 비교가 아니다).
    if (state.scoreRace) {
      const race = state.scoreRace;
      const reached = (state.teams[race.side]?.hp ?? 0) >= race.target;
      const winner = reached ? race.side : (opponentsOf(state, race.side)[0] ?? 'draw');
      return [...events, ...endGame(state, winner, 'target')];
    }
    return [...events, ...endGame(state, determineWinnerByHp(state), 'turnLimit')];
  }

  // 방금 플레이한 팀의 playerIndex를 다음 번을 위해 증가 (N:N 로테이션)
  const prevTeamState = state.teams[currentTeam];
  prevTeamState.playerIndex =
    (prevTeamState.playerIndex + 1) % prevTeamState.members.length;

  // 팀 교대 후 다음 팀의 현재 playerIndex를 activePlayerIndex에 반영
  state.activeTeam = nextTeam;
  state.activePlayerIndex = state.teams[nextTeam].playerIndex;

  return events;
}

/**
 * 카드 강화 — 차례를 마친 편의 출혈(상대 특허랑이 Lv.9+)과 지속 회복(내 상표토끼 Lv.9+)을 한 번씩 적용하고 남은 턴을 하나 줄인다.
 * **출혈이 먼저다**(요청 원문 "출혈 > 회복 순") — 출혈로 체력이 0이 되면 회복은 들지 않고 그대로 진다(advanceTurn의 judgeHp).
 * 양은 걸 때 정해 둔 한 턴의 양 그대로다(배율 무관).
 */
function tickEnhanceStatus(state: GameState, side: SideId): GameEvent[] {
  const enh = state.enhance!;
  const team = state.teams[side];
  const events: GameEvent[] = [];
  const hpAfter = () => Object.fromEntries(Object.keys(state.teams).map(s => [s, state.teams[s].hp]));

  const bleed = enh.bleed[side];
  if (bleed && bleed.turns > 0) {
    const amount = Math.min(bleed.amount, Math.max(0, team.hp));
    team.hp -= amount;
    bleed.turns -= 1;
    if (bleed.turns === 0) bleed.amount = 0;
    events.push({ type: 'enhanceTick', team: side, kind: 'bleed', amount, turnsLeft: bleed.turns, hpAfter: hpAfter(), status: cloneEnhanceStatus(enh) });
    if (team.hp <= LOSE_HP) return events;
  }

  const regen = enh.regen[side];
  if (regen && regen.turns > 0) {
    team.hp += regen.amount;
    regen.turns -= 1;
    const amount = regen.amount;
    if (regen.turns === 0) regen.amount = 0;
    events.push({ type: 'enhanceTick', team: side, kind: 'regen', amount, turnsLeft: regen.turns, hpAfter: hpAfter(), status: cloneEnhanceStatus(enh) });
  }
  return events;
}

/** 한 편의 시작 상태 — 팀전의 팀과 개인전의 한 사람이 같은 모양이다. */
function makeTeamState(members: string[], hp: number): TeamState {
  return {
    members,
    exp: { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 },
    hp,
    pendingMultiplier: 1,
    pendingExtraDraws: 0,
    pendingFestivalDraws: 0,
    playerIndex: 0,
    skillStats: {
      sheep: { count: 0, totalLevel: 0, totalHpGained: 0, totalExtraDraws: 0 },
      rabbit: { count: 0, totalLevel: 0, totalHpGained: 0, totalExtraDraws: 0 },
      mermaid: { count: 0, totalLevel: 0, totalHpGained: 0, totalExtraDraws: 0 },
      tiger: { count: 0, totalLevel: 0, totalHpGained: 0, totalExtraDraws: 0 },
    },
  };
}

/** 새 게임 상태 초기화 — settings를 생략하면 기본 규칙(shared/constants.ts DEFAULT_*)으로 시작한다. */
export function initGame(
  teamAMembers: string[],
  teamBMembers: string[],
  rng: RNG = Math.random,
  settings?: Partial<GameSettings>,
  /** 입력 범위 — 카드 강화 판은 목표 점수 상한이 2500인 범위를 넘긴다(initEnhanceGame) */
  limits?: SettingsLimits,
): GameState {
  const resolvedSettings = clampSettings(settings, limits);

  // settings.firstTeam이 'random'이면 여기서 딱 한 번 추첨해 확정한다 — 이후로는
  // state.startingTeam이 그 결과를 그대로 담고 있으므로, 다시 추첨하거나 매번
  // 다르게 계산될 일이 없다.
  const startingTeam: Team =
    resolvedSettings.firstTeam === 'random'
      ? (rng() < 0.5 ? 'A' : 'B')
      : resolvedSettings.firstTeam;
  const startingTeamReason: 'setting' | 'random' =
    resolvedSettings.firstTeam === 'random' ? 'random' : 'setting';

  const makeTeam = (members: string[]) => makeTeamState(members, resolvedSettings.targetScore);

  // 선 플레이어의 불합리를 없애기 위한 시작 공유 카드 — 서로 다른 동물 두 장이 중앙에
  // 깔린 채로 게임이 시작된다(engine/places.ts의 dealOpeningSharedCards 참고).
  const stacks = initStacks();
  for (const card of dealOpeningSharedCards(rng)) {
    stacks[card.animal].push(card);
  }

  return {
    phase: 'playing',
    turn: 1,
    activeTeam: startingTeam,
    activePlayerIndex: 0,
    stacks,
    lastPlace: null,
    festival: false,
    pendingChoice: null,
    teams: {
      A: makeTeam(teamAMembers),
      B: makeTeam(teamBMembers),
    },
    winner: null,
    settings: resolvedSettings,
    startingTeam,
    startingTeamReason,
    // 팀전은 개인전 일반화 필드가 모두 고정값이다 — 차례는 [선, 후] 둘뿐, 기술은 한 차례에 1장.
    mode: 'team',
    turnOrder: startingTeam === 'A' ? ['A', 'B'] : ['B', 'A'],
    skillsPerTurn: 1,
    skillsUsedThisTurn: 0,
    ranks: {},
  };
}

/**
 * 개인전 시작 — 한 사람이 한 편이다. 편 id는 호출하는 쪽(Room)이 대기실 순서대로 'p1'…'pN'을
 * 붙여 넘기고, 차례 순서는 여기서 rng로 한 번 섞어 정한다(판 도중에는 바뀌지 않는다).
 *
 * - settings.firstTeam은 쓰지 않는다 — 선은 섞인 순서의 맨 앞이다(startingTeamReason은 'random').
 * - skillsPerTurn은 **시작 인원** 기준으로 한 번 정한다(5명 이상이면 2장). 탈락으로 인원이 줄어도
 *   바뀌지 않는다 — 판 도중에 규칙이 바뀌면 안 된다.
 * - 시작 공유 카드는 팀전과 똑같이 깐다.
 */
export function initIndividualGame(
  players: Array<{ side: SideId; nickname: string; color: PlayerColorId }>,
  rng: RNG = Math.random,
  settings?: Partial<GameSettings>,
  /** 개인전 '강화' 방(2026-10-30) — 혼자 놀기 카드 강화의 규칙을 그대로 얹는다(attachEnhance). 목표 점수 상한도 그 판의 것(2500)이다. */
  enhance = false,
): GameState {
  const resolvedSettings = clampSettings(settings, enhance ? ENHANCE_SETTINGS_LIMITS : undefined);

  const turnOrder = players.map(p => p.side);
  for (let i = turnOrder.length - 1; i > 0; i--) { // Fisher–Yates
    const j = Math.floor(rng() * (i + 1));
    [turnOrder[i], turnOrder[j]] = [turnOrder[j], turnOrder[i]];
  }

  const teams: Record<SideId, TeamState> = {};
  for (const p of players) {
    teams[p.side] = { ...makeTeamState([p.nickname], resolvedSettings.targetScore), color: p.color };
  }

  const stacks = initStacks();
  for (const card of dealOpeningSharedCards(rng)) {
    stacks[card.animal].push(card);
  }

  const startingTeam = turnOrder[0];
  const state: GameState = {
    phase: 'playing',
    turn: 1,
    activeTeam: startingTeam,
    activePlayerIndex: 0,
    stacks,
    lastPlace: null,
    festival: false,
    pendingChoice: null,
    teams,
    winner: null,
    settings: resolvedSettings,
    startingTeam,
    startingTeamReason: 'random',
    mode: 'individual',
    turnOrder,
    skillsPerTurn: players.length >= INDIVIDUAL_TWO_SKILLS_FROM ? 2 : 1,
    skillsUsedThisTurn: 0,
    ranks: {},
  };
  if (enhance) {
    attachEnhance(state);
    state.skillsPerTurn = enhanceSkillsOf(state);
  }
  return state;
}

/**
 * 혼자 놀기 '카드 강화' 시작 — 혼자 놀기와 같은 팀전 1:1(A = 사람, B = 컴퓨터)에 강화 규칙(shared/enhance.ts)을 얹는다.
 *
 * - 선은 initGame 그대로 settings.firstTeam을 따른다.
 * - 시작 공유 카드도 숫자 1로 바꾼다(이 판의 카드는 모두 1).
 * - 쿨타임은 모든 카드 0(처음부터 모두 쓸 수 있다). 턴 제한은 없다(maxTurnOf가 state.enhance를 보고 Infinity).
 */
export function initEnhanceGame(
  teamAMembers: string[],
  teamBMembers: string[],
  rng: RNG = Math.random,
  settings?: Partial<GameSettings>,
): GameState {
  const state = initGame(teamAMembers, teamBMembers, rng, settings, ENHANCE_SETTINGS_LIMITS);
  attachEnhance(state);
  return state;
}

/**
 * 강화 규칙을 이미 만든 판에 얹는다 — 혼자 놀기(팀전 1:1)와 개인전 강화 방이 함께 쓴다.
 * 시작 공유 카드를 숫자 1로 바꾸고(이 판의 카드는 모두 1), 편마다 쿨타임 0 · 나눗셈 1 · 지속 효과 없음으로 시작한다.
 */
function attachEnhance(state: GameState): void {
  for (const animal of Object.keys(state.stacks) as Array<keyof GameState['stacks']>) {
    for (const card of state.stacks[animal]) card.num = 1;
  }
  const sides = Object.keys(state.teams);
  const each = <T>(make: () => T): Record<SideId, T> => Object.fromEntries(sides.map(s => [s, make()]));
  state.enhance = {
    cooldowns: each(() => ({ sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 })),
    divisors: each(() => 1),
    divisorTurns: each(() => 0),
    bleed: each(() => ({ turns: 0, amount: 0 })),
    regen: each(() => ({ turns: 0, amount: 0 })),
  };
}
