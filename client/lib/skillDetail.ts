// 기술 카드의 "지금 고르면 실제로 얼마인가" — PC의 기술 카드 툴팁(SkillChoiceBar의 SkillTooltip)과 모바일 카드 상세 창(StatusSheet)이 함께 쓴다
// (2026-11-02 요청: 특허랑이면 지금 들어가는 피해, 출혈이면 턴당 깎이는 양을 쓰고, 그 옆 괄호에 배율이 어떻게 들었는지 풀어 쓴다).
// 숫자는 모두 previewSkill(lib/skills.ts — 서버 엔진과 같은 공식)에서 온다. 여기서는 문장으로만 옮긴다.
import type { Animal, ClientGameState, SideId } from 'shared';
import {
  acornStats,
  enhanceRabbitShieldPct,
  ENHANCE_BLEED_MAX_TURNS,
  ENHANCE_DIVISOR_MAX_TURNS,
  ENHANCE_MERMAID_STACK,
  ENHANCE_REGEN_MAX_TURNS,
  enhanceCooldown,
  enhanceSheepExp,
  enhanceAmount,
  enhanceValue,
  opponentsOf,
} from 'shared';
import { cooldownOf, cooldownShownOf, overMultiplierOf, previewSkill } from './skills';

export interface SkillDetailLine {
  /** 무엇 — "공격", "출혈" … */
  label: string;
  /** 지금 고르면 실제로 드는 값 — "상대 체력 −176" */
  value: string;
  /** 그 값이 어떻게 나왔는지 — "기본 44 × 배율 ×4" (괄호는 그리는 쪽이 씌운다) */
  note?: string;
}

/**
 * 산출식 — 실제로 든 수치만 이어 쓴다(2026-11-02 정정: "기본 44 × 배율 ×2"가 아니라 "44×2"). 기본값 × 디자인어 배율 × Lv.Max 별도 배수
 * ÷ 상대가 건 나눗셈 × 회복 효율(1 − 감소%). 곱하거나 나눌 것이 하나도 없으면 식이 값과 같아 쓰지 않는다(undefined).
 */
function multNote(base: number, mult: number, over: number, divisor: number, healCutPct = 0, acorn = 1, attack = 0): string {
  // 값마다 무엇인지 괄호로 붙인다(2026-11-02 요청 — "44(기본)×2(배율)")
  let s = `${base}(기본)`;
  if (mult > 1) s += `×${mult}(배율)`;
  if (over > 1) s += `×${over}(Max 배수)`;
  if (acorn > 1) s += `×${Math.round(acorn * 100) / 100}(도토리)`;
  if (attack > 0) s += `×${Math.round((1 + attack / 100) * 100) / 100}(도토리 공격)`;
  if (divisor > 1) s += `÷${Math.round(divisor * 100) / 100}(상대 디자인어)`;
  if (healCutPct > 0) s += `×${Math.round((1 - Math.min(100, healCutPct) / 100) * 100) / 100}(회복 감소)`;
  return s;
}

/**
 * 이 편의 이 기술을 지금 고르면 드는 것들 — 한 줄에 하나씩. gameState는 화면상 값(withDisplayedExp · withDisplayedTeams)을 넣는다.
 * 레벨이 0(일반 판에서 아직 못 쓰는 카드)이면 빈 배열.
 */
export function skillDetailLines(gameState: ClientGameState, team: SideId, animal: Animal): SkillDetailLine[] {
  const p = previewSkill(gameState, team, animal);
  if (p.level <= 0) return [];
  const me = gameState.teams[team];
  const mult = me?.pendingMultiplier ?? 1;
  const lines: SkillDetailLine[] = [];

  if (!gameState.enhance) {
    // 일반 판 — 효과 = 레벨 × 배율(디자인어). 특허랑이는 상대가 가진 만큼만 빼앗는다.
    const note = `${p.level}(레벨)${mult > 1 ? `×${mult}(배율)` : ''}`;
    if (animal === 'sheep') lines.push({ label: '추가 뽑기', value: `다음 턴 카드 +${p.extraDraws}회`, note });
    else if (animal === 'rabbit') lines.push({ label: '회복', value: `내 체력 +${p.myHpDelta}`, note });
    else if (animal === 'tiger') {
      lines.push({ label: '강탈', value: `상대 체력 ${p.oppHpIsMax ? '최대 ' : ''}${p.oppHpDelta} · 내 체력 +${p.myHpDelta}`, note });
    } else {
      lines.push({ label: '배율', value: `다음 행동 ×${mult} → ×${p.multiplierAfter}`, note: `${mult}(지금 배율)+${p.level}(레벨)` });
    }
    return lines;
  }

  // 카드 강화 판 — 배율(디자인어 · Lv.Max 별도 배수)과 상대 디자인어의 ÷N은 실용신양의 장수 · 상표토끼의 즉시 회복 · 특허랑이의 공격력에만 든다
  const level = p.level;
  const base = enhanceValue(animal, level);
  const over = animal === 'mermaid' ? 1 : overMultiplierOf(gameState, team, animal);
  const divisor = p.divisor ?? 1;
  const foes = opponentsOf(gameState, team);
  const soleFoe = foes.length === 1 ? foes[0] : undefined;
  const enh = gameState.enhance;

  if (animal === 'sheep') {
    lines.push({ label: '추가 카드', value: `다음 턴 카드 +${p.extraDraws}장`, note: multNote(base, mult, over, p.divisorAfter ?? divisor, 0, p.acornFactor ?? 1) });
    const stack = p.randomExpStack ?? 1;
    lines.push({
      label: '경험치',
      value: `무작위 카드 하나 +${p.randomExp ?? 0}`,
      note: `${enhanceSheepExp(level)}(기본)${stack > 1 ? `×${stack}(중첩)` : ''}`,
    });
    if (p.cooldownCut) {
      const cards = (p.cooldownCards ?? 1) > 1 ? `${p.cooldownCards}장` : '1장';
      lines.push({ label: '쿨타임', value: Number.isFinite(p.cooldownCut) ? `다른 카드 쿨타임 −${p.cooldownCut}턴` : '다른 카드 쿨타임 초기화', note: `무작위 ${cards}` });
    }
  } else if (animal === 'rabbit') {
    const cut = p.healCut ?? 0;
    lines.push({
      label: '즉시 회복',
      value: `내 체력 +${p.myHpDelta}`,
      note: multNote(base, mult, over, p.divisorAfter ?? divisor, cut, p.acornFactor ?? 1),
    });
    lines.push({
      label: '보호막',
      value: `+${p.shieldAdd ?? 0}`,
      note: `즉시 회복의 ${enhanceRabbitShieldPct(level)}%${acornStats(gameState, team).healShield ? ` + 도토리 ${acornStats(gameState, team).healShield}%` : ''}`,
    });
    const had = enh.regen?.[team];
    const turnsNow = had?.turns ?? 0;
    lines.push({
      label: '지속 회복',
      value: p.regenTurns ? `턴당 +${p.regenTick} · +${p.regenTurns}턴(남은 ${Math.min(ENHANCE_REGEN_MAX_TURNS, turnsNow + p.regenTurns)}턴)` : `턴당 +${p.regenTick} · 이미 최대 ${ENHANCE_REGEN_MAX_TURNS}턴`,
      note: '즉시 회복(회복 감소 전)의 50%',
    });
    if (p.cleanse) lines.push({ label: '정화', value: Number.isFinite(p.cleanse) ? `부정 효과 하나 −${p.cleanse}턴` : '부정 효과 모두 정화', note: '출혈 · 효과 감소 중 무작위' });
  } else if (animal === 'mermaid') {
    const stack = ENHANCE_MERMAID_STACK[level - 1];
    lines.push({
      label: '다음 기술 배율',
      value: `×${mult} → ×${p.multiplierAfter}`,
      // 겹치면 걸린 배율 + 증가량(새로 거는 값보다 작아지지는 않는다 — enhanceMermaidAfter)
      note: mult > 1 && p.multiplierAfter === mult + stack ? `${mult}(걸린 배율)+${stack}(겹치기)` : `${base}(기본)`,
    });
    if (p.oppMultiplierDivide && p.oppMultiplierDivide > 1) {
      const foeMult = soleFoe ? gameState.teams[soleFoe]?.pendingMultiplier ?? 1 : null;
      const after = foeMult === null ? null : Number.isFinite(p.oppMultiplierDivide) ? Math.max(1, Math.round(foeMult / p.oppMultiplierDivide)) : 1;
      lines.push({
        label: '상대 배율',
        value: Number.isFinite(p.oppMultiplierDivide) ? `÷${p.oppMultiplierDivide}${foeMult !== null ? ` (×${foeMult} → ×${after})` : ''}` : `제거${foeMult !== null ? ` (×${foeMult} → ×1)` : ''}`,
        note: foeMult !== null && Number.isFinite(p.oppMultiplierDivide) ? `${foeMult}(상대 배율)÷${p.oppMultiplierDivide}(나눗셈)` : undefined,
      });
    }
    if (p.oppDivisor && p.oppDivisor > 1) lines.push({ label: '상대 효과', value: `÷${p.oppDivisor} · ${p.oppDivisorTurns}턴`, note: `상대가 고르는 기술의 효과를 나눈다(최대 ${ENHANCE_DIVISOR_MAX_TURNS}턴)` });
    if (p.evadePct) lines.push({ label: '회피', value: `${p.evadePct}%`, note: '내 다음 차례까지, 나를 노리는 기술마다' });
  } else {
    const target = soleFoe ? '상대 체력' : '대상 체력';
    lines.push({
      label: '공격',
      value: `${target} ${p.oppHpIsMax ? '최대 ' : ''}−${Math.abs(p.oppHpDelta)}`,
      note: tigerNote(multNote(base, mult, over, p.divisorAfter ?? divisor, 0, p.acornFactor ?? 1, p.acornAttack ?? 0), Math.round(enhanceAmount(base, mult * over * (p.acornFactor ?? 1), p.divisorAfter ?? divisor) * (1 + (p.acornAttack ?? 0) / 100)), Math.abs(p.oppHpDelta)),
    });
    const foeBleed = soleFoe ? enh.bleed?.[soleFoe] : undefined;
    const turnsNow = foeBleed?.turns ?? 0;
    lines.push({
      label: '출혈',
      value: p.bleedTurns ? `턴당 −${p.bleedTick} · +${p.bleedTurns}턴${soleFoe ? `(남은 ${Math.min(ENHANCE_BLEED_MAX_TURNS, turnsNow + p.bleedTurns)}턴)` : ''}` : `턴당 −${p.bleedTick} · 이미 최대 ${ENHANCE_BLEED_MAX_TURNS}턴`,
      note: '공격력의 50%',
    });
    if (p.oppHealCut) lines.push({ label: '회복 감소', value: p.oppHealCut >= 100 ? '상대 회복 금지' : `상대 회복 −${p.oppHealCut}%`, note: '상대의 다음 1턴' });
    if (p.purge) lines.push({ label: '정화 공격', value: '상대의 이로운 효과 모두 제거', note: '지속 회복 · 회피 · 배율' });
  }

  // 쿨타임 — 지금 남은 것 · 쓰면 걸리는 것
  const cdNow = cooldownOf(gameState, team, animal);
  const cd = enhanceCooldown(animal, level);
  lines.push({
    label: '쿨타임',
    value: cdNow > 0 ? `${cooldownShownOf(gameState, team, animal)}턴 남음` : cd === 0 ? '없음' : `쓰면 ${cd}턴`,
  });
  return lines;
}

/** 특허랑이 — 상대가 가진 만큼만 깎이면(자른 값) 식 뒤에 "→ 상대 체력 N까지"를 붙인다 */
function tigerNote(formula: string | undefined, raw: number, dealt: number): string | undefined {
  if (dealt < raw) return `${formula ?? raw} → ${dealt}(상대 남은 체력)까지`;
  return formula;
}
