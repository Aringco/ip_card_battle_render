'use client';

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { CommentaryLine } from '@/hooks/useAnimationQueue';

export function CommentaryBoard({
  lines,
  overlay,
}: {
  lines: CommentaryLine[];
  overlay?: ReactNode; // 모래시계·안내 문구 — 해설과 겹치면 이 오버레이가 항상 위에 보인다
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 줄이 추가되면 항상 최신 내용이 보이도록 맨 아래로 스크롤.
  // 최대 줄 수(COMMENTARY_MAX)에 도달하면 배열 길이가 더 이상 늘지 않으므로
  // length가 아니라 배열 자체(매번 새 참조로 갱신됨)를 의존성으로 사용해야 한다.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="relative h-20 shrink-0 bg-white rounded-2xl border border-jungle-200 px-4 py-2 overflow-hidden">
      <div ref={scrollRef} className="h-full overflow-y-auto">
        {lines.length === 0 ? (
          <p className="text-sm text-jungle-300">아직 소식이 없습니다.</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {lines.map(line => (
              <li
                key={line.id}
                className={`text-sm leading-snug font-semibold ${
                  line.team === 'A'
                    ? 'text-emerald-700'
                    : line.team === 'B'
                      ? 'text-blue-700'
                      : 'text-jungle-500'
                }`}
              >
                {line.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      {overlay}
    </div>
  );
}
