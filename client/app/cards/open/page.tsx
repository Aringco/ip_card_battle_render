'use client';

import { CardsShell } from '@/components/cards/CardsShell';
import { PackOpener } from '@/components/cards/PackOpener';

/** 도토리 증강팩 열기 */
export default function CardsOpenPage() {
  return (
    <CardsShell page="open">
      <PackOpener />
    </CardsShell>
  );
}
