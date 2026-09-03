'use client';

import { useState } from 'react';

const PRESS_DUR = 180;

/**
 * 로비의 큰 카드형 선택 버튼 (싱글플레이 / 멀티플레이 / 방 만들기 / 방 참가하기).
 *
 * 인터랙션 문법을 게임 화면의 장소 타일(PlaceTile)과 일부러 똑같이 맞췄다 —
 * 평소엔 어둡게 깔려 있다가 hover/focus 시 밝아지고, 누르면 살짝 눌린다.
 * 로비에서 미리 익힌 감각이 게임 안에서 그대로 통하도록 하기 위한 것.
 *
 * 크기는 스스로 정하지 않는다(부모 .stage-col이 정한다) — 스테이지 전환 중
 * 열 폭이 애니메이션되는 동안 패널이 그 폭을 그대로 따라야 하기 때문.
 */
export function ModePanel({
  bgSrc,
  emoji,
  title,
  subtitle,
  disabled = false,
  onClick,
  className = '',
  panelRef,
}: {
  bgSrc: string;
  emoji: string;
  title: string;
  subtitle: string;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
  panelRef?: React.Ref<HTMLButtonElement>;
}) {
  const [pressed, setPressed] = useState(false);

  const handleClick = () => {
    if (disabled) return;
    setPressed(true);
    setTimeout(() => setPressed(false), PRESS_DUR);
    onClick();
  };

  return (
    <button
      ref={panelRef}
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className={`lobby-panel relative rounded-2xl overflow-hidden select-none text-white ${
        disabled ? 'lobby-panel-disabled' : 'lobby-panel-active cursor-pointer'
      } ${pressed ? 'lobby-panel-pressed' : ''} ${className}`}
    >
      {/* 배경만 어두웠다 밝아진다 — 텍스트에까지 filter가 걸리면 글자가 흐려진다 */}
      <span className="lobby-panel-bg" style={{ backgroundImage: `url(${bgSrc})` }} />

      {/* 폼이 열리면 이 라벨만 페이드아웃하고 배경은 남는다 */}
      <span className="stage-panel-label absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
        <span className="text-4xl md:text-5xl mb-1" aria-hidden="true">
          {emoji}
        </span>
        <span className="text-xl md:text-2xl font-extrabold drop-shadow">{title}</span>
        <span className="text-xs md:text-sm text-white/85 leading-snug">{subtitle}</span>
      </span>
    </button>
  );
}
