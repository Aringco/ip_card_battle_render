import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Animal, ClientGameState, Place, SideId } from 'shared';
import { ANIMALS, emoteById } from 'shared';
import type { AnimationState, PlayerEmoticon } from '@/hooks/useAnimationQueue';
import type { ReceivedEmote } from '@/hooks/useWebSocket';
import { finishingMove, previewSkill, withDisplayedExp } from '@/lib/skills';
import { isFinished, opponentOrder, sideColor, sideName } from '@/lib/individual';
import { ignoreHotkey } from '@/lib/hotkeys';
import { LeafDecoration } from '@/components/ui/LeafDecoration';
import { EffectLayer } from '@/components/effects/EffectLayer';
import { SheepComboLayer } from '@/components/effects/SheepComboLayer';
import { MainComboBanner } from '@/components/effects/MainComboBanner';
import { FestivalStartBanner } from '@/components/effects/FestivalStartBanner';
import { PlayerEmoticonLayer } from '@/components/effects/PlayerEmoticonLayer';
import { RabbitFlightLayer } from '@/components/effects/RabbitFlightLayer';
import { TigerClawLayer } from '@/components/effects/TigerClawLayer';
import { IndividualTurnBanner } from '@/components/effects/IndividualTurnBanner';
import { RankedBanner } from '@/components/effects/RankedBanner';
import { SettingsHintPopup } from '@/components/ui/SettingsHintPopup';
import { IndividualHeader } from './IndividualHeader';
import { IndividualPrompt } from './IndividualPrompt';
import { SelfPanel } from './SelfPanel';
import { OpponentList } from './OpponentList';
import { TargetPicker } from './TargetPicker';
import { EmotePicker } from './EmotePicker';
import { GameBoard } from './GameBoard';
import { SheepProgressBar } from './SheepProgressBar';
import { FestivalProgressBar } from './FestivalProgressBar';
import { SkillChoiceBar } from './SkillChoiceBar';
import { TeamTotalPanel } from './TeamTotalPanel';

// 단축키(자판 위치 e.code) → 순번. 장소는 화면에서 왼쪽→오른쪽, 위→아래 순, 기술은 카드 띠의 왼쪽부터.
const PLACE_KEYS: Record<string, number> = {
  Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3,
};
const SKILL_KEYS: Record<string, number> = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3 };
const PASS_INDEX = 4; // 기술 카드 띠의 다섯 번째 칸 = [턴 마치기]

// 화면 흔들림 레벨 → 진폭(GameLayout.shakeScale과 같은 식).
function shakeScale(level: number): number {
  return Math.min(0.6 + (level - 1) * 0.35, 3.2);
}

/**
 * 개인전(순위전) 게임 화면.
 *
 *   ┌──────────┬─────────────────────┬────────────┐
 *   │ 나       │      카드 필드       │ 상대 1      │
 *   │ 동물 4줄 │                     │ 상대 2 …    │
 *   ├──────────┼─────────────────────┤ 상대 7      │
 *   │ 내 체력  │ 기술 카드 4 + 턴 마치기 │            │
 *   └──────────┴─────────────────────┴────────────┘
 *
 * 팀전 GameLayout은 건드리지 않고 **새 컴포넌트로** 만들었다 — 프레임을 CSS로 다시 그리는 시범(요구 G1)이
 * 팀전 화면을 한 픽셀도 움직이지 않게 하기 위해서다(INDIVIDUAL_MODE_ROADMAP.md §3-2). 안쪽 칸의 내용은
 * 기존 컴포넌트(GameBoard·SkillChoiceBar·ScorePanel·TeamTotalPanel)를 그대로 재사용한다.
 *
 * ⚠️ `mySide === null`은 **처음부터 관전자**라는 뜻이다. 순위가 정해진 플레이어는 mySide를 그대로 두고(내
 *    패널·색이 사라지면 안 된다) `finished`로 관전처럼 보이게 한다 — 조작만 전부 잠긴다(INDIVIDUAL_MODE_ROADMAP 주의 9).
 */
export function IndividualLayout({
  gameState,
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
  onEmote,
}: {
  gameState: ClientGameState;
  turnDeadline: number;
  mySide: SideId | null;
  playerId: string | null;
  onPlaceClick: (place: Place) => void;
  /** target은 특허랑이를 고른 뒤 상대 선택 화면에서 정한 편 id — 다른 기술은 비워 보낸다 */
  onChooseSkill: (animal: Animal, target?: SideId) => void;
  onPassSkill: () => void;
  error: string | null;
  animState: AnimationState;
  paused: boolean;
  /** 지금 떠 있어야 하는 감정표현(서버가 방 전체에 전한 것 — 내 것 포함) */
  emotes: ReceivedEmote[];
  onEmote: (emoteId: string) => void;
}) {
  const isShaking = animState.screenShakeLevel > 0;
  const finished = isFinished(gameState, mySide);
  // 조작할 수 없는 시점 — 처음부터 관전자이거나, 순위가 정해져 판에서 빠진 사람.
  const observer = mySide === null || finished;
  // ⚠️ 화면상 차례(displayedActiveTeam)는 훅이 gameState 없이 마운트되면 초기값이 'A'다(팀전의 첫 편).
  //    개인전에는 그런 편이 없으므로, 재접속·새로고침으로 들어온 첫 렌더에는 서버가 알려준 차례로 대신한다 —
  //    안 그러면 관전자 화면이 없는 편 'A'의 경험치를 읽다가 터진다(훅이 다음 이펙트에서 값을 맞추기 전 한 번).
  const activeSide = gameState.teams[animState.displayedActiveTeam] ? animState.displayedActiveTeam : gameState.activeTeam;

  // 정산 연출이 끝난 뒤에만 내 조작을 연다(팀전과 같은 기준).
  const isMyChoiceTurn = !animState.isSettling && !observer && gameState.pendingChoice === mySide;
  const isMyDrawTurn =
    !animState.isSettling && !observer && gameState.pendingChoice === null && activeSide === mySide;
  const isMyPlayerTurn =
    !observer && playerId !== null && gameState.memberIds[activeSide]?.[animState.displayedActivePlayerIndex] === playerId;

  // 왼쪽 패널과 체력 칸이 보여주는 편 — 나. 관전자는 지금 차례인 사람을 대신 본다(읽기 전용).
  const focusSide: SideId = mySide ?? activeSide;
  // 기술 카드는 내 것을, 관전자는 지금 고르고 있는(없으면 지금 차례인) 사람의 것을 보여준다.
  const skillPreviewTeam = mySide ?? gameState.pendingChoice ?? activeSide;
  const skillPreviewGameState = withDisplayedExp(
    gameState,
    skillPreviewTeam,
    animState.displayedExp[skillPreviewTeam],
  );
  const noEligible = isMyChoiceTurn && ANIMALS.every(a => previewSkill(skillPreviewGameState, skillPreviewTeam, a).level === 0);

  // 화면에 행동 선택 단계가 실제로 떠 있는 순간(서버는 뽑기 직후 pendingChoice를 세우지만 화면은 정산이 끝나야 뜬다).
  const choiceStageVisible = gameState.pendingChoice !== null && !animState.isSettling;
  const boardTurnGlow = isMyPlayerTurn && !choiceStageVisible;
  const myTeamChoosing = !observer && choiceStageVisible && gameState.pendingChoice === mySide;

  // ─ 특허랑이 상대 선택 ─
  const [picking, setPicking] = useState(false);
  const targets = useMemo(
    () => opponentOrder(gameState, mySide, mySide).filter(s => !isFinished(gameState, s)),
    [gameState, mySide],
  );
  // 차례가 끝났거나(시간초과 등) 내 선택 차례가 아니게 되면 열어 둘 이유가 없다.
  useEffect(() => {
    if (!isMyChoiceTurn) setPicking(false);
  }, [isMyChoiceTurn]);
  // ─ 단축키 — 장소 1~4 · 기술 Q·W·E·R · 턴 마치기 스페이스(감정표현 I·A·S·D·F는 EmotePicker) ─
  // 마우스가 누르는 **그 버튼을 그대로 누른다** — 지금 누를 수 있는지(내 차례·레벨·한 우물·연출 중)를 화면과 따로 판정하면
  // 언젠가 어긋난다. 누를 수 없는 버튼은 disabled라 click()이 먹지 않는다.
  // 멈춤·멈춤 메뉴·특허랑이 대상 고르기 중에는 받지 않는다(메뉴 뒤에서 판이 움직인다 / 대상 화면은 숫자 키를 따로 쓴다).
  useEffect(() => {
    const blocked = () => paused || picking || !!document.querySelector('.pause-dim');
    const onKey = (e: KeyboardEvent) => {
      if (ignoreHotkey(e) || blocked()) return;
      if (e.code in PLACE_KEYS) {
        const tiles = [...document.querySelectorAll<HTMLButtonElement>('.ind-cell-board button[data-place-key]')]
          .map(b => ({ b, r: b.getBoundingClientRect() }))
          // 위→아래(같은 줄로 볼 만큼 가까우면 같은 줄), 그 안에서 왼쪽→오른쪽
          .sort((p, q) => (Math.abs(p.r.top - q.r.top) > 8 ? p.r.top - q.r.top : p.r.left - q.r.left));
        tiles[PLACE_KEYS[e.code]]?.b.click();
        e.preventDefault();
        return;
      }
      const cards = document.querySelectorAll<HTMLButtonElement>('.ind-cards button.skill-choice-panel');
      if (e.code in SKILL_KEYS) {
        cards[SKILL_KEYS[e.code]]?.click();
        e.preventDefault();
        return;
      }
      if (e.code === 'Space') {
        // 스페이스는 늘 막는다 — 안 막으면 화면이 스크롤되거나, 방금 누른 버튼(예: 감정표현)에 포커스가 남아 그 버튼이 또 눌린다.
        e.preventDefault();
        cards[PASS_INDEX]?.click();
      }
    };
    // 버튼의 스페이스 클릭은 keyup에서 일어난다 — 그쪽도 막아야 포커스가 남은 버튼이 눌리지 않는다.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !ignoreHotkey(e) && !blocked()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [paused, picking]);

  const handleChoose = useCallback(
    (animal: Animal) => {
      if (animal === 'tiger') {
        // 1:1 판(시작 인원 2명)은 상대가 하나뿐이라 고를 것이 없다 — 화면을 띄우지 않고 그 사람을 바로 지목한다.
        if (gameState.turnOrder.length === 2 && targets.length === 1) {
          onChooseSkill('tiger', targets[0]);
          return;
        }
        if (targets.length > 0) setPicking(true);
        return;
      }
      onChooseSkill(animal);
    },
    [targets, gameState.turnOrder.length, onChooseSkill],
  );
  const handlePick = useCallback(
    (target: SideId) => {
      setPicking(false);
      onChooseSkill('tiger', target);
    },
    [onChooseSkill],
  );

  // 고를 수 있는 기술이 하나도 없으면 방의 noActionTimeSec 뒤에 "아무것도 하지 않음"이 자동으로 눌린 것처럼
  // 처리한다(팀전과 같은 안전장치 — 멈춰 있는 동안에는 세지 않는다).
  const noActionMs = gameState.settings.noActionTimeSec * 1000;
  useEffect(() => {
    if (!noEligible || paused) return;
    const t = setTimeout(() => onPassSkill(), noActionMs);
    return () => clearTimeout(t);
  }, [noEligible, paused, noActionMs, onPassSkill]);

  // 상대(또는 지금 차례인 사람)의 턴일 때 카드 필드에 그 사람 색으로 은은한 빛(요구 G3).
  // 기준은 화면상 차례(displayedActiveTeam) — 서버의 activeTeam은 연출보다 먼저 넘어간다.
  const glowOn = gameState.phase === 'playing' && !isFinished(gameState, activeSide) && activeSide !== mySide;
  const opponents = opponentOrder(gameState, mySide, mySide);

  // 감정표현은 연출 표정과 같은 풍선 줄에 세운다 — 같은 사람에게 둘이 겹치면 큐처럼 아래로 붙는다.
  // id는 음수로 둬 연출 쪽 순번(양수)과 겹치지 않게 한다(React key).
  const bubbleItems = useMemo<PlayerEmoticon[]>(() => {
    const fromPlayers = emotes.flatMap(e => {
      const item = emoteById(e.emoteId);
      return item ? [{ id: -e.id, team: e.side, playerIndex: 0, src: item.src, emote: true }] : [];
    });
    return fromPlayers.length ? [...animState.emoticons, ...fromPlayers] : animState.emoticons;
  }, [emotes, animState.emoticons]);
  // 감정표현은 판에 앉은 사람만(순위가 정해져 빠진 사람도 — 아직 판을 보고 있다). 처음부터 관전자는 못 쓴다.
  const canEmote = mySide !== null && gameState.phase === 'playing';

  return (
    <div
      className={`h-screen play-bg flex flex-col relative overflow-hidden ${isShaking ? 'shake-combo' : ''}`}
      style={isShaking ? ({ '--shake-scale': shakeScale(animState.screenShakeLevel) } as React.CSSProperties) : undefined}
    >
      <LeafDecoration position="tl" size={64} offsetY={12} />
      <LeafDecoration position="tr" />
      <LeafDecoration position="bl" />
      <LeafDecoration position="br" />

      <IndividualHeader
        gameState={gameState}
        mySide={mySide}
        displayedActiveTeam={activeSide}
        isSettling={animState.isSettling}
      />

      {error && (
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-[60] bg-red-100 border border-red-200 rounded-b-xl text-red-700 text-sm text-center py-1.5 px-4">
          {error}
        </div>
      )}

      <main className="flex-1 min-h-0 relative flex items-center">
        {/* 프레임은 그림이 아니라 CSS다 — 갈색 나무와 크림 베이지(`.play-frame-css`, globals.css).
            칸의 자리는 CSS grid가 정한다. */}
        <div className="play-frame-css">
          <div className="ind-cell ind-cell-me">
            <SelfPanel side={focusSide} mySide={mySide} gameState={gameState} animState={animState} />
            {canEmote && <EmotePicker onSend={onEmote} />}
          </div>

          <div className="ind-cell ind-cell-board">
            <div
              className="ind-board-glow"
              data-on={glowOn || undefined}
              style={{ ['--glow-color' as string]: sideColor(gameState, activeSide) }}
            >
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
          </div>

          <div className="ind-cell ind-cell-opp">
            <OpponentList gameState={gameState} animState={animState} sides={opponents} />
          </div>

          <div className="ind-cell ind-cell-hp">
            <TeamTotalPanel
              team={focusSide}
              gameState={gameState}
              myTeam={mySide ?? focusSide}
              pulse={animState.hpPulse.get(focusSide) ?? null}
            />
          </div>

          <div className="ind-cards">
            <SkillChoiceBar
              gameState={skillPreviewGameState}
              team={skillPreviewTeam}
              interactive={isMyChoiceTurn}
              spectatorGuideTeam={null}
              myTeamChoosing={myTeamChoosing}
              demoAllowed={null}
              hideGuide={picking}
              onChoose={handleChoose}
              onPass={onPassSkill}
            />
          </div>

          <div className="play-prompt-strip">
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
        </div>
      </main>

      <EffectLayer
        leafParticleCount={animState.leafParticleCount}
        floatingTexts={animState.floatingTexts}
        leftSide={mySide ?? undefined}
      />
      <FestivalStartBanner info={animState.festivalStartInfo} />
      <SheepComboLayer combos={animState.sheepCombos} />
      <MainComboBanner combo={animState.mainCombo} />
      <PlayerEmoticonLayer items={bubbleItems} placement="left" />
      <SheepProgressBar
        progress={animState.sheepProgress}
        label={animState.sheepProgress ? sideName(gameState, animState.sheepProgress.team) : undefined}
      />
      <FestivalProgressBar
        progress={animState.festivalProgress}
        label={animState.festivalProgress ? sideName(gameState, animState.festivalProgress.team) : undefined}
      />
      <RabbitFlightLayer flights={animState.rabbitFlights} />
      {animState.tigerImpact && <div className="tiger-vignette" />}
      <TigerClawLayer active={animState.tigerImpact} />
      <IndividualTurnBanner gameState={gameState} activeTeam={activeSide} mySide={mySide} />
      <RankedBanner banner={animState.rankBanner} gameState={gameState} />
      <SettingsHintPopup turn={gameState.turn} />

      {picking && isMyChoiceTurn && (
        <TargetPicker
          gameState={gameState}
          targets={targets}
          lethalTargets={mySide ? finishingMove(skillPreviewGameState, mySide, 'tiger').targets : []}
          turnDeadline={turnDeadline}
          paused={paused}
          onPick={handlePick}
          onCancel={() => setPicking(false)}
        />
      )}
    </div>
  );
}
