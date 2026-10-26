'use client';

import { useEffect, useState } from 'react';
import { SCORE_RACE_TARGET_MAX, SCORE_RACE_TARGET_MIN } from 'shared';
import { playRouletteLand, playRouletteTick } from '@/lib/synthSfx';

/**
 * 목표점수 달성하기의 시작 룰렛 — 화면을 어둡게 덮고(판은 멈춰 있다) 가운데에서 숫자를 돌리다 목표 점수에 멈춘다.
 *
 * - **판을 멈추는 쪽은 서버다.** 방이 첫 턴 타이머를 룰렛 길이만큼 늦게 걸고 그 사이의 클릭을 거부한다
 *   (Room.introGraceMs · rejectIfIntro). 이 막은 그동안 화면 조작을 가릴 뿐이다.
 * - **룰렛은 연출이다.** 목표는 이미 첫 스냅샷에 실려 왔고(gameState.scoreRace.target), 여기서는 그 숫자에서 멈출 뿐이다.
 * - 끝나는 시각(`until`)은 서버가 보낸 남은 ms를 받은 순간 환산한 값이다(useWebSocket의 eventIntroUntil). 재접속으로
 *   중간에 들어오면 남은 시간만큼만 돌고, 다 지난 뒤면 이 막 자체가 뜨지 않는다.
 * - 판 위에 fixed로 덮는다 — 액자 배치(measurePlay)에 끼어들지 않는다.
 * - **소리**(2026-10-27): 숫자가 바뀔 때마다 '틱', 멈추면 '딩동'(lib/synthSfx — 파일 없이 합성). 효과음 설정을 따른다.
 * - 도는 숫자는 이 판의 목표를 뽑은 범위(개발자가 정한다 — EventInfo.targetRange) 안에서 고른다. 범위 밖 숫자가 돌면
 *   "이번엔 30점이 나올 수도 있나?" 하는 오해를 준다.
 */
const HOLD_MS = 1500;   // 목표에 멈춘 뒤 보여 주는 시간
const LEAVE_MS = 300;   // 걷히는 시간(끝 시각 직전에 시작)
const FIRST_TICK_MS = 55;
const LAST_TICK_MS = 340;

interface Range { min: number; max: number }
const DEFAULT_RANGE: Range = { min: SCORE_RACE_TARGET_MIN, max: SCORE_RACE_TARGET_MAX };

/** 범위 안에서 바로 앞 숫자와 다른 숫자 하나 — 범위가 한 숫자뿐이면 그 숫자(무한 반복 방지) */
function randomOther(prev: number, range: Range): number {
  const span = range.max - range.min + 1;
  if (span <= 1) return range.min;
  let n = prev;
  while (n === prev) n = range.min + Math.floor(Math.random() * span);
  return n;
}

/** 돌 시간(ms) 안에 들어가는 눈금 간격들 — 처음엔 빠르게, 끝으로 갈수록 느려진다(ease-out). */
function tickDelays(spinMs: number): number[] {
  const delays: number[] = [];
  let sum = 0;
  for (let i = 0; ; i++) {
    const t = Math.min(1, sum / Math.max(1, spinMs));
    const d = FIRST_TICK_MS + (LAST_TICK_MS - FIRST_TICK_MS) * t * t;
    if (sum + d > spinMs) break;
    delays.push(d);
    sum += d;
    if (i > 200) break;
  }
  return delays;
}

export function ScoreRaceIntro({
  target,
  until,
  maxTurn,
  range = DEFAULT_RANGE,
}: {
  target: number;
  until: number;
  maxTurn: number;
  /** 목표를 뽑은 범위 — 숫자가 이 안에서 돈다 */
  range?: Range;
}) {
  const [value, setValue] = useState(() => randomOther(target, range));
  const [tick, setTick] = useState(0);
  const [landed, setLanded] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const left = until - Date.now();
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const land = (withSound: boolean) => {
      setValue(target);
      setTick(n => n + 1);
      setLanded(true);
      if (withSound) playRouletteLand();
    };
    const spinMs = reduce ? 0 : left - HOLD_MS;
    if (spinMs <= 0) {
      // 재접속으로 다 돈 뒤에 들어왔거나 움직임 줄이기 — 숫자만 놓는다. 이미 멈춘 화면에 '딩동'은 어색하다(움직임 줄이기는 울린다).
      land(reduce && left > HOLD_MS);
    } else {
      let at = 0;
      let prev = value;
      for (const d of tickDelays(spinMs)) {
        at += d;
        const next = randomOther(prev, range);
        prev = next;
        const progress = at / spinMs;
        timers.push(setTimeout(() => { setValue(next); setTick(n => n + 1); playRouletteTick(progress); }, at));
      }
      timers.push(setTimeout(() => land(true), spinMs));
    }
    timers.push(setTimeout(() => setLeaving(true), Math.max(0, left - LEAVE_MS)));
    return () => timers.forEach(clearTimeout);
    // 한 번만 돈다 — until·target은 판 하나 동안 바뀌지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="race-intro"
      data-leaving={leaving || undefined}
      role="dialog"
      aria-modal="true"
      aria-label="목표 점수 정하기"
    >
      <div className="race-intro-panel" data-landed={landed || undefined}>
        <p className="race-intro-title">🎯 이번 판의 목표 점수</p>
        <div className="race-intro-reel" aria-live="assertive">
          <span key={tick} className="race-intro-num tabular-nums">{value}</span>
          <span className="race-intro-unit">점</span>
        </div>
        <p className="race-intro-sub">
          {landed ? `${maxTurn}턴이 끝날 때 ${target}점 이상이면 승리!` : '두구두구…'}
        </p>
      </div>
    </div>
  );
}
