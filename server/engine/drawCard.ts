import { ANIMALS, SHEEP_SAFETY_CAP, enhancePlaceDrawCount } from 'shared';
import type { GameEvent, GameState, Place } from 'shared';
import { drawCardAt, randomPlace } from './places';
import type { RNG } from './places';
import { applyEnhancePairEffect } from './skills';

/**
 * 장소 클릭 처리.
 * 1) 실용신양 행동으로 예약해둔 추가 뽑기가 있으면 먼저 전부 소모한다.
 * 2) 도토리 축제로 예약해둔 추가 뽑기가 있으면 이어서 전부 소모한다.
 * 3) 클릭한 장소에서 카드 1장을 뽑는다.
 * 4) 이번 액션에서 뽑은 카드가 전부 모인 뒤, 동물별로 미획득 스택이 짝수 개면 한꺼번에 수집한다
 *    (경험치만 오른다 — 체력은 오직 행동으로만 움직인다).
 */
export function drawCard(
  state: GameState,
  place: Place,
  rng: RNG = Math.random,
): GameEvent[] {
  const events: GameEvent[] = [];

  events.push(...consumePendingExtraDraws(state, rng));
  events.push(...consumePendingFestivalDraws(state, rng));
  if (state.enhance) {
    // 카드 강화 — 누른 장소에서 여러 장(1~3 / 3~5, 무작위)이 나온다. 화면이 묶어서 겹쳐 띄우도록 장수를 먼저 알린다.
    const count = enhancePlaceDrawCount(place, rng);
    events.push({ type: 'placeDraws', place, count });
    for (let i = 0; i < count; i++) events.push(..._drawOne(state, place, rng));
  } else {
    events.push(..._drawOne(state, place, rng));
  }
  events.push(...settleStacks(state, rng));

  return events;
}

function consumePendingExtraDraws(state: GameState, rng: RNG): GameEvent[] {
  const team = state.activeTeam;
  const teamState = state.teams[team];
  const count = Math.min(teamState.pendingExtraDraws, SHEEP_SAFETY_CAP);
  teamState.pendingExtraDraws = 0;
  if (count <= 0) return [];

  const events: GameEvent[] = [{ type: 'bonusDraws', team, count }];
  for (let i = 0; i < count; i++) {
    events.push(..._drawOne(state, randomPlace(rng), rng));
  }
  return events;
}

/**
 * 도토리 축제로 예약된 추가 뽑기를 소모한다 — 실용신양(consumePendingExtraDraws)과
 * 완전히 동일한 방식(무작위 장소에서 카드 뽑기)이며, 예약 시점(turnManager.advanceTurn)이
 * 아니라 그 팀이 실제로 다음 장소를 클릭하는 지금 이 시점에 실행된다.
 */
function consumePendingFestivalDraws(state: GameState, rng: RNG): GameEvent[] {
  const team = state.activeTeam;
  const teamState = state.teams[team];
  const count = Math.min(teamState.pendingFestivalDraws, SHEEP_SAFETY_CAP);
  teamState.pendingFestivalDraws = 0;
  if (count <= 0) return [];

  const events: GameEvent[] = [{ type: 'festivalDraws', team, count }];
  for (let i = 0; i < count; i++) {
    events.push(..._drawOne(state, randomPlace(rng), rng));
  }
  return events;
}

function _drawOne(state: GameState, place: Place, rng: RNG): GameEvent[] {
  const card = drawCardAt(place, rng);
  // 카드 강화 판은 모든 카드가 1이다 — 짝이 맞으면 모인 장수만큼 경험치가 오른다(shared/enhance.ts).
  if (state.enhance) card.num = 1;
  state.stacks[card.animal].push(card);
  return [{ type: 'draw', place, card }];
}

/**
 * 미획득 스택이 짝수인 동물을 한꺼번에 정산한다(경험치만 오른다).
 *
 * ⚠️ `export`인 이유는 **시연 모드**(`server/demo/`)가 이 함수를 따로 부르기 때문이다.
 *    시연은 "짝이 맞았습니다" 안내를 띄우고 **관람객이 [계속]을 누른 뒤에** 정산해야
 *    하는데, `drawCard`는 뽑기와 정산을 한 번에 끝내 그 사이에 끼어들 틈이 없다.
 *    정산 규칙이 두 벌이 되면 곧 어긋나므로, 복사하지 말고 이 함수를 그대로 쓴다.
 */
export function settleStacks(state: GameState, rng: RNG = Math.random): GameEvent[] {
  const events: GameEvent[] = [];
  const team = state.activeTeam;

  for (const animal of ANIMALS) {
    const uncollected = state.stacks[animal].filter(c => c.collectedBy === null);
    if (uncollected.length === 0 || uncollected.length % 2 !== 0) continue;

    const exp = uncollected.reduce((sum, c) => sum + c.num, 0);

    uncollected.forEach(c => { c.collectedBy = team; });
    state.teams[team].exp[animal] += exp;

    events.push({
      type: 'collect',
      animal,
      team,
      exp,
      cardIds: uncollected.map(c => c.id),
    });
    // 카드 강화 — 짝이 맞은 그 카드의 기술이 곧바로 발동한다(방금 더한 경험치까지 반영한 레벨). 시연은 강화 판이 아니라 닿지 않는다.
    if (state.enhance) events.push(applyEnhancePairEffect(state, team, animal, rng));
  }

  return events;
}
