'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AcornOwned, AcornSide, AcornTier, ClientGameEvent, ClientGameState, SideId } from 'shared';
import { ACORN_FAMILY_NAME, ACORN_PICK_SEC, ACORN_TIER_NAME, ACORN_TIER_SKIN, acornCard, acornCardLines, acornSkinOf, acornSummary } from 'shared';
import { AcornGlyph } from '@/lib/acornIcons';
import { AcornCard, CardBack } from './AcornCard';
import { AcornIcon } from '@/components/ui/AcornIcon';
import { playRandomSound } from '@/lib/sounds';

/** 고른 카드가 자리에 들어오는 연출 길이 — 서버 연출 유예(room.ts TL_ACORN_GET_MS)와 같다(승격 연출 2.6초 + 다 드러난 카드를 1초 보여 주고 닫힘 0.4초 —
 *  2026-11-07, 그 전 3.2초는 드러나자마자 닫혀 연출이 끊긴 것처럼 보였다). CSS .acorn-shelf-dim의 acornShelfOut 지연과 짝이다 */
export const ACORN_GET_MS = 4000;
/** 얻기 연출이 끝나 갈 때(창이 닫히기 시작할 무렵) 카드가 그 단계 빛으로 뭉쳐 도토리 카드 줄의 제자리로 날아가 앉는다(2026-11-07).
 *  서버 연출 유예 TL_ACORN_GET_MS(4400) = 날기 시작 + 나는 시간 + 여운 — 셋을 함께 고칠 것 */
const ACORN_FLY_AT = 3500;
const ACORN_FLY_MS = 800;
// 빛이 걷히는 경계선을 따라 튀는 불꽃 — 자리 · 방향 · 길이를 정해 둔다(렌더마다 무작위면 매번 모양이 튄다)
const RISE_SPARKS = Array.from({ length: 12 }, (_, i) => ({
  x: 6 + i * 8,
  sx: (i % 2 ? 1 : -1) * (6 + (i * 7) % 10),
  sy: -(10 + (i * 5) % 12),
  rot: (i % 2 ? 1 : -1) * (12 + (i * 11) % 24),
  delay: (i * 83) % 400,
  dur: 420 + (i * 37) % 200,
}));

// 마지막으로 얻기 연출을 한 카드(마운트와 무관하게 — 모듈에 둔다)
let lastGet: { id: string; at: number } = { id: '', at: 0 };

/** 카드 보기 창을 여는 신호 — 배지 · 모바일 스와이프가 보낸다(detail: 편 id) */
export const ACORN_SHELF_EVENT = 'acorn:shelf';
export function openAcornShelf(side: SideId): void {
  window.dispatchEvent(new CustomEvent<SideId>(ACORN_SHELF_EVENT, { detail: side }));
}

interface Props {
  state: ClientGameState;
  /** 화면상 내 편(관전자 · 순위가 정해진 사람은 null) */
  me: SideId | null;
  events: ClientGameEvent[];
  turnDeadline: number | null;
  /** 직전 액션의 연출이 도는 중 — 고르기 창은 연출이 끝난 뒤에 뜬다 */
  settling: boolean;
  paused: boolean;
  onPick: (id: string) => void;
  /** 그 칸의 후보를 다시 뽑는다(칸마다 축제에 한 번) */
  onReroll: (slot: number) => void;
}

/**
 * 도토리 축제 화면 — 방 화면에 한 번 둔다(PC · 모바일 · 팀전 · 개인전 공용).
 * 1. 고르기: 카드 셋이 뒷면으로 떨어졌다가 뒤집힌다. 한 번 누르면 고르고, 한 번 더(또는 [이 카드로]) 누르면 확정. 15초 게이지.
 * 2. 얻기: 내 카드가 확정되면(시간초과로 대신 골라도) 기술 카드 띠 같은 자리들 위로 그 카드가 아래에서 올라오며 기술 카드 [승격]처럼
 *    카드 전체가 그 단계의 색으로 빛났다가 아래부터 걷힌다(2026-11-07).
 * 3. 보기: 배지 · 스와이프가 openAcornShelf(편)을 부르면 그 편이 가진 카드를 펼쳐 보인다([카드] · [목록] 보기).
 */
export function AcornLayer({ state, me, events, turnDeadline, settling, paused, onPick, onReroll }: Props) {
  const acorn = state.enhance?.acorn;
  const offer = acorn?.offer ?? null;
  const [sent, setSent] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  // 리롤을 보냈지만 서버 답이 아직인 칸 — 두 번 누르지 않게 그 사이에도 잠근다
  const [rerolling, setRerolling] = useState<number[]>([]);
  const [getting, setGetting] = useState<{ id: string; tier: AcornTier; key: number } | null>(null);
  const [viewing, setViewing] = useState<SideId | null>(null);
  const seenEvents = useRef<ClientGameEvent[] | null>(null);

  // 새 축제마다 고른 표시를 지운다
  const offerNo = offer?.no ?? 0;
  const [lastNo, setLastNo] = useState(offerNo);
  // 이 축제의 고르기 창을 한 번이라도 띄웠는가 — 띄운 뒤에는 연출 중(settling)이어도 내리지 않는다.
  // ⚠️ 상대(컴퓨터)가 먼저 고르면 그 갱신이 잠깐 settling을 켜는데, 그때 창을 내렸다 다시 띄우면 카드가 다시 떨어지고 뒤집혀
  //    "도토리 카드 연출이 3초쯤 뒤에 한 번 더" 도는 것처럼 보였다(2026-11-06).
  const [shownNo, setShownNo] = useState(0);
  if (offerNo !== lastNo) {
    setLastNo(offerNo);
    setSent(null);
    setChosen(null);
    setRerolling([]);
  }

  // 내 카드가 확정된 순간(내가 골랐든 시간초과든) — 들어오는 연출
  useEffect(() => {
    if (events === seenEvents.current) return;
    seenEvents.current = events;
    const mine = events.find(e => e.type === 'acornPicked' && e.team === me);
    // 같은 카드의 얻기 연출은 한 번만 — 이 층이 다시 마운트돼(재접속 등) 같은 이벤트를 다시 받아도 되풀이하지 않는다
    if (mine && mine.type === 'acornPicked' && !(lastGet.id === mine.id && Date.now() - lastGet.at < 10_000)) {
      lastGet = { id: mine.id, at: Date.now() };
      setGetting({ id: mine.id, tier: mine.tier, key: Date.now() });
      playRandomSound('promotion', 1.15, 0.5);
    }
  }, [events, me]);
  useEffect(() => {
    if (!getting) return;
    const t = window.setTimeout(() => setGetting(null), ACORN_GET_MS);
    return () => window.clearTimeout(t);
  }, [getting]);

  // 장착 — 새 배지는 빛이 닿을 때까지 숨겨 두고(data-pending), 창이 닫힐 무렵 카드 자리에서 그 단계 빛이 뭉쳐 배지 자리로 날아간다.
  // 배지가 없는 화면(관전 등)이면 날지 않는다. 숨김은 착지 · 안전 시한 · 층이 내려갈 때 반드시 푼다(배지가 영영 안 보이면 안 된다).
  const [fly, setFly] = useState<{ key: number; id: string; skin: string; x: number; y: number; w: number; h: number; dx: number; dy: number; end: number } | null>(null);
  const badgeSel = (id: string) => `[data-acorn-side="${me}"] [data-acorn-id="${id}"]`;
  const release = (id: string, equip: boolean) =>
    document.querySelectorAll<HTMLElement>(badgeSel(id)).forEach(b => {
      b.removeAttribute('data-pending');
      if (!equip) return;
      b.setAttribute('data-equip', '');
      window.setTimeout(() => b.removeAttribute('data-equip'), 700);
    });
  useEffect(() => {
    if (!getting || me === null) return;
    const { id, tier, key } = getting;
    const hide = () => document.querySelectorAll<HTMLElement>(badgeSel(id)).forEach(b => b.setAttribute('data-pending', ''));
    hide();
    const raf = requestAnimationFrame(hide); // 배지는 같은 갱신의 다음 커밋에 생길 수 있다
    const start = window.setTimeout(() => {
      const src = document.querySelector('.acorn-rise')?.getBoundingClientRect();
      const dst = document.querySelector(badgeSel(id))?.getBoundingClientRect();
      if (!src || !dst || src.width === 0) return release(id, false);
      const x = src.left + src.width / 2;
      const y = src.top + src.height / 2;
      setFly({ key, id, skin: acornSkinOf(id, tier), x, y, w: src.width, h: src.height, dx: dst.left + dst.width / 2 - x, dy: dst.top + dst.height / 2 - y, end: Math.max(0.05, dst.width / src.width) });
    }, ACORN_FLY_AT);
    const safety = window.setTimeout(() => release(id, false), ACORN_FLY_AT + ACORN_FLY_MS + 600);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(start);
      window.clearTimeout(safety);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getting?.key, me]);
  useEffect(() => () => document.querySelectorAll('.acorn-badge[data-pending]').forEach(b => b.removeAttribute('data-pending')), []);

  useEffect(() => {
    const open = (e: Event) => setViewing((e as CustomEvent<SideId>).detail);
    window.addEventListener(ACORN_SHELF_EVENT, open);
    return () => window.removeEventListener(ACORN_SHELF_EVENT, open);
  }, []);

  if (typeof document === 'undefined' || !acorn) return null;

  const myOptions = offer && me !== null ? offer.options[me] : undefined;
  const iPicked = !!offer && me !== null && (offer.picked[me] ?? null) !== null;
  const showPicker = !!myOptions && !iPicked && sent === null && (!settling || shownNo === offerNo) && !paused && !getting;
  if (showPicker && shownNo !== offerNo) setShownNo(offerNo);
  // 내가 막 고른 뒤 서버 답이 오기 전(sent · 아직 picked 아님)에는 띄우지 않는다 — 곧 얻기 연출이 뜬다
  const waiting = !!offer && !showPicker && !settling && !paused && !getting && !(sent !== null && !iPicked);

  let layer: React.ReactNode = null;
  if (getting) {
    const owned = acorn.sides[me ?? '']?.owned ?? [];
    layer = <AcornShelf key={getting.key} title="도토리 카드 획득!" owned={owned} incoming={getting} />;
  } else if (showPicker && offer && myOptions) {
    const rerolled = offer.rerolled?.[me ?? ''];
    const pick = (id: string) => {
      if (chosen !== id) return setChosen(id);
      setSent(id);
      onPick(id);
    };
    layer = (
      <div className="acorn-picker" role="dialog" aria-label="도토리 카드 고르기">
        <div className="acorn-picker-head">
          <AcornIcon className="acorn-picker-acorn" />
          <span>
            도토리 축제! <b data-tier={offer.tier}>{ACORN_TIER_NAME[offer.tier]}</b>
          </span>
        </div>
        <p className="acorn-picker-sub">카드 한 장을 고르세요 — 이번 판 동안 계속 적용돼요</p>
        <div className="acorn-picker-row">
          {myOptions.map((id, i) => {
            const used = !!rerolled?.[i] || rerolling.includes(i);
            return (
              <div key={i} className="acorn-pick-col">
                <button
                  key={`${offer.no}-${id}`}
                  type="button"
                  className="acorn-pick"
                  data-chosen={chosen === id || undefined}
                  // 리롤로 바뀐 카드는 기다리지 않고 바로 뒤집힌다
                  data-fresh={rerolled?.[i] || undefined}
                  style={{ ['--i' as string]: i } as React.CSSProperties}
                  onClick={() => pick(id)}
                  aria-label={acornCard(id)?.name}
                >
                  <span className="acorn-pick-flip">
                    <span className="acorn-pick-front"><AcornCard id={id} tier={offer.tier} /></span>
                    <span className="acorn-pick-back"><CardBack glow={acornCard(id)?.family === 'diamond' ? 'diamond' : ACORN_TIER_SKIN[offer.tier]} /></span>
                  </span>
                </button>
                {/* 리롤 — 칸마다 이 축제에 한 번. 누르면 서버가 같은 단계의 다른 카드로 바꾼다 */}
                <button
                  type="button"
                  className="acorn-reroll"
                  disabled={used}
                  onClick={() => {
                    if (used) return;
                    setRerolling(r => [...r, i]);
                    if (chosen === id) setChosen(null);
                    onReroll(i);
                  }}
                  aria-label={used ? '리롤을 이미 썼어요' : `${acornCard(id)?.name} 다시 뽑기`}
                  title={used ? '리롤 완료' : '리롤'}
                >
                  {/* ↻ 글자는 게임 글꼴에 없어 빈칸으로 보였다 — 작은 SVG로 */}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" className="acorn-reroll-icon" aria-hidden>
                    <path d="M20 11a8 8 0 1 0-2.3 5.7" />
                    <path d="M20 4v7h-7" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
        <div className="acorn-picker-foot">
          <PickTimer deadline={turnDeadline} />
          <button type="button" className="acorn-picker-ok" disabled={!chosen} onClick={() => chosen && pick(chosen)}>
            이 카드로
          </button>
        </div>
      </div>
    );
  } else if (waiting) {
    layer = (
      <div className="acorn-waiting" role="status">
        <AcornIcon /> 도토리 축제 — 다른 사람이 카드를 고르는 중…
      </div>
    );
  } else if (viewing !== null) {
    const owned = acorn.sides[viewing]?.owned ?? [];
    const name = state.teamNames?.[viewing] ?? state.teams[viewing]?.members[0] ?? '';
    layer = <AcornShelf title={`${name}의 도토리 카드`} owned={owned} side={acorn.sides[viewing]} onClose={() => setViewing(null)} />;
  }
  const flyEl = fly && (
    <span
      key={`fly${fly.key}`}
      className="acorn-fly"
      data-skin={fly.skin}
      aria-hidden
      style={{
        left: fly.x, top: fly.y, width: fly.w, height: fly.h,
        ['--dx' as string]: `${fly.dx}px`, ['--dy' as string]: `${fly.dy}px`, ['--end' as string]: fly.end,
        animationDuration: `${ACORN_FLY_MS}ms`,
      } as React.CSSProperties}
      onAnimationEnd={() => {
        release(fly.id, true);
        setFly(null);
      }}
    />
  );
  return layer || flyEl ? createPortal(<>{layer}{flyEl}</>, document.body) : null;
}

/** 남은 시간 게이지 — 서버 데드라인(연출 유예 포함)에서 15초로 잘라 보인다 */
function PickTimer({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, []);
  const total = ACORN_PICK_SEC * 1000;
  const left = deadline ? Math.max(0, Math.min(total, deadline - now)) : total;
  return (
    <div className="acorn-timer" aria-label={`남은 시간 ${Math.ceil(left / 1000)}초`}>
      <span className="acorn-timer-fill" style={{ width: `${(left / total) * 100}%` }} />
      <span className="acorn-timer-text">{Math.ceil(left / 1000)}초</span>
    </div>
  );
}

/**
 * 도토리 카드 자리 — 기술 카드 띠처럼 늘어선 판. 빈 자리 없이 가운데부터 네 장까지 나란히, **다섯 장부터는 같은 폭 안에서 겹친다**(가로 스크롤 없음 —
 * 2026-11-07). 겹친 카드는 마우스를 올리거나(PC) 누르면(폰 — 초점) 앞으로 나온다. 새로 얻은 카드는 언제나 맨 끝 · 맨 앞이다.
 * incoming이 있으면 마지막 칸으로 그 카드가 아래에서 올라오며 [승격]처럼 단계 색으로 빛났다 걷힌다.
 * onClose가 있으면 보기 창(닫기 버튼 · 바깥 누르기로 닫힌다)이고 [카드] · [목록] · [요약] 보기를 고를 수 있다.
 * [요약](2026-11-25)은 같은 효과끼리 합산해 지금 유효한 효과만 보인다(shared의 acornSummary — 상한이 있는 것은 상한까지).
 */
function AcornShelf({ title, owned, side, incoming, onClose }: {
  title: string;
  owned: AcornOwned[];
  /** 보기 창의 그 편 도토리 상태 — [요약]의 남은 효과(충전 · 턴마다)를 읽는다 */
  side?: AcornSide;
  incoming?: { id: string; tier: AcornTier };
  onClose?: () => void;
}) {
  const [mode, setMode] = useState<'cards' | 'list' | 'summary'>('cards');
  const list = mode === 'list';
  const cards = incoming ? owned.filter(o => o.id !== incoming.id) : owned;
  // 빈 자리는 만들지 않는다 — 얻은 카드만 가운데부터(CSS .acorn-shelf-row)
  const slots = cards.length + (incoming ? 1 : 0);
  const empty = owned.length === 0 && !incoming;
  return (
    <div className="acorn-shelf-dim" onClick={onClose} data-viewing={onClose ? '' : undefined}>
      <div className="acorn-shelf" onClick={e => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="acorn-shelf-head">
          <AcornIcon /> {title}
          {onClose && (
            <>
              <span className="acorn-shelf-modes" role="group" aria-label="보기 방식">
                <button type="button" aria-pressed={mode === 'cards'} onClick={() => setMode('cards')}>카드</button>
                <button type="button" aria-pressed={mode === 'list'} onClick={() => setMode('list')}>목록</button>
                <button type="button" aria-pressed={mode === 'summary'} onClick={() => setMode('summary')}>요약</button>
              </span>
              <button type="button" className="acorn-shelf-close" onClick={onClose} aria-label="닫기">
                ✕
              </button>
            </>
          )}
        </div>
        {mode === 'summary' ? (
          !empty && <AcornSummaryView side={side} />
        ) : list ? (
          <ul className="acorn-list">
            {owned.map(o => {
              const def = acornCard(o.id);
              if (!def) return null;
              return (
                <li key={o.id} className="acorn-list-row" data-skin={acornSkinOf(o.id, o.tier)}>
                  <span className="acorn-badge acorn-list-badge" data-skin={acornSkinOf(o.id, o.tier)} aria-hidden>
                    <AcornGlyph name={def.icon} className="acorn-badge-glyph" />
                  </span>
                  <span className="acorn-list-text">
                    <b>{def.name}</b>
                    <span className="acorn-list-tier">{def.family === 'diamond' ? ACORN_FAMILY_NAME.diamond : ACORN_TIER_NAME[o.tier]}</span>
                    <span className="acorn-list-lines">{acornCardLines(o.id).join(' · ')}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="acorn-shelf-row" style={{ ['--n' as string]: slots } as React.CSSProperties}>
            {Array.from({ length: slots }, (_, i) => {
              const o = cards[i];
              const isNew = !!incoming && i === cards.length;
              return (
                <div
                  key={i}
                  className="acorn-slot"
                  data-filled={o || isNew ? '' : undefined}
                  data-new={isNew || undefined}
                  tabIndex={o ? 0 : undefined}
                >
                  {o && <AcornCard id={o.id} tier={o.tier} />}
                  {isNew && (
                    <div className="acorn-rise" data-skin={acornSkinOf(incoming.id, incoming.tier)}>
                      <AcornCard id={incoming.id} tier={incoming.tier} />
                      {/* 기술 카드 [승격]과 같은 층(globals.css .enh-promo) — 카드 전체를 단계 색 빛이 덮었다가 아래부터 걷히고,
                          걷히는 경계선을 따라 불꽃이 튄다 */}
                      <span className="enh-promo" data-tier={acornSkinOf(incoming.id, incoming.tier)} aria-hidden>
                        <span className="enh-promo-ring" />
                        <span className="enh-promo-glow" />
                        <span className="enh-promo-edge" />
                        <span className="enh-promo-sparks">
                          {RISE_SPARKS.map((sp, j) => (
                            <span
                              key={j}
                              className="enh-promo-spark"
                              style={{
                                ['--x' as string]: `${sp.x}%`,
                                ['--sx' as string]: `${sp.sx}px`,
                                ['--sy' as string]: `${sp.sy}px`,
                                ['--rot' as string]: `${sp.rot}deg`,
                                ['--c' as string]: 'var(--rise-tone)',
                                animationDelay: `${sp.delay}ms`,
                                animationDuration: `${sp.dur}ms`,
                              } as React.CSSProperties}
                            />
                          ))}
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {empty && <p className="acorn-shelf-empty">아직 도토리 카드가 없어요</p>}
      </div>
    </div>
  );
}

/** [요약] — 늘 적용되는 효과(합산) · 아직 남은 효과. 상한에 걸린 줄은 그 사실을 함께 적는다 */
function AcornSummaryView({ side }: { side?: AcornSide }) {
  const { always, left } = acornSummary(side);
  const rows = (lines: ReturnType<typeof acornSummary>['always']) =>
    lines.map(l => (
      <li key={l.text} className="acorn-summary-row">
        {l.text}
        {l.capped !== undefined && <span className="acorn-summary-cap">상한 {l.capped}%</span>}
      </li>
    ));
  return (
    <div className="acorn-summary">
      <section>
        <h3 className="acorn-summary-title">늘 적용되는 효과</h3>
        {always.length ? <ul className="acorn-summary-list">{rows(always)}</ul> : <p className="acorn-summary-none">없음</p>}
      </section>
      <section>
        <h3 className="acorn-summary-title">남은 효과</h3>
        {left.length ? <ul className="acorn-summary-list">{rows(left)}</ul> : <p className="acorn-summary-none">없음</p>}
      </section>
    </div>
  );
}
