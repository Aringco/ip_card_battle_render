'use client';

import { useEffect, useState } from 'react';
import { startPreload, subscribePreload, type PreloadProgress } from '@/lib/preload';
import { LOBBY_ASSETS } from '@/lib/lobbyAssets';

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
    // 바탕색은 그림이 도착하기 전 한 프레임을 채운다 — 밝은 초록(bg-green-50)에서
    // 짙은 숲색으로 바꿨다. 위에 얹는 글자가 흰 계열이라 밝은 바탕에서는 첫 프레임에
    // 글씨가 사라진 것처럼 보인다.
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-start p-6 pt-8 sm:pt-12 bg-[#1d3b2a] bg-cover bg-center"
      style={{ backgroundImage: `url(${LOBBY_ASSETS.loading})` }}
    >
      {/* 진행 상황과 문구는 **위쪽**에 모아 둔다. 그림의 주인공 넷이 가운데 아래에
          있어, 가운데 정렬로 두면 그 위를 덮는다.
          반투명 판을 까는 것은 배경이 하늘(밝음)과 나무(어두움)로 갈려 맨글씨로는
          어느 쪽에서도 읽히지 않기 때문이다. */}
      <div className="w-full max-w-md rounded-2xl bg-black/45 px-6 py-4 text-center shadow-lg backdrop-blur-[2px]">
        <h1 className="text-3xl animate-pulse">🐑🐰🧜‍♀️🐯</h1>
        <h2 className="mb-3 text-xl font-black text-[#fdf3dd]">한국특허정보원 카드배틀</h2>

        <div className="h-3 overflow-hidden rounded-full bg-black/45">
          <div
            className="h-full rounded-full bg-lime-400 transition-[width] duration-200 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
        <p className="mt-2 text-sm font-semibold tabular-nums text-[#f4e6c4]">
          카드와 소리를 준비하는 중… {percent}%
          <span className="ml-1 font-normal text-[#f4e6c4]/70">
            ({progress.loaded}/{progress.total})
          </span>
        </p>

        <p className="mt-3 text-xs leading-relaxed text-[#ecdcba]/90">💡 {tip}</p>
      </div>
    </div>
  );
}
