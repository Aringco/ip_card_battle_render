'use client';

import type { DemoView } from 'shared';

/**
 * 시연 모드의 설명 자막 — 타이머 창이 있던 자리를 그대로 쓴다.
 *
 * ⚠️ **같은 상자(.play-prompt-strip) 안에 들어간다.** 새 줄을 만들어 끼우면 액자 칸이
 *    통째로 밀려 그 아래 카드 다섯 장의 자리가 어긋난다. 시연에는 턴 타이머가 없으므로
 *    (서버가 아예 안 건다) 그 자리를 비워 두느니 설명이 쓰는 편이 맞다.
 *
 * `waiting`이 'continue'면 짝이 맞아 판이 멈춰 선 상태다 — 이때만 버튼이 뜨고,
 * 관람객이 누르면 그제야 정산 연출이 재생된다(요구 1-3 → 1-4의 순서).
 */
export function DemoCaption({ demo, onContinue }: { demo: DemoView; onContinue: () => void }) {
  return (
    <div className="demo-caption">
      <span className="demo-caption-step tabular-nums">
        {demo.step} / {demo.total}
      </span>
      <p className="demo-caption-text">{demo.caption}</p>
      {demo.waiting === 'continue' && (
        <button type="button" className="demo-caption-button font-bold" onClick={onContinue}>
          계속 ▶
        </button>
      )}
    </div>
  );
}
