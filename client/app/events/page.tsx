'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWebSocket } from '@/hooks/useWebSocket';
import { LeaderboardView } from '@/components/events/LeaderboardView';
import { PLAY_ASSETS } from '@/lib/playAssets';
import { markEventReturn } from '@/lib/eventSession';

const REFRESH_MS = 15_000;

/**
 * 이벤트 순위표(누구나) — 로비의 이벤트 폼에서 [🏆 순위]로 들어온다(EVENT_MODE_ROADMAP.md §2.5).
 * 읽기는 WebSocket 메시지(getLeaderboard)로 한다 — 로컬 개발은 Next(3000)와 WS(8080)가 나뉘어 있어
 * Next API 라우트를 쓰면 로컬과 배포의 경로가 달라진다.
 */
export default function EventsPage() {
  const router = useRouter();
  const ws = useWebSocket();
  const { connected, getLeaderboard } = ws;

  useEffect(() => {
    if (!connected) return;
    getLeaderboard();
    const t = setInterval(getLeaderboard, REFRESH_MS);
    return () => clearInterval(t);
  }, [connected, getLeaderboard]);

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
      <div className="w-full max-w-5xl flex items-center justify-between gap-3">
        <button onClick={back} className="wood-button py-2 px-6">← 이벤트로</button>
        <h1 className="text-2xl md:text-3xl font-extrabold result-bg-text">🏆 이벤트 순위표</h1>
        <span className="text-xs result-bg-text">{connected ? '15초마다 갱신' : '서버에 연결 중…'}</span>
      </div>
      <LeaderboardView data={ws.leaderboard} />
    </div>
  );
}
