'use client';

/**
 * 나무 팻말 버튼 — 빈 나무판 그림 위에 글씨를 HTML로 얹는다.
 *
 * 이 프로젝트에는 그림 버튼이 셋 있고 쓰임이 다르다.
 *
 * | | 그림 | 글씨 | 크기 |
 * | --- | --- | --- | --- |
 * | `IconButton` | 아이콘 한 장 | 그림에 없음 → `aria-label`만 | 정사각형 한 변 |
 * | `BarButton`  | 글씨까지 그려진 완성 팻말 | **그림 안에 있음** → 라벨 안 씀 | 가로만 |
 * | `PlankButton`| 빈 나무판(9분할) | **HTML로 얹는다** | 글자 길이를 따라감 |
 *
 * 이 컴포넌트를 쓰는 자리는 문구가 상태에 따라 바뀌는 버튼들이다("준비" ↔ "준비 완료 ✓",
 * "규칙 적용" ↔ "적용됨 ✓"). 그림에 글씨가 박혀 있으면 그런 자리에는 쓸 수 없다.
 *
 * 판이 늘어나는 방식(9분할 슬라이스와 테두리 두께의 비율)은 globals.css의
 * `.plank-button` 주석에 있다 — 한쪽 숫자만 고치면 마구리가 눌린다.
 */
export function PlankButton({
  children,
  onClick,
  disabled,
  /** 부모 폭을 꽉 채운다 — 대기실의 준비 버튼처럼 한 줄을 통째로 쓰는 자리 */
  block,
  className = '',
  style,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  block?: boolean;
  className?: string;
  /** 주로 maxWidth — 넓은 카드에서 팻말이 지나치게 길어지는 것을 막는다 */
  style?: React.CSSProperties;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`plank-button ${block ? 'w-full' : ''} ${className}`}
      style={style}
    >
      {children}
    </button>
  );
}
