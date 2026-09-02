'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import type { Animal, CardNum, Place } from 'shared';
import { PLACE_ANIMALS } from 'shared';
import { SLOT_SPIN_DUR as SPIN_DUR, SLOT_REVEAL_HOLD as REVEAL_HOLD, SLOT_FLY_DUR as FLY_DUR } from '@/lib/drawTiming';
import type { DrawSlotItem } from '@/hooks/useAnimationQueue';

export function DrawSlotLayer({ items }: { items: DrawSlotItem[] }) {
  return (
    <>
      {items.map(item => (
        <SlotDraw key={item.id} item={item} />
      ))}
    </>
  );
}

function SlotDraw({ item }: { item: DrawSlotItem }) {
  const [phase, setPhase] = useState<'spin' | 'reveal' | 'fly'>('spin');
  const [pos, setPos] = useState<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const [spinFrame, setSpinFrame] = useState(0);

  useLayoutEffect(() => {
    const placeEl = document.querySelector(`[data-place-key="${item.place}"]`);
    const stackEl = document.querySelector(`[data-stack-area="${item.animal}"]`);
    if (!placeEl || !stackEl) return;
    const pr = placeEl.getBoundingClientRect();
    const sr = stackEl.getBoundingClientRect();
    setPos({
      x: pr.left + pr.width / 2,
      y: pr.top + pr.height / 2,
      tx: sr.left + sr.width / 2,
      ty: sr.top + sr.height / 2,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  useEffect(() => {
    const spinTimer = setInterval(() => setSpinFrame(f => f + 1), 70);
    const t1 = setTimeout(() => setPhase('reveal'), SPIN_DUR);
    const t2 = setTimeout(() => setPhase('fly'), SPIN_DUR + REVEAL_HOLD);
    return () => {
      clearInterval(spinTimer);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (!pos) return null;

  const spinOptions = PLACE_ANIMALS[item.place];
  const displayAnimal: Animal = phase === 'spin' ? spinOptions[spinFrame % spinOptions.length] : item.animal;
  const displayNum: CardNum | number = phase === 'spin' ? (spinFrame % 11) + 5 : item.num;

  const style: React.CSSProperties =
    phase === 'fly'
      ? {
          left: pos.tx,
          top: pos.ty,
          opacity: 0,
          transition: `left ${FLY_DUR}ms ease-in, top ${FLY_DUR}ms ease-in, opacity ${FLY_DUR}ms ease-in`,
        }
      : { left: pos.x, top: pos.y };

  return (
    <span
      className={`draw-slot ${phase === 'spin' ? 'draw-slot-spin' : ''}`}
      style={{ position: 'fixed', transform: 'translate(-50%, -50%)', zIndex: 58, ...style }}
    >
      <img src={`/emoticon/${displayAnimal}_focus.png`} alt={displayAnimal} className="w-16 h-16 object-contain" />
      <span className="text-2xl font-black text-jungle-900">{displayNum}</span>
    </span>
  );
}
