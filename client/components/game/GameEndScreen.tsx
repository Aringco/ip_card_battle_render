'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Animal, ClientGameState, Team } from 'shared';
import { ANIMALS, LOSE_HP } from 'shared';
import { ANIMAL_INFO } from '@/lib/animals';
import { DEMO_CONTINUE_KEYS } from '@/lib/demoKeys';
import { BoardFrame } from '@/components/ui/BoardFrame';
import { LOBBY_ASSETS } from '@/lib/lobbyAssets';
import { PLAY_ASSETS } from '@/lib/playAssets';

// 결과 화면 배경 — 들어올 때마다 이 중 하나가 깔린다(경로는 playAssets.ts 한 곳).
const RESULT_BACKGROUNDS = [
  PLAY_ASSETS.resultBackground,
  PLAY_ASSETS.resultBackground2,
  PLAY_ASSETS.resultBackground3,
  PLAY_ASSETS.resultBackground4,
];

const FLAVOR_TEXT: Record<Animal, string> = {
  sheep: '실용신안의 실리주의로 판을 키우셨군요!',
  rabbit: '상표의 가치를 꾸준히 쌓아 체력을 채우셨군요!',
  mermaid: '디자인권의 배율로 판을 뒤집으셨군요!',
  tiger: '가장 강력한 독점권으로 상대를 밀어붙이셨군요!',
};

/** 승리팀이 체력을 가장 많이 벌어들인 동물(행동)을 판정한다. */
function pickFlavorAnimal(gameState: ClientGameState, winner: Team | 'draw' | null): Animal | null {
  if (winner !== 'A' && winner !== 'B') return null;

  let best: Animal | null = null;
  let bestGain = 0;
  for (const a of ANIMALS) {
    const gain = gameState.teams[winner].skillStats[a].totalHpGained;
    if (gain > bestGain) {
      bestGain = gain;
      best = a;
    }
  }
  return best;
}

/**
 * 판 위쪽 한가운데에 걸치는 문장.
 *
 * `.board-crest`가 액자 윗변을 정확히 반씩 나눠 물게 하고(translate(-50%, -50%)),
 * 위로 샐져나온 절반만큼 판이 스스로 위 여백을 낸다 — globals.css 참고.
 * `BoardFrame`의 직계 자식이어야 한다(`:has(> .board-crest)`로 그 여백을 잡는다).
 *
 * **두 판이 서로 다른 문장을 달고 있다.** 왼쪽(팀별 점수)은 순위를 뜻하는 왝관 쓴
 * 토끼 방패, 오른쪽(행동 사용 통계)은 예전부터 쓰던 버섯+책 월계수다 — 같은 그림을
 * 둘 다 달면 나란히 놓았을 때 어느 판이 무엇인지 구별되지 않는다.
 */
function BoardCrest({ src }: { src: string }) {
  return <img src={src} alt="" aria-hidden className="board-crest" draggable={false} />;
}

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  dur: number;
  delay: number;
  rot: number;
}

function generateConfetti(count: number, teamColor: string): ConfettiPiece[] {
  const palette =
    teamColor === 'A'
      ? ['#22c55e', '#86efac', '#bbf7d0', '#4ade80', '#fbbf24']
      : ['#3b82f6', '#93c5fd', '#bfdbfe', '#60a5fa', '#a78bfa'];

  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: (i * 7 + 13) % 95 + 2, // 2-97 vw
    color: palette[i % palette.length],
    dur: 1600 + ((i * 137) % 800),
    delay: (i * 60) % 1000,
    rot: 360 + ((i * 73) % 360),
  }));
}

export function GameEndScreen({
  gameState,
  myTeam,
  onBack,
  onReplay,
}: {
  gameState: ClientGameState;
  myTeam: Team | null;
  onBack: () => void;
  /**
   * 시연 4장 — 이 결말을 다 봤으니 **장면 고르기 화면으로 되돌아간다.**
   *
   * 승리 조건이 둘이고 패배까지 셋이라, 한 번에 하나씩만 볼 수 있으면 관람객은 그중
   * 하나만 본 채 끝난다. 서버가 `demo.replay`로 "지금 되돌아갈 수 있다"를 알려줄 때만
   * 버튼이 뜬다(1~3장 도중 항복으로 끝난 판에는 되돌아갈 곳이 없다).
   */
  onReplay?: () => void;
}) {
  const { winner } = gameState;
  const hpA = gameState.teams.A.hp;
  const hpB = gameState.teams.B.hp;
  const winHp = gameState.settings.targetScore * 2;
  const isKnockout = hpA >= winHp || hpB >= winHp || hpA <= LOSE_HP || hpB <= LOSE_HP;
  // 항복하기·나가기로 끝난 판은 체력만 봐서는 알 수 없다 — 격차가 나지 않은 채로
  // 끝나므로 "제한 턴 종료 — 체력 비교"라는 엉뚱한 설명이 붙는다. 서버가 실어 보낸
  // forfeitedBy가 그 경우를 가리는 유일한 단서다.
  const forfeitedBy = gameState.forfeitedBy ?? null;
  const reasonText = forfeitedBy
    ? `${gameState.teamNames[forfeitedBy]} 기권 — 남은 팀 승리`
    : isKnockout
      ? '체력 즉시 승부 — GAME OVER!'
      : '제한 턴 종료 — 체력 비교';

  const confetti = useMemo(
    () => (winner && winner !== 'draw' ? generateConfetti(45, winner) : []),
    [winner],
  );

  // 승패 표시 — 동그란 팀 마크(🟢/🔵) 대신 메달을 쓴다. 팀 색은 아래 체력표가
  // 이미 말해주고 있어서, 이 자리에는 "이겼는가 졌는가"가 훨씬 크게 보여야 한다.
  //   내가 이겼거나 관전자(=발표된 팀이 이긴 것) → 금메달
  //   내가 졌으면                                → 은메달
  //   무승부는 어느 쪽도 아니므로 이모지를 그대로 둔다
  const decided = winner === 'A' || winner === 'B';
  const medal = !decided ? null : myTeam === null || winner === myTeam
    ? { src: LOBBY_ASSETS.medalFirst, alt: '1등', first: true }
    : { src: LOBBY_ASSETS.medalSecond, alt: '2등', first: false };
  // 관전자(myTeam === null)에게는 "우리팀"이 없다 — 예전엔 그 경우가 그대로 "우리팀
  // 패배!"로 떨어져 이긴 팀을 구경하고도 패배 문구를 보게 됐다.
  const winnerText =
    winner !== 'A' && winner !== 'B'
      ? '무승부!'
      : myTeam === null
        ? `${gameState.teamNames[winner]} 승리!`
        : winner === myTeam
          ? '우리팀 승리!'
          : '우리팀 패배!';
  const flavorAnimal = useMemo(() => pickFlavorAnimal(gameState, winner), [gameState, winner]);
  // 배경 그림은 들어올 때마다 둘 중 하나. **렌더 중에 뽑아도 되는 자리다** —
  // 이 화면은 서버 렌더에 한 번도 나오지 않기 때문이다(그때는 gameState가 null이라
  // 방 화면이 로딩 문구만 그린다). 로딩 화면이 굳이 마운트 후에 고르는 것과 대비된다.
  // useState 초기화 함수라 다시 렌더돼도 그림이 바뀌지 않는다.
  const [background] = useState(() => RESULT_BACKGROUNDS[Math.floor(Math.random() * RESULT_BACKGROUNDS.length)]);

  // 시연 4장에서만 뜨는 [다른 결말 보기]. 진행자가 마우스를 찾지 않도록 자막 띠의
  // [계속 ▶]과 **같은 키**를 받는다(클리커로 그대로 넘어간다 — demoKeys.ts 참고).
  const canReplay = Boolean(onReplay) && Boolean(gameState.demo?.replay);
  useEffect(() => {
    if (!canReplay || !onReplay) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !DEMO_CONTINUE_KEYS.includes(e.key)) return;
      // 방금 마우스로 누른 버튼에 포커스가 남아 있으면 스페이스가 그 버튼까지 한 번 더
      // 눌러 두 번 진행된다 — 자막 띠와 같은 이유로 기본 동작을 끊는다.
      e.preventDefault();
      onReplay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canReplay, onReplay]);

  return (
    // 배경은 승패가 정해진 뒤의 탁자 그림(PLAY_ASSETS.resultBackground) — globals.css의
    // `.result-bg`가 그림과 글자를 받쳐 줄 어둠을 함께 깐다.
    <div
      className="min-h-screen result-bg flex flex-col items-center p-8 overflow-hidden relative"
      style={{ ['--result-bg' as string]: `url(${background})` }}
    >
      {/* 아래 콘텐츠 묶음은 그대로 세로 중앙 정렬하고, 그 밖에 화면 맨 밑에 붙는 푸터
          안내를 별도로 둔다 — 바깥 div를 justify-center로 두면 푸터까지 그 중앙 정렬
          묶음에 끼어버려 화면 아래쪽에 붙지 않는다. */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full">
      {/* 컨페티 */}
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

      {/* 승리 텍스트 */}
      <div className="winner-bounce-in flex flex-col items-center gap-3">
        {medal ? (
          // 폭이 아니라 **높이**를 맞춰 둔다 — 금메달이 밀 이삭 때문에 훨씬 넓어서,
          // 폭을 맞추면 은메달만 커 보인다.
          // 그 위에서 금메달만 1.5배(8.1 → 12.15rem)다. 이긴 화면에서 가장 먼저 보여야
          // 하는 것이고, 은메달까지 같이 키우면 진 쪽이 더 요란해진다.
          // max-w-full은 좁은 화면 방어선 — 금메달은 높이의 약 2.2배까지 넓어지므로
          // 12.15rem(≈194px)이면 폭이 430px 남짓이라 390px 화면에서는 이 상한에 걸려
          // 그만큼 다시 줄어든다(잘리지 않는다).
          <img
            src={medal.src}
            alt={medal.alt}
            className={`${medal.first ? 'h-[12.15rem]' : 'h-[8.1rem]'} w-auto max-w-full object-contain select-none`}
            draggable={false}
          />
        ) : (
          <div style={{ fontSize: '5rem' }}>🤝</div>
        )}
        {/* 판 바깥에서 그림 위에 바로 얹히는 글자라 초록 글씨로는 묻힌다 — `.result-bg-text` */}
        <h2 className="text-3xl font-bold result-bg-text">{winnerText}</h2>
        <p className="text-xs font-semibold result-bg-text -mt-1">{reasonText}</p>
        {flavorAnimal && (
          <p className="text-sm result-bg-text -mt-1">{FLAVOR_TEXT[flavorAnimal]}</p>
        )}
      </div>

      {/* 체력표와 행동 통계를 **같은 높이의 좌우 2열**로 놓는다. 예전에는 위아래로
          쌓여 있었는데, 둘 다 max-w-2xl이라 넓은 화면에서 좌우가 크게 비고 세로로만
          길어져 마지막 화면이 스크롤됐다.
          - `items-stretch`(grid 기본)라 두 판의 높이가 자동으로 맞는다
          - 좁은 화면(<md)에서는 1열로 떨어져 예전 세로 배치가 그대로 된다
          - 액자는 내용 높이를 따라가므로, 높이를 맞추려면 **BoardFrame이 h-full**이어야 한다 */}
      <div className="result-boards w-full max-w-5xl grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
      {/* 체력표 — 로비 폼·대기실과 같은 나무 액자를 두른다(BoardFrame 주석 참고).
          예전에는 흰 카드였는데, 게임 안에서 만나는 마지막 화면만 UI 톤이 달랐다.
          split — 액자와 양피지를 두 장으로 나눠 겹치고 양피지만 반투명하게 한다.
          이 화면은 배경이 탁자 그림이라, 판이 살짝 비쳐야 그 위에 놓인 것으로 읽힌다. */}
      <BoardFrame
        split
        className="w-full h-full"
        style={{ animation: 'bounceIn 0.7s cubic-bezier(0.36,0.07,0.19,0.97) 200ms both' }}
      >
        <BoardCrest src={LOBBY_ASSETS.iconRank} />
        {/* 팀 이름과 체력을 한 줄에 붙여 쓰면 이름이 조금만 길어도 줄바꿈되므로,
            좌우 두 칸으로 나눈 뒤 이름 아래에 체력을 따로 크게 적는다. */}
        {/* 아래 "동물별 경험치"가 이미 **왼쪽 A · 오른쪽 B**로 읽히므로, 팀 이름도
            같은 좌우 배치여야 어느 숫자가 누구 것인지 눈으로 이어진다 — 예전에는
            위아래로 쌓아 두어 그 대응이 끊겼다.
            ⚠️ 2열 안의 또 2열이라 칸이 좁다. 이름이 길면 truncate가 말줄임하므로,
            여기에 항목을 더 넣기 전에 긴 팀 이름으로 한 번 확인할 것. */}
        <div className="grid grid-cols-2 gap-4 mb-1">
          {(['A', 'B'] as const).map(t => (
            <div
              key={t}
              className={`text-center ${t === 'A' ? 'text-team-a' : 'text-team-b'} ${
                winner === t ? '' : 'opacity-60'
              }`}
            >
              <p
                className={`text-lg font-bold truncate ${
                  winner === t ? 'underline decoration-2 underline-offset-4' : ''
                }`}
              >
                {t === 'A' ? '🟢' : '🔵'} {gameState.teamNames[t]}
              </p>
              <p className="text-sm font-bold">
                체력 <span className="text-2xl font-bold tabular-nums">{t === 'A' ? hpA : hpB}</span>
              </p>
            </div>
          ))}
        </div>
        <p className="text-center text-xs font-bold text-board-muted mb-5">
          체력은 목표 점수({gameState.settings.targetScore})에서 시작해 행동으로만 오르내립니다.
        </p>

        <p className="text-sm font-bold text-board-ink mb-2.5">동물별 경험치</p>
        <div className="flex flex-col gap-3">
          {ANIMALS.map(a => (
            <div key={a} className="flex items-center justify-between text-base font-bold">
              <span className="text-board-ink whitespace-nowrap">
                {ANIMAL_INFO[a].emoji} {ANIMAL_INFO[a].name}
              </span>
              <div className="flex gap-5 tabular-nums">
                <span
                  className={`font-bold w-14 text-right ${
                    gameState.teams.A.exp[a] >= gameState.teams.B.exp[a]
                      ? 'text-team-a'
                      : 'text-board-muted'
                  }`}
                >
                  {gameState.teams.A.exp[a]}
                </span>
                <span className="text-board-muted font-bold">vs</span>
                <span
                  className={`font-bold w-14 ${
                    gameState.teams.B.exp[a] >= gameState.teams.A.exp[a]
                      ? 'text-team-b'
                      : 'text-board-muted'
                  }`}
                >
                  {gameState.teams.B.exp[a]}
                </span>
              </div>
            </div>
          ))}
        </div>
      </BoardFrame>

      {/* 행동 사용 통계 — 동물별로 몇 번, 총 몇 레벨어치를 발동했는지 */}
      <BoardFrame
        split
        className="w-full h-full"
        style={{ animation: 'bounceIn 0.7s cubic-bezier(0.36,0.07,0.19,0.97) 300ms both' }}
      >
        <BoardCrest src={LOBBY_ASSETS.crestLaurel} />
        <p className="text-center text-base font-bold text-board-ink mb-4">행동 사용 통계</p>
        <div className="grid grid-cols-1 gap-5">
          {(['A', 'B'] as const).map(t => (
            <div key={t}>
              <p
                className={`text-sm font-bold mb-2.5 truncate ${
                  t === 'A' ? 'text-team-a' : 'text-team-b'
                }`}
              >
                {t === 'A' ? '🟢' : '🔵'} {gameState.teamNames[t]}
              </p>
              <div className="flex flex-col gap-2">
                {ANIMALS.map(a => {
                  const stat = gameState.teams[t].skillStats[a];
                  return (
                    <div key={a} className="flex items-center justify-between gap-3 text-sm font-bold text-board-ink">
                      <span className="whitespace-nowrap">{ANIMAL_INFO[a].emoji} {ANIMAL_INFO[a].name}</span>
                      <span className="tabular-nums whitespace-nowrap">
                        {stat.count}회 (합 Lv.{stat.totalLevel})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </BoardFrame>
      </div>

      {/* 시연 4장에서는 버튼이 둘이다 — 나머지 결말을 보러 돌아가거나, 여기서 끝내거나.
          ⚠️ 되돌아가기가 **먼저**다. 시연 중에는 그쪽을 훨씬 자주 누르고, [로비로
          돌아가기]를 잘못 누르면 방이 통째로 끝나 1장부터 다시 해야 한다. */}
      <div className="flex flex-wrap items-center justify-center gap-4">
        {canReplay && (
          <button
            onClick={onReplay}
            className="wood-button wood-button-lg py-[1.125rem] px-[3.75rem]"
            style={{ animation: 'bounceIn 0.6s cubic-bezier(0.36,0.07,0.19,0.97) 400ms both' }}
            aria-keyshortcuts="Space Enter PageDown ArrowRight"
          >
            다른 결말 보기 ▶
          </button>
        )}
        <button
          onClick={onBack}
          // 1.5배 — 안여백(py-3/px-10 → 4.5/15)은 여기서, 나무테 두께와 글씨 크기는
          // .wood-button-lg에서 함께 키운다(globals.css 주석 참고).
          className="wood-button wood-button-lg py-[1.125rem] px-[3.75rem]"
          style={{ animation: 'bounceIn 0.6s cubic-bezier(0.36,0.07,0.19,0.97) 400ms both' }}
        >
          로비로 돌아가기
        </button>
      </div>
      </div>

      <p className="text-sm result-bg-text text-center pt-4">
        게임 중 글씨 크기/소리를 조절하려면 오른쪽 하단(⚙️)을 확인해 주세요.
      </p>
    </div>
  );
}
