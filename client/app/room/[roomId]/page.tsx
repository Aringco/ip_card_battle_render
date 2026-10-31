'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Animal, Place, SideId } from 'shared';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAnimationQueue } from '@/hooks/useAnimationQueue';
import { GameLayout } from '@/components/game/GameLayout';
import { IndividualLayout } from '@/components/game/IndividualLayout';
import { GameEndScreen } from '@/components/game/GameEndScreen';
import { IndividualEndScreen } from '@/components/game/IndividualEndScreen';
import { PauseMenu } from '@/components/game/PauseMenu';
import { RotateHint } from '@/components/game/RotateHint';
import { playBgm } from '@/lib/bgm';
import { isFinished, mySideOf } from '@/lib/individual';
import { duelMapOf, duelViewEvents, duelViewState } from '@/lib/duel';
import { startPreload } from '@/lib/preload';
import { markEventReturn } from '@/lib/eventSession';
import { useBefore } from '@/lib/useBefore';
import { ScoreRaceIntro } from '@/components/game/ScoreRaceIntro';
import { MobileLayout } from '@/components/game/mobile/MobileLayout';
import { MobileIndividualLayout } from '@/components/game/mobile/MobileIndividualLayout';
import { useMobileLayout } from '@/lib/mobileLayout';

const STORAGE_TEAM = 'cardBattle_team';
const GAME_BGM_VOLUME = 0.5; // 게임 효과음이 함께 들려야 하므로 BGM은 절반 볼륨으로

export default function GamePage() {
  const router = useRouter();
  const {
    gameState, turnDeadline, lastEvents, drawCard, chooseSkill, passSkill, demoContinue, demoScene,
    error, connected, playerId,
    pauseRequest, pauseWaitingUntil, resumeVoteUntil, pauseUntil, pauseNotice, clearPauseNotice,
    requestPause, respondPause, resumeGame, surrender, leaveGame, eventIntroUntil,
    emotes, sendEmote,
  } = useWebSocket();
  const [myTeam, setMyTeam] = useState<SideId | null>(null);
  // 개인전에서 [나가기]로 판을 나온 사람의 편 — 그 뒤로는 서버가 이 화면에 아무것도 보내지 않으므로(방에서 빠졌다)
  // 나간 순간의 상태로 점수판을 보여 준다. 나가면 playerId도 지워지므로 내 편은 여기 따로 붙들어 둔다.
  const [leftSide, setLeftSide] = useState<SideId | null>(null);

  // 개인전 1:1(두 명)은 일반(팀전) 화면으로 그린다 — 편 id만 'A'(나)·'B'(상대)로 바꿔 화면·연출에 넘긴다(lib/duel.ts).
  // ⚠️ 이벤트는 **lastEvents가 바뀔 때만** 다시 만든다 — 상태만 바뀐 갱신(일시정지 등)에 새 배열을 만들면 연출 큐가
  //    그것을 새 액션으로 읽어 지난 연출을 다시 재생한다.
  const duel = gameState ? duelMapOf(gameState, playerId) : null;
  const duelKey = duel ? `${duel.left}|${duel.right}` : '';
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const viewState = useMemo(() => (gameState && duel ? duelViewState(gameState, duel) : gameState), [gameState, duelKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const viewEvents = useMemo(() => (duel ? duelViewEvents(lastEvents, duel) : lastEvents), [lastEvents, duelKey]);
  const animState = useAnimationQueue(viewEvents, viewState);
  // 목표점수 달성하기의 시작 룰렛이 도는 중인가 — 그동안 판은 서버에서 멈춰 있다(ScoreRaceIntro 주석).
  const introActive = useBefore(eventIntroUntil);
  // 가로로 눕힌 폰 — 혼자 놀기(아래 soloMobile)만 모바일 배치로 그린다(시범)
  const mobileScreen = useMobileLayout();

  // 보통은 로비에서 이미 끝나 있지만, 새로고침·재접속으로 이 페이지에 바로
  // 들어온 경우를 대비해 여기서도 프리로드를 시작한다(이미 시작했으면 무시됨).
  useEffect(() => {
    startPreload();
  }, []);

  // 대기실에서 앉았던 자리. 관전석('spectator')이면 어느 팀도 내 팀이 아니므로 myTeam은
  // null로 남고, 그 null이 곧 게임 화면 전체의 "관전 시점" 스위치가 된다(GameLayout 참고).
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_TEAM) as SideId | null;
    if (saved === 'A' || saved === 'B') setMyTeam(saved);
  }, []);

  // 게임 진행 상황에 따른 BGM 전환: 진행 중(game1) → 축제(game2) → 종료(opening)
  // 종료 음악은 판을 끝낸 수의 연출(체력이 0·승리선에 닿고 "결정타!"·"n위 확정!")이 다 재생된 뒤에 바꾼다 — 서버의 phase는
  // 그 갱신이 도착하는 즉시 'ended'라, 그대로 따르면 결과가 연출보다 먼저 음악으로 새어 나왔다(2026-10-31 "승/패 선반영").
  // 결과 화면이 뜨는 조건(아래 phase === 'ended' && !isSettling)과 같다.
  const endedShown = gameState?.phase === 'ended' && !animState.isSettling;
  useEffect(() => {
    if (!gameState) return;
    if (endedShown) {
      playBgm('/sounds/bgm_opening.mp3', 0.6);
    } else if (gameState.festival) {
      playBgm('/sounds/bgm_game2.mp3', GAME_BGM_VOLUME);
    } else {
      playBgm('/sounds/bgm_game1.mp3', GAME_BGM_VOLUME);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endedShown, gameState?.festival]);

  const handlePlaceClick = useCallback(
    (place: Place) => {
      drawCard(place);
    },
    [drawCard],
  );

  const handleChooseSkill = useCallback(
    // target은 개인전의 특허랑이가 노릴 상대(편 id) — 팀전·다른 기술은 비워 보낸다.
    (animal: Animal, target?: SideId) => {
      chooseSkill(animal, target);
    },
    [chooseSkill],
  );

  // 개인전 1:1 — 팀전 화면은 특허랑이의 대상을 고르지 않는다(상대가 하나다). 서버(개인전)는 대상이 필요하므로 상대 편을 실어 보낸다
  // (대상이 필요 없는 기술이면 서버가 무시한다).
  const duelOpponent = duel?.right ?? null;
  const handleDuelChooseSkill = useCallback(
    (animal: Animal) => {
      chooseSkill(animal, duelOpponent ?? undefined);
    },
    [chooseSkill, duelOpponent],
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

  // 게임 중 메뉴의 [나가기] — 개인전에서 판에 앉아 있던 사람은 로비가 아니라 **점수판**으로 간다(2026-10-30 요청).
  // 남은 사람들에게는 하위 순위로 확정되고(서버 forfeitIndividual), 나는 그 결과까지 실린 마지막 상태로 순위표를 본다.
  const handleMenuLeave = useCallback(() => {
    const side = gameState && gameState.mode === 'individual' && gameState.phase === 'playing' ? mySideOf(gameState, playerId) : null;
    if (side === null) {
      handleLeave();
      return;
    }
    leaveGame();
    setLeftSide(side);
  }, [gameState, playerId, leaveGame, handleLeave]);

  // 이벤트 — 도전자는 이벤트 폼으로(로비가 그 폼을 연 채로 시작), 개발자는 로비로 돌아가 저절로 다시 대기한다
  // (개발자 세션은 eventSession에 남아 있으므로 로비가 마운트되자마자 대기를 다시 알린다 — 상시 대기).
  const handleEventBack = useCallback(() => {
    markEventReturn();
    handleLeave();
  }, [handleLeave]);

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

  // 개인전 — 내 편은 대기실에서 저장한 자리가 아니라 **서버가 알려준 편→사람 대응**(memberIds)에서 찾는다.
  // 개인전의 편 id는 시작할 때 'p1'…로 붙으므로 저장해 둔 값(A/B)으로는 알 수 없다. null은 처음부터 관전자.
  const individual = gameState.mode === 'individual';
  const mySide = individual ? mySideOf(gameState, playerId) : null;
  // 순위가 정해진 사람은 판에서 빠진 관전자와 같다 — 일시정지 메뉴에서는 [나가기]만 쓴다.
  const canActInGame = individual ? mySide !== null && !isFinished(gameState, mySide) : myTeam !== null;
  // 개인전 1:1을 팀전 화면으로 그릴 때의 내 편 — 나는 언제나 왼쪽('A'), 관전자는 null
  const duelMyTeam: SideId | null = duel && mySide !== null ? 'A' : null;

  // 개인전에서 나간 사람 — 판이 아직 이어지고 있어도 나간 순간까지의 순위표를 본다. 로비로는 이 화면의 버튼으로 간다
  // (방에서는 이미 빠졌으니 다시 나가기를 보낼 필요가 없다).
  if (leftSide !== null) {
    return (
      <IndividualEndScreen
        gameState={gameState}
        mySide={leftSide}
        inProgress={gameState.phase === 'playing'}
        onBack={() => router.push('/')}
      />
    );
  }

  // 체력이 즉시 10/0에 닿아 게임이 끝난 경우, 그 결정타 연출(체력 구슬 반응 +
  // "결정타!" 강조)이 끝까지 재생된 뒤에야 종료 화면으로 넘어간다 — 승리를 만든
  // 그 행동의 손맛을 화면 전환이 잘라먹지 않도록.
  if (gameState.phase === 'ended' && !animState.isSettling) {
    if (duel && viewState) {
      return <GameEndScreen gameState={viewState} myTeam={duelMyTeam} onBack={handleLeave} />;
    }
    if (individual) {
      return <IndividualEndScreen gameState={gameState} mySide={mySide} onBack={handleLeave} />;
    }
    return (
      <GameEndScreen
        gameState={gameState}
        myTeam={myTeam}
        onBack={handleLeave}
        // 시연 4장에서만 쓰인다 — 서버가 demo.replay로 "되돌아갈 곳이 있다"고
        // 알려줄 때만 버튼이 뜬다(GameEndScreen 주석 참고).
        onReplay={handleDemoContinue}
        // 이벤트 판이면 도전자(A)는 [이벤트로 돌아가기], 개발자(B)는 [다음 도전자 받기](10초 뒤 저절로)
        onEventBack={gameState.event && myTeam === 'A' ? handleEventBack : undefined}
        onNextChallenger={gameState.event?.kind === 'beatDev' && myTeam === 'B' ? handleLeave : undefined}
      />
    );
  }

  // 모바일 배치(시범) — 혼자 놀기(컴퓨터 상대 팀전 · 일반/강화)에만. 서버가 "일시정지 무제한"으로 알려 주는 판이 곧 혼자 놀기다
  // (이벤트의 컴퓨터 대전은 제외된다 — room.ts의 pause.unlimited). 시연은 대본 자막 · 장면 고르기가 PC 화면에만 있어 뺀다.
  const soloMobile = mobileScreen && !individual && !duel && gameState.pauseUnlimited && !gameState.demo && !gameState.event;
  // 개인전도 모바일 배치(2026-10-31) — 1:1은 팀전 화면으로 그리므로(lib/duel.ts) 팀전 모바일 배치를, 3명 이상은 개인전 모바일 배치를 쓴다.
  const duelMobile = mobileScreen && !!duel && !!viewState;
  const individualMobile = mobileScreen && individual && !duel;

  return (
    <>
      {duelMobile && viewState ? (
        <MobileLayout
          gameState={viewState}
          turnDeadline={turnDeadline}
          myTeam={duelMyTeam}
          playerId={playerId}
          onPlaceClick={handlePlaceClick}
          onChooseSkill={handleDuelChooseSkill}
          onPassSkill={handlePassSkill}
          error={error}
          animState={animState}
          paused={gameState.paused}
        />
      ) : individualMobile ? (
        <MobileIndividualLayout
          gameState={gameState}
          turnDeadline={turnDeadline}
          mySide={mySide}
          playerId={playerId}
          onPlaceClick={handlePlaceClick}
          onChooseSkill={handleChooseSkill}
          onPassSkill={handlePassSkill}
          error={error}
          animState={animState}
          paused={gameState.paused}
          emotes={emotes}
        />
      ) : soloMobile ? (
        <MobileLayout
          gameState={gameState}
          turnDeadline={turnDeadline}
          myTeam={myTeam}
          playerId={playerId}
          onPlaceClick={handlePlaceClick}
          onChooseSkill={handleChooseSkill}
          onPassSkill={handlePassSkill}
          error={error}
          animState={animState}
          paused={gameState.paused}
        />
      ) : duel && viewState ? (
        <GameLayout
          gameState={viewState}
          turnDeadline={turnDeadline}
          myTeam={duelMyTeam}
          playerId={playerId}
          onPlaceClick={handlePlaceClick}
          onChooseSkill={handleDuelChooseSkill}
          onPassSkill={handlePassSkill}
          onDemoContinue={handleDemoContinue}
          onDemoScene={handleDemoScene}
          error={error}
          animState={animState}
          paused={gameState.paused}
        />
      ) : individual ? (
        <IndividualLayout
          gameState={gameState}
          turnDeadline={turnDeadline}
          mySide={mySide}
          playerId={playerId}
          onPlaceClick={handlePlaceClick}
          onChooseSkill={handleChooseSkill}
          onPassSkill={handlePassSkill}
          error={error}
          animState={animState}
          paused={gameState.paused}
          emotes={emotes}
          onEmote={sendEmote}
        />
      ) : (
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
        eventIntro={introActive}
      />
      )}
      {/* 게임 중 메뉴(⏸) — 판 바깥에 둔다. GameLayout 안에 넣으면 결정타 연출의
          화면 흔들기(transform)가 쌓임 맥락을 만들어 이 창까지 함께 흔들린다. */}
      <PauseMenu
        paused={gameState.paused}
        pausedBy={gameState.pausedBy}
        pausePending={gameState.pausePendingAnswer}
        resumeVote={gameState.resumeVote ?? null}
        resumeVoteUntil={resumeVoteUntil}
        // 관전자(myTeam === null)는 애초에 멈출 수 없어 이 숫자를 쓰지 않는다.
        pauseLeft={
          individual
            ? canActInGame && mySide
              ? Math.max(0, gameState.settings.pauseMaxCount - (gameState.pauseUsed[mySide] ?? 0))
              : 0
            : myTeam ? Math.max(0, gameState.settings.pauseMaxCount - gameState.pauseUsed[myTeam]) : 0
        }
        pauseUnlimited={gameState.pauseUnlimited}
        pauseUntil={pauseUntil}
        myTeam={individual ? (canActInGame ? mySide : null) : myTeam}
        individual={individual}
        ended={gameState.phase === 'ended'}
        pauseRequest={pauseRequest}
        pauseWaitingUntil={pauseWaitingUntil}
        pauseNotice={pauseNotice}
        onClearNotice={clearPauseNotice}
        onRequestPause={() => requestPause(individual)}
        onResume={resumeGame}
        onRespond={respondPause}
        onSurrender={surrender}
        onLeave={handleMenuLeave}
        noPauseText={gameState.event ? '이벤트 판은 일시정지가 없어요' : undefined}
      />
      {/* 세로로 든 폰에 "가로로 돌려 주세요"를 덮는다. **항상 마운트하고** 보이는 조건은
          CSS가 정한다(RotateHint 주석 — hydration과 회전 리렌더를 피하기 위해서다).
          결과 화면에는 뜨지 않는다 — 이 return 위에서 GameEndScreen이 먼저 돌아간다. */}
      {/* 목표점수 달성하기 — 시작 룰렛. 일시정지 창보다 위에 덮는다(그동안은 메뉴도 누를 수 없다). */}
      {introActive && gameState.scoreRace && gameState.phase === 'playing' && (
        <ScoreRaceIntro
          target={gameState.scoreRace.target}
          until={eventIntroUntil}
          maxTurn={gameState.scoreRace.maxTurn}
          range={gameState.event?.targetRange}
        />
      )}
      <RotateHint />
    </>
  );
}
