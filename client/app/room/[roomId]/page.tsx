'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Animal, Place, Team } from 'shared';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAnimationQueue } from '@/hooks/useAnimationQueue';
import { GameLayout } from '@/components/game/GameLayout';
import { GameEndScreen } from '@/components/game/GameEndScreen';
import { PauseMenu } from '@/components/game/PauseMenu';
import { playBgm } from '@/lib/bgm';
import { startPreload } from '@/lib/preload';

const STORAGE_TEAM = 'cardBattle_team';
const GAME_BGM_VOLUME = 0.5; // 게임 효과음이 함께 들려야 하므로 BGM은 절반 볼륨으로

export default function GamePage() {
  const router = useRouter();
  const {
    gameState, turnDeadline, lastEvents, drawCard, chooseSkill, passSkill, demoContinue, demoScene,
    error, connected, playerId,
    pauseRequest, pauseWaitingUntil, pauseUntil, pauseNotice, clearPauseNotice,
    requestPause, respondPause, resumeGame, surrender, leaveGame,
  } = useWebSocket();
  const [myTeam, setMyTeam] = useState<Team | null>(null);

  const animState = useAnimationQueue(lastEvents, gameState);

  // 보통은 로비에서 이미 끝나 있지만, 새로고침·재접속으로 이 페이지에 바로
  // 들어온 경우를 대비해 여기서도 프리로드를 시작한다(이미 시작했으면 무시됨).
  useEffect(() => {
    startPreload();
  }, []);

  // 대기실에서 앉았던 자리. 관전석('spectator')이면 어느 팀도 내 팀이 아니므로 myTeam은
  // null로 남고, 그 null이 곧 게임 화면 전체의 "관전 시점" 스위치가 된다(GameLayout 참고).
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_TEAM) as Team | null;
    if (saved === 'A' || saved === 'B') setMyTeam(saved);
  }, []);

  // 게임 진행 상황에 따른 BGM 전환: 진행 중(game1) → 축제(game2) → 종료(opening)
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === 'ended') {
      playBgm('/sounds/bgm_opening.mp3', 0.6);
    } else if (gameState.festival) {
      playBgm('/sounds/bgm_game2.mp3', GAME_BGM_VOLUME);
    } else {
      playBgm('/sounds/bgm_game1.mp3', GAME_BGM_VOLUME);
    }
  }, [gameState?.phase, gameState?.festival]);

  const handlePlaceClick = useCallback(
    (place: Place) => {
      drawCard(place);
    },
    [drawCard],
  );

  const handleChooseSkill = useCallback(
    (animal: Animal) => {
      chooseSkill(animal);
    },
    [chooseSkill],
  );

  const handlePassSkill = useCallback(() => {
    passSkill();
  }, [passSkill]);

  // 시연 모드의 [계속 ▶] — 멈춰 선 정산·턴 넘김·상대의 수를 한 걸음씩 진행시킨다.
  // 4장의 결과 화면에 뜨는 [다른 결말 보기]도 같은 메시지를 쓴다(서버 Room 주석 참고).
  const handleDemoContinue = useCallback(() => {
    demoContinue();
  }, [demoContinue]);

  // 시연 4장 — 볼 결말을 골랐다
  const handleDemoScene = useCallback(
    (key: string) => {
      demoScene(key);
    },
    [demoScene],
  );

  /**
   * 방을 버리고 로비로 — 나가기 버튼과 결과 화면의 "로비로 돌아가기"가 함께 쓴다.
   *
   * 화면만 옮기고 끝내면 안 된다. 서버에는 이 사람이 아직 그 방의 일원으로 남아 있고,
   * 저장된 세션도 그대로라 로비에 도착하자마자 그 방으로 자동 재접속해버린다 —
   * 그 상태로 방을 새로 만들면 옛 게임 상태와 새 방 코드가 섞여 "방 XXXX를 찾을 수
   * 없습니다"가 된다. leaveGame이 방에서 빠지는 일과 세션을 지우는 일을 함께 한다
   * (진행 중이던 게임이면 상대 팀 승리로 끝난다).
   */
  const handleLeave = useCallback(() => {
    leaveGame();
    router.push('/');
  }, [leaveGame, router]);

  if (!gameState) {
    return (
      <div className="min-h-screen bg-jungle-50 flex flex-col items-center justify-center gap-3">
        <p className="text-jungle-700">
          {connected ? '게임 상태 로딩 중...' : '서버에 연결 중...'}
        </p>
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          onClick={() => router.push('/')}
          className="text-sm text-jungle-400 underline mt-4 hover:text-jungle-600"
        >
          로비로 돌아가기
        </button>
      </div>
    );
  }

  // 체력이 즉시 10/0에 닿아 게임이 끝난 경우, 그 결정타 연출(체력 구슬 반응 +
  // "결정타!" 강조)이 끝까지 재생된 뒤에야 종료 화면으로 넘어간다 — 승리를 만든
  // 그 행동의 손맛을 화면 전환이 잘라먹지 않도록.
  if (gameState.phase === 'ended' && !animState.isSettling) {
    return (
      <GameEndScreen
        gameState={gameState}
        myTeam={myTeam}
        onBack={handleLeave}
        // 시연 4장에서만 쓰인다 — 서버가 demo.replay로 "되돌아갈 곳이 있다"고
        // 알려줄 때만 버튼이 뜬다(GameEndScreen 주석 참고).
        onReplay={handleDemoContinue}
      />
    );
  }

  return (
    <>
      <GameLayout
        gameState={gameState}
        turnDeadline={turnDeadline}
        myTeam={myTeam}
        playerId={playerId}
        onPlaceClick={handlePlaceClick}
        onChooseSkill={handleChooseSkill}
        onPassSkill={handlePassSkill}
        onDemoContinue={handleDemoContinue}
        onDemoScene={handleDemoScene}
        error={error}
        animState={animState}
        paused={gameState.paused}
      />
      {/* 게임 중 메뉴(⏸) — 판 바깥에 둔다. GameLayout 안에 넣으면 결정타 연출의
          화면 흔들기(transform)가 쌓임 맥락을 만들어 이 창까지 함께 흔들린다. */}
      <PauseMenu
        paused={gameState.paused}
        pausedBy={gameState.pausedBy}
        pausePending={gameState.pausePendingAnswer}
        // 관전자(myTeam === null)는 애초에 멈출 수 없어 이 숫자를 쓰지 않는다.
        pauseLeft={myTeam ? Math.max(0, gameState.settings.pauseMaxCount - gameState.pauseUsed[myTeam]) : 0}
        pauseUnlimited={gameState.pauseUnlimited}
        pauseUntil={pauseUntil}
        myTeam={myTeam}
        pauseRequest={pauseRequest}
        pauseWaitingUntil={pauseWaitingUntil}
        pauseNotice={pauseNotice}
        onClearNotice={clearPauseNotice}
        onRequestPause={requestPause}
        onResume={resumeGame}
        onRespond={respondPause}
        onSurrender={surrender}
        onLeave={handleLeave}
      />
    </>
  );
}
