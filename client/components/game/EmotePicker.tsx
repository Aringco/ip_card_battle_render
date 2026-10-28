'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { EmoteCategory } from 'shared';
import { EMOTE_CATEGORIES, EMOTE_MIN_INTERVAL_MS } from 'shared';

const VIEW_MARGIN = 8;
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

  const category = EMOTE_CATEGORIES.find(c => c.id === tab) ?? EMOTE_CATEGORIES[0];

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="emote-button"
        aria-label={open ? '감정표현 창 닫기' : '감정표현'}
        title={open ? '감정표현 창 닫기' : '감정표현'}
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
            {category.items.map(item => (
              <button
                key={item.id}
                type="button"
                className="emote-cell"
                title={item.label}
                aria-label={item.label}
                disabled={cooling}
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
