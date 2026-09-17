import type { FestivalProgress } from '@/hooks/useAnimationQueue';

// 도토리 축제로 예약된 추가 뽑기가 지금 이번 액션에서 몇 번째까지 소모됐는지 보여준다.
// 자리는 SheepProgressBar와 같지만(둘은 동시에 뜨지 않는다) **생김새는 다르다** —
// 이쪽만 도토리가 그려진 나무 띠(acorn_bar)를 쓴다. 축제 전용 그림이라 무슨 일이
// 벌어지는지 글을 읽기 전에 알아볼 수 있다.
export function FestivalProgressBar({ progress }: { progress: FestivalProgress | null }) {
  if (!progress) return null;

  const teamLabel = progress.team === 'A' ? '🟢' : '🔵';
  const remaining = Math.max(0, progress.total - progress.current);

  return (
    // ⚠️ 🌰를 글에 쓰지 않는다 — 띠 그림의 왼쪽 마구리에 도토리 두 알이 이미 그려져 있어
    // 같이 두면 도토리가 넷으로 보인다.
    <div className="play-acorn-bar play-progress-top fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 font-bold pointer-events-none">
      <span>{teamLabel} 도토리 축제 추가 뽑기</span>
      <span className="tabular-nums text-amber-200">
        {progress.current} / {progress.total}
      </span>
      {remaining > 0 && <span className="text-amber-100/70">(남은 {remaining}회)</span>}
    </div>
  );
}
