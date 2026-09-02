import type { SheepProgress } from '@/hooks/useAnimationQueue';

// 실용신양 스킬로 예약된 추가 뽑기가 지금 이번 액션에서 몇 번째까지 소모됐는지 보여준다.
export function SheepProgressBar({ progress }: { progress: SheepProgress | null }) {
  if (!progress) return null;

  const teamLabel = progress.team === 'A' ? '🟢' : '🔵';
  const remaining = Math.max(0, progress.total - progress.current);

  return (
    <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-jungle-950/90 text-white rounded-full px-4 py-1.5 shadow-lg flex items-center gap-2 text-sm font-bold pointer-events-none">
      <span>🐑 {teamLabel} 실용신양 추가 뽑기</span>
      <span className="tabular-nums text-amber-300">
        {progress.current} / {progress.total}
      </span>
      {remaining > 0 && <span className="text-jungle-200">(남은 {remaining}회)</span>}
    </div>
  );
}
