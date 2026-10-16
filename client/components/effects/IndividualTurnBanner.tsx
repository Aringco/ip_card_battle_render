'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ClientGameState, SideId } from 'shared';
import { sideColor, sideName } from '@/lib/individual';

interface Announcement {
  id: number;
  text: string;
  tier: 'mine' | 'enemy';
  style?: CSSProperties;
}

const DUR_MS = 1400;
let idCounter = 0;

/**
 * 개인전의 턴 시작 알림 — 팀전 TurnAnnounceBanner를 본떴다. 팀전판은 "내 차례/우리팀 차례/상대 차례"를
 * 말하고 관전 시점에는 팀 팔레트(A·B)를 읽는데, 개인전은 **누구 차례인지를 이름과 그 사람의 색**으로 알린다.
 *
 * 기준은 화면상 차례(displayedActiveTeam) — 정산 연출이 끝나야 바뀌는 값이라, 카드 연출이 아직 재생 중인데
 * 알림이 먼저 뜨는 일이 없다.
 */
export function IndividualTurnBanner({
  gameState,
  activeTeam,
  mySide,
}: {
  gameState: ClientGameState;
  activeTeam: SideId;
  mySide: SideId | null;
}) {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const prevKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (gameState.phase !== 'playing') return;
    // 순위가 정해진 사람의 차례는 없다 — 그 키가 오면 건너뛴다.
    const key = `${mySide}:${activeTeam}`;
    if (prevKeyRef.current === key) return;
    prevKeyRef.current = key;

    const color = sideColor(gameState, activeTeam);
    const mine = mySide !== null && activeTeam === mySide;
    const id = ++idCounter;
    setAnnouncement(
      mine
        ? { id, text: '내 차례', tier: 'mine' }
        : {
            id,
            text: `${sideName(gameState, activeTeam)} 님 차례`,
            tier: 'enemy',
            // 그 사람의 색으로 테두리·글자·그림자를 맞춘다(색 옆에 이름이 있으므로 색만으로 구분하지 않는다).
            style: {
              fontSize: '2.2rem',
              color: `color-mix(in srgb, ${color} 55%, #2b1a0a)`,
              border: `4px solid ${color}`,
              outline: `4px solid color-mix(in srgb, ${color} 25%, #ffffff)`,
              outlineOffset: 4,
              boxShadow: `0 14px 34px color-mix(in srgb, ${color} 55%, transparent)`,
            },
          },
    );
    const t = setTimeout(() => setAnnouncement(prev => (prev?.id === id ? null : prev)), DUR_MS);
    return () => clearTimeout(t);
    // gameState는 이름·색을 읽을 때만 쓴다 — 키(누구 차례인가)가 바뀔 때만 새로 띄운다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTeam, mySide]);

  if (!announcement) return null;
  return (
    <div
      key={announcement.id}
      className={`turn-announce-banner turn-announce-${announcement.tier}`}
      style={announcement.style}
      aria-hidden
    >
      {announcement.text}
    </div>
  );
}
