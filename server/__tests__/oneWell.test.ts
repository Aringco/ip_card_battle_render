import { initGame } from '../engine/turnManager';
import { processPlayerAction, processSkillChoice, processPass, processTimeout } from '../engine/gameEngine';
import { eligibleAnimals, randomEligibleSkill } from '../engine/skills';
import { ONE_WELL_ALLOWED, ONE_WELL_SETTINGS, PLACES, clampSettings } from 'shared';
import type { Animal, GameState } from 'shared';

/**
 * 이벤트 '한 우물만 파기'(EVENT_MODE_ROADMAP.md §1-3·§3-3)의 엔진 규칙.
 * - 도전자 편(A)은 상표토끼·특허랑이만 쓸 수 있다(실용신양·디자인어는 처음부터 잠김).
 * - 둘 중 하나를 처음 쓰는 순간 그 카드로 고정된다 — 시간초과로 서버가 대신 고른 경우도 똑같이.
 * - 상대(B, CPU)는 제한이 없다.
 * - 기술을 한 번도 쓰지 않으면 이길 수 없다(그래서 "고정 없이 승리"를 판정하지 않는다).
 */

function oneWellGame(): GameState {
  const state = initGame(['도전자'], ['CPU'], () => 0.3, clampSettings(ONE_WELL_SETTINGS));
  state.oneWell = { side: 'A', allowed: [...ONE_WELL_ALLOWED], locked: null };
  return state;
}

/** 네 동물 모두 레벨 1 이상이 되도록 경험치를 채우고, A가 기술을 고를 차례로 만든다. */
function readyToChoose(state: GameState, team: 'A' | 'B' = 'A'): GameState {
  state.teams[team].exp = { sheep: 30, rabbit: 30, mermaid: 40, tiger: 40 };
  state.activeTeam = team;
  state.pendingChoice = team;
  return state;
}

describe('한 우물만 파기 — 잠금', () => {
  it('실용신양·디자인어는 처음부터 고를 수 없다', () => {
    const state = readyToChoose(oneWellGame());
    expect(eligibleAnimals(state, 'A').sort()).toEqual(['rabbit', 'tiger']);
    const { events } = processSkillChoice(state, 'sheep');
    expect(events).toEqual([]);
    expect(processSkillChoice(state, 'mermaid').events).toEqual([]);
  });

  it('처음 쓴 카드로 고정되고, 이후 다른 허용 카드는 거부된다', () => {
    const state = readyToChoose(oneWellGame());
    const { events } = processSkillChoice(state, 'rabbit');
    const applied = events.find(e => e.type === 'skillApplied');
    expect(applied).toMatchObject({ animal: 'rabbit', oneWellLocked: 'rabbit' });
    expect(state.oneWell?.locked).toBe('rabbit');

    // 다음 A 차례 — 특허랑이는 레벨이 있어도 잠겼다.
    readyToChoose(state);
    expect(eligibleAnimals(state, 'A')).toEqual(['rabbit']);
    expect(processSkillChoice(state, 'tiger').events).toEqual([]);
    // 고정된 카드는 계속 쓸 수 있고, 두 번째부터는 고정 표시가 다시 실리지 않는다.
    const again = processSkillChoice(state, 'rabbit').events.find(e => e.type === 'skillApplied');
    expect(again).toMatchObject({ animal: 'rabbit' });
    expect(again && 'oneWellLocked' in again).toBe(false);
  });

  it('시간초과로 서버가 대신 고른 기술도 고정된다(엔진 안에서 세우므로)', () => {
    const state = readyToChoose(oneWellGame());
    const { events } = processTimeout(state, () => 0.99);
    const choice = events.find(e => e.type === 'timeoutChoice');
    expect(choice && choice.type === 'timeoutChoice' && ONE_WELL_ALLOWED.includes(choice.animal as Animal)).toBe(true);
    expect(state.oneWell?.locked).toBe(choice && choice.type === 'timeoutChoice' ? choice.animal : null);
  });

  it('잠긴 카드만 레벨이 있으면 "고를 것이 없음"이다(짧은 타이머·자동 패스)', () => {
    const state = oneWellGame();
    state.teams.A.exp = { sheep: 30, rabbit: 0, mermaid: 40, tiger: 0 };
    expect(eligibleAnimals(state, 'A')).toEqual([]);
    expect(randomEligibleSkill(state, 'A')).toBeNull();
  });

  it('상대(CPU)는 잠금이 없다', () => {
    const state = readyToChoose(oneWellGame(), 'B');
    expect(eligibleAnimals(state, 'B').sort()).toEqual(['mermaid', 'rabbit', 'sheep', 'tiger']);
    processSkillChoice(state, 'sheep');
    expect(state.oneWell?.locked).toBeNull();
  });
});

describe('한 우물만 파기 — 기술 없이는 이길 수 없다(§1-3의 전제)', () => {
  it('도전자가 기술을 한 번도 쓰지 않으면 500판 중 한 판도 이기지 못한다', () => {
    let seed = 42;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    let wins = 0;
    for (let g = 0; g < 500; g++) {
      const state = initGame(['도전자'], ['CPU'], rng, clampSettings(ONE_WELL_SETTINGS));
      state.oneWell = { side: 'A', allowed: [...ONE_WELL_ALLOWED], locked: null };
      let guard = 0;
      while (state.phase === 'playing' && guard++ < 2000) {
        const options = PLACES.filter(p => p !== state.lastPlace);
        processPlayerAction(state, options[Math.floor(rng() * options.length)], rng);
        if (state.pendingChoice === null) continue;
        if (state.pendingChoice === 'A') {
          processPass(state);
        } else {
          const pick = randomEligibleSkill(state, 'B', rng);
          if (pick === null) processPass(state);
          else processSkillChoice(state, pick);
        }
      }
      expect(state.phase).toBe('ended');
      if (state.winner === 'A') wins++;
    }
    expect(wins).toBe(0);
  });
});
