import type { Animal, GameSettings, Place, SideId } from './types';
import { PLACE_ANIMALS } from './types';
import { SETTINGS_LIMITS, THRESHOLDS, clampSettings } from './constants';
import type { SettingsLimits } from './constants';

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
/** 기술 카드가 홀로에 더해 금빛으로 빛나기 시작하는 레벨(Lv.5 ~ Max — 화면 SkillChoiceBar의 .enh-gold) */
export const ENHANCE_GOLD_FROM = 5;

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

// ─── 3차 표(2026-10-29) — 지속 효과와 그것을 줄이는 효과. **모두 배율(디자인어 · Max 별도 배수)과 무관하다** ───────────
// 표의 Infinity는 "완전 초기화·정화"다(남은 턴을 통째로 지운다).

/** 실용신양 Lv.9부터 — 내 다른 카드 중 쿨타임이 걸린 무작위 한 장의 쿨타임을 이만큼 줄인다(Max는 초기화) */
export const ENHANCE_SHEEP_COOLDOWN_CUT: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, Infinity];
/** 상표토끼 Lv.6부터 — 나에게 걸린 부정한 효과(효과 감소 ÷N · 출혈) 중 무작위 하나의 남은 턴을 이만큼 줄인다(Max는 정화) */
export const ENHANCE_RABBIT_CLEANSE: readonly number[] = [0, 0, 0, 0, 0, 1, 2, 3, 4, 5, Infinity];
/** 상표토끼 Lv.9부터 — 지속 회복에 더하는 턴 수. 한 턴에 회복하는 양은 그 레벨의 기본 회복량(ENHANCE_VALUES.rabbit) */
export const ENHANCE_RABBIT_REGEN_TURNS: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4];
/** 디자인어 Lv.9부터 — 상대에게 건 효과 감소(÷N)가 이어지는 상대 차례 수. 그 사이 상대가 기술을 고르면 그때 사라진다 */
export const ENHANCE_MERMAID_DIVIDE_TURNS: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 2, 3, 10];
/** 특허랑이 Lv.9부터 — 상대에게 쌓는 출혈 턴 수. 한 턴에 깎는 양은 그 레벨의 기본 공격력(ENHANCE_VALUES.tiger — Max 20) */
export const ENHANCE_TIGER_BLEED_TURNS: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 4];
/** 출혈 · 지속 회복이 쌓일 수 있는 최대 턴 수(2026-10-30 요청) — 넘는 몫은 버린다 */
export const ENHANCE_DOT_MAX_TURNS = 10;

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
export function enhanceMermaidDivideTurns(level: number): number {
  return ENHANCE_MERMAID_DIVIDE_TURNS[clampLevel(level) - 1];
}
export function enhanceSheepCooldownCut(level: number): number {
  return ENHANCE_SHEEP_COOLDOWN_CUT[clampLevel(level) - 1];
}
export function enhanceRabbitCleanse(level: number): number {
  return ENHANCE_RABBIT_CLEANSE[clampLevel(level) - 1];
}
export function enhanceRabbitRegenTurns(level: number): number {
  return ENHANCE_RABBIT_REGEN_TURNS[clampLevel(level) - 1];
}
export function enhanceTigerBleedTurns(level: number): number {
  return ENHANCE_TIGER_BLEED_TURNS[clampLevel(level) - 1];
}

/**
 * Lv.Max의 **별도 배수**(2026-10-29) — Max에 닿은 뒤에도 경험치는 계속 쌓이고, 임계값(10 · 20)을 한 번 더 채울 때마다 ×1씩 오른다
 * (Max에 막 닿았을 때 ×1 → 한 번 더 채우면 ×2 → ×3 …). Max가 아니면 1.
 * 이 배수는 **지금 걸린 배율에 곱한다** — 디자인어로 ×7이 걸린 채 별도 배수 ×3인 카드를 쓰면 ×21(배율과 똑같이 효과량에만 걸리고,
 * 지속 효과 · 쿨타임 감소 · 정화처럼 배율에서 빠지는 것은 여기서도 빠진다). 짝 효과에도 걸린다(그 카드의 힘이라서).
 */
export function enhanceOverMultiplier(animal: Animal, exp: number): number {
  const t = THRESHOLDS[animal];
  const maxExp = (ENHANCE_MAX_LEVEL - 1) * t;
  if (exp < maxExp) return 1;
  return 1 + Math.floor((exp - maxExp) / t);
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
export function enhanceMermaidAfter(pending: number, level: number, over: number = 1): number {
  // Max의 별도 배수(over)는 디자인어 자신의 효과 — 거는 배율과 겹칠 때의 증가량 — 에 곱한다
  const base = enhanceValue('mermaid', level) * over;
  if (pending <= 1) return base;
  return Math.max(base, pending + ENHANCE_MERMAID_STACK[clampLevel(level) - 1] * over);
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
}

/** 지속 효과 하나 — 남은 턴 수와 한 턴의 양(출혈은 깎는 양, 지속 회복은 오르는 양). turns 0이면 없다. */
export interface EnhanceDot {
  turns: number;
  amount: number;
}

/**
 * 편마다 걸린 지속 효과(체력창의 아이콘 · 기술 카드의 "÷N 적용"이 읽는다). 화면은 연출 순간까지 이 묶음을 통째로 가린다 —
 * 그래서 이벤트(skillApplied · enhanceTick)가 적용 직후의 묶음을 `status`로 함께 싣는다(cloneEnhanceStatus).
 */
export interface EnhanceStatus {
  /**
   * 편마다 "다음 고른 기술의 효과를 나눌 수"(1 = 없음). 상대의 디자인어 Lv.9+가 건다(이미 걸려 있으면 큰 쪽).
   * 그 편이 디자인어가 아닌 기술을 **고르면** 쓰이고 1로 돌아간다(배율이 소모되는 것과 같은 때). 짝 효과는 나누지도 소모하지도 않는다.
   * 고르지 않아도 divisorTurns만큼 그 편의 차례가 끝나면 사라진다(Lv.9 2턴 · Lv.10 3턴 · Max 10턴).
   */
  divisors: Record<SideId, number>;
  divisorTurns: Record<SideId, number>;
  /**
   * 출혈(상대 특허랑이 Lv.9+) · 지속 회복(내 상표토끼 Lv.9+). 그 편의 **차례가 시작될 때** 출혈 → 회복 순으로 한 번씩 들고
   * 턴이 하나 준다(엔진 turnManager.advanceTurn). 다시 걸리면 턴은 더하고, 한 턴의 양은 큰 쪽.
   */
  bleed: Record<SideId, EnhanceDot>;
  regen: Record<SideId, EnhanceDot>;
}

/** 지속 효과 묶음의 복사본 — 직렬화와 이벤트의 `status`가 쓴다(엔진 상태를 그대로 실으면 뒤의 변경이 따라 들어간다). */
export function cloneEnhanceStatus(e: EnhanceStatus): EnhanceStatus {
  const dots = (r: Record<SideId, EnhanceDot>) => Object.fromEntries(Object.entries(r).map(([s, d]) => [s, { ...d }]));
  return { divisors: { ...e.divisors }, divisorTurns: { ...e.divisorTurns }, bleed: dots(e.bleed), regen: dots(e.regen) };
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
