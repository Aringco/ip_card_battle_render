'use client';

import { useEffect, useRef, useState } from 'react';
import type { Animal, ClientGameState, SideId } from 'shared';
import { ANIMALS } from 'shared';
import type { AnimationState } from '@/hooks/useAnimationQueue';
import { withDisplayedExp } from '@/lib/skills';
import { SKILL_COLOR, SKILL_TITLE } from '@/lib/skillInfo';
import { animalStatus } from './animalStatus';
import { emphasize } from './emphasize';

// 테두리 원 — viewBox 100 기준. 둘레가 곧 그 레벨에서 채워야 할 경험치(실용신양·상표토끼 10, 디자인어·특허랑이 20 — 강화 판도 같다)다.
const RING_R = 45;
const RING_LEN = 2 * Math.PI * RING_R;

/**
 * 모바일 배치의 동물 아이콘 넷(세로 한 줄) — 한 편의 경험치 현황(PC의 TeamPanel · ScorePanel 자리).
 *
 * 원형 얼굴 둘레의 **테두리가 곧 경험치 막대**다: 초록이 이번 레벨에서 쌓은 만큼, 흰색이 모자란 만큼(반원 = 절반).
 * 배율(디자인어 ×N · 실용신양 예약 뽑기 +N · Lv.Max 별도 배수)은 아이콘에 스티커로 붙는다.
 * 아이콘을 누르면 옆(판 쪽)으로 상태 창이 펼쳐진다(경험치 · 레벨 · 배율 · 쿨타임 · 효과 한 줄) — 다시 누르거나 다른 곳을 누르면 접힌다.
 * 네 장을 한꺼번에 보는 상세 창은 가로 스와이프로 연다(StatusSheet).
 *
 * 연출이 이 칸을 찾아오는 표식은 PC와 같다: 짝이 맞아 날아가는 카드의 목적지 `data-team-score-row="편:동물"`(아이콘마다),
 * 이모티콘 · 양털 공의 출발점 `data-player-anchor="편:0"`(열 전체). 경험치는 화면상 값(displayedExp — 카드가 도착한 뒤에 오른다)이다.
 */
export function AnimalRail({
  team,
  side,
  gameState,
  animState,
  open,
  onToggle,
  color,
}: {
  team: SideId;
  /** 개인전 — 그 사람이 대기실에서 고른 색. 열 테두리가 이 색이다(팀전은 비워 두면 왼쪽 연두 · 오른쪽 붉은색) */
  color?: string;
  /** 화면의 어느 쪽인가 — 상태 창이 판 쪽으로 펼쳐진다 */
  side: 'left' | 'right';
  gameState: ClientGameState;
  animState: AnimationState;
  /** 지금 펼쳐진 아이콘(화면 전체에서 하나 — MobileLayout이 들고 있다) */
  open: string | null;
  onToggle: (key: string | null) => void;
}) {
  const state = withDisplayedExp(gameState, team, animState.displayedExp[team]);
  const isActive = animState.displayedActiveTeam === team;
  return (
    <div
      className="m-rail-list"
      data-side={side}
      data-active={isActive || undefined}
      data-colored={color ? '' : undefined}
      data-player-anchor={`${team}:0`}
      style={color ? ({ ['--rail-color' as string]: color } as React.CSSProperties) : undefined}
    >
      {ANIMALS.map(animal => (
        <RailIcon
          key={animal}
          team={team}
          side={side}
          animal={animal}
          gameState={state}
          flashing={animState.scoreFlash.has(`${team}:${animal}`)}
          open={open === `${team}:${animal}`}
          onToggle={() => onToggle(open === `${team}:${animal}` ? null : `${team}:${animal}`)}
        />
      ))}
    </div>
  );
}

function RailIcon({
  team,
  side,
  animal,
  gameState,
  flashing,
  open,
  onToggle,
}: {
  team: SideId;
  side: 'left' | 'right';
  animal: Animal;
  gameState: ClientGameState;
  flashing: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const s = animalStatus(gameState, team, animal);

  // 레벨이 오른 순간 — 카드가 이 아이콘에 도착해 경험치가 오른 그 렌더(displayedExp)에 터진다(ScorePanel과 같은 방식).
  const prevLevel = useRef(s.level);
  const [levelUp, setLevelUp] = useState(0);
  useEffect(() => {
    if (s.level > prevLevel.current) setLevelUp(n => n + 1);
    prevLevel.current = s.level;
  }, [s.level]);
  useEffect(() => {
    if (!levelUp) return;
    const t = setTimeout(() => setLevelUp(0), 900);
    return () => clearTimeout(t);
  }, [levelUp]);

  return (
    <div className="m-rail-item" data-open={open || undefined}>
      <button
        type="button"
        className={`m-icon ${flashing ? 'is-flash' : ''} ${levelUp ? 'is-levelup' : ''}`}
        data-team-score-row={`${team}:${animal}`}
        data-cooling={s.cooling > 0 || undefined}
        aria-expanded={open}
        aria-label={`${SKILL_TITLE[animal]} Lv.${s.levelLabel}`}
        onClick={onToggle}
        style={{ ['--animal-color' as string]: SKILL_COLOR[animal] }}
      >
        <svg className="m-icon-ring" viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r={RING_R} className="m-icon-ring-track" />
          <circle
            cx="50"
            cy="50"
            r={RING_R}
            className={`m-icon-ring-fill ${s.pct >= 1 && s.expText.endsWith('MAX') ? 'is-max' : ''}`}
            strokeDasharray={`${(s.pct * RING_LEN).toFixed(2)} ${RING_LEN.toFixed(2)}`}
          />
        </svg>
        {/* 투명 바탕 얼굴(scripts/makeHowIPs.mjs — how_IPs 원본에서 얼굴만 잘라 낸다). 감정표현 그림은 흰 바탕이라 원 안에 흰 네모가 떴다.
            레벨 0(아직 못 쓰는 카드)은 CSS가 빛을 죽인다(data-lv0). */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="m-icon-face" src={`/howto/face_${animal}.webp`} alt="" draggable={false} data-lv0={s.level === 0 || undefined} />
        <span className="m-icon-lv tabular-nums">{s.levelLabel}</span>
        {s.sticker && <span className="m-icon-sticker tabular-nums">{s.sticker}</span>}
        {s.isMax && s.over > 1 && <span className="m-icon-over tabular-nums">×{s.over}</span>}
        {levelUp > 0 && (
          <span key={levelUp} className="m-icon-levelup" aria-hidden>
            Lv UP!
          </span>
        )}
      </button>

      {/* 상태 창 — 아이콘 옆(판 쪽)으로 펼쳐진다. 항상 그려 두고 data-open으로만 여닫아 펼침이 transition을 탄다 */}
      <div className="m-rail-panel" data-side={side} aria-hidden={!open}>
        <p className="m-rail-panel-title" style={{ color: SKILL_COLOR[animal] }}>
          {SKILL_TITLE[animal]} <span className="m-rail-panel-lv">Lv.{s.levelLabel}</span>
        </p>
        {[s.expText, ...s.lines].map(l => (
          <p key={l} className="m-rail-panel-line tabular-nums">
            {l}
          </p>
        ))}
        <p className="m-rail-panel-desc">{emphasize(s.desc)}</p>
      </div>
    </div>
  );
}
