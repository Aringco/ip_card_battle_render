import type { ClientGameState } from 'shared';
import type { RankBanner } from '@/hooks/useAnimationQueue';
import { FINISH_WORD, sideColor, sideName } from '@/lib/individual';

/**
 * 개인전 — 한 사람의 순위가 정해진 순간 화면 가운데에 띄우는 "n위 확정!" 알림.
 *
 * 승리(승리선 도달)는 밝은 금색으로, 탈락·기권은 어두운 색으로 가른다. 그 사람의 색 칩과 닉네임이 함께 있어
 * 누구 얘기인지 색만으로 알아봐야 하는 일이 없다.
 */
export function RankedBanner({
  banner,
  gameState,
}: {
  banner: RankBanner | null;
  gameState: ClientGameState;
}) {
  if (!banner) return null;
  const good = banner.reason === 'win' || banner.rank === 1;
  const color = sideColor(gameState, banner.team);
  return (
    <div
      key={banner.id}
      className={`ranked-banner ${good ? 'ranked-banner-good' : 'ranked-banner-bad'}`}
      aria-live="polite"
    >
      <span className="ranked-banner-rank">{banner.rank}위 확정!</span>
      <span className="ranked-banner-who">
        <span aria-hidden className="ranked-banner-chip" style={{ backgroundColor: color }} />
        {sideName(gameState, banner.team)} · {FINISH_WORD[banner.reason]}
      </span>
    </div>
  );
}
