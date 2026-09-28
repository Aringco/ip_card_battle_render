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

// 배경 그림은 여러 장을 **번갈아** 보여준다. 경로는 lobbyAssets.ts 한 곳에 있다.
const LOADING_BACKGROUNDS = [LOBBY_ASSETS.loading, LOBBY_ASSETS.loading2, LOBBY_ASSETS.loading3];
// 한 장이 머무는 시간과 넘어가는 데 걸리는 시간.
// ⚠️ 이 둘은 CSS(.loading-bg-layer의 transition)와 **짝**이다 — 페이드가 머무는 시간보다
// 길면 그림이 제 모습으로 서 있는 순간이 사라져 두 장이 겹친 잔상만 보인다.
const SLIDE_HOLD_MS = 2500;
const SLIDE_FADE_MS = 500;

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
  /**
   * 지금 보이는 배경의 차례. **언제나 0번(loading_bg)으로 시작해 적힌 순서대로** 넘어간다
   * (loading → loading2 → loading3 → 다시 loading …).
   *
   * ⚠️ 첫 장을 무작위로 만들려 한 적이 있는데(2026-09-29) 되돌렸다. 이 페이지는 정적으로
   *    미리 그려져 나가고 그 HTML이 JS보다 먼저 화면에 칠해지므로, "마운트 후에 고르는"
   *    방식으로는 **맨 처음 보이는 것이 언제나 0번**이 된다. 그것을 피하려면 순서가
   *    정해질 때까지 어느 장도 보이지 않게 둬야 하는데, 그러면 첫 그림이 늦게 뜬다.
   *    순서를 바꾸고 싶다면 무작위가 아니라 **LOADING_BACKGROUNDS의 나열 순서**를 고칠 것.
   */
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    setTip(TIPS[Math.floor(Math.random() * TIPS.length)]);
  }, []);

  // 그림이 한 장뿐이면 타이머를 걸지 않는다(끄고 켜는 것이 없다).
  useEffect(() => {
    if (LOADING_BACKGROUNDS.length < 2) return;
    const id = setInterval(() => setSlide(s => (s + 1) % LOADING_BACKGROUNDS.length), SLIDE_HOLD_MS);
    return () => clearInterval(id);
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
      className="fixed inset-0 z-50 flex flex-col items-center justify-start p-6 pt-8 sm:pt-12 bg-[#1d3b2a]"
      style={{ ['--loading-fade' as string]: `${SLIDE_FADE_MS}ms` }}
    >
      {/* 배경 그림은 **겹쳐 깔아 두고 투명도만 바꾼다.** 한 요소의 background-image를
          갈아끼우면 새 그림이 아직 디코딩되지 않은 사이 바탕색이 한 번 드러나 깜빡인다.
          두 장을 같은 자리에 두고 서로 반대로 흐리면 그 틈이 생기지 않는다. */}
      {LOADING_BACKGROUNDS.map((src, i) => (
        <div
          key={src}
          aria-hidden
          className="loading-bg-layer"
          style={{ backgroundImage: `url(${src})`, opacity: i === slide ? 1 : 0 }}
        />
      ))}
      {/* 진행 상황과 문구는 **위쪽**에 모아 둔다. 그림의 주인공 넷이 가운데 아래에
          있어, 가운데 정렬로 두면 그 위를 덮는다.
          반투명 판을 까는 것은 배경이 하늘(밝음)과 나무(어두움)로 갈려 맨글씨로는
          어느 쪽에서도 읽히지 않기 때문이다. */}
      <div className="relative w-full max-w-md rounded-2xl bg-black/45 px-6 py-4 text-center shadow-lg backdrop-blur-[2px]">
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
