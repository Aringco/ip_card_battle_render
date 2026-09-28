import type { Animal, CardNum, GameSettings, Place, Team } from 'shared';

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
  /**
   * 이 클릭 직전에 터지는 **도토리 축제** 예약 뽑기의 카드들(3장).
   *
   * 실용신양 몫(extras)과 따로 두는 이유는 나가는 이벤트가 다르기 때문이다 — 이쪽은
   * `festivalDraws`라서 화면이 양털이 아니라 도토리로 그린다. 순서는 엔진과 같다
   * (실용신양 → 도토리 → 클릭한 장소).
   *
   * ⚠️ **장수가 그 턴에 실제로 예약되는 횟수와 정확히 같아야 한다.** 그 횟수는 대본이
   *    고르는 값이 아니라 `festivalDrawInfoAt(state.turn, settings)`이 정하는 값이다 —
   *    어긋나면 도토리 진행도("4장 중 2장")와 실제로 날아오는 카드 수가 맞지 않는다.
   *    검산 테스트가 대본을 직접 굴려 두 수를 맞춰 본다.
   */
  festivalExtras?: DemoExtraCard[];
  /**
   * 이 클릭 **전에** 감독이 한 바퀴(내 턴 종료 → 상대 턴 종료)를 대신 돌린다(3장 전용).
   *
   * ⚠️ 축제 뽑기는 "턴이 바뀔 때 다음 팀에게 예약"되는 구조라(`advanceTurn`), 1·2장처럼
   *    턴을 붙잡아 두면 **아무 일도 일어나지 않는다.** 그렇다고 턴 넘김만 따로
   *    브로드캐스트하면 이벤트가 **하나도 없는** actionResult가 나가는데, 화면의 연출
   *    큐는 그 경우를 "최초 입장·재접속"으로 보고 진행 중이던 연출의 경험치 가림을
   *    즉시 걷어낸다(useAnimationQueue의 빈 이벤트 경로). 진행자가 정산 연출 도중에
   *    [계속]을 누르면 그 길로 들어가 숫자가 먼저 튄다. 그래서 턴 넘김을 **다음 클릭에
   *    얹어** 예약과 소모가 한 번의 액션으로 끝나게 한다.
   */
  advanceTurnFirst?: boolean;
}

export interface DemoSkillStep {
  kind: 'skill';
  /** 이번에 열어 줄 기술 — 관람객은 이 칸만 누를 수 있다 */
  animal: Animal;
  /** 누르기 **전에** 띄울 설명 */
  caption: string;
}

/**
 * 관람객이 [계속 ▶]을 눌러 **한 바퀴를 넘기는** 줄 — 3장의 축제 진입 전용.
 *
 * 턴 넘김을 클릭에 얹지 않고(위 advanceTurnFirst) 따로 둔 유일한 이유는 **순서**다.
 * 화면은 `festival` 이벤트를 그 액션의 뽑기 연출이 전부 끝난 뒤에 재생하므로
 * (useAnimationQueue), 진입을 클릭에 얹으면 도토리가 다 쏟아진 **다음에** "축제 시작!"
 * 배너가 뜬다 — 앞뒤가 뒤집힌다.
 */
export interface DemoTurnStep {
  kind: 'turn';
  caption: string;
  /**
   * 이 턴 넘김에서 축제를 연다.
   *
   * ⚠️ `state.festival = true`를 직접 세우면 `festival` 이벤트가 안 나가 배너가 뜨지
   *    않고 예약도 걸리지 않는다. 감독은 `settings.festivalTurn`을 **곧 도달할 턴**으로
   *    맞춰 두고 턴을 넘겨, 엔진이 스스로 진입하게 한다(DEMO_MODE.md 주의 10).
   */
  openFestival?: boolean;
}

/**
 * 4장 — 볼 장면을 고르는 줄. 화면에 버튼 셋이 뜨고, 고르면 그 장면의 대본으로 갈아탄다.
 *
 * 이 줄은 **소모되지 않는다** — 장면 하나가 끝나고 [4장으로 복귀]를 누르면 다시 여기로
 * 돌아온다. 그래야 관람객이 세 장면을 모두 볼 수 있다.
 */
export interface DemoMenuStep {
  kind: 'menu';
  caption: string;
}

/**
 * 4장 — **상대(컴퓨터)가 두는 수.** 관람객은 [계속 ▶]으로 넘기기만 한다.
 *
 * 관람객이 고르는 `skill` 줄과 나누는 이유는 둘이다 — 효과가 상대 팀에 적용돼야 하고,
 * 화면의 행동 선택 칸이 **살아나면 안 되기** 때문이다(내 차례가 아니다).
 */
export interface DemoEnemyStep {
  kind: 'enemy';
  animal: Animal;
  caption: string;
}

export type DemoStep = DemoDrawStep | DemoSkillStep | DemoTurnStep | DemoMenuStep | DemoEnemyStep;

/**
 * 4장의 장면 하나가 시작할 때 세우는 판.
 *
 * ⚠️ **모든 값이 절대값이다**(지금 값에서 더하는 것이 아니다). 장면을 몇 번이고 다시
 *    볼 수 있어야 하는데, 상대값이면 두 번째부터 판이 달라진다.
 */
export interface DemoSceneSetup {
  /** 두 팀의 체력 */
  hp: Record<Team, number>;
  /** 두 팀의 경험치 — 적지 않은 동물은 0이다 */
  exp: Record<Team, Partial<Record<Animal, number>>>;
  /** 누구 차례로 시작하는가 — 패배 장면만 'B'다(상대가 두는 장면이라) */
  activeTeam: Team;
}

export interface DemoScene {
  /** 화면이 되돌려 보내는 값 */
  key: string;
  /**
   * 버튼에 쓰는 이름 — **버튼에 나가는 것은 이것과 번호뿐이다.**
   * 무슨 장면인지는 진행자가 말로 하고, 설명은 아래 주석이 맡는다(protocol.ts 참고).
   */
  label: string;
  setup: DemoSceneSetup;
  steps: DemoStep[];
  /** 이 장면이 끝나면 이긴 팀 — 검산 테스트가 실제 결과와 견준다 */
  winner: Team;
}

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

/**
 * 3장 — 도토리 축제.
 *
 * 2장 마지막에 실용신양 예약 뽑기를 회수하며 "공짜 뽑기"를 이미 한 번 맛봤다. 그 흐름을
 * 그대로 이어 **축제는 그것이 매 턴 계속되는 것**임을 보여준다.
 *
 * 세 턴을 보여주는 이유 — **"또 오네"와 "더 늘었네"는 다른 이야기다.** 두 턴만 보여주면
 * 둘 중 하나는 포기해야 한다. 여기서는 2회 → 2회 → **4회** 순으로 가, 가운데 턴이
 * "한 번 터지고 끝나는 보너스가 아니다"를, 마지막 턴이 "k턴마다 한 단계씩 오른다"를
 * 각각 맡는다(DEMO_MODE.md §5의 1번 질문에 대한 답이다).
 *
 * ⚠️ **1·2장과 달리 턴을 넘긴다.** 축제 뽑기는 `advanceTurn`이 "다음 팀에게" 예약하는
 *    구조라, 턴을 붙잡아 두면 아무 일도 일어나지 않기 때문이다. 넘기면 상대(CPU)
 *    차례가 오는데, 감독은 그 차례를 **두지 않고 곧바로 되돌려준다**(한 번의 [계속]
 *    또는 한 번의 클릭이 두 번의 advanceTurn을 삼킨다). 그래서 3장 내내 화면의
 *    차례는 A팀에 머물러 있고 CPU는 한 수도 두지 않는다.
 *
 * ⚠️ **도토리 카드 장수는 대본이 고르는 값이 아니다** — 그 턴에 엔진이 예약하는 횟수와
 *    같아야 한다(2 · 2 · 4). 아래 DEMO_SETTINGS의 n·k와 함께 움직이므로 하나만 고치면
 *    검산 테스트가 걸린다.
 */
export const CHAPTER_3: DemoStep[] = [
  {
    kind: 'turn', openFestival: true,
    caption: '한 바퀴가 돌면 도토리 축제가 열립니다. [계속 ▶]을 눌러 주세요.',
  },
  {
    // 도토리로 온 디자인어가 2장 끝에 남아 있던 디자인어 6과 짝이 된다 — 클릭한
    // 상표토끼는 짝이 안 맞으므로, 정산이 일어난 이유가 보너스 카드임이 분명해진다.
    kind: 'draw', place: 'river_road', animal: 'rabbit', num: 13,
    caption: '축제가 열렸습니다. 강가를 누르면 도토리 2장이 먼저 쏟아집니다.',
    settleCaption: '도토리로 온 디자인어가 짝을 맞췄어요 — 보너스로 뽑은 카드도 똑같이 쌓입니다.',
    festivalExtras: [
      { place: 'dock', animal: 'mermaid', num: 8 },
      { place: 'house', animal: 'rabbit', num: 9 },
    ],
  },
  {
    // 두 번째 턴 — 횟수는 그대로 2회다. "또 왔다"가 이 턴의 전부이고, 그래서 자막도
    // 늘어난 것이 아니라 **계속된다는 것**을 말한다.
    kind: 'draw', place: 'dock', animal: 'mermaid', num: 9, advanceTurnFirst: true,
    caption: '다음 턴입니다. 부둣가를 눌러 보세요 — 도토리가 또 옵니다.',
    settleCaption: '특허랑이 짝 완성! 축제는 한 번 터지고 끝나는 보너스가 아니라 매 턴 계속됩니다.',
    festivalExtras: [
      { place: 'forest_road', animal: 'tiger', num: 11 },
      { place: 'house', animal: 'sheep', num: 7 },
    ],
  },
  {
    // 세 번째 턴 — 축제 시작 턴(2)에서 k=2턴이 지나 단계가 오른다. 4장이 한꺼번에
    // 쏟아지며 상표토끼 4장·실용신양 2장이 동시에 정산돼 "늘어났다"가 눈으로 보인다.
    kind: 'draw', place: 'forest_road', animal: 'tiger', num: 13, advanceTurnFirst: true,
    caption: '또 한 턴. 이번엔 도토리가 2회가 아니라 4회입니다 — 숲길을 눌러 보세요.',
    settleCaption: '두 종류가 한꺼번에! 2턴마다 도토리 횟수가 한 단계씩 올라갑니다.',
    festivalExtras: [
      { place: 'house', animal: 'rabbit', num: 10 },
      { place: 'river_road', animal: 'sheep', num: 12 },
      { place: 'dock', animal: 'mermaid', num: 7 },
      { place: 'river_road', animal: 'mermaid', num: 15 },
    ],
  },
];

/**
 * 4장 — 어떻게 이기고 어떻게 지는가.
 *
 * 앞의 세 장과 **구조가 다르다.** 줄을 차례로 따라가는 것이 아니라, 버튼 셋 중 하나를
 * 고르면 그 장면의 대본으로 갈아타고, 끝나면 결과 화면의 [4장으로 복귀]로 이 자리에
 * 되돌아온다 — 그래야 관람객이 세 결말을 **모두** 볼 수 있다.
 *
 * ⚠️ **승리 조건이 둘이라 승리 장면도 둘이다.** 상대 체력을 0으로 만들거나(특허랑이),
 *    내 체력을 `targetScore × 2`까지 채우거나(상표토끼). 하나만 보여주면 "때려야 이기는
 *    게임"으로 오해한다. 그리고 **져 보지 않으면** 체력을 지켜야 할 이유가 전달되지 않아
 *    패배 장면을 함께 둔다.
 *
 * ⚠️ **세 장면 모두 디자인어(배율)로 시작한다.** 이 게임에서 한 방에 판이 뒤집히는 순간은
 *    전부 배율이 만든 것이라, 그것을 보여주지 않으면 숫자가 어디서 나왔는지 알 수 없다.
 *    배율은 `pendingMultiplier += 레벨`(합연산)이라 레벨 9면 1 → 10이 된다.
 */
const SCENE_STEAL: DemoScene = {
  // 배율을 쌓고 특허랑이 한 방으로 상대 체력을 모두 가져온다.
  key: 'steal',
  label: '강탈로 승리',
  // 체력 36은 승리선(40) 바로 아래다 — 상대가 충분히 버티고 있는 것처럼 보여야
  // "한 방에 사라졌다"가 놀랍다.
  setup: {
    hp: { A: 20, B: 36 },
    exp: { A: { mermaid: 180, tiger: 100 }, B: {} },
    activeTeam: 'A',
  },
  steps: [
    {
      kind: 'skill', animal: 'mermaid',
      caption: '상대 체력이 36입니다. 디자인어부터 눌러 배율을 쌓아 봅시다.',
    },
    {
      kind: 'skill', animal: 'tiger',
      // 강탈은 보존형이라 상대가 가진 것 이상은 가져올 수 없다 — 그 사실까지 한 줄에
      // 담아 "왜 50이 아니라 36이 움직였는지"를 화면과 말이 어긋나지 않게 한다.
      caption: '배율이 10배! 특허랑이 5레벨 × 10배 = 50 — 상대에게는 36뿐이라 전부 가져옵니다.',
    },
  ],
  winner: 'A',
};

const SCENE_HEAL: DemoScene = {
  // 체력 4에서 상표토끼 한 방으로 승리선까지 채운다.
  key: 'heal',
  label: '회복으로 승리',
  // 4는 "한 대만 맞아도 지는" 체력이다. 여기서 이겨야 "때리지 않고도 이긴다"가 선다.
  setup: {
    hp: { A: 4, B: 20 },
    exp: { A: { mermaid: 140, rabbit: 50 }, B: {} },
    activeTeam: 'A',
  },
  steps: [
    {
      kind: 'skill', animal: 'mermaid',
      caption: '내 체력이 4뿐입니다. 그런데 이기는 길이 하나 더 있어요 — 디자인어부터.',
    },
    {
      kind: 'skill', animal: 'rabbit',
      caption: '배율 8배. 상표토끼 5레벨 × 8배 = 40 회복 — 승리선 40에 닿습니다.',
    },
  ],
  winner: 'A',
};

const SCENE_DEFEAT: DemoScene = {
  // 상대가 배율을 쌓고 특허랑이로 내 체력을 모두 빼앗는다.
  key: 'defeat',
  label: '패배',
  // 이 장면만 상대 차례로 시작한다 — 관람객은 보기만 하고 [계속 ▶]으로 넘긴다.
  setup: {
    hp: { A: 32, B: 20 },
    exp: { A: {}, B: { mermaid: 180, tiger: 80 } },
    activeTeam: 'B',
  },
  steps: [
    {
      kind: 'enemy', animal: 'mermaid',
      caption: '이번엔 상대 차례입니다. 상대가 디자인어로 배율을 쌓습니다.',
    },
    {
      kind: 'enemy', animal: 'tiger',
      caption: '배율 10배. 특허랑이 4레벨 × 10배 = 40 — 내 체력 32가 통째로 사라집니다.',
    },
  ],
  winner: 'B',
};

/**
 * 버튼에 나오는 순서 — **이기는 장면 둘 다음에 지는 장면**이다.
 *
 * 관람객이 어느 것을 먼저 고를지는 진행자가 정하지만, 목록의 첫 줄이 기본 시선이므로
 * 거기에 패배를 두면 "이 게임은 지는 게임"처럼 읽힌다.
 */
export const SCENES: DemoScene[] = [SCENE_STEAL, SCENE_HEAL, SCENE_DEFEAT];

export const CHAPTER_4: DemoStep[] = [
  {
    kind: 'menu',
    caption: '마지막입니다. 어떤 결말을 볼까요? 셋 다 보고 나서 끝내도 됩니다.',
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
    doneCaption: '2장이 끝났습니다. 네 기술을 모두 써 봤어요.',
  },
  {
    steps: CHAPTER_3,
    doneCaption: '3장이 끝났습니다.',
  },
  {
    // 이 장의 마지막 줄은 **소모되지 않는 메뉴**라, doneCaption은 실제로 쓰이지 않는다
    // (장면이 끝나면 결과 화면이 덮고, [4장으로 복귀]가 다시 메뉴로 되돌린다).
    steps: CHAPTER_4,
    doneCaption: '시연이 끝났습니다. 수고하셨어요!',
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
 * · `festivalTurn: 999` — 축제는 3장에서 감독이 직접 연다(`openFestival`이 이 값을 곧
 *   도달할 턴으로 옮긴다). 진행자가 로비에 1을 넣어 둔 채 시작하는 일을 막으려고 큰 값을
 *   박아 둔다 — 1·2장은 턴을 넘기지 않아 예약이 걸릴 일 자체가 없지만, 4장에서 턴을
 *   다루게 되면 그때 조용히 되살아난다.
 * · `festivalDrawCount: 2`(n) · `festivalDrawIncreaseInterval: 2`(k) — 3장 대본의 도토리
 *   카드 장수(2 · 2 · 4)가 이 두 값에서 그대로 나온다. 고치면 대본도 함께 고쳐야 하고,
 *   검산 테스트가 둘이 어긋나는 것을 잡는다. n을 크게 잡으면 한 클릭에 카드가 너무 많이
 *   쏟아져 무엇이 짝을 맞췄는지 따라가기 어렵다.
 */
export const DEMO_SETTINGS: Partial<GameSettings> = {
  firstTeam: 'A',
  targetScore: 20,
  festivalTurn: 999,
  festivalDrawCount: 2,
  festivalDrawIncreaseInterval: 2,
};
