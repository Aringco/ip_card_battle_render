import type { Animal, DemoView, GameEvent, GameState, Place } from 'shared';
import { settleStacks } from '../engine/drawCard';
import { makeScriptedCard } from '../engine/places';
import { CHAPTER_1 } from './script';

/**
 * 시연 감독 — 대본의 현재 위치를 들고, 관람객의 클릭을 그 대본대로 처리한다.
 *
 * 일반 게임에서는 `processPlayerAction`이 "뽑기 → 정산 → 행동 선택 대기"를 한 번에
 * 끝내지만, 시연에서는 그 사이사이에 끼어들어야 한다.
 *   - 뽑히는 카드를 대본이 정한다(난수를 쓰지 않는다)
 *   - 짝이 맞으면 **정산 전에 멈춰서** 알리고, [계속]을 누르면 그때 정산한다
 *   - 턴을 넘기지 않는다(1·2장)
 *
 * ⚠️ **엔진의 규칙을 베끼지 않는다.** 정산은 엔진의 `settleStacks`를 그대로 부르고,
 *    카드 id도 엔진의 카운터에서 받는다(`makeScriptedCard`). 규칙이 두 벌이 되면
 *    곧 어긋나고, 어긋난 쪽이 시연이라 눈에 띄는 것은 시연회 당일이다.
 *
 * 시나리오 전문은 저장소 루트의 `DEMO_MODE.md`에 있다.
 */

export class DemoDirector {
  /** 지금 기다리고 있는 대본 줄. CHAPTER_1.length가 되면 1장이 끝난 것이다. */
  private index = 0;
  /** 정산을 멈춰 세운 상태인지 — [계속]을 기다린다 */
  private holding = false;
  /** 멈춤 화면에 띄울 문구 */
  private holdCaption = '';

  /**
   * 게임이 시작된 직후 부른다 — **시작 공유 카드 2장을 걷어낸다.**
   *
   * ⚠️ `initGame`은 빈 보드가 아니라 서로 다른 동물 2장을 중앙에 깔고 시작한다.
   *    그대로 두면 1장 대본의 짝수 계산이 통째로 어긋난다 — 예컨대 시작 카드로
   *    특허랑이가 깔려 있으면 대본 1번의 특허랑이가 **그 자리에서 정산돼** 버리고,
   *    멈춤 위치가 전부 밀린다.
   *    그 규칙은 "선 플레이어가 빈 보드에서 불리한 구조"를 막으려고 있는 것인데,
   *    시연에는 그 불리함이 존재하지 않으므로 걷어내도 취지를 해치지 않는다.
   */
  start(state: GameState): void {
    for (const animal of Object.keys(state.stacks) as Animal[]) {
      state.stacks[animal] = [];
    }
  }

  /** 지금 이 장소를 누를 수 있는가 — 화면이 잠가 두지만 서버에서도 막는다. */
  private expectedPlace(): Place | null {
    if (this.holding || this.index >= CHAPTER_1.length) return null;
    return CHAPTER_1[this.index].place;
  }

  /**
   * 장소 클릭. 대본이 정한 카드를 쌓고, 그 동물이 짝수가 됐으면 **정산하지 않고**
   * 멈춰 선다(관람객이 [계속]을 누르면 `resume`이 정산한다).
   *
   * 대본과 다른 장소를 누르면 아무 일도 하지 않는다 — 화면이 이미 잠가 두었으므로
   * 정상적인 경로로는 올 수 없고, 여기서는 방어적으로만 막는다.
   */
  draw(state: GameState, place: Place): GameEvent[] {
    if (place !== this.expectedPlace()) return [];

    const step = CHAPTER_1[this.index];
    const card = makeScriptedCard(step.animal, step.num);
    state.stacks[card.animal].push(card);
    state.lastPlace = place;

    const events: GameEvent[] = [{ type: 'draw', place, card }];

    // 짝이 맞았는지는 **실제 장수로** 판단한다. 대본이 "여기서 멈춘다"고 선언하지
    // 않는 이유는, 숫자를 고쳤을 때 멈추는 자리가 저절로 따라오게 하기 위해서다.
    const open = state.stacks[card.animal].filter(c => c.collectedBy === null).length;
    if (open > 0 && open % 2 === 0) {
      this.holding = true;
      this.holdCaption = step.settleCaption ?? '짝이 맞았어요!';
    } else {
      this.index++;
    }

    return events;
  }

  /** [계속 ▶] — 멈춰 두었던 정산을 그제야 수행한다(요구 1-3 → 1-4의 순서). */
  resume(state: GameState): GameEvent[] {
    if (!this.holding) return [];
    this.holding = false;
    this.index++;
    return settleStacks(state);
  }

  /** 화면에 내려보낼 현재 상황. */
  view(): DemoView {
    const total = CHAPTER_1.length;

    if (this.holding) {
      return {
        chapter: 1, caption: this.holdCaption,
        allowedPlaces: [], allowedSkills: [],
        waiting: 'continue', step: this.index + 1, total,
      };
    }
    if (this.index >= total) {
      return {
        chapter: 1, caption: '1장이 끝났습니다. 네 동물의 기술이 모두 열렸어요.',
        allowedPlaces: [], allowedSkills: [],
        waiting: 'done', step: total, total,
      };
    }
    const step = CHAPTER_1[this.index];
    return {
      chapter: 1, caption: step.caption,
      allowedPlaces: [step.place], allowedSkills: [],
      waiting: 'click', step: this.index + 1, total,
    };
  }
}
