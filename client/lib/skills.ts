// 턴 종료 행동 선택의 "예상 효과" 미리보기 — 서버 engine/skills.ts와 동일한
// 공식을 클라이언트에서 그대로 복제한다(상태를 바꾸지 않는 순수 계산).
import { THRESHOLDS, opponentsOf } from 'shared';
import type { Animal, ClientGameState, SideId } from 'shared';

/**
 * previewSkill/levelOf 등 exp 기반 계산에, 서버가 이미 반영한 진짜 경험치(gameState.teams[team].exp)
 * 대신 "아직 카드가 팀 영역에 도착하는 연출이 끝나지 않아 화면에는 가려서 보여주는" 값
 * (useAnimationQueue의 displayedExp)을 대신 넣어준다. 이게 없으면 카드가 스택에서 팀
 * 쪽으로 날아가는 애니메이션이 끝나기도 전에 레벨업 관련 UI(스킬 선택 패널의 "레벨 N
 * 소모"/글로우, 툴팁 기댓값 등)가 장소를 클릭한 그 즉시 미리 반영돼 버려 "카드가 도착 →
 * 경험치 반영 → 레벨업"이라는 화면상 순서가 깨지는 문제가 있었다.
 */
export function withDisplayedExp(
  gameState: ClientGameState,
  team: SideId,
  displayedExp: Record<Animal, number>,
): ClientGameState {
  return {
    ...gameState,
    teams: {
      ...gameState.teams,
      [team]: { ...gameState.teams[team], exp: displayedExp },
    },
  };
}

export function levelOf(gameState: ClientGameState, team: SideId, animal: Animal): number {
  return Math.floor(gameState.teams[team].exp[animal] / THRESHOLDS[animal]);
}

export interface SkillPreview {
  animal: Animal;
  level: number;
  myHpDelta: number;       // 내 체력 증감 — 항상 0 이상
  oppHpDelta: number;      // 상대 체력 증감 — 항상 0 이하(음수 그대로)
  extraDraws: number;
  multiplierAfter: number; // 인어를 고르면 발동 후 배율, 그 외엔 항상 1(발동하면 소모되므로)
  // 개인전의 특허랑이 — 누구를 노릴지 정해지기 전이라 "상대가 가진 만큼으로 자르기"를 할 수 없다.
  // oppHpDelta는 자르지 않은 값이고, 화면은 "최대"를 붙여 보여준다. 팀전은 언제나 false.
  oppHpIsMax: boolean;
}

export function previewSkill(gameState: ClientGameState, team: SideId, animal: Animal): SkillPreview {
  const opponent = opponentsOf(gameState, team)[0];
  const level = levelOf(gameState, team, animal);
  const mult = gameState.teams[team].pendingMultiplier;

  let myHpDelta = 0;
  let oppHpDelta = 0;
  let extraDraws = 0;
  let multiplierAfter = 1;
  let oppHpIsMax = false;

  if (animal === 'sheep') {
    extraDraws = level * mult;
  } else if (animal === 'rabbit') {
    myHpDelta = level * mult;
  } else if (animal === 'tiger') {
    const amount = level * mult;
    // 개인전은 대상이 정해지기 전이라 자를 상대가 없다 — 자르지 않은 값을 "최대 n"으로 보여준다.
    const steal = gameState.mode === 'individual'
      ? amount
      : Math.min(amount, Math.max(0, gameState.teams[opponent]?.hp ?? 0));
    oppHpIsMax = gameState.mode === 'individual';
    oppHpDelta = -steal;
    myHpDelta = steal;
  } else if (animal === 'mermaid') {
    // 서버 engine/skills.ts와 동일한 합연산 공식 — 곱연산(2^레벨)이 아니라
    // "다음 행동이 이 레벨만큼 더 발동한다"는 뜻으로 배율에 레벨을 더한다.
    multiplierAfter = mult + level;
  }

  return { animal, level, myHpDelta, oppHpDelta, extraDraws, multiplierAfter, oppHpIsMax };
}
