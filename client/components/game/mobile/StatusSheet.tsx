'use client';

import type { ClientGameState, SideId } from 'shared';
import { ANIMALS } from 'shared';
import type { AnimationState } from '@/hooks/useAnimationQueue';
import { withDisplayedExp } from '@/lib/skills';
import { SKILL_COLOR, SKILL_TITLE } from '@/lib/skillInfo';
import { animalStatus } from './animalStatus';
import { emphasize } from './emphasize';

/**
 * 카드 상세 상태 창 — 가로 스와이프로 연다(MobileLayout). 왼쪽→오른쪽은 내 카드 넷이 왼쪽에서, 오른쪽→왼쪽은 상대 카드 넷이
 * 오른쪽에서 판 위로 미끄러져 나온다. 반대로 밀거나 다른 곳을 누르면 닫힌다.
 * 아이콘 하나를 누르는 펼침 창(AnimalRail)과 같은 값(animalStatus)을 네 장 한꺼번에 보여 준다 — 경험치 막대 · 레벨 · 배율 · 쿨타임 · 효과.
 * 항상 그려 두고 data-open으로만 여닫는다(미끄러짐이 transition을 탄다).
 */
export function StatusSheet({
  team,
  side,
  open,
  gameState,
  animState,
  name,
}: {
  team: SideId;
  side: 'left' | 'right';
  /** 머리의 이름 — 개인전은 닉네임(팀전은 비워 두면 팀 이름) */
  name?: string;
  open: boolean;
  gameState: ClientGameState;
  animState: AnimationState;
}) {
  const state = withDisplayedExp(gameState, team, animState.displayedExp[team]);
  return (
    <div className="m-sheet" data-side={side} data-open={open || undefined} inert={!open} aria-hidden={!open}>
      <p className="m-sheet-head">
        <span className="m-sheet-team" data-tone={side === 'left' ? 'mine' : 'enemy'}>
          {name ?? gameState.teamNames[team]}
        </span>
        <span className="m-sheet-hint">{side === 'left' ? '← 밀어서 닫기' : '밀어서 닫기 →'}</span>
      </p>
      <ul className="m-sheet-list">
        {ANIMALS.map(animal => {
          const s = animalStatus(state, team, animal);
          return (
            <li key={animal} className="m-sheet-row" data-cooling={s.cooling > 0 || undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="m-sheet-face" src={`/howto/face_${animal}.webp`} alt="" draggable={false} data-lv0={s.level === 0 || undefined} />
              <div className="m-sheet-body">
                <p className="m-sheet-title">
                  <b style={{ color: SKILL_COLOR[animal] }}>{SKILL_TITLE[animal]}</b>
                  <span className="m-sheet-lv tabular-nums">Lv.{s.levelLabel}</span>
                  <span className="m-sheet-exp tabular-nums">{s.expText.replace('경험치 ', '')}</span>
                </p>
                <span className="m-sheet-bar" aria-hidden>
                  <span style={{ width: `${s.pct * 100}%` }} />
                </span>
                {s.lines.length > 0 && <p className="m-sheet-lines tabular-nums">{s.lines.join(' · ')}</p>}
                <p className="m-sheet-desc">{emphasize(s.desc)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
