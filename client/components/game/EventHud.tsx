'use client';

import { useEffect, useRef, useState } from 'react';
import type { Animal, ClientGameState, SideId } from 'shared';
import { EVENT_LABELS, oneWellBaseMultiplier } from 'shared';
import { ANIMAL_INFO } from '@/lib/animals';

/**
 * 이벤트 판의 머리표(EVENT_MODE_ROADMAP.md §2.3) — 어떤 도전인지 · 목표점수 달성하기의 목표와 남은 턴 · 한 우물만 파기의 잠금.
 *
 * ⚠️ **액자 배치에 끼어들지 않는다.** 판 위에 fixed로 띄우는 오버레이다 — 상단 바(GameHeader)나 칸(.play-cell-*)에
 *    넣으면 measurePlay.mjs가 지키는 팀전 배치가 움직인다.
 * ⚠️ 목표점수 달성하기의 **지금 점수는 여기 쓰지 않는다** — gameState의 체력은 연출보다 먼저 도착한 서버 진실이라,
 *    여기서 그리면 카드가 날아가기도 전에 점수가 오른다. 점수는 연출을 따라가는 체력 칸(TeamTotalPanel)이 보여 준다.
 */
const KIND_ICON = { beatDev: '👨‍💻', timeAttack: '🎯', oneWell: '🪣' } as const;

export function EventHud({
  gameState,
  myTeam,
  paused,
  intro = false,
}: {
  gameState: ClientGameState;
  myTeam: SideId | null;
  paused: boolean;
  /** 목표점수 달성하기의 시작 룰렛이 도는 중 — 목표 숫자를 가린다(룰렛의 답을 미리 보여 주지 않게) */
  intro?: boolean;
}) {
  const ev = gameState.event!;

  // 한 우물만 파기 — 카드가 고정되는 순간 한 번 크게 알린다(처음 마운트·재접속 때는 띄우지 않는다).
  const locked = gameState.oneWell?.locked ?? null;
  const prevLocked = useRef<Animal | null | undefined>(undefined);
  const [lockToast, setLockToast] = useState<Animal | null>(null);
  useEffect(() => {
    const prev = prevLocked.current;
    prevLocked.current = locked;
    if (prev === undefined || prev === locked || locked === null) return;
    setLockToast(locked);
    const t = setTimeout(() => setLockToast(null), 2600);
    return () => clearTimeout(t);
  }, [locked]);

  // 목표점수 달성하기 — 남은 턴은 "지금 턴을 포함해" 센다(마지막 턴이면 1).
  const race = gameState.scoreRace ?? null;
  const turnsLeft = race ? Math.max(0, race.maxTurn - gameState.turn + 1) : null;
  const playing = gameState.phase === 'playing';
  const urgent = turnsLeft !== null && turnsLeft <= 2 && playing;

  const title = race ? `목표 ${intro ? '?' : race.target}점 달성하기` : EVENT_LABELS[ev.kind];

  // 한 우물 — 지금 쓸 수 있는 카드(도전자 시점의 안내. 개발자·관전은 이 도전에 없다)
  const wellMult = (a: Animal) => oneWellBaseMultiplier(gameState.oneWell, a);
  const wellTag = (a: Animal) => (wellMult(a) > 1 ? `×${wellMult(a)}` : '');
  const wellX = (a: Animal) => (wellMult(a) > 1 ? ` · 위력 ×${wellMult(a)}` : '');
  const wellText = gameState.oneWell
    ? locked
      ? `${ANIMAL_INFO[locked].emoji} ${ANIMAL_INFO[locked].name}만 쓸 수 있어요${wellX(locked)}`
      // 카드마다 기본 배율(그 판에 실린 값 — 기본 상표토끼 2 · 특허랑이 3) — 고르기 전에 알 수 있게 옆에 적는다
      : `${gameState.oneWell.allowed.map(a => `${ANIMAL_INFO[a].emoji}${wellTag(a)}`).join(' · ')} 중 처음 쓴 카드만`
    : null;

  const sub = ev.kind === 'beatDev'
    ? (myTeam === 'B' ? `도전자 ${ev.challengerName}` : `vs 개발자 ${ev.developerName ?? ''}`)
    : race
      ? intro ? '목표 점수를 정하는 중…' : `${race.maxTurn}턴이 끝날 때 ${race.target}점 이상이면 승리`
      : wellText;

  return (
    <>
      <div className="event-hud" role="status" aria-live="polite" data-urgent={urgent || undefined}>
        <span className="event-hud-title">
          <span aria-hidden>{KIND_ICON[ev.kind]}</span> {title}
        </span>
        {turnsLeft !== null && playing && (
          <span className="event-hud-clock tabular-nums" title="남은 턴(지금 턴 포함)">
            {paused ? '⏸ ' : ''}{turnsLeft === 1 ? '마지막 턴!' : `남은 ${turnsLeft}턴`}
          </span>
        )}
        {sub && <span className="event-hud-sub">{sub}</span>}
      </div>
      {lockToast && (
        <div className="event-lock-toast" role="status">
          이제부터 {ANIMAL_INFO[lockToast].emoji} {ANIMAL_INFO[lockToast].name}만!
        </div>
      )}
    </>
  );
}
