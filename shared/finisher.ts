import type { GameEvent, SideId } from './types';

/**
 * 마무리 연출(화면 FinisherLayer) — 한 사람의 승패를 정한 체력 변화 **바로 앞**에서, 그 사람의 체력 막대(정보창)가 커지고 빛이 모였다가
 * 터지는 순간 체력이 움직인다(2026-11-07). 화면(useAnimationQueue)과 서버(room.ts settleTimelineMs — 그동안 판이 흐르지 않게)가
 * 같은 함수로 "어느 이벤트 앞에 누구에게"를 정한다.
 */
export const FINISHER_GATHER_MS = 1600;
export const FINISHER_BURST_MS = 700;

function changesHp(e: GameEvent): boolean {
  return (e.type === 'skillApplied' && e.level > 0 && (e.myHpDelta !== 0 || e.oppHpDelta !== 0)) || (e.type === 'enhanceTick' && e.amount > 0);
}

/**
 * 이벤트 번호 → 포커스할 편. 체력을 바꾼 마지막 이벤트 뒤에
 * - 개인전 순위(ranked — 체력 0 'out' · 승리선 'win')가 오면 그 사람,
 * - 팀전 판 끝(gameEnd knockout)이 오면 체력이 0이 된 쪽(없으면 승리선에 닿은 쪽)이다.
 * 한 이벤트에는 하나만(같은 기술로 둘이 정해지면 먼저 정해진 사람).
 */
export function finisherTargets(events: readonly GameEvent[]): Map<number, SideId> {
  const out = new Map<number, SideId>();
  let last = -1;
  events.forEach((e, i) => {
    if (changesHp(e)) {
      last = i;
      return;
    }
    if (last < 0 || out.has(last)) return;
    if (e.type === 'ranked' && (e.reason === 'out' || e.reason === 'win')) out.set(last, e.team);
    else if (e.type === 'gameEnd' && e.reason === 'knockout' && e.winner !== 'draw') {
      const hp = (events[last] as Extract<GameEvent, { type: 'skillApplied' | 'enhanceTick' }>).hpAfter ?? {};
      const winner = e.winner;
      const loser = Object.keys(hp).find(s => s !== winner);
      out.set(last, loser !== undefined && (hp[loser] ?? 1) <= 0 ? loser : winner);
    }
  });
  return out;
}

/** 그 이벤트 앞에 끼우는 길이 — 특허랑이는 발톱이 닿는 순간(공격자 반동 tigerRecoilMs 뒤)에 체력이 움직이므로 그만큼 덜 끼운다 */
export function finisherLeadMs(e: GameEvent, tigerRecoilMs: number): number {
  return Math.max(0, FINISHER_GATHER_MS - (e.type === 'skillApplied' && e.animal === 'tiger' ? tigerRecoilMs : 0));
}
