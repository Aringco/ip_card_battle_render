'use client';

import Link from 'next/link';
import { useAcornCollection } from '@/lib/acornCollection';
import { useEnhanceSkin } from '@/lib/skin';
import { ChipIcon, PackIcon } from './CardsIcons';

export type CardsPage = 'gallery' | 'shop' | 'open';

const TABS: { page: CardsPage; href: string; label: string }[] = [
  { page: 'gallery', href: '/cards', label: '갤러리 북' },
  { page: 'shop', href: '/cards/shop', label: '상점' },
  { page: 'open', href: '/cards/open', label: '팩 열기' },
];

/**
 * 도토리 증강 카드 세 화면(갤러리 북 · 상점 · 팩 열기)의 겉 — 위 띠(로비로 · 탭 · 지갑) + 본문.
 * 도토리 카드는 강화전에만 있는 카드라 강화전 겉모양(나무 틀 버튼)을 켠다.
 */
export function CardsShell({ page, children }: { page: CardsPage; children: React.ReactNode }) {
  useEnhanceSkin(true);
  const col = useAcornCollection();
  return (
    <div className="cards-root" data-page={page}>
      <header className="cards-top">
        <Link href="/" className="cards-home" aria-label="로비로 돌아가기">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span>로비</span>
        </Link>
        <nav className="cards-tabs" aria-label="도토리 카드">
          {TABS.map(t => (
            <Link key={t.page} href={t.href} className="cards-tab" aria-current={t.page === page ? 'page' : undefined}>
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="cards-wallet" aria-live="polite">
          <span className="cards-wallet-item" title="도토리 반도체">
            <ChipIcon className="cards-wallet-icon" />
            <b>{col ? col.chips.toLocaleString('ko-KR') : '—'}</b>
            <span className="sr-only">도토리 반도체</span>
          </span>
          <span className="cards-wallet-item" title="가진 도토리 증강팩">
            <PackIcon className="cards-wallet-icon" />
            <b>{col ? col.packs : '—'}</b>
            <span className="sr-only">개의 팩</span>
          </span>
        </div>
      </header>
      <main className="cards-main">{children}</main>
    </div>
  );
}
