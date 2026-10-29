import { needsTarget, opponentsOf } from 'shared';
import type { Animal, GameEvent, GameState, Place, SideId } from 'shared';
import { drawCard } from './drawCard';
import { advanceTurn, checkKnockout, finishTurn, initGame, judgeHp } from './turnManager';
import { forfeitRank, resolveRanks } from './ranking';
import { applySkillChoice, applyPass, eligibleAnimals, levelOf, randomEligibleSkill } from './skills';
import { randomPlace } from './places';
import type { RNG } from './places';

export { initGame, initIndividualGame, initEnhanceGame } from './turnManager';

/**
 * 장소 클릭 처리 — 엔진의 진입점 ①.
 * 뽑기+정산까지 끝난 뒤에는 고를 수 있는 스킬이 있든 없든 항상 그 팀의 스킬 선택 대기
 * 상태로 들어간다 — 쓸 수 있는 스킬이 없더라도 반드시 "아무것도 하지 않음"을 직접 눌러야
 * 턴이 넘어간다(자동 패스 없음). 30초 타이머가 끝나면 processTimeout이 대신 패스한다.
 *
 * 직전에(어느 팀이든) 실제로 클릭했던 장소는 이번엔 고를 수 없다(state.lastPlace) — 한
 * 장소만 계속 노리는 게 너무 유리해서 넣은 제약이다. 정상적인 클라이언트라면 그 장소를
 * 아예 클릭 못 하게 막혀 있지만(금지 표시), 방어적으로 서버에서도 무시한다.
 */
export function processPlayerAction(
  state: GameState,
  place: Place,
  rng: RNG = Math.random,
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== 'playing' || state.pendingChoice !== null) return { state, events: [] };
  if (place === state.lastPlace) return { state, events: [] };

  const events: GameEvent[] = [];
  events.push(...drawCard(state, place, rng));
  state.lastPlace = place;
  // 카드 강화 — 짝 효과(체력 변화)가 뽑기 안에서 일어나므로 여기서 승패를 본다. 끝났으면 기술 단계로 가지 않는다.
  // 개인전 강화 방은 순위 판정(judgeHp → resolveRanks)이고, 짝 효과로 내 순위가 정해졌으면(상표토끼로 승리선) 기술 없이 차례를 넘긴다.
  if (state.enhance) events.push(...judgeHp(state));

  if (state.phase === 'playing') {
    if (state.teams[state.activeTeam].finish) events.push(...advanceTurn(state));
    else state.pendingChoice = state.activeTeam;
  }

  return { state, events };
}

/**
 * 스킬 선택 처리 — 엔진의 진입점 ②.
 * 선택이 끝나야 비로소 턴이 다음 팀으로 넘어간다. 레벨이 0인 동물을 고르는 요청은 무시한다
 * (정상적인 클라이언트라면 UI에서 이미 막혀 있다).
 */
export function processSkillChoice(
  state: GameState,
  animal: Animal,
  // 특허랑이의 대상 — 개인전에서만 쓴다(팀전은 상대가 한 팀뿐이라 무시한다).
  target?: SideId,
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== 'playing' || state.pendingChoice === null) return { state, events: [] };
  // 레벨이 0이거나 한 우물만 파기에서 잠긴 카드면 무시한다 — 둘 다 eligibleAnimals 한 곳이 판정한다.
  if (!eligibleAnimals(state, state.pendingChoice).includes(animal)) return { state, events: [] };
  if (state.mode === 'individual') return processIndividualSkill(state, animal, target);

  if (state.enhance) return processEnhanceSkill(state, animal);

  const team = state.pendingChoice;
  const events: GameEvent[] = [];
  events.push(applySkillChoice(state, team, animal));
  state.pendingChoice = null;
  events.push(...finishTurn(state));

  return { state, events };
}

/**
 * 카드 강화 판의 기술 선택 — 한 차례에 기술을 skillsPerTurn장까지(15턴마다 하나씩 늘어 최대 3장 — shared/enhance.ts).
 * 개인전(processIndividualSkill)과 같은 모양이다: 기술마다 승패를 보고, 남은 장수가 있고 쓸 카드가 남았으면
 * **pendingChoice를 세워 둔 채** 기다린다. 쓴 카드는 쿨타임이 서므로 같은 카드를 한 차례에 두 번 쓸 수 없다.
 */
function processEnhanceSkill(state: GameState, animal: Animal): { state: GameState; events: GameEvent[] } {
  const team = state.pendingChoice!;
  const events: GameEvent[] = [applySkillChoice(state, team, animal)];
  events.push(...checkKnockout(state));
  if (state.phase !== 'playing') return { state, events };

  state.skillsUsedThisTurn += 1;
  if (state.skillsUsedThisTurn >= state.skillsPerTurn || eligibleAnimals(state, team).length === 0) {
    state.pendingChoice = null;
    events.push(...advanceTurn(state));
  }
  return { state, events };
}

/**
 * 개인전의 기술 선택 — 한 차례에 기술을 skillsPerTurn장까지 쓸 수 있고, 기술 하나마다 순위를 판정한다.
 * (INDIVIDUAL_MODE_ROADMAP.md §2-2~2-4, 주의 3~5)
 *
 * ⚠️ 판정은 차례가 끝날 때가 아니라 **기술마다** 한다 — 2장 규칙에서 첫 특허랑이로 체력이 0이 된
 *    사람이 두 번째 기술의 대상 목록에 남아 있으면 안 된다.
 * ⚠️ 두 번째 기술을 기다릴 때는 pendingChoice를 **그대로 세워 둔다**(비우면 화면의 행동 선택 칸이
 *    살아나지 않는다). 차례가 끝날 때는 finishTurn(= 팀전의 즉시 승패 판정)이 아니라 advanceTurn만 부른다.
 */
function processIndividualSkill(
  state: GameState,
  animal: Animal,
  target?: SideId,
): { state: GameState; events: GameEvent[] } {
  const team = state.pendingChoice!;

  // 특허랑이(강화 방은 Lv.6+ 디자인어도 — needsTarget)는 대상이 필요하다 — 순위가 정해지지 않은 다른 사람이어야 한다. 아니면 무시(이벤트 없음).
  let victim: SideId | undefined;
  if (needsTarget(state, animal, levelOf(state, team, animal))) {
    if (target === undefined || !opponentsOf(state, team).includes(target)) return { state, events: [] };
    victim = target;
  }

  const events: GameEvent[] = [applySkillChoice(state, team, animal, victim)];
  events.push(...resolveRanks(state));
  if (state.phase !== 'playing') return { state, events };

  state.skillsUsedThisTurn += 1;
  const turnOver =
    state.skillsUsedThisTurn >= state.skillsPerTurn ||
    eligibleAnimals(state, team).length === 0 ||
    state.teams[team].finish !== undefined;
  if (turnOver) {
    state.pendingChoice = null;
    events.push(...advanceTurn(state));
  }
  return { state, events };
}

/**
 * 개인전 항복·나가기 — 그 사람은 패배(꼴찌 쪽부터 순위)가 되고 판은 계속된다.
 * 지금 차례가 그 사람이었다면 다음 사람에게 넘긴다(방(Room)이 부른다 — 엔진 안에서는 쓰이지 않는다).
 */
export function processForfeit(
  state: GameState,
  side: SideId,
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== 'playing' || state.mode !== 'individual') return { state, events: [] };
  if (state.teams[side]?.finish) return { state, events: [] };

  const events = forfeitRank(state, side);
  if (state.phase === 'playing' && state.activeTeam === side) {
    state.pendingChoice = null;
    events.push(...advanceTurn(state));
  }
  return { state, events };
}

/**
 * "아무것도 하지 않음" 처리 — 엔진의 진입점 ③.
 * auto=true는 시간 초과로 서버가 대신 패스했을 때만 쓴다 — 그 경우 timeoutChoice 이벤트가
 * 이미 "시간 초과로..." 해설을 내보내므로, 여기서 또 "다음 기회를 노리기로 했습니다"를
 * 중복으로 보여주지 않기 위해서다(클라이언트는 auto인 skillPassed를 해설판에 표시하지 않는다).
 */
export function processPass(
  state: GameState,
  auto = false,
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== 'playing' || state.pendingChoice === null) return { state, events: [] };

  const team = state.pendingChoice;
  const events: GameEvent[] = [applyPass(team, auto)];
  state.pendingChoice = null;
  // 개인전은 체력이 변하지 않았으므로 승패 판정 없이 곧바로 차례를 넘긴다(판정은 기술마다 이미 했다).
  events.push(...(state.mode === 'individual' ? advanceTurn(state) : finishTurn(state)));

  return { state, events };
}

/** 제한시간 초과 — 카드 선택 대기 중이면 무작위 장소를, 스킬 선택 대기 중이면 무작위 스킬(없으면 패스)을 대신 골라준다. */
export function processTimeout(
  state: GameState,
  rng: RNG = Math.random,
): { state: GameState; events: GameEvent[] } {
  if (state.phase !== 'playing') return { state, events: [] };

  if (state.pendingChoice !== null) {
    // 개인전은 서버가 기술을 대신 고르지 않는다 — 첫 번째든 두 번째든, 대상을 고르던 중이든
    // 시간이 다 되면 그대로 차례 종료다(자동으로 기술을 쓰면 사람이 일부러 안 쓴 것과 구분이 안 된다).
    if (state.mode === 'individual') {
      const result = processPass(state, true);
      return { state: result.state, events: [{ type: 'timeoutChoice', animal: null }, ...result.events] };
    }
    const team = state.pendingChoice;
    // 카드 강화 판에서 이미 기술을 쓴 뒤라면(한 차례 2·3장) 대신 더 고르지 않고 차례만 끝낸다 — 첫 장은 지금처럼
    // 서버가 대신 고르지만, 나머지까지 고르면 자리를 비운 사람의 차례가 시간초과 몇 번에 걸쳐 기술 셋을 다 쓴다.
    const animal = state.enhance && state.skillsUsedThisTurn > 0 ? null : randomEligibleSkill(state, team, rng);
    const result = animal === null ? processPass(state, true) : processSkillChoice(state, animal);
    return { state: result.state, events: [{ type: 'timeoutChoice', animal }, ...result.events] };
  }

  return processPlayerAction(state, randomPlace(rng, state.lastPlace), rng);
}
