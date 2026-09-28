import { ANIMALS, THRESHOLDS, PLACES, PLACE_ANIMALS, SETTINGS_LIMITS, clampSettings } from 'shared';
import type { Animal, CardNum, Place } from 'shared';
import { isDemoRequest } from '../demo/trigger';
import { CHAPTER_1, CHAPTER_2, CHAPTERS, DEMO_SETTINGS } from '../demo/script';
import type { DemoDrawStep } from '../demo/script';
import { DemoDirector } from '../demo/director';
import { initGame } from '../engine/turnManager';
import { levelOf } from '../engine/skills';

/**
 * 시연 모드 — 암호 판정과 **대본 검산**.
 *
 * 대본 검산이 이 파일의 핵심이다. 시연 대본은 눈으로 봐서는 알 수 없는 조건들을
 * 동시에 만족해야 하는데(demo/script.ts의 각 장 주석), 하나라도 어기면 화면에서
 * 조용히 이상해진다 — 예를 들어 같은 장소가 연달아 나오면 그 클릭이 통째로 먹통이
 * 되지만 화면에는 아무 일도 일어나지 않는다.
 *
 * ⚠️ 대본 검산에서는 **게임을 켜지 않는다.** 대본은 순수한 데이터라 방(Room)도
 *    타이머도 필요 없다. 그래서 숫자를 고칠 때 가장 먼저, 가장 빠르게 걸리는 그물이다.
 *    맨 아래 "감독이 대본대로 굴러가는가"만 엔진을 실제로 돌리는데, 그래도 타이머는
 *    없다 — 감독은 방이 아니라 GameState를 직접 받기 때문이다.
 */

describe('시연 암호', () => {
  it('팀명과 닉네임이 둘 다 맞아야 켜진다', () => {
    expect(isDemoRequest('시연자', '키피전자오락센타')).toBe(true);
  });

  it('앞뒤 공백은 걷어내고 본다 — 복사·붙여넣기로 섞여 들어온다', () => {
    expect(isDemoRequest('  시연자 ', ' 키피전자오락센타  ')).toBe(true);
  });

  it('둘 중 하나만 맞으면 켜지지 않는다', () => {
    // 우연히 "시연자"라는 닉네임을 쓴 사람이 영문 모를 판을 하게 되면 안 된다.
    expect(isDemoRequest('시연자', '우리팀')).toBe(false);
    expect(isDemoRequest('홍길동', '키피전자오락센타')).toBe(false);
  });

  it('팀명을 아예 안 보냈으면 켜지지 않는다', () => {
    expect(isDemoRequest('시연자')).toBe(false);
  });

  it('글자가 다르면 켜지지 않는다 — 가운데 공백도 다른 글자다', () => {
    expect(isDemoRequest('시연 자', '키피전자오락센타')).toBe(false);
    expect(isDemoRequest('시연자', '키피 전자오락센타')).toBe(false);
    expect(isDemoRequest('시연자2', '키피전자오락센타')).toBe(false);
  });
});

describe('시연 규칙 프리셋', () => {
  it('clampSettings를 그대로 통과한다 — 우회로를 뚫지 않는다', () => {
    // 범위를 벗어난 값을 프리셋에 적어 두면 조용히 다른 값으로 잘려 나간다(주의 6).
    const clamped = clampSettings(DEMO_SETTINGS);
    expect(clamped.targetScore).toBe(DEMO_SETTINGS.targetScore);
    expect(clamped.festivalTurn).toBe(DEMO_SETTINGS.festivalTurn);
    // 진행자가 먼저 두어야 한다 — CPU가 선이면 첫 클릭이 "당신의 차례가 아닙니다"로
    // 되돌아오고 시연이 그 자리에서 멈춘다.
    expect(clamped.firstTeam).toBe('A');
    expect(DEMO_SETTINGS.festivalTurn!).toBeLessThanOrEqual(SETTINGS_LIMITS.festivalTurn.max);
  });

  it('2장의 체력 변화로는 승리선에도 0에도 닿지 않는다', () => {
    // 2장은 턴을 넘기지 않아 checkKnockout이 한 번도 돌지 않는다(주의 2) — 체력이
    // 끝에 닿아도 게임이 안 끝나고 화면만 이상해지므로, 애초에 닿지 않아야 한다.
    const { state } = playChapters();
    const winHp = state.settings.targetScore * 2;
    for (const team of ['A', 'B'] as const) {
      expect(state.teams[team].hp).toBeGreaterThan(0);
      expect(state.teams[team].hp).toBeLessThan(winHp);
    }
  });
});

describe('1장 대본 검산', () => {
  it('조건 1 — 네 장소의 가능한 동물이 빠짐없이 나온다', () => {
    // 요구 1-1·1-5의 핵심. 하나라도 빠지면 "이 장소에서는 이것들이 나옵니다"라는
    // 설명 자체가 거짓이 된다.
    for (const place of PLACES) {
      const shown = new Set(CHAPTER_1.filter(s => s.place === place).map(s => s.animal));
      expect([...shown].sort()).toEqual([...PLACE_ANIMALS[place]].sort());
    }
  });

  it('조건 2 — 같은 장소를 연달아 누르지 않는다', () => {
    // 직전에 클릭한 장소는 규칙상 막혀 있다(state.lastPlace). 연속으로 두면 그
    // 클릭이 먹통이 되는데 화면에는 아무 일도 일어나지 않아 원인을 찾기 어렵다.
    for (let i = 1; i < CHAPTER_1.length; i++) {
      expect(CHAPTER_1[i].place).not.toBe(CHAPTER_1[i - 1].place);
    }
  });

  it('조건 4 — 1장이 끝나면 네 동물의 기술이 모두 열린다', () => {
    // 요구 2-1이자 2장의 전제. 엔진을 쓰지 않고 짝수 정산 규칙을 **따로 계산해**
    // 견준다 — 대본과 엔진 양쪽이 동시에 틀릴 가능성을 줄이려는 것이다.
    const { exp } = simulateDraws(CHAPTER_1);

    for (const animal of ANIMALS) {
      const level = Math.floor(exp[animal] / THRESHOLDS[animal]);
      expect({ animal, level }).toEqual({ animal, level: expect.any(Number) });
      expect(level).toBeGreaterThanOrEqual(1);
    }
  });

  it('정산은 네 번 일어나고, 그 자리에 안내 문구가 준비돼 있다', () => {
    // 멈추는 자리는 대본이 선언하는 게 아니라 짝수 계산이 정한다. 그래서 문구가
    // 붙어 있는 자리와 실제로 멈추는 자리가 어긋날 수 있어 여기서 맞춰 본다.
    const { settledAt } = simulateDraws(CHAPTER_1);
    expect(settledAt).toEqual([4, 5, 6, 9]); // 0부터 센 인덱스 = 표의 #5·#6·#7·#10

    for (const i of settledAt) {
      expect(CHAPTER_1[i].settleCaption).toBeTruthy();
    }
    // 반대로, 짝이 안 맞는 자리에 문구를 달아 두면 영영 안 보인다
    CHAPTER_1.forEach((step, i) => {
      if (!settledAt.includes(i)) expect(step.settleCaption).toBeUndefined();
    });
  });

  it('1장 끝에 짝이 안 맞은 카드가 남는다 — "짝이 맞아야 가져간다"의 대비', () => {
    const { leftover } = simulateDraws(CHAPTER_1);
    expect(leftover.sort()).toEqual(['rabbit', 'sheep']);
  });
});

describe('2장 대본 검산', () => {
  it('네 기술을 한 번씩 모두 써 본다 — 요구 2-1', () => {
    const used = CHAPTER_2.filter(s => s.kind === 'skill').map(s => s.animal);
    expect([...used].sort()).toEqual([...ANIMALS].sort());
  });

  it('디자인어가 맨 앞이다 — 나중에 쓰면 아무것도 증폭하지 못한다', () => {
    // 배율은 인어 외의 기술을 쓰는 순간 1로 초기화된다. 순서를 뒤로 미루면 "다음 행동
    // ×2"를 예고만 하고 끝나 "그래서 뭐?"가 된다.
    const skills = CHAPTER_2.filter(s => s.kind === 'skill');
    expect(skills[0].animal).toBe('mermaid');
  });

  it('실용신양이 마지막 기술이고, 그 뒤에 회수할 장소 클릭이 온다', () => {
    // 실용신양의 효과는 *다음 뽑기에* 나타난다 — 먼저 쓰면 2장 안에서 그 결과를 볼
    // 기회가 없고, 뒤에 장소 클릭이 없으면 예약만 해 둔 채 장이 끝난다.
    const skills = CHAPTER_2.filter(s => s.kind === 'skill');
    expect(skills[skills.length - 1].animal).toBe('sheep');
    expect(CHAPTER_2[CHAPTER_2.length - 1].kind).toBe('draw');
  });

  it('예약 뽑기 장수가 실용신양이 실제로 예약하는 횟수와 같다', () => {
    // 엔진은 예약 횟수만큼 뽑고 그 수를 bonusDraws로 알린다. 대본의 extras가 그보다
    // 적거나 많으면 화면의 진행도 팝업과 실제로 날아오는 카드 수가 어긋난다.
    const { state, reservedAtLastDraw } = playChapters();
    const last = CHAPTER_2[CHAPTER_2.length - 1] as DemoDrawStep;
    expect(reservedAtLastDraw).toBeGreaterThan(0);
    expect(last.extras?.length).toBe(reservedAtLastDraw);
    // 회수한 뒤에는 남아 있지 않아야 한다 — 남으면 3장 첫 클릭에서 또 터진다.
    expect(state.teams.A.pendingExtraDraws).toBe(0);
  });
});

describe('대본 전체 검산 — 모든 장에 함께 적용된다', () => {
  it('그 장소에 없는 동물을 내보내지 않는다', () => {
    for (const card of allScriptedCards()) {
      expect(PLACE_ANIMALS[card.place]).toContain(card.animal);
    }
  });

  it('숫자가 그 장소에서 실제로 나올 수 있는 범위 안이다', () => {
    // 동물 3종 장소는 10~15, 2종 장소는 5~10. 벗어나면 "시연에서 본 카드가 실제
    // 게임에는 없다"가 된다.
    for (const card of allScriptedCards()) {
      const [min, max] = PLACE_ANIMALS[card.place].length >= 3 ? [10, 15] : [5, 10];
      expect(card.num).toBeGreaterThanOrEqual(min);
      expect(card.num).toBeLessThanOrEqual(max);
    }
  });

  it('장이 바뀌는 자리에서도 같은 장소를 연달아 누르지 않는다', () => {
    // 1장의 마지막 클릭과 2장의 클릭이 같은 장소면 그 클릭이 먹통이 된다 — 장 안에서만
    // 검사하면 이 이음매를 놓친다(실제로 놓치기 쉬운 자리다).
    const clicked = CHAPTERS.flatMap(ch =>
      ch.steps.filter((s): s is DemoDrawStep => s.kind === 'draw').map(s => s.place),
    );
    for (let i = 1; i < clicked.length; i++) {
      expect(clicked[i]).not.toBe(clicked[i - 1]);
    }
  });
});

describe('감독이 대본대로 굴러가는가', () => {
  it('1장을 끝내면 네 동물 레벨이 2·2·1·1이고 2장 첫 기술을 기다린다', () => {
    const { state, director } = playChapter1();

    expect(levelOf(state, 'A', 'sheep')).toBe(2);
    expect(levelOf(state, 'A', 'rabbit')).toBe(2);
    expect(levelOf(state, 'A', 'mermaid')).toBe(1);
    expect(levelOf(state, 'A', 'tiger')).toBe(1);

    const view = director.view();
    expect(view.chapter).toBe(2);
    expect(view.waiting).toBe('skill');
    expect(view.allowedSkills).toEqual(['mermaid']);
    // 기술을 고르는 단계는 서버 상태로도 그렇게 세워져 있어야 한다 — 안 그러면 화면에
    // 행동 선택 칸이 살아나지 않는다.
    expect(state.pendingChoice).toBe('A');
  });

  it('2장에서 기술 넷을 쓰는 동안 턴이 넘어가지 않는다 — 요구 2-2', () => {
    const { state, director } = playChapter1();
    const turnBefore = state.turn;

    for (const step of CHAPTER_2) {
      if (step.kind !== 'skill') break;
      expect(state.pendingChoice).toBe('A');
      director.chooseSkill(state, step.animal);
      // 한 번도 상대에게 넘어가지 않는다. 넘어가면 CPU가 끼어들어 대본이 끊긴다.
      expect(state.activeTeam).toBe('A');
      expect(state.turn).toBe(turnBefore);
      expect(state.phase).toBe('playing');
    }
    // 마지막 기술(실용신양) 다음은 장소를 누르는 줄이라 대기 상태가 풀려 있어야 한다 —
    // 남아 있으면 그 클릭이 "지금은 스킬을 선택할 차례입니다"로 거부된다.
    expect(state.pendingChoice).toBeNull();
    expect(director.view().waiting).toBe('click');
  });

  it('인어 → 호랑이 순서가 실제로 증폭으로 이어진다', () => {
    const { state, director } = playChapter1();

    director.chooseSkill(state, 'mermaid');
    // 인어는 스스로 배율을 쓰지 않고 레벨만큼 더한다(합연산) — 1 + 1 = 2.
    expect(state.teams.A.pendingMultiplier).toBe(2);

    const hpBefore = { A: state.teams.A.hp, B: state.teams.B.hp };
    const [tigerEvent] = director.chooseSkill(state, 'tiger');
    expect(tigerEvent).toMatchObject({ type: 'skillApplied', animal: 'tiger', multiplierUsed: 2 });
    // 호랑이 Lv1 × 배율 2 = 2를 강탈한다(보존형 — 내가 얻은 만큼 상대가 잃는다).
    expect(state.teams.B.hp).toBe(hpBefore.B - 2);
    expect(state.teams.A.hp).toBe(hpBefore.A + 2);
    // 쓰고 나면 배율은 1로 돌아간다.
    expect(state.teams.A.pendingMultiplier).toBe(1);
  });

  it('대본에 없는 기술·장소를 누르면 아무 일도 일어나지 않는다', () => {
    const { state, director } = playChapter1();
    const snapshot = JSON.stringify(state);

    expect(director.chooseSkill(state, 'tiger')).toEqual([]); // 지금은 인어 차례다
    expect(director.draw(state, 'house')).toEqual([]);        // 지금은 기술 차례다
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('2장 마지막 클릭이 예약 뽑기를 먼저 터뜨리고, 정산 앞에서 멈춰 선다', () => {
    const { state, director } = playChapters({ stopBeforeLastResume: true });

    // 화면이 [계속 ▶]을 띄운 채 기다리고, 아직 아무 카드도 걷어가지 않았다.
    expect(director.view().waiting).toBe('continue');
    expect(state.stacks.sheep.filter(c => c.collectedBy === null).length).toBe(2);

    const events = director.resume(state);
    expect(events).toEqual([expect.objectContaining({ type: 'collect', animal: 'sheep', exp: 25 })]);
    // 대본이 끝났으므로 더는 누를 것이 없다.
    expect(director.view().waiting).toBe('done');
    expect(state.pendingChoice).toBeNull();
  });

  it('마지막 클릭의 예약분이 클릭한 카드보다 **먼저** 날아온다', () => {
    // 엔진(drawCard)의 순서와 같아야 한다 — 예약분 → 클릭한 장소 → 정산.
    const { lastDrawEvents } = playChapters();
    const last = CHAPTER_2[CHAPTER_2.length - 1] as DemoDrawStep;

    expect(lastDrawEvents[0]).toMatchObject({ type: 'bonusDraws', count: last.extras!.length });
    const drawn = lastDrawEvents.filter(e => e.type === 'draw');
    expect(drawn.length).toBe(last.extras!.length + 1);
    // 관람객이 누른 장소의 카드가 마지막이다.
    expect(drawn[drawn.length - 1]).toMatchObject({ type: 'draw', place: last.place });
  });
});

/** 시연 방과 같은 규칙으로 시작한 판 하나 + 감독. */
function setup() {
  const state = initGame(['시연자'], ['컴퓨터'], Math.random, DEMO_SETTINGS);
  const director = new DemoDirector();
  director.start(state); // 시작 공유 카드 2장을 걷어낸다
  return { state, director };
}

/** 1장을 끝까지 눌러 본다(멈춤이 뜨면 [계속]까지). */
function playChapter1() {
  const { state, director } = setup();
  for (const step of CHAPTER_1) {
    director.draw(state, step.place);
    if (director.view().waiting === 'continue') director.resume(state);
  }
  return { state, director };
}

/**
 * 1장 + 2장을 끝까지. 마지막 정산 직전에 멈춰 세우고 싶으면 stopBeforeLastResume.
 * 검산에 필요한 중간값(예약 횟수·마지막 클릭의 이벤트)도 함께 돌려준다.
 */
function playChapters({ stopBeforeLastResume = false } = {}) {
  const { state, director } = playChapter1();
  let reservedAtLastDraw = 0;
  let lastDrawEvents: ReturnType<DemoDirector['draw']> = [];

  for (const step of CHAPTER_2) {
    if (step.kind === 'skill') {
      director.chooseSkill(state, step.animal);
      continue;
    }
    // 예약 횟수는 뽑기가 소모해 버리므로 부르기 직전에 챙겨 둔다.
    reservedAtLastDraw = state.teams[state.activeTeam].pendingExtraDraws;
    lastDrawEvents = director.draw(state, step.place);
    if (director.view().waiting === 'continue') {
      if (stopBeforeLastResume) break;
      director.resume(state);
    }
  }

  return { state, director, reservedAtLastDraw, lastDrawEvents };
}

/** 대본에 적힌 모든 카드(관람객이 누르는 것 + 예약 뽑기로 저절로 나오는 것). */
function allScriptedCards(): { place: Place; animal: Animal; num: CardNum }[] {
  const cards: { place: Place; animal: Animal; num: CardNum }[] = [];
  for (const chapter of CHAPTERS) {
    for (const step of chapter.steps) {
      if (step.kind !== 'draw') continue;
      cards.push({ place: step.place, animal: step.animal, num: step.num });
      for (const extra of step.extras ?? []) cards.push(extra);
    }
  }
  return cards;
}

/**
 * 뽑기 대본을 짝수 정산 규칙만으로 따라가 본다(엔진을 쓰지 않는 독립 계산).
 * 카드를 한 장씩 쌓고, 그 동물의 미획득 장수가 짝수가 되면 전부 걷어 경험치로 옮긴다.
 */
function simulateDraws(steps: DemoDrawStep[]) {
  const open: Record<Animal, number[]> = { sheep: [], rabbit: [], mermaid: [], tiger: [] };
  const exp: Record<Animal, number> = { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 };
  const settledAt: number[] = [];

  steps.forEach((step, i) => {
    open[step.animal].push(step.num);
    if (open[step.animal].length % 2 === 0) {
      exp[step.animal] += open[step.animal].reduce((a, b) => a + b, 0);
      open[step.animal] = [];
      settledAt.push(i);
    }
  });

  const leftover = ANIMALS.filter(a => open[a].length > 0);
  return { exp, settledAt, leftover };
}
