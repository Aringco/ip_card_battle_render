import { computeLeaderboard, normalizeRange } from '../records/leaderboard';
import { RecordStore } from '../records/store';
import { normalizeNameKey, skillPeakValue } from 'shared';
import type { Animal, EventResultRow } from 'shared';

/**
 * 이벤트 기록 — 순위표 규칙(동물의 왕 등)과 메모리 저장소(닉네임 등록부·PIN·기록 번호).
 * DB 없이 돈다(DATABASE_URL을 주지 않으면 저장소는 메모리만 쓴다).
 */

const quiet = { log: () => {} };
let seq = 0;
function row(over: Partial<EventResultRow> & { peak?: Partial<Record<Animal, number>> }): EventResultRow {
  seq += 1;
  const { peak, ...rest } = over;
  return {
    id: seq,
    startedAt: seq * 1000 - 500, // 판 길이 0.5초 — 기간 테스트가 시작·끝을 따로 본다
    createdAt: seq * 1000,
    event: 'beatDev',
    playerName: `p${seq}`,
    developer: '개발자',
    won: true,
    endReason: 'win',
    peakLevels: { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0, ...peak },
    detail: {},
    turns: 5,
    durationMs: 60_000,
    invalid: false,
    ...rest,
  };
}

describe('닉네임 비교 키', () => {
  it('앞뒤·연속 공백, 대소문자, 유니코드 정규화를 같은 이름으로 본다', () => {
    expect(normalizeNameKey('곰돌이')).toBe(normalizeNameKey(' 곰돌이 '));
    expect(normalizeNameKey('Big  Bear')).toBe(normalizeNameKey('big bear'));
    // 조합형(NFD) '한' = ᄒ + ᅡ + ᆫ
    expect(normalizeNameKey('한글')).toBe(normalizeNameKey('한글'));
  });
});

/** 카드별 최대 경험치(peakExp) — 순위 줄에 함께 실린다(화면은 레벨만 그린다) */
const exp = (e: Partial<Record<Animal, number>>) => ({ sheep: 0, rabbit: 0, mermaid: 0, tiger: 0, ...e });

/** 카드별 기술 한 번의 최고 효과(peakSkill) — 동물의 왕과 카드별 점수가 이 값으로 매긴다 */
const skill = (e: Partial<Record<Animal, number>>) => ({ sheep: 0, rabbit: 0, mermaid: 0, tiger: 0, ...e });

describe('기술 한 번의 효과 크기(skillPeakValue)', () => {
  const base = { extraDrawsQueued: 0, myHpDelta: 0, multiplierAfter: 1, oppHpDelta: 0 };
  it('양 = 추가 뽑기 수 · 토끼 = 회복 · 인어 = 쓴 뒤의 배율 · 호랑이 = 빼앗은 체력', () => {
    expect(skillPeakValue({ ...base, animal: 'sheep', extraDrawsQueued: 6 })).toBe(6);
    expect(skillPeakValue({ ...base, animal: 'rabbit', myHpDelta: 8 })).toBe(8);
    expect(skillPeakValue({ ...base, animal: 'mermaid', multiplierAfter: 4 })).toBe(4);
    expect(skillPeakValue({ ...base, animal: 'tiger', oppHpDelta: -9, myHpDelta: 9 })).toBe(9);
  });
});

describe('동물의 왕 — 모든 이벤트에서 이긴 판의 카드별 기술 최고 효과(2026-10-27)', () => {
  it('도전 종류와 상관없이 이긴 판만, 카드별 최고 효과 순으로 1~3위', () => {
    const rows = [
      row({ playerName: '가', peakSkill: skill({ tiger: 3 }) }),
      row({ playerName: '진사람', peakSkill: skill({ tiger: 30 }), won: false, endReason: 'lose' }), // 진 판은 세지 않는다
      row({ playerName: '나', peakSkill: skill({ tiger: 12 }) }),
      row({ playerName: '다', peakSkill: skill({ tiger: 9 }), event: 'oneWell' }),               // 다른 도전도 센다
      row({ playerName: '라', peakSkill: skill({ tiger: 6 }), event: 'timeAttack' }),
      row({ playerName: '마', peakSkill: skill({ tiger: 99 }), invalid: true }),                  // 무효 처리는 뺀다
      row({ playerName: '바', peak: { tiger: 9 } }),                                             // 효과를 남기기 전의 기록은 없다
    ];
    const board = computeLeaderboard(rows);
    expect(board.animalKing.tiger.map(e => [e.name, e.score, e.event])).toEqual([
      ['나', 12, 'beatDev'], ['다', 9, 'oneWell'], ['라', 6, 'timeAttack'],
    ]);
  });

  it('한 우물만 파기 판에서는 상표토끼·특허랑이만 센다', () => {
    const board = computeLeaderboard([row({ event: 'oneWell', playerName: '우물', peakSkill: skill({ sheep: 8, rabbit: 6 }) })]);
    expect(board.animalKing.sheep).toEqual([]);
    expect(board.animalKing.rabbit.map(e => [e.name, e.score])).toEqual([['우물', 6]]);
  });

  it('같은 값이면 먼저 달성한 사람이 위, 닉네임당 최고 기록 하나만, 0(안 썼다)은 올리지 않는다', () => {
    const rows = [
      row({ playerName: '곰', peakSkill: skill({ rabbit: 4 }) }),
      row({ playerName: '여우', peakSkill: skill({ rabbit: 4 }) }),
      row({ playerName: '곰 ', peakSkill: skill({ rabbit: 2 }) }),
      row({ playerName: '곰', peakSkill: skill({ rabbit: 4 }) }),
    ];
    const board = computeLeaderboard(rows);
    expect(board.animalKing.rabbit.map(e => [e.name, e.score, e.recordId])).toEqual([
      ['곰', 4, rows[0].id],
      ['여우', 4, rows[1].id],
    ]);
    expect(board.animalKing.sheep).toEqual([]);
  });

  it('순위 줄의 카드 칸에 기술 최고 효과가 실린다', () => {
    const board = computeLeaderboard([row({ playerName: '가', peak: { tiger: 2 }, peakSkill: skill({ tiger: 7, sheep: 3 }) })]);
    expect(board.beatDev.ranking[0].cards?.tiger).toMatchObject({ level: 2, skill: 7 });
    expect(board.beatDev.ranking[0].cards?.sheep).toMatchObject({ skill: 3 });
  });
});

describe('개발자를 이겨라 순위', () => {
  it('개발자를 이겨라 — 이긴 사람만, 처음 이긴 순, 사람당 1줄(그 첫 승리의 카드별 레벨·점수)', () => {
    const rows = [
      row({ playerName: '나', won: false, endReason: 'lose' }),             // 진 사람은 순위에 없다
      row({ playerName: '가', peak: { tiger: 3 }, peakExp: { sheep: 5, rabbit: 0, mermaid: 0, tiger: 67 } }),
      row({ playerName: '다', won: false, endReason: 'lose' }),
      row({ playerName: '다', peak: { rabbit: 2 } }),                        // 졌다가 다시 와서 이겼다
      row({ playerName: '가', peak: { tiger: 9 } }),                         // 두 번째 승리 — 첫 승리의 기록이 남는다
    ];
    const board = computeLeaderboard(rows);
    expect(board.beatDev.played).toBe(5);
    expect(board.beatDev.wins).toBe(3);
    expect(board.beatDev.ranking.map(w => w.name)).toEqual(['가', '다']);
    expect(board.beatDev.ranking[0].recordId).toBe(rows[1].id);
    expect(board.beatDev.ranking[0].cards).toEqual({
      sheep: { level: 0, exp: 5 }, rabbit: { level: 0, exp: 0 }, mermaid: { level: 0, exp: 0 }, tiger: { level: 3, exp: 67 },
    });
    // 경험치를 남기기 전의 기록은 레벨만
    expect(board.beatDev.ranking[1].cards?.rabbit).toEqual({ level: 2 });
  });
});

describe('목표점수 달성하기 순위', () => {
  it('성공한 사람만, 더 높은 목표 → 더 높은 최종 점수 순(사람당 최고 기록)', () => {
    const rows = [
      row({ event: 'timeAttack', playerName: '가', detail: { target: 12, finalScore: 14 } }),
      row({ event: 'timeAttack', playerName: '나', detail: { target: 18, finalScore: 18 } }),
      row({ event: 'timeAttack', playerName: '가', detail: { target: 18, finalScore: 21 } }),
      row({ event: 'timeAttack', playerName: '다', detail: { target: 12, finalScore: 20 } }),
      row({ event: 'timeAttack', playerName: '라', won: false, endReason: 'lose', detail: { target: 20, finalScore: 15 } }),
    ];
    const board = computeLeaderboard(rows);
    expect(board.timeAttack.played).toBe(5);
    expect(board.timeAttack.wins).toBe(4);
    expect(board.timeAttack.ranking.map(e => [e.name, e.target, e.score])).toEqual([['가', 18, 21], ['나', 18, 18], ['다', 12, 20]]);
  });
});

describe('한 우물만 파기 순위', () => {
  it('성공한 사람만, 높은 점수 순(사람당 최고 점수, 같으면 먼저 달성) — 고정 카드도 함께', () => {
    const rows = [
      row({ event: 'oneWell', playerName: '가', detail: { lockedAnimal: 'rabbit', finalScore: 15 } }),
      row({ event: 'oneWell', playerName: '나', detail: { lockedAnimal: 'tiger', finalScore: 19 } }),
      row({ event: 'oneWell', playerName: '다', detail: { lockedAnimal: 'tiger', finalScore: 15 } }),
      row({ event: 'oneWell', playerName: '가', detail: { lockedAnimal: 'tiger', finalScore: 14 } }), // 더 낮다 — 버려진다
      row({ event: 'oneWell', playerName: '라', won: false, endReason: 'lose', detail: { lockedAnimal: 'rabbit', finalScore: 30 } }),
    ];
    const board = computeLeaderboard(rows);
    expect(board.oneWell.played).toBe(5);
    expect(board.oneWell.wins).toBe(4);
    expect(board.oneWell.ranking.map(e => [e.name, e.animal, e.score])).toEqual([
      ['나', 'tiger', 19], ['가', 'rabbit', 15], ['다', 'tiger', 15],
    ]);
    // 한 우물은 쓸 수 있던 두 장만 싣는다
    expect(Object.keys(board.oneWell.ranking[0].cards ?? {}).sort()).toEqual(['rabbit', 'tiger']);
  });
});

describe('기간', () => {
  it('시작이 from 이후이고 끝이 to 이전인 판만 센다(양 끝 포함)', () => {
    const rows = [
      row({ playerName: '이른', startedAt: 900, createdAt: 1_100, peakSkill: skill({ tiger: 9 }) }),  // 시작 전에 시작 — 빠진다
      row({ playerName: '안', startedAt: 1_000, createdAt: 2_000, peakSkill: skill({ tiger: 3 }) }),   // 딱 맞는다
      row({ playerName: '늦은', startedAt: 1_900, createdAt: 2_100, peakSkill: skill({ tiger: 8 }) }), // 마감 뒤에 끝남 — 빠진다
    ];
    const board = computeLeaderboard(rows, { from: 1_000, to: 2_000 });
    expect(board.range).toEqual({ from: 1_000, to: 2_000 });
    expect(board.beatDev.played).toBe(1);
    expect(board.animalKing.tiger.map(e => e.name)).toEqual(['안']);
    // 한쪽 끝만 — 그쪽만 자른다
    expect(computeLeaderboard(rows, { from: 1_000, to: null }).beatDev.played).toBe(2);
    expect(computeLeaderboard(rows, { from: null, to: 2_000 }).beatDev.played).toBe(2);
    // 기간을 주지 않으면 전체
    expect(computeLeaderboard(rows).beatDev.played).toBe(3);
  });

  it('화면이 보낸 기간을 정리한다 — 숫자가 아니면 끝 없음, 거꾸로면 바꾼다', () => {
    expect(normalizeRange(undefined, null)).toEqual({ from: null, to: null });
    expect(normalizeRange('1000', NaN)).toEqual({ from: null, to: null });
    expect(normalizeRange(5_000, 1_000)).toEqual({ from: 1_000, to: 5_000 });
  });
});

describe('메모리 저장소', () => {
  it('처음 쓰는 닉네임은 등록되고, 같은 닉네임은 같은 PIN일 때만 재도전으로 받는다', async () => {
    const store = new RecordStore(quiet);
    await store.init();
    expect(await store.registerOrVerify('곰돌이', '1234')).toEqual({ ok: true, firstTime: true });
    expect(await store.registerOrVerify(' 곰돌이', '1234')).toEqual({ ok: true, firstTime: false });
    expect(await store.registerOrVerify('곰돌이', '9999')).toEqual({ ok: false, reason: 'pin' });
    expect(store.isRegistered('곰돌이 ')).toBe(true);
  });

  it('결과를 저장하면 기록 번호가 생기고 곧바로 순위표에 반영된다', async () => {
    const store = new RecordStore(quiet);
    await store.init();
    const id = await store.saveResult({
      event: 'beatDev', playerName: '가', developer: '개발자', won: true, endReason: 'win',
      peakLevels: { sheep: 1, rabbit: 2, mermaid: 0, tiger: 3 }, peakExp: { sheep: 12, rabbit: 25, mermaid: 0, tiger: 61 },
      peakSkill: { sheep: 1, rabbit: 2, mermaid: 0, tiger: 5 },
      detail: {}, turns: 4, startedAt: Date.now() - 50_000, durationMs: 50_000,
    });
    expect(id).toBe(1);
    expect(store.leaderboard().animalKing.tiger[0]).toMatchObject({ name: '가', score: 5, recordId: 1 });
    await store.invalidate(1, true);
    expect(store.leaderboard().animalKing.tiger).toEqual([]);
  });

  it('일괄 삭제하면 기록과 닉네임 등록부가 비워진다', async () => {
    const store = new RecordStore(quiet);
    await store.registerOrVerify('가', '1111');
    await store.saveResult({
      event: 'oneWell', playerName: '가', developer: null, won: false, endReason: 'lose',
      peakLevels: { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 }, detail: { lockedAnimal: null }, turns: 3, startedAt: Date.now() - 1000, durationMs: 1000,
    });
    await store.wipe();
    expect(store.results()).toEqual([]);
    expect(store.isRegistered('가')).toBe(false);
  });
});
