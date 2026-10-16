import type { ClientGameState, SideId } from 'shared';
import type { AnimationState } from '@/hooks/useAnimationQueue';
import { withDisplayedExp } from '@/lib/skills';
import { finishLabel, sideColor, sideName } from '@/lib/individual';
import { LeafDecoration } from '@/components/ui/LeafDecoration';
import { ScorePanel } from './ScorePanel';

/**
 * 개인전 왼쪽 패널 — **내** 동물별 레벨·경험치(요구 G4: 왼쪽은 자신의 정보 유지).
 *
 * 팀전의 TeamPanel을 본떴지만 색 체계가 다르다 — 팀전은 "우리 연두 / 상대 붉은"이고, 개인전은 **사람마다
 * 고른 색**이다(INDIVIDUAL_MODE_ROADMAP.md 주의 8). 그래서 TeamPanel을 그대로 쓰지 않고 따로 둔다.
 *
 * 관전자(mySide === null)에게는 지금 차례인 사람의 패널이 대신 보인다(읽기 전용).
 */
export function SelfPanel({
  side,
  mySide,
  gameState,
  animState,
}: {
  /** 이 패널이 보여주는 편 — 보통 mySide, 관전자는 지금 차례인 편 */
  side: SideId;
  mySide: SideId | null;
  gameState: ClientGameState;
  animState: AnimationState;
}) {
  const color = sideColor(gameState, side);
  const isMine = mySide === side;
  const isActive = animState.displayedActiveTeam === side && gameState.phase === 'playing';
  const finished = finishLabel(gameState, side);

  // 타이거·토끼 연출 — 공격한 쪽은 반동, 맞는 쪽은 충격. (왼쪽 패널이라 반동 방향은 팀전 A와 같다)
  const recoilClass = animState.tigerRecoil?.attackerTeam === side ? 'panel-recoil-a' : '';
  const hitShakeClass = animState.tigerSlash?.onTeam === side ? 'panel-hit-shake' : '';
  const rabbitPressureClass = animState.rabbitPressure?.targetTeam === side ? 'panel-rabbit-pressure' : '';
  const justActed = animState.captions.some(c => c.tier === 'effect' && c.team === side);

  return (
    <div
      data-rabbit-target={side}
      className={`play-panel-body min-h-0 ${isActive ? 'play-panel-turn' : ''} ${recoilClass} ${hitShakeClass} ${rabbitPressureClass} transition-shadow ${
        finished ? 'ind-finished' : ''
      }`}
      style={{
        // 지금 차례 표시(.play-panel-turn)가 읽는 색 — 사람마다 다르다
        ['--turn-ring' as string]: color,
        ['--turn-glow' as string]: `color-mix(in srgb, ${color} 38%, transparent)`,
        ['--panel-tint' as string]: `color-mix(in srgb, ${color} 16%, transparent)`,
      }}
    >
      <LeafDecoration position="tr" size={40} swaying={justActed} />
      <LeafDecoration position="bl" size={32} swaying={justActed} />

      <div className="play-team-scroll relative z-[1] h-full min-h-0 flex flex-col gap-1.5 overflow-y-auto p-2">
        <div className="flex items-center gap-1.5 flex-wrap text-base font-bold text-jungle-900">
          {/* 사람을 구분하는 단서는 색만이 아니다 — 색 칩 옆에 언제나 닉네임이 있다. */}
          <span
            aria-hidden
            className="inline-block w-4 h-4 rounded-sm border border-black/30 shrink-0"
            style={{ backgroundColor: color }}
          />
          <span data-player-anchor={`${side}:0`} className="truncate min-w-0">
            {isActive && <span className="mr-1">▶</span>}
            {sideName(gameState, side)}
          </span>
          {isMine ? (
            <span className="inline-flex items-center gap-1 bg-white/80 text-amber-600 text-2xs font-bold px-2 py-0.5 rounded-full shadow-sm border border-amber-200">
              <span aria-hidden>⭐</span> 나
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 bg-white/80 text-jungle-600 text-2xs font-bold px-2 py-0.5 rounded-full shadow-sm border border-jungle-200">
              <span aria-hidden>👀</span> 보는 중
            </span>
          )}
        </div>
        {finished && <p className="text-xs font-bold text-board-muted">{finished}</p>}

        <hr className="border-jungle-100" />

        <ScorePanel
          team={side}
          gameState={withDisplayedExp(gameState, side, animState.displayedExp[side])}
          scoreFlash={animState.scoreFlash}
          displayedExp={animState.displayedExp[side]}
        />
      </div>
    </div>
  );
}
