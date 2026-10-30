import type { Animal, GameSettings, Place, SideId } from './types';
import { PLACE_ANIMALS } from './types';
import { SETTINGS_LIMITS, THRESHOLDS, clampSettings } from './constants';
import type { SettingsLimits } from './constants';

// ─── 카드 강화 모드 — '혼자 놀기'의 두 번째 판 ─────────────────────────────────────
// 설계 전문은 저장소 루트의 ENHANCE_MODE.md.
//
// 일반 판과 다른 점은 넷이다.
// 1. **모든 카드가 처음부터 Lv.1로 열려 있다.** 경험치는 "쓰면 깎이는 자원"이 아니라 **누적해 강화하는 값**이다 —
//    기술을 써도 경험치가 줄지 않고, 레벨은 내려가지 않는다(최대 Lv.Max). 한 레벨에 필요한 경험치는 일반 판과 같다
//    (실용신양·상표토끼 10, 디자인어·특허랑이 20 — THRESHOLDS).
// 2. **카드 숫자가 모두 1이다.** 짝이 맞으면 모인 장수만큼 경험치가 오른다(화면의 카드에는 숫자가 없다).
// 3. 기술마다 **쿨타임**이 있다(쓴 뒤 그 수만큼 내 차례에 못 쓴다). 레벨이 오를수록 효과도 쿨타임도 커진다.
// 4. **턴 제한이 없다** — 목표 체력에 닿거나 상대 체력이 0이 되어야 끝난다(shared/sides.ts의 maxTurnOf가 Infinity).
// 5. (짝이 맞으면 그 카드의 기술이 저절로 발동하던 "짝 효과"는 2026-10-31에 걷었다 — 직관적이지 않았다. 짝은 경험치만 올린다.)
// 6. **장소를 누르면 여러 장이 나온다** — 동물 2종 장소(오두막·부둣가) 1~3장, 3종 장소(숲길·강가) 3~5장(ENHANCE_PLACE_DRAWS).
//
// 엔진·화면은 혼자 놀기 그대로다 — 나(A) 대 컴퓨터(B)의 팀전 1:1 판에 이 규칙을 얹은 것이다(화면은 GameLayout).
// 이 판인지는 `GameState.enhance`가 있느냐로 가른다.

/** 최고 레벨 — Lv.1 ~ Lv.10 다음의 Lv.Max(11) */
export const ENHANCE_MAX_LEVEL = 11;
/**
 * 기술 카드의 등급 — 테두리와 홀로가 바뀐다(2026-10-31 요청, 화면 SkillChoiceBar의 data-enh-tier).
 *   iron    Lv.1 ~ 5   회색(차콜) 쇠 테두리 · 빛 반사 홀로만(같은 날 은색에서 바꿨다 — 은보다 쇠의 느낌)
 *   gold    Lv.6 ~ 10  금색 테두리 · 금빛 홀로 추가
 *   rainbow Lv.Max     흰빛과 무지개가 어우러진 테두리 · 무지개 홀로 추가
 * 등급이 바뀌는 것을 [승격]이라 부르고, 그 순간은 레벨업보다 화려한 연출(PromotionBurst)을 띄운다.
 */
export type EnhanceCardTier = 'iron' | 'gold' | 'rainbow';
/** 금색 등급이 시작되는 레벨(Lv.6 — 그 전에는 Lv.5부터 금빛이었다) */
export const ENHANCE_GOLD_FROM = 6;
export function enhanceCardTier(level: number): EnhanceCardTier {
  return level >= ENHANCE_MAX_LEVEL ? 'rainbow' : level >= ENHANCE_GOLD_FROM ? 'gold' : 'iron';
}

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
 * 실용신양 = 다음 턴 추가 뽑기 수 · 상표토끼 = 즉시 회복 · 디자인어 = 배율 · 특허랑이 = 상대 체력 감소.
 * **배율(디자인어 · Lv.Max 별도 배수)을 받는 것은 실용신양의 장수 · 상표토끼의 즉시 회복 · 특허랑이의 공격력 셋뿐이다**(5차 표 규칙) —
 * 나머지(경험치 · 지속 효과 · 쿨타임 · 정화 · 디자인어 자신)는 표의 값 그대로다.
 * (2026-10-30 5차 표 — 4차 표는 Lv.6부터 수치가 지수적으로 커졌다: 실용신양 ~256 · 상표토끼 ~2048 · 디자인어 ×10~×100 · 특허랑이 ~2000)
 */
export const ENHANCE_VALUES: Record<Animal, readonly number[]> = {
  sheep: [1, 2, 4, 8, 16, 32, 32, 32, 32, 32, 64],
  rabbit: [2, 4, 8, 16, 32, 64, 64, 64, 64, 64, 128],
  mermaid: [2, 3, 4, 5, 5, 5, 5, 5, 5, 5, 5],
  tiger: [10, 20, 40, 60, 80, 100, 100, 100, 100, 100, 200],
};
/**
 * 디자인어를 **배율이 이미 걸려 있을 때** 또 쓰면 그 배율을 키우는 양 — Lv.1~5는 더하고(+1 ~ +5),
 * Lv.6부터는 곱한다(×2 · ×3 · ×4 · ×5 · ×10 · Max ×20 — ENHANCE_MERMAID_STACK_MULTIPLY_FROM).
 */
export const ENHANCE_MERMAID_STACK: readonly number[] = [1, 2, 3, 4, 5, 2, 3, 4, 5, 10, 20];
export const ENHANCE_MERMAID_STACK_MULTIPLY_FROM = 6;
/** 디자인어 Lv.6부터 — 상대가 쌓아 둔 배율을 이 수로 나눈다(반올림, ×1 아래로는 안 내려간다). Max의 Infinity는 "배율 제거(×1로)" */
export const ENHANCE_MERMAID_OPP_DIVIDE: readonly number[] = [1, 1, 1, 1, 1, 2, 3, 4, 5, 10, Infinity];
/** 디자인어 Lv.Max — 상대가 고르는 기술의 효과를 이 수로 나눈다(반올림, "반감 효과"). 1이면 나누지 않는다 */
export const ENHANCE_MERMAID_DIVIDE: readonly number[] = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 10];
/** 디자인어 Lv.Max — 위 나눗셈이 이어지는 상대 차례 수. 다시 걸리면 턴을 더하고 최대 ENHANCE_DIVISOR_MAX_TURNS */
export const ENHANCE_MERMAID_DIVIDE_TURNS: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2];
/** 효과 감소(÷N, "반감 효과")가 쌓일 수 있는 최대 턴 수(5차 표 — 4차 표는 20) */
export const ENHANCE_DIVISOR_MAX_TURNS = 5;
/**
 * 디자인어 Lv.Max — 나를 노리는 상대의 기술(특허랑이 · 디자인어의 배율 나누기 · 효과 ÷10)을 이 확률(%)로 피한다.
 * 쓴 순간부터 **내 다음 차례가 올 때까지** 이어지고(개인전이면 같은 턴의 내 뒤 사람들 · 다음 턴의 내 앞 사람들), 공격마다 따로 굴린다. 0이면 없다.
 */
export const ENHANCE_MERMAID_EVADE_PCT: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20];
/** 실용신양 — 내 카드 넷 중 무작위 하나에 더하는 경험치(배율 무관 — 아래 중첩 배수만 곱한다) */
export const ENHANCE_SHEEP_EXP: readonly number[] = [1, 2, 4, 6, 8, 10, 10, 10, 10, 10, 20];
/** 실용신양 Lv.6부터 — 위 경험치에 곱하는 "경험치 중첩 배수"(그 한 번의 곱 — 쌓이지 않는다). Lv.1~5는 ×1 */
export const ENHANCE_SHEEP_EXP_STACK: readonly number[] = [1, 1, 1, 1, 1, 1, 2, 3, 4, 5, 10];

// ─── 지속 효과와 그것을 줄이는 효과. **모두 배율(디자인어 · Max 별도 배수)과 무관하다** ───────────
// 표의 Infinity는 "완전 초기화·정화"다(남은 턴을 통째로 지운다).

/** 실용신양 Lv.6부터 — 내 다른 카드 중 쿨타임이 걸린 무작위 카드의 쿨타임을 이만큼 줄인다(Max는 초기화) */
export const ENHANCE_SHEEP_COOLDOWN_CUT: readonly number[] = [0, 0, 0, 0, 0, 1, 1, 2, 2, 3, Infinity];
/** 실용신양 Lv.6부터 — 위 쿨타임 감소를 받는 카드 수(Max 두 장) */
export const ENHANCE_SHEEP_COOLDOWN_CARDS: readonly number[] = [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2];
/** 상표토끼 Lv.6부터 — 나에게 걸린 부정한 효과(효과 감소 ÷N · 출혈) 중 무작위 하나의 남은 턴을 이만큼 줄인다(Max는 정화) */
export const ENHANCE_RABBIT_CLEANSE: readonly number[] = [0, 0, 0, 0, 0, 1, 2, 3, 4, 5, Infinity];
/** 상표토끼 — 지속 회복에 더하는 턴 수(최대 ENHANCE_REGEN_MAX_TURNS) */
export const ENHANCE_RABBIT_REGEN_TURNS: readonly number[] = [1, 2, 3, 4, 5, 5, 5, 5, 5, 5, 10];
/** 상표토끼 Lv.6부터 — "체력 회복 중첩"에 더하는 수(쓸 때마다 쌓여 최대 ENHANCE_STACK_MAX). 지속 회복 한 턴의 양 = 32 × 중첩 */
export const ENHANCE_RABBIT_REGEN_STACK: readonly number[] = [0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 10];
/** 특허랑이 — 상대에게 쌓는 출혈 턴 수(최대 ENHANCE_BLEED_MAX_TURNS) */
export const ENHANCE_TIGER_BLEED_TURNS: readonly number[] = [1, 2, 4, 6, 8, 10, 10, 10, 10, 10, 20];
/** 특허랑이 Lv.6부터 — 상대의 "출혈 누적 계수"에 더하는 수(쌓여 최대 ENHANCE_STACK_MAX). 출혈 한 턴의 양 = 80 × (1 + 0.2 × 계수) */
export const ENHANCE_TIGER_BLEED_STACK: readonly number[] = [0, 0, 0, 0, 0, 1, 2, 3, 4, 5, 10];
/** 특허랑이 Lv.6부터 — 상대의 회복 효율을 이만큼(%) 깎는다(상대의 다음 1턴). 100이면 회복 금지 */
export const ENHANCE_TIGER_HEAL_CUT: readonly number[] = [0, 0, 0, 0, 0, 10, 20, 30, 50, 80, 100];
/** 회복 효율 감소가 이어지는 상대 차례 수 */
export const ENHANCE_HEAL_CUT_TURNS = 1;
/** 지속 회복 · 출혈이 쌓일 수 있는 최대 턴 수 — 넘는 몫은 버린다 */
export const ENHANCE_REGEN_MAX_TURNS = 20;
export const ENHANCE_BLEED_MAX_TURNS = 40;
/** 회복 중첩 · 출혈 누적 계수가 쌓일 수 있는 최대 값 */
export const ENHANCE_STACK_MAX = 20;
/**
 * 지속 효과 한 턴의 양 — 중첩(계수)이 없으면 낮은 값(Lv.1 기준: 회복 2 · 출혈 10), 생기면(Lv.6+에 맞았다) 높은 값(Lv.5 기준: 32 · 80)에서 센다.
 * 회복 = 32 × 중첩, 출혈 = 80 + 0.2 × 계수 × 80.
 */
export const ENHANCE_REGEN_TICK = { low: 2, high: 32 } as const;
export const ENHANCE_BLEED_TICK = { low: 10, high: 80, rate: 0.2 } as const;
/** 지속 회복 한 턴의 양(중첩 → 양) */
export function enhanceRegenTick(stack: number): number {
  return stack > 0 ? ENHANCE_REGEN_TICK.high * stack : ENHANCE_REGEN_TICK.low;
}
/** 출혈 한 턴의 양(계수 → 양, 반올림) */
export function enhanceBleedTick(stack: number): number {
  const t = ENHANCE_BLEED_TICK;
  return stack > 0 ? Math.round(t.high * (1 + t.rate * stack)) : t.low;
}
/**
 * 카드 강화 판의 예약 뽑기(실용신양 · 도토리 축제) 한 번의 상한 — 넘는 몫은 버린다(2026-10-30).
 * 실용신양에 디자인어 배율이 곱해지면 수천 장이 될 수 있다 — 그대로 뽑으면 한 갱신에 그만큼의 이벤트가 실리고
 * 화면의 롤 연출(rollDrawStep)이 몇 분을 넘는다.
 */
export const ENHANCE_RESERVED_DRAW_CAP = 512;

/**
 * 기본 쿨타임(내 차례 수) — Lv.3부터 +1, Lv.5에서 또 +1, **Lv.Max에서 또 +1**(2026-10-29 요청 — Lv.5~10의 2·3턴이 Max에서 3·4턴).
 * Lv.6~10 사이에서는 늘지 않는다.
 */
const ENHANCE_COOLDOWN_BASE: Record<Animal, number> = { sheep: 0, rabbit: 0, mermaid: 1, tiger: 1 };

/** 이 레벨의 카드를 쓴 뒤 못 쓰는 내 차례 수 */
export function enhanceCooldown(animal: Animal, level: number): number {
  return ENHANCE_COOLDOWN_BASE[animal] + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0) + (level >= ENHANCE_MAX_LEVEL ? 1 : 0);
}

/**
 * 한 차례에 쓸 수 있는 기술 수 — 방 규칙(settings.skillGrowth*)대로 N턴마다 하나씩 늘어 최대 M장(2026-10-30에 방 만들기 옵션이 됐다 —
 * 기본은 그 전 규칙 그대로 15턴마다 · 최대 3장: 1~15턴 1장 · 16~30턴 2장 · 31턴부터 3장). 끄면 언제나 1장.
 * 같은 카드는 한 차례에 두 번 못 쓴다 — 쓰는 순간 쿨타임이 1 이상으로 서고, 차례가 끝나야 줄어든다(advanceTurn). 그래서 4장이 끝이다.
 */
export function enhanceSkillsPerTurn(
  turn: number,
  growth: Pick<GameSettings, 'skillGrowth' | 'skillGrowthTurns' | 'skillGrowthMax'> = ENHANCE_SETTINGS,
): number {
  if (!growth.skillGrowth) return 1;
  const every = Math.max(1, growth.skillGrowthTurns);
  return Math.min(growth.skillGrowthMax, 1 + Math.floor((Math.max(1, turn) - 1) / every));
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
const byLevel = (table: readonly number[]) => (level: number): number => table[clampLevel(level) - 1];
export const enhanceSheepExp = byLevel(ENHANCE_SHEEP_EXP);
export const enhanceSheepExpStack = byLevel(ENHANCE_SHEEP_EXP_STACK);
export const enhanceSheepCooldownCut = byLevel(ENHANCE_SHEEP_COOLDOWN_CUT);
export const enhanceSheepCooldownCards = byLevel(ENHANCE_SHEEP_COOLDOWN_CARDS);
export const enhanceMermaidOppDivide = byLevel(ENHANCE_MERMAID_OPP_DIVIDE);
export const enhanceMermaidDivide = byLevel(ENHANCE_MERMAID_DIVIDE);
export const enhanceMermaidDivideTurns = byLevel(ENHANCE_MERMAID_DIVIDE_TURNS);
export const enhanceMermaidEvadePct = byLevel(ENHANCE_MERMAID_EVADE_PCT);
export const enhanceRabbitCleanse = byLevel(ENHANCE_RABBIT_CLEANSE);
export const enhanceRabbitRegenTurns = byLevel(ENHANCE_RABBIT_REGEN_TURNS);
export const enhanceRabbitRegenStack = byLevel(ENHANCE_RABBIT_REGEN_STACK);
export const enhanceTigerBleedTurns = byLevel(ENHANCE_TIGER_BLEED_TURNS);
export const enhanceTigerBleedStack = byLevel(ENHANCE_TIGER_BLEED_STACK);
export const enhanceTigerHealCut = byLevel(ENHANCE_TIGER_HEAL_CUT);
/** 특허랑이 Lv.Max — 상대의 이로운 효과(지속 회복과 그 중첩 · 쌓아 둔 배율 · 다음 턴 추가 뽑기 · 기술 회피)를 모두 걷어 낸다 */
export function enhanceTigerPurges(level: number): boolean {
  return clampLevel(level) >= ENHANCE_MAX_LEVEL;
}

/** 디자인어 Lv.6+가 상대 배율을 나눈 뒤의 값(반올림, ×1 아래로는 안 내려간다 — Max는 ×1) */
export function enhanceOppMultiplierAfter(before: number, level: number): number {
  const div = enhanceMermaidOppDivide(level);
  if (div <= 1) return before;
  return Math.max(1, Math.round(before / div));
}

/** 회복 효율 감소(N%)를 거친 회복량(반올림). 100%면 0 */
export function enhanceHealAfterCut(heal: number, cutPct: number): number {
  if (heal <= 0 || cutPct <= 0) return heal;
  return Math.max(0, Math.round(heal * (1 - Math.min(100, cutPct) / 100)));
}

/**
 * Lv.Max의 **별도 배수**(2026-10-29) — Max에 닿은 뒤에도 경험치는 계속 쌓이고, 임계값(10 · 20)을 한 번 더 채울 때마다 ×1씩 오른다
 * (Max에 막 닿았을 때 ×1 → 한 번 더 채우면 ×2 → ×3 …). Max가 아니면 1.
 * 이 배수는 **지금 걸린 배율에 곱한다** — 디자인어로 ×7이 걸린 채 별도 배수 ×3인 카드를 쓰면 ×21. 배율과 똑같이 실용신양의 장수 ·
 * 상표토끼의 즉시 회복 · 특허랑이의 공격력에만 걸린다(5차 표 — 디자인어 자신에게는 걸리지 않는다).
 * **그 카드를 고르면(기술 사용) ×1로 돌아간다**(2026-10-30) — 엔진이 (배수 − 1) × 임계값만큼 경험치를 깎는다(Max 아래로는 안 내려가고, 다음 배수까지
 * 쌓던 나머지는 남는다).
 */
export function enhanceOverMultiplier(animal: Animal, exp: number): number {
  const t = THRESHOLDS[animal];
  const maxExp = (ENHANCE_MAX_LEVEL - 1) * t;
  if (exp < maxExp) return 1;
  return 1 + Math.floor((exp - maxExp) / t);
}

/**
 * 기술 효과량 하나 — 기본값 × 배율 ÷ 나눗셈(상대 디자인어 Lv.Max가 건 것)을 **반올림**한다(요청 원문 "소수점 반올림").
 * 엔진(skills.ts)과 화면 미리보기(lib/skills.ts)가 같은 함수를 쓴다.
 */
export function enhanceAmount(base: number, mult: number, divisor: number = 1): number {
  return Math.round((base * mult) / Math.max(1, divisor));
}

/**
 * 디자인어를 쓴 뒤의 배율. 배율이 걸려 있지 않으면(1) 그 레벨의 배율이 되고, 이미 걸려 있으면 그 위에 증가량을 더하거나(Lv.1~5)
 * 곱한다(Lv.6+ — 누적 시 ×2 … Max ×20). 다만 **새로 거는 것보다 작아지지는 않는다** — ×2가 걸린 채 Lv.4(×5, 겹치면 +4)를 쓰면 ×6,
 * Lv.1(×2, +1)이면 ×3, ×2가 걸린 채 Lv.6(×5, 겹치면 ×2)이면 ×5, ×10이 걸린 채 Lv.7(×5, 겹치면 ×3)이면 ×30이다.
 * Lv.Max의 별도 배수는 디자인어에 걸리지 않는다(5차 표 — 배율을 받는 것은 장수 · 즉시 회복 · 공격력뿐).
 */
export function enhanceMermaidAfter(pending: number, level: number): number {
  const lv = clampLevel(level);
  const base = enhanceValue('mermaid', lv);
  if (pending <= 1) return base;
  const stack = ENHANCE_MERMAID_STACK[lv - 1];
  const stacked = lv >= ENHANCE_MERMAID_STACK_MULTIPLY_FROM ? pending * stack : pending + stack;
  return Math.max(base, stacked);
}

function clampLevel(level: number): number {
  return Math.min(ENHANCE_MAX_LEVEL, Math.max(1, Math.floor(level)));
}

/**
 * 판에 실리는 강화 상태 — 편마다 카드별로 "앞으로 못 쓰는 내 차례 수".
 * 0이면 지금 쓸 수 있다. 쓰는 순간 `쿨타임 + 1`로 세우고, 그 편의 차례가 끝날 때마다 1씩 줄인다(엔진 turnManager) —
 * 그래서 쓴 차례가 끝난 직후 화면에는 쿨타임 그대로의 숫자가 보이고, 그만큼의 내 차례를 건너뛴 뒤 다시 열린다.
 */
export interface EnhanceState extends EnhanceStatus {
  cooldowns: Record<SideId, Record<Animal, number>>;
  /**
   * 지금 차례인 편이 **이번 차례에** 쓴 카드(차례가 넘어갈 때 비운다 — 엔진 turnManager.advanceTurn). 잠금 판정에는 쓰지 않는다(쿨타임이 한다).
   * 화면 표시용이다 — 쓴 차례 안에서는 쿨타임 값에 그 차례 몫(+1)이 아직 들어 있어, 그대로 보이면 한 차례 2장 이상인 판에서
   * "2턴 남음"이 두 번째 기술을 고르자 "1턴 남음"으로 줄어드는 것처럼 보였다(2026-10-31). 화면은 enhanceCooldownShown으로 뺀다.
   */
  usedThisTurn?: Animal[];
}

/**
 * 지속 효과 하나 — 남은 턴 수와 한 턴의 양(출혈은 깎는 양, 지속 회복은 오르는 양). turns 0이면 없다.
 * fresh는 turns 가운데 **그 편이 자기 차례에 스스로 건** 몫이다(상표토끼의 지속 회복) — "모든 지속 효과는 발동 턴의 다음 턴에" 드는
 * 규칙이라, 건 그 차례가 끝날 때는 그 몫을 빼고 센다(엔진 tickEnhanceStatus가 센 뒤 0으로 되돌린다).
 */
export interface EnhanceDot {
  turns: number;
  amount: number;
  fresh?: number;
  /**
   * 회복 중첩(상표토끼 Lv.6+) · 출혈 누적 계수(특허랑이 Lv.6+) — 걸릴 때마다 쌓여 최대 ENHANCE_STACK_MAX, 효과가 끝나면 0으로.
   * 한 턴의 양(amount)은 이 값에서 나온다(enhanceRegenTick · enhanceBleedTick). 없으면 0.
   */
  stack?: number;
}

/** 회복 효율 감소(상대 특허랑이 Lv.6+) — 남은 그 편의 차례 수와 깎는 비율(%) */
export interface EnhanceHealCut {
  turns: number;
  pct: number;
}

/**
 * 편마다 걸린 지속 효과(체력창의 아이콘 · 기술 카드의 "÷N 적용"이 읽는다). 화면은 연출 순간까지 이 묶음을 통째로 가린다 —
 * 그래서 이벤트(skillApplied · enhanceTick)가 적용 직후의 묶음을 `status`로 함께 싣는다(cloneEnhanceStatus).
 *
 * 모든 지속 효과는 **발동한 차례의 다음 차례, 행동 선택이 끝난 뒤**에 든다 — 그 편이 차례를 마칠 때(엔진 turnManager.advanceTurn)
 * 출혈 → 지속 회복 순으로 한 번씩 들고 남은 턴이 하나씩 준다. 효과 감소 · 회복 효율 감소도 같은 자리에서 준다.
 */
export interface EnhanceStatus {
  /**
   * 편마다 "고른 기술의 효과를 나눌 수"(1 = 없음, "반감 효과"). 상대의 디자인어 Lv.Max가 건다(÷10 · 2턴 — 이미 걸려 있으면 나눗셈은 큰 쪽,
   * 턴은 더해 최대 5). 걸려 있는 동안 고르는 기술(디자인어 제외)마다 나뉘고, 그 편의 차례가 끝날 때마다 하나 줄어 0이면 사라진다.
   * 짝 효과는 나누지 않는다.
   */
  divisors: Record<SideId, number>;
  divisorTurns: Record<SideId, number>;
  /** 출혈(상대 특허랑이 — 최대 40턴) · 지속 회복(내 상표토끼 — 최대 20턴). 다시 걸리면 턴은 더하고, 중첩(계수)도 더한다(최대 20). */
  bleed: Record<SideId, EnhanceDot>;
  regen: Record<SideId, EnhanceDot>;
  /** 회복 효율 감소(상대 특허랑이 Lv.6+ — 그 편의 다음 1턴). 그동안 그 편의 모든 회복(기술 · 지속 회복)이 줄어든다. */
  healCut: Record<SideId, EnhanceHealCut>;
  /**
   * 기술 회피 확률(%, 내 디자인어 Lv.Max) — 쓴 순간부터 그 편의 다음 차례가 시작될 때까지(엔진 advanceTurn이 지운다).
   * 나를 노리는 기술마다 따로 굴려, 피하면 그 기술이 나에게 거는 것(피해 · 출혈 · 회복 감소 · 이로운 효과 제거 ·
   * 배율 나누기 · 효과 ÷10)이 하나도 들지 않는다. 0이면 없다. 예전 판의 상태에는 없을 수 있다.
   */
  evade?: Record<SideId, number>;
}

/** 지속 효과 묶음의 복사본 — 직렬화와 이벤트의 `status`가 쓴다(엔진 상태를 그대로 실으면 뒤의 변경이 따라 들어간다). */
export function cloneEnhanceStatus(e: EnhanceStatus): EnhanceStatus {
  const copy = <T extends object>(r: Record<SideId, T> | undefined) =>
    Object.fromEntries(Object.entries(r ?? {}).map(([s, d]) => [s, { ...d }])) as Record<SideId, T>;
  return {
    divisors: { ...e.divisors },
    divisorTurns: { ...e.divisorTurns },
    bleed: copy(e.bleed),
    regen: copy(e.regen),
    healCut: copy(e.healCut),
    evade: { ...(e.evade ?? {}) },
  };
}

/**
 * 카드 강화 모드의 기본 규칙 — 목표 점수 500(시작 체력 500 · 1000이면 승리 · 0이면 패배, 턴 제한 없음) ·
 * 축제 2턴부터 1회 · 2턴마다 +1회 · 뽑기 15초 · 행동 10초 · 고를 게 없을 때 3초(2026-10-30 요청 — 그 전에는 목표 200 · 축제 6턴 · 4턴마다).
 * 혼자 놀기 폼의 게임 규칙에서 바꿀 수 있다
 * (clampEnhanceSettings를 거친다 — 목표 점수 상한은 2500).
 */
export const ENHANCE_SETTINGS: GameSettings = {
  firstTeam: 'A',
  targetScore: 500,
  festivalTurn: 2,
  festivalDrawCount: 1,
  festivalDrawIncreaseInterval: 2,
  drawTimeSec: 15,
  actionTimeSec: 10,
  noActionTimeSec: 3,
  pauseMaxCount: 3,
  pauseMaxMin: 5,
  skillGrowth: true,
  skillGrowthTurns: 15,
  skillGrowthMax: 3,
};

/**
 * 카드 강화 판의 목표 점수(= 시작 체력) 상한 — 2500(승리선 5000). 일반 판은 그대로 SETTINGS_LIMITS(1~500)다.
 * 같은 날 두 번 바뀌었다(2026-10-29): 500 → "한계치 제거"(10억) → 2500. 상한이 없을 때 일곱 자리 체력이 구슬 칸을 넘쳤다.
 */
export const ENHANCE_TARGET_SCORE_MAX = 2500;
export const ENHANCE_SETTINGS_LIMITS: SettingsLimits = {
  ...SETTINGS_LIMITS,
  targetScore: { min: SETTINGS_LIMITS.targetScore.min, max: ENHANCE_TARGET_SCORE_MAX },
};
/** 카드 강화 판의 규칙 정리 — 방(Room.addSoloPlayer)과 엔진(initEnhanceGame)이 같은 범위로 자른다. */
export function clampEnhanceSettings(input: Partial<GameSettings> | undefined): GameSettings {
  return clampSettings({ ...ENHANCE_SETTINGS, ...input }, ENHANCE_SETTINGS_LIMITS);
}

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
): { level: number; inLevel: number; need: number | null; over: number } {
  const t = THRESHOLDS[animal];
  if (!enhance) return { level: Math.floor(exp / t), inLevel: exp % t, need: t, over: 1 };
  // Max에서도 막대는 다음 별도 배수(×2 · ×3 …)까지 계속 찬다(enhanceOverMultiplier)
  return { level: enhanceLevel(animal, exp), inLevel: exp % t, need: t, over: enhanceOverMultiplier(animal, exp) };
}

/** 이 편이 고르는 기술에 걸린 나눗셈(강화 판이 아니거나 걸린 것이 없으면 1). */
export function enhanceDivisorOf(state: { enhance?: EnhanceState | null }, side: SideId): number {
  return state.enhance?.divisors?.[side] ?? 1;
}

/** 이 편에 걸린 기술 회피 확률(%) — 강화 판이 아니거나 걸린 것이 없으면 0 */
export function enhanceEvadeOf(state: { enhance?: EnhanceState | null }, side: SideId): number {
  return state.enhance?.evade?.[side] ?? 0;
}

/** 이 편의 지금 회복 효율 감소(%) — 강화 판이 아니거나 걸린 것이 없으면 0 */
export function enhanceHealCutOf(state: { enhance?: EnhanceState | null }, side: SideId): number {
  const c = state.enhance?.healCut?.[side];
  return c && c.turns > 0 ? c.pct : 0;
}

/** 이 편의 이 카드가 앞으로 못 쓰는 내 차례 수(강화 판이 아니면 언제나 0). */
export function enhanceCooldownLeft(
  state: { enhance?: EnhanceState | null },
  side: SideId,
  animal: Animal,
): number {
  return state.enhance?.cooldowns[side]?.[animal] ?? 0;
}

/**
 * 화면에 보일 "남은 쿨타임" — 이 카드를 다시 쓰기까지 건너뛸 내 차례 수. 이번 차례에 쓴 카드는 저장값에서 그 차례 몫(+1)을 뺀다
 * (0이면 "다음 차례에 다시"). 잠금 여부는 이 값이 아니라 enhanceCooldownLeft로 본다.
 */
export function enhanceCooldownShown(
  state: { activeTeam: SideId; enhance?: EnhanceState | null },
  side: SideId,
  animal: Animal,
): number {
  const left = enhanceCooldownLeft(state, side, animal);
  const usedNow = state.activeTeam === side && (state.enhance?.usedThisTurn ?? []).includes(animal);
  return usedNow ? Math.max(0, left - 1) : left;
}
