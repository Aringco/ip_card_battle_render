'use client';

import { useState } from 'react';
import type { Place } from 'shared';

const PRESS_DUR = 180;

export function PlaceTile({
  place,
  disabled,
  onClick,
  showGuide,
}: {
  place: Place;
  disabled: boolean;
  onClick: (place: Place) => void;
  showGuide?: boolean; // 첫 턴에만 "여길 눌러보세요" 손가락 가이드를 보여준다
}) {
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    if (disabled) return;
    setPressed(true);
    setTimeout(() => setPressed(false), PRESS_DUR);
    onClick(place);
  };

  return (
    // 가이드 손가락은 버튼 위쪽 경계 밖으로 살짝 튀어나가도록 배치되는데, 버튼 자체가
    // (모서리를 둥글게 다듬으려고) overflow-hidden이라 그 안에 두면 튀어나온 부분이
    // 잘려 보인다. 그래서 가이드는 이 바깥의, 잘리지 않는 래퍼에 그린다.
    <div className="relative w-full h-full">
      <button
        data-place-key={place}
        onClick={handleClick}
        disabled={disabled}
        className={`relative w-full h-full rounded-2xl overflow-hidden select-none ${
          disabled ? 'pointer-events-none' : 'cursor-pointer'
        } ${pressed ? 'place-tile-pressed' : ''}`}
      >
        {/* 배경을 어둡게/밝게 하는 filter는 이 배경 레이어에만 걸어야 한다 — 버튼 전체에
            걸면 그 위의 장소 라벨까지 함께 어두워져 거의 안 보인다(스킬 선택 패널에서
            겪었던 것과 같은 문제). */}
        <div
          className={`place-tile absolute inset-0 ${disabled ? 'place-tile-disabled' : 'place-tile-active'}`}
          style={{ backgroundImage: `url(/places/${place}.png)` }}
        />

        {/* 장소 설명 라벨 — object-contain으로 타일 너비/높이에 맞춰 함께 축소·확대된다 */}
        <img
          src={`/places/${place}_text.png`}
          alt=""
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
        />
      </button>

      {showGuide && (
        <span className="place-guide-finger" aria-hidden>
          👇
        </span>
      )}
    </div>
  );
}
