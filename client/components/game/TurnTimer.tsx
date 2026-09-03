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
