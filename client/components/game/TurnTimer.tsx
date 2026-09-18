'use client';

import { useState, useEffect } from 'react';

export function TurnTimer({
  deadline,
  paused,
  totalMs,
}: {
  deadline: number; // 내 브라우저 시계(Date.now()) 기준 만료 시각 — useWebSocket이 환산해 넘겨준다
  paused: boolean;
  totalMs: number; // 게이지 100%에 해당하는 시간(ms) — 서버가 알려주는 "이번 턴에 실제로 주어진 시간"
}) {
  const maxSeconds = Math.max(1, totalMs / 1000);
  const [remaining, setRemaining] = useState(maxSeconds);

  useEffect(() => {
    // 정산 애니메이션이 재생 중일 때는 실제 서버 타이머는 계속 흐르지만, 화면에는
    // 마지막으로 보여준 값 그대로 멈춰 있는 것처럼 표시해 다음 턴으로 성급히
    // 넘어간 듯한 느낌을 주지 않는다.
    if (paused) return;
    // 서버가 주는 데드라인에는 "직전 액션의 연출이 재생되는 동안의 유예"가 얹혀 있어
    // 남은 시간이 잠시 totalMs를 넘을 수 있다. 그 구간에는 게이지를 가득 찬 상태로
    // 두어(=maxSeconds로 자름) 방에서 설정한 값 그대로에서 카운트다운이 시작되게 한다.
    const tick = () => setRemaining(Math.min(maxSeconds, Math.max(0, (deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [deadline, paused, maxSeconds]);

  const pct = (remaining / maxSeconds) * 100;
  const isUrgent = remaining <= Math.min(5, maxSeconds);
  const isWarn = remaining <= Math.min(10, maxSeconds);

  // ⚠️ 채움은 더 이상 **그림이 아니다**(gauge_fill 사용 중지). 예전에는 초록 한 벌짜리
  // 그림을 `hue-rotate`로 돌려 경고·위험을 만들었는데, 색을 돌리면 그림의 광택까지
  // 함께 돌아 단계마다 재질이 달라 보였다. CSS 그라디언트로 단계별 색을 그대로 지정한다.
  const tone = isUrgent ? 'urgent' : isWarn ? 'warn' : null;

  // 창(.play-timer-window)은 ActionPrompt가 그린다 — 여기서는 그 안에 들어가는
  // 세 조각(모래시계 · 남은 시간 막대 · 남은 초)만 그린다.
  return (
    <>
      <span className={`play-timer-icon ${isUrgent ? 'hourglass-shake' : ''}`} aria-hidden>
        ⏳
      </span>
      <span className="play-timer-bar">
        <span
          className={`play-timer-fill ${tone ? `play-timer-fill-${tone}` : ''}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className={`play-timer-sec ${tone ? `play-timer-sec-${tone}` : ''}`}>
        {Math.ceil(remaining)}
      </span>
    </>
  );
}
