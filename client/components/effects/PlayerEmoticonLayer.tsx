'use client';

import { useLayoutEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { PlayerEmoticon } from '@/hooks/useAnimationQueue';

export function PlayerEmoticonLayer({ items }: { items: PlayerEmoticon[] }) {
  return (
    <>
      {items.map(item => (
        <EmoticonBubble key={item.id} item={item} />
      ))}
    </>
  );
}

function EmoticonBubble({ item }: { item: PlayerEmoticon }) {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);

  // 왼쪽 팀(A)은 프로필 오른쪽(보드 쪽)에, 오른쪽 팀(B)은 프로필 왼쪽(보드 쪽)에 붙인다.
  const onCenterSide = item.team === 'A';

  useLayoutEffect(() => {
    const el = document.querySelector(`[data-player-anchor="${item.team}:${item.playerIndex}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    setAnchor({
      x: onCenterSide ? r.right + 12 : r.left - 12,
      y: r.top + r.height / 2,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  if (!anchor) return null;

  const size = 180;
  const STACK_STEP = 60; // 새 이모티콘이 기존 것 아래로 쌓이는 간격(px)

  return (
    <span
      style={{
        position: 'fixed',
        left: anchor.x,
        top: anchor.y,
        transform: `translate(${onCenterSide ? '0' : '-100%'}, -50%)`,
        zIndex: 80 + item.stackIndex,
        pointerEvents: 'none',
      }}
    >
      <img
        src={`/emoticon/${item.file}.png`}
        alt=""
        className="player-emoticon"
        style={{ width: size, height: size, '--stack-offset': `${item.stackIndex * STACK_STEP}px` } as CSSProperties}
      />
    </span>
  );
}
