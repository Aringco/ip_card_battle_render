'use client';

import { useState, useEffect } from 'react';

export function TurnTimer({
  deadline,
  paused,
  maxSeconds = 30,
  big = false,
}: {
  deadline: number;
  paused: boolean;
  maxSeconds?: number; // 진행바 100%에 해당하는 총 시간(초) — 고를 스킬이 없을 때는 3초짜리 짧은 타이머가 뜬다
  big?: boolean; // 스킬 선택 안내줄처럼 더 크게 보여줘야 할 때
}) {
  const [remaining, setRemaining] = useState(maxSeconds);

  useEffect(() => {
    // 정산 애니메이션이 재생 중일 때는 실제 서버 타이머는 계속 흐르지만, 화면에는
    // 마지막으로 보여준 값 그대로 멈춰 있는 것처럼 표시해 다음 턴으로 성급히
    // 넘어간 듯한 느낌을 주지 않는다.
    if (paused) return;
    const tick = () => setRemaining(Math.max(0, (deadline - Date.now()) / 1000));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [deadline, paused]);

  const pct = (remaining / maxSeconds) * 100;
  const isUrgent = remaining <= Math.min(5, maxSeconds);
  const isWarn = remaining <= Math.min(10, maxSeconds);

  // 평소 상태 색은 연두색이 흰 배경(해설판 오버레이) 위에서 잘 안 보인다는 피드백을
  // 반영해, 대비가 뚜렷한 하늘색으로 바꿨다(위험 단계인 주황/빨강과도 확실히 구분된다).
  const barColor = isUrgent
    ? 'bg-red-500'
    : isWarn
    ? 'bg-orange-400'
    : 'bg-sky-500';

  return (
    <div className={`flex items-center ${big ? 'gap-3 min-w-[260px]' : 'gap-2 min-w-[180px]'}`}>
      <span className={isUrgent ? 'hourglass-shake' : ''} style={{ fontSize: big ? '1.7rem' : '1rem' }}>
        ⏳
      </span>
      <div className={`flex-1 bg-jungle-950 rounded-full overflow-hidden ${big ? 'h-4' : 'h-2.5'}`}>
        <div
          className={`h-full rounded-full transition-[width] duration-100 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={`font-mono text-right tabular-nums ${big ? 'text-xl w-9' : 'text-sm w-7'} ${
          isUrgent ? 'text-red-600 font-bold' : isWarn ? 'text-orange-500 font-bold' : 'text-sky-700 font-bold'
        }`}
      >
        {Math.ceil(remaining)}
      </span>
    </div>
  );
}
