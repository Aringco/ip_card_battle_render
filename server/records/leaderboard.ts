import { ANIMALS, normalizeNameKey } from 'shared';
import type { Animal, EventResultRow, Leaderboard, LeaderboardEntry } from 'shared';

const ANIMAL_KING_TOP = 3;
const WINNER_LIST_MAX = 30;

/**
 * 저장된 결과 전체에서 순위표를 만든다 — 순수 함수라 메모리 저장소·DB 저장소가 같은 규칙을 쓰고, 테스트도 이것만 본다.
 *
 * 동물의 왕(EVENT_MODE_ROADMAP.md §1-4·§3-4)
 * - '개발자를 이겨라'에서 **이긴** 판만, 무효 처리된 기록은 뺀다(패배한 판도 저장은 되지만 여기엔 쓰지 않는다).
 * - 레벨은 그 판에서 **도달했던 최고 레벨**(peak_levels) — 기술을 쓰면 경험치가 깎이므로 끝났을 때의 레벨로 재면
 *   기술을 열심히 쓴 사람이 오히려 낮게 나온다.
 * - **닉네임당 동물별 최고 기록 하나만.** 같은 레벨이면 그 레벨에 먼저 도달한(기록 시각이 빠른) 쪽.
 * - 레벨 0은 순위에 올리지 않는다(그 동물을 한 번도 키우지 않았다는 뜻이다).
 */
export function computeLeaderboard(rows: readonly EventResultRow[]): Leaderboard {
  const valid = rows.filter(r => !r.invalid);
  const byTime = (a: EventResultRow, b: EventResultRow) => a.createdAt - b.createdAt;

  // ── 동물의 왕 ──
  const beatDevWins = valid.filter(r => r.event === 'beatDev' && r.won).sort(byTime);
  const animalKing = {} as Record<Animal, LeaderboardEntry[]>;
  for (const animal of ANIMALS) {
    const best = new Map<string, EventResultRow>(); // nameKey → 그 사람의 최고 기록(시간순으로 훑으므로 먼저 달성한 쪽이 남는다)
    for (const r of beatDevWins) {
      const level = r.peakLevels[animal] ?? 0;
      if (level <= 0) continue;
      const key = normalizeNameKey(r.playerName);
      const cur = best.get(key);
      if (!cur || level > (cur.peakLevels[animal] ?? 0)) best.set(key, r);
    }
    animalKing[animal] = [...best.values()]
      .sort((a, b) => (b.peakLevels[animal] ?? 0) - (a.peakLevels[animal] ?? 0) || a.createdAt - b.createdAt)
      .slice(0, ANIMAL_KING_TOP)
      .map(r => ({ name: r.playerName, recordId: r.id, level: r.peakLevels[animal] ?? 0 }));
  }

  // ── 개발자를 이겨라 ──
  const beatDevAll = valid.filter(r => r.event === 'beatDev');
  const beatDev = {
    played: beatDevAll.length,
    wins: beatDevWins.length,
    winners: uniqueRecent(beatDevWins).map(r => ({ name: r.playerName, recordId: r.id })),
  };

  // ── 목표점수 달성하기 — 성공자를 **높은 목표부터**(닉네임당 가장 높은 목표 1건, 같으면 마지막 점수가 높은 쪽 → 먼저 한 쪽) ──
  // 목표가 판마다 10~20에서 무작위로 정해지므로, 높은 목표를 달성할수록 어렵다.
  const timeAttackAll = valid.filter(r => r.event === 'timeAttack');
  const timeAttackWins = timeAttackAll.filter(r => r.won).sort(byTime);
  const bestRace = new Map<string, EventResultRow>();
  const raceRank = (r: EventResultRow) => [r.detail.target ?? 0, r.detail.finalScore ?? 0] as const;
  for (const r of timeAttackWins) {
    const key = normalizeNameKey(r.playerName);
    const cur = bestRace.get(key);
    if (!cur) { bestRace.set(key, r); continue; }
    const [t, s] = raceRank(r);
    const [ct, cs] = raceRank(cur);
    if (t > ct || (t === ct && s > cs)) bestRace.set(key, r);
  }
  const timeAttack = {
    played: timeAttackAll.length,
    wins: timeAttackWins.length,
    winners: [...bestRace.values()]
      .sort((a, b) => (b.detail.target ?? 0) - (a.detail.target ?? 0)
        || (b.detail.finalScore ?? 0) - (a.detail.finalScore ?? 0)
        || a.createdAt - b.createdAt)
      .slice(0, WINNER_LIST_MAX)
      .map(r => ({ name: r.playerName, recordId: r.id, target: r.detail.target ?? 0, score: r.detail.finalScore ?? 0 })),
  };

  // ── 한 우물만 파기 ──
  const oneWellAll = valid.filter(r => r.event === 'oneWell');
  const oneWellWins = oneWellAll.filter(r => r.won).sort(byTime);
  const oneWell = {
    played: oneWellAll.length,
    wins: oneWellWins.length,
    winners: uniqueRecent(oneWellWins, r => `${normalizeNameKey(r.playerName)}|${r.detail.lockedAnimal ?? ''}`).map(r => ({
      name: r.playerName,
      recordId: r.id,
      ...(r.detail.lockedAnimal ? { animal: r.detail.lockedAnimal } : {}),
    })),
  };

  return { animalKing, beatDev, timeAttack, oneWell };
}

/** 같은 사람(키)의 기록은 하나만 남기고 최근 것부터 — 성공자 명단용. */
function uniqueRecent(
  rows: readonly EventResultRow[],
  keyOf: (r: EventResultRow) => string = r => normalizeNameKey(r.playerName),
): EventResultRow[] {
  const seen = new Set<string>();
  const out: EventResultRow[] = [];
  for (let i = rows.length - 1; i >= 0 && out.length < WINNER_LIST_MAX; i--) {
    const key = keyOf(rows[i]);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rows[i]);
  }
  return out;
}
