'use client';

import { useEffect, useState } from 'react';

/**
 * `until`(내 시계 기준 시각)이 아직 오지 않았는가. 그 시각이 되면 한 번 다시 그려 false로 바뀐다.
 * 0이면 언제나 false — "남은 ms를 받은 순간 환산한 마감"(useWebSocket)을 그대로 넘기면 된다.
 */
export function useBefore(until: number): boolean {
  const [, rerender] = useState(0);
  useEffect(() => {
    if (!until) return;
    const left = until - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => rerender(n => n + 1), left + 20);
    return () => clearTimeout(t);
  }, [until]);
  return until > Date.now();
}
