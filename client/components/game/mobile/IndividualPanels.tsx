'use client';

import type { ClientGameState, SideId } from 'shared';
import { ANIMALS } from 'shared';
import type { AnimationState } from '@/hooks/useAnimationQueue';
import { withDisplayedExp } from '@/lib/skills';
import { finishLabel, isFinished, sideColor, sideName } from '@/lib/individual';
import type { TargetSkill } from '../TargetPicker';
import { animalStatus } from './animalStatus';

/**
 * 누름 처리 — click이 아니라 **손가락을 뗀 순간**(움직이지 않았을 때)에 반응한다. 브라우저(Chrome)는 스와이프 직후 1초쯤 안의 누름을
 * "밀던 화면을 멈추는 손짓"으로 보고 click을 만들지 않는다 — 목록을 밀어 열자마자 줄을 누르면 아무 일도 없었다(2026-10-31 실측).
 * click(키보드 Enter · 마우스)도 받되, 방금 손가락으로 처리한 것은 두 번 하지 않는다.
 */
type TapEl = HTMLElement & { __tap?: { x: number; y: number } | null; __tapped?: number };
function tapProps(onTap: () => void) {
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      (e.currentTarget as TapEl).__tap = { x: e.clientX, y: e.clientY };
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      const el = e.currentTarget as TapEl;
      const s = el.__tap;
      el.__tap = null;
      if (!s || Math.hypot(e.clientX - s.x, e.clientY - s.y) > 12) return;
      el.__tapped = e.timeStamp;
      onTap();
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const t = (e.currentTarget as TapEl).__tapped;
      if (t !== undefined && e.timeStamp - t < 800) return;
      onTap();
    },
  };
}

/** 상대 체력 막대의 만점 — 승리선(목표 점수 × 2) */
function winHpOf(gameState: ClientGameState): number {
  return gameState.scoreRace?.target ?? gameState.settings.targetScore * 2;
}

/** 출혈 · 지속 회복 표시(남은 턴) — 걸려 있는 것만 */
function DotBadges({ gameState, side }: { gameState: ClientGameState; side: SideId }) {
  const enh = gameState.enhance;
  const bleed = enh?.bleed?.[side]?.turns ?? 0;
  const regen = enh?.regen?.[side]?.turns ?? 0;
  if (!bleed && !regen) return null;
  return (
    <span className="m-opp-dots">
      {bleed > 0 && (
        <span className="hp-status hp-status-bleed" title={`출혈 ${bleed}턴`}>
          <span className="hp-status-icon" aria-hidden />
          <b className="tabular-nums">{bleed}</b>
        </span>
      )}
      {regen > 0 && (
        <span className="hp-status hp-status-regen" title={`지속 회복 ${regen}턴`}>
          <span className="hp-status-icon" aria-hidden />
          <b className="tabular-nums">{regen}</b>
        </span>
      )}
    </span>
  );
}

/**
 * 개인전 모바일 — 상대 목록 창(오른쪽 → 왼쪽 스와이프로 연다). 상대마다 한 줄: 색 · 닉네임 · 체력 · 지속 효과, 그 아래 동물 넷의 레벨과
 * 경험치 막대. 최대 7명이라 세로로 스크롤한다. 줄을 누르면 고르고(테두리가 그 사람 색으로 빛난다), 고른 채 한 번 더 오른쪽 → 왼쪽으로
 * 밀면 그 사람의 카드 상세 창이 열린다(MobileIndividualLayout). 경험치는 화면상 값(카드가 도착한 뒤에 오른다)이다.
 */
export function OpponentListSheet({
  open,
  gameState,
  animState,
  sides,
  selected,
  onSelect,
}: {
  open: boolean;
  gameState: ClientGameState;
  animState: AnimationState;
  sides: SideId[];
  selected: SideId | null;
  onSelect: (side: SideId) => void;
}) {
  const winHp = winHpOf(gameState);
  return (
    <div className="m-opp-list" data-open={open || undefined} inert={!open} aria-hidden={!open}>
      <p className="m-sheet-head">
        <span className="m-sheet-hint">밀어서 닫기 →</span>
        <span className="m-opp-list-title">상대 {sides.length}명</span>
      </p>
      <p className="m-opp-list-tip">{selected ? '한 번 더 ← 밀면 카드 상세' : '상대를 눌러 고르세요'}</p>
      <ul className="m-opp-rows">
        {sides.map(side => {
          const state = withDisplayedExp(gameState, side, animState.displayedExp[side] ?? gameState.teams[side].exp);
          const hp = gameState.teams[side].hp;
          const done = isFinished(gameState, side);
          const label = finishLabel(gameState, side);
          return (
            <li key={side}>
              <button
                type="button"
                className="m-opp-row"
                data-selected={selected === side || undefined}
                data-finished={done || undefined}
                data-active={animState.displayedActiveTeam === side || undefined}
                style={{ ['--opp-color' as string]: sideColor(gameState, side) }}
                {...tapProps(() => onSelect(side))}
              >
                <span className="m-opp-row-head">
                  <span className="m-opp-dot" aria-hidden />
                  <b className="m-opp-name">{sideName(gameState, side)}</b>
                  {label && <span className="m-opp-finish">{label}</span>}
                  <DotBadges gameState={gameState} side={side} />
                  <span className="m-opp-hp tabular-nums">♥ {hp}</span>
                </span>
                <span className="m-opp-hpbar" aria-hidden>
                  <span style={{ width: `${Math.max(0, Math.min(100, (hp / winHp) * 100))}%` }} />
                </span>
                <span className="m-opp-animals">
                  {ANIMALS.map(animal => {
                    const s = animalStatus(state, side, animal);
                    return (
                      <span key={animal} className="m-opp-animal">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/howto/face_${animal}.webp`} alt="" draggable={false} data-lv0={s.level === 0 || undefined} />
                        <span className="m-opp-animal-lv tabular-nums">{s.levelLabel}</span>
                        <span className="m-opp-animal-bar">
                          <span style={{ width: `${s.pct * 100}%` }} />
                        </span>
                      </span>
                    );
                  })}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const PICK_TEXT: Record<TargetSkill, { title: string; sub: string }> = {
  tiger: { title: '누구에게서 빼앗을까요?', sub: '🐯 특허랑이가 상대의 체력을 빼앗아 와요' },
  mermaid: { title: '누구의 배율을 깎을까요?', sub: '🧜‍♀️ 디자인어가 상대의 배율을 나눠요' },
};

/**
 * 개인전 모바일 — 공격 카드(특허랑이 · 강화 방 Lv.6+ 디자인어)의 대상 고르기. 화면을 어둡게 덮고 상대를 한 줄씩(닉네임 · 지금 체력 ·
 * 출혈/지속 회복) 늘어놓는다. 한 번 누르면 고르고(포커스), 고른 줄을 한 번 더 누르면 그 상대로 확정한다. 고른 채 오른쪽 → 왼쪽으로 밀면
 * 그 상대의 카드 상세 창이 이 위에 열린다(MobileIndividualLayout). 이 기술로 끝낼 수 있는 상대에는 "마무리"가 붙는다.
 * ⚠️ 턴 타이머는 멈추지 않는다(PC의 TargetPicker와 같다) — 위 띠의 타이머가 그대로 보인다.
 */
export function MobileTargetPicker({
  gameState,
  animal,
  targets,
  lethal,
  focus,
  onFocus,
  onPick,
  onCancel,
}: {
  gameState: ClientGameState;
  animal: TargetSkill;
  targets: SideId[];
  lethal: SideId[];
  focus: SideId | null;
  onFocus: (side: SideId) => void;
  onPick: (side: SideId) => void;
  onCancel: () => void;
}) {
  const winHp = winHpOf(gameState);
  return (
    <div className="m-target" role="dialog" aria-label={PICK_TEXT[animal].title}>
      <div className="m-target-card">
        <p className="m-target-title">{PICK_TEXT[animal].title}</p>
        <p className="m-target-sub">
          {PICK_TEXT[animal].sub} · {focus ? '한 번 더 누르면 확정 · ← 밀면 카드 상세' : '상대를 누르세요'}
        </p>
        <ul className="m-target-rows">
          {targets.map(side => {
            const hp = gameState.teams[side].hp;
            return (
              <li key={side}>
                <button
                  type="button"
                  className="m-target-row"
                  data-focus={focus === side || undefined}
                  style={{ ['--opp-color' as string]: sideColor(gameState, side) }}
                  {...tapProps(() => (focus === side ? onPick(side) : onFocus(side)))}
                >
                  <span className="m-opp-dot" aria-hidden />
                  <b className="m-opp-name">{sideName(gameState, side)}</b>
                  {lethal.includes(side) && <span className="m-target-lethal">마무리</span>}
                  <DotBadges gameState={gameState} side={side} />
                  <span className="m-target-hp">
                    <span className="m-opp-hpbar" aria-hidden>
                      <span style={{ width: `${Math.max(0, Math.min(100, (hp / winHp) * 100))}%` }} />
                    </span>
                    <span className="tabular-nums">♥ {hp}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <button type="button" className="m-target-cancel" {...tapProps(onCancel)}>
          취소(다른 기술 고르기)
        </button>
      </div>
    </div>
  );
}
