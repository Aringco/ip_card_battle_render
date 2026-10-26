'use client';

import { useEffect, useState } from 'react';
import type { LeaderboardRange } from 'shared';

/**
 * 순위표·기록의 집계 기간 고르기(2026-10-27 요청 — "이벤트 시작 시점부터 종료 시점까지", 개발자가 날짜·시간대를 정한다).
 * /events(개발자로 들어온 탭)와 운영자 화면(/admin)이 같이 쓴다.
 *
 * - 입력은 브라우저의 `datetime-local`(이 기기의 시간대) → ms로 바꿔 넘긴다. 서버는 시각(ms)만 비교하므로 시간대가 섞이지 않는다.
 * - 판이 기간 안이라는 뜻은 **시작이 from 이후, 끝이 to 이전**이다(shared의 inLeaderboardRange).
 * - 고른 기간은 이 탭의 sessionStorage에 남는다 — 순위표와 로비를 오가도 다시 고르지 않아도 된다.
 */

export const ALL_TIME: LeaderboardRange = { from: null, to: null };
const STORE_KEY = 'cardBattle_eventRange';

/** ms → `datetime-local` 값(이 기기의 시간대, 분 단위) */
function toInput(ms: number | null): string {
  if (ms === null) return '';
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` 값 → ms. 비었거나 읽을 수 없으면 null(그쪽 끝 없음) */
function fromInput(v: string, endOfMinute: boolean): number | null {
  if (!v) return null;
  const ms = new Date(v).getTime();
  if (!Number.isFinite(ms)) return null;
  // 끝 시각은 그 분의 마지막 순간까지 넣는다 — "18:00까지"라고 고르면 18:00:59에 끝난 판도 들어간다.
  return endOfMinute ? ms + 59_999 : ms;
}

export function loadSavedRange(): LeaderboardRange {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return ALL_TIME;
    const v = JSON.parse(raw) as LeaderboardRange;
    return { from: typeof v.from === 'number' ? v.from : null, to: typeof v.to === 'number' ? v.to : null };
  } catch {
    return ALL_TIME;
  }
}

function saveRange(r: LeaderboardRange): void {
  try {
    sessionStorage.setItem(STORE_KEY, JSON.stringify(r));
  } catch {
    // 저장이 막혀 있어도(사생활 보호 모드 등) 이 화면에서는 그대로 쓴다.
  }
}

/** 부스 화면(/events/board)으로 넘길 주소 뒤쪽 — 그 화면이 같은 기간으로 열리게 */
export function rangeQuery(r: LeaderboardRange): string {
  const q = new URLSearchParams();
  if (r.from !== null) q.set('from', String(r.from));
  if (r.to !== null) q.set('to', String(r.to));
  const s = q.toString();
  return s ? `?${s}` : '';
}

/** 주소의 ?from=&to= → 기간(부스 화면) */
export function rangeFromQuery(search: string): LeaderboardRange {
  const q = new URLSearchParams(search);
  const num = (k: string) => {
    const v = q.get(k);
    if (v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return { from: num('from'), to: num('to') };
}

/** 사람이 읽는 기간 — "10/27 13:00 ~ 10/27 18:00" */
export function describeRange(r: LeaderboardRange): string {
  if (r.from === null && r.to === null) return '전체 기간';
  const fmt = (ms: number) =>
    new Date(ms).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  return `${r.from !== null ? fmt(r.from) : '처음'} ~ ${r.to !== null ? fmt(r.to) : '지금'}`;
}

export function RangeFilter({ value, onChange }: { value: LeaderboardRange; onChange: (r: LeaderboardRange) => void }) {
  // 입력 중인 값은 [적용]을 눌러야 반영한다 — 한 글자 칠 때마다 순위표를 다시 받지 않게.
  const [fromText, setFromText] = useState(toInput(value.from));
  const [toText, setToText] = useState(toInput(value.to));
  useEffect(() => {
    setFromText(toInput(value.from));
    setToText(toInput(value.to));
  }, [value.from, value.to]);

  const apply = (r: LeaderboardRange) => {
    saveRange(r);
    onChange(r);
  };

  const today = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    apply({ from: start.getTime(), to: end.getTime() });
  };

  return (
    <div className="event-range" role="group" aria-label="집계 기간">
      <label>
        시작
        <input type="datetime-local" value={fromText} onChange={e => setFromText(e.target.value)} />
      </label>
      <label>
        종료
        <input type="datetime-local" value={toText} onChange={e => setToText(e.target.value)} />
      </label>
      <button type="button" data-primary onClick={() => apply({ from: fromInput(fromText, false), to: fromInput(toText, true) })}>
        적용
      </button>
      <button type="button" onClick={today}>오늘</button>
      <button type="button" onClick={() => apply(ALL_TIME)}>전체</button>
      <p className="event-range-note">
        집계 기간: <b>{describeRange(value)}</b> · 이 기간 안에 시작해 끝난 판만 셉니다
      </p>
    </div>
  );
}
