import type { FestivalProgress } from '@/hooks/useAnimationQueue';

// 도토리 축제로 예약된 추가 뽑기가 지금 이번 액션에서 몇 번째까지 소모됐는지 보여준다.
// SheepProgressBar와 완전히 같은 자리·같은 모양을 쓰되(둘은 동시에 뜨지 않는다), 문구만 다르다.
export function FestivalProgressBar({ progress }: { progress: FestivalProgress | null }) {
  if (!progress) return null;

  const teamLabel = progress.team === 'A' ? '🟢' : '🔵';
  const remaining = Math.max(0, progress.total - progress.current);

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-jungle-950/90 text-white rounded-full px-4 py-1.5 shadow-lg flex items-center gap-2 text-sm font-bold pointer-events-none">
      <span>🌰 {teamLabel} 도토리 축제 추가 뽑기</span>
      <span className="tabular-nums text-amber-300">
        {progress.current} / {progress.total}
      </span>
      {remaining > 0 && <span className="text-jungle-200">(남은 {remaining}회)</span>}
    </div>
  );
}
