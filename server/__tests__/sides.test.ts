import { initGame, initIndividualGame } from '../engine/turnManager';
import { activeSides, nextActiveSide, opponentsOf } from 'shared';
import type { GameState } from 'shared';

// 편 헬퍼 — 팀전 2편과 개인전 N편에서 같은 규칙으로 "상대"와 "다음 차례"를 구한다.

describe('팀전(2편)', () => {
  it('선공 A: 활성 편은 [A, B], A의 상대는 [B], A 다음은 B', () => {
    const s = initGame(['a'], ['b'], () => 0, { firstTeam: 'A' });
    expect(activeSides(s)).toEqual(['A', 'B']);
    expect(opponentsOf(s, 'A')).toEqual(['B']);
    expect(opponentsOf(s, 'B')).toEqual(['A']);
    expect(nextActiveSide(s, 'A')).toBe('B');
    expect(nextActiveSide(s, 'B')).toBe('A');
  });

  it('선공 B: turnOrder가 [B, A]라도 상대·다음 차례는 그대로다', () => {
    const s = initGame(['a'], ['b'], () => 0, { firstTeam: 'B' });
    expect(s.turnOrder).toEqual(['B', 'A']);
    expect(opponentsOf(s, 'A')).toEqual(['B']);
    expect(nextActiveSide(s, 'B')).toBe('A');
  });
});

function fivePlayers(): GameState {
  return initIndividualGame(
    [1, 2, 3, 4, 5].map(i => ({ side: `p${i}`, nickname: `n${i}`, color: 'red' as const })),
    () => 0,
  );
}

describe('개인전(5편)', () => {
  it('상대는 나를 뺀 활성 편 전원이다', () => {
    const s = fivePlayers();
    expect(opponentsOf(s, 'p1')).toHaveLength(4);
    expect(opponentsOf(s, 'p1')).not.toContain('p1');
  });

  it('turnOrder 순서대로 다음 편을 돌려주고, 끝에서는 처음으로 돌아온다', () => {
    const s = fivePlayers();
    const order = s.turnOrder;
    expect(nextActiveSide(s, order[0])).toBe(order[1]);
    expect(nextActiveSide(s, order[4])).toBe(order[0]);
  });

  it('순위가 정해진 편은 활성·상대·다음 차례에서 빠진다', () => {
    const s = fivePlayers();
    const order = s.turnOrder;
    s.teams[order[1]].finish = { rank: 5, reason: 'out' };
    expect(activeSides(s)).toEqual([order[0], order[2], order[3], order[4]]);
    expect(opponentsOf(s, order[0])).not.toContain(order[1]);
    expect(nextActiveSide(s, order[0])).toBe(order[2]); // order[1]을 건너뛴다
  });

  it('자신이 방금 순위가 정해졌어도 그 자리에서부터 다음을 센다', () => {
    const s = fivePlayers();
    const order = s.turnOrder;
    s.teams[order[2]].finish = { rank: 1, reason: 'win' };
    expect(nextActiveSide(s, order[2])).toBe(order[3]);
  });

  it('나 말고 활성 편이 없으면 null', () => {
    const s = fivePlayers();
    const order = s.turnOrder;
    for (const side of order.slice(1)) s.teams[side].finish = { rank: 2, reason: 'out' };
    expect(nextActiveSide(s, order[0])).toBeNull();
  });
});
