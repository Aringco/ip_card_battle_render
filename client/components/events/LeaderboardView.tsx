'use client';

import type { Animal, Leaderboard, LeaderboardEntry } from 'shared';
import { ANIMALS } from 'shared';
import { ANIMAL_INFO } from '@/lib/animals';
import { BoardFrame } from '@/components/ui/BoardFrame';

/**
 * 이벤트 순위표(EVENT_MODE_ROADMAP.md §2.5) — /events(누구나)와 /events/board(부스 대형 화면)가 같이 쓴다.
 *
 * - 동물의 왕: '개발자를 이겨라' **승리** 기록에서 동물별 최고 레벨 1~3위(닉네임당 1건, 동점은 먼저 달성한 사람).
 * - 개발자를 이겨라 전적 · 목표점수 달성하기 성공자(높은 목표 → 높은 최종 점수 순) · 한 우물만 파기 성공자.
 * 각 줄의 기록 번호(#)는 결과 화면에 뜬 번호와 같다 — 상품 수령 때 맞춰 본다.
 *
 * 계산은 서버(server/records/leaderboard.ts)가 하고 이 화면은 그리기만 한다.
 */
const MEDALS = ['🥇', '🥈', '🥉'];

function recordTag(e: LeaderboardEntry) {
  return e.recordId !== null ? <span className="text-board-muted text-xs tabular-nums">#{e.recordId}</span> : null;
}

function AnimalKingColumn({ animal, entries, big }: { animal: Animal; entries: LeaderboardEntry[]; big: boolean }) {
  const info = ANIMAL_INFO[animal];
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <p className={`font-extrabold text-board-ink text-center ${big ? 'text-2xl' : 'text-base'}`}>
        <span aria-hidden>{info.emoji}</span> {info.name}의 왕
      </p>
      {entries.length === 0 ? (
        <p className="text-center text-board-muted text-sm">아직 없어요</p>
      ) : (
        entries.map((e, i) => (
          <div key={`${e.name}-${i}`} className={`flex items-center gap-2 rounded-lg px-2 py-1 bg-white/60 ${i === 0 ? 'ring-2 ring-amber-400' : ''}`}>
            <span aria-hidden className={big ? 'text-2xl' : ''}>{MEDALS[i] ?? `${i + 1}.`}</span>
            <span className={`font-bold truncate flex-1 ${big ? 'text-xl' : ''}`}>{e.name}</span>
            <span className={`font-extrabold tabular-nums ${big ? 'text-xl' : ''}`}>Lv.{e.level}</span>
            {recordTag(e)}
          </div>
        ))
      )}
    </div>
  );
}

export function LeaderboardView({ data, big = false }: { data: Leaderboard | null; big?: boolean }) {
  if (!data) {
    return <p className="text-center result-bg-text text-lg">순위표를 불러오는 중…</p>;
  }
  return (
    <div className={`w-full flex flex-col gap-6 ${big ? 'max-w-[110rem]' : 'max-w-5xl'}`}>
      <BoardFrame split className="w-full">
        <p className={`text-center font-extrabold text-board-ink mb-1 ${big ? 'text-4xl' : 'text-2xl'}`}>👑 동물의 왕</p>
        <p className="text-center text-board-muted text-xs mb-4">
          &apos;개발자를 이겨라&apos;에서 이긴 판의 동물별 최고 레벨 · 닉네임당 한 번 · 같은 레벨이면 먼저 달성한 사람
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {ANIMALS.map(a => (
            <AnimalKingColumn key={a} animal={a} entries={data.animalKing[a] ?? []} big={big} />
          ))}
        </div>
      </BoardFrame>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <BoardFrame split className="w-full h-full">
          <p className={`font-extrabold text-board-ink mb-2 ${big ? 'text-2xl' : 'text-lg'}`}>👨‍💻 개발자를 이겨라</p>
          <p className="text-sm text-board-ink mb-2">
            도전 <b>{data.beatDev.played}</b>번 · 성공 <b>{data.beatDev.wins}</b>번
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.beatDev.winners.length === 0 && <span className="text-board-muted text-sm">아직 없어요</span>}
            {data.beatDev.winners.map((w, i) => (
              <span key={`${w.name}-${i}`} className="rounded-full bg-white/70 px-2 py-0.5 text-sm font-bold">
                {w.name} {recordTag(w)}
              </span>
            ))}
          </div>
        </BoardFrame>

        <BoardFrame split className="w-full h-full">
          <p className={`font-extrabold text-board-ink mb-2 ${big ? 'text-2xl' : 'text-lg'}`}>🎯 목표점수 달성하기</p>
          <p className="text-sm text-board-ink mb-2">
            도전 <b>{data.timeAttack.played}</b>번 · 성공 <b>{data.timeAttack.wins}</b>번
          </p>
          <p className="text-board-muted text-xs mb-1">높은 목표를 달성한 순 · 같으면 최종 점수가 높은 순</p>
          <div className="flex flex-col gap-1">
            {data.timeAttack.winners.length === 0 && <span className="text-board-muted text-sm">아직 없어요</span>}
            {data.timeAttack.winners.slice(0, big ? 5 : 10).map((r, i) => (
              <div key={`${r.name}-${i}`} className="flex items-center gap-2 text-sm">
                <span className="w-5 text-right">{i + 1}.</span>
                <span className="font-bold truncate flex-1">{r.name}</span>
                <span className="tabular-nums font-extrabold">목표 {r.target} · {r.score}점</span>
                {recordTag(r)}
              </div>
            ))}
          </div>
        </BoardFrame>

        <BoardFrame split className="w-full h-full">
          <p className={`font-extrabold text-board-ink mb-2 ${big ? 'text-2xl' : 'text-lg'}`}>🪣 한 우물만 파기</p>
          <p className="text-sm text-board-ink mb-2">
            도전 <b>{data.oneWell.played}</b>번 · 성공 <b>{data.oneWell.wins}</b>번
          </p>
          <div className="flex flex-wrap gap-1.5">
            {data.oneWell.winners.length === 0 && <span className="text-board-muted text-sm">아직 없어요</span>}
            {data.oneWell.winners.map((w, i) => (
              <span key={`${w.name}-${i}`} className="rounded-full bg-white/70 px-2 py-0.5 text-sm font-bold">
                {w.animal ? ANIMAL_INFO[w.animal].emoji : ''} {w.name} {recordTag(w)}
              </span>
            ))}
          </div>
        </BoardFrame>
      </div>
    </div>
  );
}
