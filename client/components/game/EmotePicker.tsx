'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EmoteCategory } from 'shared';
import { EMOTE_CATEGORIES, EMOTE_MIN_INTERVAL_MS } from 'shared';

const PANEL_W = 312;
const VIEW_MARGIN = 8;

/**
 * 개인전 감정표현 — 내 정보창 위의 [감정표현] 버튼과, 누르면 열리는 그림 고르기 창.
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
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const coolTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (coolTimer.current) clearTimeout(coolTimer.current); }, []);

  // 창 자리 — 버튼의 오른쪽(판 쪽)에 붙이고, 화면 밖으로 나가면 안으로 끌어온다.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const b = buttonRef.current?.getBoundingClientRect();
      if (!b) return;
      const h = panelRef.current?.offsetHeight ?? 0;
      const left = Math.min(b.right + 8, window.innerWidth - PANEL_W - VIEW_MARGIN);
      const top = Math.max(VIEW_MARGIN, Math.min(b.top, window.innerHeight - h - VIEW_MARGIN));
      setPos({ left: Math.max(VIEW_MARGIN, left), top });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, tab]);

  // 바깥을 누르거나 Esc면 닫는다
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (id: string) => {
    if (cooling) return;
    onSend(id);
    setOpen(false);
    // 서버의 과속 방어(EMOTE_MIN_INTERVAL_MS)와 같은 시간만큼 버튼을 잠근다 — 눌렀는데 아무것도 안 뜨는 일이 없게
    setCooling(true);
    coolTimer.current = setTimeout(() => setCooling(false), EMOTE_MIN_INTERVAL_MS);
  };

  const category = EMOTE_CATEGORIES.find(c => c.id === tab) ?? EMOTE_CATEGORIES[0];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="emote-button"
        aria-label="감정표현"
        title="감정표현"
        aria-expanded={open}
        disabled={cooling}
        onClick={() => setOpen(o => !o)}
      >
        <img src="/emoticon/hands/wave.webp" alt="" draggable={false} />
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label="감정표현 고르기"
          className="emote-panel"
          style={{ width: PANEL_W, left: pos?.left ?? -9999, top: pos?.top ?? -9999 }}
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
          <div role="tabpanel" className="emote-grid">
            {category.items.map(item => (
              <button
                key={item.id}
                type="button"
                className="emote-cell"
                title={item.label}
                aria-label={item.label}
                onClick={() => pick(item.id)}
              >
                <img src={item.src} alt="" draggable={false} loading="lazy" />
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
