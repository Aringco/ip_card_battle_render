import { ANIMALS, THRESHOLDS, PLACES, PLACE_ANIMALS, SETTINGS_LIMITS, clampSettings, festivalDrawInfoAt } from 'shared';
import type { Animal, CardNum, GameEvent, GameState, Place, Team } from 'shared';
import { isDemoRequest } from '../demo/trigger';
import { CHAPTER_1, CHAPTER_2, CHAPTER_3, CHAPTER_4, CHAPTERS, DEMO_SETTINGS, SCENES } from '../demo/script';
import type { DemoDrawStep, DemoScene, DemoTurnStep } from '../demo/script';
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

describe('3장 대본 검산', () => {
  it('턴을 넘기는 줄은 맨 앞 하나뿐이고, 그 줄이 축제를 연다', () => {
    // 이 성질이 깨지면 "클릭 다음의 [계속]은 곧 정산"이라는 전제가 무너진다 — 진행자가
    // 정산 연출 도중 무심코 [계속]을 눌러도 턴이 먼저 넘어가지 않는 근거이고, 아래
    // playChapter3이 멈춤과 턴 넘김을 구분하는 근거이기도 하다.
    const turnLines = CHAPTER_3.map((s, i) => (s.kind === 'turn' ? i : -1)).filter(i => i >= 0);
    expect(turnLines).toEqual([0]);
    expect((CHAPTER_3[0] as DemoTurnStep).openFestival).toBe(true);
  });

  it('세 턴을 보여주고, 도토리 장수가 2 · 2 · 4로 오른다', () => {
    // 가운데 턴이 "한 번 터지고 끝나는 보너스가 아니다"를, 마지막 턴이 "k턴마다 한 단계
    // 오른다"를 맡는다. 두 턴으로 줄이면 둘 중 하나는 보여줄 수 없다.
    const counts = CHAPTER_3.filter(s => s.kind === 'draw').map(s => s.festivalExtras?.length ?? 0);
    expect(counts).toEqual([2, 2, 4]);
  });

  it('첫 클릭만 턴을 넘기지 않는다 — 축제 진입은 그 앞 [계속]이 이미 넘겼다', () => {
    const draws = CHAPTER_3.filter(s => s.kind === 'draw');
    expect(draws.map(s => s.advanceTurnFirst ?? false)).toEqual([false, true, true]);
  });
});

describe('감독이 3장을 대본대로 여는가', () => {
  it('축제가 열리고 배너 이벤트가 정확히 한 번 나간다', () => {
    // state.festival을 직접 세우면 이 이벤트가 안 나가 배너가 뜨지 않는다(주의 10).
    const { state, events } = playChapter3();
    expect(state.festival).toBe(true);
    expect(events.filter(e => e.type === 'festival')).toHaveLength(1);
  });

  it('턴이 2 → 3 → 4로 오르고, 도토리 예약이 매 턴 대본의 장수와 같다', () => {
    // 예약 횟수는 대본이 고르는 값이 아니라 festivalDrawInfoAt이 정하는 값이다 —
    // 어긋나면 도토리 진행도("4장 중 2장")와 실제로 날아오는 카드 수가 맞지 않는다.
    const { turns, festivalCounts, reserved } = playChapter3();
    expect(turns).toEqual([2, 3, 4]);
    expect(festivalCounts).toEqual([2, 2, 4]);
    expect(festivalCounts).toEqual(reserved);
  });

  it('3장 내내 차례가 상대에게 넘어가지 않는다 — 주의 9', () => {
    // 턴은 넘기되(축제 예약이 턴 교대에 딸려 오므로) 상대 차례는 감독이 삼킨다.
    // 한 번이라도 B에 머물면 CPU가 끼어들 틈이 생기고 대본이 끊긴다.
    const { activeTeams, state } = playChapter3();
    expect(activeTeams.every(t => t === 'A')).toBe(true);
    expect(state.pendingChoice).toBeNull();
  });

  it('상대에게 밀린 도토리 예약을 남겨 두지 않는다', () => {
    // 넘어가는 길에 상대에게도 예약이 걸리는데, 상대는 한 수도 두지 않아 영영 쌓인다.
    // 남겨 두면 4장에서 상대가 처음 두는 순간 밀린 도토리가 통째로 터진다.
    const { state } = playChapter3();
    expect(state.teams.B.pendingFestivalDraws).toBe(0);
    expect(state.teams.A.pendingFestivalDraws).toBe(0);
  });

  it('정산이 세 번 일어나고, 마지막엔 두 종류가 한꺼번에 걷힌다', () => {
    // 대본의 숫자를 고치면 여기가 먼저 깨진다 — 어느 동물이 언제 짝을 맞추는지가
    // 그대로 자막(settleCaption)의 내용이기 때문이다.
    const { collected } = playChapter3();
    expect(collected).toEqual([['mermaid'], ['tiger'], ['sheep', 'rabbit']]);
  });

  it('멈춤 자리마다 안내 문구가 준비돼 있다', () => {
    const { collected } = playChapter3();
    CHAPTER_3.filter(s => s.kind === 'draw').forEach((step, i) => {
      if (collected[i].length > 0) expect(step.settleCaption).toBeTruthy();
      else expect(step.settleCaption).toBeUndefined();
    });
  });

  it('3장을 끝내면 4장의 결말 고르기로 넘어간다', () => {
    const { director } = playChapter3();
    const view = director.view();
    expect(view.chapter).toBe(4);
    expect(view.waiting).toBe('scene');
    expect(view.scenes?.map(s => s.key)).toEqual(SCENES.map(s => s.key));
    // 고르는 화면에서는 판을 누를 수 없고, 되돌아갈 장면도 아직 없다.
    expect(view.allowedPlaces).toEqual([]);
    expect(view.allowedSkills).toEqual([]);
    expect(view.replay).toBe(false);
  });

  it('축제가 열려도 체력은 그대로다 — 3장은 기술을 쓰지 않는다', () => {
    // 3장은 turnManager.advanceTurn을 직접 부르므로 checkKnockout이 돌지 않는다.
    // 체력이 움직이지 않는 장이라 그래도 되는 것이니, 그 전제를 여기서 못박는다.
    const { state } = playChapters();
    const before = { A: state.teams.A.hp, B: state.teams.B.hp };
    const after = playChapter3().state;
    expect({ A: after.teams.A.hp, B: after.teams.B.hp }).toEqual(before);
  });
});

describe('4장 대본 검산', () => {
  it('장면은 셋이고 key가 서로 다르다', () => {
    // key는 화면이 되돌려 보내는 값이다 — 겹치면 엉뚱한 장면이 시작된다.
    expect(SCENES).toHaveLength(3);
    expect(new Set(SCENES.map(s => s.key)).size).toBe(3);
  });

  it('이기는 장면 둘, 지는 장면 하나 — 그리고 지는 장면이 마지막이다', () => {
    // 승리 조건이 둘이라 승리 장면도 둘이어야 한다(때려서 이기는 길 · 채워서 이기는 길).
    // 목록의 첫 줄이 기본 시선이라, 거기에 패배를 두면 "지는 게임"처럼 읽힌다.
    expect(SCENES.map(s => s.winner)).toEqual(['A', 'A', 'B']);
  });

  it('세 장면 모두 디자인어로 시작한다 — 배율이 숫자의 출처다', () => {
    for (const scene of SCENES) {
      const first = scene.steps[0];
      expect(first.kind === 'skill' || first.kind === 'enemy').toBe(true);
      expect((first as { animal: Animal }).animal).toBe('mermaid');
    }
  });

  it('패배 장면만 상대 차례로 시작하고, 그 장면의 수는 전부 상대가 둔다', () => {
    // 관람객이 자기 손으로 자신을 지게 만들 수는 없다 — 그 장면은 보기만 하는 장면이다.
    for (const scene of SCENES) {
      const enemyTurn = scene.setup.activeTeam === 'B';
      expect(enemyTurn).toBe(scene.winner === 'B');
      for (const step of scene.steps) {
        expect(step.kind).toBe(enemyTurn ? 'enemy' : 'skill');
      }
    }
  });

  it('장면이 시작되는 순간에는 아직 아무도 이기고 있지 않다', () => {
    // setup이 이미 승리선(=targetScore×2)이나 0에 닿아 있으면, 첫 수를 두기도 전에
    // 끝난 판을 보여주는 셈이 된다.
    const winHp = clampSettings(DEMO_SETTINGS).targetScore * 2;
    for (const scene of SCENES) {
      for (const team of ['A', 'B'] as const) {
        expect(scene.setup.hp[team]).toBeGreaterThan(0);
        expect(scene.setup.hp[team]).toBeLessThan(winHp);
      }
    }
  });

  it('4장의 대본은 고르는 줄 하나뿐이다 — 소모되지 않는 메뉴다', () => {
    expect(CHAPTER_4).toHaveLength(1);
    expect(CHAPTER_4[0].kind).toBe('menu');
  });
});

describe('감독이 4장의 세 결말을 보여주는가', () => {
  it('강탈승 — 배율 10배를 실은 특허랑이가 상대 체력을 통째로 가져온다', () => {
    const { state, director } = playChapter3();
    const events = playScene(state, director, 'steal');

    expect(events[0]).toMatchObject({ type: 'skillApplied', team: 'A', animal: 'mermaid', level: 9, multiplierAfter: 10 });
    // 강탈은 보존형이다 — 50을 노려도 상대가 가진 36까지만 움직인다(자막도 그렇게 적혀 있다).
    expect(events[1]).toMatchObject({
      type: 'skillApplied', team: 'A', animal: 'tiger',
      level: 5, multiplierUsed: 10, oppHpDelta: -36, myHpDelta: 36,
    });
    expect(events[2]).toMatchObject({ type: 'gameEnd', winner: 'A', reason: 'knockout' });
    expect({ A: state.teams.A.hp, B: state.teams.B.hp }).toEqual({ A: 56, B: 0 });
    expect(state.phase).toBe('ended');
  });

  it('회복승 — 체력 4에서 상표토끼 한 방으로 승리선을 넘는다', () => {
    const { state, director } = playChapter3();
    const events = playScene(state, director, 'heal');

    expect(events[0]).toMatchObject({ type: 'skillApplied', animal: 'mermaid', level: 7, multiplierAfter: 8 });
    expect(events[1]).toMatchObject({
      type: 'skillApplied', animal: 'rabbit', level: 5, multiplierUsed: 8, myHpDelta: 40,
    });
    expect(events[2]).toMatchObject({ type: 'gameEnd', winner: 'A' });
    // 승리선은 targetScore×2 = 40이다. 때리지 않고 채워서 이기는 길이 있다는 것이 이 장면의 전부다.
    expect(state.teams.A.hp).toBe(44);
    expect(state.teams.B.hp).toBe(20);
  });

  it('패배 — 상대가 배율을 쌓고 특허랑이로 내 체력을 전부 빼앗는다', () => {
    const { state, director } = playChapter3();
    const events = playScene(state, director, 'defeat');

    // 두 수 모두 상대(B)가 둔다 — 관람객은 [계속]으로 넘기기만 한다.
    expect(events[0]).toMatchObject({ type: 'skillApplied', team: 'B', animal: 'mermaid', level: 9, multiplierAfter: 10 });
    expect(events[1]).toMatchObject({ type: 'skillApplied', team: 'B', animal: 'tiger', level: 4, multiplierUsed: 10, oppHpDelta: -32 });
    expect(events[2]).toMatchObject({ type: 'gameEnd', winner: 'B', reason: 'knockout' });
    expect(state.teams.A.hp).toBe(0);
  });

  it('장면 도중에는 행동 선택 칸이 대본이 연 한 칸만 살아 있다', () => {
    const { state, director } = playChapter3();
    director.chooseScene(state, 'steal');

    let view = director.view();
    expect(view.chapter).toBe(4);
    expect(view.waiting).toBe('skill');
    expect(view.allowedSkills).toEqual(['mermaid']);
    // 화면의 행동 선택 칸은 서버의 pendingChoice가 서 있어야 살아난다.
    expect(state.pendingChoice).toBe('A');

    director.chooseSkill(state, 'mermaid');
    view = director.view();
    expect(view.allowedSkills).toEqual(['tiger']);
    expect(state.pendingChoice).toBe('A');
  });

  it('패배 장면에서는 행동 선택 칸이 살아나지 않는다 — 내 차례가 아니다', () => {
    const { state, director } = playChapter3();
    director.chooseScene(state, 'defeat');

    expect(state.activeTeam).toBe('B');
    expect(state.pendingChoice).toBeNull();
    expect(director.view().waiting).toBe('continue');
    expect(director.view().allowedSkills).toEqual([]);
  });

  it('세 결말을 이어서 볼 수 있고, 두 번째도 첫 번째와 똑같은 숫자가 나온다', () => {
    // 4장의 setup이 **절대값**이어야 하는 이유가 이것이다. 앞 장면이 남긴 배율·경험치가
    // 하나라도 살아 있으면 두 번째부터 자막에 적어 둔 숫자와 화면이 어긋난다.
    const { state, director } = playChapter3();
    const first = playScene(state, director, 'steal');
    director.restart(state);
    playScene(state, director, 'defeat');
    director.restart(state);
    const again = playScene(state, director, 'steal');

    expect(again).toEqual(first);
  });

  it('다른 결말 보기는 판을 중립으로 되돌리고 고르는 화면으로 돌아온다', () => {
    const { state, director } = playChapter3();
    playScene(state, director, 'steal');
    expect(director.view().replay).toBe(true);

    director.restart(state);

    const view = director.view();
    expect(view.waiting).toBe('scene');
    expect(view.replay).toBe(false);
    expect(state.phase).toBe('playing');
    expect(state.winner).toBeNull();
    // 3장이 열어 둔 축제와 남은 예약·배율까지 함께 걷힌다 — 남으면 다음 장면의 첫 수가
    // 예고 없이 증폭되거나 밀린 도토리가 뒤늦게 터진다.
    expect(state.festival).toBe(false);
    for (const team of ['A', 'B'] as const) {
      expect(state.teams[team].hp).toBe(state.settings.targetScore);
      expect(state.teams[team].pendingMultiplier).toBe(1);
      expect(state.teams[team].pendingFestivalDraws).toBe(0);
      expect(state.teams[team].exp).toEqual({ sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 });
      expect(state.teams[team].skillStats.tiger.count).toBe(0);
    }
  });

  it('대본에 없는 장면을 고르면 아무 일도 일어나지 않는다', () => {
    const { state, director } = playChapter3();
    const snapshot = JSON.stringify(state);

    expect(director.chooseScene(state, 'nope')).toEqual([]);
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(director.view().waiting).toBe('scene');
  });

  it('고르기 전에는 계속 버튼이 아무 일도 하지 않는다', () => {
    // 고르는 화면에서 습관적으로 누른 스페이스가 임의의 장면을 시작하면 안 된다.
    const { state, director } = playChapter3();
    const snapshot = JSON.stringify(state);

    expect(director.resume(state)).toEqual([]);
    expect(JSON.stringify(state)).toBe(snapshot);
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
    // 2장이 끝나면 곧바로 3장의 첫 줄(축제를 여는 [계속 ▶])로 넘어가 있다 — 누를 장소도
    // 기술도 없는 자리라, 장이 바뀐 것을 대기 상태만으로는 알 수 없어 chapter까지 본다.
    const view = director.view();
    expect(view.chapter).toBe(3);
    expect(view.waiting).toBe('continue');
    expect(view.allowedPlaces).toEqual([]);
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
    if (step.kind !== 'draw') {
      if (step.kind === 'skill') director.chooseSkill(state, step.animal);
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

/**
 * 1·2장을 끝낸 뒤 3장을 끝까지. 검산에 필요한 중간값을 함께 모아 돌려준다.
 *
 * ⚠️ **멈춤과 턴 넘김은 둘 다 view가 'continue'다.** 클릭 직후 그 줄에 그대로 머물러
 *    있으면(step이 아직 이 줄이면) 짝이 맞아 멈춘 것이고, 다음 줄로 넘어가 있으면
 *    멈추지 않은 것이다 — 그 구분을 진행도로 한다.
 */
function playChapter3() {
  const { state, director } = playChapters();
  const events: GameEvent[] = [];
  const turns: number[] = [];
  const festivalCounts: number[] = [];
  const reserved: number[] = [];
  const collected: Animal[][] = [];
  const activeTeams: Team[] = [];

  CHAPTER_3.forEach((step, i) => {
    if (step.kind !== 'draw') {
      events.push(...director.resume(state));
      activeTeams.push(state.activeTeam);
      return;
    }

    const drawEvents = director.draw(state, step.place);
    events.push(...drawEvents);
    turns.push(state.turn);

    const festivalEvent = drawEvents.find(e => e.type === 'festivalDraws');
    festivalCounts.push(festivalEvent?.type === 'festivalDraws' ? festivalEvent.count : 0);
    // 엔진이 이 턴에 실제로 예약하는 횟수 — 대본의 장수와 같아야 한다.
    reserved.push(festivalDrawInfoAt(state.turn, state.settings).count);

    if (director.view().waiting === 'continue' && director.view().step === i + 1) {
      const settled = director.resume(state);
      events.push(...settled);
      collected.push(
        settled
          .filter((e): e is Extract<GameEvent, { type: 'collect' }> => e.type === 'collect')
          .map(e => e.animal),
      );
    } else {
      collected.push([]);
    }
    activeTeams.push(state.activeTeam);
  });

  return { state, director, events, turns, festivalCounts, reserved, collected, activeTeams };
}

/**
 * 4장의 장면 하나를 고르고 끝까지 본다(고르는 화면 앞에서 부른다).
 *
 * 화면이 하는 일을 그대로 흉내 낸다 — 열린 것이 기술이면 그 칸을 누르고, 멈춰 서 있으면
 * [계속]을 누른다. 판이 끝나면 done이 되어 멈춘다.
 */
function playScene(state: GameState, director: DemoDirector, key: string) {
  director.chooseScene(state, key);

  const events: GameEvent[] = [];
  for (let guard = 0; guard < 10; guard++) {
    const view = director.view();
    if (view.waiting === 'skill') events.push(...director.chooseSkill(state, view.allowedSkills[0]));
    else if (view.waiting === 'continue') events.push(...director.resume(state));
    else break;
  }
  return events;
}

/** 대본에 적힌 모든 카드(관람객이 누르는 것 + 예약 뽑기로 저절로 나오는 것). */
function allScriptedCards(): { place: Place; animal: Animal; num: CardNum }[] {
  const cards: { place: Place; animal: Animal; num: CardNum }[] = [];
  for (const chapter of CHAPTERS) {
    for (const step of chapter.steps) {
      if (step.kind !== 'draw') continue;
      cards.push({ place: step.place, animal: step.animal, num: step.num });
      // 예약 뽑기로 저절로 나오는 카드도 관람객 눈에는 똑같은 카드다 — 실용신양 몫과
      // 도토리 축제 몫 모두 장소·동물·숫자 검산을 함께 받아야 한다.
      for (const extra of [...(step.extras ?? []), ...(step.festivalExtras ?? [])]) cards.push(extra);
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
