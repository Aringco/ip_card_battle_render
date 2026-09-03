// 행동 관련 표시용 상수·문구 — SkillChoiceBar와 ScorePanel(호버 툴팁)이 함께 사용한다.
import type { Animal } from 'shared';

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
