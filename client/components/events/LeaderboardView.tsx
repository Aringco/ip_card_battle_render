'use client';

import type { Animal, Leaderboard, LeaderboardEntry } from 'shared';
import { ANIMALS, ONE_WELL_ALLOWED } from 'shared';
import { ANIMAL_INFO } from '@/lib/animals';
import { BoardFrame } from '@/components/ui/BoardFrame';

/**
 * 이벤트 순위표(EVENT_MODE_ROADMAP.md §2.5) — /events(누구나)와 /events/board(부스 대형 화면)가 같이 쓴다.
 *
 * 줄마다 순위 · 닉네임 · 도전별 점수 칸 · **카드별 기술 한 번의 최고 효과**(짧은 글자 하나 — 칸이 늘어지지 않게).
 * - 동물의 왕: **모든 이벤트에서 이긴 판**에서 그 카드의 기술 최고 효과가 가장 큰 1~3위(동물 하나의 순위라 카드 칸은 없다)
 * - 개발자를 이겨라: **이긴 사람만**(이겨야 오른다 — 승/패 칸 없음) · 카드 네 장
 * - 목표점수 달성하기: 성공자 — **목표 점수 · 달성 점수**(이긴 판의 마지막 점수) · 카드 네 장
 * - 한 우물만 파기: 성공자 — **고정 카드 · 달성 점수** · 카드 두 장(상표토끼·특허랑이)
 *
 * 카드 칸은 그 판에서 그 카드 기술을 **한 번 썼을 때의 최고 효과**다(2026-10-27 요청 — skillPeakValue): 실용신양 "6회"(추가 뽑기) ·
 * 상표토끼 "+8"(회복) · 디자인어 "×4"(쌓인 배율) · 특허랑이 "9"(빼앗은 체력). 안 쓴 카드와 그 값을 남기기 전의 옛 기록은 "-".
 * (같은 날 기준이 최고 레벨 → 최대 경험치 → 최고 레벨 → 지금으로 바뀌었다.)
 *
 * 배치는 동물의 왕 한 줄 + **세 도전 3열**(폭은 화면의 80% — .event-board-width). 한때 도전마다 한 줄씩 쌓았다가 판이 길게
 * 늘어져 되돌렸다 — 그래서 카드 칸은 숫자 하나만 쓰고 머리는 얼굴 아이콘뿐이다(.event-rank-col-card).
 *
 * ⚠️ 글자는 **검정**이다(`.event-board`). 배경 그림 위의 반투명 양피지라 밝은 글자색이 상속되면 읽히지 않는다.
 * ⚠️ 기록 번호(#12)는 그리지 않는다 — 상품 수령 때 맞춰 볼 번호는 결과 화면과 운영자 화면에 있다.
 *
 * 계산은 서버(server/records/leaderboard.ts)가 하고 이 화면은 그리기만 한다.
 */

interface Column {
  key: string;
  head: React.ReactNode;
  cell: (e: LeaderboardEntry) => React.ReactNode;
  /** 고정 폭 칸 — 'score'(점수 글자 "120점") · 'card'(숫자·아이콘 하나). 닉네임 칸이 남는 폭을 쓴다 */
  width?: 'score' | 'card';
}

/**
 * 동물 얼굴 아이콘 — 감정표현 그림에서 흰 바탕만 걷어낸 투명 그림(`*_icon.webp`, scripts/cutFaceIcons.mjs).
 * 원본(`*_happy.png`)은 흰 바탕이라 양피지 위에 흰 네모가 떴다(2026-10-27). 이름은 alt·title로.
 */
function AnimalIcon({ animal }: { animal: Animal }) {
  const name = ANIMAL_INFO[animal].name;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/emoticon/${animal}_icon.webp`} alt={name} title={name} className="event-rank-animal" />;
}

/** 기술 효과를 짧게 — 카드마다 뜻이 달라 표기로 가른다(머리의 title이 풀어 말한다). 0·없음은 "-"(안 썼다). */
const SKILL_UNIT: Record<Animal, { fmt: (n: number) => string; title: string }> = {
  sheep: { fmt: n => `${n}회`, title: '실용신양 — 한 번에 예약한 추가 뽑기 수' },
  rabbit: { fmt: n => `+${n}`, title: '상표토끼 — 한 번에 회복한 체력' },
  mermaid: { fmt: n => `×${n}`, title: '디자인어 — 쌓은 최대 배율' },
  tiger: { fmt: n => `${n}`, title: '특허랑이 — 한 번에 빼앗은 체력' },
};
function skillText(animal: Animal, n: number | undefined) {
  return n ? SKILL_UNIT[animal].fmt(n) : null;
}

/** 카드 칸 — 그 카드 기술 한 번의 최고 효과. */
function CardCell({ animal, card }: { animal: Animal; card: { skill?: number } | undefined }) {
  const text = skillText(animal, card?.skill);
  return text ? <span>{text}</span> : <span className="event-rank-dim">-</span>;
}

/** 카드 칸들 — 머리는 얼굴 아이콘만(이름은 title). */
function cardColumns(animals: readonly Animal[]): Column[] {
  return animals.map(a => ({
    key: `card-${a}`,
    width: 'card' as const,
    head: (
      <span className="event-rank-card-head" title={SKILL_UNIT[a].title}>
        <AnimalIcon animal={a} />
      </span>
    ),
    cell: e => <CardCell animal={a} card={e.cards?.[a]} />,
  }));
}

function RankTable({ columns, rows, big }: { columns: Column[]; rows: LeaderboardEntry[]; big: boolean }) {
  return (
    <table className={`event-rank-table ${big ? 'event-rank-table-big' : ''}`}>
      <colgroup>
        <col className="event-rank-col-rank" />
        <col />
        {columns.map(c => (
          <col
            key={c.key}
            className={c.width === 'card' ? 'event-rank-col-card' : c.width === 'score' ? 'event-rank-col-score' : undefined}
          />
        ))}
      </colgroup>
      <thead>
        <tr>
          <th scope="col">순위</th>
          <th scope="col">닉네임</th>
          {columns.map(c => <th key={c.key} scope="col">{c.head}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length + 2} className="event-rank-empty">아직 없어요</td>
          </tr>
        ) : (
          rows.map((e, i) => (
            <tr key={`${e.recordId ?? 'p'}-${e.name}-${i}`}>
              <td className="tabular-nums">{i + 1}</td>
              <td className="event-rank-name">{e.name}</td>
              {columns.map(c => <td key={c.key} className="tabular-nums">{c.cell(e)}</td>)}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function SectionTitle({ children, big }: { children: React.ReactNode; big: boolean }) {
  return <p className={`font-extrabold text-center mb-1 ${big ? 'text-2xl' : 'text-lg'}`}>{children}</p>;
}

function Tally({ played, wins }: { played: number; wins: number }) {
  return (
    <p className="text-sm text-center mb-2">
      도전 <b>{played}</b>번 · 성공 <b>{wins}</b>번
    </p>
  );
}

export function LeaderboardView({ data, big = false }: { data: Leaderboard | null; big?: boolean }) {
  if (!data) {
    return <p className="text-center result-bg-text text-lg">순위표를 불러오는 중…</p>;
  }
  const limit = big ? 5 : 10;

  const beatDevCols = cardColumns(ANIMALS);
  // 세 도전을 3열로 나란히 두면 1366 화면에서 표 하나가 300px 남짓이다 — 칸이 많은 목표점수 표에서 닉네임이 한 글자로
  // 눌렸다. 그래서 도전 표의 점수는 "점" 없이 숫자만 쓰고(단위는 머리의 title), 칸을 좁게 둔다(.event-rank-col-card).
  const num = (n: number | undefined) => (n === undefined ? '-' : n);
  const raceCols: Column[] = [
    { key: 'target', head: <span title="목표 점수">목표</span>, width: 'card', cell: e => num(e.target) },
    { key: 'score', head: <span title="달성 점수(이긴 판의 마지막 점수)">달성</span>, width: 'card', cell: e => <b>{num(e.score)}</b> },
    ...cardColumns(ANIMALS),
  ];
  const wellCols: Column[] = [
    { key: 'locked', head: <span title="고정한 카드">카드</span>, width: 'card', cell: e => (e.animal ? <AnimalIcon animal={e.animal} /> : '-') },
    { key: 'score', head: <span title="달성 점수(이긴 판의 마지막 점수)">달성</span>, width: 'card', cell: e => <b>{num(e.score)}</b> },
    ...cardColumns(ONE_WELL_ALLOWED),
  ];

  return (
    // 폭은 화면의 80%(.event-board-width — 2026-10-27 요청). 부스 대형 화면도 같다.
    <div className="event-board event-board-width flex flex-col gap-6">
      <BoardFrame split className="w-full">
        <p className={`text-center font-extrabold mb-1 ${big ? 'text-4xl' : 'text-2xl'}`}>👑 동물의 왕</p>
        <p className="text-center text-xs mb-4">모든 이벤트에서 이긴 판 중 그 카드 기술을 한 번 써서 가장 큰 효과를 낸 사람 (양 추가 뽑기 · 토끼 회복 · 인어 배율 · 호랑이 강탈)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {ANIMALS.map(a => (
            <div key={a} className="min-w-0">
              <SectionTitle big={big}>
                <span aria-hidden>{ANIMAL_INFO[a].emoji}</span> {ANIMAL_INFO[a].name}의 왕
              </SectionTitle>
              <RankTable
                big={big}
                columns={[{ key: 'skill', head: <span title={SKILL_UNIT[a].title}>기록</span>, width: 'score', cell: e => <b>{skillText(a, e.score) ?? '-'}</b> }]}
                rows={data.animalKing[a] ?? []}
              />
            </div>
          ))}
        </div>
      </BoardFrame>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <BoardFrame split className="w-full h-full">
          <SectionTitle big={big}>👨‍💻 개발자를 이겨라</SectionTitle>
          <Tally played={data.beatDev.played} wins={data.beatDev.wins} />
          <RankTable big={big} columns={beatDevCols} rows={data.beatDev.ranking.slice(0, limit)} />
        </BoardFrame>

        <BoardFrame split className="w-full h-full">
          <SectionTitle big={big}>🎯 목표점수 달성하기</SectionTitle>
          <Tally played={data.timeAttack.played} wins={data.timeAttack.wins} />
          <RankTable big={big} columns={raceCols} rows={data.timeAttack.ranking.slice(0, limit)} />
        </BoardFrame>

        <BoardFrame split className="w-full h-full">
          <SectionTitle big={big}>🪣 한 우물만 파기</SectionTitle>
          <Tally played={data.oneWell.played} wins={data.oneWell.wins} />
          <RankTable big={big} columns={wellCols} rows={data.oneWell.ranking.slice(0, limit)} />
        </BoardFrame>
      </div>
    </div>
  );
}
