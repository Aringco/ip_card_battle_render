'use client';

import type { FestivalStartInfo } from '@/hooks/useAnimationQueue';

// 도토리 축제가 시작되는 순간 — 이 방에 실제로 적용되는 규칙(방장이 정한 뽑기 횟수·
// 증가 주기)을 화면 중앙에 두 줄로 크게 안내한다. FestivalLoadedBanner(그때그때
// "몇 장 뽑기!"를 예고하는 반복 배너)와 달리 이건 축제 진입 순간에 딱 한 번만 뜬다.
export function FestivalStartBanner({ info }: { info: FestivalStartInfo | null }) {
  if (!info) return null;

  return (
    <div key={info.id} className="festival-start-banner" aria-hidden>
      <span className="festival-start-banner-line1">🌰 도토리 축제 시작!</span>
      <span className="festival-start-banner-line2">
        이제부터 {info.increaseInterval}턴마다 추가 랜덤 뽑기 {info.drawCount}회!
      </span>
    </div>
  );
}
