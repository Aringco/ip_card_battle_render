'use client';

import { LOBBY_ASSETS } from '@/lib/lobbyAssets';
import Link from 'next/link';
import { IconButton } from '@/components/ui/UiIcon';
import { PLAY_ASSETS } from '@/lib/playAssets';

/** 게임 방법 버튼의 한 변(px). 아이콘 원본 256px의 0.2배. */
const HOW_TO_ICON_PX = 51;

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
      <h1 className="sr-only">TUPD — 떱카드 T.U.P.D.</h1>

      <img
        src={LOBBY_ASSETS.logo}
        alt=""
        aria-hidden="true"
        className="lobby-hero-logo object-contain object-bottom select-none pointer-events-none
                   drop-shadow-[0_6px_14px_rgba(0,0,0,0.45)]"
      />

      {/* 그림 자체가 버튼이다 — 흰 알약 배경을 걷어내고 책+돋보기 아이콘만 남겼다.
          배경이 사라져 글자를 얹을 자리도 없어졌으므로, 버튼 이름은 IconButton이
          aria-label·title로 대신 싣는다. */}
      <IconButton
        name="iconHelp"
        label="게임 방법"
        size={HOW_TO_ICON_PX}
        onClick={onHowTo}
        className="absolute bottom-0 right-0 z-20"
      />

      {/* 도토리 증강 카드(갤러리 북 · 상점 · 팩 열기 — app/cards/). 게임 방법 버튼과 마주 보는 왼쪽 아래 —
          absolute라 로비 배치를 밀지 않는다 */}
      <Link href="/cards" className="lobby-cards-link absolute bottom-0 left-0 z-20">
        <img src={PLAY_ASSETS.iconAcorn} alt="" aria-hidden draggable={false} />
        <span>도토리 카드</span>
      </Link>
    </div>
  );
}
