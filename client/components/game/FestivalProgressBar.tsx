import type { FestivalProgress } from '@/hooks/useAnimationQueue';

// 도토리 축제로 예약된 추가 뽑기가 지금 이번 액션에서 몇 번째까지 소모됐는지 보여준다.
// 자리는 SheepProgressBar와 같지만(둘은 동시에 뜨지 않는다) **생김새는 다르다** —
// 이쪽만 도토리가 그려진 나무 띠(acorn_bar)를 쓴다. 축제 전용 그림이라 무슨 일이
// 벌어지는지 글을 읽기 전에 알아볼 수 있다.
export function FestivalProgressBar({ progress }: { progress: FestivalProgress | null }) {
  if (!progress) return null;

  const teamLabel = progress.team === 'A' ? '🟢' : '🔵';

  return (
    // ⚠️ 🌰를 글에 쓰지 않는다 — 띠 그림의 왼쪽 마구리에 도토리 두 알이 이미 그려져 있어
    // 같이 두면 도토리가 넷으로 보인다.
    // 자리는 오른쪽 — 들보의 "도토리 축제! 랜덤 뽑기" 배지 **바로 밑**이다(요청).
    // 실용신양 진행도(가운데)와 나란히 서도 서로 겹치지 않는다.
    <div className="play-acorn-bar play-progress-top play-progress-right fixed z-40 flex items-center gap-2 font-bold pointer-events-none">
      <span>{teamLabel} 도토리 축제 추가 뽑기</span>
      <span className="tabular-nums text-amber-200">
        {progress.current} / {progress.total}
      </span>
    </div>
  );
}
