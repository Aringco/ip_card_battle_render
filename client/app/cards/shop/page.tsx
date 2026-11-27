'use client';

import { CardsShell } from '@/components/cards/CardsShell';
import { PackShop } from '@/components/cards/PackShop';

/** 도토리 증강팩 상점 — 도토리 반도체로 산다 */
export default function CardsShopPage() {
  return (
    <CardsShell page="shop">
      <PackShop />
    </CardsShell>
  );
}
