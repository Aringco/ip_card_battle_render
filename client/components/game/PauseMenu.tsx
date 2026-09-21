'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Team } from 'shared';
import { BoardFrame } from '@/components/ui/BoardFrame';
import { PlankButton } from '@/components/ui/PlankButton';

/**
 * 게임 중 메뉴(⏸) — 일시정지 · 항복하기 · 나가기.
 *
 * 화면 오른쪽 위의 버튼이나 ESC로 연다. 창이 열린 것만으로는 게임이 멈추지 않는다 —
 * **멈추는 것은 [게임 일시정지]를 눌렀을 때뿐**이고, 그 판단은 전부 서버가 한다
 * (혼자 놀기는 즉시, 다같이 놀기는 상대가 수락해야). 그래서 이 컴포넌트는 "지금
 * 멈춰 있는가"를 스스로 기억하지 않고 서버가 보내주는 `paused`만 그린다 —
 * 그러지 않으면 상대가 거절했는데 내 화면만 멈춰 있는 일이 생긴다.
 *
 * 액자는 승패 화면과 같은 `split`(back_board_frame + back_board_plate)을 쓴다 —
 * 합본 back_board와 달리 나무가 얇고 양피지가 넓어, 버튼 셋이 들어가도 창이 커지지 않는다.
 * 다만 양피지는 불투명하게 둔다(`--plate-opacity: 1`) — 뒤가 회색으로 죽은 판이라
 * 비치면 글자가 그 위에서 흔들린다.
 *
 * 창을 두 겹으로 쓴다.
 *   1. 메뉴 — 버튼 셋.
 *   2. 확인 — "정말 항복하시겠습니까?"처럼 되돌릴 수 없는 선택 앞에 한 번 더 묻는다.
 * 상대가 보낸 일시정지 요청은 이 둘과 **별개**로, 메뉴를 열지 않았어도 뜬다.
 */

type Confirm = 'surrender' | 'leave' | null;

const CONFIRM_TEXT: Record<Exclude<Confirm, null>, { title: string; detail: string }> = {
  surrender: { title: '정말 항복하시겠습니까?', detail: '상대 팀의 승리로 게임이 끝납니다.' },
  leave: { title: '게임을 포기하고 나가시겠습니까?', detail: '상대 팀의 승리로 게임이 끝나고 로비로 돌아갑니다.' },
};

/** 마감 시각까지 남은 초(올림). 마감이 없으면 null. */
function useSecondsLeft(until: number | null): number | null {
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    if (until === null) {
      setLeft(null);
      return;
    }
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [until]);

  return left;
}

/** 남은 초를 분:초로 — 일시정지 상한이 분 단위(기본 5분)라 초만 세면 읽기 어렵다. */
function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}초`;
}

/** 확인 창·요청 창이 공통으로 쓰는 [네] [아니오] 한 쌍. */
function YesNo({
  onYes,
  onNo,
  yesLabel = '네',
  noLabel = '아니오',
}: {
  onYes: () => void;
  onNo: () => void;
  yesLabel?: string;
  noLabel?: string;
}) {
  return (
    <div className="flex items-center justify-center gap-3">
      <PlankButton onClick={onYes} className="pause-btn pause-btn-sm">
        {yesLabel}
      </PlankButton>
      <PlankButton onClick={onNo} className="pause-btn pause-btn-sm">
        {noLabel}
      </PlankButton>
    </div>
  );
}

export function PauseMenu({
  paused,
  pausedBy,
  pausePending,
  pauseLeft,
  pauseUnlimited,
  pauseUntil,
  myTeam,
  pauseRequest,
  pauseWaitingUntil,
  pauseNotice,
  onClearNotice,
  onRequestPause,
  onResume,
  onRespond,
  onSurrender,
  onLeave,
}: {
  paused: boolean;
  /** 멈춘 팀 — 이 팀만 다시 시작할 수 있다(서버가 같은 규칙으로 막는다). */
  pausedBy: { team: Team; nickname: string } | null;
  /** 상대의 대답을 기다리는 중(서버가 알려준다) — 그동안에도 판은 멈춰 있다. */
  pausePending: boolean;
  /** 우리 팀에 남은 일시정지 횟수. 0이면 버튼이 잠긴다(서버도 같은 규칙으로 막는다). */
  pauseLeft: number;
  /** 이 방에는 횟수·시간 제한이 없다(혼자 놀기) — 남은 횟수도 자동 재개 안내도 숨긴다. */
  pauseUnlimited: boolean;
  /** 자동으로 다시 시작되는 시각(내 시계 기준) — 멈춰 있지 않으면 null. */
  pauseUntil: number | null;
  /** null이면 관전자 — 승패를 가를 수 없으니 [나가기]만 쓸 수 있다. */
  myTeam: Team | null;
  pauseRequest: { fromTeam: Team; fromNickname: string; timeoutMs: number; receivedAt: number } | null;
  pauseWaitingUntil: number | null;
  pauseNotice: string | null;
  onClearNotice: () => void;
  onRequestPause: () => void;
  onResume: () => void;
  onRespond: (accept: boolean) => void;
  onSurrender: () => void;
  onLeave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);

  const spectating = myTeam === null;
  const waitingLeft = useSecondsLeft(pauseWaitingUntil);
  const requestLeft = useSecondsLeft(pauseRequest ? pauseRequest.receivedAt + pauseRequest.timeoutMs : null);
  // 멈춘 팀만 다시 시작할 수 있다. 상대가 멈춘 경우에는 버튼이 "기다리는 중"으로 남는다.
  const canResume = paused && (pausedBy === null || pausedBy.team === myTeam);
  // 남은 초는 직접 누른 사람만 안다(그 순간부터 센다). 같은 팀의 다른 사람·재접속한
  // 사람은 서버가 보내주는 pausePending으로 "기다리는 중"임만 알고 숫자 없이 표시한다.
  const waiting = pauseWaitingUntil !== null || (pausePending && canResume);
  // 자동 재개까지 남은 시간 — 5분 단위라 분:초로 읽는다.
  const autoResumeLeft = useSecondsLeft(paused ? pauseUntil : null);
  const outOfPauses = !pauseUnlimited && !paused && !waiting && pauseLeft <= 0;

  // 창을 여닫는 것은 **서버가 알려주는 멈춤 상태**를 따른다.
  //   멈추면 → 연다. [게임 계속하기]가 이 창 안에 있으므로, 닫힌 채 화면만 회색이 되면
  //             다시 시작할 방법이 화면에서 사라진다.
  //   풀리면 → 닫는다. "계속하기"는 곧 "게임으로 돌아가기"인데 창이 그대로 남아 있으면
  //             한 번 더 닫아야 판이 보인다(상대가 풀어준 경우에도 마찬가지다).
  // 단, 상대의 요청 창이 떠 있는 동안에는 열지 않는다 — 서버가 묻는 20초 동안에도 판을
  // 멈춰 두므로(그래야 고르는 사이 턴이 날아가지 않는다), 그대로 두면 답하기도 전에
  // 메뉴가 요청 창 뒤에 깔린다. 수락해서 요청 창이 사라지면 그때 이 효과가 다시 돈다.
  const wasPausedRef = useRef(false);
  useEffect(() => {
    if (pauseRequest !== null) {
      // 물어보는 창이 떠 있는 동안에는 메뉴를 치운다. 서버가 묻는 20초 동안에도 판을
      // 멈추므로(그래야 고르는 사이 턴이 날아가지 않는다) 멈춤 알림이 요청 메시지보다
      // **먼저** 도착하는데, 그 사이에 열린 메뉴가 요청 창 뒤에 깔린 채 남는다.
      setOpen(false);
      setConfirm(null);
    } else if (paused) {
      setOpen(true);
      setConfirm(null);
    } else if (wasPausedRef.current) {
      setOpen(false);
      setConfirm(null);
    }
    wasPausedRef.current = paused;
  }, [paused, pauseRequest]);

  // 안내 한 줄은 잠시 뒤 스스로 사라진다(거절·시간초과는 그 순간만 알면 되는 소식이다).
  useEffect(() => {
    if (!pauseNotice) return;
    const id = setTimeout(onClearNotice, 4000);
    return () => clearTimeout(id);
  }, [pauseNotice, onClearNotice]);

  const close = useCallback(() => {
    // 멈춰 있는 동안에는 닫지 않는다 — 회색 화면만 남으면 무엇을 눌러야 할지 알 수 없다.
    if (paused) return;
    setOpen(false);
    setConfirm(null);
  }, [paused]);

  // ESC — 확인 창이 떠 있으면 그것만 물리고, 아니면 메뉴를 열고 닫는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (confirm !== null) setConfirm(null);
      else if (open) close();
      else setOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, confirm, close]);

  // 기다리는 중이 먼저다 — 그동안에도 판은 멈춰 있어(서버가 그렇게 한다) `paused`만
  // 보면 "게임 계속하기"가 되는데, 아직 상대가 수락하지 않아 누를 수 없는 버튼이다.
  const pauseButtonLabel = waiting
    ? `응답을 기다리는 중…${waitingLeft === null ? '' : ` ${waitingLeft}`}`
    : paused
      ? canResume
        ? '게임 계속하기'
        : `${pausedBy?.nickname ?? '상대'} 님이 멈췄어요`
      : outOfPauses
        ? '일시정지를 다 썼어요'
        : pauseUnlimited
          ? '게임 일시정지'
          : `게임 일시정지 (${pauseLeft}회 남음)`;

  return (
    <>
      {/* 오른쪽 위 버튼 — 메뉴가 열려 있는 동안에는 창이 그 역할을 하므로 숨긴다 */}
      {!open && (
        <PlankButton onClick={() => setOpen(true)} className="pause-fab">
          ⏸ 일시정지
        </PlankButton>
      )}

      {/* 거절·시간초과 안내 한 줄 */}
      {pauseNotice && (
        <div className="pause-toast" role="status">
          {pauseNotice}
        </div>
      )}

      {/* ── 멈춤 막 + 메뉴 ──────────────────────────────────────────────────
          멈춰 있을 때만 화면이 회색으로 죽는다(filter: grayscale). 메뉴만 열었을
          때는 판이 제 색으로 비쳐야 "아직 게임은 흐르고 있다"가 보인다. */}
      {open && (
        <div className={`pause-dim ${paused ? 'pause-dim-frozen' : ''}`} onClick={close}>
          <BoardFrame split className="pause-card">
            <div onClick={e => e.stopPropagation()}>
              {confirm === null ? (
                <>
                  <h2 className="pause-title">{paused ? '일시정지' : '게임 메뉴'}</h2>
                  <div className="pause-actions">
                    {!spectating && (
                      <PlankButton
                        block
                        className="pause-btn"
                        disabled={waiting || outOfPauses || (paused && !canResume)}
                        onClick={paused ? onResume : onRequestPause}
                      >
                        {pauseButtonLabel}
                      </PlankButton>
                    )}
                    {/* 멈춰 있는 동안에는 언제 저절로 풀리는지 알려준다 — 상대가 자리를
                        비워도 판이 영영 멈춰 있지 않다는 것이 이 줄로 보인다. */}
                    {paused && autoResumeLeft !== null && (
                      <p className="pause-note pause-note-tight">
                        <span className="pause-count">{formatClock(autoResumeLeft)}</span> 뒤에 자동으로 다시 시작해요.
                      </p>
                    )}
                    {!spectating && (
                      <PlankButton block className="pause-btn" onClick={() => setConfirm('surrender')}>
                        항복하기
                      </PlankButton>
                    )}
                    <PlankButton block className="pause-btn" onClick={() => setConfirm('leave')}>
                      나가기
                    </PlankButton>
                  </div>
                  {/* 멈춰 있는 동안에는 "닫기"가 없다 — 위 close()와 같은 이유다. */}
                  {!paused && (
                    <button type="button" onClick={close} className="pause-close">
                      돌아가기
                    </button>
                  )}
                  {spectating && <p className="pause-note">관전 중에는 게임을 멈추거나 항복할 수 없어요.</p>}
                </>
              ) : (
                <>
                  <h2 className="pause-title">{CONFIRM_TEXT[confirm].title}</h2>
                  <p className="pause-note">{CONFIRM_TEXT[confirm].detail}</p>
                  <YesNo
                    onYes={confirm === 'surrender' ? onSurrender : onLeave}
                    onNo={() => setConfirm(null)}
                  />
                </>
              )}
            </div>
          </BoardFrame>
        </div>
      )}

      {/* ── 상대가 보낸 일시정지 요청 ────────────────────────────────────────
          메뉴와 무관하게(메뉴를 열지 않았어도) 뜨고, 다른 모든 것보다 위에 있다. */}
      {pauseRequest && (
        // 묻는 20초 동안에도 서버는 판을 멈춰 둔다 — 그러니 뒤 화면도 그동안 회색으로
        // 죽어 있어야 "지금은 멈춘 상태에서 고르는 중"이 한눈에 읽힌다(막만 어두우면
        // 판이 계속 흐르는 것처럼 보인다).
        <div className={`pause-dim pause-dim-ask ${paused ? 'pause-dim-frozen' : ''}`}>
          <BoardFrame split className="pause-card">
            <h2 className="pause-title">상대방이 게임 일시정지를 요청하였습니다.</h2>
            <p className="pause-note">
              {pauseRequest.fromNickname} 님의 요청이에요. 수락하시겠습니까?
              <br />
              <span className="pause-count">{requestLeft ?? 0}초</span> 안에 답하지 않으면 게임이 그대로 이어집니다.
            </p>
            <YesNo onYes={() => onRespond(true)} onNo={() => onRespond(false)} />
          </BoardFrame>
        </div>
      )}
    </>
  );
}
