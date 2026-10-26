'use client';

import { useEffect, useMemo, useState } from 'react';
import type { EventResultRow } from 'shared';
import { EVENT_LABELS } from 'shared';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ANIMAL_INFO } from '@/lib/animals';

/**
 * 이벤트 운영자 화면(EVENT_MODE_ROADMAP.md §2.5) — 운영 토큰(서버 환경변수 EVENT_ADMIN_TOKEN)을 넣어야 쓸 수 있다.
 *
 * ⚠️ 토큰 검사는 **서버가 한다.** 이 화면은 버튼을 보여 줄 뿐이고, 틀린 토큰으로 보낸 명령은 서버가 EVENT_AUTH로 거부한다.
 * 토큰은 이 탭의 sessionStorage에만 둔다(탭을 닫으면 사라진다).
 *
 * - 저장소 상태(DB 연결 · 저장 대기 · 닉네임 충돌) · 개발자 · 대기 줄
 * - 전체 기록 · 무효 처리 · CSV 내려받기 · 행사 종료 후 일괄 삭제
 */
const TOKEN_KEY = 'cardBattle_adminToken';
const REFRESH_MS = 10_000;

function csvOf(rows: EventResultRow[]): string {
  const head = ['기록번호', '시각', '도전', '닉네임', '개발자', '성공', '종료사유', '양', '토끼', '인어', '호랑이', '목표', '최종점수', '고정카드', '턴', '판길이(초)', '무효'];
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map(r => [
    r.id ?? '', new Date(r.createdAt).toLocaleString('ko-KR'), EVENT_LABELS[r.event], r.playerName, r.developer ?? '',
    r.won ? 'O' : 'X', r.endReason, r.peakLevels.sheep, r.peakLevels.rabbit, r.peakLevels.mermaid, r.peakLevels.tiger,
    r.detail.target ?? '', r.detail.finalScore ?? '',
    r.detail.lockedAnimal ? ANIMAL_INFO[r.detail.lockedAnimal].name : '', r.turns, Math.round(r.durationMs / 1000),
    r.invalid ? 'O' : '',
  ].map(esc).join(','));
  // 엑셀이 한글을 깨뜨리지 않게 BOM을 붙인다.
  return '﻿' + [head.join(','), ...lines].join('\n');
}

export default function AdminPage() {
  const ws = useWebSocket();
  const { connected, eventAdmin, adminState, eventError } = ws;
  const [token, setToken] = useState('');
  const [tokenInput, setTokenInput] = useState('');
  const [wipeArmed, setWipeArmed] = useState(false);
  const [filter, setFilter] = useState<'all' | EventResultRow['event']>('all');

  useEffect(() => {
    setToken(sessionStorage.getItem(TOKEN_KEY) ?? '');
  }, []);

  // 토큰이 있으면 상태를 주기적으로 다시 받는다.
  useEffect(() => {
    if (!connected || !token) return;
    eventAdmin({ token, action: 'state' });
    const t = setInterval(() => eventAdmin({ token, action: 'state' }), REFRESH_MS);
    return () => clearInterval(t);
  }, [connected, token, eventAdmin]);

  // 토큰이 틀렸으면 지운다(다시 입력하게).
  useEffect(() => {
    if (eventError?.code === 'EVENT_AUTH') {
      sessionStorage.removeItem(TOKEN_KEY);
      setToken('');
      setTokenInput(''); // 틀린 값 뒤에 이어 치지 않게 비운다
    }
  }, [eventError]);

  const rows = useMemo(
    () => (adminState?.results ?? []).filter(r => filter === 'all' || r.event === filter),
    [adminState, filter],
  );

  const login = () => {
    const t = tokenInput.trim();
    if (!t) return;
    sessionStorage.setItem(TOKEN_KEY, t);
    setToken(t);
  };

  const downloadCsv = () => {
    const blob = new Blob([csvOf(adminState?.results ?? [])], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `event-results-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6 flex flex-col gap-3">
          <h1 className="text-xl font-extrabold">🛠️ 이벤트 운영자</h1>
          <p className="text-sm text-gray-600">운영 토큰(서버 환경변수 EVENT_ADMIN_TOKEN)을 입력하세요.</p>
          {eventError && <p className="text-sm text-red-600">{eventError.message}</p>}
          <input
            type="password"
            value={tokenInput}
            onChange={e => setTokenInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') login(); }}
            className="border rounded-lg px-3 py-2"
            autoComplete="off"
          />
          <button onClick={login} disabled={!connected} className="bg-amber-700 text-white rounded-lg py-2 font-bold disabled:opacity-50">
            {connected ? '들어가기' : '서버에 연결 중…'}
          </button>
        </div>
      </div>
    );
  }

  const st = adminState;
  return (
    <div className="min-h-screen bg-amber-50 p-4 md:p-8 flex flex-col gap-5 text-gray-800">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold">🛠️ 이벤트 운영자</h1>
        <div className="flex gap-2">
          <a href="/events/board" target="_blank" rel="noreferrer" className="rounded-lg border px-3 py-1.5 bg-white text-sm font-bold">부스 화면 열기</a>
          <button onClick={() => { sessionStorage.removeItem(TOKEN_KEY); setToken(''); }} className="rounded-lg border px-3 py-1.5 bg-white text-sm">로그아웃</button>
        </div>
      </div>

      {eventError && <p className="text-sm text-red-600">{eventError.message}</p>}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="font-bold mb-2">저장소</h2>
          <p>상태: <b className={st?.storage === 'error' ? 'text-red-600' : st?.storage === 'connected' ? 'text-green-700' : 'text-amber-700'}>
            {st?.storage === 'connected' ? 'DB 연결됨' : st?.storage === 'error' ? 'DB 오류(재시도 중)' : '메모리만(서버를 끄면 사라짐)'}
          </b></p>
          <p>저장 대기: <b>{st?.pending ?? '-'}</b>건</p>
          <p>닉네임 충돌: <b>{st?.nameConflicts ?? '-'}</b>건</p>
          <p className="text-xs text-gray-500 mt-1">⚠️ 행사 중에는 재배포하지 마세요 — 저장 대기 중인 기록과 진행 중인 판이 사라집니다.</p>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <h2 className="font-bold mb-2">개발자 · 대기 줄</h2>
          {(st?.developers ?? []).length === 0 && <p className="text-sm text-gray-500">대기 중인 개발자 없음</p>}
          {(st?.developers ?? []).map((d, i) => (
            <p key={`${d.name}-${i}`} className="text-sm">👨‍💻 {d.name} — <b>{{ idle: '대기', away: '자리 비움', matched: '매칭', playing: '경기 중', offline: '접속 끊김' }[d.state]}</b></p>
          ))}
          <p className="text-sm mt-2">대기 줄: <b>{st?.queue.length ?? 0}</b>명 {st && st.queue.length > 0 ? `(${st.queue.join(', ')})` : ''}</p>
        </div>
      </section>

      <section className="bg-white rounded-xl shadow p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold mr-2">기록 {rows.length}건</h2>
          {(['all', 'beatDev', 'timeAttack', 'oneWell'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1 text-sm border ${filter === f ? 'bg-amber-700 text-white' : 'bg-white'}`}
            >
              {f === 'all' ? '전체' : EVENT_LABELS[f]}
            </button>
          ))}
          <span className="flex-1" />
          <button onClick={downloadCsv} className="rounded-lg border px-3 py-1.5 text-sm font-bold bg-white">CSV 내려받기</button>
          {!wipeArmed ? (
            <button onClick={() => setWipeArmed(true)} className="rounded-lg border border-red-300 text-red-700 px-3 py-1.5 text-sm font-bold bg-white">
              행사 종료 — 전체 삭제
            </button>
          ) : (
            <span className="flex items-center gap-2 text-sm">
              <b className="text-red-700">기록과 닉네임이 모두 지워집니다.</b>
              <button onClick={() => { eventAdmin({ token, action: 'wipe' }); setWipeArmed(false); }} className="rounded-lg bg-red-600 text-white px-3 py-1.5 font-bold">정말 삭제</button>
              <button onClick={() => setWipeArmed(false)} className="rounded-lg border px-3 py-1.5">취소</button>
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-1 pr-2">#</th>
                <th className="pr-2">시각</th>
                <th className="pr-2">도전</th>
                <th className="pr-2">닉네임</th>
                <th className="pr-2">결과</th>
                <th className="pr-2">최고 레벨(양·토끼·인어·호랑이)</th>
                <th className="pr-2">상세</th>
                <th className="pr-2">무효</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id ?? `p${i}`} className={`border-b ${r.invalid ? 'opacity-40 line-through' : ''}`}>
                  <td className="py-1 pr-2 tabular-nums">{r.id ?? '저장 대기'}</td>
                  <td className="pr-2 whitespace-nowrap">{new Date(r.createdAt).toLocaleTimeString('ko-KR')}</td>
                  <td className="pr-2 whitespace-nowrap">{EVENT_LABELS[r.event]}</td>
                  <td className="pr-2 font-bold">{r.playerName}{r.developer ? <span className="font-normal text-gray-500"> vs {r.developer}</span> : null}</td>
                  <td className="pr-2">{r.won ? '✅ 성공' : '❌ 실패'} <span className="text-gray-500">({r.endReason})</span></td>
                  <td className="pr-2 tabular-nums">{r.peakLevels.sheep} · {r.peakLevels.rabbit} · {r.peakLevels.mermaid} · {r.peakLevels.tiger}</td>
                  <td className="pr-2 text-gray-600">
                    {r.detail.target ? `목표 ${r.detail.target}` : ''}
                    {r.detail.finalScore != null ? ` · 최종 ${r.detail.finalScore}점` : ''}
                    {r.detail.lockedAnimal ? `${ANIMAL_INFO[r.detail.lockedAnimal].emoji} ${ANIMAL_INFO[r.detail.lockedAnimal].name}` : ''}
                    {r.detail.devForfeit ? '개발자 기권' : ''}
                  </td>
                  <td className="pr-2">
                    {r.id !== null && (
                      <button
                        onClick={() => eventAdmin({ token, action: 'invalidate', recordId: r.id!, invalid: !r.invalid })}
                        className="rounded border px-2 py-0.5 text-xs bg-white"
                      >
                        {r.invalid ? '되살리기' : '무효'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
