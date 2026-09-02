'use client';

import type { SheepLoaded } from '@/hooks/useAnimationQueue';

// 지난 턴에 실용신양 스킬을 골라 예약해둔 추가 뽑기가 이번 턴에 소모되는 순간,
// 몇 장이 더 뽑힐지 화면 중앙에 큼직하게 예고한다.
export function SheepLoadedBanner({ loaded }: { loaded: SheepLoaded | null }) {
  if (!loaded) return null;

  return (
    <div key={loaded.id} className="sheep-loaded-banner" aria-hidden>
      🐑 예약된 카드 {loaded.count}장 뽑기!
    </div>
  );
}
