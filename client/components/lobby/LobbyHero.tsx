'use client';

import { LOBBY_ASSETS } from '@/lib/lobbyAssets';

/**
 * 로비 상단 로고 — 투명 배경의 "떱카드 T.U.P.D." 엠블럼.
 *
 * object-contain이라 이미지 세로가 슬롯을 넘지 않는다(잘리지 않고 전체가 보인다).
 * 배경이 이미 카드테이블 일러스트이므로 로고에는 별도의 박스·테두리를 두지 않는다 —
 * 엠블럼이 펠트 위에 그대로 얹힌 것처럼 보이게 하는 것이 목적.
 */
export function LobbyHero({ onHowTo }: { onHowTo: () => void }) {
  return (
    <div className="relative w-full h-full flex items-end justify-center">
      <h1 className="sr-only">떱카드 T.U.P.D. — 한국특허정보원 카드배틀</h1>

      <img
        src={LOBBY_ASSETS.logo}
        alt=""
        aria-hidden="true"
        className="lobby-hero-logo object-contain object-bottom select-none pointer-events-none
                   drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
      />

      <button
        type="button"
        onClick={onHowTo}
        className="absolute bottom-0 right-0 z-20 text-xs md:text-sm font-semibold text-jungle-900
                   bg-white/85 hover:bg-white px-3 py-1.5 rounded-full transition shadow-lg"
      >
        📖 게임 방법
      </button>
    </div>
  );
}
