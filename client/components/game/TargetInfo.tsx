'use client';

import type { ClientGameState, SideId } from 'shared';
import { ANIMALS } from 'shared';
import { animalStatus } from './mobile/animalStatus';

/**
 * 대상 고르기 줄 · 칸의 상대 정보(2026-11-25 요청 — 고를 때 정보가 너무 없었다). PC `TargetPicker`와 모바일 `MobileTargetPicker`가 함께 쓴다.
 *
 *  - 동물 넷: 레벨 · 경험치(이번 레벨 안의 양 / 필요량 + 막대) · 스티커(디자인어 배율 ×N · 실용신양 예약 뽑기 +N · Lv.Max 별도 배수) · 쿨타임
 *  - 그 사람에게 걸린 상태(강화 판): 효과 감소 ÷N · 보호막 · 회피 · 회복 효율 감소 — 걸려 있는 것만
 *
 * 값은 `animalStatus`(모바일 아이콘 · 상세 창과 같은 함수)로 구한다. 대상을 고르는 때는 내 행동 선택 단계라 연출이 끝나 있어
 * 서버 값이 곧 화면 값이다.
 */
export function TargetInfo({ gameState, side }: { gameState: ClientGameState; side: SideId }) {
  const enh = gameState.enhance;
  const chips: string[] = [];
  const divisor = enh?.divisors?.[side] ?? 1;
  if (divisor > 1) chips.push(`효과 ÷${divisor}${enh?.divisorTurns?.[side] ? ` (${enh.divisorTurns[side]}턴)` : ''}`);
  const shield = enh?.shield?.[side] ?? 0;
  if (shield > 0) chips.push(`보호막 ${shield}`);
  const evade = enh?.evade?.[side] ?? 0;
  if (evade > 0) chips.push(`회피 ${evade}%`);
  const healCut = enh?.healCut?.[side];
  if (healCut && healCut.turns > 0) chips.push(`회복 −${healCut.pct}%`);

  return (
    <span className="target-info">
      <span className="target-info-animals">
        {ANIMALS.map(animal => {
          const s = animalStatus(gameState, side, animal);
          const exp = s.isMax ? 'MAX' : s.expText.replace('경험치 ', '').replace(' / ', '/');
          return (
            <span key={animal} className="target-info-animal" data-cooling={s.cooling > 0 || undefined}>
              <span className="target-info-face">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/howto/face_${animal}.webp`} alt="" draggable={false} data-lv0={s.level === 0 || undefined} />
                {s.sticker && <span className="target-info-sticker tabular-nums">{s.sticker}</span>}
                {s.isMax && s.over > 1 && <span className="target-info-sticker is-over tabular-nums">×{s.over}</span>}
              </span>
              <span className="target-info-text">
                <b className="tabular-nums">Lv.{s.levelLabel}</b>
                <span className="tabular-nums">{s.cooling > 0 ? `쿨 ${s.cooling}` : exp}</span>
              </span>
              <span className="target-info-bar" aria-hidden>
                <span style={{ width: `${s.pct * 100}%` }} />
              </span>
            </span>
          );
        })}
      </span>
      {chips.length > 0 && (
        <span className="target-info-chips">
          {chips.map(c => (
            <span key={c} className="target-info-chip">{c}</span>
          ))}
        </span>
      )}
    </span>
  );
}
