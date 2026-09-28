import type { Animal, CardNum, GameSettings, Place } from 'shared';

/**
 * 시연 대본 — 무엇이 어떤 순서로 일어나는지를 **데이터로만** 적어 둔 곳.
 *
 * 시연에서는 뽑히는 카드를 난수가 아니라 이 대본이 정한다. 그래야 "이 장소에서는
 * 이 동물들이 나옵니다"를 실제로 보여줄 수 있다(무작위로는 안 나온 채 끝날 수 있다).
 *
 * ⚠️ **숫자를 고칠 때는 `__tests__/demo.test.ts`의 "대본 검산"을 함께 볼 것.**
 *    이 대본은 눈으로 봐서는 알 수 없는 조건들을 동시에 만족해야 한다(아래 각 장의
 *    주석). 검산 테스트가 그것들을 전부 지키고 있으므로, 숫자를 잘못 고치면 화면이
 *    아니라 테스트가 먼저 알려준다.
 *
 * 시나리오 전문은 저장소 루트의 `DEMO_MODE.md`에 있다.
 */

/** 예약 뽑기(실용신양·도토리 축제)로 **저절로** 뽑히는 카드 — 관람객이 고르지 않는다. */
export interface DemoExtraCard {
  /** 그 카드가 어느 장소에서 나온 것으로 보일지(연출용) */
  place: Place;
  animal: Animal;
  num: CardNum;
}

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
  /**
   * 이 클릭 **직전에** 터지는 예약 뽑기의 카드들(실용신양으로 예약해 둔 몫).
   *
   * ⚠️ **장수가 그 시점의 예약 횟수와 정확히 같아야 한다.** 엔진은 예약 횟수만큼
   *    뽑고 그 수를 `bonusDraws` 이벤트로 알리는데, 대본이 그보다 적게·많게 적어
   *    두면 화면의 진행도 팝업("2장 중 1장")과 실제로 날아오는 카드 수가 어긋난다.
   *    그 수가 맞는지는 검산 테스트가 대본을 직접 굴려 확인한다.
   */
  extras?: DemoExtraCard[];
}

export interface DemoSkillStep {
  kind: 'skill';
  /** 이번에 열어 줄 기술 — 관람객은 이 칸만 누를 수 있다 */
  animal: Animal;
  /** 누르기 **전에** 띄울 설명 */
  caption: string;
}

export type DemoStep = DemoDrawStep | DemoSkillStep;

export interface DemoChapter {
  steps: DemoStep[];
  /** 이 장을 끝냈고 다음 장이 아직 없을 때 화면에 남길 문구 */
  doneCaption: string;
}

/**
 * 1장 — 각 장소에서 어떤 동물이 나오는가.
 *
 * 열 번의 클릭으로 네 장소의 가능한 동물을 **빠짐없이** 보여주고, 그 사이 정산이
 * 네 번 일어나 네 동물의 기술이 전부 열린 채로 끝난다(2장의 전제).
 *
 * 반드시 만족해야 하는 조건 넷 — 테스트가 검산한다.
 * 1. 네 장소의 **가능한 동물이 빠짐없이** 나온다(요구 1-1·1-5).
 * 2. **같은 장소를 연달아** 누르지 않는다. 직전 클릭 장소는 규칙상 막혀 있어
 *    (`state.lastPlace`) 그 클릭이 통째로 먹통이 되는데, 화면에는 아무 일도
 *    일어나지 않아 원인을 찾기 어렵다.
 * 3. 숫자가 **그 장소에서 실제로 나올 수 있는 범위** 안이다(3종 10~15 · 2종 5~10).
 *    벗어나면 "시연에서 본 카드가 실제 게임에는 없다"가 된다.
 * 4. 끝나면 **네 동물의 레벨이 모두 1 이상**이다(요구 2-1, 2장의 전제).
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
 * 2장 — 네 기술이 무엇을 하는가.
 *
 * 1장이 열어 준 레벨(양 2 · 토끼 2 · 인어 1 · 호랑이 1)을 그 자리에서 다 써 본다.
 * **턴을 넘기지 않으므로**(요구 2-2) 네 기술을 연달아 고르고, 마지막 장소 클릭이
 * 실용신양으로 예약해 둔 뽑기를 회수하며 3장으로 넘어가는 다리가 된다.
 *
 * ⚠️ **순서를 바꾸면 서로를 설명하지 못한다** — 테스트가 이 두 가지를 지킨다.
 *  · **디자인어가 맨 앞이어야 한다.** 배율은 다른 기술을 쓰는 순간 1로 초기화되므로,
 *    나중에 쓰면 아무것도 증폭하지 못한 채 끝난다("그래서 뭐?"가 된다).
 *  · **실용신양이 마지막 기술이어야 한다.** 효과가 *다음 뽑기에* 나타나므로, 먼저
 *    쓰면 2장 안에서 그 결과를 볼 기회가 없다.
 *
 * ⚠️ 여기서 쓰는 수치(강탈 2 · 회복 2)는 승리선·0 어디에도 닿지 않아야 한다 —
 *    2장은 턴을 넘기지 않아 `checkKnockout`이 **한 번도 돌지 않기** 때문이다.
 *    그래서 시연 방은 체력을 넉넉히 잡는다(아래 DEMO_SETTINGS).
 */
export const CHAPTER_2: DemoStep[] = [
  {
    kind: 'skill', animal: 'mermaid',
    caption: '디자인어를 먼저 씁니다 — 다음에 쓰는 기술의 배율을 키워 둡니다.',
  },
  {
    kind: 'skill', animal: 'tiger',
    caption: '이제 특허랑이. 방금 키운 배율이 곱해져 2만큼 강탈합니다.',
  },
  {
    kind: 'skill', animal: 'rabbit',
    caption: '상표토끼는 내 체력을 올립니다. 배율은 아까 쓰여 1로 돌아갔어요.',
  },
  {
    kind: 'skill', animal: 'sheep',
    caption: '실용신양은 다음 내 차례에 2번 더 뽑도록 예약해 둡니다.',
  },
  {
    // 예약 뽑기 회수 — 클릭한 카드보다 **예약분이 먼저** 날아온다(엔진과 같은 순서).
    // 보너스로 온 실용신양 13이 1장 끝에 남아 있던 실용신양 12와 짝이 되어, "보너스로
    // 뽑은 카드도 똑같이 쌓인다"가 정산으로 드러난다(클릭한 특허랑이는 짝이 안 맞는다).
    kind: 'draw', place: 'forest_road', animal: 'tiger', num: 12,
    caption: '숲길을 눌러 보세요. 예약해 둔 뽑기 2장이 먼저 쏟아집니다.',
    settleCaption: '보너스로 뽑은 카드도 똑같습니다 — 짝이 맞은 실용신양을 가져갑니다.',
    extras: [
      { place: 'river_road', animal: 'sheep', num: 13 },
      { place: 'dock', animal: 'mermaid', num: 6 },
    ],
  },
];

/** 시연의 장 목록 — 감독(`director.ts`)이 이 순서대로 진행한다. */
export const CHAPTERS: DemoChapter[] = [
  {
    steps: CHAPTER_1,
    doneCaption: '1장이 끝났습니다. 네 동물의 기술이 모두 열렸어요.',
  },
  {
    steps: CHAPTER_2,
    doneCaption: '2장이 끝났습니다. (3장 도토리 축제는 준비 중입니다)',
  },
];

/**
 * 시연 방의 규칙 프리셋 — 진행자가 로비에 무엇을 넣었든 이 값으로 덮어쓴다.
 *
 * ⚠️ **`clampSettings`를 통과시켜 쓴다**(`Room.addSoloPlayer`). 우회하는 길을 하나
 *    뚫으면 일반 방에도 같은 구멍이 남는다. 아래 값은 모두 `SETTINGS_LIMITS` 안이다.
 *
 * · `firstTeam: 'A'` — **진행자가 먼저 두어야 한다.** 'random'이 걸려 CPU가 선이 되면
 *   관람객의 첫 클릭이 "당신의 차례가 아닙니다"로 되돌아오고 시연이 그 자리에서 멈춘다.
 * · `targetScore: 20` — 2장은 턴을 넘기지 않아 `checkKnockout`이 돌지 않는다. 체력이
 *   승리선(=40)이나 0에 닿아도 게임이 끝나지 않고 화면만 이상해지므로, 2장의 ±2로는
 *   양쪽 끝 어디에도 닿을 수 없게 넉넉히 잡는다.
 * · `festivalTurn: 999` — 축제는 3장에서 감독이 직접 열어야 한다. 진행자가 로비에 1을
 *   넣어 두면 1·2장 도중에 도토리가 예약되는데, 감독은 그 예약을 소모하지 않아
 *   조용히 쌓인 채 남는다.
 */
export const DEMO_SETTINGS: Partial<GameSettings> = {
  firstTeam: 'A',
  targetScore: 20,
  festivalTurn: 999,
};
