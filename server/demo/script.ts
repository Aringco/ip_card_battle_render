import type { Animal, CardNum, Place } from 'shared';

/**
 * 시연 대본 — 무엇이 어떤 순서로 일어나는지를 **데이터로만** 적어 둔 곳.
 *
 * 시연에서는 뽑히는 카드를 난수가 아니라 이 대본이 정한다. 그래야 "이 장소에서는
 * 이 동물들이 나옵니다"를 실제로 보여줄 수 있다(무작위로는 안 나온 채 끝날 수 있다).
 *
 * ⚠️ **숫자를 고칠 때는 `__tests__/demo.test.ts`의 "대본 검산"을 함께 볼 것.**
 *    이 대본은 눈으로 봐서는 알 수 없는 조건 네 가지를 동시에 만족해야 한다
 *    (아래 CHAPTER1_RULES). 검산 테스트가 그 넷을 전부 지키고 있으므로, 숫자를
 *    잘못 고치면 화면이 아니라 테스트가 먼저 알려준다.
 *
 * 시나리오 전문은 저장소 루트의 `DEMO_MODE.md`에 있다.
 */

export interface DemoDrawStep {
  kind: 'draw';
  /** 이번에 열어 줄 장소 — 관람객은 여기만 누를 수 있다 */
  place: Place;
  /** 그 클릭으로 나올 카드 */
  animal: Animal;
  num: CardNum;
  /** 누르기 **전에** 띄울 설명 */
  caption: string;
  /**
   * 이 뽑기로 짝이 맞았을 때 멈춤 화면에 띄울 설명.
   *
   * ⚠️ **"언제 멈추는가"는 이 값이 정하지 않는다.** 멈춤은 실제로 정산이 일어났는지
   *    (짝수가 됐는지)로만 결정된다 — 그래야 숫자를 고쳐도 멈추는 자리가 저절로
   *    따라온다. 여기 문구를 적어 두고 짝이 안 맞으면 그냥 안 쓰일 뿐이다.
   */
  settleCaption?: string;
}

export type DemoStep = DemoDrawStep;

/**
 * 1장 — 각 장소에서 어떤 동물이 나오는가.
 *
 * 열 번의 클릭으로 네 장소의 가능한 동물을 **빠짐없이** 보여주고, 그 사이 정산이
 * 네 번 일어나 네 동물의 기술이 전부 열린 채로 끝난다(2장의 전제).
 */
export const CHAPTER_1: DemoDrawStep[] = [
  {
    kind: 'draw', place: 'forest_road', animal: 'tiger', num: 12,
    caption: '숲길을 눌러 보세요. 숲길에서는 상표토끼·실용신양·특허랑이가 나옵니다.',
  },
  {
    kind: 'draw', place: 'house', animal: 'rabbit', num: 8,
    caption: '오두막에서는 상표토끼와 실용신양이 나옵니다.',
  },
  {
    kind: 'draw', place: 'river_road', animal: 'mermaid', num: 11,
    caption: '강가에서는 디자인어·상표토끼·실용신양이 나옵니다. 특허랑이는 나오지 않아요.',
  },
  {
    kind: 'draw', place: 'forest_road', animal: 'sheep', num: 13,
    caption: '같은 숲길이라도 이번엔 다른 동물이 나옵니다.',
  },
  {
    kind: 'draw', place: 'house', animal: 'sheep', num: 7,
    caption: '오두막에서 실용신양을 한 장 더 뽑아 봅시다.',
    settleCaption: '실용신양이 두 장! 짝이 맞으면 그 동물 카드를 모두 가져갑니다.',
  },
  {
    kind: 'draw', place: 'river_road', animal: 'rabbit', num: 14,
    caption: '강가에서 상표토끼를 뽑으면 아까 오두막의 토끼와 짝이 됩니다.',
    settleCaption: '상표토끼도 짝이 맞았어요. 카드에 적힌 숫자가 그대로 경험치입니다.',
  },
  {
    kind: 'draw', place: 'dock', animal: 'mermaid', num: 9,
    caption: '부둣가에서는 디자인어와 특허랑이가 나옵니다.',
    settleCaption: '디자인어 짝 완성! 경험치가 20이면 디자인어 기술이 열립니다.',
  },
  {
    kind: 'draw', place: 'forest_road', animal: 'rabbit', num: 10,
    caption: '숲길의 마지막 동물, 상표토끼입니다.',
  },
  {
    kind: 'draw', place: 'river_road', animal: 'sheep', num: 12,
    caption: '강가의 마지막 동물, 실용신양입니다.',
  },
  {
    kind: 'draw', place: 'dock', animal: 'tiger', num: 10,
    caption: '마지막입니다. 부둣가에서 특허랑이를 뽑아 짝을 맞춰 봅시다.',
    settleCaption: '특허랑이까지 짝 완성! 이제 네 동물의 기술이 모두 열렸습니다.',
  },
];

/**
 * 1장 대본이 반드시 만족해야 하는 조건 — 테스트가 이 넷을 검산한다.
 *
 * 1. 네 장소의 **가능한 동물이 빠짐없이** 나온다(요구 1-1·1-5).
 * 2. **같은 장소를 연달아** 누르지 않는다. 직전 클릭 장소는 규칙상 막혀 있어
 *    (`state.lastPlace`) 그 클릭이 통째로 먹통이 되는데, 화면에는 아무 일도
 *    일어나지 않아 원인을 찾기 어렵다.
 * 3. 숫자가 **그 장소에서 실제로 나올 수 있는 범위** 안이다(3종 10~15 · 2종 5~10).
 *    벗어나면 "시연에서 본 카드가 실제 게임에는 없다"가 된다.
 * 4. 끝나면 **네 동물의 레벨이 모두 1 이상**이다(요구 2-1, 2장의 전제).
 */
export const CHAPTER1_RULES = '__tests__/demo.test.ts 의 "대본 검산" 참고';
