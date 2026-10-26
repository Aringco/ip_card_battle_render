'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LeaderboardRange } from 'shared';
import { useWebSocket } from '@/hooks/useWebSocket';
import { LeaderboardView } from '@/components/events/LeaderboardView';
import { ALL_TIME, RangeFilter, loadSavedRange, rangeQuery } from '@/components/events/RangeFilter';
import { PLAY_ASSETS } from '@/lib/playAssets';
import { loadDevSession, markEventReturn } from '@/lib/eventSession';

const REFRESH_MS = 15_000;

/**
 * 이벤트 순위표(누구나) — 로비의 이벤트 폼에서 [🏆 순위]로 들어온다(EVENT_MODE_ROADMAP.md §2.5).
 * 읽기는 WebSocket 메시지(getLeaderboard)로 한다 — 로컬 개발은 Next(3000)와 WS(8080)가 나뉘어 있어
 * Next API 라우트를 쓰면 로컬과 배포의 경로가 달라진다.
 *
 * **개발자로 들어온 탭에서는 집계 기간(날짜·시간대)을 고를 수 있다**(2026-10-27 요청 — RangeFilter). 개발자인지는
 * 이 탭에 개발자 세션(eventSession — 운영 암호를 넣고 대기실에 들어갔을 때 남는다)이 있는지로 가른다. 기간은 읽기
 * 조건일 뿐이라 서버가 따로 막지 않는다 — 도전자 화면에서 기간 칸을 숨기는 것은 화면을 단순하게 두려는 것이다.
 */
export default function EventsPage() {
  const router = useRouter();
  const ws = useWebSocket();
  const { connected, getLeaderboard } = ws;
  // ⚠️ 첫 렌더는 서버 렌더와 같아야 한다 — 개발자 여부·저장된 기간은 마운트 뒤에 읽는다(hydration).
  const [isDev, setIsDev] = useState(false);
  const [range, setRange] = useState<LeaderboardRange>(ALL_TIME);
  useEffect(() => {
    const dev = loadDevSession() !== null;
    setIsDev(dev);
    if (dev) setRange(loadSavedRange());
  }, []);

  useEffect(() => {
    if (!connected) return;
    const refresh = () => getLeaderboard(range);
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [connected, getLeaderboard, range]);

  // 로비로 돌아가면 이벤트 폼이 열린 채로 시작한다(도전 화면에서 순위를 보러 온 사람이 대부분이다).
  const back = () => {
    markEventReturn();
    router.push('/');
  };

  return (
    <div
      className="min-h-screen result-bg flex flex-col items-center gap-6 p-6 md:p-10"
      style={{ ['--result-bg' as string]: `url(${PLAY_ASSETS.resultBackground})` }}
    >
      <div className="event-board-width flex items-center justify-between gap-3">
        <button onClick={back} className="wood-button py-2 px-6">← 이벤트로</button>
        <h1 className="text-2xl md:text-3xl font-extrabold result-bg-text">🏆 이벤트 순위표</h1>
        <span className="text-xs result-bg-text">{connected ? '15초마다 갱신' : '서버에 연결 중…'}</span>
      </div>
      {isDev && (
        <div className="event-board-width flex flex-col items-center gap-2">
          <RangeFilter value={range} onChange={setRange} />
          <a href={`/events/board${rangeQuery(range)}`} target="_blank" rel="noreferrer" className="text-sm font-bold underline result-bg-text">
            이 기간으로 부스 화면 열기 ↗
          </a>
        </div>
      )}
      <LeaderboardView data={ws.leaderboard} />
    </div>
  );
}
