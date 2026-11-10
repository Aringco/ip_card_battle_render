import { ENHANCE_SLAM_FROM, PLACE_DRAW_STEP_MS, enhanceSlamLandMs, enhanceSlamMs, finisherLeadMs, finisherTargets, rollDrawStep } from 'shared';
import type { Animal, GameEvent } from 'shared';

// ─── 연출 유예(settle grace) ──────────────────────────────────────────────
// 서버는 액션을 처리하는 즉시 다음 턴 타이머를 시작하지만, 클라이언트는 그 액션의
// 연출(슬롯 → 카드 등장 → 페어 정산 → 행동 효과)이 다 끝나야 비로소 조작을 받는다.
// 그 연출 시간이 제한시간에서 그대로 깎이면 "방에서 설정한 시간보다 적은 숫자에서
// 카운트다운이 시작"되고, 연출이 길면 화면에 타이머가 뜨기도 전에 시간이 다 가버린다.
// 그래서 이번 액션의 연출 길이를 추정해 그만큼을 제한시간 위에 얹는다.
//
// 아래 값들은 client/lib/drawTiming.ts와 client/hooks/useAnimationQueue.ts의 실제
// 연출 타이밍에서 가져온 근사치다. 정확히 일치할 필요는 없고(연출이 조금 바뀌어도
// 게임 규칙은 그대로다), 모자라기보다 조금 넉넉한 쪽이 안전하다.
const SETTLE_DRAW_MS = 1430;        // SLOT_TOTAL_DUR(1350) + EMPTY_GAP(80) — 마지막 한 장
const SETTLE_ROLL_STEP_MS = 300;    // SHEEP_DRAW_STEP — 연쇄 뽑기는 0.3초 간격으로 겹쳐 재생된다
const SETTLE_ROLL_ENTER_MS = 500;   // WOOL_BALL_DUR — 예약 뽑기 롤에 진입하는 울 볼/도토리
const SETTLE_COLLECT_MS = 1080;     // SHAKE_CHECK_DUR(550) + COLLECT_FLING_DUR(450) + 80
const SETTLE_SKILL_MS = 1500;       // 행동 효과 연출(가장 긴 특허랑이 기준)
const SETTLE_FESTIVAL_MS = 700;     // 축제 시작 연출
// 아래 근사식의 상한(대규모 연쇄 뽑기 대비) — 근사식은 연쇄 뽑기를 장당 0.3초로 세어 크게 부풀기 때문이다.
const SETTLE_ESTIMATE_MAX_MS = 15000;
// 연출 유예 전체의 상한 — 화면 타임라인을 그대로 따라 센 값(settleTimelineMs)에 거는 안전선. 카드 강화 판의 최악(예약 뽑기 두 롤 ·
// 짝 넷 · 짝 효과 넷)도 40초 남짓이다(롤 하나는 rollDrawStep이 5초 안으로 묶는다).
const SETTLE_GRACE_MAX_MS = 60000;

/**
 * 방금 브로드캐스트한 이벤트들의 클라이언트 연출이 끝나기까지 걸리는 시간(ms) 추정치.
 * 예전 근사식(settleEstimateMs, 15초 상한)과 화면 타임라인 그대로의 계산(settleTimelineMs) 중 **긴 쪽**이다 — 일반 판은 거의 언제나
 * 근사식이 더 넉넉해 예전과 같고, 카드 강화의 큰 연쇄 뽑기에서만 타임라인이 이긴다.
 * ⚠️ 이 값이 연출보다 짧으면 컴퓨터의 다음 수가 연출 도중에 도착해 화면이 진행 중이던 연출을 걷어낸다 — 뽑기 도중에 판이
 *    "초기화"되는 것처럼 보인다(2026-10-29, 예약 100장에서 예전의 15초 상한에 걸렸다).
 */
export function settleGraceMs(events: GameEvent[], enhance = false): number {
  return Math.min(SETTLE_GRACE_MAX_MS, Math.max(settleEstimateMs(events), settleTimelineMs(events, enhance)));
}

// 화면(useAnimationQueue)의 연출 시각 — 그쪽 상수와 같은 값이다(SLOT_TOTAL_DUR · WOOL_BALL_DUR · EMPTY_GAP · SHAKE_CHECK_DUR ·
// COLLECT_FLING_DUR · EFFECT_DUR · TIGER_RECOIL_DUR + TIGER_HIT_DUR · RANK_BANNER_DUR). 뽑기 간격은 shared(rollDrawStep · PLACE_DRAW_STEP_MS)를 함께 쓴다.
const TL_SLOT_MS = 1350;
const TL_ROLL_ENTER_MS = 500;
const TL_GAP_MS = 80;
const TL_COLLECT_MS = 550 + 450 + 80;
const TL_COLLECT_GROUP_GAP_MS = 150;
const TL_COLLECT_ORDER: Animal[] = ['sheep', 'rabbit', 'tiger', 'mermaid'];
const TL_EFFECT_MS = 1200;
const TL_TIGER_MS = 500 + 900 + 80;
const TL_RANK_MS = 1700;
const TL_FESTIVAL_MS = 900;
const TL_ACORN_START_MS = 2600; // 첫 도토리 고르기 앞의 "도토리 축제 시작!" 안내(useAnimationQueue의 FESTIVAL_START_INFO_DUR)
const TL_TICK_MS = 1000; // 카드 강화의 출혈·지속 회복 한 번(useAnimationQueue의 TICK_DUR)
// 도토리 카드 — 고르기가 닫힌 뒤 마지막으로 고른 사람의 "카드가 자리에 들어오는" 연출(화면 AcornShelf의 ACORN_GET_MS)
const TL_ACORN_GET_MS = 4400; // 화면 AcornLayer — 얻기 연출(ACORN_GET_MS 4초) 끝무렵(ACORN_FLY_AT 3.5초)에 빛이 배지로 날아가 앉는다(ACORN_FLY_MS 0.8초) + 여운
// 싹쓸이 — "싹쓸이!" 알림 뒤 새 카드 SWEEP_REFILL_COUNT장이 차례로 깔린다(useAnimationQueue의 SWEEP_BANNER_DUR + 장 간격 × 장수 + 여운)
const TL_SWEEP_MS = 1300 + 3 * 260 + 300;

/** useAnimationQueue의 Pass 1(뽑기) → 1.5(정산) → 싹쓸이 → 1.6(효과) → 순위 → 축제 스케줄을 그대로 따라 센 연출 길이 */
function settleTimelineMs(events: GameEvent[], enhance: boolean): number {
  let cursor = 0;
  let lastDrawEnd = 0;
  let rollRemaining = 0;
  let rollTotal = 0;
  let placeRemaining = 0;
  for (const ev of events) {
    if (ev.type === 'bonusDraws' || ev.type === 'festivalDraws') {
      rollRemaining = ev.count;
      rollTotal = ev.count;
    } else if (ev.type === 'placeDraws') {
      placeRemaining = ev.count;
    } else if (ev.type === 'draw') {
      const inRoll = rollRemaining > 0;
      if (inRoll) rollRemaining--;
      const inPlace = !inRoll && placeRemaining > 0;
      if (inPlace) placeRemaining--;
      const triggerAt = cursor;
      let drawEnd = (inRoll ? triggerAt + TL_ROLL_ENTER_MS : triggerAt) + TL_SLOT_MS;
      // 카드 강화의 배수 카드(×5~) — 카드가 나올 자리에서 쿵 떨어지는 연출이 붙고, 다음 장은 그 카드가 닿은 뒤에 나온다(화면과 같은 식)
      const slam = enhance && ev.card.num >= ENHANCE_SLAM_FROM;
      if (slam) drawEnd = drawEnd - 120 + enhanceSlamMs(ev.card.num);
      lastDrawEnd = Math.max(lastDrawEnd, drawEnd);
      const step = inRoll ? rollDrawStep(rollTotal) : inPlace && placeRemaining > 0 ? PLACE_DRAW_STEP_MS : null;
      cursor = step === null
        ? drawEnd + TL_GAP_MS
        : triggerAt + (slam ? Math.max(step, enhanceSlamLandMs(ev.card.num)) : step);
    }
  }
  cursor = Math.max(cursor, lastDrawEnd + TL_GAP_MS);

  let groups = 0;
  for (const animal of TL_COLLECT_ORDER) {
    const n = events.filter(e => e.type === 'collect' && e.animal === animal).length;
    if (n === 0) continue;
    if (groups++ > 0) cursor += TL_COLLECT_GROUP_GAP_MS;
    cursor += n * TL_COLLECT_MS;
  }
  // 싹쓸이는 정산 바로 뒤, 짝 효과보다 먼저 재생된다
  if (events.some(e => e.type === 'sweep')) cursor += TL_SWEEP_MS;
  for (const ev of events) {
    if (ev.type === 'skillApplied' && ev.level > 0) cursor += ev.animal === 'tiger' ? TL_TIGER_MS : TL_EFFECT_MS;
    else if (ev.type === 'ranked') cursor += TL_RANK_MS;
  }
  cursor += events.filter(e => e.type === 'enhanceTick').length * TL_TICK_MS;
  // 마무리 연출(승패를 정한 체력 변화 앞 — shared finisherTargets) 동안은 판이 흐르지 않는다. 500 = 화면 TIGER_RECOIL_DUR
  for (const i of finisherTargets(events).keys()) cursor += finisherLeadMs(events[i], 500);
  if (events.some(e => e.type === 'acornOffer' && e.no === 1)) cursor += TL_ACORN_START_MS;
  else if (events.some(e => e.type === 'festival')) cursor += TL_FESTIVAL_MS;
  if (events.some(e => e.type === 'acornPicked' && e.closed)) cursor += TL_ACORN_GET_MS;
  return cursor;
}

/** 예전 근사식 — 일반 판의 연출 유예는 이 값으로 정해져 왔다(15초 상한). */
function settleEstimateMs(events: GameEvent[]): number {
  let draws = 0;
  let rolls = 0;
  let collects = 0;
  let skills = 0;
  let festivals = 0;

  for (const ev of events) {
    if (ev.type === 'draw') draws++;
    else if (ev.type === 'bonusDraws' || ev.type === 'festivalDraws') rolls++;
    else if (ev.type === 'collect') collects++;
    else if (ev.type === 'skillApplied' || ev.type === 'enhanceTick') skills++;
    else if (ev.type === 'festival') festivals++;
    else if (ev.type === 'sweep') skills += 2; // 알림 + 새 카드 세 장 — 기술 연출 두 번 남짓
  }

  const ms =
    (draws > 0 ? SETTLE_DRAW_MS + (draws - 1) * SETTLE_ROLL_STEP_MS : 0) +
    rolls * SETTLE_ROLL_ENTER_MS +
    collects * SETTLE_COLLECT_MS +
    skills * SETTLE_SKILL_MS +
    festivals * SETTLE_FESTIVAL_MS;

  return Math.min(ms, SETTLE_ESTIMATE_MAX_MS);
}

// 연출 길이 추정이 조금 모자라도 서버 타임아웃이 클라이언트보다 먼저 터지지 않도록 하는
// 여유분. 유예 구간은 화면에 드러나지 않으므로(게이지는 turnTotalMs 기준으로 가득 찬
// 상태를 유지한다) 이 값을 늘려도 표시되는 숫자는 변하지 않는다.
export const SETTLE_GRACE_MARGIN_MS = 600;
