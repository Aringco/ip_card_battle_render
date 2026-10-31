'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Animal, ClientGameState, Place, SideId } from 'shared';
import { ANIMALS, enhanceCardTier, maxTurnOf } from 'shared';
import type { AnimationState } from '@/hooks/useAnimationQueue';
import { canUseSkill, levelOf, oneWellOpen, withDisplayedExp, withDisplayedHp, withDisplayedTeams } from '@/lib/skills';
import { useGameHotkeys } from '@/lib/useGameHotkeys';
import { EffectLayer } from '@/components/effects/EffectLayer';
import { SweepBanner } from '@/components/effects/SweepBanner';
import { SheepComboLayer } from '@/components/effects/SheepComboLayer';
import { PlayerEmoticonLayer } from '@/components/effects/PlayerEmoticonLayer';
import { RabbitFlightLayer } from '@/components/effects/RabbitFlightLayer';
import { TigerClawLayer } from '@/components/effects/TigerClawLayer';
import { DecisiveHitBanner } from '@/components/effects/DecisiveHitBanner';
import { SettingsHintPopup } from '@/components/ui/SettingsHintPopup';
import { GameBoard } from '../GameBoard';
import { SkillChoiceBar } from '../SkillChoiceBar';
import { ActionPrompt } from '../ActionPrompt';
import { AnimalRail } from './AnimalRail';
import { MobileDotHub, MobileHpBar } from './MobileHpBar';
import { MobilePhase, PHASE_HERO_MS } from './MobilePhase';
import type { MobilePhaseKind } from './MobilePhase';
import { MobileNotice } from './MobileNotice';
import { StatusSheet } from './StatusSheet';
import { useSwipePanels } from './useSwipePanels';
import type { SwipePanel } from './useSwipePanels';

// 화면 흔들림 레벨 → 진폭(GameLayout.shakeScale과 같은 식)
function shakeScale(level: number): number {
  return Math.min(0.6 + (level - 1) * 0.35, 3.2);
}

/** 기술을 고른 뒤 카드 띠가 내려가기까지 — 내려찍기(SkillQuake)·고른 카드의 빛이 끝까지 보이게 잠깐 둔다 */
const CARDS_LINGER_MS = 900;
/** 카드 띠가 올라오는 시간 — globals.css .m-cards의 transform transition(0.38s) */
const CARDS_RISE_MS = 400;
/** 레벨업 연출이 끝나는 시간 — globals.css .enh-burst-text(1300ms) + 조각 지연 */
const LEVELUP_FX_MS = 1450;
/** [승격] 연출이 끝나는 시간 — SkillChoiceBar의 PROMO_MS(2600) + 여유 */
const PROMO_FX_MS = 2700;

/**
 * 모바일(가로 폰) 게임 화면 — 시범으로 **혼자 놀기에만** 쓴다(방 화면이 고른다 — lib/mobileLayout.ts).
 *
 *   ┌─[단계]──────────[⏳ 타이머 · 문구]──────────[축제·추가 뽑기]─┐
 *   │ (양)                                               (양) │
 *   │ (토끼)        장소 선택 판  /  행동 선택 카드            (토끼) │
 *   │ (인어)        (단계마다 한 화면만 — 행동 선택이면 판이 어두워지고   (인어) │
 *   │ (호랑이)        그 위로 기술 카드가 올라온다)              (호랑이) │
 *   └──────── 내 체력 ◀━━━━━━━━┃━━━━━━━━▶ 상대 체력 ────────┘
 *
 * PC 화면(GameLayout)의 그림 액자 · 상단 들보는 쓰지 않고 CSS로만 그린다(개인전의 CSS 판과 같은 방식 — globals.css의 `.m-*`).
 * 판 · 카드 · 연출은 PC의 컴포넌트를 그대로 쓴다(GameBoard · SkillChoiceBar · 연출 층) — 연출이 칸을 찾는 표식(data-*)도 같다.
 *
 * ⚠️ 판단은 GameLayout과 **같은 기준**이다(내 차례인가 · 고를 기술이 없으면 자동 턴 마치기 · 화면상 값으로 가리기) — 한쪽만 고치면
 *    PC와 모바일이 다르게 논다. 시연 · 이벤트는 이 화면으로 오지 않는다(방 화면이 혼자 놀기에만 고른다).
 */
export function MobileLayout({
  gameState,
  turnDeadline,
  myTeam,
  playerId,
  onPlaceClick,
  onChooseSkill,
  onPassSkill,
  error,
  animState,
  paused,
}: {
  gameState: ClientGameState;
  turnDeadline: number;
  myTeam: SideId | null;
  playerId: string | null;
  onPlaceClick: (place: Place) => void;
  onChooseSkill: (animal: Animal) => void;
  onPassSkill: () => void;
  error: string | null;
  animState: AnimationState;
  paused: boolean;
}) {
  const isShaking = animState.screenShakeLevel > 0;
  useGameHotkeys(paused);

  // ── 차례 판단 — GameLayout과 같다
  const isMyPlayerTurn =
    myTeam !== null &&
    playerId !== null &&
    gameState.memberIds[animState.displayedActiveTeam]?.[animState.displayedActivePlayerIndex] === playerId;
  const isMyChoiceTurn = !animState.isSettling && myTeam !== null && gameState.pendingChoice === myTeam && isMyPlayerTurn;
  const isMyDrawTurn =
    !animState.isSettling &&
    myTeam !== null &&
    gameState.pendingChoice === null &&
    animState.displayedActiveTeam === myTeam &&
    isMyPlayerTurn;
  const skillPreviewTeam = myTeam ?? gameState.pendingChoice ?? animState.displayedActiveTeam;
  const noEligible = isMyChoiceTurn && !ANIMALS.some(a => canUseSkill(gameState, skillPreviewTeam, a));
  const choiceStageVisible = gameState.pendingChoice !== null && !animState.isSettling;
  const myTeamChoosing = myTeam !== null && choiceStageVisible && gameState.pendingChoice === myTeam;
  const boardTurnGlow = animState.displayedActiveTeam === myTeam && !choiceStageVisible;
  const viewState = withDisplayedTeams(gameState, animState.displayedTeamPatch, animState.displayedStatus);
  const hpState = withDisplayedHp(viewState, animState.displayedHp);
  const enhance = !!gameState.enhance;

  // ── 단계 표시 — 내 차례의 장소 선택 · 행동 선택, 그 밖은 상대 차례. 연출 중(isSettling)에는 직전 단계를 그대로 둔다.
  const lastPhase = useRef<MobilePhaseKind>('opponent');
  const myTurnShown = animState.displayedActiveTeam === myTeam;
  let phase: MobilePhaseKind = lastPhase.current;
  if (!myTurnShown) phase = 'opponent';
  else if (isMyChoiceTurn) phase = 'choice';
  else if (isMyDrawTurn) phase = 'draw';
  else if (lastPhase.current === 'opponent') phase = 'draw';
  lastPhase.current = phase;
  // 크게 띄우는 단위 — "화면에 보이는 내 차례"의 번호 × 단계. ⚠️ gameState.turn을 쓰지 말 것: 서버는 후공의 차례가 끝나는 즉시 턴을
  // 올리는데 화면은 아직 내 차례(연출 중)라, 키가 바뀌어 "행동 선택"이 한 번 더 떴다(2026-10-31 제보).
  const turnSeq = useRef({ shown: false, seq: 0 });
  if (myTurnShown && !turnSeq.current.shown) turnSeq.current.seq++;
  turnSeq.current.shown = myTurnShown;
  const phaseKey = `${turnSeq.current.seq}:${phase}`;

  // ── 카드 레벨 붙들기(카드 강화 판) — 내 차례에 짝이 맞아 레벨이 오르면 기술 카드의 레벨업 · [승격] 연출이 그 순간 터졌는데, 그게
  //    "행동 선택" 알림보다 먼저 보였다(2026-10-31 제보). 내 차례 동안 카드에 넘기는 경험치를 붙들어 두었다가 **행동 선택 알림이 끝난
  //    뒤에** 풀어 준다 — 연출은 SkillChoiceBar가 레벨이 바뀌는 순간 터뜨리므로 그 순간이 알림 뒤로 밀린다. 아이콘 열은 붙들지 않는다.
  const [gateKey, setGateKey] = useState<string | null>(null);
  useEffect(() => {
    if (phase !== 'choice') return;
    const t = setTimeout(() => setGateKey(phaseKey), PHASE_HERO_MS);
    return () => clearTimeout(t);
  }, [phase, phaseKey]);
  const holdLevels = enhance && myTurnShown && !(phase === 'choice' && gateKey === phaseKey);
  const cardExp = useRef(animState.displayedExp[skillPreviewTeam]);
  if (!holdLevels) cardExp.current = animState.displayedExp[skillPreviewTeam];
  const skillPreviewGameState = withDisplayedExp(viewState, skillPreviewTeam, cardExp.current);

  // 고를 기술이 없으면 noActionTimeSec 뒤에 저절로 턴을 마친다(GameLayout과 같다 — 멈춘 동안은 세지 않는다)
  const noActionMs = gameState.settings.noActionTimeSec * 1000;
  useEffect(() => {
    if (!noEligible || paused) return;
    const t = setTimeout(() => onPassSkill(), noActionMs);
    return () => clearTimeout(t);
  }, [noEligible, paused, noActionMs, onPassSkill]);

  // ── 카드 띠 — 내 행동 선택 단계에만 올라온다. 고른 뒤에는 내려찍기 연출이 끝날 만큼 잠깐 더 둔다.
  const [linger, setLinger] = useState(false);
  const lingerTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(lingerTimer.current), []);
  const holdCards = useCallback(() => {
    setLinger(true);
    window.clearTimeout(lingerTimer.current);
    lingerTimer.current = window.setTimeout(() => setLinger(false), CARDS_LINGER_MS);
  }, []);
  const handleChoose = useCallback(
    (animal: Animal) => {
      holdCards();
      onChooseSkill(animal);
    },
    [holdCards, onChooseSkill],
  );
  const handlePass = useCallback(() => {
    holdCards();
    onPassSkill();
  }, [holdCards, onPassSkill]);

  // ── 카드 강화 판의 레벨업 · [승격] 연출 — 그 연출은 기술 카드 위에서 터지는데, 장소를 고르는 동안에는 카드 띠가 내려가 있어 보이지
  //    않았다. 내 카드의 레벨이 오르면 띠를 올려 연출이 **끝까지** 재생된 뒤에 내린다(2026-10-31 요청). 레벨은 SkillChoiceBar가
  //    연출을 터뜨리는 값(위에서 붙든 경험치)과 같은 값으로 잰다 — 그래야 띠가 올라오는 순간과 연출이 시작되는 순간이 같다.
  //    (내 차례의 레벨업은 붙들기 덕에 행동 선택 단계에 풀리므로 띠는 이미 올라와 있다 — 이 장치는 마지막 기술을 쓴 뒤 무작위
  //    경험치로 오르는 경우처럼 띠가 내려가려는 순간을 받친다.)
  const fxLevels = ANIMALS.map(a => levelOf(skillPreviewGameState, skillPreviewTeam, a));
  const fxKey = fxLevels.join(',');
  const fxPrev = useRef<{ team: SideId; levels: number[] } | null>(null);
  const [fxOpen, setFxOpen] = useState(false);
  const fxTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(fxTimer.current), []);
  useEffect(() => {
    const before = fxPrev.current;
    fxPrev.current = { team: skillPreviewTeam, levels: fxLevels };
    if (!enhance || !before || before.team !== skillPreviewTeam) return;
    const promoted = fxLevels.some((l, i) => l > before.levels[i] && enhanceCardTier(l) !== enhanceCardTier(before.levels[i]));
    if (!promoted && !fxLevels.some((l, i) => l > before.levels[i])) return;
    setFxOpen(true);
    window.clearTimeout(fxTimer.current);
    fxTimer.current = window.setTimeout(() => setFxOpen(false), (promoted ? PROMO_FX_MS : LEVELUP_FX_MS) + CARDS_RISE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enhance, skillPreviewTeam, fxKey]);

  // ── 스와이프로 여는 창(2026-10-31 요청) — 'cards' 기술 카드 띠(아래→위로 열고 위→아래로 닫는다) · 'mine' 내 카드 상세(왼→오) ·
  //    'opp' 상대 카드 상세(오→왼). 상세 창은 반대 방향으로 밀면 닫히고, 셋 다 다른 곳을 누르면 닫힌다(그 누름은 판에 전하지 않는다).
  const [panel, setPanel] = useState<SwipePanel | null>(null);
  const swipe = useSwipePanels(panel, setPanel);

  const cardsUp = myTeamChoosing || linger || fxOpen || panel === 'cards';

  const maxTurn = maxTurnOf(gameState);
  const turnLabel = Number.isFinite(maxTurn) ? `${gameState.turn}/${maxTurn}턴` : `${gameState.turn}턴`;

  // ── 동물 아이콘의 상태 창 — 화면 전체에서 하나만 열린다. 아이콘 밖을 누르면 접힌다.
  const [openIcon, setOpenIcon] = useState<string | null>(null);
  useEffect(() => {
    if (!openIcon) return;
    const close = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.m-rail-item')) setOpenIcon(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [openIcon]);

  return (
    <div
      className={`m-layout play-bg ${isShaking ? 'shake-combo' : ''}`}
      data-enhance={gameState.enhance ? '' : undefined}
      data-cards={cardsUp || undefined}
      data-panel={panel ?? undefined}
      style={isShaking ? ({ '--shake-scale': shakeScale(animState.screenShakeLevel) } as React.CSSProperties) : undefined}
      {...swipe}
    >
      {/* 위 띠 — [단계 칩 · 내 닉네임] [타이머] [상대 닉네임 · 일시정지 자리]. 양 끝 칸(단계 칩 ↔ 일시정지 자리)이 같은 폭이라
          가운데 타이머가 화면 가운데에 온다. 일시정지 버튼은 전역(fixed)이라 그 자리를 빈 상자(.m-pause-slot)로 비워 둔다. */}
      <header className="m-top">
        <div className="m-top-side m-top-left">
          <MobilePhase phase={phase} phaseKey={phaseKey} turnLabel={turnLabel} />
          <span className="m-name" data-tone="mine" title={gameState.teamNames.A}>
            {gameState.teamNames.A}
          </span>
        </div>
        <div className="m-top-center">
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
            paused={paused}
            turn={gameState.turn}
            skillsPerTurn={gameState.skillsPerTurn}
            skillsUsedThisTurn={gameState.skillsUsedThisTurn}
            startingTeam={gameState.startingTeam}
            startingTeamReason={gameState.startingTeamReason}
            teamNames={gameState.teamNames}
          />
        </div>
        {/* row-reverse — 왼쪽 칸의 거울이라 첫 자식(일시정지 자리)이 오른쪽 끝에 선다 */}
        <div className="m-top-side m-top-right">
          <span className="m-pause-slot" aria-hidden />
          <span className="m-name" data-tone="enemy" title={gameState.teamNames.B}>
            {gameState.teamNames.B}
          </span>
        </div>
        {/* 진행 안내(축제 · 추가 뽑기) — 위 띠 바로 아래 오른쪽에 띄운다(띠 안에 두면 대칭이 깨지고 좁은 폰에서 잘린다) */}
        <div className="m-notice-float">
          <MobileNotice gameState={gameState} animState={animState} myTeam={myTeam} />
        </div>
      </header>

      {error && <div className="m-error">{error}</div>}

      <aside className="m-rail m-rail-left">
        <AnimalRail team="A" side="left" gameState={viewState} animState={animState} open={openIcon} onToggle={setOpenIcon} />
      </aside>

      <section className="m-view">
        <div className="m-board">
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
            spectatorGuideTeam={null}
            turnGlow={boardTurnGlow}
          />
        </div>
        {/* 행동 선택 — 판이 어두워지고 그 위로 기술 카드 다섯 장(4 + 턴 마치기)이 올라온다 */}
        <div className="m-board-dim" aria-hidden />
        <div className="m-cards" inert={!cardsUp}>
          <SkillChoiceBar
            gameState={skillPreviewGameState}
            team={skillPreviewTeam}
            interactive={isMyChoiceTurn}
            myTeamChoosing={myTeamChoosing}
            wellOpen={oneWellOpen(gameState, skillPreviewTeam)}
            tapFocus
            onChoose={handleChoose}
            onPass={handlePass}
          />
        </div>
      </section>

      {/* 카드 상세 창 — 판과 같은 칸에 겹친 **맨 위 층**(.m-sheets). 카드 띠보다도 위다 */}
      <div className="m-sheets">
        <StatusSheet team="A" side="left" open={panel === 'mine'} gameState={viewState} animState={animState} />
        <StatusSheet team="B" side="right" open={panel === 'opp'} gameState={viewState} animState={animState} />
      </div>

      <aside className="m-rail m-rail-right">
        <AnimalRail team="B" side="right" gameState={viewState} animState={animState} open={openIcon} onToggle={setOpenIcon} />
      </aside>

      <footer className="m-bottom" data-hub={gameState.enhance ? '' : undefined}>
        <MobileHpBar team="A" side="left" gameState={hpState} animState={animState} mine={myTeam === 'A'} />
        {gameState.enhance && <MobileDotHub gameState={hpState} left="A" right="B" />}
        <MobileHpBar team="B" side="right" gameState={hpState} animState={animState} mine={myTeam === 'B'} />
      </footer>

      {/* 연출 층 — PC와 같은 것을 띄운다(진행 문구 · 축제 시작 안내는 오른쪽 위 MobileNotice가 대신한다) */}
      <EffectLayer leafParticleCount={animState.leafParticleCount} floatingTexts={animState.floatingTexts} />
      <SweepBanner info={animState.sweepBanner} />
      <SheepComboLayer combos={animState.sheepCombos} />
      {/* 풍선은 이 층에 가둔다 — 카드 띠가 올라오면 카드가 그 위에 온다(globals.css .m-emotes) */}
      <div className="m-emotes">
        <PlayerEmoticonLayer items={animState.emoticons} />
      </div>
      <RabbitFlightLayer flights={animState.rabbitFlights} />
      {animState.tigerImpact && <div className="tiger-vignette" />}
      <TigerClawLayer active={animState.tigerImpact} />
      <DecisiveHitBanner hit={animState.decisiveHit} />
      <SettingsHintPopup turn={gameState.turn} />
    </div>
  );
}
