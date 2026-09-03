'use client';

import { useLayoutEffect, useState } from 'react';
import type { PlayerEmoticon } from '@/hooks/useAnimationQueue';

const SIZE = 180;
// 자리 간격은 이모티콘 크기보다 커야 한다 — 작으면 서로 겹쳐 뒤엣것이 가려진다.
const STACK_STEP = SIZE + 8;
// 앞의 것이 사라져 자리가 비면, 남은 것들이 이 시간에 걸쳐 위로 당겨 올라온다.
const REFLOW_MS = 260;

/**
 * 플레이어 프로필 옆에 뜨는 반응 이모티콘. 같은 사람에게 여러 개가 뜨면 **큐처럼**
 * 동작한다 — 새로 뜬 것은 아래로 한 칸씩 붙고, 맨 앞(가장 오래된) 것이 사라지면 뒤의
 * 것들이 한 칸씩 위로 딸려 올라온다.
 *
 * 그래서 자리 번호를 이모티콘이 만들어질 때 박아두지 않고 **매 렌더마다 현재 목록에서
 * 다시 센다.** 박아두면 앞엣것이 사라져도 뒤엣것은 제자리에 남아 중간이 텅 빈다.
 */
export function PlayerEmoticonLayer({ items }: { items: PlayerEmoticon[] }) {
  // 앵커(팀:플레이어)별로 따로 줄을 세운다 — 서로 다른 사람의 이모티콘은 각자 0번부터.
  const slotOf = new Map<number, number>();
  const filled = new Map<string, number>();
  for (const it of items) {
    const key = `${it.team}:${it.playerIndex}`;
    const slot = filled.get(key) ?? 0;
    slotOf.set(it.id, slot);
    filled.set(key, slot + 1);
  }

  return (
    <>
      {items.map(item => (
        <EmoticonBubble key={item.id} item={item} slot={slotOf.get(item.id) ?? 0} />
      ))}
    </>
  );
}

function EmoticonBubble({ item, slot }: { item: PlayerEmoticon; slot: number }) {
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

  return (
    <span
      style={{
        position: 'fixed',
        left: anchor.x,
        top: anchor.y,
        // 좌우 정렬 + 세로 중앙 맞춤 위에, 큐에서의 자리만큼 아래로 내린다.
        // 자리 이동만 transition을 타므로(등장/퇴장 연출은 안쪽 img의 keyframes 담당),
        // 앞엣것이 사라지는 순간 나머지가 스르륵 위로 올라온다.
        transform: `translate(${onCenterSide ? '0' : '-100%'}, -50%) translateY(${slot * STACK_STEP}px)`,
        transition: `transform ${REFLOW_MS}ms ease-out`,
        zIndex: 80 + slot,
        pointerEvents: 'none',
      }}
    >
      <img
        src={`/emoticon/${item.file}.png`}
        alt=""
        // persist는 등장까지만 재생하고 그대로 멈춘다(페이드아웃 없음) — 제거 타이머도
        // 없어서, 화면이 종료 화면으로 넘어갈 때까지 그 표정 그대로 남는다.
        className={`player-emoticon${item.persist ? ' is-staying' : ''}`}
        style={{ width: SIZE, height: SIZE }}
      />
    </span>
  );
}
