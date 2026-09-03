'use client';

import { useState } from 'react';
import type { GameSettings, LobbyPlayer, Team } from 'shared';

export function WaitingRoom({
  roomId, players, teamNames, settings, isReady, onReady,
}: {
  roomId: string;
  players: LobbyPlayer[];
  teamNames: Record<Team, string | null>;
  settings: GameSettings;
  isReady: boolean;
  onReady: () => void;
}) {
  const teamA = players.filter(p => p.team === 'A');
  const teamB = players.filter(p => p.team === 'B');
  const canStart = players.length >= 2 && players.every(p => p.ready) && teamA.length > 0 && teamB.length > 0;

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 flex flex-col gap-5">
      <div className="text-center">
        <p className="text-sm text-gray-400">방 코드</p>
        <div className="flex items-center justify-center gap-2">
          <p className="text-4xl font-mono font-bold text-jungle-700 tracking-widest">{roomId}</p>
          <CopyCodeButton code={roomId} />
        </div>
        <p className="text-xs text-gray-400 mt-1">친구에게 이 코드를 알려주세요</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TeamColumn label={`🟢 ${teamNames.A ?? '팀 1 (미정)'}`} players={teamA} />
        <TeamColumn label={`🔵 ${teamNames.B ?? '팀 2 (미정)'}`} players={teamB} />
      </div>

      <div className="bg-gray-50 rounded-xl p-3 text-xs text-gray-500 flex flex-wrap gap-x-4 gap-y-1 justify-center">
        <span>
          🚩 선공{' '}
          {settings.firstTeam === 'random'
            ? '무작위 추첨'
            : settings.firstTeam === 'A'
              ? (teamNames.A ?? '팀 1')
              : (teamNames.B ?? '팀 2')}
        </span>
        <span>🎯 목표 {settings.targetScore}점</span>
        <span>🌰 축제 {settings.festivalTurn}턴부터 (뽑기 {settings.festivalDrawCount}회)</span>
        <span>⏳ 뽑기 {settings.drawTimeSec}초</span>
        <span>⏳ 행동 {settings.actionTimeSec}초</span>
      </div>

      {canStart ? (
        <p className="text-center text-jungle-600 font-semibold animate-pulse">게임 시작 중...</p>
      ) : (
        <button
          onClick={onReady}
          disabled={isReady}
          className="bg-jungle-600 hover:bg-jungle-700 disabled:bg-jungle-300 text-white font-semibold py-3 rounded-xl transition"
        >
          {isReady ? '준비 완료 ✓' : '준비'}
        </button>
      )}
    </div>
  );
}

/** 방 코드 복사 — 클립보드 API가 막힌 환경(비 HTTPS 등)에서는 조용히 실패한다. */
function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 복사 불가 환경 — 코드가 화면에 이미 크게 떠 있으므로 별도 안내는 하지 않는다
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="방 코드 복사"
      className="text-xs text-gray-500 hover:text-jungle-700 bg-gray-100 hover:bg-gray-200
                 px-2 py-1 rounded-lg transition shrink-0"
    >
      {copied ? '복사됨 ✓' : '복사'}
    </button>
  );
}

function TeamColumn({ label, players }: { label: string; players: LobbyPlayer[] }) {
  return (
    <div className="bg-gray-50 rounded-xl p-3 min-h-[80px]">
      <p className="font-semibold text-gray-700 text-sm mb-2">{label}</p>
      {players.length === 0 ? (
        <p className="text-xs text-gray-400">없음</p>
      ) : (
        players.map(p => (
          <div key={p.nickname} className="flex items-center gap-2 text-sm py-0.5">
            <span className={`w-2 h-2 rounded-full shrink-0 ${p.ready ? 'bg-jungle-500' : 'bg-gray-300'}`} />
            <span className="text-gray-700 truncate">{p.nickname}</span>
          </div>
        ))
      )}
    </div>
  );
}
