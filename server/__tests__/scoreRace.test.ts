import { initGame, advanceTurn, checkKnockout } from '../engine/turnManager';
import { processPlayerAction, processPass } from '../engine/gameEngine';
import { PLACES, clampSettings, festivalDrawInfoAt, maxTurnOf, TIME_ATTACK_SETTINGS } from 'shared';
import type { GameState } from 'shared';

/**
 * 목표점수 달성하기(GameState.scoreRace) — 엔진 규칙.
 * 체력 즉시 승패가 꺼지고, 턴 상한이 그 판의 maxTurn이 되며, 끝나는 순간의 점수로만 승패를 가른다.
 */

const rng0 = () => 0;

function race(target: number, maxTurn = 10): GameState {
  const state = initGame(['A'], ['B'], rng0, clampSettings(TIME_ATTACK_SETTINGS));
  state.scoreRace = { side: 'A', target, maxTurn };
  state.teams.A.hp = 0;
  state.teams.B.hp = 10;
  return state;
}

/** 한 라운드(양쪽 한 번씩)를 패스로 넘긴다. */
function passRound(state: GameState) {
  for (let i = 0; i < 2 && state.phase === 'playing'; i++) advanceTurn(state);
}

describe('목표점수 달성하기 — 엔진', () => {
  it('턴 상한은 그 판의 maxTurn이다', () => {
    expect(maxTurnOf(race(15, 10))).toBe(10);
    expect(maxTurnOf(initGame(['A'], ['B'], rng0))).toBe(20);
  });

  it('체력 0도, 승리선(목표×2) 이상도 판을 끝내지 않는다', () => {
    const state = race(15);
    expect(checkKnockout(state)).toEqual([]);
    state.teams.A.hp = 999;
    state.teams.B.hp = 0;
    expect(checkKnockout(state)).toEqual([]);
    expect(state.phase).toBe('playing');
  });

  it('maxTurn 라운드가 다 돌아야 끝나고, 그때 목표 이상이면 도전자 승리(reason target)', () => {
    const state = race(15);
    for (let t = 1; t < 10; t++) passRound(state);
    expect(state.phase).toBe('playing');
    expect(state.turn).toBe(10);
    state.teams.A.hp = 15; // 마지막 턴의 점수가 기준이다(중간에 닿았는지는 묻지 않는다)
    passRound(state);
    expect(state.phase).toBe('ended');
    expect(state.winner).toBe('A');
    expect(state.turn).toBe(11);
  });

  it('목표에 한 점이라도 모자라면 상대(컴퓨터) 승리', () => {
    const state = race(15);
    for (let t = 1; t <= 10; t++) {
      if (t === 10) state.teams.A.hp = 14;
      passRound(state);
    }
    expect(state.phase).toBe('ended');
    expect(state.winner).toBe('B');
  });

  it('실제 뽑기·패스로 굴려도 10턴 뒤 target으로 끝난다', () => {
    const state = race(20);
    let ended: unknown = null;
    for (let guard = 0; guard < 500 && state.phase === 'playing'; guard++) {
      const place = PLACES.find(p => p !== state.lastPlace)!;
      processPlayerAction(state, place, rng0);
      if (state.phase !== 'playing') break;
      if (state.pendingChoice !== null) {
        const { events } = processPass(state);
        ended = events.find(e => e.type === 'gameEnd') ?? ended;
      }
    }
    expect(state.phase).toBe('ended');
    expect(ended).toMatchObject({ type: 'gameEnd', reason: 'target' });
  });

  it('축제 시작 턴이 maxTurn보다 크면 maxTurn에 열린다', () => {
    const info = festivalDrawInfoAt(10, clampSettings({ festivalTurn: 15 }), 10);
    expect(info.count).toBeGreaterThan(0);
  });
});
