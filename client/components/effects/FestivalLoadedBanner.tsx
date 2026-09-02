'use client';

import type { FestivalLoaded } from '@/hooks/useAnimationQueue';

// 도토리 축제가 열려 실용신양과 같은 방식의 랜덤 뽑기가 발동하는 순간, 몇 장이
// 뽑힐지 화면 중앙에 큼직하게 예고한다. 특정 팀 소유가 아니라 보드 전체에 알린다.
export function FestivalLoadedBanner({ loaded }: { loaded: FestivalLoaded | null }) {
  if (!loaded) return null;

  return (
    <div key={loaded.id} className="festival-loaded-banner" aria-hidden>
      🌰 도토리 축제 효과! 랜덤 뽑기 {loaded.count}회!
    </div>
  );
}
