'use client';

import { useLayoutEffect, useState } from 'react';
import type { PlaceFocusItem } from '@/hooks/useAnimationQueue';

const RING_COUNT = 3;
const RING_STAGGER_MS = 90; // "샤샤샥" — 연달아 빠르게 뻗어나가는 느낌

// 지금 막 클릭된 장소로 시선을 모으는 연출 — 화면을 어둡게 하지 않고, 그 장소
// 테두리에서 빠르게 연달아 뻗어나가는 링 3개로 시선을 모은다.
export function CardFocusLayer({ items }: { items: PlaceFocusItem[] }) {
  return (
    <>
      {items.map(item => (
        <FocusBurst key={item.id} item={item} />
      ))}
    </>
  );
}

function FocusBurst({ item }: { item: PlaceFocusItem }) {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = document.querySelector(`[data-place-key="${item.place}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ x: r.left, y: r.top, w: r.width, h: r.height });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  if (!rect) return null;

  return (
    <span
      className="card-focus-burst"
      style={{
        position: 'fixed',
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
      }}
    >
      {Array.from({ length: RING_COUNT }, (_, i) => (
        <span key={i} className="card-focus-ring-fast" style={{ animationDelay: `${i * RING_STAGGER_MS}ms` }} />
      ))}
    </span>
  );
}
