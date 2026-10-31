'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Animal, ClientGameState, Place, SideId } from 'shared';
import { ANIMALS, emoteById, enhanceCardTier, maxTurnOf, needsTarget } from 'shared';
import type { AnimationState, PlayerEmoticon } from '@/hooks/useAnimationQueue';
import type { ReceivedEmote } from '@/hooks/useWebSocket';
import { canUseSkill, finishingMove, levelOf, withDisplayedExp, withDisplayedHp, withDisplayedTeams } from '@/lib/skills';
import { isFinished, opponentOrder, sideColor, sideName, withDisplayedFinish } from '@/lib/individual';
import { useGameHotkeys } from '@/lib/useGameHotkeys';
import { EffectLayer } from '@/components/effects/EffectLayer';
import { SweepBanner } from '@/components/effects/SweepBanner';
import { SheepComboLayer } from '@/components/effects/SheepComboLayer';
import { PlayerEmoticonLayer } from '@/components/effects/PlayerEmoticonLayer';
import { RabbitFlightLayer } from '@/components/effects/RabbitFlightLayer';
import { TigerClawLayer } from '@/components/effects/TigerClawLayer';
import { RankedBanner } from '@/components/effects/RankedBanner';
import { SettingsHintPopup } from '@/components/ui/SettingsHintPopup';
import { GameBoard } from '../GameBoard';
import { SkillChoiceBar } from '../SkillChoiceBar';
import { IndividualPrompt } from '../IndividualPrompt';
import type { TargetSkill } from '../TargetPicker';
import { AnimalRail } from './AnimalRail';
import { MobileDotHub, MobileHpBar } from './MobileHpBar';
import { MobilePhase, PHASE_HERO_MS } from './MobilePhase';
import type { MobilePhaseKind } from './MobilePhase';
import { MobileNotice } from './MobileNotice';
import { StatusSheet } from './StatusSheet';
import { MobileTargetPicker, OpponentListSheet } from './IndividualPanels';
import { PANEL_AREA, useSwipeGestures } from './useSwipePanels';

function shakeScale(level: number): number {
  return Math.min(0.6 + (level - 1) * 0.35, 3.2);
}

const CARDS_LINGER_MS = 900;
const CARDS_RISE_MS = 400;
const LEVELUP_FX_MS = 1450;
const PROMO_FX_MS = 2700;
/** 내가 다른 상대를 노렸을 때 그 상대를 오른쪽에 잠깐 세워 두는 시간 — 체력이 깎이고 상태가 붙는 연출을 보고 돌아온다 */
const ATTACK_SHOW_MS = 4500;

/** 'mine' 내 카드 상세 · 'oppList' 상대 목록 · 'oppDetail' 고른 상대의 카드 상세 · 'cards' 기술 카드 띠 */
type Panel = 'cards' | 'mine' | 'oppList' | 'oppDetail';

/**
 * 개인전(3명 이상) 모바일(가로 폰) 화면 — 팀전 모바일 배치(MobileLayout)와 같은 모양에, 상대가 여럿인 것만 다르다.
 *
 * - 왼쪽은 나, 오른쪽은 **지금 차례인 상대**(내 차례에는 마지막으로 차례였던 상대). 두 열 · 이름 · 체력 막대는 그 사람이 대기실에서 고른 색이다.
 *   내가 오른쪽에 없는 상대를 노리면 그 상대를 잠깐(ATTACK_SHOW_MS) 오른쪽에 세워 깎이는 체력 · 붙는 상태를 보여 준다.
 * - 손짓: 오른쪽 → 왼쪽은 **상대 목록**(한 사람을 고른 채 한 번 더 밀면 그 사람의 카드 상세), 왼쪽 → 오른쪽은 내 카드 상세(상세 · 목록이
 *   열려 있으면 한 단계씩 닫는다), 아래 → 위는 기술 카드 띠(위 → 아래로 닫는다). 다른 곳을 누르면 닫힌다.
 * - 공격 카드(특허랑이 · 강화 방 Lv.6+ 디자인어 — needsTarget)는 대상 고르기 창(MobileTargetPicker)을 띄운다. 한 번 눌러 고르고, 한 번 더
 *   누르면 확정 — 고른 채 오른쪽 → 왼쪽으로 밀면 그 상대의 카드 상세가 이 위에 열린다.
 *
 * ⚠️ 판단(내 차례 · 순위가 정해진 사람은 조작 잠금 · 고를 기술이 없으면 자동 턴 마치기 · 화면상 값)은 PC의 IndividualLayout과 같은 기준이다 —
 *    한쪽만 고치면 PC와 모바일이 다르게 논다. 레벨 붙들기 · 단계 판 단위는 팀전 MobileLayout과 같다.
 */
export function MobileIndividualLayout({
  gameState: serverState,
  turnDeadline,
  mySide,
  playerId,
  onPlaceClick,
  onChooseSkill,
  onPassSkill,
  error,
  animState,
  paused,
  emotes,
}: {
  gameState: ClientGameState;
  turnDeadline: number;
  mySide: SideId | null;
  playerId: string | null;
  onPlaceClick: (place: Place) => void;
  onChooseSkill: (animal: Animal, target?: SideId) => void;
  onPassSkill: () => void;
  error: string | null;
  animState: AnimationState;
  paused: boolean;
  emotes: ReceivedEmote[];
}) {
  const gameState = useMemo(() => withDisplayedFinish(serverState, animState.hiddenFinish), [serverState, animState.hiddenFinish]);
  const isShaking = animState.screenShakeLevel > 0;
  const finished = isFinished(gameState, mySide);
  const observer = mySide === null || finished;
  const activeSide = gameState.teams[animState.displayedActiveTeam] ? animState.displayedActiveTeam : gameState.activeTeam;

  // ── 차례 판단 — IndividualLayout과 같다
  const isMyChoiceTurn = !animState.isSettling && !observer && gameState.pendingChoice === mySide;
  const isMyDrawTurn = !animState.isSettling && !observer && gameState.pendingChoice === null && activeSide === mySide;
  const isMyPlayerTurn =
    !observer && playerId !== null && gameState.memberIds[activeSide]?.[animState.displayedActivePlayerIndex] === playerId;
  const leftSide: SideId = mySide ?? activeSide;
  const skillPreviewTeam = mySide ?? gameState.pendingChoice ?? activeSide;
  const viewState = withDisplayedTeams(gameState, animState.displayedTeamPatch, animState.displayedStatus);
  const hpState = withDisplayedHp(viewState, animState.displayedHp);
  const choiceStageVisible = gameState.pendingChoice !== null && !animState.isSettling;
  const myTeamChoosing = !observer && choiceStageVisible && gameState.pendingChoice === mySide;
  const boardTurnGlow = isMyPlayerTurn && !choiceStageVisible;
  const enhance = !!gameState.enhance;

  // ── 오른쪽에 세울 상대 — 지금 차례인 상대, 내 차례에는 직전 상대. 내가 노린 상대는 잠깐 그 자리를 빌린다.
  const opponents = opponentOrder(gameState, mySide, mySide);
  const lastOpp = useRef<SideId | null>(null);
  if (activeSide !== leftSide && opponents.includes(activeSide)) lastOpp.current = activeSide;
  const baseRight: SideId | null =
    lastOpp.current && opponents.includes(lastOpp.current)
      ? lastOpp.current
      : (opponents.find(s => !isFinished(gameState, s)) ?? opponents[0] ?? null);
  const [attackShow, setAttackShow] = useState<SideId | null>(null);
  const attackTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(attackTimer.current), []);
  const rightSide: SideId | null = attackShow ?? baseRight;

  // ── 단계 표시 · 카드 레벨 붙들기(팀전 MobileLayout과 같다)
  const lastPhase = useRef<MobilePhaseKind>('opponent');
  const myTurnShown = activeSide === mySide && !observer;
  let phase: MobilePhaseKind = lastPhase.current;
  if (!myTurnShown) phase = 'opponent';
  else if (isMyChoiceTurn) phase = 'choice';
  else if (isMyDrawTurn) phase = 'draw';
  else if (lastPhase.current === 'opponent') phase = 'draw';
  lastPhase.current = phase;
  const turnSeq = useRef({ shown: false, seq: 0 });
  if (myTurnShown && !turnSeq.current.shown) turnSeq.current.seq++;
  turnSeq.current.shown = myTurnShown;
  const phaseKey = `${turnSeq.current.seq}:${phase}`;
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
  const noEligible = isMyChoiceTurn && !ANIMALS.some(a => canUseSkill(skillPreviewGameState, skillPreviewTeam, a));

  const noActionMs = gameState.settings.noActionTimeSec * 1000;
  useEffect(() => {
    if (!noEligible || paused) return;
    const t = setTimeout(() => onPassSkill(), noActionMs);
    return () => clearTimeout(t);
  }, [noEligible, paused, noActionMs, onPassSkill]);

  // ── 카드 띠 — 내 행동 선택 단계 · 고른 뒤 잠깐 · 레벨업 연출 동안 · 스와이프로 연 동안
  const [linger, setLinger] = useState(false);
  const lingerTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(lingerTimer.current), []);
  const holdCards = useCallback(() => {
    setLinger(true);
    window.clearTimeout(lingerTimer.current);
    lingerTimer.current = window.setTimeout(() => setLinger(false), CARDS_LINGER_MS);
  }, []);
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

  // ── 공격 대상 고르기
  const [picking, setPicking] = useState<TargetSkill | null>(null);
  const [pickFocus, setPickFocus] = useState<SideId | null>(null);
  const targets = useMemo(() => opponents.filter(s => !isFinished(gameState, s)), [opponents, gameState]);
  useEffect(() => {
    if (!isMyChoiceTurn) {
      setPicking(null);
      setPickFocus(null);
    }
  }, [isMyChoiceTurn]);
  useGameHotkeys(paused || picking !== null);

  const showAttacked = useCallback(
    (target: SideId) => {
      if (target === baseRight) return;
      setAttackShow(target);
      window.clearTimeout(attackTimer.current);
      attackTimer.current = window.setTimeout(() => setAttackShow(null), ATTACK_SHOW_MS);
    },
    [baseRight],
  );
  const handleChoose = useCallback(
    (animal: Animal) => {
      const level = mySide ? levelOf(skillPreviewGameState, mySide, animal) : 0;
      if ((animal === 'tiger' || animal === 'mermaid') && needsTarget(gameState, animal, level)) {
        if (targets.length === 1) {
          holdCards();
          showAttacked(targets[0]);
          onChooseSkill(animal, targets[0]);
          return;
        }
        if (targets.length > 0) {
          setPicking(animal);
          setPickFocus(null);
        }
        return;
      }
      holdCards();
      onChooseSkill(animal);
    },
    [mySide, skillPreviewGameState, gameState, targets, holdCards, showAttacked, onChooseSkill],
  );
  const handlePick = useCallback(
    (target: SideId) => {
      if (!picking) return;
      holdCards();
      showAttacked(target);
      onChooseSkill(picking, target);
      setPicking(null);
      setPickFocus(null);
    },
    [picking, holdCards, showAttacked, onChooseSkill],
  );
  const handlePass = useCallback(() => {
    holdCards();
    onPassSkill();
  }, [holdCards, onPassSkill]);

  // ── 손짓 · 창
  const [panel, setPanel] = useState<Panel | null>(null);
  const [listFocus, setListFocus] = useState<SideId | null>(null);
  const [detailSide, setDetailSide] = useState<SideId | null>(null);
  const openDetail = (side: SideId) => {
    setDetailSide(side);
    setPanel('oppDetail');
  };
  const swipe = useSwipeGestures({
    onSwipe: dir => {
      if (dir === 'up') {
        if (panel === null && !picking) setPanel('cards');
      } else if (dir === 'down') {
        if (panel === 'cards') setPanel(null);
      } else if (dir === 'left') {
        // 오른쪽 → 왼쪽: 내 상세는 닫고, 대상 고르기 중이면 고른 상대의 상세, 목록에서 고른 상대가 있으면 그 상세, 아무것도 없으면 목록
        if (panel === 'mine') setPanel(null);
        else if (picking && pickFocus && panel === null) openDetail(pickFocus);
        else if (panel === 'oppList' && listFocus) openDetail(listFocus);
        else if (panel === null && !picking) setPanel('oppList');
      } else {
        // 왼쪽 → 오른쪽: 상세 → (목록 또는 대상 고르기로) 한 단계 뒤로, 목록 → 닫기, 아무것도 없으면 내 상세
        if (panel === 'oppDetail') setPanel(picking ? null : 'oppList');
        else if (panel === 'oppList') setPanel(null);
        else if (panel === null && !picking) setPanel('mine');
      }
    },
    onTap: target => {
      if (panel === null || target?.closest(PANEL_AREA[panel])) return false;
      setPanel(panel === 'oppDetail' && !picking ? 'oppList' : null);
      return true;
    },
  });

  const cardsUp = myTeamChoosing || linger || fxOpen || panel === 'cards';
  const maxTurn = maxTurnOf(gameState);
  const turnLabel = Number.isFinite(maxTurn) ? `${gameState.turn}/${maxTurn}턴` : `${gameState.turn}턴`;

  const [openIcon, setOpenIcon] = useState<string | null>(null);
  useEffect(() => {
    if (!openIcon) return;
    const close = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.m-rail-item')) setOpenIcon(null);
    };
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [openIcon]);

  // 감정표현 · 연출 표정 — 화면에 있는 두 사람(왼쪽 · 오른쪽)의 풍선만 자리를 찾는다
  const bubbleItems = useMemo<PlayerEmoticon[]>(() => {
    const fromPlayers = emotes.flatMap(e => {
      const item = emoteById(e.emoteId);
      return item ? [{ id: -e.id, team: e.side, playerIndex: 0, src: item.src, emote: true }] : [];
    });
    return fromPlayers.length ? [...animState.emoticons, ...fromPlayers] : animState.emoticons;
  }, [emotes, animState.emoticons]);

  const nameOf = useCallback((side: SideId) => sideName(gameState, side), [gameState]);
  const leftColor = sideColor(gameState, leftSide);
  const rightColor = rightSide ? sideColor(gameState, rightSide) : undefined;
  const nameStyle = (c?: string) => (c ? ({ ['--name-color' as string]: c } as React.CSSProperties) : undefined);

  return (
    <div
      className={`m-layout play-bg ${isShaking ? 'shake-combo' : ''}`}
      data-enhance={gameState.enhance ? '' : undefined}
      data-cards={cardsUp || undefined}
      data-panel={panel ?? undefined}
      data-individual=""
      style={isShaking ? ({ '--shake-scale': shakeScale(animState.screenShakeLevel) } as React.CSSProperties) : undefined}
      {...swipe}
    >
      <header className="m-top">
        <div className="m-top-side m-top-left">
          <MobilePhase phase={phase} phaseKey={phaseKey} turnLabel={turnLabel} />
          <span className="m-name" data-colored="" style={nameStyle(leftColor)} title={nameOf(leftSide)}>
            {nameOf(leftSide)}
          </span>
        </div>
        <div className="m-top-center">
          <IndividualPrompt
            gameState={gameState}
            mySide={mySide}
            displayedActiveTeam={activeSide}
            isMyDrawTurn={isMyDrawTurn}
            interactive={isMyChoiceTurn}
            noEligible={noEligible}
            turnDeadline={turnDeadline}
            paused={paused}
          />
        </div>
        <div className="m-top-side m-top-right">
          <span className="m-pause-slot" aria-hidden />
          {rightSide && (
            <span className="m-name" data-colored="" data-attacked={attackShow ? '' : undefined} style={nameStyle(rightColor)} title={nameOf(rightSide)}>
              {nameOf(rightSide)}
            </span>
          )}
        </div>
        <div className="m-notice-float">
          <MobileNotice gameState={gameState} animState={animState} myTeam={mySide} nameOf={nameOf} />
        </div>
      </header>

      {error && <div className="m-error">{error}</div>}

      <aside className="m-rail m-rail-left">
        <AnimalRail team={leftSide} side="left" color={leftColor} gameState={viewState} animState={animState} open={openIcon} onToggle={setOpenIcon} />
      </aside>

      <section className="m-view">
        <div className="m-board">
          <GameBoard
            gameState={gameState}
            myTeam={mySide}
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
            displayedActiveTeam={activeSide}
            festivalFlash={animState.festivalFlash}
            festivalBurst={animState.festivalBurst}
            mermaidPopup={animState.mermaidPopup}
            spectatorGuideTeam={null}
            turnGlow={boardTurnGlow}
            leftTeam={mySide ?? undefined}
          />
        </div>
        <div className="m-board-dim" aria-hidden />
        <div className="m-cards" inert={!cardsUp}>
          <SkillChoiceBar
            gameState={skillPreviewGameState}
            team={skillPreviewTeam}
            interactive={isMyChoiceTurn}
            myTeamChoosing={myTeamChoosing}
            demoAllowed={null}
            hideGuide={picking !== null}
            tapFocus
            onChoose={handleChoose}
            onPass={handlePass}
          />
        </div>
      </section>

      {picking && isMyChoiceTurn && (
        <MobileTargetPicker
          gameState={hpState}
          animal={picking}
          targets={targets}
          lethal={mySide && picking === 'tiger' ? finishingMove(skillPreviewGameState, mySide, 'tiger').targets : []}
          focus={pickFocus}
          onFocus={setPickFocus}
          onPick={handlePick}
          onCancel={() => {
            setPicking(null);
            setPickFocus(null);
          }}
        />
      )}

      <div className="m-sheets">
        <StatusSheet team={leftSide} side="left" name={nameOf(leftSide)} open={panel === 'mine'} gameState={viewState} animState={animState} />
        <OpponentListSheet
          open={panel === 'oppList'}
          gameState={hpState}
          animState={animState}
          sides={opponents}
          selected={listFocus}
          onSelect={setListFocus}
        />
        {detailSide && (
          <StatusSheet
            team={detailSide}
            side="right"
            name={nameOf(detailSide)}
            open={panel === 'oppDetail'}
            gameState={viewState}
            animState={animState}
          />
        )}
      </div>

      <aside className="m-rail m-rail-right">
        {rightSide && (
          <AnimalRail team={rightSide} side="right" color={rightColor} gameState={viewState} animState={animState} open={openIcon} onToggle={setOpenIcon} />
        )}
      </aside>

      <footer className="m-bottom" data-hub={gameState.enhance && rightSide ? '' : undefined}>
        <MobileHpBar team={leftSide} side="left" gameState={hpState} animState={animState} mine={!observer} color={leftColor} />
        {gameState.enhance && rightSide && <MobileDotHub gameState={hpState} left={leftSide} right={rightSide} />}
        {rightSide && <MobileHpBar team={rightSide} side="right" gameState={hpState} animState={animState} mine={false} color={rightColor} />}
      </footer>

      <EffectLayer leafParticleCount={animState.leafParticleCount} floatingTexts={animState.floatingTexts} leftSide={mySide ?? undefined} />
      <SweepBanner info={animState.sweepBanner} />
      <SheepComboLayer combos={animState.sheepCombos} />
      <div className="m-emotes">
        <PlayerEmoticonLayer items={bubbleItems} />
      </div>
      <RabbitFlightLayer flights={animState.rabbitFlights} />
      {animState.tigerImpact && <div className="tiger-vignette" />}
      <TigerClawLayer active={animState.tigerImpact} />
      <RankedBanner banner={animState.rankBanner} gameState={gameState} />
      <SettingsHintPopup turn={gameState.turn} />
    </div>
  );
}
