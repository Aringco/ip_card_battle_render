'use client';

import { useState } from 'react';
import type { Place, Team } from 'shared';
import { GuideFinger } from './GuideFinger';

const PRESS_DUR = 180;

export function PlaceTile({
  place,
  disabled,
  forbidden = false,
  onClick,
  showGuide,
  guideTeam = null,
}: {
  place: Place;
  disabled: boolean;
  // 직전 턴에 이미 이 장소에서 뽑아서, 이번 턴엔 규칙상 고를 수 없다(50% 검은 배경 +
  // 흰색 금지 마크). disabled(내 차례가 아님)와는 별개 이유라 시각 표현도 다르게 둔다 —
  // disabled는 4칸 전부 흐리게, forbidden은 이 한 칸만 검게 덮고 금지 마크를 얹는다.
  forbidden?: boolean;
  onClick: (place: Place) => void;
  showGuide?: boolean; // 내가 장소를 고를 수 있는 턴마다 "여길 눌러보세요" 손가락 가이드를 보여준다(설정에서 끌 수 있음)
  // 관전 시점일 때만 채워진다 — 지금 장소를 고르는 팀. 손가락이 그 팀 색의 반투명
  // 손가락으로 바뀌어, 누를 수 있다는 권유가 아니라 진행 상황 중계임을 드러낸다.
  guideTeam?: Team | null;
}) {
  const [pressed, setPressed] = useState(false);
  const blocked = disabled || forbidden;

  const handleClick = () => {
    if (blocked) return;
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
        disabled={blocked}
        // 나무 액자를 걷었다 — 카드판 자체가 이미 액자에 담겨 있어, 그 안의 네 칸까지
        // 액자를 두르면 나무가 두 겹이 된다(가안도 장소 칸은 사진만 둔다).
        // play-frame-inset은 남겨 둔다 — --frame-inset이 없으면 0이라 사진이 칸을 꽉 채운다.
        className={`relative w-full h-full rounded-2xl overflow-hidden select-none ${
          blocked ? 'pointer-events-none' : 'cursor-pointer'
        } ${pressed ? 'place-tile-pressed' : ''}`}
      >
        {/* 배경을 어둡게/밝게 하는 filter는 이 배경 레이어에만 걸어야 한다 — 버튼 전체에
            걸면 그 위의 장소 라벨까지 함께 어두워져 거의 안 보인다(스킬 선택 패널에서
            겪었던 것과 같은 문제). forbidden은 disabled 취급하지 않는다 — 아래 검은
            오버레이 하나로 충분해서, 배경 이미지 자체를 또 흐리게 하면 이중으로 탁해진다. */}
        {/* play-frame-inset — 사진은 액자 **안쪽** 사각형에 들어간다. inset-0으로 두면
            사진이 상자를 꽉 채우고 액자가 그 위를 덮어, 사진이 액자 밖으로 비어져
            나온 것처럼 보인다. */}
        <div
          className={`place-tile play-frame-inset absolute ${disabled ? 'place-tile-disabled' : 'place-tile-active'}`}
          style={{ backgroundImage: `url(/places/${place}.png)` }}
        />

        {/* 장소 설명 라벨 — object-contain으로 타일 너비/높이에 맞춰 함께 축소·확대된다 */}
        {/* ⚠️ 래퍼가 필요하다. `<img>`를 직접 `play-frame-inset`으로 앉히면 안 된다 —
            절대배치된 **대체 요소**의 `width: auto`는 네 변(inset)이 아니라 그림의
            **내재 크기**로 풀려, object-contain이 먹지 않고 라벨이 잘린다(실제로 잘렸다). */}
        <div className="play-frame-inset absolute pointer-events-none select-none">
          <img src={`/places/${place}_text.png`} alt="" className="w-full h-full object-contain" />
        </div>

        {forbidden && (
          <div className="place-forbidden-overlay play-frame-inset absolute flex items-center justify-center" aria-hidden>
            <svg viewBox="0 0 100 100" className="place-forbidden-mark">
              <circle cx="50" cy="50" r="40" fill="none" stroke="#ffffff" strokeWidth="11" />
              <line x1="21" y1="21" x2="79" y2="79" stroke="#ffffff" strokeWidth="11" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </button>

      {showGuide && <GuideFinger team={guideTeam} />}
    </div>
  );
}
