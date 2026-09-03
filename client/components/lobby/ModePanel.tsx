'use client';

import { useState } from 'react';
import type { PanelTone } from '@/lib/lobbyAssets';

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
  tone,
  artSrc,
  emoji,
  title,
  subtitle,
  disabled = false,
  onClick,
  className = '',
  panelRef,
}: {
  tone: PanelTone;
  /** 패널을 채우는 일러스트. 없으면 tone 그라디언트만으로 그려진다. */
  artSrc?: string;
  /**
   * 제목 위에 얹는 큰 이모지. 아트가 깔린 패널에서는 생략한다 —
   * 그림이 이미 같은 것을 말하고 있어(싱글의 🤖는 그림 속 로봇 얼굴 위에 그대로 겹쳤다)
   * 한 번 더 그리면 중복이자 방해다. 아트가 없는 패널에서는 유일한 아이콘이라 남긴다.
   */
  emoji?: string;
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
      className={`lobby-panel lobby-panel-${tone} ${
        artSrc ? 'lobby-panel-art' : ''
      } relative rounded-2xl overflow-hidden select-none text-white ${
        disabled ? 'lobby-panel-disabled' : 'lobby-panel-active cursor-pointer'
      } ${pressed ? 'lobby-panel-pressed' : ''} ${className}`}
    >
      {/* 배경만 어두웠다 밝아진다 — 텍스트에까지 filter가 걸리면 글자가 흐려진다.
          그라디언트 색은 tone 클래스가 --panel-a/b로, 일러스트는 --panel-art로 넘어간다.
          경로를 CSS가 아니라 여기로 흘리는 이유는 에셋 경로를 lobbyAssets.ts 한 곳에
          모아두기 위해서다(globals.css의 "로비 — 모드 선택 패널" 절 참조). */}
      <span
        className="lobby-panel-bg"
        style={artSrc ? ({ '--panel-art': `url(${artSrc})` } as React.CSSProperties) : undefined}
      />

      {/* 폼이 열리면 이 라벨만 페이드아웃하고 배경은 남는다 */}
      <span className="stage-panel-label absolute inset-0 flex flex-col items-center justify-center gap-1 px-4 text-center">
        {emoji && (
          <span className="text-4xl md:text-5xl mb-1" aria-hidden="true">
            {emoji}
          </span>
        )}
        <span className="text-xl md:text-2xl font-extrabold drop-shadow">{title}</span>
        <span className="text-xs md:text-sm text-white/85 leading-snug">{subtitle}</span>
      </span>
    </button>
  );
}
