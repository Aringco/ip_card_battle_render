import type { Animal, ClientGameState, SideId } from 'shared';
import { ENHANCE_MAX_LEVEL, enhanceLevelLabel, expProgressFor, skillMultiplier } from 'shared';
import { cooldownOf, cooldownShownOf } from '@/lib/skills';
import { describeEnhanceSkillShort, describeSkillShort } from '@/lib/skillInfo';

/**
 * 모바일 배치에서 동물 카드 한 장의 상태 — 아이콘의 펼침 창(AnimalRail)과 스와이프로 여는 상세 창(StatusSheet)이 같은 값을 쓴다.
 * gameState는 화면상 값(withDisplayedExp · withDisplayedTeams)이어야 한다 — 카드가 도착하기 전에 경험치가 먼저 오르지 않게.
 */
export interface AnimalStatus {
  level: number;
  levelLabel: string;
  /** 이번 레벨 안에서 쌓은 비율 0~1(MAX면 1) */
  pct: number;
  /** "경험치 3 / 10" · "경험치 MAX" */
  expText: string;
  /** 배율 · 예약 뽑기 · 별도 배수 · 쿨타임 — 해당하는 것만 */
  lines: string[];
  /** 아이콘 스티커(디자인어 ×N · 실용신양 +N · 한 우물 기본 배율) */
  sticker: string | null;
  isMax: boolean;
  over: number;
  cooling: number;
  desc: string;
}

export function animalStatus(gameState: ClientGameState, team: SideId, animal: Animal): AnimalStatus {
  const enhance = !!gameState.enhance;
  const exp = gameState.teams[team].exp[animal];
  const { level, inLevel, need, over } = expProgressFor(enhance, animal, exp);
  const isMax = enhance && level >= ENHANCE_MAX_LEVEL;
  const multiplier = gameState.teams[team].pendingMultiplier;
  const extraDraws = gameState.teams[team].pendingExtraDraws;
  // 한 우물만 파기의 기본 배율 — ScorePanel의 스티커와 같은 조건(일반 판에서는 인어 배율과 같아 따로 띄우지 않는다)
  const well = gameState.oneWell;
  const wellOpen = (animal === 'rabbit' || animal === 'tiger') && well?.side === team && (well.locked === null || well.locked === animal);
  const wellMultiplier = wellOpen ? skillMultiplier(gameState, team, animal) : 1;
  const cooling = enhance ? cooldownOf(gameState, team, animal) : 0;

  const lines: string[] = [];
  if (animal === 'mermaid') lines.push(`다음 행동 배율 ×${multiplier}`);
  if (animal === 'sheep') lines.push(`예약 뽑기 +${extraDraws}장`);
  if (wellMultiplier > 1 && wellMultiplier !== multiplier) lines.push(`기본 배율 ×${wellMultiplier}`);
  if (isMax && over > 1) lines.push(`Lv.Max 별도 배수 ×${over}`);
  if (cooling > 0) lines.push(`쿨타임 ${cooldownShownOf(gameState, team, animal)}턴`);

  const sticker =
    animal === 'mermaid' && multiplier > 1
      ? `×${multiplier}`
      : animal === 'sheep' && extraDraws > 0
        ? `+${extraDraws}`
        : wellMultiplier !== multiplier && wellMultiplier > 1
          ? `×${wellMultiplier}`
          : null;

  return {
    level,
    levelLabel: enhance ? enhanceLevelLabel(level) : String(level),
    pct: need === null ? 1 : Math.min(1, inLevel / need),
    expText: need === null ? '경험치 MAX' : `경험치 ${inLevel} / ${need}`,
    lines,
    sticker,
    isMax,
    over,
    cooling,
    desc: enhance ? describeEnhanceSkillShort(animal, level) : describeSkillShort(animal, level),
  };
}
