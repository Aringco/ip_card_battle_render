/**
 * 이벤트 기록 DB 점검 — 실제 Postgres(Neon 등)에 붙어 "순위에 필요한 값이 저장되고, 서버를 다시 켜도 그대로 읽히는가"를 확인한다.
 *
 * 1. 접속 · 표 구조(event_results · event_players의 칸) 확인
 * 2. 실제 저장소(RecordStore)로 검사용 닉네임 등록 + 세 도전의 결과를 한 건씩 저장 → 기록 번호가 DB에서 나오는가
 * 3. **새 저장소 인스턴스**(= 서버 재시작)로 다시 읽어 순위표에 그 값이 그대로 나오는가
 *    - 동물의 왕: peak_skill(기술 한 번 최고 효과) / 개발자를 이겨라: 카드별 peak_levels / 목표점수: detail.target·finalScore
 *    - 한 우물: detail.lockedAnimal·finalScore / 기간 집계: started_at / 재도전 PIN 확인
 * 4. 검사용 행은 **끝나면 지운다**(실패해도 finally에서). 실제 행사 기록은 건드리지 않는다.
 *
 * ⚠️ 돌아가는 동안(몇 초) 배포 서버가 마침 재시작하면 검사용 행을 메모리로 읽어 갈 수 있다 — 그 서버를 한 번 더 재시작하면 사라진다.
 *
 * 접속 문자열은 환경변수 DATABASE_URL, 없으면 server/.env 또는 루트 .env의 DATABASE_URL 줄에서 읽는다(둘 다 .gitignore 대상).
 * 실행: cd server && npx ts-node scripts/eventDbCheck.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { normalizeNameKey } from 'shared';
import { RecordStore } from '../records/store';

function readDatabaseUrl(): string | null {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  for (const file of [path.join(__dirname, '..', '.env'), path.join(__dirname, '..', '..', '.env')]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^['"]|['"]$/g, '');
    }
  }
  return null;
}

/** 비밀번호를 가린 접속 대상 — 로그에 접속 문자열을 그대로 찍지 않는다. */
function describe(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname}/${u.pathname.replace(/^\//, '')} (사용자 ${u.username})`;
  } catch {
    return '(URL 형식이 아님)';
  }
}

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const url = readDatabaseUrl();
  if (!url) {
    console.error('DATABASE_URL이 없습니다 — 환경변수로 주거나 server/.env에 DATABASE_URL=... 한 줄을 넣으세요.');
    process.exit(2);
  }
  console.log(`접속 대상: ${describe(url)}\n`);
  const quiet = { log: (msg: string, err?: unknown) => console.log(`    [store] ${msg}${err ? ` ${(err as Error).message ?? err}` : ''}`) };

  const tag = `dbcheck${Date.now() % 1_000_000}`;
  const names = { king: `${tag}왕`, race: `${tag}목표`, well: `${tag}우물` };
  const pin = '4321';
  const savedIds: number[] = [];
  let pool: Pool | null = null;

  try {
    // ── 1. 저장소로 접속(표가 없으면 이때 만들어진다) ──
    console.log('1) 접속 · 표 만들기');
    const store = new RecordStore({ databaseUrl: url, pinPepper: process.env.EVENT_PIN_PEPPER, ...quiet });
    await store.init();
    check('저장소가 DB에 붙었다', store.storageState() === 'connected', `상태 ${store.storageState()}`);
    if (store.storageState() !== 'connected') throw new Error('DB에 붙지 못해 더 진행하지 않습니다.');

    // 표 구조는 저장소와 별개로 직접 본다(같은 설정: TLS, sslmode 제거).
    const u = new URL(url);
    u.searchParams.delete('sslmode');
    u.searchParams.delete('channel_binding');
    pool = new Pool({ connectionString: u.toString(), ssl: { rejectUnauthorized: false }, max: 1 });
    const version = await pool.query('select version()');
    console.log(`    ${String(version.rows[0].version).split(',')[0]}`);
    const cols = await pool.query(
      `select table_name, column_name, data_type from information_schema.columns
       where table_name in ('event_results', 'event_players', 'event_settings') order by table_name, ordinal_position`,
    );
    const colsOf = (t: string) => cols.rows.filter(r => r.table_name === t).map(r => `${r.column_name}:${r.data_type}`);
    const need = {
      event_results: ['id', 'created_at', 'started_at', 'event', 'player_name', 'developer', 'won', 'end_reason', 'peak_levels', 'peak_exp', 'peak_skill', 'detail', 'turns', 'duration_ms', 'invalid'],
      event_players: ['name_key', 'display_name', 'pin_hash', 'created_at'],
      event_settings: ['key', 'value', 'updated_at'],
    };
    for (const [t, want] of Object.entries(need)) {
      const have = cols.rows.filter(r => r.table_name === t).map(r => r.column_name as string);
      const missing = want.filter(c => !have.includes(c));
      check(`표 ${t}의 칸`, missing.length === 0, missing.length ? `없는 칸: ${missing.join(', ')}` : colsOf(t).join(' · '));
    }
    const before = await pool.query('select count(*)::int as n from event_results');
    console.log(`    기존 기록 ${before.rows[0].n}건(건드리지 않음)\n`);

    // ── 2. 검사용 닉네임 + 결과 저장 ──
    console.log('2) 닉네임 등록 · 결과 저장');
    const reg = await store.registerOrVerify(names.king, pin);
    check('처음 쓰는 닉네임 등록', reg.ok && reg.firstTime === true);
    await store.registerOrVerify(names.race, pin);
    await store.registerOrVerify(names.well, pin);

    // 판 시작 시각은 1시간 전 — 기간 집계(started_at)가 왕복하는지 본다.
    const startedAt = Date.now() - 3_600_000;
    const base = { developer: null, won: true, endReason: 'win' as const, turns: 7, durationMs: 123_456, startedAt };
    const kingId = await store.saveResult({
      ...base, event: 'beatDev', playerName: names.king, developer: '점검개발자',
      peakLevels: { sheep: 97, rabbit: 98, mermaid: 96, tiger: 99 },
      peakExp: { sheep: 970, rabbit: 980, mermaid: 1920, tiger: 1980 },
      peakSkill: { sheep: 997, rabbit: 998, mermaid: 996, tiger: 999 }, detail: {},
    });
    const raceId = await store.saveResult({
      ...base, event: 'timeAttack', playerName: names.race,
      peakLevels: { sheep: 1, rabbit: 2, mermaid: 0, tiger: 1 }, detail: { target: 20, finalScore: 23 },
    });
    const wellId = await store.saveResult({
      ...base, event: 'oneWell', playerName: names.well,
      peakLevels: { sheep: 0, rabbit: 3, mermaid: 0, tiger: 0 }, detail: { lockedAnimal: 'rabbit', finalScore: 19 },
    });
    for (const id of [kingId, raceId, wellId]) if (typeof id === 'number') savedIds.push(id);
    check('세 결과가 DB 기록 번호를 받았다', savedIds.length === 3, `#${savedIds.join(', #')}`);
    check('저장 대기 0건', store.pendingCount() === 0, `대기 ${store.pendingCount()}건`);

    const raw = await pool.query('select id, event, player_name, won, started_at, peak_levels, peak_skill, detail from event_results where id = any($1::bigint[]) order by id', [savedIds]);
    for (const r of raw.rows) console.log(`    DB 행 #${r.id} ${r.event} ${r.player_name} won=${r.won} peak=${JSON.stringify(r.peak_levels)} skill=${JSON.stringify(r.peak_skill)} detail=${JSON.stringify(r.detail)}`);
    await store.close();
    console.log('');

    // ── 3. 새 인스턴스(= 서버 재시작)로 다시 읽기 ──
    console.log('3) 서버 재시작처럼 새로 읽기 — 순위표');
    const again = new RecordStore({ databaseUrl: url, pinPepper: process.env.EVENT_PIN_PEPPER, ...quiet });
    await again.init();
    const board = again.leaderboard();
    const tigerTop = board.animalKing.tiger[0];
    check('동물의 왕(특허랑이) 1위에 검사 기록 — peak_skill이 그대로', tigerTop?.name === names.king && tigerTop.score === 999 && tigerTop.recordId === kingId,
      tigerTop ? `${tigerTop.name} ${tigerTop.score} #${tigerTop.recordId}` : '비어 있음');
    const rabbitKing = board.animalKing.rabbit.find(e => e.name === names.king);
    check('동물의 왕(상표토끼)에도 같은 판의 값', rabbitKing?.score === 998);
    const dev = board.beatDev.ranking.find(w => w.name === names.king);
    check('개발자를 이겨라 순위 — 카드별 peak_levels', dev?.recordId === kingId && dev.cards?.tiger?.level === 99 && dev.cards?.rabbit?.level === 98,
      dev ? `🐯 Lv.${dev.cards?.tiger?.level} 🐰 Lv.${dev.cards?.rabbit?.level} #${dev.recordId}` : '없음');
    const race = board.timeAttack.ranking.find(w => w.name === names.race);
    check('목표점수 달성하기 — 목표·최종 점수', race?.target === 20 && race.score === 23, race ? `목표 ${race.target} · ${race.score}점 #${race.recordId}` : '없음');
    const well = board.oneWell.ranking.find(w => w.name === names.well);
    check('한 우물만 파기 — 고정한 카드·점수', well?.animal === 'rabbit' && well.score === 19, well ? `${well.animal} ${well.score}점 #${well.recordId}` : '없음');
    const inside = again.leaderboard({ from: startedAt - 60_000, to: null });
    const outside = again.leaderboard({ from: startedAt + 60_000, to: null });
    check('기간 집계 — started_at이 그대로(시작 뒤부터 세면 빠진다)',
      inside.oneWell.ranking.some(w => w.name === names.well) && !outside.oneWell.ranking.some(w => w.name === names.well));
    const retry = await again.registerOrVerify(names.king, pin);
    check('재도전 — 같은 PIN이면 통과(등록부가 DB에서 읽혔다)', retry.ok && retry.firstTime === false);
    const wrong = await again.registerOrVerify(names.king, '0000');
    check('재도전 — 다른 PIN이면 거부', !wrong.ok && wrong.reason === 'pin');
    check('닉네임은 정규화한 키로 막힌다(공백·대소문자)', again.isRegistered(` ${names.king.toUpperCase()} `));
    await again.close();
  } catch (err) {
    check('점검 중 오류', false, (err as Error).message);
  } finally {
    // ── 4. 검사용 행 지우기 ──
    if (pool) {
      try {
        const del = await pool.query('delete from event_results where id = any($1::bigint[])', [savedIds]);
        const keys = Object.values(names).map(normalizeNameKey);
        const delP = await pool.query('delete from event_players where name_key = any($1::text[])', [keys]);
        console.log(`\n4) 검사용 데이터 정리 — 결과 ${del.rowCount}건 · 닉네임 ${delP.rowCount}개 삭제`);
      } catch (err) {
        console.log(`\n4) ⚠️ 검사용 데이터 정리 실패 — 직접 지울 것: id ${savedIds.join(', ')} / 닉네임 ${Object.values(names).join(', ')}`, err);
      }
      await pool.end().catch(() => {});
    }
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n결과: ${results.length - failed.length}/${results.length} 통과${failed.length ? ` — 실패: ${failed.map(f => f.name).join(' / ')}` : ''}`);
  process.exit(failed.length ? 1 : 0);
}

void main();
