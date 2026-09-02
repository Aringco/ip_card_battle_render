'use client';

import { useId } from 'react';
import type { FloatingTextItem } from '@/hooks/useAnimationQueue';

interface LeafParticle {
  id: number;
  x: number; // vw %
  delay: number; // ms
  dur: number; // ms
  drift: number; // px
}

function generateLeaves(count: number, seed: number): LeafParticle[] {
  const leaves: LeafParticle[] = [];
  for (let i = 0; i < count; i++) {
    // deterministic-ish from seed + index so re-renders don't change them
    const h = ((seed * 31 + i * 127) % 100 + 100) % 100;
    leaves.push({
      id: seed * 100 + i,
      x: (h * 1.7 + i * 11.3) % 90 + 5, // 5-95 vw
      delay: (i * 180) % 600,
      dur: 1800 + (h % 700),
      drift: ((i * 37 + h) % 80) - 40,
    });
  }
  return leaves;
}

export function EffectLayer({
  leafParticleCount,
  floatingTexts,
}: {
  leafParticleCount: number;
  floatingTexts: FloatingTextItem[];
}) {
  const seedId = useId();
  const seed = seedId.charCodeAt(1) || 7;

  const leaves =
    leafParticleCount > 0 ? generateLeaves(leafParticleCount, seed) : [];

  if (leaves.length === 0 && floatingTexts.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" style={{ zIndex: 40 }}>
      {/* 나뭇잎 낙하 파티클 */}
      {leaves.map(leaf => (
        <span
          key={leaf.id}
          className="leaf-particle"
          style={{
            left: `${leaf.x}vw`,
            top: 0,
            '--leaf-drift': `${leaf.drift}px`,
            '--leaf-dur': `${leaf.dur}ms`,
            '--leaf-delay': `${leaf.delay}ms`,
          } as React.CSSProperties}
        >
          🍃
        </span>
      ))}

      {/* 플로팅 텍스트 — 팀 패널 위에 표시 */}
      {floatingTexts.map(ft => (
        <div
          key={ft.id}
          className={`float-text float-text-${ft.type}`}
          style={{
            /* 팀 A = 왼쪽 패널, 팀 B = 오른쪽 패널 */
            left: ft.team === 'A' ? '3.5rem' : 'auto',
            right: ft.team === 'B' ? '3.5rem' : 'auto',
            top: '38%',
          }}
        >
          {ft.text}
        </div>
      ))}
    </div>
  );
}
