'use client';

import { useMemo, useState } from 'react';
import type { ClientGameState, SideId } from 'shared';
import { ANIMALS } from 'shared';
import { ANIMAL_INFO } from '@/lib/animals';
import { FINISH_WORD, sideColor, sideName } from '@/lib/individual';
import { BoardFrame } from '@/components/ui/BoardFrame';
import { LOBBY_ASSETS } from '@/lib/lobbyAssets';
import { PLAY_ASSETS } from '@/lib/playAssets';

// 결과 화면 배경 — 팀전 결과 화면과 같은 그림들(들어올 때마다 하나).
const RESULT_BACKGROUNDS = [
  PLAY_ASSETS.resultBackground,
  PLAY_ASSETS.resultBackground2,
  PLAY_ASSETS.resultBackground3,
  PLAY_ASSETS.resultBackground4,
];

interface Row {
  side: SideId;
  rank: number;
  reason: string;
  hp: number;
}

/**
 * 개인전 결과 화면 — **순위표**(요구 T8-2).
 *
 * - 모든 판에서 1위부터 꼴찌까지 전원의 순위가 나온다. 승리 화면은 **1위만** 본다(공동 1위면 모두 승리).
 *   나머지는 패배 화면이다. 처음부터 관전자였던 사람은 판정 없이 순위표만 본다.
 * - 순위표는 `teams[side].finish`를 읽는다 — `gameEnd.winner`가 아니다(그 값은 호환용이고 공동 1위면 'draw'다).
 */
export function IndividualEndScreen({
  gameState,
  mySide,
  onBack,
}: {
  gameState: ClientGameState;
  mySide: SideId | null;
  onBack: () => void;
}) {
  const rows: Row[] = useMemo(() => {
    const list = gameState.turnOrder.map((side, order) => {
      const t = gameState.teams[side];
      return {
        side,
        order,
        rank: t.finish?.rank ?? gameState.turnOrder.length,
        reason: t.finish ? FINISH_WORD[t.finish.reason] : '-',
        hp: t.hp,
      };
    });
    list.sort((a, b) => a.rank - b.rank || a.order - b.order);
    return list;
  }, [gameState]);

  const myRank = mySide !== null ? gameState.teams[mySide]?.finish?.rank ?? null : null;
  const iWon = myRank === 1;
  const topRows = rows.filter(r => r.rank === 1);
  const tied = topRows.length > 1;
  const turnLimit = Object.values(gameState.teams).some(t => t.finish?.reason === 'turnLimit');

  const winnerText =
    mySide === null || myRank === null
      ? tied
        ? `공동 1위 — ${topRows.map(r => sideName(gameState, r.side)).join(', ')}`
        : `1위 — ${sideName(gameState, topRows[0]?.side ?? gameState.startingTeam)}`
      : iWon
        ? tied ? '공동 1위! 승리!' : '1위! 승리!'
        : `${myRank}위 — 패배`;
  const reasonText = turnLimit ? '제한 턴 종료 — 남은 사람은 체력순으로 순위를 정했어요' : '순위가 모두 정해졌어요';

  const [background] = useState(() => RESULT_BACKGROUNDS[Math.floor(Math.random() * RESULT_BACKGROUNDS.length)]);
  const confetti = useMemo(
    () =>
      iWon
        ? Array.from({ length: 45 }, (_, i) => ({
            id: i,
            x: ((i * 7 + 13) % 95) + 2,
            color: ['#fbbf24', '#f59e0b', '#fde68a', '#fb7185', '#60a5fa'][i % 5],
            dur: 1600 + ((i * 137) % 800),
            delay: (i * 60) % 1000,
            rot: 360 + ((i * 73) % 360),
          }))
        : [],
    [iWon],
  );

  return (
    <div
      className="min-h-screen result-bg flex flex-col items-center p-8 overflow-hidden relative"
      style={{ ['--result-bg' as string]: `url(${background})` }}
    >
      <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full">
        {confetti.map(c => (
          <span
            key={c.id}
            className="confetti-piece"
            style={{
              left: `${c.x}vw`,
              top: '-20px',
              backgroundColor: c.color,
              '--cf-dur': `${c.dur}ms`,
              '--cf-delay': `${c.delay}ms`,
              '--cf-rot': `${c.rot}deg`,
            } as React.CSSProperties}
          />
        ))}

        <div className="winner-bounce-in flex flex-col items-center gap-3">
          {myRank === null ? (
            <div style={{ fontSize: '4rem' }}>🏁</div>
          ) : (
            <img
              src={iWon ? LOBBY_ASSETS.medalFirst : LOBBY_ASSETS.medalSecond}
              alt={iWon ? '1등' : '2등'}
              className={`${iWon ? 'h-[12.15rem]' : 'h-[8.1rem]'} w-auto max-w-full object-contain select-none`}
              draggable={false}
            />
          )}
          <h2 className="text-3xl font-bold result-bg-text">{winnerText}</h2>
          <p className="text-xs font-semibold result-bg-text -mt-1">{reasonText}</p>
        </div>

        <div className="result-boards w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* 순위표 — 1위부터 꼴찌까지 전원. 색 칩 옆에 닉네임이 있어 색만으로 구분하지 않는다. */}
          <BoardFrame
            split
            className="w-full h-full"
            style={{ animation: 'bounceIn 0.7s cubic-bezier(0.36,0.07,0.19,0.97) 200ms both' }}
          >
            <img src={LOBBY_ASSETS.iconRank} alt="" aria-hidden className="board-crest" draggable={false} />
            <p className="text-center text-base font-bold text-board-ink mb-3">순위표</p>
            <div className="flex flex-col gap-1.5">
              {rows.map(r => {
                const mine = r.side === mySide;
                return (
                  <div
                    key={r.side}
                    className={`flex items-center gap-2 rounded-lg px-2 py-1 text-base font-bold ${
                      r.rank === 1 ? 'bg-amber-100/80' : ''
                    } ${mine ? 'ring-2 ring-amber-400' : ''}`}
                  >
                    <span className="w-9 text-right tabular-nums text-board-ink">{r.rank}위</span>
                    <span
                      aria-hidden
                      className="inline-block w-4 h-4 rounded-sm border border-black/30 shrink-0"
                      style={{ backgroundColor: sideColor(gameState, r.side) }}
                    />
                    <span className="flex-1 min-w-0 truncate text-board-ink">
                      {sideName(gameState, r.side)}
                      {mine && ' (나)'}
                    </span>
                    <span className="tabular-nums text-board-muted whitespace-nowrap">체력 {r.hp}</span>
                    <span className="w-14 text-right text-board-muted whitespace-nowrap">{r.reason}</span>
                  </div>
                );
              })}
            </div>
          </BoardFrame>

          {/* 행동 사용 통계 — 사람별로 동물마다 몇 번 썼는지 */}
          <BoardFrame
            split
            className="w-full h-full"
            style={{ animation: 'bounceIn 0.7s cubic-bezier(0.36,0.07,0.19,0.97) 300ms both' }}
          >
            <img src={LOBBY_ASSETS.crestLaurel} alt="" aria-hidden className="board-crest" draggable={false} />
            <p className="text-center text-base font-bold text-board-ink mb-3">행동 사용 횟수</p>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2 text-sm font-bold text-board-muted">
                <span className="flex-1" />
                {ANIMALS.map(a => (
                  <span key={a} className="w-10 text-center" title={ANIMAL_INFO[a].name}>
                    {ANIMAL_INFO[a].emoji}
                  </span>
                ))}
              </div>
              {rows.map(r => (
                <div key={r.side} className="flex items-center gap-2 text-base font-bold text-board-ink">
                  <span
                    aria-hidden
                    className="inline-block w-3 h-3 rounded-sm border border-black/30 shrink-0"
                    style={{ backgroundColor: sideColor(gameState, r.side) }}
                  />
                  <span className="flex-1 min-w-0 truncate">{sideName(gameState, r.side)}</span>
                  {ANIMALS.map(a => (
                    <span key={a} className="w-10 text-center tabular-nums">
                      {gameState.teams[r.side].skillStats[a].count}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </BoardFrame>
        </div>

        <button
          onClick={onBack}
          className="wood-button wood-button-lg py-[1.125rem] px-[3.75rem]"
          style={{ animation: 'bounceIn 0.6s cubic-bezier(0.36,0.07,0.19,0.97) 400ms both' }}
        >
          로비로 돌아가기
        </button>
      </div>

      <p className="text-sm result-bg-text text-center pt-4">
        게임 중 글씨 크기/소리를 조절하려면 오른쪽 하단(⚙️)을 확인해 주세요.
      </p>
    </div>
  );
}
