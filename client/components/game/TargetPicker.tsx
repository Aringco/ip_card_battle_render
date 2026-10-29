'use client';

import { useEffect, useState } from 'react';
import type { ClientGameState, SideId } from 'shared';

/** 상대를 고르는 기술 — 특허랑이(언제나)와 디자인어(개인전 강화 방 Lv.6+ — shared의 needsTarget) */
export type TargetSkill = 'tiger' | 'mermaid';

const TEXT: Record<TargetSkill, { aria: string; title: string; sub: string }> = {
  tiger: { aria: '특허랑이로 노릴 상대 고르기', title: '누구에게서 빼앗을까요?', sub: '🐯 특허랑이가 상대의 체력을 빼앗아 와요' },
  mermaid: { aria: '디자인어로 노릴 상대 고르기', title: '누구의 배율을 깎을까요?', sub: '🧜‍♀️ 디자인어가 상대의 배율을 깎고 효과를 나눠요' },
};
import { sideColor, sideName } from '@/lib/individual';

/** 마감 시각까지 남은 초(올림) — 멈춰 있으면 그대로 둔다. */
function useSecondsLeft(deadline: number, paused: boolean): number {
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
  useEffect(() => {
    if (paused) return;
    const tick = () => setLeft(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadline, paused]);
  return left;
}

/**
 * 개인전 — 특허랑이를 쓸 때 **누구에게서 빼앗을지** 고르는 화면(요구 G2).
 *
 * 규칙상 상대를 고르는 기술은 특허랑이와, 개인전 **강화** 방의 Lv.6+ 디자인어(상대 배율 −N · Lv.9+ 상대 효과 ÷N)다
 * (2026-10-30 — shared의 needsTarget). 상표토끼·실용신양은 내 것만 건드리므로 이 화면을 띄우지 않는다.
 *
 * - 화면을 어둡게(검정, 불투명도 0.5) 하고 상대 닉네임 버튼으로 고른다. 시연 4장의 결말 고르기(DemoSceneMenu)
 *   를 본떴다 — 판 위에 덮는 `position: fixed` 오버레이라 배치에 끼어들지 않는다.
 * - 대상은 **순위가 정해지지 않은 다른 사람**이다(서버도 같은 규칙으로 거른다). 4열로 놓는다(최대 7명 → 4 + 3).
 * - 1:1 판(시작 인원 2명)에서는 이 화면을 띄우지 않는다 — 고를 상대가 하나뿐이다(IndividualLayout.handleChoose).
 * - 숫자 키 1~7로도 고른다. ESC·바깥 클릭·[취소]로 닫는다(다른 기술로 바꿀 수 있게).
 * - ⚠️ **턴 타이머는 멈추지 않는다.** 대상을 고르다 시간이 다 되면 서버가 기술 없이 차례를 끝내므로, 이
 *   안에 남은 시간을 함께 보여준다. 차례가 끝나 이 판을 열 이유가 없어지면 부모가 닫는다.
 * - ⚠️ 일시정지 창이 떠 있으면 숫자 키를 받지 않는다 — 멈춤 창은 화면만 덮고 키보드는 덮지 못한다(시연에서
 *   "멈춤 창을 뚫고 들어오는 키보드" 버그가 있었다).
 */
export function TargetPicker({
  gameState,
  animal = 'tiger',
  targets,
  lethalTargets = [],
  turnDeadline,
  paused,
  onPick,
  onCancel,
}: {
  gameState: ClientGameState;
  /** 어느 기술의 대상을 고르는가 — 문구만 달라진다 */
  animal?: TargetSkill;
  /** 고를 수 있는 편들(위에서 아래 순서 = 숫자 키 순서) */
  targets: SideId[];
  /** 이번 특허랑이로 끝낼 수 있는 상대(탈락시키거나, 그만큼 빼앗아 내가 1위를 확정) — 버튼에 빨간 빛 */
  lethalTargets?: SideId[];
  turnDeadline: number;
  paused: boolean;
  onPick: (target: SideId) => void;
  onCancel: () => void;
}) {
  const secondsLeft = useSecondsLeft(turnDeadline, paused);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      // 멈춰 있거나 일시정지 메뉴가 열려 있으면 이 판의 키를 받지 않는다(메뉴 뒤에서 기술이 나가 버린다).
      if (paused || document.querySelector('.pause-dim')) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      const i = Number(e.key) - 1;
      if (!Number.isInteger(i) || i < 0 || i >= targets.length) return;
      e.preventDefault();
      onPick(targets[i]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paused, targets, onPick, onCancel]);

  return (
    <div
      className="target-picker"
      role="dialog"
      aria-label={TEXT[animal].aria}
      onClick={e => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <p className="target-picker-title">{TEXT[animal].title}</p>
      <p className="target-picker-sub">
        {TEXT[animal].sub} · 남은 시간 <strong className="tabular-nums">{secondsLeft}</strong>초
      </p>
      <div className="target-picker-list" style={{ ['--tp-cols' as string]: Math.min(4, targets.length) }}>
        {targets.map((side, i) => (
          <button
            key={side}
            type="button"
            className={`target-picker-card${lethalTargets.includes(side) ? ' target-picker-card-lethal' : ''}`}
            onClick={() => onPick(side)}
            aria-keyshortcuts={String(i + 1)}
            title={sideName(gameState, side)}
          >
            <span className="target-picker-index tabular-nums">{i + 1}</span>
            {/* 색만으로 구분하지 않는다 — 칩 옆에 닉네임과 체력이 있다. */}
            <span aria-hidden className="target-picker-chip" style={{ backgroundColor: sideColor(gameState, side) }} />
            <span className="target-picker-name font-bold">{sideName(gameState, side)}</span>
            <span className="target-picker-hp tabular-nums">
              {animal === 'mermaid' ? `배율 ×${gameState.teams[side].pendingMultiplier}` : `체력 ${gameState.teams[side].hp}`}
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="target-picker-cancel" onClick={onCancel}>
        취소 (Esc)
      </button>
    </div>
  );
}
