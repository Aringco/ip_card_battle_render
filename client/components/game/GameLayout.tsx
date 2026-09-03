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
import { CommentaryBoard } from './CommentaryBoard';
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
  myTeam: Team | null;
  playerId: string | null;
  onPlaceClick: (place: Place) => void;
  onChooseSkill: (animal: Animal) => void;
  onPassSkill: () => void;
  error: string | null;
  animState: AnimationState;
}) {
  const isShaking = animState.screenShakeLevel > 0;
  // 정산 연출이 다 끝난 뒤, 내 팀이 행동을 고를 차례일 때만 행동 선택 영역을 활성화한다.
  const isMyChoiceTurn = !animState.isSettling && myTeam !== null && gameState.pendingChoice === myTeam;
  // 정산 연출이 다 끝난 뒤, 내 팀이 장소를 고를(카드를 뽑을) 차례인지.
  const isMyDrawTurn =
    !animState.isSettling &&
    myTeam !== null &&
    gameState.pendingChoice === null &&
    animState.displayedActiveTeam === myTeam;
  // 관전자(myTeam === null)를 포함해 행동 선택 영역은 항상 보여주되, 상세 수치는
  // 내 팀(없으면 A팀) 기준으로 미리보기한다.
  const skillPreviewTeam = myTeam ?? 'A';
  const noEligible = isMyChoiceTurn && ANIMALS.every(a => previewSkill(gameState, skillPreviewTeam, a).level === 0);
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
      className={`h-screen bg-jungle-50 flex flex-col relative overflow-hidden ${isShaking ? 'shake-combo' : ''}`}
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

      {error && (
        <div className="bg-red-100 border-b border-red-200 text-red-700 text-sm text-center py-1.5 px-4 shrink-0">
          {error}
        </div>
      )}

      {/* 3열 × (본판 / 해설(+행동 안내 오버레이) / 합계·행동선택) 그리드 —
          화면 높이를 넘지 않도록 board·skill 행은 남는 공간을 나눠 갖는 fr 비율로,
          해설 행만 고정 높이(3줄)로 둔다.
          위쪽 패딩만 다른 세 방향(0.5rem)보다 넉넉히(1.35rem) 준다 — 보드 맨 윗줄
          장소(오두막·부둣가)의 손가락 가이드가 타일 밖 위로 튀어나오며 까딱거리는데,
          그 여유 공간이 없으면 바로 아래 overflow-hidden에 손가락 끝이 잘린다. */}
      <main
        className="flex-1 grid gap-2 pt-[1.35rem] pr-2 pb-2 pl-2 min-h-0 overflow-hidden"
        style={{
          gridTemplateColumns: '19rem 1fr 19rem',
          gridTemplateRows: 'minmax(0, 1.25fr) auto minmax(0, 1fr)',
        }}
      >
        <div style={{ gridColumn: 1, gridRow: 1 }} className="min-h-0">
          <TeamPanel team="A" myTeam={myTeam} gameState={gameState} animState={animState} />
        </div>

        <div style={{ gridColumn: 2, gridRow: 1 }} className="min-h-0 flex flex-col">
          <GameBoard
            gameState={gameState}
            myTeam={myTeam}
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
            isSettling={animState.isSettling}
            festivalFlash={animState.festivalFlash}
            festivalBurst={animState.festivalBurst}
            mermaidPopup={animState.mermaidPopup}
          />
        </div>

        <div style={{ gridColumn: 3, gridRow: 1 }} className="min-h-0">
          <TeamPanel team="B" myTeam={myTeam} gameState={gameState} animState={animState} />
        </div>

        {/* 해설판 — 모래시계/타이머/차례 안내는 이 안의 가운데 오버레이로 얹힌다 */}
        <div style={{ gridColumn: '1 / -1', gridRow: 2 }}>
          <CommentaryBoard
            lines={animState.commentary}
            overlay={
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
            }
          />
        </div>

        {/* 체력 구슬(연두=우리팀/붉은=상대팀) — 사이에 턴 종료 행동 선택 영역 */}
        <div style={{ gridColumn: 1, gridRow: 3 }} className="min-h-0">
          <TeamTotalPanel
            team="A"
            gameState={gameState}
            isMine={myTeam !== null ? myTeam === 'A' : true}
            pulse={animState.hpPulse.get('A') ?? null}
          />
        </div>
        <div style={{ gridColumn: 2, gridRow: 3 }} className="min-h-0">
          <SkillChoiceBar
            gameState={skillPreviewGameState}
            team={skillPreviewTeam}
            interactive={isMyChoiceTurn}
            onChoose={onChooseSkill}
            onPass={onPassSkill}
          />
        </div>
        <div style={{ gridColumn: 3, gridRow: 3 }} className="min-h-0">
          <TeamTotalPanel
            team="B"
            gameState={gameState}
            isMine={myTeam !== null ? myTeam === 'B' : false}
            pulse={animState.hpPulse.get('B') ?? null}
          />
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
