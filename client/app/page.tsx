'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { GameSettings, LobbyPlayer, Team } from 'shared';
import { DEFAULT_SETTINGS, SETTINGS_LIMITS } from 'shared';
import { useWebSocket } from '@/hooks/useWebSocket';
import { playBgm } from '@/lib/bgm';
import { HowToPlayModal } from '@/components/ui/HowToPlayModal';
import { LoadingScreen } from '@/components/ui/LoadingScreen';

export default function LobbyPage() {
  const router = useRouter();
  const ws = useWebSocket();

  // 효과음·이미지 프리로드가 끝나기 전에는 로딩 화면을 덮어둔다.
  // (게임 도중 그때그때 받으면 첫 효과음이 안 들리거나 카드 이미지가 늦게 뜬다)
  const [assetsReady, setAssetsReady] = useState(false);
  const handleAssetsReady = useCallback(() => setAssetsReady(true), []);

  // 로비/대기실 BGM — 입장 즉시부터 게임 시작 전까지 계속 재생
  useEffect(() => {
    playBgm('/sounds/bgm_main.mp3', 0.6);
  }, []);

  const [nickname, setNickname] = useState('');
  const [team, setTeam] = useState<Team>('A');
  const [teamName, setTeamName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [mode, setMode] = useState<'home' | 'create' | 'join' | 'solo' | 'waiting'>('home');
  const [isReady, setIsReady] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  // 방장(방을 만드는 쪽)만 정하는 게임 규칙 — 방 생성/싱글 모드 시작 화면에서 함께 입력받는다.
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  // 방 입장 감지
  useEffect(() => {
    if (ws.roomId && mode !== 'waiting') setMode('waiting');
  }, [ws.roomId, mode]);

  // 게임 시작 감지 → 게임 화면으로 이동
  useEffect(() => {
    if (ws.gameState && ws.roomId) {
      router.push(`/room/${ws.roomId}`);
    }
  }, [ws.gameState, ws.roomId, router]);

  const handleCreateRoom = () => {
    if (!nickname.trim()) return;
    sessionStorage.setItem('cardBattle_team', team);
    ws.createRoom(nickname.trim(), team, teamName.trim() || undefined, settings);
  };

  const handleJoinRoom = () => {
    if (!nickname.trim() || !joinRoomId.trim()) return;
    sessionStorage.setItem('cardBattle_team', team);
    ws.joinRoom(joinRoomId.trim().toUpperCase(), nickname.trim(), team);
  };

  const handleStartSolo = () => {
    if (!nickname.trim()) return;
    sessionStorage.setItem('cardBattle_team', 'A');
    ws.createSoloRoom(nickname.trim(), teamName.trim() || undefined, settings);
  };

  const handleReady = () => {
    ws.sendReady();
    setIsReady(true);
  };

  if (!assetsReady) return <LoadingScreen onDone={handleAssetsReady} />;

  return (
    <div className="min-h-screen bg-green-50 flex flex-col items-center justify-center p-4">
      <h1 className="text-6xl mb-3">🐑🐰🧜‍♀️🐯</h1>
      <h2 className="text-3xl font-semibold text-green-800 mb-4">한국특허정보원 카드배틀</h2>

      <button
        onClick={() => setShowHowTo(true)}
        className="text-lg text-green-700 bg-green-100 hover:bg-green-200 px-5 py-2 rounded-full mb-6 font-semibold transition"
      >
        📖 게임 방법
      </button>

      {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}

      {!ws.connected && (
        <p className="bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-2 rounded-lg mb-4 text-lg">
          서버에 연결 중...
        </p>
      )}

      {ws.error && (
        <p className="bg-red-100 border border-red-300 text-red-700 px-4 py-2 rounded-lg mb-4 text-lg">
          {ws.error}
        </p>
      )}

      {mode === 'home' && (
        <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-3xl flex flex-col gap-4">
          <button
            onClick={() => setMode('create')}
            disabled={!ws.connected}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold text-xl py-4 rounded-xl transition"
          >
            방 만들기
          </button>
          <button
            onClick={() => setMode('join')}
            disabled={!ws.connected}
            className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 text-white font-semibold text-xl py-4 rounded-xl transition"
          >
            방 참가하기
          </button>
          <button
            onClick={() => setMode('solo')}
            disabled={!ws.connected}
            className="bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-semibold text-xl py-4 rounded-xl transition"
          >
            🤖 싱글 모드 (컴퓨터와 대전)
          </button>
        </div>
      )}

      {mode === 'solo' && (
        <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-3xl flex flex-col gap-5">
          <h3 className="text-2xl font-semibold text-gray-700">싱글 모드</h3>
          <p className="text-base text-gray-400 -mt-3">
            상대는 컴퓨터예요. 컴퓨터는 자기 차례마다 무작위 장소를 클릭합니다.
          </p>

          <Field label="닉네임">
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="닉네임 입력"
              maxLength={12}
              className="input-base"
            />
          </Field>

          <Field label="우리 팀 이름 (선택, 비워두면 무작위 배정)">
            <input
              type="text"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              placeholder="예: 특허"
              maxLength={12}
              className="input-base"
            />
          </Field>

          <GameRulesFields settings={settings} onChange={setSettings} />

          <button
            onClick={handleStartSolo}
            disabled={!ws.connected || !nickname.trim()}
            className="bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-semibold text-xl py-4 rounded-xl transition"
          >
            컴퓨터와 대전 시작
          </button>

          <button onClick={() => setMode('home')} className="text-lg text-gray-400 hover:text-gray-600">
            ← 뒤로
          </button>
        </div>
      )}

      {(mode === 'create' || mode === 'join') && (
        <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-3xl flex flex-col gap-5">
          <h3 className="text-2xl font-semibold text-gray-700">
            {mode === 'create' ? '방 만들기' : '방 참가하기'}
          </h3>

          <Field label="닉네임">
            <input
              type="text"
              value={nickname}
              onChange={e => setNickname(e.target.value)}
              placeholder="닉네임 입력"
              maxLength={12}
              className="input-base"
            />
          </Field>

          {mode === 'join' && (
            <Field label="방 코드">
              <input
                type="text"
                value={joinRoomId}
                onChange={e => setJoinRoomId(e.target.value.toUpperCase())}
                placeholder="예: ABCD"
                maxLength={4}
                className="input-base font-mono tracking-widest"
              />
            </Field>
          )}

          <Field label="팀 선택">
            <div className="flex gap-2">
              {(['A', 'B'] as Team[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTeam(t)}
                  className={`flex-1 py-3 rounded-lg font-semibold transition text-lg ${
                    team === t ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {t === 'A' ? '🟢 팀 1' : '🔵 팀 2'}
                </button>
              ))}
            </div>
          </Field>

          {mode === 'create' && (
            <>
              <Field label="우리 팀 이름 (선택, 비워두면 무작위 배정)">
                <input
                  type="text"
                  value={teamName}
                  onChange={e => setTeamName(e.target.value)}
                  placeholder="예: 상표"
                  maxLength={12}
                  className="input-base"
                />
              </Field>
              <GameRulesFields settings={settings} onChange={setSettings} />
            </>
          )}

          <button
            onClick={mode === 'create' ? handleCreateRoom : handleJoinRoom}
            disabled={!ws.connected || !nickname.trim() || (mode === 'join' && !joinRoomId.trim())}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold text-xl py-4 rounded-xl transition"
          >
            {mode === 'create' ? '방 만들기' : '입장하기'}
          </button>

          <button onClick={() => setMode('home')} className="text-lg text-gray-400 hover:text-gray-600">
            ← 뒤로
          </button>
        </div>
      )}

      {mode === 'waiting' && ws.roomId && (
        <WaitingRoom
          roomId={ws.roomId}
          players={ws.lobbyPlayers}
          teamNames={ws.lobbyTeamNames}
          settings={ws.lobbySettings}
          isReady={isReady}
          onReady={handleReady}
        />
      )}

      <style>{`
        .input-base {
          width: 100%;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          padding: 0.6rem 0.85rem;
          font-size: calc(1.125rem * var(--font-scale));
          color: #1f2937;
          outline: none;
        }
        .input-base:focus { box-shadow: 0 0 0 2px #4ade80; border-color: transparent; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-lg text-gray-500 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const FIRST_TEAM_OPTIONS: { value: GameSettings['firstTeam']; label: string }[] = [
  { value: 'A', label: '🟢 팀 1 먼저' },
  { value: 'B', label: '🔵 팀 2 먼저' },
  { value: 'random', label: '🎲 무작위' },
];

const RULE_FIELDS: {
  key: keyof Omit<GameSettings, 'firstTeam'>;
  label: string;
  suffix: string;
  hint?: string;
}[] = [
  { key: 'targetScore', label: '목표 점수', suffix: '점' },
  { key: 'festivalTurn', label: '도토리 축제 시작 턴', suffix: '턴' },
  { key: 'festivalDrawCount', label: '도토리 뽑기 횟수', suffix: '회' },
  { key: 'festivalDrawIncreaseInterval', label: '뽑기 증가 주기', suffix: '턴', hint: '999 = 재발동 없음' },
  { key: 'drawTimeSec', label: '동물 뽑기 제한시간', suffix: '초' },
  { key: 'actionTimeSec', label: '행동 선택 제한시간', suffix: '초' },
  { key: 'noActionTimeSec', label: '행동할 게 없을 때 제한시간', suffix: '초' },
];

// 방장(방을 만드는 쪽)만 보는 게임 규칙 입력 — 값을 비워두면 기본값 그대로 방을 만든다.
function GameRulesFields({
  settings,
  onChange,
}: {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-gray-200 rounded-lg">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-lg font-semibold text-gray-600"
      >
        <span>⚙️ 게임 규칙 (방장이 정해요)</span>
        <span className="text-gray-400">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-3 border-t border-gray-100 pt-3">
          <div className="flex flex-col gap-1">
            <label className="text-lg text-gray-500">선 플레이어(먼저 시작하는 팀)</label>
            <div className="flex gap-1">
              {FIRST_TEAM_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange({ ...settings, firstTeam: value })}
                  className={`flex-1 py-2 rounded-lg font-semibold transition text-base ${
                    settings.firstTeam === value
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-3">
          {RULE_FIELDS.map(({ key, label, suffix, hint }) => {
            const { min, max } = SETTINGS_LIMITS[key];
            return (
              <div key={key} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2 text-lg">
                  <label className="text-gray-500 whitespace-nowrap">{label}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={min}
                      max={max}
                      value={settings[key]}
                      onChange={e => {
                        const v = Number(e.target.value);
                        onChange({ ...settings, [key]: Number.isFinite(v) ? v : DEFAULT_SETTINGS[key] });
                      }}
                      onBlur={e => {
                        const v = Math.min(max, Math.max(min, Math.round(Number(e.target.value) || DEFAULT_SETTINGS[key])));
                        onChange({ ...settings, [key]: v });
                      }}
                      className="input-base w-24 shrink-0 text-right"
                    />
                    <span className="text-gray-400 w-6 shrink-0">{suffix}</span>
                  </div>
                </div>
                {hint && <p className="text-sm text-gray-400 text-right">{hint}</p>}
              </div>
            );
          })}
          </div>
        </div>
      )}
    </div>
  );
}

function WaitingRoom({
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
    <div className="bg-white rounded-2xl shadow-lg p-10 w-full max-w-4xl flex flex-col gap-6">
      <div className="text-center">
        <p className="text-lg text-gray-400">방 코드</p>
        <p className="text-6xl font-mono font-bold text-green-700 tracking-widest">{roomId}</p>
        <p className="text-base text-gray-400 mt-1.5">친구에게 이 코드를 알려주세요</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <TeamColumn label={`🟢 ${teamNames.A ?? '팀 1 (미정)'}`} players={teamA} />
        <TeamColumn label={`🔵 ${teamNames.B ?? '팀 2 (미정)'}`} players={teamB} />
      </div>

      <div className="bg-gray-50 rounded-xl p-4 text-base text-gray-500 flex flex-wrap gap-x-6 gap-y-1.5 justify-center">
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
        <p className="text-center text-xl text-green-600 font-semibold animate-pulse">게임 시작 중...</p>
      ) : (
        <button
          onClick={onReady}
          disabled={isReady}
          className="bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white font-semibold text-xl py-4 rounded-xl transition"
        >
          {isReady ? '준비 완료 ✓' : '준비'}
        </button>
      )}
    </div>
  );
}

function TeamColumn({ label, players }: { label: string; players: LobbyPlayer[] }) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 min-h-[100px]">
      <p className="font-semibold text-gray-700 text-lg mb-2">{label}</p>
      {players.length === 0 ? (
        <p className="text-base text-gray-400">없음</p>
      ) : (
        players.map(p => (
          <div key={p.nickname} className="flex items-center gap-2 text-lg py-1">
            <span className={`w-2 h-2 rounded-full shrink-0 ${p.ready ? 'bg-green-500' : 'bg-gray-300'}`} />
            <span className="text-gray-700 truncate">{p.nickname}</span>
          </div>
        ))
      )}
    </div>
  );
}
