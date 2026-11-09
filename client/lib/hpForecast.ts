// 카드 강화 — 이 편이 이번 차례를 마칠 때 지속 효과(출혈 → 지속 회복)로 체력이 얼마나 움직일지(2026-11-02 요청).
// PC 체력 구슬(TeamTotalPanel)에 마우스를 올리거나 모바일 체력 막대(MobileHpBar)를 눌러 초점을 두면 그 몫이 깜빡이며 보인다.
// ⚠️ 서버 engine/turnManager.ts의 tickEnhanceStatus와 같은 계산이다 — 출혈이 먼저이고 그것으로 0이 되면 회복은 들지 않는다,
//    이번 차례에 스스로 건 몫(fresh)은 들지 않는다, 회복은 회복 효율 감소(healCut)를 거친다. 한쪽을 고치면 함께 고칠 것.
//    도토리 카드의 출혈 무효 · 받는 출혈 감소 · 보호막도 같은 순서로 든다(engine/acorn.ts의 acornBleed). 쓰러짐 방지 · 위기 회복은 예상에 넣지 않는다.
import type { ClientGameState, SideId } from 'shared';
import { acornBleedTaken, enhanceHealAfterCut, enhanceHealCutOf } from 'shared';

export interface HpForecast {
  /** 지금 체력(화면상 값) */
  hp: number;
  /** 출혈로 깎일 양(양수) · 지속 회복으로 오를 양 */
  bleed: number;
  regen: number;
  /** 보호막이 막을 출혈 */
  shield: number;
  /** 합 — 양수면 오르고 음수면 깎인다 */
  delta: number;
  after: number;
}

/** 강화 판이 아니면 null. gameState는 화면상 값(withDisplayedHp · withDisplayedTeams)을 넣는다. */
export function hpForecastOf(gameState: ClientGameState, side: SideId): HpForecast | null {
  const enh = gameState.enhance;
  if (!enh) return null;
  const hp = gameState.teams[side]?.hp ?? 0;
  let cur = hp;
  let bleedAmt = 0;
  let regenAmt = 0;
  const shield = 0;
  const bleed = enh.bleed?.[side];
  if (bleed && bleed.turns - (bleed.fresh ?? 0) > 0) {
    const taken = acornBleedTaken(gameState, side, bleed.amount);
    // 보호막은 출혈을 막지 못한다(서버 acornBleed와 같다)
    bleedAmt = Math.min(taken, Math.max(0, cur));
    cur -= bleedAmt;
  }
  const regen = enh.regen?.[side];
  if (cur > 0 && regen && regen.turns - (regen.fresh ?? 0) > 0) {
    regenAmt = enhanceHealAfterCut(regen.amount, enhanceHealCutOf(gameState, side));
    cur += regenAmt;
  }
  return { hp, bleed: bleedAmt, regen: regenAmt, shield, delta: cur - hp, after: cur };
}

/** 표시 문구 — 이번 차례 끝에 체력이 움직일 양과 그 내역: "+20 (회복 +24 · 출혈 −4)" · "−12 (출혈 −12)" · "±0" */
export function hpForecastText(f: HpForecast): string {
  const net = f.delta > 0 ? `+${f.delta}` : f.delta < 0 ? `−${-f.delta}` : '±0';
  const parts = [f.regen > 0 ? `회복 +${f.regen}` : '', f.bleed > 0 ? `출혈 −${f.bleed}` : '', f.shield > 0 ? `보호막 −${f.shield}` : ''].filter(Boolean);
  return parts.length ? `${net} (${parts.join(' · ')})` : net;
}
