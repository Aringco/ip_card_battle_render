'use client';

import { LOBBY_ASSETS } from '@/lib/lobbyAssets';

/**
 * 버튼·제목 앞에 붙는 그림 아이콘.
 *
 * 이모지를 대신하는 자리이므로 **글자와 같은 줄에 서고 글자 크기를 따라간다** —
 * `em` 단위로 크기를 잡아, 글씨 크기 설정(⚙️ 5단계)을 바꿔도 아이콘만 따로 놀지 않는다.
 *
 * 아이콘 그림에는 글씨가 들어 있지 않다(시트에서 잘라낼 때 제외했다). 라벨은 늘 이
 * 컴포넌트 **바깥**에 HTML로 쓴다 — 글꼴을 바꾸거나 문구를 고칠 때 그림을 다시 만들지
 * 않아도 되고, 스크린리더도 읽을 수 있다. 그래서 이 img는 alt를 비우고 aria-hidden이다.
 */
export function UiIcon({
  name,
  className = '',
}: {
  name: 'iconStart' | 'iconCreate' | 'iconCog' | 'iconRank' | 'iconHelp';
  className?: string;
}) {
  return (
    <img
      src={LOBBY_ASSETS[name]}
      alt=""
      aria-hidden
      draggable={false}
      className={`ui-icon ${className}`}
    />
  );
}
