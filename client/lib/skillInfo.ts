// 행동 관련 표시용 상수·문구 — SkillChoiceBar와 ScorePanel(호버 툴팁)이 함께 사용한다.
import type { Animal } from 'shared';
import {
  ENHANCE_BLEED_MAX_TURNS,
  ENHANCE_BLEED_TICK,
  ENHANCE_DIVISOR_MAX_TURNS,
  ENHANCE_MERMAID_STACK,
  ENHANCE_MERMAID_STACK_MULTIPLY_FROM,
  ENHANCE_REGEN_MAX_TURNS,
  ENHANCE_REGEN_TICK,
  ENHANCE_STACK_MAX,
  enhanceCooldown,
  enhanceMermaidDivide,
  enhanceMermaidDivideTurns,
  enhanceMermaidEvadePct,
  enhanceMermaidOppDivide,
  enhanceRabbitCleanse,
  enhanceRabbitRegenStack,
  enhanceRabbitRegenTurns,
  enhanceSheepCooldownCards,
  enhanceSheepCooldownCut,
  enhanceSheepExp,
  enhanceSheepExpStack,
  enhanceTigerBleedStack,
  enhanceTigerBleedTurns,
  enhanceTigerHealCut,
  enhanceTigerPurges,
  enhanceValue,
} from 'shared';

export const SKILL_TITLE: Record<Animal, string> = {
  sheep: '실용신양',
  rabbit: '상표토끼',
  mermaid: '디자인어',
  tiger: '특허랑이',
};

export const SKILL_COLOR: Record<Animal, string> = {
  sheep: '#84cc16',
  rabbit: '#ec4899',
  mermaid: '#3b82f6',
  tiger: '#f97316',
};

export interface SkillDescription {
  effect: string;      // 2줄: "OO 레벨(N)만큼" + 실제 효과 문장. \n으로 줄바꿈된다.
  catchphrase: string; // 그 지식재산권을 상징하는 한 줄 — 따옴표는 렌더링하는 쪽에서 씌운다.
}

// 스킬 선택 패널 본문 — 효과 설명 2줄, 빈 줄, 그 아래 동물 타이틀과 같은 색으로
// 따옴표를 씌운 캐치프레이즈 순서로 보여준다(렌더링은 SkillChoiceBar 참조).
export function describeSkill(animal: Animal, level: number): SkillDescription {
  switch (animal) {
    case 'sheep':
      return { effect: `양 레벨(${level})만큼\n동물을 더 뽑아 기회를 선점합니다.`, catchphrase: '빠르게 등록해 실리를 챙기는 내 권리!' };
    case 'rabbit':
      return { effect: `토끼 레벨(${level})만큼\n체력이 상승합니다.`, catchphrase: '점점 더 브랜드 가치가 더해진다!' };
    case 'mermaid':
      return { effect: `인어 레벨(${level})만큼 (중첩가능)\n내 다음 행동이 증폭됩니다.`, catchphrase: '보기 좋은 떡이 먹기도 좋다!' };
    case 'tiger':
      return { effect: `호랑이 레벨(${level})만큼\n상대 체력을 강탈해옵니다.`, catchphrase: '독점적 실시를 통해 상대를 억제한다!' };
  }
}

/**
 * 카드 강화 판의 기술 카드 본문 — 이 레벨의 효과(배율 곱하기 전)와 쿨타임. 3줄째가 쿨타임이다(5차 표 — 2026-10-30).
 * 캐치프레이즈는 일반 판과 같다. 줄바꿈은 여기서 정한 그대로 그려진다(SkillChoiceBar — white-space: pre).
 * Lv.6 · Lv.Max부터 붙는 효과는 앞 두 줄에 눌러 담는다 — 카드 높이에 3줄(효과 2 + 쿨타임 1)까지만 들어간다(길면 글자가 작아진다).
 */
export function describeEnhanceSkill(animal: Animal, level: number): SkillDescription {
  const v = enhanceValue(animal, level);
  const cd = enhanceCooldown(animal, level);
  const cdLine = cd === 0 ? '쿨타임 없음' : `쿨타임 ${cd}턴`;
  const base = describeSkill(animal, level);
  switch (animal) {
    case 'sheep': {
      const exp = enhanceSheepExp(level) * enhanceSheepExpStack(level);
      if (enhanceSheepCooldownCut(level) > 0) {
        return { ...base, effect: `카드 +${v}장, 무작위 경험치 +${exp},\n무작위 쿨타임 ${cooldownCutText(level)}\n${cdLine}` };
      }
      return { ...base, effect: `다음 턴 카드 +${v}장,\n무작위 카드 경험치 +${exp}\n${cdLine}` };
    }
    case 'rabbit': {
      const regen = enhanceRabbitRegenTurns(level);
      const stack = enhanceRabbitRegenStack(level);
      if (stack > 0) {
        return { ...base, effect: `체력 +${v}, 지속 회복 +${regen}턴, 중첩 +${stack},\n부정 효과 ${cutText(enhanceRabbitCleanse(level), '정화')}\n${cdLine}` };
      }
      return { ...base, effect: `즉시 내 체력 +${v},\n지속 회복 +${regen}턴(턴당 +${ENHANCE_REGEN_TICK.low})\n${cdLine}` };
    }
    case 'mermaid': {
      const stackText = mermaidStackText(level);
      // 상대 배율 나누기가 붙는 레벨(Lv.6+)부터 둘째 줄에 상대에게 거는 것을 쓴다 — "곱하기가 시작되는 레벨"과는 따로 본다(6차 표는 곱하는 레벨이 없다)
      if (enhanceMermaidOppDivide(level) <= 1) return { ...base, effect: `다음 기술의 효과 ×${v}\n(겹쳐 쓰면 ${stackText})\n${cdLine}` };
      const divide = enhanceMermaidDivide(level);
      const evade = enhanceMermaidEvadePct(level);
      if (divide > 1) {
        return {
          ...base,
          effect: `다음 기술 ×${v} (겹치면 ${stackText}), ${oppMultiplierText(level)},\n상대 효과 ÷${divide}(${enhanceMermaidDivideTurns(level)}턴), 회피 ${evade}%\n${cdLine}`,
        };
      }
      return { ...base, effect: `다음 기술 ×${v} (겹치면 ${stackText}),\n${oppMultiplierText(level)}(1턴)\n${cdLine}` };
    }
    case 'tiger': {
      const bleed = enhanceTigerBleedTurns(level);
      const stack = enhanceTigerBleedStack(level);
      const cut = enhanceTigerHealCut(level);
      if (enhanceTigerPurges(level)) {
        return { ...base, effect: `상대 −${v}, 출혈 +${bleed}턴, 계수 +${stack}, ${cut >= 100 ? '회복 금지' : `회복 −${cut}%`},\n상대의 이로운 효과 모두 제거\n${cdLine}` };
      }
      if (cut > 0) return { ...base, effect: `상대 −${v}, 출혈 +${bleed}턴, 계수 +${stack},\n상대 회복 −${cut}%(1턴)\n${cdLine}` };
      return { ...base, effect: `상대 체력 −${v},\n출혈 +${bleed}턴(턴당 −${ENHANCE_BLEED_TICK.low})\n${cdLine}` };
    }
  }
}

/** 남은 턴 줄이기 문구 — 표의 Infinity는 "초기화"·"정화" */
function cutText(turns: number, all: string): string {
  return Number.isFinite(turns) ? `−${turns}턴` : all;
}

/** 실용신양의 쿨타임 감소 문구 — "−2턴" · Max "초기화(2장)" */
function cooldownCutText(level: number): string {
  const cards = enhanceSheepCooldownCards(level);
  return `${cutText(enhanceSheepCooldownCut(level), '초기화')}${cards > 1 ? `(${cards}장)` : ''}`;
}

/** 디자인어를 겹쳐 쓸 때 배율이 커지는 양 — "+N"(더하기) · "×N"(ENHANCE_MERMAID_STACK_MULTIPLY_FROM부터 곱하기) */
function mermaidStackText(level: number): string {
  const stack = ENHANCE_MERMAID_STACK[level - 1];
  return `${level >= ENHANCE_MERMAID_STACK_MULTIPLY_FROM ? '×' : '+'}${stack}`;
}

/** 디자인어 Lv.6+의 상대 배율 문구 — "상대 배율 ÷N" · Max "상대 배율 제거" */
function oppMultiplierText(level: number): string {
  const div = enhanceMermaidOppDivide(level);
  return Number.isFinite(div) ? `상대 배율 ÷${div}` : '상대 배율 제거';
}

/** 카드 강화 판의 호버 툴팁 한 줄 */
export function describeEnhanceSkillShort(animal: Animal, level: number): string {
  const v = enhanceValue(animal, level);
  const cd = enhanceCooldown(animal, level);
  const cdText = cd === 0 ? '' : ` (쿨타임 ${cd}턴)`;
  switch (animal) {
    case 'sheep': {
      const stack = enhanceSheepExpStack(level);
      const exp = enhanceSheepExp(level) * stack;
      const cdCut = enhanceSheepCooldownCut(level) > 0 ? `, 다른 카드 쿨타임 ${cooldownCutText(level)}` : '';
      return `다음 턴에 카드를 ${v}장 더 뽑습니다(배율은 장수에만), 무작위 카드 경험치 +${exp}${stack > 1 ? `(중첩 ×${stack})` : ''}${cdCut}.${cdText}`;
    }
    case 'rabbit': {
      const stack = enhanceRabbitRegenStack(level);
      const cleanse = enhanceRabbitCleanse(level);
      const tick = stack > 0 ? `턴당 ${ENHANCE_REGEN_TICK.high} × 중첩` : `턴당 +${ENHANCE_REGEN_TICK.low}`;
      return `체력이 ${v}만큼 오릅니다, 지속 회복 +${enhanceRabbitRegenTurns(level)}턴(${tick}, 최대 ${ENHANCE_REGEN_MAX_TURNS}턴)${stack > 0 ? `, 회복 중첩 +${stack}(최대 ${ENHANCE_STACK_MAX})` : ''}${cleanse > 0 ? `, 나에게 걸린 부정한 효과 하나 ${cutText(cleanse, '정화')}` : ''}.${cdText}`;
    }
    case 'mermaid': {
      const divide = enhanceMermaidDivide(level);
      const evade = enhanceMermaidEvadePct(level);
      return `다음 기술의 효과가 ${v}배가 됩니다(겹쳐 쓰면 ${mermaidStackText(level)})${enhanceMermaidOppDivide(level) > 1 ? `, ${oppMultiplierText(level)}` : ''}${divide > 1 ? `, 상대 기술 효과 ÷${divide}(${enhanceMermaidDivideTurns(level)}턴, 최대 ${ENHANCE_DIVISOR_MAX_TURNS}턴)` : ''}${evade > 0 ? `, 내 다음 차례까지 상대 기술을 ${evade}% 확률로 회피` : ''}.${cdText}`;
    }
    case 'tiger': {
      const stack = enhanceTigerBleedStack(level);
      const cut = enhanceTigerHealCut(level);
      const tick = stack > 0 ? `턴당 −${ENHANCE_BLEED_TICK.high} × (1 + ${ENHANCE_BLEED_TICK.rate} × 계수)` : `턴당 −${ENHANCE_BLEED_TICK.low}`;
      return `상대 체력을 ${v}만큼 깎습니다, 출혈 +${enhanceTigerBleedTurns(level)}턴(${tick}, 최대 ${ENHANCE_BLEED_MAX_TURNS}턴)${stack > 0 ? `, 출혈 계수 +${stack}(최대 ${ENHANCE_STACK_MAX})` : ''}${cut > 0 ? `, 상대 회복 효율 −${cut}%(다음 1턴)` : ''}${enhanceTigerPurges(level) ? ', 상대의 이로운 효과 모두 제거' : ''}.${cdText}`;
    }
  }
}

// 팀 패널 호버 툴팁용 — 한 줄로 압축한 요약(캐치프레이즈 없이 효과만).
export function describeSkillShort(animal: Animal, level: number): string {
  switch (animal) {
    case 'sheep':
      return `${level}만큼 카드를 더 뽑습니다.`;
    case 'rabbit':
      return `${level}만큼 체력을 획득합니다.`;
    case 'mermaid':
      return `${level}만큼 다음 행동이 증폭됩니다. (중첩가능)`;
    case 'tiger':
      return `${level}만큼 체력을 강탈해옵니다.`;
  }
}
