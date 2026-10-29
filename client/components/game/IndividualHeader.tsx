import type { ClientGameState, SideId } from 'shared';
import { festivalDrawInfoAt, maxTurnOf } from 'shared';
import { PLAY_ASSETS } from '@/lib/playAssets';
import { sideColor, sideName } from '@/lib/individual';

/**
 * 개인전 상단 들보 — 팀전 GameHeader와 같은 그림·클래스를 쓰되 **"우리팀/상대팀" 대신 사람 이름**을 말한다.
 * (GameHeader를 그대로 쓰지 않는 이유: 그쪽은 관전 시점에 팀 팔레트(A·B 두 가지)를 읽는데 개인전의
 *  편은 'p1'…이라 그 팔레트에 없다 — 주의 8.)
 */

/** 팻말 글자가 길면 글자 수에 반비례해 줄인다 — GameHeader.nameFit과 같은 이유·같은 기준. */
function nameFit(text: string, fitChars: number): React.CSSProperties {
  const len = Math.max(1, [...text].length);
  return { ['--name-fit' as string]: Math.min(1, fitChars / len) };
}
const TEAM_FIT_CHARS = 7;
const TURN_FIT_CHARS = 9;

function StepPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`play-pill ${active ? 'play-pill-gold' : 'play-pill-wood'} font-bold whitespace-nowrap`}>
      {label}
    </span>
  );
}

function FlowArrow() {
  return (
    <span className="flex items-center" aria-hidden="true">
      {[0, 1, 2].map(i => (
        <span key={i} className="step-chevron" style={{ animationDelay: `${i * 0.18}s` }}>
          &gt;
        </span>
      ))}
    </span>
  );
}

export function IndividualHeader({
  gameState,
  mySide,
  displayedActiveTeam,
  isSettling,
}: {
  gameState: ClientGameState;
  /** 내 편 — 관전자·순위가 정해진 사람이어도 값은 있다(null은 처음부터 관전자) */
  mySide: SideId | null;
  displayedActiveTeam: SideId;
  isSettling: boolean;
}) {
  const nickname = sideName(gameState, displayedActiveTeam);
  const turnLine = `${nickname} 차례`;
  const color = sideColor(gameState, displayedActiveTeam);
  const isMyTurn = mySide !== null && displayedActiveTeam === mySide;

  const isDrawPhase = gameState.pendingChoice === null;
  const isChoicePhase = !isDrawPhase && !isSettling;
  const festivalInfo = festivalDrawInfoAt(gameState.turn, gameState.settings, maxTurnOf(gameState));

  return (
    <header className="play-beam relative text-white shrink-0">
      <div className="play-nameplate hidden sm:flex text-center">
        <span
          className="play-nameplate-team font-black"
          style={{ color: `color-mix(in srgb, ${color} 72%, #2b1a0a)`, ...nameFit(nickname, TEAM_FIT_CHARS) }}
        >
          {nickname}
        </span>
        <span className="play-nameplate-turn font-bold" style={nameFit(turnLine, TURN_FIT_CHARS)}>
          {turnLine}
        </span>
      </div>

      <div className="play-hdr-group absolute -translate-x-1/2 -translate-y-1/2 flex items-center">
        <div className="play-step-bar flex items-center gap-1.5 py-1">
          <span className="play-turn-inner font-bold tabular-nums whitespace-nowrap">
            {/* 턴 제한이 없는 판(개인전 강화 방 — maxTurnOf가 Infinity)은 지금 턴만 쓴다(팀전 GameHeader와 같다) */}
            {Number.isFinite(maxTurnOf(gameState)) ? `${gameState.turn} / ${maxTurnOf(gameState)}턴` : `${gameState.turn}턴`}
          </span>
          <span className={`play-pill ${isMyTurn ? 'play-pill-green' : 'play-pill-red'} font-bold whitespace-nowrap`}>
            {isMyTurn ? '내 차례' : mySide === null ? '관전 중' : '다른 사람 차례'}
          </span>
          <StepPill label="장소 선택" active={isDrawPhase} />
          <FlowArrow />
          <StepPill label="행동 선택" active={isChoicePhase} />
        </div>
        {gameState.festival && (
          <span className="festival-running font-bold whitespace-nowrap">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={PLAY_ASSETS.iconAcorn} alt="" className="festival-running-icon" />
            <span className="festival-header-badge">도토리 축제! 랜덤 뽑기 +{festivalInfo.count}회</span>
            {festivalInfo.turnsToNextStage !== null && (
              <span className="festival-next-badge inline-flex items-baseline gap-1 rounded-full border border-amber-300/70 bg-amber-900 font-bold text-amber-100 opacity-50 align-middle">
                <span className="tabular-nums">{festivalInfo.turnsToNextStage}턴 후</span>
                <span className="tabular-nums">
                  +{festivalInfo.count} → +{festivalInfo.nextCount}
                </span>
              </span>
            )}
          </span>
        )}
      </div>
    </header>
  );
}
