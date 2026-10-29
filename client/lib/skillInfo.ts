// 행동 관련 표시용 상수·문구 — SkillChoiceBar와 ScorePanel(호버 툴팁)이 함께 사용한다.
import type { Animal } from 'shared';
import {
  ENHANCE_MERMAID_STACK,
  enhanceCooldown,
  enhanceMermaidCut,
  enhanceMermaidDivide,
  enhanceMermaidDivideTurns,
  enhanceRabbitCleanse,
  enhanceRabbitRegenTurns,
  enhanceSheepCooldownCut,
  enhanceSheepExp,
  enhanceTigerBleedTurns,
  enhanceTigerHeal,
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
 * 카드 강화 판의 기술 카드 본문 — 이 레벨의 효과(배율 곱하기 전)와 쿨타임. 3줄째가 쿨타임이다.
 * 캐치프레이즈는 일반 판과 같다. 줄바꿈은 여기서 정한 그대로 그려진다(SkillChoiceBar — white-space: pre).
 * Lv.6 · Lv.9부터 붙는 효과는 앞 두 줄에 눌러 담는다 — 카드 높이에 3줄(효과 2 + 쿨타임 1)까지만 들어간다(길면 글자가 작아진다).
 */
export function describeEnhanceSkill(animal: Animal, level: number): SkillDescription {
  const v = enhanceValue(animal, level);
  const cd = enhanceCooldown(animal, level);
  const cdLine = cd === 0 ? '쿨타임 없음' : `쿨타임 ${cd}턴`;
  const base = describeSkill(animal, level);
  switch (animal) {
    case 'sheep': {
      const exp = enhanceSheepExp(level);
      const cut = enhanceSheepCooldownCut(level);
      if (cut > 0) {
        return { ...base, effect: `카드 +${v}장, 무작위 경험치 +${exp},\n무작위 쿨타임 ${cutText(cut, '초기화')}\n${cdLine}` };
      }
      return {
        ...base,
        effect: exp > 0
          ? `다음 턴 카드 +${v}장,\n무작위 카드 경험치 +${exp}\n${cdLine}`
          : `다음 턴에 카드를\n${v}장 더 뽑습니다.\n${cdLine}`,
      };
    }
    case 'rabbit': {
      const cleanse = enhanceRabbitCleanse(level);
      const regen = enhanceRabbitRegenTurns(level);
      if (regen > 0) {
        return { ...base, effect: `체력 +${v}, 부정 효과 ${cutText(cleanse, '정화')},\n지속 회복 +${regen}턴(턴당 +${v})\n${cdLine}` };
      }
      return {
        ...base,
        effect: cleanse > 0
          ? `즉시 내 체력 +${v},\n부정 효과 1개 −${cleanse}턴\n${cdLine}`
          : `즉시 내 체력이\n${v}만큼 오릅니다.\n${cdLine}`,
      };
    }
    case 'mermaid': {
      const cut = enhanceMermaidCut(level);
      const divide = enhanceMermaidDivide(level);
      const turns = enhanceMermaidDivideTurns(level);
      const stack = ENHANCE_MERMAID_STACK[level - 1];
      return {
        ...base,
        effect: cut > 0
          ? `다음 기술 ×${v} (겹치면 +${stack}),\n상대 배율 −${cut}${divide > 1 ? `, 효과 ÷${divide}(${turns}턴)` : ''}\n${cdLine}`
          : `다음 기술의 효과 ×${v}\n(겹쳐 쓰면 +${stack})\n${cdLine}`,
      };
    }
    case 'tiger': {
      const heal = enhanceTigerHeal(level);
      const bleed = enhanceTigerBleedTurns(level);
      if (bleed > 0) return { ...base, effect: `상대 −${v}, 내 체력 +${heal},\n출혈 +${bleed}턴(턴당 −${v})\n${cdLine}` };
      return {
        ...base,
        effect: heal > 0
          ? `상대 체력 −${v},\n내 체력 +${heal}\n${cdLine}`
          : `즉시 상대 체력을\n${v}만큼 깎습니다.\n${cdLine}`,
      };
    }
  }
}

/** 남은 턴 줄이기 문구 — 표의 Infinity는 "초기화"·"정화" */
function cutText(turns: number, all: string): string {
  return Number.isFinite(turns) ? `−${turns}턴` : all;
}

/** 카드 강화 판의 호버 툴팁 한 줄 */
export function describeEnhanceSkillShort(animal: Animal, level: number): string {
  const v = enhanceValue(animal, level);
  const cd = enhanceCooldown(animal, level);
  const cdText = cd === 0 ? '' : ` (쿨타임 ${cd}턴)`;
  switch (animal) {
    case 'sheep': {
      const exp = enhanceSheepExp(level);
      const cut = enhanceSheepCooldownCut(level);
      return `다음 턴에 카드를 ${v}장 더 뽑습니다${exp > 0 ? `, 무작위 카드 경험치 +${exp}` : ''}${cut > 0 ? `, 다른 카드 하나의 쿨타임 ${cutText(cut, '초기화')}` : ''}.${cdText}`;
    }
    case 'rabbit': {
      const cleanse = enhanceRabbitCleanse(level);
      const regen = enhanceRabbitRegenTurns(level);
      return `체력이 ${v}만큼 오릅니다${cleanse > 0 ? `, 나에게 걸린 부정한 효과 하나 ${cutText(cleanse, '정화')}` : ''}${regen > 0 ? `, 지속 회복 +${regen}턴(턴당 +${v}, 최대 10턴)` : ''}.${cdText}`;
    }
    case 'mermaid': {
      const cut = enhanceMermaidCut(level);
      const divide = enhanceMermaidDivide(level);
      const turns = enhanceMermaidDivideTurns(level);
      return `다음 기술의 효과가 ${v}배가 됩니다${cut > 0 ? `, 상대 배율 −${cut}` : ''}${divide > 1 ? `, 상대 기술 효과 ÷${divide}(${turns}턴)` : ''}.${cdText}`;
    }
    case 'tiger': {
      const heal = enhanceTigerHeal(level);
      const bleed = enhanceTigerBleedTurns(level);
      if (heal <= 0) return `상대 체력을 ${v}만큼 깎습니다.${cdText}`;
      return `상대 체력 −${v}, 내 체력 +${heal}${bleed > 0 ? `, 출혈 +${bleed}턴(턴당 −${v}, 최대 10턴)` : ''}${cdText}`;
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
