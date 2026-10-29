'use client';

import { useEffect, useState } from 'react';
import type { ClientGameState, SideId } from 'shared';
import { LeafDecoration } from '@/components/ui/LeafDecoration';
import { spectatorTeamVars } from '@/lib/teamColors';

/**
 * 눈금 간격 — 구슬이 가득 차는 값(winHp)이 작으면 1점마다, 커지면 선이 빽빽해져 읽히지 않으므로 넓힌다(모든 판 공통):
 * 20 이상 5점 · 50 이상 10점 · 100 이상 20점(2026-10-28) · 1000 이상 100점 · **5000 이상 500점**(2026-10-29) ·
 * 10000부터는 자릿수가 하나 늘 때마다 간격도 한 자리(1000점 …). 카드 강화 기본 400은 20점마다 19줄, 목표 상한 2500(승리선 5000)은 500점마다 9줄.
 */
// 카드 강화의 지속 효과 파티클 — 조각마다 자리·지연·길이를 정해 둔다(렌더마다 무작위면 매번 다른 모양으로 튄다).
// 출혈은 위에서 아래로 흘러내리는 핏방울, 지속 회복은 아래에서 위로 떠오르는 초록 십자가.
const BLEED_DROPS = [12, 31, 48, 66, 84].map((left, i) => ({ left, delay: i * 0.55 + (i % 2) * 0.3, dur: 2.1 + (i % 3) * 0.45 }));
const HEAL_CROSSES = [16, 36, 55, 74, 88].map((left, i) => ({ left, delay: i * 0.5 + (i % 2) * 0.25, dur: 2.3 + (i % 3) * 0.4 }));
// 한 번 든 순간(dotPulse)의 크게 터지는 조각 — 가운데에서 퍼진다(출혈은 아래로, 회복은 위로 치우친다)
const DOT_BURST = Array.from({ length: 10 }, (_, i) => {
  const angle = (i / 10) * Math.PI * 2;
  return { dx: Math.cos(angle) * 42, dy: Math.sin(angle) * 34, delay: (i % 3) * 50 };
});

function segmentStepOf(winHp: number): number {
  if (winHp >= 10000) return 10 ** (String(Math.floor(winHp)).length - 2);
  if (winHp >= 5000) return 500;
  if (winHp >= 1000) return 100;
  return winHp >= 100 ? 20 : winHp >= 50 ? 10 : winHp >= 20 ? 5 : 1;
}

// 팀 체력(=점수) — 아래가 0, 위가 WIN_HP인 유리구슬. 중간(시작값)부터 차오르거나
// 줄어든다. 상표토끼로 오르면 연두색 기운이 샤라락 훑고, 특허랑이에게 뺏기면
// 붉은 기운이 빠직! 하고 금 가며 구슬이 흔들리고 파편이 튄다.
export function TeamTotalPanel({
  team,
  gameState,
  myTeam,
  pulse,
  dotPulse = null,
}: {
  team: SideId;
  gameState: ClientGameState;
  // 보는 사람의 팀 — null이면 관전 시점이라 "내 구슬/상대 구슬"이 아니라 두 구슬을
  // 각 팀 색(client/lib/teamColors.ts의 팔레트)으로 칠한다.
  myTeam: SideId | null;
  pulse?: { id: number; direction: 'gain' | 'loss' } | null;
  // 카드 강화 — 출혈·지속 회복이 방금 한 번 들었다(useAnimationQueue의 dotPulse)
  dotPulse?: { id: number; kind: 'bleed' | 'regen' } | null;
}) {
  const hp = gameState.teams[team].hp;
  // 구슬이 가득 차는 점수 — 평소엔 승리선(targetScore × 2), 목표점수 달성하기는 그 판의 목표 점수(가득 차면 달성).
  const winHp = gameState.scoreRace?.target ?? gameState.settings.targetScore * 2;
  const spectating = myTeam === null;
  const toneClass = spectating ? 'hp-orb-spectator' : myTeam === team ? 'hp-orb-mine' : 'hp-orb-enemy';
  const fillPct = Math.max(0, Math.min(100, (hp / winHp) * 100));
  // 카드 강화의 지속 효과 — gameState는 화면상 값(withDisplayedTeams)이라 연출 순간에 나타나고 줄어든다
  const enh = gameState.enhance;
  const bleed = enh?.bleed?.[team];
  const regen = enh?.regen?.[team];
  const bleeding = (bleed?.turns ?? 0) > 0;
  const healing = (regen?.turns ?? 0) > 0;
  const divisor = enh?.divisors?.[team] ?? 1;
  const divisorTurns = enh?.divisorTurns?.[team] ?? 0;

  const [activePulse, setActivePulse] = useState<{ id: number; direction: 'gain' | 'loss' } | null>(null);
  const [shards, setShards] = useState<{ dx: number; dy: number }[]>([]);

  useEffect(() => {
    if (!pulse) {
      // 부모(useAnimationQueue)가 이 팀의 pulse를 먼저 정리해버리면(다음 액션이 예상보다
      // 빨리 도착하는 등) 여기서도 즉시 걷어내야 한다 — 그렇지 않으면 아래 700ms 타이머가
      // 이미 취소된 채로 activePulse가 영원히 남아 붉은 금(hp-orb-crack)이 계속 보인다.
      setActivePulse(null);
      setShards([]);
      return;
    }
    setActivePulse(pulse);
    if (pulse.direction === 'loss') {
      setShards(
        Array.from({ length: 6 }, () => {
          const angle = Math.random() * Math.PI * 2;
          const dist = 40 + Math.random() * 30;
          return { dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist };
        }),
      );
    }
    const t = setTimeout(() => {
      setActivePulse(prev => (prev?.id === pulse.id ? null : prev));
      setShards([]);
    }, 700);
    return () => clearTimeout(t);
  }, [pulse]);

  // 눈금선 — 지금 몇 칸째인지 한눈에 보이도록 반투명한 선을 긋는다(간격은 segmentStepOf).
  const segmentStep = segmentStepOf(winHp);
  const segmentLines = Array.from({ length: Math.ceil(winHp / segmentStep) - 1 }, (_, i) => (((i + 1) * segmentStep) / winHp) * 100);

  return (
    <div
      className={`hp-orb w-full shrink-0 h-full ${toneClass} ${bleeding ? 'hp-orb-bleeding' : ''} ${healing ? 'hp-orb-healing' : ''}`}
      style={spectating ? spectatorTeamVars(team) : undefined}
    >
      <LeafDecoration position="tl" size={30} swaying={activePulse !== null} />
      <LeafDecoration position="br" size={30} swaying={activePulse !== null} />
      <div className="hp-orb-liquid" style={{ height: `${fillPct}%` }}>
        <div className="hp-orb-wave" />
        {/* 액체 색의 밝은 기운이 천천히 피어오른다(globals.css .hp-orb-rise — 채워진 만큼만 보인다) */}
        <div className="hp-orb-rise" aria-hidden />
      </div>
      <div className="hp-orb-segments" aria-hidden>
        {segmentLines.map(pct => (
          <span key={pct} className="hp-orb-segment-line" style={{ bottom: `${pct}%` }} />
        ))}
      </div>
      <div className="hp-orb-sheen" />
      {activePulse?.direction === 'gain' && <div className="hp-orb-surge" />}
      {activePulse?.direction === 'loss' && (
        <>
          <div className="hp-orb-crack" />
          {shards.map((s, i) => (
            <span key={i} className="hp-orb-shard" style={{ '--shard-dx': `${s.dx}px`, '--shard-dy': `${s.dy}px` } as React.CSSProperties} />
          ))}
        </>
      )}
      {/* 지속 효과의 빨간·초록 그림자(globals.css .hp-orb-dot-glow) */}
      {(bleeding || healing) && <div className="hp-orb-dot-glow" aria-hidden />}
      {/* 출혈 — 핏방울이 위에서 흘러내린다 · 지속 회복 — 초록 십자가가 떠오른다(globals.css .hp-orb-bleed / .hp-orb-heal) */}
      {bleeding && (
        <div className="hp-orb-bleed" aria-hidden>
          {BLEED_DROPS.map((d, i) => (
            <span key={i} className="hp-orb-drop" style={{ left: `${d.left}%`, animationDelay: `${d.delay}s`, animationDuration: `${d.dur}s` }} />
          ))}
        </div>
      )}
      {healing && (
        <div className="hp-orb-heal" aria-hidden>
          {HEAL_CROSSES.map((c, i) => (
            <span key={i} className="hp-orb-cross" style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, animationDuration: `${c.dur}s` }} />
          ))}
        </div>
      )}
      {dotPulse && (
        <div key={dotPulse.id} className={`hp-orb-dot-burst is-${dotPulse.kind}`} aria-hidden>
          {DOT_BURST.map((p, i) => (
            <span
              key={i}
              className={dotPulse.kind === 'bleed' ? 'hp-orb-drop' : 'hp-orb-cross'}
              style={{ '--bx': `${p.dx}px`, '--by': `${p.dy}px`, animationDelay: `${p.delay}ms` } as React.CSSProperties}
            />
          ))}
        </div>
      )}
      <p className="hp-orb-value tabular-nums">{hp}</p>
      {/* 남은 턴 — 핏방울(출혈) · 초록 십자가(지속 회복) 아이콘 안에 숫자. 상대 디자인어의 효과 감소(÷N)도 함께 둔다 */}
      {(bleeding || healing || divisor > 1) && (
        <div className="hp-orb-status">
          {bleeding && (
            <span className="hp-status hp-status-bleed" title={`출혈 — 차례가 시작될 때마다 체력 −${bleed!.amount} (${bleed!.turns}턴 남음)`}>
              <span className="hp-status-icon" aria-hidden />
              <b className="tabular-nums">{bleed!.turns}</b>
            </span>
          )}
          {healing && (
            <span className="hp-status hp-status-regen" title={`지속 회복 — 차례가 시작될 때마다 체력 +${regen!.amount} (${regen!.turns}턴 남음)`}>
              <span className="hp-status-icon" aria-hidden />
              <b className="tabular-nums">{regen!.turns}</b>
            </span>
          )}
          {divisor > 1 && (
            <span className="hp-status hp-status-divide" title={`효과 감소 — 다음 고른 기술 ÷${divisor}${divisorTurns > 0 ? ` (${divisorTurns}턴 남음)` : ''}`}>
              <span className="hp-status-icon" aria-hidden>÷{divisor}</span>
              {divisorTurns > 0 && <b className="tabular-nums">{divisorTurns}</b>}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
