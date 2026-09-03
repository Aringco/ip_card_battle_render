import { ANIMALS, THRESHOLDS } from 'shared';
import type { Animal, GameEvent, GameState, Team } from 'shared';

/** 레벨 = floor(누적 경험치 / 임계값). 임계값은 동물마다 다르다(양·토끼 10, 인어·호랑이 20). */
export function levelOf(state: GameState, team: Team, animal: Animal): number {
  return Math.floor(state.teams[team].exp[animal] / THRESHOLDS[animal]);
}

/** 레벨이 1 이상이라 지금 고를 수 있는 동물 목록. */
export function eligibleAnimals(state: GameState, team: Team): Animal[] {
  return ANIMALS.filter(a => levelOf(state, team, a) > 0);
}

/**
 * 턴을 마친 팀이 4가지 행동 중 하나를 고르면 호출된다. 각 동물의 "레벨"(차감 직전 값)을
 * 배율로 사용하며, 고른 동물의 경험치는 사용한 레벨만큼(레벨×임계값)만 차감된다 — 임계값을
 * 초과해 쌓아둔 경험치는 다음 레벨을 위해 그대로 남는다. 효과로 얻은 값은 절대 그 동물의
 * 경험치로 되돌아가지 않는다 — 경험치와 체력(=점수)은 완전히 분리된 자원이다.
 *
 * - 🐑 실용신양: 다음 내 턴에 `레벨 × 배율`회 추가로 뽑는다.
 * - 🐰 상표토끼: 내 체력이 `레벨 × 배율`만큼 오른다.
 * - 🐯 특허랑이: 상대 체력에서 `레벨 × 배율`만큼(상대가 가진 만큼만) 강탈한다 — 상대 −n, 나 +n.
 * - 🧜‍♀️ 디자인어: 대기 배율에 그 발동의 레벨을 더한다(`배율 += 레벨`) — "다음 행동이 레벨만큼
 *   더 발동한다"는 뜻이다. 스스로는 배율을 소모하지 않고, 연달아 쓰면 레벨이 그대로 누적된다
 *   (기본 배율 1에 레벨 2를 두 번 쌓으면 1+2+2=5, 곱연산이 아니라 합연산이다).
 *
 * 배율은 토끼·호랑이·양을 쓰는 순간 1로 초기화된다("다음을 노리기"로는 소모되지 않는다).
 * 레벨이 0인 동물을 골랐다면(정상적인 클라이언트라면 UI에서 막힘) 아무 일도 일어나지 않는다.
 */
export function applySkillChoice(state: GameState, team: Team, animal: Animal): GameEvent {
  const opponent: Team = team === 'A' ? 'B' : 'A';
  const me = state.teams[team];
  const foe = state.teams[opponent];
  const level = levelOf(state, team, animal);

  if (level <= 0) {
    return {
      type: 'skillApplied',
      team,
      animal,
      level: 0,
      expSpent: 0,
      multiplierUsed: 1,
      multiplierAfter: me.pendingMultiplier,
      myHpDelta: 0,
      oppHpDelta: 0,
      extraDrawsQueued: 0,
      hpAfter: { A: state.teams.A.hp, B: state.teams.B.hp },
    };
  }

  // ① 경험치 소모 — 효과보다 먼저, 그리고 무조건. 초과분은 그대로 남긴다.
  const expSpent = level * THRESHOLDS[animal];
  me.exp[animal] -= expSpent;

  let multiplierUsed = 1;
  let myHpDelta = 0;
  let oppHpDelta = 0;
  let extraDrawsQueued = 0;

  if (animal === 'mermaid') {
    // ② 인어는 배율만 키운다 — 자기 자신은 배율을 소모하지 않는다. 곱연산이 아니라
    // "다음 행동이 이 레벨만큼 더 발동한다"는 합연산으로 누적된다(효과 × (1 + 누적 레벨)).
    me.pendingMultiplier += level;
  } else {
    // ③ 나머지 셋은 지금까지 쌓인 배율을 곱해 쓰고, 쓴 뒤 1로 되돌린다.
    multiplierUsed = me.pendingMultiplier;
    const amount = level * multiplierUsed;

    if (animal === 'sheep') {
      extraDrawsQueued = amount;
      me.pendingExtraDraws = extraDrawsQueued; // 기존 예약분은 덮어쓴다(누적 아님)
    } else if (animal === 'rabbit') {
      myHpDelta = amount;
    } else {
      // tiger — 강탈은 보존형: 상대가 가진 만큼만 뺏는다(오버킬 없음).
      const steal = Math.min(amount, Math.max(0, foe.hp));
      oppHpDelta = -steal;
      myHpDelta = steal;
    }

    me.pendingMultiplier = 1;
  }

  // ④ 체력 반영 — 하한 0으로 클램프. 상한은 없다(승리 판정은 별도로 처리).
  foe.hp = Math.max(0, foe.hp + oppHpDelta);
  me.hp = me.hp + myHpDelta;

  // ⑤ 통계
  const stat = me.skillStats[animal];
  stat.count += 1;
  stat.totalLevel += level;
  stat.totalHpGained += myHpDelta;
  stat.totalExtraDraws += extraDrawsQueued;

  return {
    type: 'skillApplied',
    team,
    animal,
    level,
    expSpent,
    multiplierUsed,
    multiplierAfter: me.pendingMultiplier,
    myHpDelta,
    oppHpDelta,
    extraDrawsQueued,
    hpAfter: { A: state.teams.A.hp, B: state.teams.B.hp },
  };
}

/**
 * 아무 행동도 쓰지 않고 턴을 넘긴다.
 * auto=true면 고를 수 있는 행동이 아예 없어 서버가 즉시 대신 처리한 것 — 화면에
 * 알릴 필요 없는 침묵 처리이므로 클라이언트는 이 값을 보고 캡션/해설을 생략한다.
 */
export function applyPass(team: Team, auto: boolean): GameEvent {
  return { type: 'skillPassed', team, auto };
}

/** 제한시간 내에 고르지 않으면 서버가 대신 무작위로 하나를 골라준다(고를 수 있는 게 없으면 null=패스). */
export function randomEligibleSkill(state: GameState, team: Team, rng: () => number = Math.random): Animal | null {
  const options = eligibleAnimals(state, team);
  if (options.length === 0) return null;
  return options[Math.floor(rng() * options.length)];
}
