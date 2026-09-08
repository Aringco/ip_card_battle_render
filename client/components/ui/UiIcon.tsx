'use client';

import { LOBBY_ASSETS } from '@/lib/lobbyAssets';

/** 시트에서 잘라낸 UI 아이콘 이름 — lobbyAssets.ts의 키와 같다. */
export type UiIconName = 'iconStart' | 'iconCreate' | 'iconCog' | 'iconRank' | 'iconHelp';

/**
 * 버튼·제목 앞에 붙는 그림 아이콘.
 *
 * 이모지를 대신하는 자리이므로 **글자와 같은 줄에 서고 글자 크기를 따라간다** —
 * `em` 단위로 크기를 잡아, 글씨 크기 설정(⚙️ 5단계)을 바꿔도 아이콘만 따로 놀지 않는다.
 *
 * 아이콘 그림에는 글씨가 들어 있지 않다(받은 시트가 이미 아이콘만 담고 있다). 라벨은 늘 이
 * 컴포넌트 **바깥**에 HTML로 쓴다 — 글꼴을 바꾸거나 문구를 고칠 때 그림을 다시 만들지
 * 않아도 되고, 스크린리더도 읽을 수 있다. 그래서 이 img는 alt를 비우고 aria-hidden이다.
 *
 * 그림 **자체가 버튼**인 자리에는 이것 말고 아래 `IconButton`을 쓴다.
 */
export function UiIcon({
  name,
  className = '',
}: {
  name: UiIconName;
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

/**
 * 그림 하나가 곧 버튼인 자리 — 배경·테두리·안여백 없이 아이콘만 놓는다.
 *
 * **글자가 화면에 남지 않으므로 `label`이 곧 이 버튼의 이름이다.** `aria-label`로 스크린
 * 리더에, `title`로 마우스 툴팁에 함께 실린다 — 둘 중 하나만 주면 한쪽 사용자가 무슨
 * 버튼인지 알 길이 없어진다.
 *
 * 크기는 `size`(px)가 CSS 변수 `--icon-btn` 하나로 들어간다. `em`이 아니라 px인 이유는
 * globals.css의 `.icon-button` 주석에 있다(로비 폼의 세로 여유가 몇 px 단위다).
 */
export function IconButton({
  name,
  label,
  size,
  onClick,
  disabled,
  className = '',
  children,
}: {
  name: UiIconName;
  label: string;
  /** 한 변의 길이(px). 그림이 정사각형 캔버스라 가로·세로가 같다. */
  size: number | string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  /** 아이콘 위에 겹쳐 놓을 배지 등 — 겹치려면 쓰는 쪽에서 relative를 함께 준다. */
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`icon-button ${className}`}
      style={{ '--icon-btn': typeof size === 'number' ? `${size}px` : size } as React.CSSProperties}
    >
      <img src={LOBBY_ASSETS[name]} alt="" aria-hidden draggable={false} />
      {children}
    </button>
  );
}

/** 가로형 나무 팻말 버튼 이름 — lobbyAssets.ts의 키와 같다. */
export type BarButtonName = 'barStart' | 'barSolo';

/**
 * 팻말 그림 한 장이 통째로 버튼인 자리 — 대기실 "게임 시작", 혼자 놀기 "컴퓨터와 대전하기".
 *
 * `IconButton`과 **글씨를 다루는 방식이 정반대다.** 아이콘 쪽은 그림에 글씨가 없어 라벨을
 * HTML로 따로 쓰지만, 이 팻말은 글씨까지 한 장으로 그려져 있다 — 그래서 화면에 글자를
 * 내지 않고 `label`을 `aria-label`·`title`로만 싣는다. 여기에 눈에 보이는 글자를 덧붙이면
 * 같은 말이 두 번 보인다.
 *
 * 크기는 **가로만** 정한다(`maxWidth`). 세로는 `height: auto`라 그림 비율(약 3.1:1)을
 * 그대로 따라간다 — 가로세로를 둘 다 고정하면 팻말이 눌리거나 늘어난다.
 */
export function BarButton({
  name,
  label,
  maxWidth,
  onClick,
  disabled,
  className = '',
}: {
  name: BarButtonName;
  label: string;
  /** 팻말의 최대 가로폭. 좁은 자리에서는 그보다 작아지고, 세로는 비율대로 따라온다. */
  maxWidth: number | string;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`bar-button ${className}`}
      style={{ '--bar-btn': typeof maxWidth === 'number' ? `${maxWidth}px` : maxWidth } as React.CSSProperties}
    >
      <img src={LOBBY_ASSETS[name]} alt="" aria-hidden draggable={false} />
    </button>
  );
}
