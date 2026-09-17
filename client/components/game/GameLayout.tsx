import { useEffect } from 'react';
import type { Animal, ClientGameState, Place, Team } from 'shared';
import { ANIMALS } from 'shared';
import type { AnimationState } from '@/hooks/useAnimationQueue';
import { previewSkill, withDisplayedExp } from '@/lib/skills';
import { LeafDecoration } from '@/components/ui/LeafDecoration';
import { EffectLayer } from '@/components/effects/EffectLayer';
import { SheepComboLayer } from '@/components/effects/SheepComboLayer';
import { MainComboBanner } from '@/components/effects/MainComboBanner';
import { SheepLoadedBanner } from '@/components/effects/SheepLoadedBanner';
import { FestivalLoadedBanner } from '@/components/effects/FestivalLoadedBanner';
import { FestivalStartBanner } from '@/components/effects/FestivalStartBanner';
import { PlayerEmoticonLayer } from '@/components/effects/PlayerEmoticonLayer';
import { RabbitFlightLayer } from '@/components/effects/RabbitFlightLayer';
import { DecisiveHitBanner } from '@/components/effects/DecisiveHitBanner';
import { TurnAnnounceBanner } from '@/components/effects/TurnAnnounceBanner';
import { TigerClawLayer } from '@/components/effects/TigerClawLayer';
import { SettingsHintPopup } from '@/components/ui/SettingsHintPopup';
import { GameHeader } from './GameHeader';
import { TeamPanel } from './TeamPanel';
import { GameBoard } from './GameBoard';
import { SheepProgressBar } from './SheepProgressBar';
import { FestivalProgressBar } from './FestivalProgressBar';
import { SkillChoiceBar } from './SkillChoiceBar';
import { TeamTotalPanel } from './TeamTotalPanel';
import { ActionPrompt } from './ActionPrompt';

// screenShakeLevel(임의의 정수) → 진동 강도 스케일. 숫자가 클수록 세게 흔들린다 —
// 카드가 쌓일 때/예약 뽑기 롤 진입 시(약하게=1, 강하게=4), 특허랑이·결정타 등 다른
// 효과(레벨 2, 3)까지 이 하나의 스케일 함수를 공유해서 쓴다.
function shakeScale(level: number): number {
  return Math.min(0.6 + (level - 1) * 0.35, 3.2);
}

export function GameLayout({
  gameState,
  turnDeadline,
  myTeam,
  playerId,
  onPlaceClick,
  onChooseSkill,
  onPassSkill,
  error,
  animState,
}: {
  gameState: ClientGameState;
  // 턴 제한시간 만료 시각 — 서버 시계가 아니라 내 브라우저 시계 기준으로 환산된 값이
  // 필요해서 gameState가 아니라 useWebSocket에서 따로 받아온다(useWebSocket 주석 참고).
  turnDeadline: number;
  // null이면 관전 시점 — 어느 쪽도 내 팀이 아니다. 화면 전체가 이 한 값으로 갈린다:
  // 팀 색이 "우리 연두/상대 붉은"에서 중립 두 색(기본 민트·핑크)으로 바뀌고,
  // 조작은 전부 막히며, 대신 지금 차례인 팀을 알려주는 옅은 손가락 가이드가 켜진다.
  myTeam: Team | null;
  playerId: string | null;
  onPlaceClick: (place: Place) => void;
  onChooseSkill: (animal: Animal) => void;
  onPassSkill: () => void;
  error: string | null;
  animState: AnimationState;
}) {
  const isShaking = animState.screenShakeLevel > 0;
  const spectating = myTeam === null;
  // N:N(팀에 여러 명)일 때, "우리 팀 차례"인 것과 "지금 나 자신의 차례"인 것은 다르다.
  // 예전엔 팀만 맞으면(=isMyChoiceTurn/isMyDrawTurn이 team만 검사) 같은 팀의 다른
  // 플레이어 차례에도 보드·행동 패널이 나한테까지 클릭 가능하게 보여서, 실제로는
  // 아무 동작도 안 하는데(서버가 activePlayerIndex로 걸러 거부) 화면만 상호작용
  // 가능한 척하는 혼란이 있었다. ActionPrompt는 이미 자체적으로 memberIds로 이
  // 구분을 하고 있었으니(그래서 문구는 "내 차례가 아니에요"로 맞았다), 여기서도
  // 같은 기준으로 판단해 보드/행동 패널의 실제 상호작용 가능 여부까지 맞춘다.
  const isMyPlayerTurn =
    myTeam !== null &&
    playerId !== null &&
    gameState.memberIds[animState.displayedActiveTeam]?.[animState.displayedActivePlayerIndex] === playerId;
  // 정산 연출이 다 끝난 뒤, 내가(정확히 나 자신이) 행동을 고를 차례일 때만 행동 선택 영역을 활성화한다.
  const isMyChoiceTurn = !animState.isSettling && myTeam !== null && gameState.pendingChoice === myTeam && isMyPlayerTurn;
  // 정산 연출이 다 끝난 뒤, 내가 장소를 고를(카드를 뽑을) 차례인지.
  const isMyDrawTurn =
    !animState.isSettling &&
    myTeam !== null &&
    gameState.pendingChoice === null &&
    animState.displayedActiveTeam === myTeam &&
    isMyPlayerTurn;
  // 관전자를 포함해 행동 선택 영역은 항상 보여주되, 상세 수치는 내 팀 기준으로
  // 미리보기한다. 관전자는 내 팀이 없으므로 "지금 고르고 있는 팀"(없으면 지금 차례인 팀)을
  // 대신 본다 — 그래야 관전자 손가락 가이드가 실제로 그 팀이 고를 수 있는 행동을 짚는다.
  const skillPreviewTeam = myTeam ?? gameState.pendingChoice ?? animState.displayedActiveTeam;
  const noEligible = isMyChoiceTurn && ANIMALS.every(a => previewSkill(gameState, skillPreviewTeam, a).level === 0);
  // 관전자용 손가락 가이드가 가리킬 팀 — 지금 어느 단계인지에 따라 보드(장소 선택)와
  // 행동 선택 영역 중 한쪽에만 켠다. 정산 연출이 도는 동안에는(플레이어 화면에서도
  // 조작이 잠기는 구간) 꺼둔다.
  const spectatorDrawGuideTeam =
    spectating && !animState.isSettling && gameState.pendingChoice === null
      ? animState.displayedActiveTeam
      : null;
  const spectatorChoiceGuideTeam =
    spectating && !animState.isSettling ? gameState.pendingChoice : null;

  // ─ "지금 눈길을 둘 곳" 강조 — 한 차례 내내 카드판만 빛나던 것을, 단계에 따라
  //   카드판 ↔ 행동 선택 띠로 옮겨간다(장소를 고를 땐 위, 행동을 고를 땐 아래).
  //   기준은 서버 상태(pendingChoice)가 아니라 "화면에 행동 선택 단계가 실제로 떠 있는
  //   순간"이다 — 서버는 뽑기를 처리하는 즉시 pendingChoice를 세우지만 화면에는 정산
  //   연출이 끝나야 그 단계가 보이므로, 그 사이에는 아직 카드판에서 일이 벌어지고 있다
  //   (GameHeader의 isChoicePhase와 같은 기준).
  const choiceStageVisible = gameState.pendingChoice !== null && !animState.isSettling;
  // 관전자는 양 팀 차례 모두에서, 플레이어는 우리 팀 차례에만 강조를 본다.
  const watchingThisTurn = spectating || animState.displayedActiveTeam === myTeam;
  const boardTurnGlow = watchingThisTurn && !choiceStageVisible;
  const myTeamChoosing = !spectating && choiceStageVisible && gameState.pendingChoice === myTeam;
  // 스킬 선택 패널에는 서버가 이미 반영한 진짜 경험치가 아니라, 카드가 팀 영역에 도착하는
  // 연출이 끝나야 비로소 보여주는 "화면상" 경험치를 기준으로 레벨/기댓값을 계산해 넘긴다 —
  // 그래야 "카드 도착 → 경험치 반영 → 레벨업"이라는 순서가 화면에서도 지켜진다.
  const skillPreviewGameState = withDisplayedExp(gameState, skillPreviewTeam, animState.displayedExp[skillPreviewTeam]);

  // 게임 템포가 늘어지지 않도록, 고를 수 있는 행동이 하나도 없으면 방에서 정한
  // noActionTimeSec 뒤에 "아무것도 하지 않음"이 자동으로 눌린 것처럼 처리한다(서버
  // 타이머도 같은 값으로 짧아져 있어 이중 안전장치가 된다). 이 로컬 타이머는
  // noEligible이 true가 되는 순간(=정산 연출이 끝나 실제로 화면에 보이는 순간)부터
  // 세고, 서버는 그 연출 길이만큼을 유예로 얹어두므로 자연히 이쪽이 먼저 발동한다.
  const noActionMs = gameState.settings.noActionTimeSec * 1000;
  useEffect(() => {
    if (!noEligible) return;
    const t = setTimeout(() => onPassSkill(), noActionMs);
    return () => clearTimeout(t);
  }, [noEligible, noActionMs, onPassSkill]);

  return (
    <div
      className={`h-screen play-bg flex flex-col relative overflow-hidden ${isShaking ? 'shake-combo' : ''}`}
      style={isShaking ? ({ '--shake-scale': shakeScale(animState.screenShakeLevel) } as React.CSSProperties) : undefined}
    >
      {/* 모서리 잎사귀 장식 — 좌상단은 왼쪽 팀 패널 바로 위라 다른 세 모서리보다 커
          보인다는 피드백으로 살짝 줄이고, 아래로도 조금 내렸다. */}
      <LeafDecoration position="tl" size={64} offsetY={12} />
      <LeafDecoration position="tr" />
      <LeafDecoration position="bl" />
      <LeafDecoration position="br" />

      <GameHeader
        gameState={gameState}
        myTeam={myTeam}
        displayedActiveTeam={animState.displayedActiveTeam}
        displayedActivePlayerIndex={animState.displayedActivePlayerIndex}
        isSettling={animState.isSettling}
      />

      {/* ⚠️ 흐름에 끼우지 않고 **띄운다.** 액자는 "100vh − 상단 바"로 제 높이를 잡는데,
          여기서 한 줄이라도 자리를 차지하면 그만큼 액자가 화면 밖으로 밀린다. */}
      {error && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-[60] bg-red-100 border border-red-200 rounded-b-xl text-red-700 text-sm text-center py-1.5 px-4">
          {error}
        </div>
      )}

      {/* ══ 통짜 액자 한 장 위에 칸 10개 ═══════════════════════════════════════
          예전에는 3열 그리드가 자리를 정하고 판마다 제 액자를 둘렀지만, 이제 액자
          그림 하나가 칸막이까지 들고 있다. 그래서 **자리를 정하는 주체가 그림**이고,
          여기서는 그림에서 잰 %(globals.css의 .play-cell-*)에 내용을 얹기만 한다.

          ⚠️ 칸 좌표를 컴포넌트에 흩어 두지 말 것 — 그림을 갈아끼우면 한 번에 고쳐야
          하므로 globals.css 한 곳에 모아 둔다. */}
      <main className="flex-1 min-h-0 relative flex items-center">
        <div className="play-frame">
          {/* ── 윗줄 왼쪽 · 오른쪽 — 팀별 동물 경험치 현황(요청 1) */}
          <div className="play-cell play-cell-exp-a">
            <TeamPanel team="A" myTeam={myTeam} gameState={gameState} animState={animState} />
          </div>

          {/* ── 윗줄 가운데 — 장소 선택과 카드(요청 2) */}
          <div className="play-cell play-cell-board">
            <GameBoard
              gameState={gameState}
              myTeam={myTeam}
              canAct={isMyDrawTurn}
              onPlaceClick={onPlaceClick}
              captions={animState.captions}
              placeFocusBursts={animState.placeFocusBursts}
              drawSlots={animState.drawSlots}
              woolBalls={animState.woolBalls}
              acornBalls={animState.acornBalls}
              collectingCardIds={animState.collectingCardIds}
              shakingPile={animState.shakingPile}
              newCardId={animState.newCardId}
              stackCards={animState.stackCards}
              displayedActiveTeam={animState.displayedActiveTeam}
              festivalFlash={animState.festivalFlash}
              festivalBurst={animState.festivalBurst}
              mermaidPopup={animState.mermaidPopup}
              spectatorGuideTeam={spectatorDrawGuideTeam}
              turnGlow={boardTurnGlow}
            />

          </div>

          <div className="play-cell play-cell-exp-b">
            <TeamPanel team="B" myTeam={myTeam} gameState={gameState} animState={animState} />
          </div>

          {/* ── 아랫줄 양 끝 — 각 팀 체력(요청 3) */}
          <div className="play-cell play-cell-hp-a">
            <TeamTotalPanel team="A" gameState={gameState} myTeam={myTeam} pulse={animState.hpPulse.get('A') ?? null} />
          </div>

          {/* ── 아랫줄 가운데 다섯 칸 — 기술 카드 4장 + 턴 마치기(요청 4) */}
          <div className="play-cards">
            <SkillChoiceBar
              gameState={skillPreviewGameState}
              team={skillPreviewTeam}
              interactive={isMyChoiceTurn}
              spectatorGuideTeam={spectatorChoiceGuideTeam}
              myTeamChoosing={myTeamChoosing}
              onChoose={onChooseSkill}
              onPass={onPassSkill}
            />
          </div>

          <div className="play-cell play-cell-hp-b">
            <TeamTotalPanel team="B" gameState={gameState} myTeam={myTeam} pulse={animState.hpPulse.get('B') ?? null} />
          </div>
          {/* 모래시계·남은 시간·차례 안내 — 해설판(채팅로그)을 걷어냈으므로(요청 5)
              그 안에 얹혀 있던 이 오버레이만 따로 살려 보드 아래쪽에 띄운다.
              타이머는 없어지면 안 되는 기능이라 "로그 제거"에 딸려 보낼 수 없다. */}
          <div className="play-prompt-strip">
            <ActionPrompt
              myTeam={myTeam}
              playerId={playerId}
              displayedActiveTeam={animState.displayedActiveTeam}
              displayedActivePlayerIndex={animState.displayedActivePlayerIndex}
              memberIds={gameState.memberIds}
              isMyDrawTurn={isMyDrawTurn}
              interactive={isMyChoiceTurn}
              noEligible={noEligible}
              turnDeadline={turnDeadline}
              turnTotalMs={gameState.turnTotalMs}
              turn={gameState.turn}
              startingTeam={gameState.startingTeam}
              startingTeamReason={gameState.startingTeamReason}
              teamNames={gameState.teamNames}
            />
          </div>
        </div>
      </main>

      {/* 화면 오버레이 이펙트 (나뭇잎, 플로팅 텍스트) */}
      <EffectLayer
        leafParticleCount={animState.leafParticleCount}
        floatingTexts={animState.floatingTexts}
      />

      {/* 실용신양 발동 예고 — "예약된 카드 N장 뽑기!" */}
      <SheepLoadedBanner loaded={animState.sheepLoaded} />

      {/* 도토리 축제 랜덤 뽑기 발동 예고 — "도토리 축제 효과! 랜덤 뽑기 N회!" */}
      <FestivalLoadedBanner loaded={animState.festivalLoaded} />
      <FestivalStartBanner info={animState.festivalStartInfo} />

      {/* 예약된 추가 뽑기 콤보 텍스트 (fixed, 화면 전역) */}
      <SheepComboLayer combos={animState.sheepCombos} />

      {/* 예약된 추가 뽑기 종료 — 최종 콤보 수 배너 */}
      <MainComboBanner combo={animState.mainCombo} />

      {/* 플레이어 프로필 옆 반응 이모티콘 (fixed, 화면 전역) */}
      <PlayerEmoticonLayer items={animState.emoticons} />

      {/* 실용신양 추가 뽑기 진행도 */}
      <SheepProgressBar progress={animState.sheepProgress} />

      {/* 도토리 축제 추가 뽑기 진행도 */}
      <FestivalProgressBar progress={animState.festivalProgress} />

      {/* 상표토끼 행동 발동 — 토끼 스택에서 팀 점수판으로 날아가는 토끼들 */}
      <RabbitFlightLayer flights={animState.rabbitFlights} />

      {/* 특허랑이 행동 발동 — 화면 전체가 크게 흔들리는 타격 비네트 */}
      {animState.tigerImpact && <div className="tiger-vignette" />}
      <TigerClawLayer active={animState.tigerImpact} />

      {/* 체력 즉시 승패 — 결정타! 강조 */}
      <DecisiveHitBanner hit={animState.decisiveHit} />
      <TurnAnnounceBanner
        activeTeam={animState.displayedActiveTeam}
        activePlayerIndex={animState.displayedActivePlayerIndex}
        memberIds={gameState.memberIds}
        myTeam={myTeam}
        playerId={playerId}
      />
      <SettingsHintPopup />
    </div>
  );
}
