'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EmoteCategory } from 'shared';
import { EMOTE_CATEGORIES, EMOTE_MIN_INTERVAL_MS, emoteById } from 'shared';
import { ignoreHotkey } from '@/lib/hotkeys';

const VIEW_MARGIN = 8;
// 즐겨찾기 — 최대 4개, 고른 순서대로 A·S·D·F. 이 브라우저에만 남는 편의 기능이라 localStorage에 둔다
// (막혀 있거나 비어 있어도 그냥 즐겨찾기 없이 돈다).
const FAVORITE_KEYS = ['KeyA', 'KeyS', 'KeyD', 'KeyF'] as const;
const FAVORITE_LABELS = ['A', 'S', 'D', 'F'] as const;
const FAVORITE_MAX = FAVORITE_KEYS.length;
const FAVORITE_STORE = 'cardBattle_emoteFavorites';

function loadFavorites(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(FAVORITE_STORE) ?? '[]');
    // 그림 목록이 바뀌어 없어진 id는 버린다
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && !!emoteById(id)).slice(0, FAVORITE_MAX) : [];
  } catch {
    return [];
  }
}
function saveFavorites(ids: string[]): void {
  try { window.localStorage.setItem(FAVORITE_STORE, JSON.stringify(ids)); } catch { /* 저장이 막혀도 이번 판에는 그대로 쓴다 */ }
}
// 창이 이보다 좁아지면(작은 화면의 좁은 정보창) 이 폭을 지킨다 — 칸이 너무 작아 고르기 어렵다
const MIN_PANEL_W = 220;

/**
 * 개인전 감정표현 — 내 정보창 위의 [감정표현] 버튼과, 누르면 열리는 그림 고르기 창.
 *
 * **켜 두는 창이다**(2026-10-28 요청) — 그림을 골라도 닫히지 않고, 버튼을 다시 눌러야 닫힌다(바깥을 눌러도 그대로).
 * 연달아 여러 개를 보내기 쉽게 하려는 것이다(한 사람에게 4개까지 쌓인다 — EMOTE_QUEUE_MAX).
 * 그래서 창은 **내 정보창 위에** 겹쳐 연다 — 판 쪽에 열면 켜 둔 동안 장소 타일을 가려 카드를 뽑을 수 없다.
 * 가려지는 것은 내 동물 레벨뿐이고, 버튼으로 언제든 닫는다.
 *
 * 단축키: **I** 창 열기/닫기 · 즐겨찾기한 그림 **A·S·D·F**(창이 닫혀 있어도 보낸다). 칸 왼쪽 위의 별로 즐겨찾기한다.
 *
 * 고르면 서버로 보내기만 한다. 풍선은 서버가 방 전체에 되돌려 준 `emote`로 그린다(나도 그 길로 본다) —
 * 화면에서 먼저 띄우면 서버가 과속으로 버린 것까지 내 화면에만 뜬다.
 *
 * ⚠️ 창은 `document.body`로 띄운다(portal). 버튼이 앉은 칸(.ind-cell)은 `overflow: hidden`이고, 판 전체에
 *    흔들림(transform)이 걸리는 순간 fixed 자손이 그 판을 기준으로 잘리기 때문이다.
 */
export function EmotePicker({ onSend }: { onSend: (emoteId: string) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<EmoteCategory['id']>('default');
  const [cooling, setCooling] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => (typeof window === 'undefined' ? [] : loadFavorites()));
  const [box, setBox] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const coolTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (coolTimer.current) clearTimeout(coolTimer.current); }, []);

  // 창 자리 — 버튼 바로 아래, 정보창 칸의 폭 그대로. 화면 아래로 넘치면 그만큼 칸 영역이 스크롤된다.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = buttonRef.current?.getBoundingClientRect();
      const cell = buttonRef.current?.closest('.ind-cell')?.getBoundingClientRect();
      if (!b || !cell) return;
      const width = Math.max(cell.width, MIN_PANEL_W);
      const left = Math.max(VIEW_MARGIN, Math.min(cell.left, window.innerWidth - width - VIEW_MARGIN));
      const top = b.bottom + 6;
      setBox({ left, top, width, maxHeight: Math.max(160, window.innerHeight - top - VIEW_MARGIN) });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  const pick = (id: string) => {
    if (cooling) return;
    onSend(id);
    // 서버의 과속 방어(EMOTE_MIN_INTERVAL_MS)와 같은 시간만큼 칸을 잠근다 — 눌렀는데 아무것도 안 뜨는 일이 없게.
    // 버튼은 잠그지 않는다(창을 닫는 유일한 길이다).
    setCooling(true);
    coolTimer.current = setTimeout(() => setCooling(false), EMOTE_MIN_INTERVAL_MS);
  };

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(f => f !== id) : prev.length < FAVORITE_MAX ? [...prev, id] : prev;
      if (next !== prev) saveFavorites(next);
      return next;
    });
  };

  // 단축키 — 최신 상태(잠김·즐겨찾기)를 읽도록 매 렌더의 처리기를 ref로 건넨다(리스너는 한 번만 단다).
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keyRef.current = (e: KeyboardEvent) => {
      if (ignoreHotkey(e)) return;
      if (e.code === 'KeyI') {
        e.preventDefault();
        setOpen(o => !o);
        return;
      }
      const n = (FAVORITE_KEYS as readonly string[]).indexOf(e.code);
      if (n < 0 || !favorites[n]) return;
      e.preventDefault();
      pick(favorites[n]);
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const category = EMOTE_CATEGORIES.find(c => c.id === tab) ?? EMOTE_CATEGORIES[0];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="emote-button"
        aria-label={open ? '감정표현 창 닫기' : '감정표현'}
        title={open ? '감정표현 창 닫기 (I)' : '감정표현 (I)'}
        aria-keyshortcuts="I"
        aria-expanded={open}
        data-open={open || undefined}
        onClick={() => setOpen(o => !o)}
      >
        <img src="/emoticon/hands/wave.webp" alt="" draggable={false} />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          role="dialog"
          aria-label="감정표현 고르기"
          className="emote-panel"
          style={box
            ? { left: box.left, top: box.top, width: box.width, maxHeight: box.maxHeight }
            : { left: -9999, top: -9999 }}
        >
          <div role="tablist" className="emote-tabs">
            {EMOTE_CATEGORIES.map(c => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={c.id === tab}
                className="emote-tab"
                onClick={() => setTab(c.id)}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="emote-grid" data-cooling={cooling || undefined}>
            {category.items.map(item => {
              const fav = favorites.indexOf(item.id);
              const full = fav < 0 && favorites.length >= FAVORITE_MAX;
              return (
                // 별은 그림 버튼 **옆의** 버튼이다(버튼 안에 버튼을 넣을 수 없다) — 같은 칸에 겹쳐 앉힌다.
                <div key={item.id} className="emote-cell-wrap">
                  <button
                    type="button"
                    className="emote-cell"
                    title={fav >= 0 ? `${item.label} (${FAVORITE_LABELS[fav]})` : item.label}
                    aria-label={item.label}
                    aria-keyshortcuts={fav >= 0 ? FAVORITE_LABELS[fav] : undefined}
                    disabled={cooling}
                    onClick={() => pick(item.id)}
                  >
                    <img src={item.src} alt="" draggable={false} loading="lazy" />
                  </button>
                  <button
                    type="button"
                    className="emote-star"
                    data-on={fav >= 0 || undefined}
                    aria-pressed={fav >= 0}
                    aria-label={fav >= 0 ? `${item.label} 즐겨찾기 빼기` : `${item.label} 즐겨찾기`}
                    title={full ? '즐겨찾기는 4개까지예요' : fav >= 0 ? '즐겨찾기 빼기' : '즐겨찾기'}
                    disabled={full}
                    onClick={() => toggleFavorite(item.id)}
                  >
                    {fav >= 0 ? '★' : '☆'}
                  </button>
                  {fav >= 0 && <span className="emote-key" aria-hidden>{FAVORITE_LABELS[fav]}</span>}
                </div>
              );
            })}
          </div>
          <p className="emote-hint">I 열기·닫기 · ☆ 즐겨찾기(4개) → A S D F</p>
        </div>,
        document.body,
      )}
    </>
  );
}
