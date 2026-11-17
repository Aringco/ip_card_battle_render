import {
  ANIMALS,
  THRESHOLDS,
  cloneEnhanceStatus,
  enhanceCooldown,
  enhanceCooldownLeft,
  enhanceMermaidAfter,
  enhanceAmount,
  enhanceHealAfterCut,
  enhanceHealCutOf,
  enhanceMermaidDivide,
  enhanceMermaidDivideTurns,
  enhanceMermaidOppDivide,
  enhanceOppMultiplierAfter,
  enhanceOverMultiplier,
  enhanceRabbitCleanse,
  enhanceRabbitRegenTurns,
  enhanceRabbitShieldPct,
  enhanceSheepCooldownCards,
  enhanceSheepCooldownCut,
  enhanceSheepExp,
  enhanceSheepExpStack,
  enhanceTigerBleedTurns,
  enhanceTigerHealCut,
  enhanceTigerPurges,
  enhanceEvadeOf,
  enhanceMermaidEvadePct,
  ENHANCE_BLEED_MAX_TURNS,
  ENHANCE_USE_EXP,
  ENHANCE_DIVISOR_MAX_TURNS,
  ENHANCE_REGEN_MAX_TURNS,
  enhanceDotTick,
  ENHANCE_HEAL_CUT_TURNS,
  enhanceValue,
  opponentsOf,
  skillLevelFor,
  ACORN_CAPS,
  acornAttackPct,
  acornBleedAmount,
  acornDivisor,
  acornRegenAmount,
  acornSkillFactor,
  acornSideOf,
  acornStatsOf,
} from 'shared';
import type { AcornRescue, Animal, GameEvent, GameState, SideId } from 'shared';
import { acornHit, acornProcExtra, addShield, consumeAcornBoost } from './acorn';

/**
 * 레벨 = floor(누적 경험치 / 임계값). 임계값은 동물마다 다르다(양·토끼 10, 인어·호랑이 20).
 * 카드 강화 판은 1 + floor(경험치 / 임계값)이고 Lv.5에서 멈춘다(shared/enhance.ts — 화면도 같은 skillLevelFor를 쓴다).
 */
export function levelOf(state: GameState, team: SideId, animal: Animal): number {
  return skillLevelFor(!!state.enhance, animal, state.teams[team].exp[animal]);
}

/**
 * 레벨이 1 이상이라 지금 고를 수 있는 동물 목록.
 *
 * ⚠️ "지금 쓸 수 있는 기술"의 **단일 관문**이다 — 기술 선택 검증(processSkillChoice)·시간초과 대체 선택
 *    (randomEligibleSkill)·방의 "고를 행동이 없을 때" 짧은 타이머가 모두 여기를 본다. 카드 강화 판의 쿨타임도
 *    그래서 여기서 건다(다른 곳에 걸면 그 경로 중 하나가 잠금을 모른다).
 */
export function eligibleAnimals(state: GameState, team: SideId): Animal[] {
  return ANIMALS.filter(a => levelOf(state, team, a) > 0 && enhanceCooldownLeft(state, team, a) === 0);
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
export function applySkillChoice(
  state: GameState,
  team: SideId,
  animal: Animal,
  // 특허랑이의 대상. 팀전은 상대가 한 팀뿐이라 생략하고, 개인전은 호출하는 쪽(gameEngine)이
  // "순위가 정해지지 않은 다른 편"인지 먼저 검증한 값을 넘긴다.
  target?: SideId,
  // 카드 강화 판의 무작위(실용신양 Lv.6+의 "무작위 카드 경험치")에만 쓴다 — 일반 판에는 무작위가 없다.
  rng: () => number = Math.random,
): GameEvent {
  const opponent = target ?? opponentsOf(state, team)[0];
  const me = state.teams[team];
  const foe = opponent === undefined ? undefined : state.teams[opponent];
  const level = levelOf(state, team, animal);

  // 카드 강화 판은 효과 공식이 다르고 경험치를 깎지 않는다 — 따로 계산한다.
  if (state.enhance) return applyEnhanceSkill(state, team, animal, level, opponent, rng, target);

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
      hpAfter: hpSnapshot(state),
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
      const steal = Math.min(amount, Math.max(0, foe?.hp ?? 0));
      oppHpDelta = -steal;
      myHpDelta = steal;
    }

    me.pendingMultiplier = 1;
  }

  // ④ 체력 반영 — 하한 0으로 클램프. 상한은 없다(승리 판정은 별도로 처리).
  if (foe) foe.hp = Math.max(0, foe.hp + oppHpDelta);
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
    hpAfter: hpSnapshot(state),
    // 대상은 개인전의 특허랑이에만 싣는다 — 팀전 이벤트의 모양은 예전과 똑같이 둔다.
    ...(state.mode === 'individual' && animal === 'tiger' && opponent !== undefined ? { target: opponent } : {}),
  };
}

/**
 * 카드 강화 판 — 기술 한 번의 효과(고른 기술 · 짝 효과가 함께 쓴다). shared/enhance.ts의 표(2026-10-30 5차 표)를 따른다.
 * **배율(mult — 디자인어 × Lv.Max 별도 배수)과 나눗셈(상대 디자인어 Lv.Max의 ÷10)을 받는 것은 실용신양의 장수 · 상표토끼의 즉시 회복 ·
 * 특허랑이의 공격력 셋뿐이다.** 나머지는 표의 값 그대로다.
 * - 실용신양: 다음 내 턴 추가 뽑기 `값 × 배율`(쌓는다) · 내 카드 넷 중 무작위 하나에 경험치 `+N × 경험치 중첩 배수`(Lv.6+ ×1 ~ Max ×10).
 *   Lv.6부터 내 **다른** 카드 중 쿨타임이 걸린 무작위 카드의 쿨타임 −1 ~ −3(Max는 두 장 초기화).
 * - 상표토끼: 내 체력 `+값 × 배율` · 지속 회복 +턴(한 턴의 양 = 즉시 회복의 50%). Lv.6부터
 *   나에게 걸린 부정한 효과(효과 감소 · 출혈) 중 무작위 하나의 남은 턴 −N(Max는 정화).
 * - 디자인어: 내 배율을 걸거나 키운다(enhanceMermaidAfter). Lv.6부터 상대가 쌓아 둔 배율을 ÷N(Max는 ×1로).
 *   Lv.Max는 상대가 고르는 기술의 효과를 ÷10으로 만들고 그것이 2턴(쌓이면 최대 5턴) 이어지며, 내 다음 차례까지 상대 기술을 20% 확률로 피한다.
 * - 특허랑이: 상대 체력 `−값 × 배율`(가진 만큼만 — 빼앗지 않는다) · 출혈 +턴(한 턴의 양 = 공격력의 50%). Lv.6부터
 *   상대의 회복 효율 −N%(상대의 다음 1턴), Lv.Max는 상대의 이로운 효과를 모두 걷는다.
 * 상대에게 거는 것(특허랑이 전부 · 디자인어의 배율 나누기와 ÷10)은 상대의 기술 회피(디자인어 Lv.Max)에 걸리면 하나도 들지 않는다.
 * 경험치는 깎지 않는다(레벨은 쌓아 올린 강화 단계다). 배율·나눗셈을 쓰는지·쿨타임을 거는지는 부르는 쪽이 정한다.
 * 지속 효과는 발동한 차례의 **다음** 차례가 끝날 때부터 든다 — 자기 차례에 스스로 건 몫(지속 회복)은 fresh로 표시해 둔다(turnManager).
 */
function applyEnhanceEffect(
  state: GameState,
  team: SideId,
  animal: Animal,
  level: number,
  mult: number,
  divisor: number,
  opponent: SideId | undefined,
  rng: () => number,
): Pick<
  Extract<GameEvent, { type: 'skillApplied' }>,
  | 'myHpDelta'
  | 'oppHpDelta'
  | 'extraDrawsQueued'
  | 'randomExp'
  | 'oppMultiplierCut'
  | 'oppDivisor'
  | 'oppDivisorTurns'
  | 'overMultiplier'
  | 'cooldownCuts'
  | 'cleanse'
  | 'regenAdded'
  | 'bleedAdded'
  | 'healCutUsed'
  | 'healCutAdded'
  | 'purged'
  | 'evadeAdded'
  | 'evaded'
  | 'shieldAbsorbed'
  | 'wardUsed'
  | 'reflected'
  | 'acornProc'
  | 'shieldAdded'
  | 'rescue'
> {
  const enh = state.enhance!;
  const me = state.teams[team];
  let foe = opponent === undefined ? undefined : state.teams[opponent];
  let myHpDelta = 0;
  let oppHpDelta = 0;
  let extraDrawsQueued = 0;
  let randomExp: { animal: Animal; amount: number; stack?: number } | undefined;
  let oppMultiplierCut: number | undefined;
  let oppDivisor: number | undefined;
  let oppDivisorTurns: number | undefined;
  const cooldownCuts: Array<{ animal: Animal; before: number; after: number }> = [];
  let cleanse: { kind: 'bleed' | 'divisor'; before: number; after: number } | undefined;
  let regenAdded: { turns: number; amount: number } | undefined;
  let bleedAdded: { turns: number; amount: number } | undefined;
  let healCutUsed: number | undefined;
  let healCutAdded: { pct: number; turns: number } | undefined;
  let purged: { regenTurns: number; multiplier: number; extraDraws: number } | undefined;
  let evadeAdded: number | undefined;
  let evaded = false;
  // 도토리 카드 — 보호막 · 반사 · 추가 발동 · 쓰러짐 방지(shared/acorn.ts · engine/acorn.ts). 카드가 없으면 모두 0이라 예전 계산과 같다.
  let shieldAbsorbed = 0;
  let wardUsed = 0;
  let reflected = 0;
  let acornProc = 0;
  let shieldAdded = 0;
  const rescue: AcornRescue[] = [];
  let hpApplied = false;
  const myAcorn = acornStatsOf(acornSideOf(state, team));
  // 실용신양의 무작위 경험치가 이 카드의 배수를 바꿀 수 있으므로 효과 전에 한 번 정한다
  const over = enhanceOverMultiplier(animal, me.exp[animal]);
  // 도토리 — 내 기술 효과 %(디자인어 배율 위에 더하는 몫) · 효과 감소(÷N) 덜어 내기. 디자인어 자신에는 안 걸린다(배율과 같은 규칙)
  const skillF = animal === 'mermaid' ? 1 : acornSkillFactor(state, team);
  const divEff = animal === 'mermaid' ? divisor : acornDivisor(state, team, divisor);
  const amount = (base: number) => enhanceAmount(base, mult * over * skillF, divEff);
  const withProc = (v: number) => {
    const extra = acornProcExtra(state, team, v, rng);
    acornProc += extra;
    return v + extra;
  };
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rng() * list.length)];

  // 상대를 노리는 기술 — 상대가 디자인어 Lv.Max의 회피를 두르고 있으면 공격마다 따로 굴린다(피하면 상대에게 거는 것이 하나도 들지 않는다).
  const hostile = animal === 'tiger' || (animal === 'mermaid' && (enhanceMermaidOppDivide(level) > 1 || enhanceMermaidDivide(level) > 1));
  if (hostile && opponent !== undefined) {
    // 디자인어 Lv.Max의 회피 + 상대 도토리 카드의 회피(합쳐 40%까지)
    const acornEvade = acornStatsOf(acornSideOf(state, opponent)).evade;
    const pct = acornEvade > 0 ? Math.min(ACORN_CAPS.evade, enhanceEvadeOf(state, opponent) + acornEvade) : enhanceEvadeOf(state, opponent);
    if (pct > 0 && rng() * 100 < pct) {
      evaded = true;
      foe = undefined;
    }
  }

  // 출혈 · 지속 회복을 더한다(턴은 더하고 상한에서 자른다). 한 턴의 양 = 이번에 건 카드 수치의 50%(enhanceDotTick) — 중첩 없음.
  // 그 편이 지금 차례인 편이면(내가 나에게 건 지속 회복) 이번 차례 끝에는 들지 않도록 fresh에 함께 적어 둔다 — "발동 턴의 다음 턴부터".
  const addDot = (side: SideId, kind: 'bleed' | 'regen', turns: number, cardValue: number) => {
    const d = (enh[kind][side] ??= { turns: 0, amount: 0 });
    // 도토리 — 지속 회복은 내 카드가 늘린 최대 턴, 출혈은 건 쪽(나)의 출혈 % · 고정 피해를 그 출혈에 새긴다(다시 걸리면 큰 쪽)
    const cap = kind === 'bleed' ? ENHANCE_BLEED_MAX_TURNS : ENHANCE_REGEN_MAX_TURNS + myAcorn.regenCap;
    if (kind === 'bleed') {
      d.bonusPct = Math.max(d.turns > 0 ? (d.bonusPct ?? 0) : 0, myAcorn.bleed);
      d.flat = Math.max(d.turns > 0 ? (d.flat ?? 0) : 0, myAcorn.bleedFlat);
    }
    const added = Math.max(0, Math.min(turns, cap - d.turns));
    d.turns += added;
    if (added > 0 && side === state.activeTeam) d.fresh = (d.fresh ?? 0) + added;
    if (d.turns <= 0) return undefined;
    const before = d.amount;
    const tick = enhanceDotTick(cardValue);
    d.amount = kind === 'bleed' ? acornBleedAmount(tick, d.bonusPct ?? 0, d.flat ?? 0) : acornRegenAmount(tick, myAcorn);
    if (added === 0 && d.amount === before) return undefined;
    return { turns: added, amount: d.amount };
  };

  if (animal === 'mermaid') {
    me.pendingMultiplier = enhanceMermaidAfter(me.pendingMultiplier, level);
    if (enhanceMermaidOppDivide(level) > 1 && foe) {
      const before = foe.pendingMultiplier;
      foe.pendingMultiplier = enhanceOppMultiplierAfter(before, level);
      oppMultiplierCut = before - foe.pendingMultiplier;
    }
    const divide = enhanceMermaidDivide(level);
    if (divide > 1 && foe && opponent !== undefined) {
      const had = (enh.divisors[opponent] ?? 1) > 1 ? (enh.divisorTurns[opponent] ?? 0) : 0;
      enh.divisors[opponent] = Math.max(enh.divisors[opponent] ?? 1, divide);
      enh.divisorTurns[opponent] = Math.min(ENHANCE_DIVISOR_MAX_TURNS, had + enhanceMermaidDivideTurns(level));
      oppDivisor = enh.divisors[opponent];
      oppDivisorTurns = enh.divisorTurns[opponent];
    }
    // 기술 회피 — 내 다음 차례가 시작될 때 advanceTurn이 지운다
    const evade = enhanceMermaidEvadePct(level);
    if (evade > 0) {
      enh.evade ??= {};
      enh.evade[team] = Math.max(enh.evade[team] ?? 0, evade);
      evadeAdded = enh.evade[team];
    }
  } else if (animal === 'sheep') {
    extraDrawsQueued = withProc(amount(enhanceValue('sheep', level)));
    // 쌓는다 — 짝 효과로 이미 예약된 몫을 기술이 지우면 안 된다(일반 판은 덮어쓴다)
    me.pendingExtraDraws += extraDrawsQueued;
    // 경험치(배율 무관) — Lv.6+는 그 한 번에 중첩 배수를 곱한다
    const stack = enhanceSheepExpStack(level);
    const bonus = enhanceSheepExp(level) * stack;
    if (bonus > 0) {
      const target = pick(ANIMALS);
      me.exp[target] += bonus;
      randomExp = { animal: target, amount: bonus, ...(stack > 1 ? { stack } : {}) };
    }
    // 쿨타임 감소(배율 무관) — 실용신양 자신은 빠진다(Max의 초기화로 같은 차례에 자기를 또 쓰게 되면 안 된다)
    const cdCut = enhanceSheepCooldownCut(level);
    const cds = enh.cooldowns[team];
    const cooling = cds ? ANIMALS.filter(a => a !== 'sheep' && cds[a] > 0) : [];
    for (let n = enhanceSheepCooldownCards(level); cdCut > 0 && n > 0 && cooling.length > 0; n--) {
      const target = cooling.splice(Math.floor(rng() * cooling.length), 1)[0];
      const before = cds[target];
      cds[target] = Math.max(0, before - cdCut);
      cooldownCuts.push({ animal: target, before, after: cds[target] });
    }
  } else if (animal === 'rabbit') {
    const healBase = amount(enhanceValue('rabbit', level));
    const raw = withProc(healBase);
    const cut = enhanceHealCutOf(state, team);
    myHpDelta = enhanceHealAfterCut(raw, cut);
    if (cut > 0 && raw > 0) healCutUsed = cut;
    // 도토리 — 즉시 회복의 일부를 보호막으로
    // 즉시 회복의 일부를 보호막으로 — 카드 자신의 몫(등급마다, enhanceRabbitShieldPct) + 도토리 카드의 몫
    const shieldPct = enhanceRabbitShieldPct(level) + myAcorn.healShield;
    if (shieldPct > 0) shieldAdded = addShield(state, team, Math.round((myHpDelta * shieldPct) / 100));
    // 부정한 효과 줄이기(배율 무관) — 나에게 걸린 것 중 무작위 하나(효과 감소 ÷N · 출혈). 걸린 것이 없으면 아무 일도 없다.
    const cleanseTurns = enhanceRabbitCleanse(level);
    const bad: Array<'bleed' | 'divisor'> = [];
    if ((enh.bleed[team]?.turns ?? 0) > 0) bad.push('bleed');
    if ((enh.divisors[team] ?? 1) > 1) bad.push('divisor');
    if (cleanseTurns > 0 && bad.length > 0) {
      const kind = pick(bad);
      if (kind === 'bleed') {
        const b = enh.bleed[team];
        const before = b.turns;
        b.turns = Math.max(0, before - cleanseTurns);
        b.fresh = Math.min(b.fresh ?? 0, b.turns);
        if (b.turns === 0) b.amount = 0;
        cleanse = { kind, before, after: b.turns };
      } else {
        const before = Math.max(1, enh.divisorTurns[team] ?? 0);
        enh.divisorTurns[team] = Math.max(0, before - cleanseTurns);
        if (enh.divisorTurns[team] === 0) enh.divisors[team] = 1;
        cleanse = { kind, before, after: enh.divisorTurns[team] };
      }
    }
    regenAdded = addDot(team, 'regen', enhanceRabbitRegenTurns(level) + myAcorn.regenTurns, healBase);
  } else {
    if (foe && opponent !== undefined) {
      // 도토리 — 공격 피해 %(조건부는 이 공격 전의 상대 상태로) → 대상의 피해 감소 · 보호막 · 쓰러짐 방지 · 반사(acornHit)
      const wasBleeding = (enh.bleed[opponent]?.turns ?? 0) > 0;
      const atkPct = acornAttackPct(state, team, opponent);
      const atkBase = amount(enhanceValue('tiger', level));
      const raw = Math.round(withProc(atkBase) * (1 + atkPct / 100));
      const hit = acornHit(state, team, opponent, raw, rng);
      hpApplied = true;
      oppHpDelta = -hit.dealt;
      shieldAbsorbed = hit.absorbed;
      wardUsed = hit.wardUsed;
      reflected = hit.reflected;
      rescue.push(...hit.rescue);
      // Lv.Max — 상대의 이로운 효과를 먼저 모두 걷는다(지속 회복 · 쌓아 둔 배율 · 다음 턴 추가 뽑기 · 기술 회피)
      if (enhanceTigerPurges(level)) {
        purged = { regenTurns: enh.regen[opponent]?.turns ?? 0, multiplier: foe.pendingMultiplier, extraDraws: foe.pendingExtraDraws };
        enh.regen[opponent] = { turns: 0, amount: 0 };
        foe.pendingMultiplier = 1;
        foe.pendingExtraDraws = 0;
        if (enh.evade) enh.evade[opponent] = 0;
      }
      bleedAdded = addDot(opponent, 'bleed', enhanceTigerBleedTurns(level) + myAcorn.bleedTurns, Math.round(atkBase * (1 + atkPct / 100)));
      const healCut = Math.min(ACORN_CAPS.healCut, enhanceTigerHealCut(level) + myAcorn.healCut + (wasBleeding ? myAcorn.healCutBleed : 0));
      if (healCut > 0) {
        const c = (enh.healCut[opponent] ??= { turns: 0, pct: 0 });
        c.pct = Math.max(c.turns > 0 ? c.pct : 0, healCut);
        c.turns = Math.max(c.turns, ENHANCE_HEAL_CUT_TURNS);
        healCutAdded = { pct: c.pct, turns: c.turns };
      }
    }
  }

  if (foe && !hpApplied) foe.hp = Math.max(0, foe.hp + oppHpDelta);
  me.hp += myHpDelta;
  me.skillStats[animal].totalHpGained += myHpDelta;
  if (animal !== 'mermaid') consumeAcornBoost(state, team);
  me.skillStats[animal].totalExtraDraws += extraDrawsQueued;

  return {
    myHpDelta,
    oppHpDelta,
    extraDrawsQueued,
    ...(randomExp ? { randomExp } : {}),
    ...(oppMultiplierCut !== undefined ? { oppMultiplierCut } : {}),
    ...(oppDivisor !== undefined ? { oppDivisor } : {}),
    ...(oppDivisorTurns !== undefined ? { oppDivisorTurns } : {}),
    ...(over > 1 && animal !== 'mermaid' ? { overMultiplier: over } : {}),
    ...(cooldownCuts.length > 0 ? { cooldownCuts } : {}),
    ...(cleanse ? { cleanse } : {}),
    ...(regenAdded ? { regenAdded } : {}),
    ...(bleedAdded ? { bleedAdded } : {}),
    ...(healCutUsed !== undefined ? { healCutUsed } : {}),
    ...(healCutAdded ? { healCutAdded } : {}),
    ...(purged ? { purged } : {}),
    ...(evadeAdded !== undefined ? { evadeAdded } : {}),
    ...(evaded ? { evaded: true as const } : {}),
    ...(shieldAbsorbed > 0 ? { shieldAbsorbed } : {}),
    ...(wardUsed > 0 ? { wardUsed } : {}),
    ...(reflected > 0 ? { reflected } : {}),
    ...(acornProc > 0 ? { acornProc } : {}),
    ...(shieldAdded > 0 ? { shieldAdded } : {}),
    ...(rescue.length > 0 ? { rescue } : {}),
  };
}

/**
 * 카드 강화 판의 **고른** 기술. 일반 판과 다른 점:
 * - **레벨을 내리지 않는다** — 경험치는 Lv.Max의 별도 배수 몫만 깎는다(아래 expSpent).
 * - 효과는 applyEnhanceEffect(레벨별 표 × 배율). 디자인어가 아니면 배율을 쓰고 1로 되돌린다.
 * - 쓴 카드에 쿨타임을 건다 — `쿨타임 + 1`로 세우면 이 차례가 끝나며(advanceTurn) 하나 줄어 쿨타임 그대로 남는다.
 */
function applyEnhanceSkill(
  state: GameState,
  team: SideId,
  animal: Animal,
  level: number,
  opponent: SideId | undefined,
  rng: () => number,
  /** 부르는 쪽이 고른 대상(개인전) — 없으면 팀전의 하나뿐인 상대가 opponent로 온다 */
  target?: SideId,
): GameEvent {
  const me = state.teams[team];
  const enh = state.enhance!;
  const multiplierUsed = animal === 'mermaid' ? 1 : me.pendingMultiplier;
  // 상대 디자인어(Lv.Max)가 건 나눗셈 — 걸려 있는 동안 고르는 기술(디자인어 제외)마다 나뉜다(4차 표 — 그 전에는 한 번 쓰면 사라졌다).
  // 남은 턴은 그 편의 차례가 끝날 때 준다(turnManager.advanceTurn).
  const divisorUsed = animal === 'mermaid' ? 1 : (enh.divisors[team] ?? 1);
  // Lv.Max 뒤에 쌓아 올린 별도 배수(×2 · ×3 …)는 **쓰면 ×1로 돌아간다**(2026-10-30 요청 — 실용신양 ×4에서 쓰면 ×1). 효과에는 지금 배수를 그대로 곱하고,
  // 그 몫의 경험치((배수 − 1) × 임계값)를 효과 **뒤에** 깎는다 — 다음 배수까지 쌓던 나머지와, 실용신양이 이 카드에 방금 더한 레벨은 남는다.
  const overSpent = (enhanceOverMultiplier(animal, me.exp[animal]) - 1) * THRESHOLDS[animal];
  const effect = applyEnhanceEffect(state, team, animal, level, multiplierUsed, divisorUsed, opponent, rng);
  me.exp[animal] -= overSpent;
  if (animal !== 'mermaid') me.pendingMultiplier = 1;

  const cooldowns = enh.cooldowns[team];
  if (cooldowns) cooldowns[animal] = enhanceCooldown(animal, level) + 1;
  // 도토리 — 쓴 카드의 쿨타임 −1(1 아래로는 안 내린다 — 같은 차례에 다시 쓰면 안 된다) · 그 카드 경험치(턴당 1회)
  const ac = acornSideOf(state, team);
  const acStats = acornStatsOf(ac);
  let cdProc = false;
  if (cooldowns && acStats.cdProc > 0 && cooldowns[animal] > 1 && rng() * 100 < acStats.cdProc) {
    cooldowns[animal] -= 1;
    cdProc = true;
  }
  // 쓴 카드에 경험치(2026-11-07 — 실용신양 · 상표토끼 +1, 디자인어 · 특허랑이 +2). 화면은 효과 연출 순간에 드러낸다(useExp)
  const useExp = ENHANCE_USE_EXP[animal];
  me.exp[animal] += useExp;
  let expProc = 0;
  if (ac && acStats.expProcPct > 0 && ac.expProcTurn !== state.turn && rng() * 100 < Math.min(ACORN_CAPS.proc, acStats.expProcPct)) {
    ac.expProcTurn = state.turn;
    expProc = acStats.expProcAmt;
    me.exp[animal] += expProc;
  }
  (enh.usedThisTurn ??= []).push(animal);
  me.skillStats[animal].count += 1;
  me.skillStats[animal].totalLevel += level;

  return {
    type: 'skillApplied',
    team,
    animal,
    level,
    expSpent: overSpent,
    multiplierUsed,
    multiplierAfter: me.pendingMultiplier,
    ...effect,
    hpAfter: hpSnapshot(state),
    // 대상 — 특허랑이, 그리고 개인전에서는 상대를 고른 디자인어(Lv.6+ — 화면이 상대 배율을 깎는 자리를 이 값으로 찾는다)
    ...((animal === 'tiger' || (animal === 'mermaid' && target !== undefined)) && opponent !== undefined ? { target: opponent } : {}),
    ...(divisorUsed > 1 ? { divisorUsed } : {}),
    ...(cdProc ? { cdProc: true as const } : {}),
    ...(expProc > 0 ? { expProc } : {}),
    ...(useExp > 0 ? { useExp } : {}),
    status: cloneEnhanceStatus(enh),
  };
}

/** 모든 편의 지금 체력 — skillApplied.hpAfter. 팀전은 { A, B }, 개인전은 { p1 … pN }. */
function hpSnapshot(state: GameState): Record<SideId, number> {
  const hp: Record<SideId, number> = {};
  for (const side of Object.keys(state.teams)) hp[side] = state.teams[side].hp;
  return hp;
}

/**
 * 아무 행동도 쓰지 않고 턴을 넘긴다.
 * auto=true면 고를 수 있는 행동이 아예 없어 서버가 즉시 대신 처리한 것 — 화면에
 * 알릴 필요 없는 침묵 처리이므로 클라이언트는 이 값을 보고 캡션/해설을 생략한다.
 */
export function applyPass(team: SideId, auto: boolean): GameEvent {
  return { type: 'skillPassed', team, auto };
}

/** 제한시간 내에 고르지 않으면 서버가 대신 무작위로 하나를 골라준다(고를 수 있는 게 없으면 null=패스). */
export function randomEligibleSkill(state: GameState, team: SideId, rng: () => number = Math.random): Animal | null {
  const options = eligibleAnimals(state, team);
  if (options.length === 0) return null;
  return options[Math.floor(rng() * options.length)];
}
