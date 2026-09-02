'use client';

import { useEffect, useRef, useState } from 'react';
import type { Animal, ClientGameState, Team } from 'shared';
import { ANIMALS, THRESHOLDS } from 'shared';
import { SKILL_TITLE, describeSkillShort } from '@/lib/skillInfo';

// ── 동물별 표 — 왼쪽팀은 [얼굴|경험치 현황|레벨], 오른쪽팀은 [레벨|경험치 현황|얼굴]로
// 좌우 대칭 배치한다. 마우스를 올리면 해당 동물 행동의 한 줄 요약을 미리 보여준다.
function AnimalTable({
  animal,
  exp,
  isFlashing,
  isPopping,
  gameState,
  team,
}: {
  animal: Animal;
  exp: number;
  isFlashing: boolean;
  isPopping: boolean;
  gameState: ClientGameState;
  team: Team;
}) {
  const isTeamB = team === 'B';
  const threshold = THRESHOLDS[animal];
  const level = Math.floor(exp / threshold);
  // 분자는 "이번 레벨 안에서 쌓은 만큼"만 보여준다 — 누적 총량을 그대로 쓰면 레벨이
  // 오른 뒤에도 분모를 넘는 값(예: 18/10)이 찍혀 레벨이 오히려 먼저 오른 것처럼
  // 헷갈렸다. 레벨업 직후에는 항상 0으로 시작한다.
  const expInLevel = exp % threshold;
  const progressPct = (expInLevel / threshold) * 100;
  const multiplier = gameState.teams[team].pendingMultiplier;
  const extraDraws = gameState.teams[team].pendingExtraDraws;

  // 팀 패널이 overflow-y-auto라 absolute 툴팁은 스크롤 영역에 잘려 보이지 않는다.
  // 마우스를 올린 카드의 위치를 직접 측정해 position:fixed로 화면 위에 그린다.
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  const handleMouseEnter = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: r.left + r.width / 2, y: r.top });
  };

  // 레벨이 새로 오른 순간에만 "Lv UP!" 강조 + 흔들림을 짧게 재생한다.
  const prevLevelRef = useRef(level);
  const [isLevelUp, setIsLevelUp] = useState(false);
  useEffect(() => {
    if (level > prevLevelRef.current) {
      setIsLevelUp(true);
      const t = setTimeout(() => setIsLevelUp(false), 750);
      prevLevelRef.current = level;
      return () => clearTimeout(t);
    }
    prevLevelRef.current = level;
  }, [level]);

  const face = (
    <div className="w-16 h-16 shrink-0 flex items-center justify-center">
      <img
        src={`/emoticon/${animal}_${level > 0 ? 'happy' : 'focus'}.png`}
        alt={animal}
        className="w-full h-full object-contain"
      />
    </div>
  );

  // 레벨 영역은 글자 주변만이 아니라 이 칸에 배정된 공간 전체(위아래 끝까지)를
  // 옅게 다른 색으로 채워, 얼굴/경험치와 시각적으로 확실히 구분되는 하나의 구역처럼 보이게 한다.
  const levelBadge = (
    <div className="self-stretch shrink-0 flex flex-col items-center justify-center gap-0 px-2.5 bg-jungle-100 rounded-md">
      <span className="text-[0.65rem] font-bold text-jungle-500 leading-none">Lv.</span>
      <span className="text-2xl font-black text-jungle-700 leading-none tabular-nums">{level}</span>
    </div>
  );

  return (
    // 스티커(인어 배율·양 예약 뽑기)는 이 바깥 래퍼에 그린다 — 안쪽 박스는 모서리를
    // 둥글게 다듬으려고 overflow-hidden을 쓰는데, 스티커는 그 박스 밖으로 일부러
    // 삐져나오게 디자인돼 있어 안쪽에 두면 튀어나온 부분이 그대로 잘려 보인다.
    <div data-team-score-row={`${team}:${animal}`} className="relative flex-1 min-h-0">
      {animal === 'mermaid' && multiplier > 1 && (
        <span
          className="mermaid-multiplier-sticker"
          style={isTeamB ? { left: 'auto', right: '-0.4rem' } : undefined}
        >
          ×{multiplier}
        </span>
      )}
      {animal === 'sheep' && extraDraws > 0 && (
        <span
          className="sheep-extra-draws-sticker"
          style={isTeamB ? { left: 'auto', right: '-0.4rem' } : undefined}
          title="다음 내 턴에 예약된 추가 뽑기"
        >
          +{extraDraws}
        </span>
      )}

      <div
        className={`h-full border border-gray-200 rounded-lg overflow-hidden bg-white flex items-center gap-2 px-2 ${
          isLevelUp ? 'level-up-shake' : ''
        }`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setTooltipPos(null)}
      >
        {isTeamB ? levelBadge : face}

        <div className="flex-1 min-w-0 flex flex-col items-center justify-center gap-1">
          <p
            className={`font-extrabold text-jungle-900 tabular-nums leading-tight text-lg ${isPopping ? 'score-pop' : ''}`}
            style={isFlashing ? { color: '#22c55e' } : undefined}
          >
            {expInLevel}<span className="text-xs font-semibold text-jungle-400 ml-0.5">/{threshold}</span>
          </p>
          <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-jungle-500 transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {isTeamB ? face : levelBadge}

        {/* 레벨업 강조 — 불꽃 + 위 화살표가 짧고 강렬하게 튀어오른다 */}
        {isLevelUp && (
          <div className="level-up-burst absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <span className="level-up-text">🔥⬆️ Lv UP!</span>
          </div>
        )}
      </div>

      {/* 호버 툴팁 — 행동의 한 줄 요약 */}
      {tooltipPos && (
        <div
          className="w-72 pointer-events-none"
          style={{
            position: 'fixed',
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: 'translate(-50%, calc(-100% - 6px))',
            zIndex: 100,
          }}
        >
          <div className="bg-jungle-950 text-white rounded-lg px-4 py-3 shadow-xl text-center">
            <p className="font-bold text-lg mb-1.5">{SKILL_TITLE[animal]} (Lv. {level})</p>
            <p className="leading-relaxed text-base text-jungle-100">{describeSkillShort(animal, level)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function ScorePanel({
  team,
  gameState,
  scoreFlash,
  displayedExp,
}: {
  team: Team;
  gameState: ClientGameState;
  scoreFlash: ReadonlyMap<string, number>;
  // 서버 진실(gameState.teams[team].exp)은 페어가 맞는 즉시 반영되지만, 화면 숫자는
  // 그 페어 카드가 팀 칸에 실제로 도착한 뒤에야 올라가는 게 더 직관적이라 애니메이션
  // 큐가 별도로 지연시켜 넘겨주는 값을 대신 쓴다.
  displayedExp: Record<Animal, number>;
}) {
  const exp = displayedExp;

  // 경험치 팝 — flashKey 변경 시 re-trigger
  const [popKeys, setPopKeys] = useState<Set<Animal>>(new Set());
  const prevFlashRef = useRef<ReadonlyMap<string, number>>(new Map());

  useEffect(() => {
    const newPops = new Set<Animal>();
    scoreFlash.forEach((id, key) => {
      const [t, animal] = key.split(':') as [Team, Animal];
      if (t === team && id !== (prevFlashRef.current.get(key) ?? -1)) {
        newPops.add(animal);
      }
    });
    prevFlashRef.current = scoreFlash;
    if (newPops.size === 0) return;
    setPopKeys(prev => new Set([...prev, ...newPops]));
    const timer = setTimeout(() => {
      setPopKeys(prev => {
        const next = new Set(prev);
        newPops.forEach(a => next.delete(a));
        return next;
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [scoreFlash, team]);

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      {ANIMALS.map(a => (
        <AnimalTable
          key={a}
          animal={a}
          exp={exp[a]}
          isFlashing={scoreFlash.has(`${team}:${a}`)}
          isPopping={popKeys.has(a)}
          gameState={gameState}
          team={team}
        />
      ))}
    </div>
  );
}
