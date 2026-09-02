'use client';

import type { CSSProperties } from 'react';
import type { Team } from 'shared';

const NOTE_COUNT = 5;

// 디자인어 스킬 발동 — 발동한 팀 쪽 모서리에 큰 인어가 떠오르며 음표가 흩날린다.
export function MermaidPopup({ team }: { team: Team }) {
  const side = team === 'A' ? 'left' : 'right';

  return (
    <div className={`mermaid-popup ${side}`} aria-hidden>
      <span className="mermaid-popup-body">🧜‍♀️</span>
      {Array.from({ length: NOTE_COUNT }, (_, i) => {
        const angle = (360 / NOTE_COUNT) * i;
        const dist = 40 + (i % 3) * 15;
        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad) * dist;
        const y = Math.sin(rad) * dist - 20;
        return (
          <span
            key={i}
            className="mermaid-note"
            style={
              {
                '--note-x': `${x}px`,
                '--note-y': `${y}px`,
                '--note-rot': `${(i % 2 ? 1 : -1) * 20}deg`,
                animationDelay: `${i * 60}ms`,
              } as CSSProperties
            }
          >
            ♪
          </span>
        );
      })}
    </div>
  );
}
