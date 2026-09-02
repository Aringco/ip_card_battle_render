import { ANIMALS, SHEEP_SAFETY_CAP } from 'shared';
import type { GameEvent, GameState, Place } from 'shared';
import { drawCardAt, randomPlace } from './places';
import type { RNG } from './places';

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
  events.push(..._drawOne(state, place, rng));
  events.push(...settleStacks(state));

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
  state.stacks[card.animal].push(card);
  return [{ type: 'draw', place, card }];
}

function settleStacks(state: GameState): GameEvent[] {
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
  }

  return events;
}
