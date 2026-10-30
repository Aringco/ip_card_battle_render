import { ANIMALS, ENHANCE_RESERVED_DRAW_CAP, SHEEP_SAFETY_CAP, SWEEP_BONUS_EXP, SWEEP_REFILL_COUNT, enhancePlaceDrawCount } from 'shared';
import type { Animal, GameEvent, GameState, Place } from 'shared';
import { dealOpeningSharedCards, drawCardAt, randomPlace } from './places';
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
  const settled = settleStacks(state, rng);
  events.push(...settled);
  events.push(...sweepIfCleared(state, settled, rng));

  return events;
}

/**
 * 싹쓸이 — 이번 정산으로 짝을 가져가 필드에 미획득 카드가 한 장도 남지 않았으면, 네 동물 각각에 보너스 경험치
 * (SWEEP_BONUS_EXP 범위, 무작위)를 더하고 빈 필드에 서로 다른 동물 카드 SWEEP_REFILL_COUNT장을 새로 깐다(2026-10-30 요청).
 * 새 카드는 동물이 모두 달라 그 자리에서 짝이 되지 않는다(시작 공유 카드와 같은 함수 — 카드 강화 판은 숫자 1).
 *
 * ⚠️ settleStacks 안이 아니라 여기서 한다 — 시연(server/demo/)은 settleStacks만 따로 불러 대본대로 정산하므로,
 *    거기에 넣으면 대본에 없는 보너스·카드가 끼어든다. 시연은 drawCard를 부르지 않는다.
 */
function sweepIfCleared(state: GameState, settled: GameEvent[], rng: RNG): GameEvent[] {
  if (!settled.some(e => e.type === 'collect')) return [];
  if (ANIMALS.some(a => state.stacks[a].some(c => c.collectedBy === null))) return [];

  const team = state.activeTeam;
  const bonus = {} as Record<Animal, number>;
  for (const animal of ANIMALS) {
    const [min, max] = SWEEP_BONUS_EXP[animal];
    bonus[animal] = min + Math.floor(rng() * (max - min + 1));
    state.teams[team].exp[animal] += bonus[animal];
  }

  const cards = dealOpeningSharedCards(rng, SWEEP_REFILL_COUNT);
  for (const card of cards) {
    if (state.enhance) card.num = 1;
    state.stacks[card.animal].push(card);
  }
  return [{ type: 'sweep', team, bonus, cards: cards.map(c => ({ ...c })) }];
}

function consumePendingExtraDraws(state: GameState, rng: RNG): GameEvent[] {
  const team = state.activeTeam;
  const teamState = state.teams[team];
  const count = reservedDrawCount(state, teamState.pendingExtraDraws);
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
  const count = reservedDrawCount(state, teamState.pendingFestivalDraws);
  teamState.pendingFestivalDraws = 0;
  if (count <= 0) return [];

  const events: GameEvent[] = [{ type: 'festivalDraws', team, count }];
  for (let i = 0; i < count; i++) {
    events.push(..._drawOne(state, randomPlace(rng), rng));
  }
  return events;
}

/**
 * 예약 뽑기(실용신양·도토리 축제) 한 번에 실제로 뽑는 수. 일반 판은 SHEEP_SAFETY_CAP(40)에서 자르고 나머지는 버린다.
 * 카드 강화 판은 ENHANCE_RESERVED_DRAW_CAP(512)에서 자른다 — 2026-10-29에 "디자인어 ×5 뒤 실용신양 100회가 40회만 뽑혔다"는 제보로 상한을
 * 걷었다가, 4차 표(2026-10-30)의 실용신양 Lv.Max 256장 × 디자인어 ×100이 수만 장이 되어 다시 걸었다(Lv.Max 기본 값의 두 배).
 * 화면은 많을수록 간격을 좁혀 재생한다(shared rollDrawStep — 512장이면 6초 남짓).
 */
function reservedDrawCount(state: GameState, pending: number): number {
  return Math.min(pending, state.enhance ? ENHANCE_RESERVED_DRAW_CAP : SHEEP_SAFETY_CAP);
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
