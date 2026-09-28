import { ANIMALS } from 'shared';
import type { Animal, CardNum, DemoView, GameEvent, GameState, Place, Team } from 'shared';
import { settleStacks } from '../engine/drawCard';
import { makeScriptedCard } from '../engine/places';
import { applySkillChoice } from '../engine/skills';
import { advanceTurn, checkKnockout } from '../engine/turnManager';
import { CHAPTERS, DEMO_SETTINGS, SCENES } from './script';
import type { DemoScene, DemoStep } from './script';

/**
 * 시연 감독 — 대본의 현재 위치를 들고, 관람객의 클릭을 그 대본대로 처리한다.
 *
 * 일반 게임에서는 `processPlayerAction`/`processSkillChoice`가 "뽑기 → 정산 → 행동
 * 선택 → 턴 넘김"을 한 번에 끝내지만, 시연에서는 그 사이사이에 끼어들어야 한다.
 *   - 뽑히는 카드를 대본이 정한다(난수를 쓰지 않는다)
 *   - 짝이 맞으면 **정산 전에 멈춰서** 알리고, [계속]을 누르면 그때 정산한다
 *   - **턴을 넘기지 않는다**(1·2장) — 그래서 기술 넷을 연달아 쓸 수 있다
 *   - 3장만은 반대로 **턴을 넘겨야** 한다(축제 예약이 턴 교대에 딸려 온다). 대신 상대
 *     차례를 감독이 삼켜(`passTurn`) 관람객에게 곧바로 되돌려준다
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
   * 4장에서 고른 장면. null이면 아직 **장면 고르기 화면(메뉴)** 앞이다.
   *
   * 이 값이 있으면 `steps()`가 장의 대본 대신 그 장면의 대본을 돌려주므로, 4장은
   * "메뉴 ↔ 장면"을 오가는 구조가 된다(`chooseScene` / `restart`).
   */
  private scene: DemoScene | null = null;

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
    // 4장에서 장면을 고른 뒤에는 그 장면의 대본이 이 장의 대본을 대신한다.
    if (this.scene) return this.scene.steps;
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
   * 장소 클릭. 예약된 뽑기(실용신양·도토리 축제)가 있으면 그것부터 터뜨리고, 대본이 정한 카드를
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

    // ⓪ 3장 — 이 클릭이 한 바퀴를 먼저 삼킨다. 축제 뽑기는 턴이 바뀔 때 예약되므로,
    //    예약을 거는 일과 소모하는 일이 **한 액션 안에서** 끝나야 한다(script.ts의
    //    advanceTurnFirst 주석 참고). 이 줄 뒤로는 activeTeam을 다시 읽어야 한다.
    if (step.advanceTurnFirst) events.push(...this.passTurn(state));

    const team = state.activeTeam;

    // ① 예약 뽑기가 먼저다 — 엔진(`drawCard`)의 순서와 같다(실용신양 → 도토리 →
    //    클릭한 장소 → 정산). 예약을 여기서 소모하지 않으면 다음 클릭에서 또 터진다.
    const extras = step.extras ?? [];
    state.teams[team].pendingExtraDraws = 0;
    if (extras.length > 0) {
      events.push({ type: 'bonusDraws', team, count: extras.length });
      for (const extra of extras) events.push(this.push(state, extra.place, extra.animal, extra.num));
    }

    // ①-b 도토리 축제 예약분. 이벤트 종류가 달라서(`festivalDraws`) 화면이 양털이 아니라
    //    도토리로 그린다 — 실용신양 몫과 한 배열에 섞지 않는 이유다.
    const festivalExtras = step.festivalExtras ?? [];
    state.teams[team].pendingFestivalDraws = 0;
    if (festivalExtras.length > 0) {
      events.push({ type: 'festivalDraws', team, count: festivalExtras.length });
      for (const extra of festivalExtras) events.push(this.push(state, extra.place, extra.animal, extra.num));
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
    return this.afterSkill(state, event);
  }

  /**
   * 4장 — **상대가 두는 수.** 관람객은 [계속 ▶]으로 넘기기만 한다(`resume`이 부른다).
   *
   * 효과는 같은 `applySkillChoice`로 적용하되 **팀을 명시해** 상대에게 건다 —
   * `state.activeTeam`이 이미 'B'이긴 하지만, 그 사실에 기대지 않고 드러내 적는다.
   */
  private enemySkill(state: GameState, animal: Animal): GameEvent[] {
    // 시연은 언제나 A팀(진행자) 대 B팀(컴퓨터)이다 — 상대는 곧 'B'다. 장면의 setup이
    // activeTeam을 'B'로 세워 두므로 화면의 차례 표시도 상대 쪽에 가 있다.
    const event = applySkillChoice(state, 'B', animal);
    return this.afterSkill(state, event);
  }

  /**
   * 기술을 쓴 뒤의 공통 마무리.
   *
   * ⚠️ **4장에서만 즉시 승패를 판정한다.** `checkKnockout`은 원래 `finishTurn` 안에서만
   *    도는데(감독은 그 함수를 부르지 않는다), 4장은 "한 방에 끝나는 장면"을 보여주는
   *    장이라 그 판정이 반드시 있어야 한다. 반대로 1~3장에서 이 판정을 돌리면 안 된다 —
   *    2장이 턴을 넘기지 않고 기술 넷을 연달아 쓰는 동안 체력이 끝에 닿으면 대본이
   *    중간에 끊긴다(그래서 시연 방은 체력을 넉넉히 잡아 두었다. DEMO_MODE 주의 2).
   */
  private afterSkill(state: GameState, event: GameEvent): GameEvent[] {
    const ko = this.scene ? checkKnockout(state) : [];
    if (ko.length > 0) {
      // 판이 끝났으면 다음 줄로 넘기지 않는다 — 남은 줄은 이 장면에서 쓸 일이 없다.
      // 대본 끝으로 보내 `view()`가 'done'을 내게 하고, 대기 상태도 함께 비운다
      // (checkKnockout이 이미 pendingChoice를 비우지만 그 사실에 기대지 않는다).
      this.index = this.steps().length;
      this.syncPending(state);
      return [event, ...ko];
    }
    this.advance(state);
    return [event];
  }

  /**
   * [계속 ▶] — 세 가지를 맡는다.
   *  · 멈춰 두었던 정산을 그제야 수행한다(요구 1-3 → 1-4의 순서).
   *  · 3장의 턴 넘김 줄이면 한 바퀴를 돌려 축제를 연다.
   *  · 4장 패배 장면의 상대 수(`enemy`)를 한 수씩 둔다.
   */
  resume(state: GameState): GameEvent[] {
    if (this.holding) {
      this.holding = false;
      const events = settleStacks(state);
      // ⚠️ 정산 **뒤에** 다음 줄로 넘어간다 — 순서를 뒤집으면 다음 줄이 기술 단계일 때
      //    `syncPending`이 세운 `pendingChoice`가 아직 정산 전 상태와 섞인다.
      this.advance(state);
      return events;
    }

    const step = this.current();
    if (step?.kind === 'turn') {
      const events = this.passTurn(state, step.openFestival);
      this.advance(state);
      return events;
    }
    if (step?.kind === 'enemy') return this.enemySkill(state, step.animal);
    return [];
  }

  /**
   * 4장 — 볼 장면을 골랐다. 판을 그 장면의 setup대로 직접 세우고 대본을 갈아탄다.
   *
   * ⚠️ **먼저 판을 중립으로 되돌린 뒤 세운다**(`resetBoard`). 장면은 몇 번이고 다시 볼
   *    수 있어야 하는데, 앞 장면이 남긴 배율·예약·중앙 카드가 그대로 있으면 두 번째부터
   *    숫자가 달라진다 — 자막에 적어 둔 "5레벨 × 10배 = 50"이 거짓이 되는 순간이다.
   *
   * ⚠️ 돌아오는 이벤트가 **비어 있다.** 화면은 그 빈 actionResult를 "최초 입장·재접속"으로
   *    보고 연출 없이 서버 진실로 맞추는데(useAnimationQueue), 판을 통째로 갈아엎는
   *    이 자리에서는 그것이 정확히 원하는 동작이다(DEMO_MODE 주의 13의 예외).
   */
  chooseScene(state: GameState, key: string): GameEvent[] {
    const step = this.current();
    if (!step || step.kind !== 'menu') return [];
    const scene = SCENES.find(s => s.key === key);
    if (!scene) return [];

    this.scene = scene;
    this.index = 0;
    resetBoard(state);
    state.teams.A.hp = scene.setup.hp.A;
    state.teams.B.hp = scene.setup.hp.B;
    for (const team of ['A', 'B'] as const) {
      for (const [animal, exp] of Object.entries(scene.setup.exp[team])) {
        state.teams[team].exp[animal as Animal] = exp ?? 0;
      }
    }
    state.activeTeam = scene.setup.activeTeam;
    state.activePlayerIndex = 0;
    this.syncPending(state);
    return [];
  }

  /**
   * 결과 화면의 [4장으로 복귀] — 장면을 접고 장면 고르기 화면으로 되돌린다.
   *
   * ⚠️ **끝난 판을 다시 살린다**(`phase`를 'playing'으로). 이 시연에서만 허용되는 일이고,
   *    그래서 `Room.handleDemoContinue`가 "시연이고, 끝났고, replay가 켜진" 경우에만
   *    이 길로 들어온다. 일반 게임에는 끝난 판을 되살리는 경로가 없다.
   */
  restart(state: GameState): GameEvent[] {
    this.scene = null;
    this.index = 0;
    this.holding = false;
    resetBoard(state);
    state.phase = 'playing';
    state.winner = null;
    this.syncPending(state);
    return [];
  }

  /**
   * 한 바퀴(내 턴 종료 → 상대 턴 종료)를 감독이 대신 돌린다 — 3장 전용.
   *
   * ⚠️ **상대(CPU)에게 차례를 실제로 주지 않는다.** 그냥 넘기면 CPU가 장소를 고르고
   *    기술을 쓰며 시연 흐름을 가져간다(DEMO_MODE.md 주의 9). `advanceTurn`을 연달아
   *    두 번 불러 그 차례를 한 프레임도 내보내지 않고 관람객에게 되돌려준다 — 그 사이에는
   *    브로드캐스트가 없으므로 화면의 차례 표시는 내내 우리 팀에 머문다.
   *
   * ⚠️ `finishTurn`이 아니라 `advanceTurn`을 부른다. 3장은 체력을 건드리지 않아 즉시
   *    승패가 날 수 없고, 그 판정이 끼어들면 대본이 중간에 끝나 버릴 수 있다.
   */
  private passTurn(state: GameState, openFestival = false): GameEvent[] {
    if (openFestival) {
      // ⚠️ `state.festival = true`를 직접 세우면 `festival` 이벤트가 안 나가 배너도,
      //    예약도 따라오지 않는다(주의 10). 축제가 열리는 조건은 `advanceTurn` 안의
      //    "턴이 오른 뒤 turn >= festivalTurn"이므로, 그 턴 값을 여기서 맞춰 둔다.
      //    `+1`인 이유는 아래 두 번의 advanceTurn이 턴을 정확히 하나 올리기 때문이다 —
      //    지금 턴으로 맞추면 축제가 한 턴 일찍 시작된 것으로 계산돼, 화면의 "몇 턴 후
      //    몇 회" 예고가 실제 강화 시점보다 한 턴 앞서 어긋난다.
      state.settings.festivalTurn = state.turn + 1;
    }

    const events = [...advanceTurn(state), ...advanceTurn(state)];

    // ⚠️ 넘어가는 길에 **상대에게도** 축제 뽑기가 예약된다. 그런데 상대는 이 시연에서
    //    한 수도 두지 않으므로 그 예약은 영영 소모되지 않고 턴마다 쌓인다 — 4장에서
    //    상대가 처음 두는 순간 밀린 도토리가 통째로 터져 그 장면을 망친다. 관람객에게는
    //    보인 적도 없는 예약이니 여기서 걷어낸다.
    const idle: Team = state.activeTeam === 'A' ? 'B' : 'A';
    state.teams[idle].pendingFestivalDraws = 0;

    return events;
  }

  /** 화면에 내려보낼 현재 상황. */
  view(): DemoView {
    const chapter = this.chapter + 1;
    const steps = this.steps();
    const total = steps.length;
    // 4장의 장면이 진행 중이면(끝났든 아니든) 결과 화면에서 되돌아올 수 있다.
    // 1~3장 도중에 항복으로 끝난 판까지 켜면 "무엇으로 돌아가는지" 설명할 수 없다.
    const replay = this.scene !== null;

    if (this.holding) {
      return {
        chapter, caption: this.holdCaption,
        allowedPlaces: [], allowedSkills: [],
        waiting: 'continue', replay, step: this.index + 1, total,
      };
    }

    const step = steps[this.index];
    if (!step) {
      return {
        chapter,
        caption: this.scene
          ? '이 장면은 여기까지입니다. 다른 결말도 볼 수 있어요.'
          : CHAPTERS[this.chapter]?.doneCaption ?? '시연이 끝났습니다.',
        allowedPlaces: [], allowedSkills: [],
        waiting: 'done', replay, step: total, total,
      };
    }
    if (step.kind === 'skill') {
      return {
        chapter, caption: step.caption,
        allowedPlaces: [], allowedSkills: [step.animal],
        waiting: 'skill', replay, step: this.index + 1, total,
      };
    }
    // 턴 넘김(3장)과 상대의 수(4장)는 누를 곳이 없다 — 멈춤과 똑같이 [계속 ▶] 하나만
    // 기다린다. 특히 상대의 수에서 행동 선택 칸을 살리면 안 된다(내 차례가 아니다).
    if (step.kind === 'turn' || step.kind === 'enemy') {
      return {
        chapter, caption: step.caption,
        allowedPlaces: [], allowedSkills: [],
        waiting: 'continue', replay, step: this.index + 1, total,
      };
    }
    // 4장의 장면 고르기 — 화면이 버튼 셋을 띄운다.
    if (step.kind === 'menu') {
      return {
        chapter, caption: step.caption,
        allowedPlaces: [], allowedSkills: [],
        waiting: 'scene', replay,
        scenes: SCENES.map(s => ({ key: s.key, label: s.label })),
        step: this.index + 1, total,
      };
    }
    return {
      chapter, caption: step.caption,
      allowedPlaces: [step.place], allowedSkills: [],
      waiting: 'click', replay, step: this.index + 1, total,
    };
  }
}

/**
 * 판을 "아무 일도 없었던" 상태로 되돌린다 — 4장 전용.
 *
 * 4장은 같은 판을 몇 번이고 다시 세우는 유일한 장이라, 앞 장면(혹은 3장)이 남긴 것이
 * 하나라도 남아 있으면 두 번째부터 숫자가 달라진다. 특히 조용히 남는 것들을 함께 지운다.
 *  · `pendingMultiplier` — 남아 있으면 다음 장면의 첫 기술이 예고 없이 증폭된다
 *  · `pendingExtraDraws` / `pendingFestivalDraws` — 3장이 남긴 도토리가 뒤늦게 터진다
 *  · `skillStats` — 결과 화면의 "행동 사용 통계"가 장면마다 누적돼 그 장면의 이야기가 흐려진다
 *  · `festival` / `festivalTurn` — 3장이 열어 둔 축제 배지가 4장 내내 헤더에 남는다
 */
function resetBoard(state: GameState): void {
  for (const animal of ANIMALS) state.stacks[animal] = [];

  for (const team of ['A', 'B'] as const) {
    const t = state.teams[team];
    t.hp = state.settings.targetScore;
    t.exp = { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 };
    t.pendingMultiplier = 1;
    t.pendingExtraDraws = 0;
    t.pendingFestivalDraws = 0;
    for (const animal of ANIMALS) {
      t.skillStats[animal] = { count: 0, totalLevel: 0, totalHpGained: 0, totalExtraDraws: 0 };
    }
  }

  state.activeTeam = 'A';
  state.activePlayerIndex = 0;
  state.pendingChoice = null;
  state.lastPlace = null;
  state.winner = null;
  state.festival = false;
  state.settings.festivalTurn = DEMO_SETTINGS.festivalTurn ?? 999;
}
