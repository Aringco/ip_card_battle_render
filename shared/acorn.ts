import type { Animal, GameSettings, SideId } from './types';
import { THRESHOLDS } from './constants';

// ─── 도토리 카드(증강) — 카드 강화 판의 도토리 축제(2026-11-06, ACORN_CARDS.md) ─────────────────────────────
// 축제가 열리면(기본 4턴부터 4턴마다) 판에 남은 모든 사람이 **같은 단계**의 도토리 카드 셋 중 하나를 고른다(15초).
// 고른 카드는 그 판 동안 영구히 적용되고 판이 끝나면 사라진다. 같은 사람에게 같은 카드는 다시 나오지 않는다.
// 엔진 적용은 server/engine/acorn.ts, 화면은 AcornPicker · AcornShelf · AcornBadges.

/** 단계 — 1 작은 도토리 · 2 은빛 도토리 · 3 황금 도토리 · 4 무지개빛 도토리 */
export type AcornTier = 1 | 2 | 3 | 4;
export const ACORN_TIERS: readonly AcornTier[] = [1, 2, 3, 4];
export const ACORN_TIER_NAME: Record<AcornTier, string> = { 1: '작은 도토리', 2: '은빛 도토리', 3: '황금 도토리', 4: '무지개빛 도토리' };
/** 기술 카드 등급과 같은 테두리 · 홀로(SkillChoiceBar의 data-enh-tier)를 쓴다 */
export const ACORN_TIER_SKIN: Record<AcornTier, 'bronze' | 'silver' | 'gold' | 'rainbow'> = { 1: 'bronze', 2: 'silver', 3: 'gold', 4: 'rainbow' };
/** 단계 확률(%) — 두 번째 축제부터. 첫 축제는 넷 모두 25%(초반 템포) */
export const ACORN_TIER_ODDS: Record<AcornTier, number> = { 1: 50, 2: 30, 3: 15, 4: 5 };
export const ACORN_FIRST_TIER_ODDS: Record<AcornTier, number> = { 1: 25, 2: 25, 3: 25, 4: 25 };
/** 고르는 시간(초) */
export const ACORN_PICK_SEC = 15;
/** 후보 수 */
export const ACORN_OFFER_SIZE = 3;
/** 후보 한 칸이 다이아 도토리(공통 카드)일 확률 — 어느 단계에서나 섞여 나온다 */
export const ACORN_DIAMOND_SLOT_CHANCE = 0.1;

/** 카드 계열 — 네 동물 + 다이아 도토리(공통 · 시안색) */
export type AcornFamily = Animal | 'diamond';
/** 적용 범위 — 카드 한정형 · 동물 전체형 · 플레이어 전체형 */
export type AcornScope = 'card' | 'animal' | 'player';
export const ACORN_SCOPE_NAME: Record<AcornScope, string> = { card: '카드 한정형', animal: '동물 전체형', player: '플레이어 전체형' };

/** 카드 가운데 · 효과 표시에 그리는 그림(화면 lib/acornIcons.tsx — 같은 이름의 SVG) */
export type AcornIcon =
  | 'sword' | 'drop' | 'heart' | 'shield' | 'clock' | 'book' | 'cards' | 'sparkle' | 'gavel' | 'scroll'
  | 'eye' | 'bolt' | 'target' | 'mirror' | 'ban' | 'hourglass' | 'layers' | 'crown' | 'flask' | 'key' | 'seal' | 'chart';

/** 합산되는 영구 능력치 — 카드마다 더하고, 쓰는 자리에서 상한(ACORN_CAPS)으로 자른다 */
export interface AcornStats {
  /** 특허랑이 공격 피해 % */
  dmg: number;
  /** 출혈 중인 상대에게 공격 피해 % */
  dmgBleed: number;
  /** 상대 체력이 시작 체력의 50% 이하일 때 공격 피해 % */
  dmgHalf: number;
  /** 상대 체력이 시작 체력의 20% 이하일 때 공격 피해 % */
  dmgExec: number;
  /** 내가 거는 출혈 한 턴 피해 % */
  bleed: number;
  /** 내가 거는 출혈 + 턴 */
  bleedTurns: number;
  /** 내가 건 출혈이 들 때마다 + 피해 */
  bleedFlat: number;
  /** 지속 회복 한 턴 % */
  regen: number;
  /** 지속 회복 한 턴 + */
  regenFlat: number;
  /** 지속 회복을 걸 때 + 턴 */
  regenTurns: number;
  /** 지속 회복 최대 턴 + */
  regenCap: number;
  /** 받는 공격 피해 −% */
  guard: number;
  /** 매 턴 처음 받는 공격 피해 −% */
  guardFirst: number;
  /** 체력이 시작 체력의 30% 이하일 때 받는 공격 피해 −% */
  guardLow: number;
  /** 받는 출혈 피해 −% */
  bleedGuard: number;
  /** 내 기술 효과 %(실용신양 장수 · 상표토끼 즉시 회복 · 특허랑이 공격 — 배율을 받는 셋) */
  skill: number;
  /** 짝으로 얻는 경험치 % */
  exp: number;
  /** 내게 걸린 효과 감소(÷N)를 이만큼(%) 무시 */
  divIgnore: number;
  /** 공격할 때 상대 회복 효율 −%(1턴) */
  healCut: number;
  /** 출혈 중인 상대를 공격하면 회복 효율 −%(1턴) */
  healCutBleed: number;
  /** 상대의 피해 감소 % 무시 */
  pierce: number;
  /** 상대 보호막 % 무시 */
  shieldPierce: number;
  /** 나를 노리는 기술 회피 % */
  evade: number;
  /** 기술 추가 발동 확률 % · 그때 더하는 효과의 % (턴당 1회) */
  procPct: number;
  procAmt: number;
  /** 즉시 회복량의 %를 보호막으로 */
  healShield: number;
  /** 지속 회복량의 %를 보호막으로 */
  regenShield: number;
  /** 공격을 받을 때 반사 확률 % · 받은 피해의 % (턴당 1회) */
  reflectPct: number;
  reflectAmt: number;
  /** 기술을 쓴 뒤 그 카드 쿨타임 −1 확률 % */
  cdProc: number;
  /** 기술을 쓸 때 그 카드 경험치 확률 % · 양 (턴당 1회) */
  expProcPct: number;
  expProcAmt: number;
}
export type AcornStatKey = keyof AcornStats;

/** 합산 상한(%) — 기획안 §10의 권장 상한 */
export const ACORN_CAPS = {
  /** 공격 피해 증가 총합(dmg + 조건부) */
  dmg: 200,
  bleed: 200,
  regen: 100,
  skill: 200,
  exp: 200,
  /** 피해 감소 총합(guard + guardFirst + guardLow) */
  guard: 50,
  bleedGuard: 50,
  /** 회피 총합(디자인어 Lv.Max 회피 포함) */
  evade: 40,
  /** 추가 발동 확률 총합 */
  proc: 50,
  /** 보호막 상한 = 시작 체력의 이 % */
  shield: 20,
  /** 회복 효율 감소 총합 */
  healCut: 100,
} as const;

/** 카드 효과 하나 — 'stat'은 영구 능력치, 나머지는 고르는 순간 한 번 · 충전 · 조건 발동 */
export type AcornEffect =
  | { k: 'stat'; stat: AcornStatKey; v: number }
  | { k: 'proc'; pct: number; amt: number }
  | { k: 'reflect'; pct: number; amt: number }
  | { k: 'expProc'; pct: number; amount: number }
  /** 무작위 카드 n장에 경험치(others: 나머지 카드에도) */
  | { k: 'exp'; cards: number; amount: number; others?: number }
  /** 무작위 카드 n장에 그 카드 레벨 한 칸의 pct%만큼 경험치(레벨업 요구 경험치 할인을 이 게임에 옮긴 것) */
  | { k: 'expT'; cards: number; pct: number }
  /** 가장 낮은 레벨 카드 + amount, 나머지 + others */
  | { k: 'expLow'; amount: number; others: number }
  /** 다음 장소 times번 동안 카드 + n장(누른 장소에서) */
  | { k: 'draws'; n: number; times: number }
  /** 쿨타임 중인 무작위 카드 n장의 쿨타임 −by(99 = 초기화) */
  | { k: 'cd'; cards: number; by: number }
  /** 즉시 회복 — 시작 체력의 pct% */
  | { k: 'heal'; pct: number }
  /** 보호막 — 시작 체력의 pct% */
  | { k: 'shield'; pct: number }
  /** 부정 효과(출혈 · 효과 감소 · 회복 효율 감소) n개 제거 */
  | { k: 'cleanse'; n: number }
  /** 부정 효과 하나의 남은 턴 −by(only: 출혈만) */
  | { k: 'cleanseTurns'; by: number; only?: 'bleed' }
  /** 모든 상대의 쌓아 둔 배율 제거(×1로) */
  | { k: 'purgeMult' }
  /** 다음 기술(실용신양 · 상표토끼 · 특허랑이) 효과 +pct%, ignoreDiv면 효과 감소도 그 한 번 무시 */
  | { k: 'boost'; pct: number; ignoreDiv?: boolean }
  /** 다음에 받는 특허랑이 공격 피해 −pct% */
  | { k: 'ward'; pct: number }
  /** 출혈 피해 n번 무효 */
  | { k: 'bleedBlock'; n: number }
  /** 체력이 처음 0이 될 피해를 받으면 1로 버티고 시작 체력의 pct% 회복(판에 1회) */
  | { k: 'survive'; pct: number }
  /** 체력이 시작 체력의 30% 이하가 되면 pct% 회복(판에 1회) */
  | { k: 'lowHeal'; pct: number }
  /** 고른 뒤 every턴마다(턴이 오를 때) 무작위 카드 경험치 + amount, times번 */
  | { k: 'periodicExp'; every: number; amount: number; times: number }
  /** 고른 뒤 every턴마다 부정 효과 하나 제거, times번 */
  | { k: 'periodicCleanse'; every: number; times: number };

export interface AcornCardDef {
  id: string;
  family: AcornFamily;
  /** 동물 카드의 단계(다이아 도토리는 0 — 어느 단계의 축제에나 나오고, 수치는 황금과 무지개빛 사이로 고정이다) */
  tier: AcornTier | 0;
  name: string;
  icon: AcornIcon;
  scope: AcornScope;
  fx: AcornEffect[];
}

const S = (stat: AcornStatKey, v: number): AcornEffect => ({ k: 'stat', stat, v });

function card(id: string, family: Animal, tier: AcornTier, name: string, icon: AcornIcon, scope: AcornScope, fx: AcornEffect[]): AcornCardDef {
  return { id, family, tier, name, icon, scope, fx };
}
function diamond(id: string, name: string, icon: AcornIcon, fx: AcornEffect[]): AcornCardDef {
  return { id, family: 'diamond', tier: 0, name, icon, scope: 'player', fx };
}

/**
 * 카드 목록 — 기획안(tmp_prompt/증강 카드 도입방안)의 카드를 이 판의 숫자(시작 체력 500 · 특허랑이 44~146 · 지속 회복 4~40 ·
 * 출혈 12~45 · 임계값 10/20)에 맞춰 옮겼다. 옮기며 바꾼 것과 그 이유는 ACORN_CARDS.md §3에 있다.
 */
const ACORN_CARDS_BASE: readonly AcornCardDef[] = [
  // ── 실용신양 — 카드 획득 · 경험치 · 쿨타임 ──────────────────────────────
  card('s1a', 'sheep', 1, '선행기술 조사', 'book', 'card', [{ k: 'exp', cards: 1, amount: 4 }]),
  card('s1b', 'sheep', 1, '발명 노트 작성', 'cards', 'player', [{ k: 'draws', n: 3, times: 1 }]),
  card('s1c', 'sheep', 1, '연구개발 착수', 'flask', 'player', [S('exp', 5)]),
  card('s1d', 'sheep', 1, '명세서 보완', 'scroll', 'card', [{ k: 'exp', cards: 1, amount: 7 }]),
  card('s1e', 'sheep', 1, '기술 분류 체계', 'layers', 'player', [{ k: 'expProc', pct: 15, amount: 3 }]),
  card('s1f', 'sheep', 1, '출원 준비', 'clock', 'card', [{ k: 'cd', cards: 1, by: 1 }]),
  card('s2a', 'sheep', 2, '연구개발 투자 확대', 'chart', 'card', [{ k: 'exp', cards: 2, amount: 6 }]),
  card('s2b', 'sheep', 2, '우선심사 청구', 'bolt', 'card', [{ k: 'exp', cards: 1, amount: 12 }]),
  card('s2c', 'sheep', 2, '기술 포트폴리오 확장', 'cards', 'player', [{ k: 'draws', n: 6, times: 1 }]),
  card('s2d', 'sheep', 2, '선행기술 회피 설계', 'key', 'card', [{ k: 'expT', cards: 2, pct: 40 }]),
  card('s2e', 'sheep', 2, '기술이전 계약', 'seal', 'card', [{ k: 'exp', cards: 1, amount: 9, others: 2 }]),
  card('s2f', 'sheep', 2, '등록기술 활용', 'hourglass', 'player', [S('cdProc', 20)]),
  card('s3a', 'sheep', 3, '우선심사 등록', 'bolt', 'card', [{ k: 'exp', cards: 1, amount: 18 }, { k: 'expT', cards: 1, pct: 30 }]),
  card('s3b', 'sheep', 3, '공동연구 계약', 'cards', 'player', [{ k: 'draws', n: 5, times: 2 }]),
  card('s3c', 'sheep', 3, '기술 포트폴리오 최적화', 'layers', 'card', [{ k: 'exp', cards: 4, amount: 5 }]),
  card('s3d', 'sheep', 3, '실시권 확대', 'clock', 'card', [{ k: 'cd', cards: 2, by: 1 }]),
  card('s3e', 'sheep', 3, '연구 성과 공개', 'sparkle', 'player', [{ k: 'expProc', pct: 25, amount: 6 }]),
  card('s3f', 'sheep', 3, '기술 표준 선점', 'chart', 'player', [S('exp', 15)]),
  card('s4a', 'sheep', 4, '핵심특허 포트폴리오', 'crown', 'player', [S('exp', 25)]),
  card('s4b', 'sheep', 4, '기술 독점 실시권', 'key', 'card', [{ k: 'cd', cards: 2, by: 99 }]),
  card('s4c', 'sheep', 4, '전략적 기술이전', 'seal', 'card', [{ k: 'expLow', amount: 20, others: 8 }]),
  card('s4d', 'sheep', 4, '초고속 심사 등록', 'bolt', 'card', [{ k: 'expT', cards: 1, pct: 100 }]),
  card('s4e', 'sheep', 4, '연구개발 독점권', 'flask', 'player', [{ k: 'periodicExp', every: 4, amount: 10, times: 3 }]),
  card('s4f', 'sheep', 4, '기술 표준 장악', 'sparkle', 'player', [{ k: 'expProc', pct: 35, amount: 8 }, S('cdProc', 15)]),

  // ── 상표토끼 — 회복 · 지속 회복 · 방어 · 정화 ───────────────────────────
  card('r1a', 'rabbit', 1, '상표권 유지', 'heart', 'player', [{ k: 'heal', pct: 4 }]),
  card('r1b', 'rabbit', 1, '권리 보호 조치', 'shield', 'player', [S('guard', 3)]),
  card('r1c', 'rabbit', 1, '상표 갱신 등록', 'hourglass', 'animal', [S('regenTurns', 1)]),
  card('r1d', 'rabbit', 1, '지정상품 확대', 'heart', 'animal', [S('regenFlat', 2)]),
  card('r1e', 'rabbit', 1, '침해 경고장', 'scroll', 'player', [{ k: 'cleanseTurns', by: 2, only: 'bleed' }, S('bleedGuard', 5)]),
  card('r1f', 'rabbit', 1, '권리 범위 보강', 'shield', 'player', [{ k: 'shield', pct: 4 }]),
  card('r2a', 'rabbit', 2, '상표권 보호 강화', 'heart', 'animal', [{ k: 'heal', pct: 6 }, S('regenFlat', 2)]),
  card('r2b', 'rabbit', 2, '보호 범위 확장', 'shield', 'player', [S('guard', 6)]),
  card('r2c', 'rabbit', 2, '권리 회복 청구', 'shield', 'animal', [S('regenShield', 30)]),
  card('r2d', 'rabbit', 2, '침해 대응 절차', 'drop', 'player', [S('bleedGuard', 20)]),
  card('r2e', 'rabbit', 2, '상표권 갱신 우선권', 'layers', 'animal', [S('regen', 15), S('regenCap', 1)]),
  card('r2f', 'rabbit', 2, '권리 정정 신청', 'scroll', 'player', [{ k: 'cleanseTurns', by: 2 }, { k: 'shield', pct: 4 }]),
  card('r3a', 'rabbit', 3, '상표권 독점 보호', 'heart', 'animal', [S('regen', 25), S('regenTurns', 1)]),
  card('r3b', 'rabbit', 3, '권리 침해 구제', 'scroll', 'player', [{ k: 'cleanse', n: 1 }, { k: 'heal', pct: 6 }]),
  card('r3c', 'rabbit', 3, '회복의 권리화', 'shield', 'animal', [S('healShield', 30)]),
  card('r3d', 'rabbit', 3, '권리 보호 명령', 'shield', 'player', [S('guardLow', 20)]),
  card('r3e', 'rabbit', 3, '상표권 방어벽', 'shield', 'player', [S('guardFirst', 12)]),
  card('r3f', 'rabbit', 3, '침해 금지 가처분', 'ban', 'player', [{ k: 'bleedBlock', n: 2 }]),
  card('r4a', 'rabbit', 4, '상표권 절대 보호', 'crown', 'player', [{ k: 'survive', pct: 10 }]),
  card('r4b', 'rabbit', 4, '권리 보호 성역', 'shield', 'player', [S('guardFirst', 20), S('guard', 5)]),
  card('r4c', 'rabbit', 4, '완전한 권리 회복', 'scroll', 'player', [{ k: 'cleanse', n: 1 }, { k: 'periodicCleanse', every: 4, times: 2 }]),
  card('r4d', 'rabbit', 4, '상표권 방어막', 'shield', 'animal', [S('healShield', 40), { k: 'shield', pct: 8 }]),
  card('r4e', 'rabbit', 4, '존속기간 연장', 'hourglass', 'animal', [S('regenCap', 4), S('regen', 25), S('regenTurns', 1)]),
  card('r4f', 'rabbit', 4, '권리 침해 손해배상', 'mirror', 'player', [{ k: 'reflect', pct: 25, amt: 30 }]),
  card('r4g', 'rabbit', 4, '상표권 갱신 독점권', 'heart', 'player', [{ k: 'lowHeal', pct: 15 }]),

  // ── 디자인어 — 내 기술 증폭 · 상대 배율 억제 · 회피 ─────────────────────
  card('m1a', 'mermaid', 1, '디자인권 출원', 'sparkle', 'player', [S('skill', 5)]),
  card('m1b', 'mermaid', 1, '권리범위 명확화', 'eye', 'player', [S('divIgnore', 15)]),
  card('m1c', 'mermaid', 1, '실시권 확보', 'clock', 'card', [{ k: 'cd', cards: 1, by: 1 }]),
  card('m1d', 'mermaid', 1, '독점 실시 준비', 'bolt', 'player', [{ k: 'boost', pct: 15 }]),
  card('m1e', 'mermaid', 1, '선행디자인 조사', 'shield', 'player', [{ k: 'ward', pct: 15 }]),
  card('m2a', 'mermaid', 2, '디자인권 등록', 'sparkle', 'player', [S('skill', 10)]),
  card('m2b', 'mermaid', 2, '독점 실시권 행사', 'bolt', 'player', [{ k: 'boost', pct: 30 }]),
  card('m2c', 'mermaid', 2, '권리범위 해석', 'eye', 'player', [S('divIgnore', 30)]),
  card('m2d', 'mermaid', 2, '침해금지 가처분', 'gavel', 'player', [{ k: 'ward', pct: 30 }]),
  card('m2e', 'mermaid', 2, '실시권 재계약', 'clock', 'card', [{ k: 'cd', cards: 1, by: 1 }, S('skill', 5)]),
  card('m2f', 'mermaid', 2, '디자인권 보호', 'eye', 'player', [S('evade', 5)]),
  card('m3a', 'mermaid', 3, '디자인권 독점 실시', 'sparkle', 'player', [S('skill', 20)]),
  card('m3b', 'mermaid', 3, '무효심판 청구', 'gavel', 'player', [{ k: 'purgeMult' }, { k: 'ward', pct: 15 }]),
  card('m3c', 'mermaid', 3, '침해금지 명령', 'gavel', 'player', [{ k: 'ward', pct: 45 }]),
  card('m3d', 'mermaid', 3, '기술 복제권 확보', 'layers', 'player', [{ k: 'proc', pct: 15, amt: 30 }]),
  card('m3e', 'mermaid', 3, '디자인권 우선심사', 'clock', 'card', [{ k: 'cd', cards: 2, by: 1 }]),
  card('m3f', 'mermaid', 3, '권리범위 확장', 'eye', 'player', [S('divIgnore', 50), S('skill', 5)]),
  card('m4a', 'mermaid', 4, '디자인권 절대 독점', 'crown', 'player', [S('skill', 35)]),
  card('m4b', 'mermaid', 4, '독점권 최종 행사', 'bolt', 'player', [{ k: 'boost', pct: 60, ignoreDiv: true }]),
  card('m4c', 'mermaid', 4, '침해금지 가처분 확정', 'gavel', 'player', [{ k: 'ward', pct: 70 }]),
  card('m4d', 'mermaid', 4, '기술 복제 독점권', 'layers', 'player', [{ k: 'proc', pct: 20, amt: 50 }]),
  card('m4e', 'mermaid', 4, '무효심판 확정', 'gavel', 'player', [{ k: 'purgeMult' }, { k: 'ward', pct: 30 }, S('divIgnore', 20)]),
  card('m4f', 'mermaid', 4, '디자인권 보호 명령', 'eye', 'player', [S('evade', 12)]),

  // ── 특허랑이 — 직접 피해 · 출혈 · 회복 억제 · 방어 관통 ───────────────────
  card('t1a', 'tiger', 1, '특허 출원', 'sword', 'animal', [S('dmg', 5)]),
  card('t1b', 'tiger', 1, '선행기술 침해 조사', 'drop', 'animal', [S('bleed', 10)]),
  card('t1c', 'tiger', 1, '특허 명세서 보완', 'hourglass', 'animal', [S('bleedTurns', 1)]),
  card('t1d', 'tiger', 1, '권리범위 확대', 'target', 'animal', [S('dmgBleed', 8)]),
  card('t1e', 'tiger', 1, '침해 경고장 발송', 'ban', 'animal', [S('healCut', 8)]),
  card('t1f', 'tiger', 1, '손해배상 예비 청구', 'drop', 'animal', [S('bleedFlat', 2)]),
  card('t2a', 'tiger', 2, '특허 등록', 'sword', 'animal', [S('dmg', 10)]),
  card('t2b', 'tiger', 2, '독점권 행사', 'drop', 'animal', [S('bleed', 18)]),
  card('t2c', 'tiger', 2, '침해소송 제기', 'target', 'animal', [S('dmgBleed', 15)]),
  card('t2d', 'tiger', 2, '회복금지 가처분', 'ban', 'animal', [S('healCut', 15)]),
  card('t2e', 'tiger', 2, '권리범위 확인심판', 'key', 'animal', [S('pierce', 30), S('shieldPierce', 10)]),
  card('t2f', 'tiger', 2, '손해배상 청구', 'drop', 'animal', [S('bleedFlat', 4)]),
  card('t3a', 'tiger', 3, '특허 독점 실시', 'sword', 'animal', [S('dmg', 20)]),
  card('t3b', 'tiger', 3, '출혈 기술 특허', 'drop', 'animal', [S('bleed', 25), S('bleedTurns', 1)]),
  card('t3c', 'tiger', 3, '침해금지 명령', 'ban', 'animal', [S('healCutBleed', 25)]),
  card('t3d', 'tiger', 3, '특허권 범위 확장', 'layers', 'animal', [S('bleed', 20), S('dmgBleed', 10)]),
  card('t3e', 'tiger', 3, '가처분 집행', 'key', 'animal', [S('shieldPierce', 35), S('pierce', 15)]),
  card('t3f', 'tiger', 3, '손해배상 판결', 'target', 'animal', [S('dmgHalf', 18)]),
  card('t4a', 'tiger', 4, '특허권 절대 독점', 'crown', 'animal', [S('dmg', 35)]),
  card('t4b', 'tiger', 4, '치명적 출혈 특허', 'drop', 'animal', [S('bleed', 35), S('bleedTurns', 2)]),
  card('t4c', 'tiger', 4, '독점권 최종 행사', 'ban', 'animal', [S('healCutBleed', 50)]),
  card('t4d', 'tiger', 4, '침해금지 가처분 확정', 'key', 'animal', [S('shieldPierce', 60), S('pierce', 40)]),
  card('t4e', 'tiger', 4, '손해배상 최종 판결', 'drop', 'animal', [S('bleedFlat', 8)]),
  card('t4f', 'tiger', 4, '특허권 처분 명령', 'target', 'animal', [S('dmgExec', 35)]),

  // ── 다이아 도토리 — 공통(어느 단계의 축제에나 섞여 나온다) ─────────────────
  // 황금과 무지개빛 사이의 등급(2026-11-08 요청). 특정 동물에 묶이지 않고 내 모든 기술 · 체력에 든다.
  // 수치는 같은 종류의 황금 카드와 무지개빛 카드의 대략 가운데다 — 아래 숫자는 ACORN_POWER를 곱하기 전의 값.
  diamond('d01', '지식재산 통합 전략', 'sparkle', [S('skill', 27)]),
  diamond('d02', '전방위 권리 행사', 'bolt', [{ k: 'boost', pct: 45 }]),
  diamond('d03', '권리 복제 전략', 'layers', [{ k: 'proc', pct: 18, amt: 40 }]),
  diamond('d04', '지식재산 포트폴리오', 'chart', [S('exp', 20)]),
  diamond('d05', '공동연구 체계', 'flask', [{ k: 'expProc', pct: 30, amount: 7 }]),
  diamond('d06', '일괄 심사 청구', 'book', [{ k: 'exp', cards: 4, amount: 8 }]),
  diamond('d07', '우선권 주장', 'cards', [{ k: 'draws', n: 6, times: 2 }]),
  diamond('d08', '권리 존속 관리', 'hourglass', [S('cdProc', 30)]),
  diamond('d09', '포괄 실시권 갱신', 'clock', [{ k: 'cd', cards: 4, by: 1 }]),
  diamond('d10', '통합 권리 보호', 'shield', [S('guard', 10)]),
  diamond('d11', '선제 방어 체계', 'seal', [S('guardFirst', 16)]),
  diamond('d12', '위기 대응 체계', 'target', [S('guardLow', 25)]),
  diamond('d13', '통합 권리 구제', 'scroll', [{ k: 'cleanse', n: 1 }, { k: 'heal', pct: 8 }]),
  diamond('d14', '권리 회복 청구', 'heart', [{ k: 'heal', pct: 10 }]),
  diamond('d15', '전방위 보호막', 'mirror', [{ k: 'shield', pct: 7 }]),
  diamond('d16', '권리 안전망', 'crown', [{ k: 'lowHeal', pct: 11 }]),
  diamond('d17', '권리 회피 설계', 'eye', [S('evade', 9)]),
  diamond('d18', '권리범위 재해석', 'key', [S('divIgnore', 25), S('skill', 8)]),
];

/**
 * 판을 빨리 끝내는 쪽(공격 · 출혈 · 기술 효과 · 경험치 · 카드 획득 · 추가 발동)의 수치만 ACORN_POWER배(반올림).
 * 2026-11-07 ×2(판 길이 15~17 → 10~12턴) → 같은 날 ×4 · 공격 · 출혈 · 기술 · 경험치 상한 100 → 200%(템포 — 중앙값 9 → 8턴, enhanceBalance 1000판).
 * 막는 쪽(피해 감소 · 보호막 · 회복 · 회피 …)과 턴 수 · 장수 같은 개수는 그대로다. 합산 상한(ACORN_CAPS)도 그대로 걸린다.
 */
export const ACORN_POWER = 4;
const POWER_STATS: ReadonlySet<AcornStatKey> = new Set<AcornStatKey>(['dmg', 'dmgBleed', 'dmgHalf', 'dmgExec', 'bleed', 'bleedFlat', 'skill', 'exp', 'divIgnore', 'pierce', 'shieldPierce']);
const pw = (v: number) => Math.round(v * ACORN_POWER);
function powerUp(e: AcornEffect): AcornEffect {
  switch (e.k) {
    case 'stat': return POWER_STATS.has(e.stat) ? { ...e, v: pw(e.v) } : e;
    case 'proc': return { ...e, amt: pw(e.amt) };
    case 'expProc': return { ...e, amount: pw(e.amount) };
    case 'exp': return { ...e, amount: pw(e.amount), ...(e.others ? { others: pw(e.others) } : {}) };
    case 'expT': return { ...e, pct: pw(e.pct) };
    case 'expLow': return { ...e, amount: pw(e.amount), others: pw(e.others) };
    case 'draws': return { ...e, n: pw(e.n) };
    case 'boost': return { ...e, pct: pw(e.pct) };
    case 'periodicExp': return { ...e, amount: pw(e.amount) };
    default: return e;
  }
}
export const ACORN_CARDS: readonly AcornCardDef[] = ACORN_CARDS_BASE.map(c => ({
  ...c,
  fx: c.fx.map(powerUp),
}));

const BY_ID = new Map(ACORN_CARDS.map(c => [c.id, c]));
export function acornCard(id: string): AcornCardDef | undefined {
  return BY_ID.get(id);
}
/** 이 카드의 효과 */
export function acornEffectsOf(id: string): AcornEffect[] {
  return BY_ID.get(id)?.fx ?? [];
}

// ─── 판에 실리는 상태 ───────────────────────────────────────────────────────

export interface AcornOwned {
  id: string;
  tier: AcornTier;
  /** 얻은 턴 */
  turn: number;
}

/** 한 편의 도토리 상태 */
export interface AcornSide {
  owned: AcornOwned[];
  /** 지금까지 후보로 본 카드(같은 카드를 다시 보이지 않으려고 — 후보가 모자라면 여기서 다시 나온다) */
  seen: string[];
  /** 다음 기술 효과 +%(1회 — 실용신양 · 상표토끼 · 특허랑이 중 먼저 쓰는 것) */
  boost: number;
  boostIgnoreDiv: boolean;
  /** 다음에 받는 특허랑이 공격 피해 −%(1회) */
  ward: number;
  /** 남은 출혈 무효 횟수 */
  bleedBlock: number;
  /** 남은 "다음 장소 카드 +n장" */
  drawCharges: Array<{ n: number; left: number }>;
  /** 쓰러짐 방지(회복 %) · 위기 회복(회복 %) — 0이면 없거나 이미 썼다 */
  survive: number;
  lowHeal: number;
  /** 턴마다 도는 효과 — from: 얻은 턴, left: 남은 횟수 */
  periodic: Array<{ kind: 'exp' | 'cleanse'; every: number; amount: number; left: number; from: number }>;
  /** 턴당 1회 효과의 마지막 사용 턴(state.turn) */
  procTurn: number;
  reflectTurn: number;
  expProcTurn: number;
  firstHitTurn: number;
  /** 경험치 %의 소수점 이월 */
  expCarry: number;
}

export interface AcornOffer {
  /** 몇 번째 축제인가(1부터) */
  no: number;
  tier: AcornTier;
  /** 편마다 후보 카드 id 셋 */
  options: Record<SideId, string[]>;
  /** 편마다 고른 카드(null = 아직) */
  picked: Record<SideId, string | null>;
  /** 편마다 칸별 리롤을 썼는가(축제마다 칸 하나에 한 번 — 2026-11-06). 예전 상태에는 없을 수 있다 */
  rerolled?: Record<SideId, boolean[]>;
}

export interface AcornState {
  /** 지금까지 열린 축제 수 */
  festivals: number;
  sides: Record<SideId, AcornSide>;
  /** 고르는 중인 축제 — 있는 동안 판은 멈춰 있다(장소 · 기술을 받지 않는다) */
  offer: AcornOffer | null;
}

export function emptyAcornSide(): AcornSide {
  return {
    owned: [], seen: [], boost: 0, boostIgnoreDiv: false, ward: 0, bleedBlock: 0, drawCharges: [],
    survive: 0, lowHeal: 0, periodic: [], procTurn: 0, reflectTurn: 0, expProcTurn: 0, firstHitTurn: 0, expCarry: 0,
  };
}

export function cloneAcornState(a: AcornState): AcornState {
  return {
    festivals: a.festivals,
    sides: Object.fromEntries(
      Object.entries(a.sides).map(([s, v]) => [s, {
        ...v,
        owned: v.owned.map(o => ({ ...o })),
        seen: [...v.seen],
        drawCharges: v.drawCharges.map(d => ({ ...d })),
        periodic: v.periodic.map(p => ({ ...p })),
      }]),
    ),
    offer: a.offer
      ? {
          ...a.offer,
          options: Object.fromEntries(Object.entries(a.offer.options).map(([s, o]) => [s, [...o]])),
          picked: { ...a.offer.picked },
          rerolled: Object.fromEntries(Object.entries(a.offer.rerolled ?? {}).map(([s, r]) => [s, [...r]])),
        }
      : null,
  };
}

// ─── 축제 시기 · 단계 · 후보 ─────────────────────────────────────────────────

/** 이 턴이 도토리 축제 턴인가 — 축제 시작 턴부터 주기(festivalDrawIncreaseInterval)마다. 기본 4 · 8 · 12 · 16턴 */
export function isAcornFestivalTurn(turn: number, settings: Pick<GameSettings, 'festivalTurn' | 'festivalDrawIncreaseInterval'>): boolean {
  const every = Math.max(1, settings.festivalDrawIncreaseInterval);
  return turn >= settings.festivalTurn && (turn - settings.festivalTurn) % every === 0;
}
/** 지금 턴 이후(지금 포함) 다음 축제 턴 */
export function nextAcornFestivalTurn(turn: number, settings: Pick<GameSettings, 'festivalTurn' | 'festivalDrawIncreaseInterval'>): number {
  if (turn <= settings.festivalTurn) return settings.festivalTurn;
  const every = Math.max(1, settings.festivalDrawIncreaseInterval);
  return settings.festivalTurn + Math.ceil((turn - settings.festivalTurn) / every) * every;
}

/** 단계 뽑기 — 첫 축제(no 1)는 넷 모두 25%, 그 뒤 50 · 30 · 15 · 5% */
export function rollAcornTier(no: number, rng: () => number): AcornTier {
  const odds = no <= 1 ? ACORN_FIRST_TIER_ODDS : ACORN_TIER_ODDS;
  let r = rng() * 100;
  for (const t of ACORN_TIERS) {
    r -= odds[t];
    if (r < 0) return t;
  }
  return 1;
}

/**
 * 한 사람의 후보 셋 — 그 단계의 동물 카드(네 동물 모두)와 다이아 도토리에서, 칸마다 ACORN_DIAMOND_SLOT_CHANCE로 다이아를 고른다.
 * 이미 가진 카드는 절대 나오지 않는다. 처음 보는 카드를 먼저 쓰고, 모자라면 전에 후보로 봤던(고르지 않은) 카드를 다시 쓴다.
 */
export function drawAcornOptions(
  side: Pick<AcornSide, 'owned' | 'seen'>,
  tier: AcornTier,
  rng: () => number,
  size = ACORN_OFFER_SIZE,
  /** 뽑지 않을 카드(리롤 — 지금 보이는 후보) */
  exclude: readonly string[] = [],
): string[] {
  const owned = new Set(side.owned.map(o => o.id));
  const seen = new Set(side.seen);
  const out: string[] = [];
  const skip = new Set(exclude);
  const animalPool = ACORN_CARDS.filter(c => c.family !== 'diamond' && c.tier === tier && !owned.has(c.id)).map(c => c.id);
  const diamondPool = ACORN_CARDS.filter(c => c.family === 'diamond' && !owned.has(c.id)).map(c => c.id);
  const take = (pool: string[], fresh: boolean): string | null => {
    const list = pool.filter(id => !out.includes(id) && !skip.has(id) && seen.has(id) !== fresh);
    return list.length > 0 ? list[Math.floor(rng() * list.length)] : null;
  };
  for (let i = 0; i < size; i++) {
    const first = rng() < ACORN_DIAMOND_SLOT_CHANCE ? diamondPool : animalPool;
    const second = first === diamondPool ? animalPool : diamondPool;
    const id = take(first, true) ?? take(second, true) ?? take(first, false) ?? take(second, false);
    if (id === null) break;
    out.push(id);
  }
  return out;
}

// ─── 합산 · 계산(엔진과 화면 미리보기가 같은 함수를 쓴다) ─────────────────────────

const ZERO_STATS: AcornStats = {
  dmg: 0, dmgBleed: 0, dmgHalf: 0, dmgExec: 0, bleed: 0, bleedTurns: 0, bleedFlat: 0,
  regen: 0, regenFlat: 0, regenTurns: 0, regenCap: 0, guard: 0, guardFirst: 0, guardLow: 0, bleedGuard: 0,
  skill: 0, exp: 0, divIgnore: 0, healCut: 0, healCutBleed: 0, pierce: 0, shieldPierce: 0, evade: 0,
  procPct: 0, procAmt: 0, healShield: 0, regenShield: 0, reflectPct: 0, reflectAmt: 0, cdProc: 0, expProcPct: 0, expProcAmt: 0,
};

/** 가진 카드의 영구 능력치 합. 확률 · 양 짝(proc · reflect · expProc)은 확률은 더하고 양은 큰 쪽 */
export function acornStatsOf(side: Pick<AcornSide, 'owned'> | undefined): AcornStats {
  const s = { ...ZERO_STATS };
  for (const o of side?.owned ?? []) {
    for (const e of acornEffectsOf(o.id)) {
      if (e.k === 'stat') s[e.stat] += e.v;
      else if (e.k === 'proc') { s.procPct += e.pct; s.procAmt = Math.max(s.procAmt, e.amt); }
      else if (e.k === 'reflect') { s.reflectPct += e.pct; s.reflectAmt = Math.max(s.reflectAmt, e.amt); }
      else if (e.k === 'expProc') { s.expProcPct += e.pct; s.expProcAmt = Math.max(s.expProcAmt, e.amount); }
    }
  }
  return s;
}

type WithAcorn = { enhance?: { acorn?: AcornState | null } | null; settings: Pick<GameSettings, 'targetScore'> };

export function acornSideOf(state: WithAcorn, side: SideId): AcornSide | undefined {
  return state.enhance?.acorn?.sides[side];
}
export function acornStats(state: WithAcorn, side: SideId): AcornStats {
  return acornStatsOf(acornSideOf(state, side));
}
/** 시작 체력의 pct% (반올림) — 회복 · 보호막 · 조건의 기준 */
export function acornHpPct(state: WithAcorn, pct: number): number {
  return Math.round((state.settings.targetScore * pct) / 100);
}
export function acornShieldCap(state: WithAcorn): number {
  return acornHpPct(state, ACORN_CAPS.shield);
}

/** 내 기술(배율을 받는 셋)의 도토리 배수 — 1 + (영구 % + 다음 기술 %)(상한 100%). 디자인어 배율에 **곱하지 않고** 그 배율 위에 더하는 몫이다 */
export function acornSkillFactor(state: WithAcorn, side: SideId): number {
  const a = acornSideOf(state, side);
  if (!a) return 1;
  return 1 + Math.min(ACORN_CAPS.skill, acornStatsOf(a).skill + a.boost) / 100;
}
/** 내게 걸린 효과 감소 ÷N을 도토리가 덜어 낸 값(÷1 아래로는 안 내려간다) */
export function acornDivisor(state: WithAcorn, side: SideId, divisor: number): number {
  if (divisor <= 1) return divisor;
  const a = acornSideOf(state, side);
  if (!a) return divisor;
  if (a.boostIgnoreDiv) return 1;
  const ignore = Math.min(100, acornStatsOf(a).divIgnore) / 100;
  return 1 + (divisor - 1) * (1 - ignore);
}

/** 공격하는 쪽의 피해 증가 %(조건부 포함, 상한 100) — 대상의 체력 · 출혈 상태로 조건을 본다 */
export function acornAttackPct(state: WithAcorn & { teams: Record<SideId, { hp: number }>; enhance?: { bleed?: Record<SideId, { turns: number }>; acorn?: AcornState | null } | null }, attacker: SideId, target: SideId | undefined): number {
  const s = acornStats(state, attacker);
  let pct = s.dmg;
  if (target !== undefined) {
    const hp = state.teams[target]?.hp ?? 0;
    if ((state.enhance?.bleed?.[target]?.turns ?? 0) > 0) pct += s.dmgBleed;
    if (hp <= acornHpPct(state, 50)) pct += s.dmgHalf;
    if (hp <= acornHpPct(state, 20)) pct += s.dmgExec;
  }
  return Math.min(ACORN_CAPS.dmg, pct);
}

/** 내가 거는 출혈 한 턴의 양 — 기본(공격력의 50%) × (1 + 출혈 %) + 고정 피해 */
export function acornBleedAmount(tick: number, bonusPct: number, flat: number): number {
  return Math.round(tick * (1 + Math.min(ACORN_CAPS.bleed, bonusPct) / 100)) + flat;
}
/** 지속 회복 한 턴의 양 — 기본(즉시 회복의 50%) × (1 + 회복 %) + 고정 */
export function acornRegenAmount(tick: number, stats: Pick<AcornStats, 'regen' | 'regenFlat'>): number {
  return Math.round(tick * (1 + Math.min(ACORN_CAPS.regen, stats.regen) / 100)) + stats.regenFlat;
}
/** 받는 출혈 — 출혈 무효가 남아 있으면 0, 아니면 받는 출혈 감소를 거친 값 */
export function acornBleedTaken(state: WithAcorn, side: SideId, amount: number): number {
  const a = acornSideOf(state, side);
  if (!a) return amount;
  if (a.bleedBlock > 0) return 0;
  return Math.round(amount * (1 - Math.min(ACORN_CAPS.bleedGuard, acornStatsOf(a).bleedGuard) / 100));
}

// ─── 문구 ────────────────────────────────────────────────────────────────

const STAT_TEXT: Record<AcornStatKey, (v: number) => string> = {
  dmg: v => `특허랑이 공격 피해 +${v}%`,
  dmgBleed: v => `출혈 중인 상대에게 공격 피해 +${v}%`,
  dmgHalf: v => `상대 체력이 시작 체력의 50% 이하면 공격 피해 +${v}%`,
  dmgExec: v => `상대 체력이 시작 체력의 20% 이하면 공격 피해 +${v}%`,
  bleed: v => `내가 거는 출혈 피해 +${v}%`,
  bleedTurns: v => `내가 거는 출혈 +${v}턴`,
  bleedFlat: v => `내가 건 출혈이 들 때마다 피해 +${v}`,
  regen: v => `지속 회복량 +${v}%`,
  regenFlat: v => `지속 회복 한 턴 +${v}`,
  regenTurns: v => `지속 회복을 걸 때 +${v}턴`,
  regenCap: v => `지속 회복 최대 턴 +${v}`,
  guard: v => `받는 공격 피해 −${v}%`,
  guardFirst: v => `매 턴 처음 받는 공격 피해 −${v}%`,
  guardLow: v => `체력이 시작 체력의 30% 이하면 받는 공격 피해 −${v}%`,
  bleedGuard: v => `받는 출혈 피해 −${v}%`,
  skill: v => `내 기술 효과 +${v}% (추가 카드 · 즉시 회복 · 공격)`,
  exp: v => `짝으로 얻는 경험치 +${v}%`,
  divIgnore: v => `내게 걸린 효과 감소(÷N)를 ${v}% 무시`,
  healCut: v => `공격하면 상대 회복 효율 −${v}% (1턴)`,
  healCutBleed: v => `출혈 중인 상대를 공격하면 회복 효율 −${v}% (1턴)`,
  pierce: v => `상대의 피해 감소를 ${v}% 무시`,
  shieldPierce: v => `상대 보호막을 ${v}% 무시`,
  evade: v => `나를 노리는 기술을 ${v}% 확률로 회피`,
  procPct: v => `추가 발동 확률 +${v}%`,
  procAmt: v => `추가 발동량 ${v}%`,
  healShield: v => `즉시 회복량의 ${v}%를 보호막으로`,
  regenShield: v => `지속 회복량의 ${v}%를 보호막으로`,
  reflectPct: v => `반사 확률 +${v}%`,
  reflectAmt: v => `반사량 ${v}%`,
  cdProc: v => `기술을 쓴 뒤 ${v}% 확률로 그 카드 쿨타임 −1`,
  expProcPct: v => `경험치 발동 확률 +${v}%`,
  expProcAmt: v => `경험치 발동량 +${v}`,
};

/** 효과 하나의 문구 */
export function acornEffectText(e: AcornEffect): string {
  switch (e.k) {
    case 'stat': return STAT_TEXT[e.stat](e.v);
    case 'proc': return `기술을 쓰면 ${e.pct}% 확률로 효과의 ${e.amt}% 추가 발동 (턴당 1회)`;
    case 'reflect': return `공격을 받으면 ${e.pct}% 확률로 받은 피해의 ${e.amt}% 반사 (턴당 1회)`;
    case 'expProc': return `기술을 쓰면 ${e.pct}% 확률로 그 카드 경험치 +${e.amount} (턴당 1회)`;
    case 'exp': return `무작위 기술 카드 ${e.cards >= 4 ? '모두' : `${e.cards}장`} 경험치 +${e.amount}${e.others ? ` · 나머지 카드 +${e.others}` : ''}`;
    case 'expT': return `무작위 기술 카드 ${e.cards}장에 한 레벨 경험치의 ${e.pct}%`;
    case 'expLow': return `가장 낮은 레벨 카드 경험치 +${e.amount} · 나머지 +${e.others}`;
    case 'draws': return e.times > 1 ? `다음 장소 ${e.times}번 동안 카드 +${e.n}장` : `다음 장소에서 카드 +${e.n}장`;
    case 'cd': return `쿨타임 중인 ${e.cards >= 4 ? '카드 모두' : `무작위 카드 ${e.cards}장`} 쿨타임 ${e.by >= 99 ? '초기화' : `−${e.by}턴`}`;
    case 'heal': return `즉시 체력 +시작 체력의 ${e.pct}%`;
    case 'shield': return `보호막 +시작 체력의 ${e.pct}%`;
    case 'cleanse': return `부정 효과 ${e.n}개 제거`;
    case 'cleanseTurns': return `${e.only === 'bleed' ? '출혈' : '부정 효과 하나'}의 남은 턴 −${e.by}`;
    case 'purgeMult': return '모든 상대의 쌓아 둔 배율 제거';
    case 'boost': return `다음 기술 효과 +${e.pct}%${e.ignoreDiv ? ' · 효과 감소 무시' : ''} (1회)`;
    case 'ward': return `다음에 받는 특허랑이 공격 피해 −${e.pct}% (1회)`;
    case 'bleedBlock': return `출혈 피해 ${e.n}번 무효`;
    case 'survive': return `체력이 처음 0이 될 때 1로 버티고 시작 체력의 ${e.pct}% 회복 (판에 1회)`;
    case 'lowHeal': return `체력이 시작 체력의 30% 이하가 되면 ${e.pct}% 회복 (판에 1회)`;
    case 'periodicExp': return `${e.every}턴마다 무작위 카드 경험치 +${e.amount} (${e.times}회)`;
    case 'periodicCleanse': return `${e.every}턴마다 부정 효과 하나 제거 (${e.times}회)`;
  }
}

/** 카드 문구 — 효과 줄 */
export function acornCardLines(id: string): string[] {
  return acornEffectsOf(id).map(acornEffectText);
}

/** 카드의 이름과 계열 · 단계 표시 */
export const ACORN_FAMILY_NAME: Record<AcornFamily, string> = {
  sheep: '실용신양', rabbit: '상표토끼', mermaid: '디자인어', tiger: '특허랑이', diamond: '다이아 도토리',
};

/** 화면 표시용 — 이 카드의 테두리 · 홀로 등급(다이아는 'diamond') */
export function acornSkinOf(id: string, tier: AcornTier): 'bronze' | 'silver' | 'gold' | 'rainbow' | 'diamond' {
  return acornCard(id)?.family === 'diamond' ? 'diamond' : ACORN_TIER_SKIN[tier];
}

/** 경험치 이월 계산 — 짝 경험치 gain에 % 보너스를 얹고 소수점은 다음으로 넘긴다(엔진만 쓴다) */
export function acornExpBonus(side: AcornSide | undefined, gain: number): number {
  if (!side || gain <= 0) return 0;
  const pct = Math.min(ACORN_CAPS.exp, acornStatsOf(side).exp);
  if (pct <= 0) return 0;
  const raw = (gain * pct) / 100 + side.expCarry;
  const whole = Math.floor(raw);
  side.expCarry = raw - whole;
  return whole;
}

/** 한 레벨 경험치의 pct% (반올림, 최소 1) */
export function acornLevelExp(animal: Animal, pct: number): number {
  return Math.max(1, Math.round((THRESHOLDS[animal] * pct) / 100));
}
