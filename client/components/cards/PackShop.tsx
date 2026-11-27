'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { PlankButton } from '@/components/ui/PlankButton';
import {
  DAILY_CHIPS, PACK_PRODUCTS, PACK_SIZE, RARITY_NAME, buyProduct, canClaimDaily, claimDaily, packOdds, useAcornCollection,
} from '@/lib/acornCollection';
import { ChipIcon, PackArt } from './CardsIcons';

/** 상점 — 도토리 반도체로 도토리 증강팩을 산다. 하루 한 번 무료 충전, 확률 정보 공개. */
export function PackShop() {
  const col = useAcornCollection();
  const [toast, setToast] = useState<{ text: string; open: boolean } | null>(null);
  const [showOdds, setShowOdds] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  const daily = col ? canClaimDaily(col) : false;

  return (
    <section className="shop">
      <div className="shop-wallet">
        <div className="shop-balance">
          <ChipIcon className="shop-balance-icon" />
          <div>
            <span className="shop-balance-label">도토리 반도체</span>
            <b className="shop-balance-num">{col ? col.chips.toLocaleString('ko-KR') : '—'}</b>
          </div>
        </div>
        <PlankButton
          disabled={!daily}
          onClick={() => { if (claimDaily()) setToast({ text: `도토리 반도체 ${DAILY_CHIPS}개를 받았어요`, open: false }); }}
        >
          {daily ? `오늘의 무료 충전 +${DAILY_CHIPS}` : '오늘 충전 완료 — 내일 또 받아요'}
        </PlankButton>
      </div>

      <ul className="shop-list">
        {PACK_PRODUCTS.map(p => {
          const count = p.packs + p.bonus;
          const short = col ? col.chips < p.price : true;
          return (
            <li key={p.id} className="shop-item" data-size={p.packs}>
              <div className="shop-art" data-n={Math.min(count, 3)}>
                {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                  <PackArt key={i} className="shop-art-pack" />
                ))}
                {count > 1 && <span className="shop-art-count">×{count}</span>}
              </div>
              <h2 className="shop-item-name">{p.name}</h2>
              <p className="shop-item-desc">
                팩 {p.packs}개{p.bonus > 0 && <b> + 덤 {p.bonus}개</b>} · 카드 {count * PACK_SIZE}장
              </p>
              <PlankButton
                disabled={short}
                onClick={() => { if (buyProduct(p.id)) setToast({ text: `${p.name} — 팩 ${count}개를 샀어요`, open: true }); }}
              >
                <span className="shop-price">
                  <ChipIcon className="shop-price-icon" />
                  {p.price.toLocaleString('ko-KR')}
                  {short && col && <small> · 반도체 부족</small>}
                </span>
              </PlankButton>
            </li>
          );
        })}
      </ul>

      <div className="shop-foot">
        <button type="button" className="shop-odds-btn" onClick={() => setShowOdds(true)}>확률 정보</button>
        <p>도토리 반도체는 이 게임 안에서만 쓰는 화폐예요. 실제 돈으로 사거나 바꿀 수 없고, 수집 기록은 이 브라우저에만 남아요.</p>
      </div>

      {toast && (
        <div className="shop-toast" role="status">
          {toast.text}
          {toast.open && <Link href="/cards/open" className="shop-toast-link">지금 열기 →</Link>}
        </div>
      )}
      {showOdds && <OddsDialog onClose={() => setShowOdds(false)} />}
    </section>
  );
}

function OddsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const rows = packOdds();
  const fmt = (n: number) => `${Number(n.toFixed(2))}%`;
  return createPortal(
    <div className="shop-odds" role="dialog" aria-modal="true" aria-label="확률 정보" onClick={onClose}>
      <div className="shop-odds-box" onClick={e => e.stopPropagation()}>
        <h2>도토리 증강팩 확률 정보</h2>
        <p>팩 하나에 카드 {PACK_SIZE}장이 들어 있고, 한 장 한 장이 아래 확률로 따로 정해져요(같은 카드가 겹쳐 나올 수 있어요). 같은 등급 안의 카드는 모두 같은 확률이에요.</p>
        <table>
          <thead>
            <tr><th>등급</th><th>한 장의 확률</th><th>카드 수</th><th>카드 1종의 확률</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.rarity} data-rarity={r.rarity}>
                <td><b>{RARITY_NAME[r.rarity]}</b></td>
                <td>{fmt(r.pct)}</td>
                <td>{r.count}종</td>
                <td>{fmt(r.pct / r.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <PlankButton onClick={onClose}>닫기</PlankButton>
      </div>
    </div>,
    document.body,
  );
}
