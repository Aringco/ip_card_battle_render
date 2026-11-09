import { finisherLeadMs, finisherTargets, FINISHER_GATHER_MS } from 'shared';
import type { GameEvent } from 'shared';

// 마무리 연출이 끼어드는 자리 — 화면(useAnimationQueue)과 서버(room.ts settleTimelineMs)가 같은 함수로 정한다
const skill = (animal: string, hpAfter: Record<string, number>, oppHpDelta = -10, myHpDelta = 0) =>
  ({ type: 'skillApplied', team: 'p1', animal, level: 1, myHpDelta, oppHpDelta, hpAfter }) as unknown as GameEvent;
const tick = (team: string, hpAfter: Record<string, number>) =>
  ({ type: 'enhanceTick', team, kind: 'bleed', amount: 12, turnsLeft: 0, hpAfter }) as unknown as GameEvent;

describe('finisherTargets', () => {
  it('개인전 — 체력 0(out) · 승리선(win)으로 순위가 정해진 사람에게, 그 체력 변화 앞에', () => {
    const ev: GameEvent[] = [
      skill('tiger', { p1: 50, p2: 0, p3: 40 }),
      { type: 'ranked', team: 'p2', rank: 3, reason: 'out' },
      tick('p3', { p1: 50, p3: 0 }),
      { type: 'ranked', team: 'p3', rank: 2, reason: 'out' },
      { type: 'ranked', team: 'p1', rank: 1, reason: 'last' },
      { type: 'gameEnd', winner: 'p1', reason: 'ranked' },
    ];
    expect([...finisherTargets(ev)]).toEqual([[0, 'p2'], [2, 'p3']]);
  });

  it('팀전 — 판 끝(knockout)이면 0이 된 쪽, 승리선 회복이면 이긴 쪽', () => {
    expect([...finisherTargets([skill('tiger', { A: 30, B: 0 }), { type: 'gameEnd', winner: 'A', reason: 'knockout' }])]).toEqual([[0, 'B']]);
    expect([...finisherTargets([skill('rabbit', { A: 800, B: 30 }, 0, 25), { type: 'gameEnd', winner: 'A', reason: 'knockout' }])]).toEqual([[0, 'A']]);
  });

  it('체력과 무관한 순위(항복 · 턴 제한)와 판 끝에는 끼우지 않는다', () => {
    expect(finisherTargets([{ type: 'ranked', team: 'p2', rank: 3, reason: 'forfeit' }]).size).toBe(0);
    expect(finisherTargets([skill('tiger', { A: 30, B: 5 }), { type: 'gameEnd', winner: 'A', reason: 'turnLimit' }]).size).toBe(0);
  });

  it('특허랑이는 발톱 시차만큼 덜 끼운다', () => {
    expect(finisherLeadMs(skill('tiger', {}), 500)).toBe(FINISHER_GATHER_MS - 500);
    expect(finisherLeadMs(skill('rabbit', {}), 500)).toBe(FINISHER_GATHER_MS);
  });
});
