'use client';

import { useEffect, useState } from 'react';
import { startPreload, subscribePreload, type PreloadProgress } from '@/lib/preload';

const TIPS = [
  '같은 동물 카드가 짝수 장 모이는 순간, 그 동물 카드를 통째로 가져옵니다.',
  '턴이 끝나면 경험치가 쌓인 동물의 행동을 하나 고를 수 있어요.',
  '🧜‍♀️ 디자인어를 쓰면 다음 행동이 레벨만큼 더 발동해요. 다른 행동을 쓰면 사라집니다.',
  '🐑 실용신양은 다음 내 턴에 추가로 카드를 뽑게 해줍니다.',
  '🐯 특허랑이는 상대가 가진 만큼만 체력을 빼앗아옵니다(오버킬 없음).',
  '도토리 축제가 시작되면 매 턴 추가 뽑기가 계속됩니다.',
];

/**
 * 게임에 쓰이는 효과음·이미지를 전부 받아올 때까지 보여주는 로딩 화면.
 * 프리로드가 끝나면 onDone()으로 알린다(이미 끝나 있으면 즉시 호출).
 */
export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const [progress, setProgress] = useState<PreloadProgress>({ loaded: 0, total: 0, ratio: 0, done: false });
  // 서버 렌더링과 클라이언트 첫 렌더가 항상 같은 값(TIPS[0])으로 시작해야 hydration
  // mismatch가 안 생긴다 — Math.random()을 렌더 중에 바로 쓰면 서버·클라이언트가 각자
  // 다른 값을 뽑아 경고가 뜨고, 운 나쁘면 문구가 잠깐 바뀌는 게 눈에 보인다. 무작위
  // 선택은 마운트 후 이 effect에서만 한다(React가 공식 권장하는 방식).
  const [tip, setTip] = useState<string>(TIPS[0]);

  useEffect(() => {
    setTip(TIPS[Math.floor(Math.random() * TIPS.length)]);
  }, []);

  useEffect(() => {
    startPreload();
    return subscribePreload(setProgress);
  }, []);

  useEffect(() => {
    if (progress.done) onDone();
  }, [progress.done, onDone]);

  const percent = Math.round(progress.ratio * 100);

  return (
    <div className="fixed inset-0 z-50 bg-green-50 flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl mb-2 animate-pulse">🐑🐰🧜‍♀️🐯</h1>
      <h2 className="text-xl font-semibold text-green-800 mb-8">한국특허정보원 카드배틀</h2>

      <div className="w-full max-w-xs">
        <div className="h-3 rounded-full bg-green-200 overflow-hidden">
          <div
            className="h-full bg-green-600 rounded-full transition-[width] duration-200 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-center text-sm text-green-700 font-semibold tabular-nums">
          카드와 소리를 준비하는 중… {percent}%
          <span className="ml-1 text-green-600/70 font-normal">
            ({progress.loaded}/{progress.total})
          </span>
        </p>
      </div>

      <p className="mt-8 max-w-sm text-center text-xs text-green-700/80 leading-relaxed">💡 {tip}</p>
    </div>
  );
}
