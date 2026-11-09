'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ClientGameState, SideId } from 'shared';
import { ACORN_TIER_NAME, acornCard, acornCardLines, acornSkinOf, isAcornFestivalTurn, nextAcornFestivalTurn } from 'shared';
import { AcornGlyph } from '@/lib/acornIcons';
import { openAcornShelf } from './AcornLayer';

/**
 * 도토리 카드로 바뀐 능력치 표시 — 검은 도토리 안에 그 카드의 아이콘. 누르면 그 카드의 효과가 뜨고, [모두 보기]로 카드를 펼쳐 본다.
 * 테두리 색은 그 카드의 단계(다이아는 시안).
 */
export function AcornBadges({ gameState, side, className = '' }: { gameState: ClientGameState; side: SideId; className?: string }) {
  const owned = gameState.enhance?.acorn?.sides[side]?.owned ?? [];
  const [open, setOpen] = useState<{ i: number; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);
  if (owned.length === 0) return null;
  const sel = open ? owned[open.i] : undefined;
  return (
    // data-acorn-side · data-acorn-id — 얻은 카드의 빛이 날아와 앉을 자리를 AcornLayer가 찾는다(얻기 → 장착 연출)
    <div className={`acorn-badges ${className}`} data-acorn-side={side}>
      {owned.map((o, i) => {
        const def = acornCard(o.id);
        if (!def) return null;
        return (
          <button
            key={o.id}
            type="button"
            className="acorn-badge"
            data-acorn-id={o.id}
            data-skin={acornSkinOf(o.id, o.tier)}
            aria-label={`${def.name} — ${acornCardLines(o.id).join(', ')}`}
            onPointerDown={e => e.stopPropagation()}
            onClick={e => {
              const r = e.currentTarget.getBoundingClientRect();
              setOpen(open?.i === i ? null : { i, x: r.left + r.width / 2, y: r.top });
            }}
          >
            <AcornGlyph name={def.icon} className="acorn-badge-glyph" />
          </button>
        );
      })}
      {open && sel && typeof document !== 'undefined' &&
        createPortal(
          <div
            className="acorn-pop"
            style={{ left: Math.min(window.innerWidth - 130, Math.max(130, open.x)), top: open.y }}
            onPointerDown={e => e.stopPropagation()}
            role="tooltip"
          >
            <b>{acornCard(sel.id)?.name}</b>
            <span className="acorn-pop-tier">{ACORN_TIER_NAME[sel.tier]}</span>
            <ul>
              {acornCardLines(sel.id).map((l, i) => <li key={i}>{l}</li>)}
            </ul>
            <button type="button" className="acorn-pop-all" onClick={() => { setOpen(null); openAcornShelf(side); }}>
              모두 보기
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * 보호막 — 체력 막대에 **겹쳐** 그리는 반투명 은빛 띠(2026-11-07). 체력 끝(지금 체력)에서 보호막만큼 안쪽으로 덮고,
 * 체력 채움보다 위아래(PC는 좌우)로 2px 크다. 빛 반사가 띠 위를 훑는다. 막대 눈금은 체력과 같은 척도(승리선)다.
 * PC: 체력 구슬 위(dir 'v') / 모바일: 체력 막대 위(왼쪽 막대 'h-left' — 가운데가 안쪽 끝 · 오른쪽 막대 'h-right').
 * 값은 화면상 지속 효과 묶음(displayedStatus — 공격 연출 순간에 깎인다)과 화면상 체력에서 읽는다.
 */
export function ShieldGauge({ gameState, side, dir }: { gameState: ClientGameState; side: SideId; dir: 'v' | 'h-left' | 'h-right' }) {
  const shield = gameState.enhance?.shield?.[side] ?? 0;
  if (shield <= 0) return null;
  const winHp = gameState.scoreRace?.target ?? gameState.settings.targetScore * 2;
  // 체력 막대와 같은 시작점에서 보호막 양만큼 덮는다(2026-11-07 — 체력 끝에 붙이던 것을 바꿨다)
  const from = 0;
  const len = Math.max(0, Math.min(1, shield / winHp));
  return (
    <div
      className="shield-band"
      data-dir={dir}
      style={{ ['--from' as string]: from, ['--len' as string]: len } as React.CSSProperties}
      title={`보호막 ${shield}`}
      aria-label={`보호막 ${shield}`}
    >
      <span className="shield-band-shine" aria-hidden />
      <span className="shield-band-value tabular-nums">
        {/* 방패 — 이모지는 글꼴에 따라 빈칸으로 보인다 */}
        <svg viewBox="0 0 24 24" className="shield-band-icon" aria-hidden><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z" fill="currentColor" /></svg>
        {shield}
      </span>
    </div>
  );
}

/** 머리띠의 축제 안내(카드 강화) — 고르는 중이면 "도토리 축제!", 아니면 다음 축제까지 남은 턴 */
export function AcornFestivalBadge({ gameState, className = 'festival-running font-bold whitespace-nowrap', iconClass = 'festival-running-icon' }: { gameState: ClientGameState; className?: string; iconClass?: string }) {
  if (!gameState.enhance?.acorn) return null;
  const offer = gameState.enhance.acorn.offer;
  // 축제는 그 턴이 시작될 때 열리므로, 지금이 축제 턴이면 이번 축제는 이미 열린 것 — 다음 것을 센다
  const next = nextAcornFestivalTurn(isAcornFestivalTurn(gameState.turn, gameState.settings) ? gameState.turn + 1 : gameState.turn, gameState.settings);
  const left = next - gameState.turn;
  return (
    <span className={className}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/play/icon_acorn.webp" alt="" className={iconClass} />
      <span className="festival-header-badge">{offer ? '도토리 축제! 카드 고르는 중' : left <= 0 ? '도토리 축제' : `도토리 축제 ${left}턴 후`}</span>
    </span>
  );
}
