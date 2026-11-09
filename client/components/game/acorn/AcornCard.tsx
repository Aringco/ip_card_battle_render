'use client';

import type { AcornTier } from 'shared';
import { ACORN_FAMILY_NAME, ACORN_SCOPE_NAME, ACORN_TIER_NAME, acornCard, acornCardLines, acornSkinOf } from 'shared';
import { AcornGlyph } from '@/lib/acornIcons';

/**
 * 도토리 카드 앞면 — 테두리와 홀로는 기술 카드와 같은 등급(작은 = 브론즈 · 은빛 = 실버 · 황금 = 골드 · 무지개빛 = 무지개),
 * 다이아 도토리(공통)는 시안 테두리 + 홀로그램. 가운데는 그림 대신 그 카드의 아이콘(lib/acornIcons.tsx).
 */
const HOLO: Record<string, string> = {
  bronze: 'enh-sheen', silver: 'enh-silver', gold: 'enh-gold', rainbow: 'enh-rainbow', diamond: 'acorn-diamond-holo',
};
const ENH: Record<string, number> = { bronze: 0.35, silver: 0.55, gold: 0.8, rainbow: 1, diamond: 0.7 };

export function AcornCard({ id, tier, compact = false }: { id: string; tier: AcornTier; compact?: boolean }) {
  const def = acornCard(id);
  if (!def) return null;
  const skin = acornSkinOf(id, tier);
  return (
    <div
      className={`acorn-card ${compact ? 'acorn-card-compact' : ''}`}
      data-skin={skin}
      style={{ ['--enh' as string]: ENH[skin], ['--gold' as string]: 0.6, ['--silver' as string]: 0.6 } as React.CSSProperties}
    >
      <div className={`${HOLO[skin]} acorn-card-holo`} aria-hidden />
      <div className="acorn-card-body">
        <span className="acorn-card-kind">
          {def.family === 'diamond' ? ACORN_FAMILY_NAME.diamond : `${ACORN_FAMILY_NAME[def.family]} · ${ACORN_TIER_NAME[tier]}`}
        </span>
        <span className="acorn-card-icon">
          <AcornGlyph name={def.icon} className="w-full h-full" />
        </span>
        <span className="acorn-card-name">{def.name}</span>
        {!compact && (
          <>
            <ul className="acorn-card-lines">
              {acornCardLines(id).map((l, i) => <li key={i}>{l}</li>)}
            </ul>
            <span className="acorn-card-scope">{ACORN_SCOPE_NAME[def.scope]}</span>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 카드 뒷면 — 도토리색 테두리 · 고동색 바탕 · 가운데 도토리가 단계 색으로 빛난다(도토리 실루엣 /play/acorn_mask.webp를 그 색으로 칠한다).
 * 도토리 카드(tier 1~4, 다이아는 'diamond')와 기술 카드(같은 등급 이름)가 함께 쓴다.
 */
export function CardBack({ glow }: { glow: 'bronze' | 'silver' | 'gold' | 'rainbow' | 'diamond' }) {
  return (
    <div className="card-back" data-glow={glow} aria-hidden>
      <span className="card-back-acorn" />
    </div>
  );
}
