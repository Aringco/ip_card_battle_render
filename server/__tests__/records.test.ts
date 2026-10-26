import { computeLeaderboard } from '../records/leaderboard';
import { RecordStore } from '../records/store';
import { normalizeNameKey } from 'shared';
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

describe('동물의 왕', () => {
  it('개발자를 이겨라의 승리 기록만, 동물별 최고 레벨 순으로 1~3위', () => {
    const rows = [
      row({ playerName: '가', peak: { tiger: 3 } }),
      row({ playerName: '나', peak: { tiger: 5 } }),
      row({ playerName: '다', peak: { tiger: 9 }, won: false, endReason: 'lose' }), // 패배는 순위에 없다
      row({ playerName: '라', peak: { tiger: 8 }, event: 'oneWell' }),            // 다른 도전은 순위에 없다
      row({ playerName: '마', peak: { tiger: 4 } }),
      row({ playerName: '바', peak: { tiger: 1 } }),
      row({ playerName: '사', peak: { tiger: 7 }, invalid: true }),               // 무효 처리는 뺀다
    ];
    const board = computeLeaderboard(rows);
    expect(board.animalKing.tiger.map(e => [e.name, e.level])).toEqual([['나', 5], ['마', 4], ['가', 3]]);
  });

  it('같은 레벨이면 먼저 달성한 사람이 위, 닉네임당 최고 기록 하나만', () => {
    const rows = [
      row({ playerName: '곰', peak: { rabbit: 4 } }),
      row({ playerName: '여우', peak: { rabbit: 4 } }),
      row({ playerName: '곰 ', peak: { rabbit: 2 } }), // 같은 사람(공백) — 더 낮은 기록은 버려진다
      row({ playerName: '곰', peak: { rabbit: 4 } }),  // 같은 레벨을 나중에 또 — 먼저 것이 남는다
    ];
    const board = computeLeaderboard(rows);
    expect(board.animalKing.rabbit.map(e => [e.name, e.level, e.recordId])).toEqual([
      ['곰', 4, rows[0].id],
      ['여우', 4, rows[1].id],
    ]);
  });

  it('레벨 0은 순위에 올리지 않는다', () => {
    const board = computeLeaderboard([row({ playerName: '가', peak: { sheep: 0 } })]);
    expect(board.animalKing.sheep).toEqual([]);
  });

  it('개발자를 이겨라 전적과 성공자 명단(최근 순, 사람당 1번)', () => {
    const rows = [
      row({ playerName: '가' }),
      row({ playerName: '나', won: false, endReason: 'lose' }),
      row({ playerName: '가' }),
    ];
    const board = computeLeaderboard(rows);
    expect(board.beatDev.played).toBe(3);
    expect(board.beatDev.wins).toBe(2);
    expect(board.beatDev.winners.map(w => w.name)).toEqual(['가']);
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
    expect(board.timeAttack.winners.map(e => [e.name, e.target, e.score])).toEqual([['가', 18, 21], ['나', 18, 18], ['다', 12, 20]]);
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
      peakLevels: { sheep: 1, rabbit: 2, mermaid: 0, tiger: 3 }, detail: {}, turns: 4, durationMs: 50_000,
    });
    expect(id).toBe(1);
    expect(store.leaderboard().animalKing.tiger[0]).toMatchObject({ name: '가', level: 3, recordId: 1 });
    await store.invalidate(1, true);
    expect(store.leaderboard().animalKing.tiger).toEqual([]);
  });

  it('일괄 삭제하면 기록과 닉네임 등록부가 비워진다', async () => {
    const store = new RecordStore(quiet);
    await store.registerOrVerify('가', '1111');
    await store.saveResult({
      event: 'oneWell', playerName: '가', developer: null, won: false, endReason: 'lose',
      peakLevels: { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 }, detail: { lockedAnimal: null }, turns: 3, durationMs: 1000,
    });
    await store.wipe();
    expect(store.results()).toEqual([]);
    expect(store.isRegistered('가')).toBe(false);
  });
});
