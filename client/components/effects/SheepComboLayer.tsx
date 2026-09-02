'use client';

import { useLayoutEffect, useState } from 'react';
import type { SheepCombo } from '@/hooks/useAnimationQueue';

// 비활성화 스위치 — "N combo!" 텍스트만 화면에서 끈다. 콤보 계산/스케줄링 로직
// 자체(useAnimationQueue.ts의 sheepCombos)는 그대로 두고 여기서 렌더만 막는다 —
// 다시 켜고 싶으면 이 값만 true로 되돌리면 된다.
const SHOW_COMBO_TEXT = false;

export function SheepComboLayer({ combos }: { combos: SheepCombo[] }) {
  if (!SHOW_COMBO_TEXT) return null;

  return (
    <>
      {combos.map(c => (
        <ComboText key={c.id} combo={c} />
      ))}
    </>
  );
}

function ComboText({ combo }: { combo: SheepCombo }) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // 실용신양 효과로 카드가 뽑힌 장소 위치를 측정해 그 자리에서 콤보 텍스트를 띄운다.
  useLayoutEffect(() => {
    const el = document.querySelector(`[data-place-key="${combo.place}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combo.id]);

  if (!pos) return null;

  const fontSize = 1.3 * Math.pow(1.1, combo.combo - 1);

  return (
    <span
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        pointerEvents: 'none',
        zIndex: 62,
      }}
    >
      <span
        className="sheep-combo-text"
        style={{ fontSize: `${fontSize}rem` }}
      >
        {combo.combo}combo!
      </span>
    </span>
  );
}
