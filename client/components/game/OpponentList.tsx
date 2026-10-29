import type { ClientGameState, SideId } from 'shared';
import { ANIMALS, ENHANCE_MAX_LEVEL, expProgressFor } from 'shared';
import type { Animal } from 'shared';
import type { AnimationState } from '@/hooks/useAnimationQueue';
import { finishLabel, sideColor, sideName } from '@/lib/individual';

/**
 * 개인전 오른쪽 열 — 다른 사람 **전원**의 정보(요구 G5).
 *
 * 한 칸을 좌우로 나눈다: 왼쪽은 체력바, 오른쪽은 위에 닉네임, 아래에 동물별 레벨·경험치.
 * 최대 7칸이 한 열에 들어가야 하므로(8명 판) 글자·간격은 전부 액자 폭(--pf-w)에서 뽑는다.
 *
 * ⚠️ **순위가 정해진 사람도 칸을 남긴다**(흐리게, 체력바 자리에 "n위 · 승리/탈락"). 칸이 빠지면 나머지가
 * 밀려 올라가 누가 떨어졌는지 따라가기 어렵다.
 *
 * ⚠️ 경험치·레벨은 `gameState`가 아니라 **연출이 끝난 뒤의 값**(animState.displayedExp)을 쓴다 —
 * gameState를 바로 읽으면 카드가 칸에 도착하기도 전에 숫자가 오른다(CLAUDE.md "애니메이션과 실제
 * 로직의 순서"). 체력은 팀전 체력 구슬(TeamTotalPanel)과 같이 서버 값을 그대로 쓰고 pulse로 반응한다.
 *
 * 연출이 이 칸을 찾아오는 표식: `data-rabbit-target`(토끼떼 목적지) · `data-player-anchor`(이모티콘·
 * 양털 공의 출발점) · `data-team-score-row`(짝이 맞아 날아가는 카드의 목적지, 동물마다).
 */
export function OpponentList({
  gameState,
  animState,
  sides,
}: {
  gameState: ClientGameState;
  animState: AnimationState;
  /** 그릴 편들(위에서 아래 순서) */
  sides: SideId[];
}) {
  return (
    <div className="ind-opp-list">
      {sides.map(side => (
        <OpponentCard key={side} side={side} gameState={gameState} animState={animState} />
      ))}
      {sides.length === 0 && <p className="ind-opp-empty">다른 플레이어가 없어요</p>}
    </div>
  );
}

function OpponentCard({
  side,
  gameState,
  animState,
}: {
  side: SideId;
  gameState: ClientGameState;
  animState: AnimationState;
}) {
  const team = gameState.teams[side];
  const color = sideColor(gameState, side);
  const winHp = gameState.settings.targetScore * 2;
  const hpPct = Math.max(0, Math.min(100, (team.hp / winHp) * 100));
  const finished = finishLabel(gameState, side);
  const isActive = animState.displayedActiveTeam === side && gameState.phase === 'playing' && !finished;
  const pulse = animState.hpPulse.get(side) ?? null;

  const hitShakeClass = animState.tigerSlash?.onTeam === side ? 'panel-hit-shake' : '';
  const recoilClass = animState.tigerRecoil?.attackerTeam === side ? 'panel-recoil-b' : '';
  const rabbitPressureClass = animState.rabbitPressure?.targetTeam === side ? 'panel-rabbit-pressure' : '';

  return (
    <div
      data-rabbit-target={side}
      className={`ind-opp-card ${isActive ? 'ind-opp-card-active' : ''} ${finished ? 'ind-opp-card-finished' : ''} ${hitShakeClass} ${recoilClass} ${rabbitPressureClass}`}
      style={{ ['--opp-color' as string]: color }}
    >
      {/* 왼쪽 — 체력바. 아래가 0, 위가 승리선이다(팀전의 체력 구슬과 같은 눈금). */}
      <div className="ind-opp-hp" title={`체력 ${team.hp} / ${winHp}`}>
        <div className="ind-opp-hp-track">
          <div className="ind-opp-hp-fill" style={{ height: `${hpPct}%` }} />
          {pulse && (
            <div
              key={pulse.id}
              className={pulse.direction === 'gain' ? 'ind-opp-hp-surge' : 'ind-opp-hp-crack'}
            />
          )}
        </div>
        <span className="ind-opp-hp-value tabular-nums">{team.hp}</span>
      </div>

      {/* 오른쪽 — 위: 색 칩 + 닉네임, 아래: 동물별 레벨·경험치 */}
      <div className="ind-opp-main">
        <div className="ind-opp-name-row">
          <span aria-hidden className="ind-opp-chip" style={{ backgroundColor: color }} />
          <span data-player-anchor={`${side}:0`} className="ind-opp-name">
            {isActive && <span className="mr-0.5">▶</span>}
            {sideName(gameState, side)}
          </span>
          {finished && <span className="ind-opp-finish">{finished}</span>}
          {!finished && <StatusMarks gameState={gameState} side={side} />}
        </div>

        <div className="ind-opp-animals">
          {ANIMALS.map(animal => (
            <AnimalMini
              key={animal}
              side={side}
              animal={animal}
              enhance={!!gameState.enhance}
              exp={animState.displayedExp[side]?.[animal] ?? team.exp[animal]}
              multiplier={team.pendingMultiplier}
              extraDraws={team.pendingExtraDraws}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * 개인전 강화 방 — 그 사람에게 걸린 지속 효과(출혈 · 지속 회복 · 효과 감소 ÷N)의 남은 턴. 내 체력 구슬(TeamTotalPanel)의 아이콘과 같은 뜻을
 * 칸이 좁아 글자 배지로 줄였다. 연출 전 값(withDisplayedTeams의 displayedStatus)을 받아 효과보다 먼저 뜨지 않는다.
 */
function StatusMarks({ gameState, side }: { gameState: ClientGameState; side: SideId }) {
  const enh = gameState.enhance;
  if (!enh) return null;
  const bleed = enh.bleed?.[side];
  const regen = enh.regen?.[side];
  const divisor = enh.divisors?.[side] ?? 1;
  const marks: Array<{ key: string; text: string; title: string }> = [];
  if (bleed && bleed.turns > 0) marks.push({ key: 'bleed', text: `🩸${bleed.turns}`, title: `출혈 — 차례를 마칠 때마다 체력 −${bleed.amount} (${bleed.turns}턴 남음)` });
  if (regen && regen.turns > 0) marks.push({ key: 'regen', text: `✚${regen.turns}`, title: `지속 회복 — 차례를 마칠 때마다 체력 +${regen.amount} (${regen.turns}턴 남음)` });
  if (divisor > 1) marks.push({ key: 'divide', text: `÷${divisor}`, title: `효과 감소 — 다음 고른 기술 ÷${divisor}` });
  if (marks.length === 0) return null;
  return (
    <span className="ind-opp-status">
      {marks.map(m => (
        <span key={m.key} className={`ind-opp-status-mark is-${m.key}`} title={m.title}>{m.text}</span>
      ))}
    </span>
  );
}

function AnimalMini({
  side,
  animal,
  enhance,
  exp,
  multiplier,
  extraDraws,
}: {
  side: SideId;
  animal: Animal;
  /** 카드 강화 판 — 레벨이 1부터 Lv.Max(11)까지이고 Max에서도 막대가 다음 별도 배수까지 찬다(expProgressFor) */
  enhance: boolean;
  exp: number;
  multiplier: number;
  extraDraws: number;
}) {
  const { level, inLevel, need, over } = expProgressFor(enhance, animal, exp);
  const threshold = need ?? 1;
  const isMax = enhance && level >= ENHANCE_MAX_LEVEL;
  return (
    <div data-team-score-row={`${side}:${animal}`} className="ind-animal">
      {animal === 'mermaid' && multiplier > 1 && <span className="ind-animal-badge">×{multiplier}</span>}
      {animal === 'sheep' && extraDraws > 0 && <span className="ind-animal-badge">+{extraDraws}</span>}
      <img
        src={`/emoticon/default/${animal}_${level > 0 ? 'happy' : 'focus'}.png`}
        alt={animal}
        className="ind-animal-face"
        draggable={false}
      />
      <span className="ind-animal-lv tabular-nums">{isMax ? `Max${over > 1 ? ` ×${over}` : ''}` : `Lv.${level}`}</span>
      <span className="ind-animal-exp tabular-nums">{inLevel}/{threshold}</span>
      <div className="ind-animal-bar">
        <div style={{ width: `${(inLevel / threshold) * 100}%` }} />
      </div>
    </div>
  );
}
