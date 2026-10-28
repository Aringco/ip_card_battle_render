import type { Animal, GameSettings, Place, SideId } from './types';
import { PLACE_ANIMALS } from './types';
import { THRESHOLDS } from './constants';

// ─── 카드 강화 모드 — '혼자 놀기'의 두 번째 판 ─────────────────────────────────────
// 설계 전문은 저장소 루트의 ENHANCE_MODE.md.
//
// 일반 판과 다른 점은 넷이다.
// 1. **모든 카드가 처음부터 Lv.1로 열려 있다.** 경험치는 "쓰면 깎이는 자원"이 아니라 **누적해 강화하는 값**이다 —
//    기술을 써도 경험치가 줄지 않고, 레벨은 내려가지 않는다(최대 Lv.5). 한 레벨에 필요한 경험치는 일반 판과 같다
//    (실용신양·상표토끼 10, 디자인어·특허랑이 20 — THRESHOLDS).
// 2. **카드 숫자가 모두 1이다.** 짝이 맞으면 모인 장수만큼 경험치가 오른다(화면의 카드에는 숫자가 없다).
// 3. 기술마다 **쿨타임**이 있다(쓴 뒤 그 수만큼 내 차례에 못 쓴다). 레벨이 오를수록 효과도 쿨타임도 커진다.
// 4. **턴 제한이 없다** — 목표 체력에 닿거나 상대 체력이 0이 되어야 끝난다(shared/sides.ts의 maxTurnOf가 Infinity).
// 5. **짝이 맞으면 그 카드의 기술이 그 자리에서 발동한다**(정산으로 오른 레벨 그대로 — 배율·쿨타임과 무관한 덤이다).
// 6. **장소를 누르면 여러 장이 나온다** — 동물 2종 장소(오두막·부둣가) 1~3장, 3종 장소(숲길·강가) 3~5장(ENHANCE_PLACE_DRAWS).
//
// 엔진·화면은 혼자 놀기 그대로다 — 나(A) 대 컴퓨터(B)의 팀전 1:1 판에 이 규칙을 얹은 것이다(화면은 GameLayout).
// 이 판인지는 `GameState.enhance`가 있느냐로 가른다.

/** 최고 레벨 — Lv.1 ~ Lv.10 다음의 Lv.Max(11) */
export const ENHANCE_MAX_LEVEL = 11;

/**
 * 장소를 한 번 눌렀을 때 나오는 장수(최소~최대, 무작위) — 그 장소가 다루는 동물 수로 가른다(일반 판의 숫자 범위 5~10 / 10~15와 같은 기준).
 * 각 장은 그 장소의 동물 중 무작위다. 실용신양·도토리 축제의 예약 뽑기는 지금처럼 한 번에 한 장이다(장수가 곧 "카드 +N장"이다).
 */
export const ENHANCE_PLACE_DRAWS: Record<2 | 3, readonly [number, number]> = { 2: [1, 3], 3: [3, 5] };

/** 이 장소에서 이번에 나올 장수 */
export function enhancePlaceDrawCount(place: Place, rng: () => number = Math.random): number {
  const [min, max] = ENHANCE_PLACE_DRAWS[PLACE_ANIMALS[place].length >= 3 ? 3 : 2];
  return min + Math.floor(rng() * (max - min + 1));
}


/**
 * 레벨별 기본 효과(색인 = 레벨 − 1, Lv.1 ~ Lv.10 · Lv.Max). 배율을 곱하기 전의 값이다.
 * 실용신양 = 다음 턴 추가 뽑기 수 · 상표토끼 = 회복 · 디자인어 = 배율 · 특허랑이 = 상대 체력 감소. (2026-10-28 2차 표 — Lv.Max까지 11단계)
 */
export const ENHANCE_VALUES: Record<Animal, readonly number[]> = {
  sheep: [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
  rabbit: [2, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40],
  mermaid: [2, 3, 4, 5, 5, 5, 5, 5, 5, 5, 10],
  tiger: [1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
};
/** 디자인어를 **배율이 이미 걸려 있을 때** 또 쓰면 그 배율에 더하는 양 */
export const ENHANCE_MERMAID_STACK: readonly number[] = [1, 2, 3, 4, 5, 5, 5, 5, 5, 5, 10];
/** 디자인어 Lv.6부터 — 상대가 쌓아 둔 배율을 이만큼 깎는다(×1 아래로는 내려가지 않는다) */
export const ENHANCE_MERMAID_CUT: readonly number[] = [0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 10];
/** 디자인어 Lv.9부터 — 상대의 **다음 고른 기술**의 효과를 이 수로 나눈다(반올림). 1이면 나누지 않는다 */
export const ENHANCE_MERMAID_DIVIDE: readonly number[] = [1, 1, 1, 1, 1, 1, 1, 1, 2, 3, 5];
/** 특허랑이 Lv.6부터 함께 붙는 내 체력 회복. Lv.1~5는 깎기만 한다(빼앗지 않는다) */
export const ENHANCE_TIGER_HEAL: readonly number[] = [0, 0, 0, 0, 0, 4, 6, 6, 8, 8, 10];
/** 실용신양 Lv.6부터 — 내 카드 넷 중 무작위 하나에 더하는 경험치 */
export const ENHANCE_SHEEP_EXP: readonly number[] = [0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 10];

/** 기본 쿨타임(내 차례 수) — Lv.3부터 +1, Lv.5에서 또 +1(요청 원문 그대로 — Lv.6 이후로는 더 늘지 않는다) */
const ENHANCE_COOLDOWN_BASE: Record<Animal, number> = { sheep: 0, rabbit: 0, mermaid: 1, tiger: 1 };

/** 이 레벨의 카드를 쓴 뒤 못 쓰는 내 차례 수 */
export function enhanceCooldown(animal: Animal, level: number): number {
  return ENHANCE_COOLDOWN_BASE[animal] + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0);
}

/**
 * 누적 경험치 → 레벨(1 ~ 11, 11이 Lv.Max). Lv.1에서 시작해 임계값(실용신양·상표토끼 10, 디자인어·특허랑이 20 — 일반 판과 같다)을
 * 채울 때마다 한 단계씩 오른다. 카드가 모두 1이라 짝 하나(보통 2장)가 경험치 2다.
 */
export function enhanceLevel(animal: Animal, exp: number): number {
  return Math.min(ENHANCE_MAX_LEVEL, 1 + Math.floor(exp / THRESHOLDS[animal]));
}

/** 화면에 쓰는 레벨 이름 — 마지막 단계는 "Max" */
export function enhanceLevelLabel(level: number): string {
  return level >= ENHANCE_MAX_LEVEL ? 'Max' : String(level);
}

/** 이 레벨에서 기술 한 번의 기본 효과(배율 곱하기 전) */
export function enhanceValue(animal: Animal, level: number): number {
  return ENHANCE_VALUES[animal][clampLevel(level) - 1];
}
export function enhanceTigerHeal(level: number): number {
  return ENHANCE_TIGER_HEAL[clampLevel(level) - 1];
}
export function enhanceSheepExp(level: number): number {
  return ENHANCE_SHEEP_EXP[clampLevel(level) - 1];
}
export function enhanceMermaidCut(level: number): number {
  return ENHANCE_MERMAID_CUT[clampLevel(level) - 1];
}
export function enhanceMermaidDivide(level: number): number {
  return ENHANCE_MERMAID_DIVIDE[clampLevel(level) - 1];
}

/**
 * 기술 효과량 하나 — 기본값 × 배율 ÷ 나눗셈(디자인어 Lv.9+가 건 것)을 **반올림**한다(요청 원문 "소수점 반올림").
 * 엔진(skills.ts)과 화면 미리보기(lib/skills.ts)가 같은 함수를 쓴다.
 */
export function enhanceAmount(base: number, mult: number, divisor: number = 1): number {
  return Math.round((base * mult) / Math.max(1, divisor));
}

/**
 * 디자인어를 쓴 뒤의 배율. 배율이 걸려 있지 않으면(1) 그 레벨의 배율이 되고, 이미 걸려 있으면 그 위에 증가량을 더한다.
 * 다만 **새로 거는 것보다 작아지지는 않는다** — 예를 들어 ×2가 걸린 채 Lv.4(×5, 겹치면 +4)를 쓰면 ×6, Lv.1(×2, +1)이면 ×3이다.
 */
export function enhanceMermaidAfter(pending: number, level: number): number {
  const base = enhanceValue('mermaid', level);
  if (pending <= 1) return base;
  return Math.max(base, pending + ENHANCE_MERMAID_STACK[clampLevel(level) - 1]);
}

function clampLevel(level: number): number {
  return Math.min(ENHANCE_MAX_LEVEL, Math.max(1, Math.floor(level)));
}

/**
 * 판에 실리는 강화 상태 — 편마다 카드별로 "앞으로 못 쓰는 내 차례 수".
 * 0이면 지금 쓸 수 있다. 쓰는 순간 `쿨타임 + 1`로 세우고, 그 편의 차례가 끝날 때마다 1씩 줄인다(엔진 turnManager) —
 * 그래서 쓴 차례가 끝난 직후 화면에는 쿨타임 그대로의 숫자가 보이고, 그만큼의 내 차례를 건너뛴 뒤 다시 열린다.
 */
export interface EnhanceState {
  cooldowns: Record<SideId, Record<Animal, number>>;
  /**
   * 편마다 "다음 고른 기술의 효과를 나눌 수"(1 = 없음). 상대의 디자인어 Lv.9+가 건다(이미 걸려 있으면 큰 쪽).
   * 그 편이 디자인어가 아닌 기술을 **고르면** 쓰이고 1로 돌아간다(배율이 소모되는 것과 같은 때). 짝 효과는 나누지도 소모하지도 않는다.
   */
  divisors: Record<SideId, number>;
}

/**
 * 카드 강화 모드의 기본 규칙(요청 원문, 2026-10-28 2차) — 목표 점수 200(시작 체력 200 · 400이면 승리 · 0이면 패배, 턴 제한 없음) ·
 * 축제 6턴부터 1회 · 4턴마다 증가 · 뽑기 15초 · 행동 10초 · 고를 게 없을 때 3초. 혼자 놀기 폼의 게임 규칙에서 바꿀 수 있다(clampSettings를 거친다 —
 * 그래서 목표 점수 상한(SETTINGS_LIMITS)을 100에서 500으로 올렸다).
 */
export const ENHANCE_SETTINGS: GameSettings = {
  firstTeam: 'A',
  targetScore: 200,
  festivalTurn: 6,
  festivalDrawCount: 1,
  festivalDrawIncreaseInterval: 4,
  drawTimeSec: 15,
  actionTimeSec: 10,
  noActionTimeSec: 3,
  pauseMaxCount: 3,
  pauseMaxMin: 5,
};

// ─── 두 판(일반 · 강화)이 함께 쓰는 레벨 계산 ───────────────────────────────────────
// 서버 엔진(skills.ts의 levelOf)과 화면(동물 표·상대 목록·기술 카드)이 **같은 함수**로 레벨을 구해야 한다 —
// 한쪽만 강화 규칙을 알면 화면은 Lv.0인데 서버는 쓸 수 있다고 하는 식으로 어긋난다.

/** 레벨 — 일반 판은 floor(경험치 / 임계값), 강화 판은 1 + floor(경험치 / 임계값)이고 Lv.Max(11)에서 멈춘다. */
export function skillLevelFor(enhance: boolean, animal: Animal, exp: number): number {
  return enhance ? enhanceLevel(animal, exp) : Math.floor(exp / THRESHOLDS[animal]);
}

/**
 * 경험치 막대에 쓰는 값 — 이번 레벨 안에서 쌓은 양(inLevel)과 다음 레벨까지의 폭(need).
 * 강화 판에서 이미 최대 레벨이면 need가 null이다(막대는 가득 찬 채 "MAX").
 */
export function expProgressFor(
  enhance: boolean,
  animal: Animal,
  exp: number,
): { level: number; inLevel: number; need: number | null } {
  if (!enhance) {
    const t = THRESHOLDS[animal];
    return { level: Math.floor(exp / t), inLevel: exp % t, need: t };
  }
  const level = enhanceLevel(animal, exp);
  if (level >= ENHANCE_MAX_LEVEL) return { level, inLevel: 0, need: null };
  const t = THRESHOLDS[animal];
  return { level, inLevel: exp % t, need: t };
}

/** 이 편의 이 카드가 앞으로 못 쓰는 내 차례 수(강화 판이 아니면 언제나 0). */
/** 이 편의 다음 고른 기술에 걸린 나눗셈(강화 판이 아니거나 걸린 것이 없으면 1). */
export function enhanceDivisorOf(state: { enhance?: EnhanceState | null }, side: SideId): number {
  return state.enhance?.divisors?.[side] ?? 1;
}

export function enhanceCooldownLeft(
  state: { enhance?: EnhanceState | null },
  side: SideId,
  animal: Animal,
): number {
  return state.enhance?.cooldowns[side]?.[animal] ?? 0;
}
