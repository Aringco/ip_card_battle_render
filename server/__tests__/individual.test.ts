import { advanceTurn, initIndividualGame } from '../engine/turnManager';
import { processPass, processPlayerAction, processSkillChoice, processTimeout, processForfeit } from '../engine/gameEngine';
import { rankByHpAndEnd } from '../engine/ranking';
import { opponentsOf, MAX_TURN, DEFAULT_TARGET_SCORE, PLAYER_COLORS } from 'shared';
import type { Animal, GameEvent, GameState, SideId } from 'shared';

// 개인전(순위전) 엔진 규칙 — INDIVIDUAL_MODE_ROADMAP.md 부록 C의 E1~E19.
// 패턴은 effects.test.ts를 따른다: 결정론적 RNG, 시작 공유 카드 걷기, 경험치·체력을 직접 세팅.

const rng0 = () => 0;
const WIN_HP = DEFAULT_TARGET_SCORE * 2;
const START_HP = DEFAULT_TARGET_SCORE;

function make(n: number, settings?: Parameters<typeof initIndividualGame>[2]): GameState {
  const players = Array.from({ length: n }, (_, i) => ({
    side: `p${i + 1}`,
    nickname: `플레이어${i + 1}`,
    color: PLAYER_COLORS[i].id,
  }));
  const state = initIndividualGame(players, rng0, settings);
  state.stacks = { sheep: [], rabbit: [], mermaid: [], tiger: [] }; // 시작 공유 카드 걷기
  return state;
}

/** 지금 차례인 편이 기술을 고를 차례인 상태로 만든다(장소 뽑기를 건너뛴다). */
function toSkillPhase(state: GameState): SideId {
  state.pendingChoice = state.activeTeam;
  return state.activeTeam;
}

/** 레벨을 만들어 준다 — sheep·rabbit는 레벨당 경험치 10, mermaid·tiger는 20. */
function giveLevel(state: GameState, side: SideId, animal: Animal, level: number): void {
  state.teams[side].exp[animal] = level * (animal === 'sheep' || animal === 'rabbit' ? 10 : 20);
}

const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe('개인전 시작 (E1·E2)', () => {
  it('E1 4명: 기술 1장, turnOrder는 4편의 순열, 선은 turnOrder[0]', () => {
    const s = make(4);
    expect(s.mode).toBe('individual');
    expect(s.skillsPerTurn).toBe(1);
    expect([...s.turnOrder].sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(s.startingTeam).toBe(s.turnOrder[0]);
    expect(s.activeTeam).toBe(s.turnOrder[0]);
    expect(s.startingTeamReason).toBe('random');
    expect(Object.keys(s.teams).sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
    for (const side of s.turnOrder) {
      expect(s.teams[side].hp).toBe(START_HP);
      expect(s.teams[side].members).toHaveLength(1);
      expect(s.teams[side].color).toBeDefined();
    }
  });

  it('E2 5명·8명: 기술 2장 (시작 인원 기준)', () => {
    expect(make(5).skillsPerTurn).toBe(2);
    expect(make(8).skillsPerTurn).toBe(2);
    expect(make(2).skillsPerTurn).toBe(1);
  });

  it('시작 공유 카드 2장을 팀전과 똑같이 깐다', () => {
    const players = [1, 2, 3].map(i => ({ side: `p${i}`, nickname: `n${i}`, color: PLAYER_COLORS[i].id }));
    const s = initIndividualGame(players, rng0);
    const cards = Object.values(s.stacks).flat();
    expect(cards).toHaveLength(2);
    expect(new Set(cards.map(c => c.animal)).size).toBe(2);
  });
});

describe('차례 순서 (E3·E4·E19)', () => {
  it('E3 3명: turnOrder 순서대로 돌고 한 바퀴마다 turn이 1씩 오른다', () => {
    const s = make(3);
    const seen: SideId[] = [];
    const turns: number[] = [];
    for (let i = 0; i < 6; i++) {
      seen.push(s.activeTeam);
      advanceTurn(s);
      turns.push(s.turn);
    }
    expect(seen).toEqual([...s.turnOrder, ...s.turnOrder]);
    expect(turns).toEqual([1, 1, 2, 2, 2, 3]);
  });

  it('E4 가운데 편이 순위가 정해지면 건너뛰고, 라운드 카운터도 맞다', () => {
    const s = make(3);
    const [a, b, c] = s.turnOrder;
    s.teams[b].finish = { rank: 3, reason: 'out' };
    const seen: SideId[] = [];
    const turns: number[] = [];
    for (let i = 0; i < 4; i++) {
      seen.push(s.activeTeam);
      advanceTurn(s);
      turns.push(s.turn);
    }
    expect(seen).toEqual([a, c, a, c]);
    expect(turns).toEqual([1, 2, 2, 3]); // c → a에서 한 바퀴
  });

  it('E4 첫 편이 순위가 정해져도 라운드가 맞다 (b→c→b)', () => {
    const s = make(3);
    const [a, b, c] = s.turnOrder;
    s.teams[a].finish = { rank: 1, reason: 'win' };
    s.activeTeam = b;
    advanceTurn(s);
    expect(s.activeTeam).toBe(c);
    expect(s.turn).toBe(1);
    advanceTurn(s);
    expect(s.activeTeam).toBe(b);
    expect(s.turn).toBe(2);
  });

  it('E19 축제 뽑기는 다음 "활성" 편에게 예약된다', () => {
    const s = make(3, { festivalTurn: 1 });
    const [a, b, c] = s.turnOrder;
    s.teams[b].finish = { rank: 3, reason: 'out' };
    s.activeTeam = c;
    advanceTurn(s); // c → a, 한 바퀴 → turn 2, 축제 시작
    expect(s.festival).toBe(true);
    expect(s.teams[a].pendingFestivalDraws).toBeGreaterThan(0);
    expect(s.teams[b].pendingFestivalDraws).toBe(0);
    advanceTurn(s); // a → c (b를 건너뛴다)
    expect(s.activeTeam).toBe(c);
    expect(s.teams[c].pendingFestivalDraws).toBeGreaterThan(0);
    expect(s.teams[b].pendingFestivalDraws).toBe(0);
  });
});

describe('특허랑이의 대상 (E5·E6)', () => {
  it('E5 정상 대상: 대상 체력이 빠지고 내 체력이 오른다, skillApplied.target', () => {
    const s = make(4);
    const me = toSkillPhase(s);
    const [foe] = opponentsOf(s, me);
    giveLevel(s, me, 'tiger', 1);
    const { events } = processSkillChoice(s, 'tiger', foe);
    const ev = ofType(events, 'skillApplied')[0];
    expect(ev.target).toBe(foe);
    expect(ev.oppHpDelta).toBe(-1);
    expect(s.teams[foe].hp).toBe(START_HP - 1);
    expect(s.teams[me].hp).toBe(START_HP + 1);
    expect(ev.hpAfter[foe]).toBe(START_HP - 1);
    expect(Object.keys(ev.hpAfter).sort()).toEqual(['p1', 'p2', 'p3', 'p4']);
  });

  it('E5 강탈은 보존형 — 대상이 가진 만큼만 가져온다', () => {
    const s = make(3);
    const me = toSkillPhase(s);
    const [foe] = opponentsOf(s, me);
    s.teams[foe].hp = 2;
    giveLevel(s, me, 'tiger', 3);
    processSkillChoice(s, 'tiger', foe);
    expect(s.teams[me].hp).toBe(START_HP + 2);
  });

  it('E6 대상이 나 자신 / 없음 / 순위 확정자면 아무 일도 없다', () => {
    const s = make(4);
    const me = toSkillPhase(s);
    const [foe, other] = opponentsOf(s, me);
    s.teams[other].finish = { rank: 4, reason: 'out' };
    giveLevel(s, me, 'tiger', 1);
    for (const bad of [me, undefined, other, 'p9']) {
      const before = JSON.stringify(s);
      const { events } = processSkillChoice(s, 'tiger', bad);
      expect(events).toEqual([]);
      expect(JSON.stringify(s)).toBe(before);
    }
    expect(s.pendingChoice).toBe(me);
    expect(processSkillChoice(s, 'tiger', foe).events.length).toBeGreaterThan(0);
  });

  it('대상이 필요 없는 기술은 target을 줘도 무시한다', () => {
    const s = make(3);
    const me = toSkillPhase(s);
    const [foe] = opponentsOf(s, me);
    giveLevel(s, me, 'rabbit', 1);
    const { events } = processSkillChoice(s, 'rabbit', foe);
    expect(ofType(events, 'skillApplied')[0].target).toBeUndefined();
    expect(s.teams[foe].hp).toBe(START_HP);
  });
});

describe('순위 (E7~E11)', () => {
  it('E7 승리선에 닿으면 1위, 그 사람 차례는 끝난다', () => {
    const s = make(4);
    const me = toSkillPhase(s);
    s.teams[me].hp = WIN_HP - 1;
    giveLevel(s, me, 'rabbit', 1);
    const { events } = processSkillChoice(s, 'rabbit');
    expect(ofType(events, 'ranked')).toEqual([{ type: 'ranked', team: me, rank: 1, reason: 'win' }]);
    expect(s.teams[me].finish).toEqual({ rank: 1, reason: 'win' });
    expect(s.ranks[me]).toBe(1);
    expect(s.phase).toBe('playing');
    expect(s.pendingChoice).toBeNull();
    expect(s.activeTeam).not.toBe(me);
  });

  it('E8 두 번째 승리자는 2위', () => {
    const s = make(5);
    const first = toSkillPhase(s);
    s.teams[first].hp = WIN_HP - 1;
    giveLevel(s, first, 'rabbit', 1);
    processSkillChoice(s, 'rabbit');
    const second = s.activeTeam;
    toSkillPhase(s);
    s.teams[second].hp = WIN_HP - 1;
    giveLevel(s, second, 'rabbit', 1);
    const { events } = processSkillChoice(s, 'rabbit');
    expect(ofType(events, 'ranked')[0]).toMatchObject({ team: second, rank: 2, reason: 'win' });
  });

  it('E9 특허랑이로 상대를 0으로 만들면 꼴찌부터 순위, 다음 탈락자는 N-1', () => {
    const s = make(5);
    const me = toSkillPhase(s);
    const [x, y] = opponentsOf(s, me);
    s.teams[x].hp = 1;
    giveLevel(s, me, 'tiger', 1);
    const r1 = processSkillChoice(s, 'tiger', x);
    expect(ofType(r1.events, 'ranked')).toEqual([{ type: 'ranked', team: x, rank: 5, reason: 'out' }]);
    expect(s.teams[x].hp).toBe(0);
    // 다음 사람 차례에서 또 한 명이 0이 된다
    const next = s.activeTeam;
    toSkillPhase(s);
    const target = opponentsOf(s, next).find(t => t !== me)!;
    s.teams[target].hp = 1;
    giveLevel(s, next, 'tiger', 1);
    const r2 = processSkillChoice(s, 'tiger', target);
    expect(ofType(r2.events, 'ranked')[0]).toMatchObject({ team: target, rank: 4, reason: 'out' });
    expect(y).toBeDefined();
  });

  it('E10 한 기술로 상대를 0으로 만들며 내가 승리선에 닿으면 ranked 둘, 승리가 먼저', () => {
    const s = make(5);
    const me = toSkillPhase(s);
    const [foe] = opponentsOf(s, me);
    s.teams[foe].hp = 1;
    s.teams[me].hp = WIN_HP - 1;
    giveLevel(s, me, 'tiger', 1);
    const { events } = processSkillChoice(s, 'tiger', foe);
    const ranked = ofType(events, 'ranked');
    expect(ranked).toEqual([
      { type: 'ranked', team: me, rank: 1, reason: 'win' },
      { type: 'ranked', team: foe, rank: 5, reason: 'out' },
    ]);
  });

  it('E11 남은 사람이 1명이 되면 남은 순위를 받고 판이 끝난다 (gameEnd ranked, winner는 1위)', () => {
    const s = make(3);
    const me = toSkillPhase(s);
    const [x, y] = opponentsOf(s, me);
    // x가 먼저 탈락(3위) → 남은 둘 중 내가 승리선에 닿으면 1위, 남은 y는 2위
    s.teams[x].hp = 1;
    giveLevel(s, me, 'tiger', 1);
    processSkillChoice(s, 'tiger', x);
    expect(s.phase).toBe('playing');
    const cur = s.activeTeam;
    toSkillPhase(s);
    s.teams[cur].hp = WIN_HP - 1;
    giveLevel(s, cur, 'rabbit', 1);
    const { events } = processSkillChoice(s, 'rabbit');
    const ranked = ofType(events, 'ranked');
    expect(ranked.map(r => [r.rank, r.reason])).toEqual([[1, 'win'], [2, 'last']]);
    const end = ofType(events, 'gameEnd')[0];
    expect(end).toEqual({ type: 'gameEnd', winner: cur, reason: 'ranked' });
    expect(s.phase).toBe('ended');
    expect(s.winner).toBe(cur);
    expect(s.pendingChoice).toBeNull();
    expect(new Set(Object.values(s.ranks))).toEqual(new Set([1, 2, 3]));
    expect(y).toBeDefined();
  });

  it('순위가 정해진 사람은 차례가 오지 않고, 체력도 더 이상 변하지 않는다', () => {
    const s = make(4);
    const me = toSkillPhase(s);
    const [x] = opponentsOf(s, me);
    s.teams[x].hp = 1;
    giveLevel(s, me, 'tiger', 1);
    processSkillChoice(s, 'tiger', x);
    for (let i = 0; i < 8; i++) {
      expect(s.activeTeam).not.toBe(x);
      advanceTurn(s);
    }
    expect(opponentsOf(s, me)).not.toContain(x);
  });
});

describe('한 차례에 기술 2장 (E12~E15)', () => {
  function fiveWithTwoSkills() {
    const s = make(5);
    const me = toSkillPhase(s);
    giveLevel(s, me, 'rabbit', 1);
    giveLevel(s, me, 'sheep', 1);
    return { s, me };
  }

  it('E12 첫 기술 뒤에는 차례가 끝나지 않고 pendingChoice가 그대로다', () => {
    const { s, me } = fiveWithTwoSkills();
    const { events } = processSkillChoice(s, 'rabbit');
    expect(ofType(events, 'skillApplied')).toHaveLength(1);
    expect(s.activeTeam).toBe(me);
    expect(s.pendingChoice).toBe(me);
    expect(s.skillsUsedThisTurn).toBe(1);
  });

  it('E13 두 번째 기술을 쓰면 차례가 끝나고, skillsUsedThisTurn은 0이 된다', () => {
    const { s, me } = fiveWithTwoSkills();
    processSkillChoice(s, 'rabbit');
    processSkillChoice(s, 'sheep');
    expect(s.pendingChoice).toBeNull();
    expect(s.activeTeam).not.toBe(me);
    expect(s.skillsUsedThisTurn).toBe(0);
  });

  it('E14 첫 기술 뒤 쓸 기술이 없으면 곧바로 차례 종료', () => {
    const s = make(5);
    const me = toSkillPhase(s);
    giveLevel(s, me, 'rabbit', 1);
    processSkillChoice(s, 'rabbit');
    expect(s.pendingChoice).toBeNull();
    expect(s.activeTeam).not.toBe(me);
  });

  it('E15 첫 기술 뒤 패스하면 차례 종료', () => {
    const { s, me } = fiveWithTwoSkills();
    processSkillChoice(s, 'rabbit');
    const { events } = processPass(s);
    expect(ofType(events, 'skillPassed')).toHaveLength(1);
    expect(s.activeTeam).not.toBe(me);
    expect(s.pendingChoice).toBeNull();
  });

  it('4명 이하는 기술 1장 — 쓸 수 있는 기술이 더 있어도 차례가 끝난다', () => {
    const s = make(4);
    const me = toSkillPhase(s);
    giveLevel(s, me, 'rabbit', 1);
    giveLevel(s, me, 'sheep', 1);
    processSkillChoice(s, 'rabbit');
    expect(s.activeTeam).not.toBe(me);
  });

  it('첫 기술로 순위가 정해지면 두 번째 기술을 기다리지 않는다', () => {
    const s = make(5);
    const me = toSkillPhase(s);
    s.teams[me].hp = WIN_HP - 1;
    giveLevel(s, me, 'rabbit', 1);
    giveLevel(s, me, 'sheep', 1);
    processSkillChoice(s, 'rabbit');
    expect(s.pendingChoice).toBeNull();
    expect(s.activeTeam).not.toBe(me);
  });

  it('인어 → 특허랑이가 한 차례에 이어진다 (배율이 쌓인다)', () => {
    const s = make(5);
    const me = toSkillPhase(s);
    const [foe] = opponentsOf(s, me);
    giveLevel(s, me, 'mermaid', 1);
    giveLevel(s, me, 'tiger', 1);
    processSkillChoice(s, 'mermaid');
    expect(s.pendingChoice).toBe(me);
    const { events } = processSkillChoice(s, 'tiger', foe);
    expect(ofType(events, 'skillApplied')[0].multiplierUsed).toBe(2);
    expect(s.teams[foe].hp).toBe(START_HP - 2);
  });
});

describe('시간초과 (E16·E17)', () => {
  it('E16 기술 선택 중 시간초과: 기술 없이 차례 종료, timeoutChoice.animal === null', () => {
    const s = make(5);
    const me = toSkillPhase(s);
    giveLevel(s, me, 'rabbit', 1);
    giveLevel(s, me, 'sheep', 1);
    const { events } = processTimeout(s, rng0);
    expect(ofType(events, 'timeoutChoice')).toEqual([{ type: 'timeoutChoice', animal: null }]);
    expect(ofType(events, 'skillPassed')).toEqual([{ type: 'skillPassed', team: me, auto: true }]);
    expect(ofType(events, 'skillApplied')).toHaveLength(0); // 서버가 대신 고르지 않는다
    expect(s.teams[me].exp.rabbit).toBe(10);
    expect(s.activeTeam).not.toBe(me);
  });

  it('E16 두 번째 기술을 고르다 시간초과해도 그대로 차례 종료', () => {
    const s = make(5);
    const me = toSkillPhase(s);
    giveLevel(s, me, 'rabbit', 1);
    giveLevel(s, me, 'sheep', 1);
    processSkillChoice(s, 'rabbit');
    const { events } = processTimeout(s, rng0);
    expect(ofType(events, 'skillApplied')).toHaveLength(0);
    expect(s.teams[me].exp.sheep).toBe(10); // 양은 쓰이지 않았다
    expect(s.activeTeam).not.toBe(me);
    expect(s.skillsUsedThisTurn).toBe(0);
  });

  it('E17 장소 선택 중 시간초과는 팀전과 같이 무작위 장소로 뽑는다', () => {
    const s = make(3);
    const me = s.activeTeam;
    const { events } = processTimeout(s, rng0);
    expect(ofType(events, 'draw').length).toBeGreaterThan(0);
    expect(s.pendingChoice).toBe(me);
  });

  it('장소를 직접 누르면 기술 선택 대기로 들어간다', () => {
    const s = make(3);
    const me = s.activeTeam;
    processPlayerAction(s, 'house', rng0);
    expect(s.pendingChoice).toBe(me);
  });
});

describe('턴 제한 (E18)', () => {
  it('E18 남은 체력 10·10·5, 남은 순위 2위부터 → 2·2·4위', () => {
    const s = make(4);
    const [first, ...rest] = s.turnOrder;
    s.teams[first].finish = { rank: 1, reason: 'win' };
    s.ranks[first] = 1;
    s.teams[rest[0]].hp = 10;
    s.teams[rest[1]].hp = 10;
    s.teams[rest[2]].hp = 5;
    s.turn = MAX_TURN;
    s.activeTeam = rest[2]; // 마지막 편이 마치면 한 바퀴 → turn 21
    const events = advanceTurn(s);
    expect(s.phase).toBe('ended');
    expect(ofType(events, 'gameEnd')).toEqual([{ type: 'gameEnd', winner: first, reason: 'turnLimit' }]);
    expect(s.ranks[rest[0]]).toBe(2);
    expect(s.ranks[rest[1]]).toBe(2);
    expect(s.ranks[rest[2]]).toBe(4);
    expect(s.teams[rest[2]].finish).toEqual({ rank: 4, reason: 'turnLimit' });
  });

  it('공동 1위면 winner는 draw', () => {
    const s = make(3);
    for (const side of s.turnOrder) s.teams[side].hp = 8;
    s.teams[s.turnOrder[2]].hp = 3;
    const events = rankByHpAndEnd(s);
    expect(ofType(events, 'gameEnd')[0].winner).toBe('draw');
    expect(Object.values(s.ranks).sort()).toEqual([1, 1, 3]);
  });

  it('제한 턴 안에서는 끝나지 않는다', () => {
    const s = make(3);
    s.turn = MAX_TURN;
    s.activeTeam = s.turnOrder[1];
    advanceTurn(s);
    expect(s.phase).toBe('playing');
  });
});

describe('항복·나가기 (processForfeit)', () => {
  it('3명 중 한 명이 항복하면 꼴찌(3위), 판은 계속된다', () => {
    const s = make(3);
    const [a, b] = [s.turnOrder[0], s.turnOrder[1]];
    const { events } = processForfeit(s, b);
    expect(ofType(events, 'ranked')).toEqual([{ type: 'ranked', team: b, rank: 3, reason: 'forfeit' }]);
    expect(s.phase).toBe('playing');
    expect(a).toBeDefined();
  });

  it('두 명이 항복하면 남은 1명이 1위, 판이 끝난다', () => {
    const s = make(3);
    const [a, b, c] = s.turnOrder;
    processForfeit(s, b);
    const { events } = processForfeit(s, c);
    expect(s.ranks).toEqual({ [b]: 3, [c]: 2, [a]: 1 });
    expect(ofType(events, 'gameEnd')[0]).toEqual({ type: 'gameEnd', winner: a, reason: 'ranked' });
    expect(s.phase).toBe('ended');
  });

  it('지금 차례인 사람이 항복하면 다음 사람에게 넘어간다', () => {
    const s = make(4);
    const [a, b] = s.turnOrder;
    s.pendingChoice = a;
    processForfeit(s, a);
    expect(s.activeTeam).toBe(b);
    expect(s.pendingChoice).toBeNull();
  });

  it('이미 순위가 정해진 사람의 항복은 무시한다', () => {
    const s = make(4);
    const [a] = s.turnOrder;
    s.teams[a].finish = { rank: 1, reason: 'win' };
    s.ranks[a] = 1;
    expect(processForfeit(s, a).events).toEqual([]);
  });
});
