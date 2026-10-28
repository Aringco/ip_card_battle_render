// 턴 종료 행동 선택의 "예상 효과" 미리보기 — 서버 engine/skills.ts와 동일한
// 공식을 클라이언트에서 그대로 복제한다(상태를 바꾸지 않는 순수 계산).
import {
  enhanceCooldownLeft,
  enhanceMermaidAfter,
  enhanceAmount,
  enhanceDivisorOf,
  enhanceMermaidCut,
  enhanceMermaidDivide,
  enhanceSheepExp,
  enhanceTigerHeal,
  enhanceValue,
  opponentsOf,
  skillLevelFor,
  skillMultiplier,
} from 'shared';
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

/** 레벨 — 서버 엔진과 같은 함수(shared의 skillLevelFor). 카드 강화 판은 누적 경험치 표로 1~5다. */
/** 체력도 같은 방식으로 화면상 값(useAnimationQueue의 displayedHp — 카드 강화의 짝 효과 연출 전)으로 바꿔 끼운다. */
export function withDisplayedHp(gameState: ClientGameState, displayedHp: Record<SideId, number>): ClientGameState {
  // 가릴 것이 없으면(카드 강화가 아닌 판은 언제나) 원래 객체를 그대로 — 매 렌더 새 객체를 만들면 받는 쪽이 다른 상태로 본다
  const changed = Object.keys(gameState.teams).filter(s => displayedHp[s] !== undefined && displayedHp[s] !== gameState.teams[s].hp);
  if (changed.length === 0) return gameState;
  const teams = { ...gameState.teams };
  for (const side of changed) teams[side] = { ...teams[side], hp: displayedHp[side] };
  return { ...gameState, teams };
}

/**
 * 배율·추가 뽑기·나눗셈도 화면상 값(useAnimationQueue의 displayedTeamPatch · displayedDivisors — 기술 효과 연출 전)으로 바꿔 끼운다.
 * 팀 패널의 "×N"·"+N회" 스티커와 기술 카드 미리보기가 뽑기 연출이 끝나기 전에 바뀌지 않게 한다(2026-10-29).
 * 가릴 것이 없으면 원래 객체를 그대로 돌려준다.
 */
export function withDisplayedTeams(
  gameState: ClientGameState,
  patch: Readonly<Record<SideId, { pendingMultiplier: number; pendingExtraDraws: number }>>,
  divisors: Readonly<Record<SideId, number>> | null,
): ClientGameState {
  const sides = Object.keys(patch).filter(s => gameState.teams[s]);
  if (sides.length === 0 && !divisors) return gameState;
  const teams = { ...gameState.teams };
  for (const side of sides) teams[side] = { ...teams[side], ...patch[side] };
  const enhance = divisors && gameState.enhance ? { ...gameState.enhance, divisors: { ...divisors } } : gameState.enhance;
  return { ...gameState, teams, enhance };
}

export function levelOf(gameState: ClientGameState, team: SideId, animal: Animal): number {
  return skillLevelFor(!!gameState.enhance, animal, gameState.teams[team].exp[animal]);
}

/** 카드 강화 판 — 이 카드를 앞으로 못 쓰는 내 차례 수(0이면 지금 쓸 수 있다). 다른 판은 언제나 0. */
export function cooldownOf(gameState: ClientGameState, team: SideId, animal: Animal): number {
  return enhanceCooldownLeft(gameState, team, animal);
}

/**
 * 지금 이 카드를 쓸 수 있는가 — 레벨 · 한 우물만 파기 잠금 · 카드 강화 쿨타임을 한꺼번에 본다
 * (서버 engine/skills.ts의 eligibleAnimals와 같은 규칙). "고를 게 없으면 자동 패스"도 이 값으로 판단한다.
 */
export function canUseSkill(gameState: ClientGameState, team: SideId, animal: Animal): boolean {
  return levelOf(gameState, team, animal) > 0 && isSkillOpen(gameState, team, animal) && cooldownOf(gameState, team, animal) === 0;
}

/**
 * 이벤트 '한 우물만 파기'의 잠금 — 그 편이 지금 쓸 수 있는 카드(서버 engine/skills.ts의 oneWellOpen과 같은 규칙).
 * 잠금이 없는 편(일반 게임·상대 CPU)은 null. 처음 쓴 카드가 정해지기 전엔 상표토끼·특허랑이 둘, 정해진 뒤엔 한 장.
 *
 * ⚠️ 화면에서 이 잠금을 반영할 자리가 셋이다 — 기술 카드(SkillChoiceBar) · "고를 게 없으면 자동 패스" 타이머(GameLayout) ·
 *    끝낼 수 있는 수 표시(finishingMove). 한 곳만 빠뜨려도 서버와 화면이 어긋난다(EVENT_MODE_ROADMAP.md §3-3).
 */
export function oneWellOpen(gameState: ClientGameState, team: SideId): readonly Animal[] | null {
  const well = gameState.oneWell;
  if (!well || well.side !== team) return null;
  return well.locked ? [well.locked] : well.allowed;
}

/** 이 카드가 잠겨 있지 않은가(잠금이 없는 판이면 언제나 true). */
export function isSkillOpen(gameState: ClientGameState, team: SideId, animal: Animal): boolean {
  const open = oneWellOpen(gameState, team);
  return open === null || open.includes(animal);
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
  // 카드 강화 Lv.6+ — 실용신양이 무작위 카드에 주는 경험치(배율 반영) · 디자인어가 깎는 상대 배율(표의 값). 없으면 0
  randomExp?: number;
  oppMultiplierCut?: number;
  // 카드 강화 — 디자인어 Lv.9+가 상대의 다음 기술에 거는 나눗셈 · 이 기술에 지금 걸려 있는 나눗셈(상대 디자인어). 없으면 1
  oppDivisor?: number;
  divisor?: number;
}

/**
 * 이 기술 하나로 **판을 끝낼 수 있는가**(상표토끼·특허랑이만) — 카드 테두리와 상대 선택 버튼에 빨간 빛을 띄우는 근거다.
 *
 * - 팀전: 상표토끼로 내 체력이 승리선에 닿거나, 특허랑이로 상대를 0으로 만들거나 그 강탈로 내가 승리선에 닿으면 승리.
 * - 개인전: 특허랑이로 **어떤 상대든** 0으로 만들 수 있으면(그 상대의 탈락) 그 상대가 targets에 들어간다. 그리고 아직
 *   아무도 승리하지 않았을 때 내가 승리선에 닿으면 **1위 확정**이라 이것도 끝내는 수로 친다(상표토끼, 또는 그만큼
 *   빼앗아 올 수 있는 상대를 노리는 특허랑이). 이미 1위가 나온 뒤의 승리선 도달은 1위가 아니라서 치지 않는다.
 *
 * 계산은 서버 엔진과 같은 공식(레벨 × 배율, 강탈은 상대가 가진 만큼)이다. gameState에는 화면상 경험치
 * (withDisplayedExp)를 넣어 카드가 도착하기 전에 표시가 먼저 뜨지 않게 한다.
 */
export function finishingMove(
  gameState: ClientGameState,
  team: SideId,
  animal: Animal,
): { finishes: boolean; targets: SideId[] } {
  const none = { finishes: false, targets: [] as SideId[] };
  if (animal !== 'rabbit' && animal !== 'tiger') return none;
  // 한 우물만 파기에서 잠긴 카드로는 끝낼 수 없다 — 잠긴 호랑이에 빨간 빛이 뜨면 누를 수 없는 카드를 가리키게 된다.
  if (!isSkillOpen(gameState, team, animal)) return none;
  // 목표점수 달성하기에는 즉시 승패가 없다 — 판은 마지막 턴이 끝나야 판정된다(엔진의 scoreRace).
  if (gameState.scoreRace) return none;
  const me = gameState.teams[team];
  if (!me) return none;
  const level = levelOf(gameState, team, animal);
  if (level <= 0) return none;
  // 카드 강화 판 — 쿨타임 중인 카드로는 끝낼 수 없다. 효과는 레벨 표 × 배율이고, 특허랑이의 회복은 깎은 양과 무관하다.
  if (gameState.enhance && cooldownOf(gameState, team, animal) > 0) return none;
  const winHp = gameState.settings.targetScore * 2;
  if (gameState.enhance) {
    const mult = me.pendingMultiplier;
    const div = enhanceDivisorOf(gameState, team);
    const amount = enhanceAmount(enhanceValue(animal, level), mult, div);
    const firstWin = !Object.values(gameState.teams).some(t => t.finish?.reason === 'win');
    if (animal === 'rabbit') return { finishes: firstWin && me.hp + amount >= winHp, targets: [] };
    const heal = enhanceAmount(enhanceTigerHeal(level), mult, div);
    const targets = opponentsOf(gameState, team).filter(
      foe => (gameState.teams[foe]?.hp ?? 0) <= amount || (firstWin && me.hp + heal >= winHp),
    );
    return { finishes: targets.length > 0, targets };
  }
  // 한 우물만 파기의 특허랑이 기본 2배까지 — 서버 엔진과 같은 함수(skillMultiplier)
  const amount = level * skillMultiplier(gameState, team, animal);
  // 개인전에서 승리선 도달이 "1위 확정"인 것은 아직 아무도 승리하지 않았을 때뿐이다.
  const reachingWinIsFirst =
    gameState.mode !== 'individual' || !Object.values(gameState.teams).some(t => t.finish?.reason === 'win');

  if (animal === 'rabbit') return { finishes: reachingWinIsFirst && me.hp + amount >= winHp, targets: [] };

  const targets = opponentsOf(gameState, team).filter(foe => {
    const hp = gameState.teams[foe]?.hp ?? 0;
    return hp <= amount || (reachingWinIsFirst && me.hp + Math.min(amount, hp) >= winHp);
  });
  return { finishes: targets.length > 0, targets };
}

export function previewSkill(gameState: ClientGameState, team: SideId, animal: Animal): SkillPreview {
  const opponent = opponentsOf(gameState, team)[0];
  const level = levelOf(gameState, team, animal);
  const mult = gameState.teams[team].pendingMultiplier;
  // 특허랑이는 한 우물만 파기의 기본 2배까지 곱한 값(서버 엔진과 같은 함수 — skillMultiplier)
  const tigerMult = skillMultiplier(gameState, team, 'tiger');

  let myHpDelta = 0;
  let oppHpDelta = 0;
  let extraDraws = 0;
  let multiplierAfter = 1;
  let oppHpIsMax = false;

  // 카드 강화 판 — 서버 engine/skills.ts의 applyEnhanceSkill과 같은 공식(레벨 표 × 배율, 특허랑이는 깎기 + Lv.3부터 회복)
  if (gameState.enhance) {
    // 서버 applyEnhanceEffect와 같은 계산 — 기본값 × 배율 ÷ 나눗셈(상대 디자인어 Lv.9+), 반올림. 디자인어 자신은 나누지 않는다.
    const divisor = animal === 'mermaid' ? 1 : enhanceDivisorOf(gameState, team);
    const value = enhanceAmount(enhanceValue(animal, level), mult, divisor);
    if (animal === 'sheep') extraDraws = value;
    else if (animal === 'rabbit') myHpDelta = value;
    else if (animal === 'tiger') {
      // 상대가 하나뿐이면(혼자 놀기 1:1) 그 상대가 가진 만큼으로 자른다. 여럿이면 대상이 정해지기 전이라 "최대"로 보인다.
      const foes = opponentsOf(gameState, team);
      oppHpIsMax = foes.length !== 1;
      oppHpDelta = -(oppHpIsMax ? value : Math.min(value, Math.max(0, gameState.teams[foes[0]]?.hp ?? 0)));
      myHpDelta = enhanceAmount(enhanceTigerHeal(level), mult, divisor);
    } else multiplierAfter = enhanceMermaidAfter(mult, level);
    const randomExp = animal === 'sheep' ? enhanceAmount(enhanceSheepExp(level), mult, divisor) : 0;
    const oppMultiplierCut = animal === 'mermaid' ? enhanceMermaidCut(level) : 0;
    const oppDivisor = animal === 'mermaid' ? enhanceMermaidDivide(level) : 1;
    return {
      animal, level, myHpDelta, oppHpDelta, extraDraws, multiplierAfter, oppHpIsMax, randomExp, oppMultiplierCut, oppDivisor, divisor,
    };
  }

  if (animal === 'sheep') {
    extraDraws = level * mult;
  } else if (animal === 'rabbit') {
    myHpDelta = level * mult;
  } else if (animal === 'tiger') {
    const amount = level * tigerMult;
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
