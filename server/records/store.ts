import { createHash } from 'crypto';
import { Pool } from 'pg';
import { normalizeNameKey } from 'shared';
import type { EventResultRow, Leaderboard, LeaderboardRange } from 'shared';
import { computeLeaderboard } from './leaderboard';

/**
 * 이벤트 기록 저장소 — 결과(event_results) · 닉네임 등록부(event_players).
 * (한때 목표점수 달성하기의 목표별 제한시간을 event_config에 두었다 — 2026-10-26 그 도전이 "10턴 안에 목표 달성"으로
 *  바뀌며 운영 설정이 없어졌다. 이미 만들어진 event_config 표는 남아 있어도 해가 없다.)
 * 설계는 EVENT_MODE_ROADMAP.md §2.4.
 *
 * **메모리가 언제나 1차 사본이고, DB는 그것을 잃지 않게 붙드는 쪽이다.**
 * - 서버가 켜질 때 DB에서 전부 읽어 메모리에 둔다(행사 규모면 수백 건). 순위표·닉네임 검사는 메모리로 한다 —
 *   매 요청마다 DB를 치지 않으므로 DB가 느려도 게임과 로비가 느려지지 않는다.
 * - 쓰기는 메모리에 먼저 반영하고 DB에는 **비동기로** 넣는다. 실패하면 재시도 큐에 남겨 지수 백오프로 다시 넣는다
 *   (운영자 화면에 "저장 대기 N건"). ⚠️ 재배포하면 이 큐가 사라지므로 행사 중에는 배포하지 않는다.
 * - DATABASE_URL이 없으면 메모리만 쓴다 — 로컬 개발과 테스트는 DB 없이 돈다(서버를 끄면 기록이 사라진다).
 *
 * 닉네임 중복의 최종 판정은 DB의 **유일 제약**이다(같은 이름으로 동시에 들어와도 먼저 들어간 쪽만 성공).
 */

/**
 * 새로 저장할 결과 한 건 — id·끝난 시각·무효 여부는 저장소가 붙인다. 시작 시각(startedAt)은 방이 판을 시작할 때 잰 값을
 * 넘긴다 — 개발자가 순위표를 행사 시간대로 잘라 볼 때(LeaderboardRange) 판의 시작·끝이 둘 다 필요하다.
 */
export type NewEventResult = Omit<EventResultRow, 'id' | 'createdAt' | 'invalid'>;

export type RegisterOutcome =
  | { ok: true; firstTime: boolean }
  | { ok: false; reason: 'taken' | 'pin' };

interface PlayerEntry {
  displayName: string;
  pinHash: string;
  persisted: boolean;
}

const RETRY_MIN_MS = 2000;
const RETRY_MAX_MS = 60_000;

export interface RecordStoreOptions {
  databaseUrl?: string;
  /** PIN 해시에 섞는 값 — 같은 PIN이라도 서버마다 다른 해시가 되게 한다 */
  pinPepper?: string;
  log?: (msg: string, err?: unknown) => void;
}

export class RecordStore {
  private pool: Pool | null = null;
  private state: 'memory' | 'connected' | 'error' = 'memory';
  private players = new Map<string, PlayerEntry>();
  private rows: EventResultRow[] = [];
  // DB에 아직 못 넣은 결과(메모리의 행 객체 그 자체 — 넣는 데 성공하면 id가 채워진다)와 그 id를 기다리는 쪽
  private pendingRows: Array<{ row: EventResultRow; resolve: (id: number | null) => void }> = [];
  private pendingPlayers = new Set<string>(); // DB에 아직 못 넣은 닉네임 키
  // 운영 설정(event_settings) — 지금은 개발자가 정하는 이벤트 규칙(EventConfig) 하나. 결과와 달리 재시도 큐가 없다:
  // 마지막에 저장한 값 하나만 의미가 있어서, 실패하면 메모리 값으로 계속 돌고 다음 저장 때 다시 넣는다.
  private settings = new Map<string, unknown>();
  private conflicts = 0;
  private localSeq = 0; // 메모리 전용일 때의 기록 번호
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_MIN_MS;
  private readonly pepper: string;
  private readonly log: (msg: string, err?: unknown) => void;
  private ready: Promise<void> = Promise.resolve();

  constructor(private readonly opts: RecordStoreOptions = {}) {
    this.pepper = opts.pinPepper ?? 'card-battle-event';
    this.log = opts.log ?? ((msg, err) => (err ? console.error(msg, err) : console.log(msg)));
  }

  /** DB에 붙어 표를 만들고(없으면) 기존 기록을 메모리로 읽는다. 실패해도 메모리로 계속 돌며 다시 붙을 때까지 재시도한다. */
  init(): Promise<void> {
    if (!this.opts.databaseUrl) {
      this.log('[event] DATABASE_URL 없음 — 이벤트 기록을 메모리에만 둡니다(서버를 끄면 사라집니다).');
      return this.ready;
    }
    this.pool = new Pool(poolConfig(this.opts.databaseUrl));
    // 풀의 유휴 연결이 끊겨도(Neon이 잠들 때 등) 프로세스를 죽이지 않는다 — 다음 쿼리가 새로 연결한다.
    this.pool.on('error', err => this.log('[event] DB 연결 오류(풀)', err));
    this.ready = this.connect();
    return this.ready;
  }

  /**
   * 표를 만들고(없으면) DB의 기록·닉네임·설정을 읽어 메모리와 **합친다.**
   *
   * ⚠️ 서버가 켜질 때 DB가 잠들어 있거나 끊겨 있었다면 여기서 실패하고, 재시도 타이머가 다시 부른다. 그동안 받은 결과
   *    (id가 아직 없는 행)와 닉네임은 메모리에 남아 있으므로 지우지 않고 DB 것 뒤에 이어 붙인 뒤, 다 읽은 다음에야
   *    쌓인 것을 DB에 넣는다(flush). 순서가 바뀌면 방금 넣은 행이 DB에서 한 번, 메모리에서 한 번 — 두 번 잡힌다.
   */
  private async connect(): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(SCHEMA_SQL);
      const [players, results, settings] = await Promise.all([
        this.pool.query('select name_key, display_name, pin_hash from event_players'),
        this.pool.query('select * from event_results order by id'),
        this.pool.query('select key, value from event_settings'),
      ]);
      // DB에 붙기 전에 메모리에서 바꾼 설정이 있으면 그쪽이 더 새것이다 — 덮어쓰지 않는다.
      for (const st of settings.rows) if (!this.settings.has(st.key)) this.settings.set(st.key, st.value);
      for (const p of players.rows) {
        this.players.set(p.name_key, { displayName: p.display_name, pinHash: p.pin_hash ?? '', persisted: true });
      }
      const waiting = this.rows.filter(r => r.id === null);
      this.rows = [...results.rows.map(rowFromDb), ...waiting];
      this.loaded = true;
      this.markHealthy();
      this.log(`[event] DB 연결 — 기록 ${results.rows.length}건 · 닉네임 ${players.rows.length}개를 읽었습니다.`);
      if (this.pendingCount() > 0) void this.flush();
    } catch (err) {
      this.log('[event] DB에 붙지 못했습니다 — 메모리로 계속하고, 다시 붙을 때까지 재시도합니다.', err);
      this.markUnhealthy();
    }
  }
  // DB의 기존 기록·닉네임을 다 읽어 왔는가 — 읽기 전에는 쌓인 것을 DB에 넣지 않는다(connect 주석).
  private loaded = false;

  /** 테스트·종료용 — 재시도 타이머와 DB 연결을 걷는다. */
  async close(): Promise<void> {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    await this.pool?.end().catch(() => {});
    this.pool = null;
  }

  storageState(): 'memory' | 'connected' | 'error' {
    return this.state;
  }

  pendingCount(): number {
    return this.pendingRows.length + this.pendingPlayers.size;
  }

  nameConflicts(): number {
    return this.conflicts;
  }

  // ─── 닉네임 ────────────────────────────────────────────────────────────────

  isRegistered(name: string): boolean {
    return this.players.has(normalizeNameKey(name));
  }

  /**
   * 처음 쓰는 닉네임이면 그 PIN으로 등록하고, 이미 쓴 닉네임이면 PIN이 같은지 본다(재도전, §7-1).
   *
   * 메모리에 먼저 자리를 잡은 뒤(같은 프로세스 안의 동시 요청을 막는다) DB에 넣는다. DB의 유일 제약에 걸리면
   * 다른 곳에서 먼저 등록된 것이므로 그쪽 PIN과 맞춰 본다. DB가 끊겨 있으면 메모리 판정으로 받아 두고
   * 다시 붙었을 때 넣는다 — 그때 유일 제약에 걸리는 건은 "닉네임 충돌"로 센다.
   */
  async registerOrVerify(displayName: string, pin: string): Promise<RegisterOutcome> {
    await this.ready;
    const key = normalizeNameKey(displayName);
    const pinHash = this.hashPin(key, pin);

    const known = this.players.get(key);
    if (known) return known.pinHash === pinHash ? { ok: true, firstTime: false } : { ok: false, reason: 'pin' };

    const entry: PlayerEntry = { displayName, pinHash, persisted: false };
    this.players.set(key, entry);
    if (!this.pool) return { ok: true, firstTime: true };

    try {
      const res = await this.pool.query(
        'insert into event_players (name_key, display_name, pin_hash) values ($1, $2, $3) on conflict (name_key) do nothing returning name_key',
        [key, displayName, pinHash],
      );
      if (res.rowCount === 1) {
        entry.persisted = true;
        this.markHealthy();
        return { ok: true, firstTime: true };
      }
      // 다른 곳에서 먼저 등록됐다 — 그쪽 PIN으로 판정한다.
      const existing = await this.pool.query('select display_name, pin_hash from event_players where name_key = $1', [key]);
      const row = existing.rows[0];
      this.players.set(key, { displayName: row?.display_name ?? displayName, pinHash: row?.pin_hash ?? '', persisted: true });
      return row?.pin_hash === pinHash ? { ok: true, firstTime: false } : { ok: false, reason: 'pin' };
    } catch (err) {
      this.log('[event] 닉네임 등록을 DB에 넣지 못했습니다 — 메모리로 받아 두고 다시 시도합니다.', err);
      this.pendingPlayers.add(key);
      this.markUnhealthy();
      return { ok: true, firstTime: true };
    }
  }

  private hashPin(key: string, pin: string): string {
    return createHash('sha256').update(`${this.pepper}:${key}:${pin}`).digest('hex');
  }

  // ─── 운영 설정 ──────────────────────────────────────────────────────────────

  /** 메모리의 설정 값(없으면 undefined). DB에 붙을 때 읽어 둔 값도 여기 있다. */
  setting(key: string): unknown {
    return this.settings.get(key);
  }

  /** 설정을 바꾼다 — 메모리에 곧바로, DB에는 비동기로(실패해도 메모리 값으로 계속 돈다). */
  async saveSetting(key: string, value: unknown): Promise<void> {
    this.settings.set(key, value);
    if (!this.pool) return;
    try {
      await this.pool.query(
        `insert into event_settings (key, value, updated_at) values ($1, $2, now())
         on conflict (key) do update set value = excluded.value, updated_at = now()`,
        [key, JSON.stringify(value)],
      );
    } catch (err) {
      this.log(`[event] 설정(${key})을 DB에 넣지 못했습니다 — 메모리 값으로 계속합니다(재시작하면 기본값).`, err);
    }
  }

  // ─── 결과 ──────────────────────────────────────────────────────────────────

  /**
   * 결과 한 건을 남긴다. 메모리에는 곧바로 들어가고(순위표에 즉시 반영), 기록 번호는 DB에 들어간 뒤에 생긴다.
   * 돌려주는 Promise는 **게임 흐름에서 await하지 말 것** — DB가 느리면 결과 화면이 늦게 뜬다.
   */
  saveResult(input: NewEventResult): Promise<number | null> {
    const row: EventResultRow = { ...input, id: null, createdAt: Date.now(), invalid: false };
    this.rows.push(row);
    if (!this.pool) {
      row.id = ++this.localSeq;
      return Promise.resolve(row.id);
    }
    return new Promise(resolve => {
      this.pendingRows.push({ row, resolve });
      void this.flush();
    });
  }

  results(): EventResultRow[] {
    return this.rows.map(r => ({
      ...r,
      peakLevels: { ...r.peakLevels },
      ...(r.peakExp ? { peakExp: { ...r.peakExp } } : {}),
      ...(r.peakSkill ? { peakSkill: { ...r.peakSkill } } : {}),
      detail: { ...r.detail },
    }));
  }

  /** range를 주면 그 기간 안에 시작해 끝난 판만 센다(leaderboard.ts의 inRange). */
  leaderboard(range?: LeaderboardRange): Leaderboard {
    return computeLeaderboard(this.rows, range);
  }

  async invalidate(recordId: number, invalid: boolean): Promise<boolean> {
    const row = this.rows.find(r => r.id === recordId);
    if (!row) return false;
    row.invalid = invalid;
    if (this.pool) {
      try {
        await this.pool.query('update event_results set invalid = $2 where id = $1', [recordId, invalid]);
      } catch (err) {
        this.log('[event] 무효 처리를 DB에 넣지 못했습니다(메모리에는 반영됨).', err);
      }
    }
    return true;
  }

  /** 행사가 끝난 뒤 — 결과와 닉네임 등록부를 모두 지운다(운영 설정은 남긴다). */
  async wipe(): Promise<void> {
    this.rows = [];
    this.players.clear();
    this.pendingRows.forEach(p => p.resolve(null));
    this.pendingRows = [];
    this.pendingPlayers.clear();
    this.conflicts = 0;
    this.localSeq = 0;
    if (this.pool) await this.pool.query('truncate event_results, event_players restart identity');
  }

  // ─── 재시도 ────────────────────────────────────────────────────────────────

  /** 쌓인 것을 순서대로 넣는다. 하나라도 실패하면 거기서 멈추고 백오프 뒤 다시. */
  private async flush(): Promise<void> {
    if (!this.pool || this.flushing) return;
    // 아직 DB의 기존 기록을 못 읽었다 — 먼저 붙어서 읽은 뒤에 넣는다(재시도 타이머가 connect를 부른다).
    if (!this.loaded) {
      this.markUnhealthy();
      return;
    }
    this.flushing = true;
    try {
      for (const key of [...this.pendingPlayers]) {
        const entry = this.players.get(key);
        if (!entry) { this.pendingPlayers.delete(key); continue; }
        const res = await this.pool.query(
          'insert into event_players (name_key, display_name, pin_hash) values ($1, $2, $3) on conflict (name_key) do nothing returning name_key',
          [key, entry.displayName, entry.pinHash],
        );
        if (res.rowCount !== 1) {
          // 끊겨 있던 사이 다른 곳에서 같은 닉네임이 먼저 들어갔다 — 운영자가 볼 수 있게 센다.
          this.conflicts += 1;
          this.log(`[event] 닉네임 충돌 — "${entry.displayName}"이(가) DB가 끊긴 사이 다른 곳에서 먼저 등록됐습니다.`);
        }
        entry.persisted = true;
        this.pendingPlayers.delete(key);
      }
      while (this.pendingRows.length > 0) {
        const { row, resolve } = this.pendingRows[0];
        const res = await this.pool.query(
          `insert into event_results
             (created_at, started_at, event, player_name, developer, won, end_reason, peak_levels, peak_exp, peak_skill, detail, turns, duration_ms, invalid)
           values (to_timestamp($1 / 1000.0), to_timestamp($2 / 1000.0), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) returning id`,
          [row.createdAt, row.startedAt, row.event, row.playerName, row.developer, row.won, row.endReason,
           JSON.stringify(row.peakLevels), row.peakExp ? JSON.stringify(row.peakExp) : null,
           row.peakSkill ? JSON.stringify(row.peakSkill) : null, JSON.stringify(row.detail),
           row.turns, row.durationMs, row.invalid],
        );
        row.id = Number(res.rows[0].id);
        this.pendingRows.shift();
        resolve(row.id);
      }
      this.markHealthy();
    } catch (err) {
      this.log(`[event] DB 저장 실패 — ${this.pendingCount()}건을 ${Math.round(this.retryDelay / 1000)}초 뒤 다시 시도합니다.`, err);
      this.markUnhealthy();
    } finally {
      this.flushing = false;
    }
  }
  private flushing = false;

  private markHealthy(): void {
    this.state = 'connected';
    this.retryDelay = RETRY_MIN_MS;
  }

  private markUnhealthy(): void {
    this.state = 'error';
    if (this.retryTimer) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(RETRY_MAX_MS, this.retryDelay * 2);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      // 처음 읽기에 실패했으면 다시 붙어 읽는 것부터 — 읽고 나면 connect가 알아서 flush한다.
      void (this.loaded ? this.flush() : this.connect());
    }, delay);
    // 재시도 대기만 남았다는 이유로 프로세스(테스트 포함)가 붙들리지 않게 한다.
    this.retryTimer.unref?.();
  }
}

function rowFromDb(r: Record<string, unknown>): EventResultRow {
  const parse = <T>(v: unknown, fallback: T): T => {
    if (v && typeof v === 'object') return v as T;
    if (typeof v === 'string') { try { return JSON.parse(v) as T; } catch { return fallback; } }
    return fallback;
  };
  const createdAt = new Date(r.created_at as string).getTime();
  const durationMs = Number(r.duration_ms ?? 0);
  return {
    id: Number(r.id),
    // started_at 열이 생기기 전(2026-10-27 이전)의 행은 비어 있다 — 끝난 시각에서 판 길이를 빼 되짚는다.
    startedAt: r.started_at ? new Date(r.started_at as string).getTime() : createdAt - durationMs,
    createdAt,
    event: r.event as EventResultRow['event'],
    playerName: String(r.player_name),
    developer: (r.developer as string | null) ?? null,
    won: Boolean(r.won),
    endReason: r.end_reason as EventResultRow['endReason'],
    peakLevels: parse(r.peak_levels, { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 }),
    // 카드별 최대 경험치 — 이 열이 생기기 전(2026-10-27 이전)의 행은 비어 있다(순위표는 레벨만 그린다)
    ...(r.peak_exp ? { peakExp: parse(r.peak_exp, { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 }) } : {}),
    // 카드별 기술 한 번의 최고 효과 — 이 열이 생기기 전(2026-10-27 이전)의 행은 비어 있다
    ...(r.peak_skill ? { peakSkill: parse(r.peak_skill, { sheep: 0, rabbit: 0, mermaid: 0, tiger: 0 }) } : {}),
    detail: parse(r.detail, {}),
    turns: Number(r.turns ?? 0),
    durationMs,
    invalid: Boolean(r.invalid),
  };
}

/**
 * 접속 문자열 → 풀 설정. Neon·Supabase는 TLS가 필수인데, pg는 접속 문자열의 sslmode를 **명시한 ssl 옵션보다
 * 우선해** 읽는다 — 그래서 sslmode를 떼어 내고 ssl을 직접 준다. 로컬 DB(localhost)에는 TLS를 걸지 않는다.
 */
function poolConfig(databaseUrl: string) {
  let connectionString = databaseUrl;
  let local = false;
  try {
    const url = new URL(databaseUrl);
    local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    url.searchParams.delete('sslmode');
    url.searchParams.delete('channel_binding');
    connectionString = url.toString();
  } catch {
    // URL로 읽히지 않으면 그대로 넘긴다(pg가 판단한다).
  }
  return {
    connectionString,
    ssl: local ? undefined : { rejectUnauthorized: false },
    max: 4,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  };
}

const SCHEMA_SQL = `
create table if not exists event_results (
  id           bigserial primary key,
  created_at   timestamptz not null default now(),
  event        text not null,
  player_name  text not null,
  developer    text,
  won          boolean not null,
  end_reason   text not null,
  peak_levels  jsonb not null,
  detail       jsonb not null default '{}',
  turns        int,
  duration_ms  int,
  invalid      boolean not null default false
);
create index if not exists event_results_event_won on event_results (event, won);
-- 판이 시작된 시각(2026-10-27 추가). 이미 만들어진 표에는 열만 덧붙인다 — 그 전의 행은 비어 있고, 읽을 때
-- created_at − duration_ms로 되짚는다(rowFromDb). created_at은 판이 끝나 기록된 시각이다.
alter table event_results add column if not exists started_at timestamptz;
-- 카드별 최대 경험치(2026-10-27 추가 — 순위표의 카드별 "점수"). 그 전 행은 비어 있다.
alter table event_results add column if not exists peak_exp jsonb;
-- 카드별 기술 한 번의 최고 효과(2026-10-27 추가 — 순위표의 카드별 점수·동물의 왕). 그 전 행은 비어 있다.
alter table event_results add column if not exists peak_skill jsonb;
-- 개발자가 순위표를 행사 시간대로 잘라 볼 때(LeaderboardRange) 시각으로 찾는다.
create index if not exists event_results_started_at on event_results (started_at);
create index if not exists event_results_created_at on event_results (created_at);
-- 운영 설정(2026-10-27) — 개발자가 정하는 이벤트 규칙(EventConfig) 등. 행사 종료 일괄 삭제(wipe)에도 남는다.
-- (옛 event_config 표와 이름을 일부러 달리했다 — 그 표가 남아 있는 DB에서 열 구성이 달라 부딪히지 않게)
create table if not exists event_settings (
  key          text primary key,
  value        jsonb not null,
  updated_at   timestamptz not null default now()
);
create table if not exists event_players (
  name_key     text primary key,
  display_name text not null,
  pin_hash     text,
  created_at   timestamptz not null default now()
);
`;
