'use client';

import { useState, useEffect } from 'react';

export function TurnTimer({
  deadline,
  paused,
  totalMs,
  big = false,
}: {
  deadline: number; // 내 브라우저 시계(Date.now()) 기준 만료 시각 — useWebSocket이 환산해 넘겨준다
  paused: boolean;
  totalMs: number; // 게이지 100%에 해당하는 시간(ms) — 서버가 알려주는 "이번 턴에 실제로 주어진 시간"
  big?: boolean; // 스킬 선택 안내줄처럼 더 크게 보여줘야 할 때
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

  // 채움 그림(gauge_fill)은 초록 한 벌뿐이라, 경고·위험 단계는 CSS가 색을 돌려 만든다.
  const fillTone = isUrgent
    ? 'play-gauge-fill-urgent'
    : isWarn
    ? 'play-gauge-fill-warn'
    : '';

  return (
    <div className={`flex items-center ${big ? 'gap-3 min-w-[260px]' : 'gap-2 min-w-[180px]'}`}>
      <span className={isUrgent ? 'hourglass-shake' : ''} style={{ fontSize: big ? '1.7rem' : '1rem' }}>
        ⏳
      </span>
      {/* 트랙·채움 모두 가로 3분할이라 캡슐 끝 모양이 폭을 따라가지 않고 유지된다.
          ⚠️ 트랙에 overflow-hidden을 걸지 않는다 — 채움이 자기 오른쪽 마구리(둥근 끝)를
          그리는데, 잘라내면 그 자리가 각지게 끊긴다. */}
      <div className={`play-gauge-track flex-1 ${big ? 'h-4' : 'h-3'}`}>
        <div
          className={`play-gauge-fill h-full transition-[width] duration-100 ${fillTone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`text-right tabular-nums ${big ? 'text-xl w-9' : 'text-sm w-7'} ${
          isUrgent ? 'text-red-600 font-bold' : isWarn ? 'text-orange-500 font-bold' : 'text-sky-700 font-bold'
        }`}
      >
        {Math.ceil(remaining)}
      </span>
    </div>
  );
}
