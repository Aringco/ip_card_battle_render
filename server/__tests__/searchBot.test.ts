import { initEnhanceGame, initGame, initIndividualGame } from '../engine/turnManager';
import { candidatesOf, heuristicDecision, isLegalDecision, searchDecision, applyDecision } from '../ai/searchBot';
import { ENHANCE_SETTINGS, PLAYER_COLORS } from 'shared';
import type { GameState } from 'shared';

function toBTurn(s: GameState): void {
  // A가 장소를 누르고 턴을 넘기면 B의 장소 선택 차례
  for (let i = 0; i < 20 && s.phase === 'playing' && !(s.activeTeam === 'B' && s.pendingChoice === null); i++) {
    const side = s.pendingChoice ?? s.activeTeam;
    applyDecision(s, side, heuristicDecision(s, side)!, Math.random);
  }
}

describe('탐색 봇', () => {
  it('고르는 수는 언제나 지금 둘 수 있는 수다(일반 · 강화)', () => {
    for (const enhance of [false, true]) {
      const s = enhance ? initEnhanceGame(['a'], ['b'], Math.random, ENHANCE_SETTINGS) : initGame(['a'], ['b'], Math.random);
      for (let step = 0; step < 60 && s.phase === 'playing'; step++) {
        const side = s.enhance?.acorn?.offer ? (s.enhance.acorn.offer.picked.A === null ? 'A' : 'B') : (s.pendingChoice ?? s.activeTeam);
        const r = searchDecision(s, side, { budgetMs: 5, maxRollouts: 12 });
        if (candidatesOf(s, side).length === 0) { expect(r.decision).toBeNull(); break; }
        expect(r.decision).not.toBeNull();
        expect(isLegalDecision(s, side, r.decision!)).toBe(true);
        applyDecision(s, side, r.decision!, Math.random);
      }
    }
  });

  it('받은 상태를 고치지 않는다', () => {
    const s = initEnhanceGame(['a'], ['b'], Math.random, ENHANCE_SETTINGS);
    toBTurn(s);
    const before = JSON.stringify(s);
    searchDecision(s, 'B', { budgetMs: 5, maxRollouts: 20 });
    expect(JSON.stringify(s)).toBe(before);
  });

  it('장소 후보는 직전 장소를 뺀 셋', () => {
    const s = initGame(['a'], ['b'], Math.random);
    toBTurn(s);
    const c = candidatesOf(s, 'B');
    expect(c).toHaveLength(3);
    expect(c.every(d => d.kind === 'place' && d.place !== s.lastPlace)).toBe(true);
  });

  it.each([false, true])('개인전(강화 %s) — 대상까지 고른 수가 언제나 둘 수 있는 수이고, 판이 끝까지 간다', enhance => {
    const players = [0, 1, 2, 3].map(i => ({ side: `p${i + 1}`, nickname: `b${i}`, color: PLAYER_COLORS[i].id }));
    const s = initIndividualGame(players, Math.random, enhance ? ENHANCE_SETTINGS : undefined, enhance);
    let targeted = 0;
    for (let step = 0; step < 3000 && s.phase === 'playing'; step++) {
      const offer = s.enhance?.acorn?.offer;
      const side = offer ? Object.keys(offer.picked).find(k => offer.picked[k] === null)! : (s.pendingChoice ?? s.activeTeam);
      // 탐색은 가끔만(테스트 시간) — 나머지는 규칙형으로 판을 굴린다
      const d = step % 7 === 0
        ? searchDecision(s, side, { budgetMs: 5, maxRollouts: 8 }).decision
        : heuristicDecision(s, side);
      expect(d).not.toBeNull();
      expect(isLegalDecision(s, side, d!)).toBe(true);
      if (d!.kind === 'skill' && d!.target) targeted++;
      applyDecision(s, side, d!, Math.random);
    }
    expect(s.phase).toBe('ended');
    expect(targeted).toBeGreaterThan(0);
  });
});
