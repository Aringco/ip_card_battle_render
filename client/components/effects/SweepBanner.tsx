'use client';

import { ANIMALS } from 'shared';
import type { SweepBannerInfo } from '@/hooks/useAnimationQueue';
import { SKILL_TITLE } from '@/lib/skillInfo';

// 싹쓸이 — 짝이 다 날아가 필드가 빈 순간, 화면 위쪽에 "싹쓸이!"와 네 동물에 더한 보너스 경험치를 두 줄로 띄운다.
// 같은 자리의 축제 시작 안내(FestivalStartBanner)와 같은 모양이다. 새 카드가 다 깔릴 때까지 떠 있다(useAnimationQueue).
export function SweepBanner({ info }: { info: SweepBannerInfo | null }) {
  if (!info) return null;

  return (
    <div key={info.id} className="sweep-banner" aria-hidden>
      <span className="sweep-banner-line1">🧹 싹쓸이!</span>
      <span className="sweep-banner-line2">
        {ANIMALS.map(a => `${SKILL_TITLE[a]} +${info.bonus[a]}`).join(' · ')}
      </span>
    </div>
  );
}
