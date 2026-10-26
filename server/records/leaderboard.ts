import { ANIMALS, ONE_WELL_ALLOWED, inLeaderboardRange, normalizeNameKey } from 'shared';
import type { Animal, EventResultRow, Leaderboard, LeaderboardEntry, LeaderboardRange } from 'shared';

const ANIMAL_KING_TOP = 3;
const WINNER_LIST_MAX = 30;

const ALL_TIME: LeaderboardRange = { from: null, to: null };

/**
 * 순위 줄에 싣는 카드별 최고 레벨(화면은 이것만 그린다 — 2026-10-27 "누적 점수가 아니라 최고"). 최대 경험치(peakExp)도
 * 함께 싣지만 화면은 쓰지 않는다(그날부터 기록해 그 전 기록에는 없다).
 */
function cardsOf(r: EventResultRow, animals: readonly Animal[]): LeaderboardEntry['cards'] {
  const cards: NonNullable<LeaderboardEntry['cards']> = {};
  for (const a of animals) {
    cards[a] = {
      level: r.peakLevels[a] ?? 0,
      ...(r.peakExp ? { exp: r.peakExp[a] ?? 0 } : {}),
      ...(r.peakSkill ? { skill: r.peakSkill[a] ?? 0 } : {}),
    };
  }
  return cards;
}

/** 기간 안의 판인가 — 규칙은 shared의 inLeaderboardRange(운영자 화면과 같은 규칙). */
export function inRange(r: EventResultRow, range: LeaderboardRange): boolean {
  return inLeaderboardRange(r.startedAt, r.createdAt, range);
}

/** 화면이 보낸 기간을 믿을 수 있는 값으로 — 숫자가 아니면 그쪽 끝을 없앤다. from > to면 둘을 바꾼다. */
export function normalizeRange(from: unknown, to: unknown): LeaderboardRange {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  let f = num(from);
  let t = num(to);
  if (f !== null && t !== null && f > t) [f, t] = [t, f];
  return { from: f, to: t };
}

/**
 * 저장된 결과 전체에서 순위표를 만든다 — 순수 함수라 메모리 저장소·DB 저장소가 같은 규칙을 쓰고, 테스트도 이것만 본다.
 * range를 주면 그 기간 안의 판만 센다(inRange). 순위·도전 횟수·성공 횟수가 모두 그 기간 기준이다.
 *
 * 동물의 왕(2026-10-27 바뀜 — 그 전에는 '개발자를 이겨라' **승리** 판의 최고 레벨이었다)
 * - **모든 이벤트에서 이긴 판**(개발자를 이겨라·목표점수 달성하기·한 우물만 파기)에서 그 카드의 **기술 한 번 최고 효과**
 *   (skillPeakValue — 양 추가 뽑기 수 · 토끼 회복 · 인어 배율 · 호랑이 강탈)가 가장 큰 사람.
 *   진 판은 세지 않는다(2026-10-27 — 한때 진 판도 셌다가 "결과적으로 승리한 건 중에서"로 고쳤다).
 *   무효 처리된 기록은 뺀다. 한 우물만 파기 판에서는 쓸 수 있던 두 장(상표토끼·특허랑이)만 센다 — 나머지 카드의 레벨은
 *   쓸 수 없는 카드에 쌓인 것이라 "그 카드로 낸 기록"이 아니다.
 *   같은 날 기준이 여러 번 바뀌었다: 최고 레벨 → 최대 경험치(누적이라 판이 길수록 유리) → 최고 레벨 → **기술 한 번의 최고 효과**.
 *   peak_skill은 그날부터 기록해 그 전 판은 동물의 왕에 들어가지 않는다. peak_levels·peak_exp는 CSV용으로 계속 남긴다.
 * - **닉네임당 동물별 최고 기록 하나만.** 같은 값이면 먼저 달성한(기록 시각이 빠른) 쪽. 0(그 카드를 안 썼다)은 올리지 않는다.
 */
export function computeLeaderboard(rows: readonly EventResultRow[], range: LeaderboardRange = ALL_TIME): Leaderboard {
  const valid = rows.filter(r => !r.invalid && inRange(r, range));
  const byTime = (a: EventResultRow, b: EventResultRow) => a.createdAt - b.createdAt;

  // ── 동물의 왕 — 모든 이벤트의 판에서 카드별 최고 레벨 ──
  const beatDevWins = valid.filter(r => r.event === 'beatDev' && r.won).sort(byTime);
  const scoreOf = (r: EventResultRow, animal: Animal): number => {
    if (r.event === 'oneWell' && !ONE_WELL_ALLOWED.includes(animal)) return 0;
    return r.peakSkill?.[animal] ?? 0;
  };
  const wonByTime = valid.filter(r => r.won).sort(byTime);
  const animalKing = {} as Record<Animal, LeaderboardEntry[]>;
  for (const animal of ANIMALS) {
    const best = new Map<string, EventResultRow>(); // nameKey → 그 사람의 최고 기록(시간순으로 훑으므로 먼저 달성한 쪽이 남는다)
    for (const r of wonByTime) {
      const score = scoreOf(r, animal);
      if (score <= 0) continue;
      const key = normalizeNameKey(r.playerName);
      const cur = best.get(key);
      if (!cur || score > scoreOf(cur, animal)) best.set(key, r);
    }
    animalKing[animal] = [...best.values()]
      .sort((a, b) => scoreOf(b, animal) - scoreOf(a, animal) || a.createdAt - b.createdAt)
      .slice(0, ANIMAL_KING_TOP)
      .map(r => ({ name: r.playerName, recordId: r.id, score: scoreOf(r, animal), event: r.event }));
  }

  // ── 개발자를 이겨라 — **이긴 사람만**, 처음 이긴 순(2026-10-27: 이겨야 순위에 오르므로 승/패 칸은 지웠다) ──
  // 닉네임당 한 줄, 그 첫 승리의 기록(카드별 레벨·점수와 기록 번호도 그 판의 것 — 상품 수령 때 맞춰 볼 번호).
  const beatDevAll = valid.filter(r => r.event === 'beatDev').sort(byTime);
  const firstWin = new Map<string, EventResultRow>();
  for (const r of beatDevWins) {
    const key = normalizeNameKey(r.playerName);
    if (!firstWin.has(key)) firstWin.set(key, r);
  }
  const beatDevRanking: LeaderboardEntry[] = [...firstWin.values()]
    .slice(0, WINNER_LIST_MAX)
    .map(r => ({ name: r.playerName, recordId: r.id, cards: cardsOf(r, ANIMALS) }));
  const beatDev = {
    played: beatDevAll.length,
    wins: beatDevWins.length,
    ranking: beatDevRanking,
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
    ranking: [...bestRace.values()]
      .sort((a, b) => (b.detail.target ?? 0) - (a.detail.target ?? 0)
        || (b.detail.finalScore ?? 0) - (a.detail.finalScore ?? 0)
        || a.createdAt - b.createdAt)
      .slice(0, WINNER_LIST_MAX)
      .map(r => ({
        name: r.playerName,
        recordId: r.id,
        target: r.detail.target ?? 0,
        score: r.detail.finalScore ?? 0,
        cards: cardsOf(r, ANIMALS),
      })),
  };

  // ── 한 우물만 파기 — 성공자를 **높은 점수부터**(2026-10-27 요청: "1. 닉네임 - 🐰 19점") ──
  // 닉네임당 가장 높은 점수 1건, 같으면 먼저 달성한 쪽. 점수는 판이 끝났을 때의 체력(detail.finalScore) —
  // 2026-10-27 전의 기록에는 이 값이 없어 0으로 센다(화면에는 점수 없이 나온다).
  const oneWellAll = valid.filter(r => r.event === 'oneWell');
  const oneWellWins = oneWellAll.filter(r => r.won).sort(byTime);
  const bestWell = new Map<string, EventResultRow>();
  const wellScore = (r: EventResultRow) => r.detail.finalScore ?? 0;
  for (const r of oneWellWins) {
    const key = normalizeNameKey(r.playerName);
    const cur = bestWell.get(key);
    if (!cur || wellScore(r) > wellScore(cur)) bestWell.set(key, r);
  }
  const oneWell = {
    played: oneWellAll.length,
    wins: oneWellWins.length,
    ranking: [...bestWell.values()]
      .sort((a, b) => wellScore(b) - wellScore(a) || a.createdAt - b.createdAt)
      .slice(0, WINNER_LIST_MAX)
      .map(r => ({
        name: r.playerName,
        recordId: r.id,
        ...(r.detail.finalScore !== undefined ? { score: r.detail.finalScore } : {}),
        ...(r.detail.lockedAnimal ? { animal: r.detail.lockedAnimal } : {}),
        // 한 우물은 쓸 수 있던 두 장(상표토끼·특허랑이)만
        cards: cardsOf(r, ONE_WELL_ALLOWED),
      })),
  };

  return { range, animalKing, beatDev, timeAttack, oneWell };
}
