import type { SheepProgress } from '@/hooks/useAnimationQueue';

// 실용신양 스킬로 예약된 추가 뽑기가 지금 이번 액션에서 몇 번째까지 소모됐는지 보여준다.
export function SheepProgressBar({ progress }: { progress: SheepProgress | null }) {
  if (!progress) return null;

  const teamLabel = progress.team === 'A' ? '🟢' : '🔵';

  return (
    // 자리는 액자 윗머리 **가운데**다(요청: 이쪽은 그대로 둔다).
    // 도토리 축제 진행도는 오른쪽 배지 밑으로 옮겨져 둘이 나란히 떠도 겹치지 않는다.
    <div className="play-sheep-bar play-progress-top fixed left-1/2 -translate-x-1/2 z-40 bg-jungle-950/90 text-white rounded-full shadow-lg flex items-center gap-2 font-bold pointer-events-none">
      <span>🐑 {teamLabel} 실용신양 추가 뽑기</span>
      <span className="tabular-nums text-amber-300">
        {progress.current} / {progress.total}
      </span>
    </div>
  );
}
