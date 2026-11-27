'use client';

import { CardsShell } from '@/components/cards/CardsShell';
import { GalleryBook } from '@/components/cards/GalleryBook';

/** 도토리 증강 카드 갤러리 북 */
export default function CardsGalleryPage() {
  return (
    <CardsShell page="gallery">
      <GalleryBook />
    </CardsShell>
  );
}
