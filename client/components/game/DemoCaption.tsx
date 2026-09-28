'use client';

import { useEffect } from 'react';
import type { DemoView } from 'shared';

/**
 * 시연 모드의 설명 자막 — 타이머 창이 있던 자리를 그대로 쓴다.
 *
 * ⚠️ **같은 상자(.play-prompt-strip) 안에 들어간다.** 새 줄을 만들어 끼우면 액자 칸이
 *    통째로 밀려 그 아래 카드 다섯 장의 자리가 어긋난다. 시연에는 턴 타이머가 없으므로
 *    (서버가 아예 안 건다) 그 자리를 비워 두느니 설명이 쓰는 편이 맞다.
 *
 * `waiting`이 'continue'면 짝이 맞아 판이 멈춰 선 상태다 — 이때만 버튼이 뜨고,
 * 누르면 그제야 정산 연출이 재생된다(요구 1-3 → 1-4의 순서).
 */

/**
 * [계속 ▶]을 누르는 사람은 **진행자**다(관람객이 아니다) — 그래서 마우스를 찾지 않아도
 * 되게 키보드로도 받는다. 발표용 리모컨(클리커)은 대개 PageDown/PageUp이나 방향키를
 * 보내므로 그 둘까지 함께 받아 두면 손에 든 클리커로 그대로 넘길 수 있다.
 */
const CONTINUE_KEYS = [' ', 'Enter', 'PageDown', 'ArrowRight'];

export function DemoCaption({ demo, onContinue }: { demo: DemoView; onContinue: () => void }) {
  const waitingContinue = demo.waiting === 'continue';

  useEffect(() => {
    // ⚠️ 멈춰 선 동안에만 듣는다 — 늘 듣고 있으면 진행자가 무심코 누른 스페이스가
    //    멈출 자리도 아닌 곳에서 서버로 날아간다(서버는 무시하지만 소음이다).
    if (!waitingContinue) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !CONTINUE_KEYS.includes(e.key)) return;
      // 기본 동작을 끊는다 — 스페이스는 화면을 스크롤하고, 방금 마우스로 누른 [계속]에
      // 포커스가 남아 있으면 그 버튼까지 한 번 더 눌러 두 번 진행된다.
      e.preventDefault();
      onContinue();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [waitingContinue, onContinue]);

  return (
    <div className="demo-caption">
      {/* 장이 여럿이라 진행도만으로는 어디인지 알 수 없다 — "2장 · 3/5"로 함께 보여준다. */}
      <span className="demo-caption-step tabular-nums">
        {demo.chapter}장 · {demo.step}/{demo.total}
      </span>
      <p className="demo-caption-text">{demo.caption}</p>
      {waitingContinue && (
        <button
          type="button"
          className="demo-caption-button font-bold"
          onClick={onContinue}
          aria-keyshortcuts="Space Enter PageDown ArrowRight"
        >
          계속 ▶<span className="demo-caption-key">Space</span>
        </button>
      )}
    </div>
  );
}
