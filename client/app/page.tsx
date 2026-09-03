'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { GameSettings, Team } from 'shared';
import { DEFAULT_SETTINGS } from 'shared';
import { useWebSocket } from '@/hooks/useWebSocket';
import { playBgm } from '@/lib/bgm';
import { HowToPlayModal } from '@/components/ui/HowToPlayModal';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { LOBBY_ASSETS, TABLE_IS_STANDIN } from '@/lib/lobbyAssets';
import { LobbyHero } from '@/components/lobby/LobbyHero';
import { LobbyStage, BACK_OF, type Stage } from '@/components/lobby/LobbyStage';
import { BackButton } from '@/components/lobby/BackButton';
import { WaitingRoom } from '@/components/lobby/WaitingRoom';

/**
 * 로비 화면.
 *
 *   home ──멀티──▶ multi ──방 만들기──▶ create ──▶ waiting ──▶ /room/[id]
 *    │               │                             ▲
 *    │               └──방 참가하기──▶ join ────────┘
 *    └───싱글────▶ solo ──────────────────────────────▶ /room/[id]
 *
 * 스테이지 전환 연출은 전부 LobbyStage의 CSS가 맡는다. 여기서는 어느 단계인지와
 * 서버로 보낼 값만 관리한다. waiting은 스테이지 밖의 별도 화면이다.
 */
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
  const [stage, setStage] = useState<Stage>('home');
  const [inWaitingRoom, setInWaitingRoom] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  // 방장(방을 만드는 쪽)만 정하는 게임 규칙 — 방 생성/싱글 모드 시작 화면에서 함께 입력받는다.
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);

  // 방 입장 감지 (재접속으로 바로 들어오는 경우 포함)
  useEffect(() => {
    if (ws.roomId) setInWaitingRoom(true);
  }, [ws.roomId]);

  // 게임 시작 감지 → 게임 화면으로 이동
  useEffect(() => {
    if (ws.gameState && ws.roomId) {
      router.push(`/room/${ws.roomId}`);
    }
  }, [ws.gameState, ws.roomId, router]);

  /** 뒤로가기 — 한 단계씩(create/join → multi → home). */
  const goBack = useCallback(() => {
    setStage(s => (s === 'home' ? s : BACK_OF[s]));
  }, []);

  useEffect(() => {
    if (stage === 'home' || inWaitingRoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showHowTo) goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, inWaitingRoom, showHowTo, goBack]);

  const handleCreateRoom = () => {
    if (!nickname.trim()) return;
    sessionStorage.setItem('cardBattle_team', team);
    ws.createRoom(
      nickname.trim(),
      team,
      teamName.trim() || undefined,
      settings,
      otherTeamName.trim() || undefined,
    );
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

  const blocked = !ws.connected;
  const waitingRoomId = inWaitingRoom ? ws.roomId : null;

  return (
    <div className="lobby-root">
      {/* 카드테이블 일러스트 — cover와 같은 기하로 배치되어, 안쪽 퍼센트 좌표가 곧 이미지 좌표가 된다 */}
      <div
        className="lobby-table"
        style={{ ['--lobby-table-bg' as string]: `url(${LOBBY_ASSETS.table})` }}
      >
        {/* 캐릭터·카드더미를 피한 테이블 중앙 — 콘텐츠는 전부 이 안에만 놓인다 */}
        <div className="lobby-safe" data-stage={waitingRoomId ? 'waiting' : stage}>
          <div className="lobby-hero-slot">
            <LobbyHero onHowTo={() => setShowHowTo(true)} />
          </div>

          {/* 연결/에러 배너 — 어느 단계에서든 로고 바로 아래 같은 자리에 뜬다 */}
          {blocked && (
            <p className="shrink-0 bg-yellow-100/95 border border-yellow-300 text-yellow-800 px-4 py-1.5 rounded-lg text-xs text-center">
              서버에 연결 중...
            </p>
          )}
          {ws.error && (
            <p className="shrink-0 bg-red-100/95 border border-red-300 text-red-700 px-4 py-1.5 rounded-lg text-xs text-center">
              {ws.error}
            </p>
          )}

          {waitingRoomId ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <WaitingRoom
                roomId={waitingRoomId}
                players={ws.lobbyPlayers}
                teamNames={ws.lobbyTeamNames}
                settings={ws.lobbySettings}
                isReady={isReady}
                onReady={handleReady}
              />
            </div>
          ) : (
            <>
              <LobbyStage
                stage={stage}
                blocked={blocked}
                onGo={setStage}
                nickname={nickname}
                onNickname={setNickname}
                team={team}
                onTeam={setTeam}
                teamName={teamName}
                onTeamName={setTeamName}
                otherTeamName={otherTeamName}
                onOtherTeamName={setOtherTeamName}
                roomCode={joinRoomId}
                onRoomCode={setJoinRoomId}
                settings={settings}
                onSettings={setSettings}
                onStartSolo={handleStartSolo}
                onCreateRoom={handleCreateRoom}
                onJoinRoom={handleJoinRoom}
              />
              <BackButton hidden={stage === 'home'} onClick={goBack} />
            </>
          )}
        </div>
      </div>

      {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}

      {/* 설정 안내 — 배경이 어두운 펠트라 흰 글씨로 띄운다 */}
      <p className="fixed bottom-2 left-1/2 -translate-x-1/2 text-xs text-white/70 text-center
                    drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] pointer-events-none select-none">
        게임 중 글씨 크기/소리를 조절하려면 오른쪽 하단(⚙️)을 확인해 주세요.
      </p>

      {TABLE_IS_STANDIN && (
        <p
          className="fixed bottom-2 left-2 text-[0.6rem] font-mono text-white/45 select-none pointer-events-none"
          title="배경은 임시 스탠드인입니다 — client/public/lobby/README.md 참조"
        >
          BG STANDIN
        </p>
      )}
    </div>
  );
}
