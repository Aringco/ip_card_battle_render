'use client';

import type { MainCombo } from '@/hooks/useAnimationQueue';

// 비활성화 스위치 — "N COMBO!" 배너만 화면에서 끈다. 콤보 계산/스케줄링 로직 자체
// (useAnimationQueue.ts의 mainCombo)는 그대로 두고 여기서 렌더만 막는다 — 다시 켜고
// 싶으면 이 값만 true로 되돌리면 된다(SheepComboLayer.tsx의 SHOW_COMBO_TEXT와 같은 스위치).
const SHOW_COMBO_BANNER = false;

// 실용신양 연쇄가 끝난 시점에 최종 콤보 수를 화면 중앙에 크게 보여준다.
// 콤보 수에 따라 색 단계가 올라가 "지금 얼마나 몰아쳤는지"를 한눈에 알 수 있다.
export function MainComboBanner({ combo }: { combo: MainCombo | null }) {
  if (!SHOW_COMBO_BANNER || !combo || combo.combo < 2) return null;

  const tier = combo.combo >= 6 ? 'hot' : combo.combo >= 3 ? 'warm' : 'base';

  return (
    <div
      key={combo.id}
      className={`main-combo-banner main-combo-${tier}`}
      aria-hidden
    >
      {combo.combo} COMBO!
    </div>
  );
}
