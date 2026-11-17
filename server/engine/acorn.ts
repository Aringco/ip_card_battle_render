import {
  ACORN_CAPS,
  ANIMALS,
  acornEffectsOf,
  acornHpPct,
  acornLevelExp,
  acornSideOf,
  acornStatsOf,
  cloneEnhanceStatus,
  drawAcornOptions,
  emptyAcornSide,
  enhanceHealAfterCut,
  enhanceHealCutOf,
  isAcornFestivalTurn,
  opponentsOf,
  rollAcornTier,
  skillLevelFor,
} from 'shared';
import type { AcornGains, AcornRescue, Animal, GameEvent, GameState, SideId } from 'shared';
import type { RNG } from './places';

// 도토리 카드(증강)의 엔진 쪽 — 축제 열기 · 고르기 · 고른 순간의 효과 · 피해/회복 계산의 도토리 몫.
// 카드 목록과 화면과 함께 쓰는 계산은 shared/acorn.ts, 설계는 ACORN_CARDS.md.

/** 강화 판을 시작할 때 — 편마다 빈 도토리 상태 · 보호막 0 */
export function attachAcorn(state: GameState): void {
  const enh = state.enhance!;
  const sides = Object.keys(state.teams);
  enh.acorn = { festivals: 0, sides: Object.fromEntries(sides.map(s => [s, emptyAcornSide()])), offer: null };
  enh.shield = Object.fromEntries(sides.map(s => [s, 0]));
}

export function acornOfferOpen(state: GameState): boolean {
  return !!state.enhance?.acorn?.offer;
}

/** 이 턴이 축제 턴이면 고르기를 연다 — 판에 남은(순위가 정해지지 않은) 모든 편에게 같은 단계, 사람마다 후보 셋 */
export function openAcornFestivalIfDue(state: GameState, rng: RNG): GameEvent[] {
  const acorn = state.enhance?.acorn;
  if (!acorn || acorn.offer || state.phase !== 'playing') return [];
  if (!isAcornFestivalTurn(state.turn, state.settings)) return [];
  const no = acorn.festivals + 1;
  const tier = rollAcornTier(no, rng);
  const options: Record<SideId, string[]> = {};
  const picked: Record<SideId, string | null> = {};
  for (const side of state.turnOrder) {
    if (state.teams[side]?.finish) continue;
    const a = (acorn.sides[side] ??= emptyAcornSide());
    const ids = drawAcornOptions(a, tier, rng);
    if (ids.length === 0) continue;
    for (const id of ids) if (!a.seen.includes(id)) a.seen.push(id);
    options[side] = ids;
    picked[side] = null;
  }
  if (Object.keys(options).length === 0) return [];
  acorn.festivals = no;
  acorn.offer = { no, tier, options, picked };
  return [{ type: 'acornOffer', no, tier }];
}

/** 고르기 — 후보에 없는 카드 · 이미 고른 편이면 무시(빈 배열). 모두 고르면 고르기를 닫는다(closed) */
export function pickAcorn(state: GameState, side: SideId, id: string, rng: RNG, auto = false): GameEvent[] {
  const acorn = state.enhance?.acorn;
  const offer = acorn?.offer;
  if (!acorn || !offer || state.phase !== 'playing') return [];
  if (!(side in offer.picked) || offer.picked[side] !== null) return [];
  if (!offer.options[side]?.includes(id)) return [];

  offer.picked[side] = id;
  const a = (acorn.sides[side] ??= emptyAcornSide());
  a.owned.push({ id, tier: offer.tier, turn: state.turn });
  const gains = applyAcornNow(state, side, id, offer.tier, rng);
  const closed = Object.values(offer.picked).every(p => p !== null);
  if (closed) acorn.offer = null;
  return [{
    type: 'acornPicked', team: side, id, tier: offer.tier, gains, hpAfter: hpSnapshot(state),
    status: cloneEnhanceStatus(state.enhance!),
    ...(auto ? { auto: true as const } : {}),
    ...(closed ? { closed: true as const } : {}),
  }];
}

/**
 * 리롤 — 그 편의 slot번째 후보를 같은 단계의 다른 카드로 바꾼다(칸마다 축제에 한 번). 가진 카드 · 지금 보이는 후보는 다시 나오지 않고,
 * 처음 보는 카드를 먼저 쓴다(drawAcornOptions와 같은 규칙). 이미 고른 편 · 쓴 칸 · 바꿀 카드가 없으면 무시(빈 배열).
 */
export function rerollAcorn(state: GameState, side: SideId, slot: number, rng: RNG): GameEvent[] {
  const acorn = state.enhance?.acorn;
  const offer = acorn?.offer;
  if (!acorn || !offer || state.phase !== 'playing') return [];
  const opts = offer.options[side];
  if (!opts || offer.picked[side] !== null || !Number.isInteger(slot) || slot < 0 || slot >= opts.length) return [];
  offer.rerolled ??= {};
  const used = (offer.rerolled[side] ??= opts.map(() => false));
  if (used[slot]) return [];
  const a = (acorn.sides[side] ??= emptyAcornSide());
  const [id] = drawAcornOptions(a, offer.tier, rng, 1, opts);
  if (id === undefined) return [];
  opts[slot] = id;
  used[slot] = true;
  if (!a.seen.includes(id)) a.seen.push(id);
  return [{ type: 'acornReroll', team: side, slot, id }];
}

/** 시간초과 — 아직 고르지 않은 편은 후보 중 무작위 하나 */
export function autoPickAcorns(state: GameState, rng: RNG): GameEvent[] {
  const offer = state.enhance?.acorn?.offer;
  if (!offer) return [];
  const events: GameEvent[] = [];
  for (const side of Object.keys(offer.picked)) {
    if (offer.picked[side] !== null) continue;
    const opts = offer.options[side];
    events.push(...pickAcorn(state, side, opts[Math.floor(rng() * opts.length)], rng, true));
  }
  return events;
}

/** 고르는 중에 판에서 빠진 편(항복 · 나가기) — 그 편을 빼고, 남은 사람이 모두 골랐으면 닫는다 */
export function dropFromAcornOffer(state: GameState, side: SideId): void {
  const acorn = state.enhance?.acorn;
  const offer = acorn?.offer;
  if (!acorn || !offer || !(side in offer.picked)) return;
  delete offer.picked[side];
  delete offer.options[side];
  if (Object.values(offer.picked).every(p => p !== null)) acorn.offer = null;
}

/** 고른 순간 드는 것(경험치 · 쿨타임 · 회복 · 보호막 · 정화 · 충전 · 조건 발동 등록) */
function applyAcornNow(state: GameState, side: SideId, id: string, tier: 1 | 2 | 3 | 4, rng: RNG): AcornGains {
  const enh = state.enhance!;
  const a = acornSideOf(state, side)!;
  const me = state.teams[side];
  const gains: AcornGains = {};
  const addExp = (animal: Animal, n: number) => {
    if (n <= 0) return;
    me.exp[animal] += n;
    (gains.exp ??= {})[animal] = (gains.exp[animal] ?? 0) + n;
  };
  const shuffled = () => {
    const list = [...ANIMALS];
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  for (const e of acornEffectsOf(id)) {
    switch (e.k) {
      case 'exp': {
        const order = shuffled();
        order.forEach((animal, i) => addExp(animal, i < e.cards ? e.amount : (e.others ?? 0)));
        break;
      }
      case 'expT':
        shuffled().slice(0, e.cards).forEach(animal => addExp(animal, acornLevelExp(animal, e.pct)));
        break;
      case 'expLow': {
        const levels = shuffled().map(animal => ({ animal, lv: skillLevelFor(true, animal, me.exp[animal]) }));
        const low = levels.reduce((m, x) => (x.lv < m.lv ? x : m), levels[0]).animal;
        for (const animal of ANIMALS) addExp(animal, animal === low ? e.amount : e.others);
        break;
      }
      case 'draws':
        if (e.times <= 1) me.pendingExtraDraws += e.n;
        else a.drawCharges.push({ n: e.n, left: e.times });
        gains.draws = (gains.draws ?? 0) + e.n;
        break;
      case 'cd': {
        const cds = enh.cooldowns[side];
        const cooling = shuffled().filter(x => cds[x] > 0).slice(0, e.cards);
        for (const animal of cooling) {
          const before = cds[animal];
          cds[animal] = e.by >= 99 ? 0 : Math.max(0, before - e.by);
          (gains.cd ??= []).push({ animal, before, after: cds[animal] });
        }
        break;
      }
      case 'heal': {
        const heal = enhanceHealAfterCut(acornHpPct(state, e.pct), enhanceHealCutOf(state, side));
        me.hp += heal;
        gains.heal = (gains.heal ?? 0) + heal;
        break;
      }
      case 'shield':
        gains.shield = (gains.shield ?? 0) + addShield(state, side, acornHpPct(state, e.pct));
        break;
      case 'cleanse':
        for (let n = 0; n < e.n; n++) {
          const what = cleanseOne(state, side, Infinity, rng);
          if (what) (gains.cleansed ??= []).push(what);
        }
        break;
      case 'cleanseTurns': {
        const what = cleanseOne(state, side, e.by, rng, e.only);
        if (what) (gains.cleansed ??= []).push(what);
        break;
      }
      case 'purgeMult':
        for (const foe of opponentsOf(state, side)) {
          if (state.teams[foe].pendingMultiplier > 1) {
            state.teams[foe].pendingMultiplier = 1;
            (gains.purged ??= []).push(foe);
          }
        }
        break;
      case 'boost':
        a.boost = Math.max(a.boost, e.pct);
        if (e.ignoreDiv) a.boostIgnoreDiv = true;
        break;
      case 'ward':
        a.ward = Math.max(a.ward, e.pct);
        break;
      case 'bleedBlock':
        a.bleedBlock += e.n;
        break;
      case 'survive':
        a.survive = Math.max(a.survive, e.pct);
        break;
      case 'lowHeal':
        a.lowHeal = Math.max(a.lowHeal, e.pct);
        break;
      case 'periodicExp':
        a.periodic.push({ kind: 'exp', every: e.every, amount: e.amount, left: e.times, from: state.turn });
        break;
      case 'periodicCleanse':
        a.periodic.push({ kind: 'cleanse', every: e.every, amount: 0, left: e.times, from: state.turn });
        break;
      default:
        break; // 영구 능력치(stat · proc · reflect · expProc)는 쓰는 자리에서 acornStatsOf로 읽는다
    }
  }
  return gains;
}

/**
 * 부정 효과 하나 — 출혈 · 효과 감소(÷N) · 회복 효율 감소 중 걸린 것에서 무작위. by턴 줄인다(Infinity = 제거).
 * 무엇을 줄였는지 이름을 돌려준다(없으면 null).
 */
function cleanseOne(state: GameState, side: SideId, by: number, rng: RNG, only?: 'bleed'): string | null {
  const enh = state.enhance!;
  const bad: Array<'bleed' | 'divisor' | 'healCut'> = [];
  if ((enh.bleed[side]?.turns ?? 0) > 0) bad.push('bleed');
  if (!only && (enh.divisors[side] ?? 1) > 1) bad.push('divisor');
  if (!only && (enh.healCut[side]?.turns ?? 0) > 0) bad.push('healCut');
  if (bad.length === 0) return null;
  const kind = bad[Math.floor(rng() * bad.length)];
  if (kind === 'bleed') {
    const b = enh.bleed[side];
    b.turns = Math.max(0, b.turns - by);
    b.fresh = Math.min(b.fresh ?? 0, b.turns);
    if (b.turns === 0) Object.assign(b, { amount: 0, bonusPct: 0, flat: 0 });
    return '출혈';
  }
  if (kind === 'divisor') {
    enh.divisorTurns[side] = Math.max(0, (enh.divisorTurns[side] ?? 0) - by);
    if (enh.divisorTurns[side] === 0) enh.divisors[side] = 1;
    return '효과 감소';
  }
  const c = enh.healCut[side];
  c.turns = Math.max(0, c.turns - by);
  if (c.turns === 0) c.pct = 0;
  return '회복 효율 감소';
}

/** 보호막 더하기 — 상한 없음(2026-11-17 요청 — 그 전 시작 체력의 20%). 실제로 더한 양 */
export function addShield(state: GameState, side: SideId, amount: number): number {
  const enh = state.enhance;
  if (!enh || amount <= 0) return 0;
  enh.shield ??= {};
  const before = enh.shield[side] ?? 0;
  enh.shield[side] = before + amount;
  return enh.shield[side] - before;
}

/** 피해를 받은 뒤 — 0이면 쓰러짐 방지, 아니면 시작 체력 30% 이하에서 위기 회복(판에 1회씩) */
function rescueAfterDamage(state: GameState, side: SideId): AcornRescue[] {
  const a = acornSideOf(state, side);
  const team = state.teams[side];
  if (!a) return [];
  if (team.hp <= 0 && a.survive > 0) {
    const amount = 1 + acornHpPct(state, a.survive);
    team.hp = amount;
    a.survive = 0;
    return [{ side, kind: 'survive', amount }];
  }
  if (team.hp > 0 && team.hp <= acornHpPct(state, 30) && a.lowHeal > 0) {
    const amount = acornHpPct(state, a.lowHeal);
    team.hp += amount;
    a.lowHeal = 0;
    return [{ side, kind: 'lowHeal', amount }];
  }
  return [];
}

/**
 * 특허랑이 공격 하나를 대상에게 넣는다 — 대상의 피해 감소(공격자의 관통만큼 덜어 냄) → "다음 공격 −%" → 보호막(공격자의 보호막 무시만큼은 그대로 통과)
 * → 체력(가진 만큼만) → 쓰러짐 방지 · 위기 회복 → 반사. raw는 공격자의 도토리 % · 추가 발동까지 얹은 값이다.
 */
export function acornHit(state: GameState, attacker: SideId, victim: SideId, raw: number, rng: RNG): {
  dealt: number; absorbed: number; wardUsed: number; reflected: number; rescue: AcornRescue[];
} {
  const enh = state.enhance!;
  const foe = state.teams[victim];
  const va = acornSideOf(state, victim);
  const vs = acornStatsOf(va);
  const as = acornStatsOf(acornSideOf(state, attacker));
  let dmg = raw;

  let guard = vs.guard + (va && va.firstHitTurn !== state.turn ? vs.guardFirst : 0) + (foe.hp <= acornHpPct(state, 30) ? vs.guardLow : 0);
  if (va && vs.guardFirst > 0) va.firstHitTurn = state.turn;
  guard = Math.min(ACORN_CAPS.guard, guard) * (1 - Math.min(100, as.pierce) / 100);
  dmg = Math.round(dmg * (1 - guard / 100));

  let wardUsed = 0;
  if (va && va.ward > 0) {
    wardUsed = va.ward;
    dmg = Math.round(dmg * (1 - va.ward / 100));
    va.ward = 0;
  }

  let absorbed = 0;
  const shield = enh.shield?.[victim] ?? 0;
  if (shield > 0 && dmg > 0) {
    absorbed = Math.min(shield, Math.round(dmg * (1 - Math.min(100, as.shieldPierce) / 100)));
    enh.shield![victim] = shield - absorbed;
    dmg -= absorbed;
  }

  const dealt = Math.min(dmg, Math.max(0, foe.hp));
  foe.hp -= dealt;
  const rescue = rescueAfterDamage(state, victim);

  let reflected = 0;
  if (va && vs.reflectPct > 0 && va.reflectTurn !== state.turn && dealt + absorbed > 0 && rng() * 100 < Math.min(ACORN_CAPS.proc, vs.reflectPct)) {
    va.reflectTurn = state.turn;
    const me = state.teams[attacker];
    reflected = Math.min(Math.round(((dealt + absorbed) * vs.reflectAmt) / 100), Math.max(0, me.hp));
    me.hp -= reflected;
    rescue.push(...rescueAfterDamage(state, attacker));
  }
  return { dealt, absorbed, wardUsed, reflected, rescue };
}

/** 출혈 한 번 — 출혈 무효 → 받는 출혈 감소 → 체력(보호막은 막지 못한다) → 쓰러짐 방지 · 위기 회복 */
export function acornBleed(state: GameState, side: SideId, amount: number): {
  lost: number; absorbed: number; blocked: boolean; rescue: AcornRescue[];
} {
  const team = state.teams[side];
  const a = acornSideOf(state, side);
  if (a && a.bleedBlock > 0) {
    a.bleedBlock -= 1;
    return { lost: 0, absorbed: 0, blocked: true, rescue: [] };
  }
  // 보호막은 출혈을 막지 못한다(2026-11-07) — 출혈은 곧바로 체력을 깎는다
  const dmg = Math.round(amount * (1 - Math.min(ACORN_CAPS.bleedGuard, acornStatsOf(a).bleedGuard) / 100));
  const absorbed = 0;
  const lost = Math.min(dmg, Math.max(0, team.hp));
  team.hp -= lost;
  return { lost, absorbed, blocked: false, rescue: rescueAfterDamage(state, side) };
}

/** 추가 발동(턴당 1회) — 굴려서 걸리면 더할 양, 아니면 0 */
export function acornProcExtra(state: GameState, side: SideId, value: number, rng: RNG): number {
  const a = acornSideOf(state, side);
  if (!a || value <= 0) return 0;
  const s = acornStatsOf(a);
  if (s.procPct <= 0 || a.procTurn === state.turn) return 0;
  if (rng() * 100 >= Math.min(ACORN_CAPS.proc, s.procPct)) return 0;
  a.procTurn = state.turn;
  return Math.round((value * s.procAmt) / 100);
}

/** 다음 기술 % 충전을 쓴다(실용신양 · 상표토끼 · 특허랑이를 쓴 뒤) */
export function consumeAcornBoost(state: GameState, side: SideId): void {
  const a = acornSideOf(state, side);
  if (!a) return;
  a.boost = 0;
  a.boostIgnoreDiv = false;
}

/** 이번 장소에서 쓰는 "카드 +n장" 충전 — 그 수만큼 예약 뽑기에 더하고 남은 횟수를 줄인다 */
export function consumeAcornDrawCharges(state: GameState, side: SideId): number {
  const a = acornSideOf(state, side);
  if (!a || a.drawCharges.length === 0) return 0;
  let n = 0;
  for (const c of a.drawCharges) {
    n += c.n;
    c.left -= 1;
  }
  a.drawCharges = a.drawCharges.filter(c => c.left > 0);
  return n;
}

/** 턴이 오를 때 — 턴마다 도는 효과(경험치 · 정화) */
export function acornRoundStart(state: GameState, rng: RNG): GameEvent[] {
  const acorn = state.enhance?.acorn;
  if (!acorn) return [];
  const events: GameEvent[] = [];
  for (const side of state.turnOrder) {
    const a = acorn.sides[side];
    if (!a || state.teams[side]?.finish) continue;
    for (const p of a.periodic) {
      if (p.left <= 0 || state.turn <= p.from || (state.turn - p.from) % p.every !== 0) continue;
      p.left -= 1;
      const owner = a.owned.find(o => acornEffectsOf(o.id).some(e => e.k === (p.kind === 'exp' ? 'periodicExp' : 'periodicCleanse')));
      const id = owner?.id ?? '';
      if (p.kind === 'exp') {
        const animal = ANIMALS[Math.floor(rng() * ANIMALS.length)];
        state.teams[side].exp[animal] += p.amount;
        events.push({ type: 'acornRound', team: side, id, kind: 'exp', animal, amount: p.amount });
      } else {
        const what = cleanseOne(state, side, Infinity, rng);
        if (what) events.push({ type: 'acornRound', team: side, id, kind: 'cleanse', cleansed: what });
      }
    }
    a.periodic = a.periodic.filter(p => p.left > 0);
  }
  return events;
}

/** 같은 계산을 세 번 쓰지 않으려고 — 모든 편의 지금 체력 */
function hpSnapshot(state: GameState): Record<SideId, number> {
  return Object.fromEntries(Object.keys(state.teams).map(s => [s, state.teams[s].hp]));
}
