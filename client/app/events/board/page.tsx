'use client';

import { useEffect, useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { LeaderboardView } from '@/components/events/LeaderboardView';
import { PLAY_ASSETS } from '@/lib/playAssets';

const REFRESH_MS = 30_000;

/**
 * 부스 대형 화면 — 순위표를 30초마다 갱신하는 전체 화면(EVENT_MODE_ROADMAP.md §2.5).
 * 버튼이 없다(부스 모니터에 띄워 두는 화면). 이 화면이 늘 접속해 있으면 Render 무료 인스턴스가
 * 잠드는 것을 막는 효과도 있다 — 실제로 막히는지는 리허설에서 확인한다(§6).
 */
export default function EventBoardPage() {
  const ws = useWebSocket();
  const { connected, getLeaderboard } = ws;
  const [updatedAt, setUpdatedAt] = useState<string>('');

  useEffect(() => {
    if (!connected) return;
    const refresh = () => {
      getLeaderboard();
      setUpdatedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    };
    refresh();
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [connected, getLeaderboard]);

  return (
    <div
      className="min-h-screen result-bg flex flex-col items-center gap-6 p-8"
      style={{ ['--result-bg' as string]: `url(${PLAY_ASSETS.resultBackground2})` }}
    >
      <h1 className="text-5xl font-extrabold result-bg-text">🎉 떱카드 이벤트 — 동물의 왕을 찾아라!</h1>
      <LeaderboardView data={ws.leaderboard} big />
      <p className="text-sm result-bg-text">
        {connected ? `30초마다 갱신 · 마지막 갱신 ${updatedAt}` : '서버에 연결 중…'}
      </p>
    </div>
  );
}
