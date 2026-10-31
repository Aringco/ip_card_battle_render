'use client';

import { useState } from 'react';
import type { ClientGameState, SideId } from 'shared';
import type { AnimationState } from '@/hooks/useAnimationQueue';

/**
 * 모바일 배치의 체력 막대 — 화면 아래에서 가운데(지속 효과 아이콘 묶음 MobileDotHub)를 사이에 두고 왼쪽(나)·오른쪽(상대)으로
 * 화면 끝까지 뻗는다(PC의 체력 구슬 TeamTotalPanel 자리). 두 막대는 같은 길이다(아래 띠가 1fr · auto · 1fr).
 * 닉네임은 이 막대가 아니라 위 띠에 있다(2026-10-31 — 막대 옆에서는 잘 안 보였다).
 *
 * 가득 찬 막대 = 승리선(목표 점수 × 2, 목표점수 달성하기는 그 판의 목표). 시작 체력은 가운데 눈금으로 표시한다.
 * 체력은 화면상 값(withDisplayedHp를 거친 gameState)이라 기술 효과 연출 순간에 움직인다.
 *
 * 연출 표식: 토끼떼가 날아오는 `data-rabbit-target`이 이 막대다(체력이 오르는 곳). 특허랑이에 맞으면 흔들리고, 오르면 초록 빛이 훑는다.
 */
export function MobileHpBar({
  team,
  side,
  gameState,
  animState,
  mine,
  color,
}: {
  team: SideId;
  side: 'left' | 'right';
  gameState: ClientGameState;
  animState: AnimationState;
  mine: boolean;
  /** 개인전 — 그 사람이 대기실에서 고른 색으로 막대를 칠한다(출혈 · 지속 회복의 빛 색은 그대로). 팀전은 비워 둔다 */
  color?: string;
}) {
  const hp = gameState.teams[team].hp;
  const winHp = gameState.scoreRace?.target ?? gameState.settings.targetScore * 2;
  const fillPct = Math.max(0, Math.min(100, (hp / winHp) * 100));
  const startPct = Math.max(0, Math.min(100, ((gameState.scoreRace ? 0 : gameState.settings.targetScore) / winHp) * 100));
  const pulse = animState.hpPulse.get(team) ?? null;
  const dot = animState.dotPulse.get(team) ?? null;

  const hit = animState.tigerSlash?.onTeam === team;
  const recoil = animState.tigerRecoil?.attackerTeam === team;
  const pressure = animState.rabbitPressure?.targetTeam === team;

  // 카드 강화의 그 밖의 상태(효과 감소 · 회복 효율 감소 · 회피) — 걸려 있을 때만 막대 안쪽 끝 위에 작게 띄운다.
  // 출혈 · 지속 회복은 가운데 묶음(MobileDotHub)이 늘 보여 준다.
  const enh = gameState.enhance;
  const divisor = enh?.divisors?.[team] ?? 1;
  const healCut = (enh?.healCut?.[team]?.turns ?? 0) > 0 ? enh!.healCut[team].pct : 0;
  const evade = enh?.evade?.[team] ?? 0;
  const hasExtra = divisor > 1 || healCut > 0 || evade > 0;
  const bleeding = (enh?.bleed?.[team]?.turns ?? 0) > 0;
  const healing = (enh?.regen?.[team]?.turns ?? 0) > 0;
  // 가운데(막대의 안쪽 끝)에서 바깥으로 — 왼쪽 막대는 오른쪽 → 왼쪽, 오른쪽 막대는 왼쪽 → 오른쪽
  const outward = side === 'left' ? 'to-left' : 'to-right';

  // ── 체력이 움직인 순간의 두 겹 막대(2026-10-31 요청) — 흰 막대(.m-hp-ghost)와 색 막대(.m-hp-fill)가 같은 목표 폭으로 가되
  //    **먼저 움직이는 쪽이 방향마다 반대다**(CSS의 transition-delay — data-change):
  //      깎임: 색 막대가 먼저 줄고 → 흰 막대가 남아 깎인 만큼을 보여 주다가 뒤따라 준다(숫자 −N)
  //      오름: 흰 막대가 먼저 늘고 → 색 막대가 뒤따라 그만큼 찬다(숫자 +N)
  //    ⚠️ 방향은 이펙트가 아니라 **렌더 도중**에 정한다 — 이펙트에서 정하면 폭은 이미 새 값으로 커밋된 뒤라 그 첫 프레임에
  //       옛 방향의 지연으로 움직이기 시작한다(오르다 깎이면 순서가 뒤집혀 보인다).
  const [prevHp, setPrevHp] = useState(hp);
  const [change, setChange] = useState<{ id: number; dir: 'up' | 'down'; delta: number } | null>(null);
  if (hp !== prevHp) {
    setPrevHp(hp);
    setChange(c => ({ id: (c?.id ?? 0) + 1, dir: hp > prevHp ? 'up' : 'down', delta: hp - prevHp }));
  }
  // 내 체력이 막대의 20% 아래면 붉게 깜빡인다(가득 찬 막대 = 승리선)
  const low = mine && hp > 0 && fillPct < 20;

  return (
    <div
      className={`m-hp ${hit ? 'panel-hit-shake' : ''} ${recoil ? 'm-hp-recoil' : ''} ${pressure ? 'panel-rabbit-pressure' : ''}`}
      data-side={side}
      data-tone={mine ? 'mine' : 'enemy'}
      data-change={change?.dir}
      data-low={low || undefined}
      data-color={color ? '' : undefined}
      data-rabbit-target={team}
      style={color ? ({ ['--hp-color' as string]: color } as React.CSSProperties) : undefined}
    >
      {/* 오라 — 막대 뒤에서 그 편 색 빛이 가운데에서 바깥으로 번져 나간다(두 막대가 함께 양쪽으로 퍼지는 그림) */}
      <span className="m-hp-aura" aria-hidden />
      {/* 지속 효과의 빛 — 걸려 있는 동안 막대 둘레에 그라데이션 빛이 **막대를 따라 돈다**. 회복은 초록, 출혈은 붉은색, 둘 다면 반반이
          함께 돈다(2026-10-31 요청 — 반씩 고정이던 빛을 회전으로). 한 번 든 순간(dot)에는 같은 색으로 크게 번쩍인다 */}
      {(healing || bleeding) && (
        <span className="m-hp-dotglow" data-regen={healing || undefined} data-bleed={bleeding || undefined} aria-hidden />
      )}
      {dot && <span key={`d${dot.id}`} className={`m-hp-dotflash is-${dot.kind}`} aria-hidden />}
      <div className="m-hp-track">
        {/* 흰 막대 — 색 막대 뒤에 깔려, 깎일 때는 깎인 몫이 · 오를 때는 오를 몫이 먼저 하얗게 드러난다 */}
        <div className="m-hp-ghost" style={{ width: `${fillPct}%` }} />
        <div className="m-hp-fill" style={{ width: `${fillPct}%` }}>
          {/* 홀로그램 — 무지갯빛 띠가 채움 위를 가운데에서 바깥으로 흐른다 */}
          <span className="m-hp-holo" aria-hidden />
        </div>
        {startPct > 0 && startPct < 100 && <span className="m-hp-start" style={{ [side === 'left' ? 'right' : 'left']: `${startPct}%` }} aria-hidden />}
        {/* 체력이 움직인 순간 — 오르면 초록 빛이 가운데에서 바깥으로 훑고, 깎이면 붉게 번쩍인다 */}
        {pulse && <span key={pulse.id} className={`m-hp-pulse is-${pulse.direction} ${outward}`} aria-hidden />}
        <span className="m-hp-value tabular-nums">{hp}</span>
        {/* 얼마나 움직였나 — −N(깎임) · +N(오름). 바뀔 때마다 처음부터 다시 떠오른다 */}
        {change && change.delta !== 0 && (
          <span key={change.id} className={`m-hp-delta is-${change.dir} tabular-nums`} aria-hidden>
            {change.delta > 0 ? `+${change.delta}` : `−${-change.delta}`}
          </span>
        )}
      </div>
      {hasExtra && (
        <span className="m-hp-extra">
          {divisor > 1 && (
            <span className="hp-status hp-status-divide" title={`효과 감소 ÷${divisor}`}>
              <span className="hp-status-icon" aria-hidden>÷{divisor}</span>
            </span>
          )}
          {healCut > 0 && (
            <span className="hp-status hp-status-healcut" title={`회복 효율 −${healCut}%`}>
              <span className="hp-status-icon" aria-hidden />
              <b className="tabular-nums">{healCut >= 100 ? '✕' : `-${healCut}%`}</b>
            </span>
          )}
          {evade > 0 && (
            <span className="hp-status hp-status-evade" title={`기술 회피 ${evade}%`}>
              <span className="hp-status-icon" aria-hidden />
              <b className="tabular-nums">{evade}%</b>
            </span>
          )}
        </span>
      )}
    </div>
  );
}

/**
 * 두 체력 막대 사이(아래 띠 한가운데)의 지속 효과 아이콘 — 왼쪽 둘은 나, 오른쪽 둘은 상대(거울 배치: 출혈 · 회복 | 회복 · 출혈).
 * 늘 그 자리에 있고, 걸려 있지 않으면 회색으로 꺼져 있다. 걸리면 그 아이콘에 색이 켜지고 가운데에 남은 턴 수가 뜬다.
 * 출혈 · 지속 회복은 카드 강화 판에만 있는 효과라 일반 판에서는 그리지 않는다(MobileLayout이 고른다).
 * 값은 화면상 값(displayedStatus — 효과 연출 순간에 켜진다)이다.
 */
export function MobileDotHub({ gameState, left, right }: { gameState: ClientGameState; left: SideId; right: SideId }) {
  const enh = gameState.enhance;
  const icon = (team: SideId, kind: 'bleed' | 'regen') => {
    const dot = kind === 'bleed' ? enh?.bleed?.[team] : enh?.regen?.[team];
    const on = (dot?.turns ?? 0) > 0;
    const name = kind === 'bleed' ? '출혈' : '지속 회복';
    return (
      <span
        key={`${team}-${kind}`}
        className={`hp-status hp-status-${kind} m-dot`}
        data-off={on ? undefined : ''}
        title={on ? `${name} ${kind === 'bleed' ? '−' : '+'}${dot!.amount} (${dot!.turns}턴 남음)` : `${name} 없음`}
      >
        <span className="hp-status-icon" aria-hidden />
        {on && <b className="tabular-nums">{dot!.turns}</b>}
      </span>
    );
  };
  return (
    <div className="m-dot-hub">
      <span className="m-dot-pair" data-tone="mine">
        {icon(left, 'bleed')}
        {icon(left, 'regen')}
      </span>
      <span className="m-dot-pair" data-tone="enemy">
        {icon(right, 'regen')}
        {icon(right, 'bleed')}
      </span>
    </div>
  );
}
