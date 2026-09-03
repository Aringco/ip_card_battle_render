'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { GameSettings, Team } from 'shared';
import { DEFAULT_SETTINGS } from 'shared';
import { useWebSocket } from '@/hooks/useWebSocket';
import { playBgm } from '@/lib/bgm';
import { HowToPlayModal } from '@/components/ui/HowToPlayModal';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { GameRulesFields } from '@/components/lobby/GameRulesFields';
import { WaitingRoom } from '@/components/lobby/WaitingRoom';

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
  // 방을 만드는 쪽만 입력할 수 있다 — 아직 아무도 들어오지 않은 반대편 팀의 이름까지
  // 미리 정해둔다(비워두면 기존처럼 실제 참가자가 자기 팀 이름을 직접 고른다).
  const [otherTeamName, setOtherTeamName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  // 초대 링크로 들어왔는지 — 참가 화면에 "방 코드는 이미 채워뒀다"는 안내를 띄우는 용도
  const [arrivedByInvite, setArrivedByInvite] = useState(false);
  const [mode, setMode] = useState<'home' | 'create' | 'join' | 'solo' | 'waiting'>('home');
  const [showHowTo, setShowHowTo] = useState(false);
  // 방장(방을 만드는 쪽)만 정하는 게임 규칙 — 방 생성/싱글 모드 시작 화면에서 함께 입력받는다.
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  // 초대 링크(`/?room=ABCD`)로 들어온 경우 — 참가 화면을 열고 방 코드를 미리 채운다.
  // useSearchParams 대신 window.location을 읽는 이유: 이 페이지는 전부 클라이언트
  // 컴포넌트라 Suspense 경계를 추가로 두지 않아도 되고, 값이 필요한 시점도 마운트
  // 직후 한 번뿐이다.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('room');
    if (!code) return;
    setJoinRoomId(code.trim().toUpperCase().slice(0, 4));
    setArrivedByInvite(true);
    setMode(m => (m === 'home' ? 'join' : m));
    // 주소창에서 쿼리를 지워, 나중에 새로고침하거나 방을 나갔을 때 다시 끌려가지 않게 한다.
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  // 방 입장/이탈 감지 — 추방당하거나 스스로 나가면 roomId가 비워지므로 홈으로 돌아간다.
  useEffect(() => {
    if (ws.roomId) {
      setMode('waiting');
    } else {
      setMode(m => (m === 'waiting' ? 'home' : m));
    }
  }, [ws.roomId]);

  // 게임 시작 감지 → 게임 화면으로 이동
  useEffect(() => {
    if (ws.gameState && ws.roomId) {
      router.push(`/room/${ws.roomId}`);
    }
  }, [ws.gameState, ws.roomId, router]);

  // 게임 화면은 내 팀을 sessionStorage에서 읽어온다(`cardBattle_team`). 방장이 나를 다른
  // 팀으로 옮겼거나 내가 대기실에서 팀을 바꿨다면 그 값도 함께 따라가야, 게임에 들어갔을 때
  // 엉뚱한 팀 시점으로 보이지 않는다.
  useEffect(() => {
    const meInLobby = ws.lobbyPlayers.find(p => p.memberId === ws.memberId);
    if (meInLobby) sessionStorage.setItem('cardBattle_team', meInLobby.team);
  }, [ws.lobbyPlayers, ws.memberId]);

  const handleCreateRoom = () => {
    if (!nickname.trim()) return;
    sessionStorage.setItem('cardBattle_team', team);
    ws.createRoom(nickname.trim(), team, teamName.trim() || undefined, settings, otherTeamName.trim() || undefined);
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

  // 준비 상태는 서버가 로비 목록(LobbyPlayer.ready)으로 알려주므로 화면이 따로
  // 기억하지 않는다 — 방장이 나를 다른 팀으로 옮기거나 방장 자리를 넘겨줘도 표시가 어긋나지 않는다.
  const handleReady = (ready: boolean) => ws.sendReady(ready);

  if (!assetsReady) return <LoadingScreen onDone={handleAssetsReady} />;

  return (
    <div className="min-h-screen bg-green-50 flex flex-col items-center p-4">
      {/* 로비 콘텐츠는 그대로 세로 중앙 정렬하되, 그 아래에 항상 화면 맨 밑까지 붙는
          푸터 안내를 별도로 둔다 — 바깥 div를 justify-center로 두면 이 푸터까지
          그 중앙 정렬 묶음에 끼어버려 화면 아래쪽에 붙지 않는다. */}
      <div className="flex-1 flex flex-col items-center justify-center w-full">
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

      {ws.roomNotice && (
        <div className="bg-orange-50 border border-orange-200 text-orange-700 px-4 py-2 rounded-lg mb-4 text-lg flex items-center gap-3">
          <span>{ws.roomNotice}</span>
          <button onClick={ws.clearRoomNotice} className="text-orange-400 hover:text-orange-600 font-bold">
            ✕
          </button>
        </div>
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

          {mode === 'join' && arrivedByInvite && (
            <p className="bg-green-50 border border-green-200 text-green-700 px-4 py-2 rounded-lg text-base -mt-2">
              초대 링크로 들어왔어요. 방 코드는 이미 채워뒀으니 닉네임과 팀만 정하면 됩니다.
            </p>
          )}

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
              <Field label="상대 팀 이름 (선택, 비워두면 무작위 배정)">
                <input
                  type="text"
                  value={otherTeamName}
                  onChange={e => setOtherTeamName(e.target.value)}
                  placeholder="예: 디자인"
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
          myMemberId={ws.memberId}
          hostMemberId={ws.hostMemberId}
          isHost={ws.isHost}
          onReady={handleReady}
          onStart={ws.startGame}
          onLeave={ws.leaveRoom}
          onMove={ws.movePlayer}
          onKick={ws.kickPlayer}
          onTransferHost={ws.transferHost}
          onRenameTeam={ws.setTeamName}
          onUpdateSettings={ws.updateSettings}
        />
      )}
      </div>

      <p className="text-sm text-gray-400 text-center py-4">
        게임 중 글씨 크기/소리를 조절하려면 오른쪽 하단(⚙️)을 확인해 주세요.
      </p>

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
        .input-rule { width: 6rem; flex: none; text-align: right; }
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
