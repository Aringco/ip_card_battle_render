import { ANIMALS } from 'shared';
import type { Animal, CardNum, DemoView, GameEvent, GameState, Place, Team } from 'shared';
import { settleStacks } from '../engine/drawCard';
import { makeScriptedCard } from '../engine/places';
import { applySkillChoice } from '../engine/skills';
import { CHAPTERS } from './script';
import type { DemoStep } from './script';

/**
 * 시연 감독 — 대본의 현재 위치를 들고, 관람객의 클릭을 그 대본대로 처리한다.
 *
 * 일반 게임에서는 `processPlayerAction`/`processSkillChoice`가 "뽑기 → 정산 → 행동
 * 선택 → 턴 넘김"을 한 번에 끝내지만, 시연에서는 그 사이사이에 끼어들어야 한다.
 *   - 뽑히는 카드를 대본이 정한다(난수를 쓰지 않는다)
 *   - 짝이 맞으면 **정산 전에 멈춰서** 알리고, [계속]을 누르면 그때 정산한다
 *   - **턴을 넘기지 않는다**(1·2장) — 그래서 기술 넷을 연달아 쓸 수 있다
 *
 * ⚠️ **엔진의 규칙을 베끼지 않는다.** 정산은 엔진의 `settleStacks`, 기술 효과는
 *    `applySkillChoice`를 그대로 부르고, 카드 id도 엔진의 카운터에서 받는다
 *    (`makeScriptedCard`). 규칙이 두 벌이 되면 곧 어긋나고, 어긋난 쪽이 시연이라
 *    눈에 띄는 것은 시연회 당일이다.
 *
 * 시나리오 전문은 저장소 루트의 `DEMO_MODE.md`에 있다.
 */

export class DemoDirector {
  /** 지금 진행 중인 장(0부터). */
  private chapter = 0;
  /** 그 장에서 기다리고 있는 대본 줄. 장 길이에 닿으면 다음 장으로 넘어간다. */
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
    this.syncPending(state);
  }

  private steps(): DemoStep[] {
    return CHAPTERS[this.chapter]?.steps ?? [];
  }

  /** 지금 기다리고 있는 대본 줄 — 멈춰 서 있거나 대본이 끝났으면 없다. */
  private current(): DemoStep | null {
    if (this.holding) return null;
    return this.steps()[this.index] ?? null;
  }

  /**
   * 한 줄을 끝내고 다음 줄로. 장의 마지막 줄이었으면 다음 장의 첫 줄로 넘어간다
   * (마지막 장이면 그 자리에 머물러 `view()`가 'done'을 낸다).
   */
  private advance(state: GameState): void {
    this.index++;
    if (this.index >= this.steps().length && this.chapter < CHAPTERS.length - 1) {
      this.chapter++;
      this.index = 0;
    }
    this.syncPending(state);
  }

  /**
   * 대본의 현재 줄을 **서버 상태에 반영한다** — 기술을 고르는 줄이면 그 팀의 행동
   * 선택 대기 상태로 세우고(그래야 화면에 [행동 선택] 칸 다섯 장이 살아난다),
   * 장소를 누르는 줄이면 반드시 비운다.
   *
   * ⚠️ **비우는 쪽을 빠뜨리면 그 클릭이 에러로 되돌아온다** — `handleDrawCard`는
   *    `pendingChoice`가 남아 있으면 "지금은 스킬을 선택할 차례입니다"로 거부한다.
   */
  private syncPending(state: GameState): void {
    const step = this.current();
    state.pendingChoice = step?.kind === 'skill' ? state.activeTeam : null;
  }

  /** 대본이 정한 카드 한 장을 중앙 스택에 쌓는다. */
  private push(state: GameState, place: Place, animal: Animal, num: CardNum): GameEvent {
    const card = makeScriptedCard(animal, num);
    state.stacks[card.animal].push(card);
    return { type: 'draw', place, card };
  }

  /**
   * 장소 클릭. 예약된 뽑기(실용신양)가 있으면 그것부터 터뜨리고, 대본이 정한 카드를
   * 쌓은 뒤 짝이 맞았으면 **정산하지 않고** 멈춰 선다(관람객이 [계속]을 누르면
   * `resume`이 정산한다).
   *
   * 대본과 다른 장소를 누르면 아무 일도 하지 않는다 — 화면이 이미 잠가 두었으므로
   * 정상적인 경로로는 올 수 없고, 여기서는 방어적으로만 막는다.
   */
  draw(state: GameState, place: Place): GameEvent[] {
    const step = this.current();
    if (!step || step.kind !== 'draw' || place !== step.place) return [];

    const events: GameEvent[] = [];
    const team = state.activeTeam;

    // ① 예약 뽑기가 먼저다 — 엔진(`drawCard`)의 순서와 같다(예약분 → 클릭한 장소 →
    //    정산). 예약을 여기서 소모하지 않으면 다음 클릭에서 또 터진다.
    const extras = step.extras ?? [];
    state.teams[team].pendingExtraDraws = 0;
    if (extras.length > 0) {
      events.push({ type: 'bonusDraws', team, count: extras.length });
      for (const extra of extras) events.push(this.push(state, extra.place, extra.animal, extra.num));
    }

    // ② 관람객이 누른 장소의 카드
    events.push(this.push(state, place, step.animal, step.num));
    state.lastPlace = place;

    // ③ 짝이 맞았는지는 **실제 장수로** 판단한다(`settleStacks`와 같은 기준). 대본이
    //    "여기서 멈춘다"고 선언하지 않는 이유는, 숫자를 고쳤을 때 멈추는 자리가 저절로
    //    따라오게 하기 위해서다.
    const willSettle = ANIMALS.some(animal => {
      const open = state.stacks[animal].filter(c => c.collectedBy === null).length;
      return open > 0 && open % 2 === 0;
    });
    if (willSettle) {
      this.holding = true;
      this.holdCaption = step.settleCaption ?? '짝이 맞았어요!';
    } else {
      this.advance(state);
    }

    return events;
  }

  /**
   * 기술 선택. 효과는 엔진 그대로 적용하되 **턴을 넘기지 않는다**(요구 2-2).
   *
   * ⚠️ `finishTurn`을 부르지 않는 것이 2장의 핵심이다 — 부르면 상대(CPU) 차례가 와서
   *    대본이 끊기고, 기술 넷을 연달아 보여줄 수 없다. 대신 즉시 승패 판정
   *    (`checkKnockout`)도 함께 돌지 않으므로, 시연 방은 체력을 넉넉히 잡아 2장의
   *    수치가 승리선·0 어디에도 닿지 않게 해 둔다(`script.ts`의 DEMO_SETTINGS).
   */
  chooseSkill(state: GameState, animal: Animal): GameEvent[] {
    const step = this.current();
    if (!step || step.kind !== 'skill' || animal !== step.animal) return [];

    const team: Team = state.activeTeam;
    const event = applySkillChoice(state, team, animal);
    this.advance(state);
    return [event];
  }

  /** [계속 ▶] — 멈춰 두었던 정산을 그제야 수행한다(요구 1-3 → 1-4의 순서). */
  resume(state: GameState): GameEvent[] {
    if (!this.holding) return [];
    this.holding = false;
    const events = settleStacks(state);
    // ⚠️ 정산 **뒤에** 다음 줄로 넘어간다 — 순서를 뒤집으면 다음 줄이 기술 단계일 때
    //    `syncPending`이 세운 `pendingChoice`가 아직 정산 전 상태와 섞인다.
    this.advance(state);
    return events;
  }

  /** 화면에 내려보낼 현재 상황. */
  view(): DemoView {
    const chapter = this.chapter + 1;
    const steps = this.steps();
    const total = steps.length;

    if (this.holding) {
      return {
        chapter, caption: this.holdCaption,
        allowedPlaces: [], allowedSkills: [],
        waiting: 'continue', step: this.index + 1, total,
      };
    }

    const step = steps[this.index];
    if (!step) {
      return {
        chapter, caption: CHAPTERS[this.chapter]?.doneCaption ?? '시연이 끝났습니다.',
        allowedPlaces: [], allowedSkills: [],
        waiting: 'done', step: total, total,
      };
    }
    if (step.kind === 'skill') {
      return {
        chapter, caption: step.caption,
        allowedPlaces: [], allowedSkills: [step.animal],
        waiting: 'skill', step: this.index + 1, total,
      };
    }
    return {
      chapter, caption: step.caption,
      allowedPlaces: [step.place], allowedSkills: [],
      waiting: 'click', step: this.index + 1, total,
    };
  }
}
