'use client';

import { useEffect, useState } from 'react';
import type { EventDevStatus, EventKind, EventQueueStatus, GameSettings } from 'shared';
import { EVENT_LABELS, EVENT_PIN_LENGTH, NICKNAME_MAX_LEN, SCORE_RACE_TARGET_MAX, SCORE_RACE_TARGET_MIN, SCORE_RACE_TURNS } from 'shared';
import type { EventFormError } from '@/hooks/useWebSocket';
import { Field, FormCard } from './Field';
import { GameRulesFields } from './GameRulesFields';
import { NicknameField } from './NameFields';
import { PlankButton } from '@/components/ui/PlankButton';

/**
 * 이벤트 방 참가하기 폼(EVENT_MODE_ROADMAP.md §1-0·§2.2).
 *
 *   role ─┬─ 개발자 ─▶ devAuth(이름·운영 암호·게임 규칙) ─▶ devWait(상시 대기 — 도전자가 오면 자동 매칭, 규칙은 계속 고칠 수 있다)
 *         └─ 도전자 ─▶ challenger(닉네임·PIN·도전 택일) ─▶ (개발자를 이겨라면) 대기 줄
 *
 * 폼 **자체는** 로비 스테이지의 다른 폼처럼 늘 마운트돼 있고(조건부 렌더링 금지 — LobbyStage 주석), 안쪽 화면만
 * view에 따라 바뀐다.
 *
 * ⚠️ 경고·안내는 새 줄로 붙이지 않고 FormCard의 **설명 줄을 갈아끼운다** — 폼이 position:absolute라 한 줄만 늘어도
 *    좁은 화면에서 스크롤바가 생긴다(CLAUDE.md "경고·안내는 새 줄로 덧붙이지 말고"). 닉네임 중복 안내도 그렇다.
 */
export type EventView = 'role' | 'devAuth' | 'devWait' | 'challenger';

const KIND_ORDER: EventKind[] = ['beatDev', 'timeAttack', 'oneWell'];
const KIND_ICON: Record<EventKind, string> = { beatDev: '👨‍💻', timeAttack: '🎯', oneWell: '🪣' };
const KIND_HINT: Record<EventKind, string> = {
  beatDev: '개발자와 1:1',
  timeAttack: `${SCORE_RACE_TURNS}턴 안에 ${SCORE_RACE_TARGET_MIN}~${SCORE_RACE_TARGET_MAX}점`,
  oneWell: '🐰·🐯 중 한 장만',
};

export interface EventFormProps {
  view: EventView;
  onView: (v: EventView) => void;
  firstFieldRef?: React.Ref<HTMLInputElement>;
  blocked: boolean;
  error: EventFormError | null;
  /** 매칭 직후 카운트다운 — 시작 시각은 내 시계 기준 */
  matched: { startsAt: number; opponentName: string; role: 'developer' | 'challenger' } | null;
  onShowBoard: () => void;

  // 도전자
  nickname: string;
  onNickname: (v: string) => void;
  nicknameHint: string;
  pin: string;
  onPin: (v: string) => void;
  kind: EventKind;
  onKind: (k: EventKind) => void;
  onChallenge: () => void;
  queue: EventQueueStatus | null;
  onCancelQueue: () => void;

  // 개발자
  devName: string;
  onDevName: (v: string) => void;
  devToken: string;
  onDevToken: (v: string) => void;
  onDevStandby: () => void;
  /** 개발자가 정하는 '개발자를 이겨라' 규칙 — 방 만들기의 게임 규칙과 같은 항목(선 플레이어·일시정지 제외) */
  devSettings: GameSettings;
  onDevSettings: (next: GameSettings) => void;
  devStatus: EventDevStatus | null;
  onDevAway: (away: boolean) => void;
  onDevLeave: () => void;
}

/** 제목 줄 오른쪽의 작은 버튼들 — 새 줄을 만들지 않는다(GameModeSelect와 같은 자리·같은 모양). */
function HeadLinks({ onBack, onShowBoard }: { onBack?: () => void; onShowBoard: () => void }) {
  return (
    <div className="mode-toggle">
      <button type="button" className="mode-toggle-button" onClick={onShowBoard} title="순위표(동물의 왕 등) 보기">
        🏆 순위
      </button>
      {onBack && (
        <button type="button" className="mode-toggle-button" onClick={onBack} title="개발자/도전자 다시 고르기">
          ↩ 역할
        </button>
      )}
    </div>
  );
}

/** 매칭 카운트다운의 남은 초 — 시작 시각(내 시계)에서 센다. */
function useCountdown(startsAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startsAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [startsAt]);
  return startsAt === null ? 0 : Math.max(0, Math.ceil((startsAt - now) / 1000));
}

/** 개발자의 게임 규칙 — 대기 시작 전에도, 대기 중에도 고친다(다음 판부터 적용). 서버가 다시 잘라 낸다. */
function DevRules({ settings, onChange }: { settings: GameSettings; onChange: (next: GameSettings) => void }) {
  return (
    <GameRulesFields
      settings={settings}
      onChange={onChange}
      hidePause
      hideFirstTeam
      heading="게임 규칙 (개발자가 정해요)"
    />
  );
}

function MatchedBox({ matched }: { matched: NonNullable<EventFormProps['matched']> }) {
  const sec = useCountdown(matched.startsAt);
  return (
    <div className="event-status-box event-status-box-hot" role="status">
      <p className="text-lg font-extrabold">🎉 매칭되었습니다!</p>
      <p className="text-sm">
        {matched.role === 'developer' ? '도전자' : '상대 개발자'} <b>{matched.opponentName}</b>
      </p>
      <p className="text-sm font-bold">{sec > 0 ? `${sec}초 뒤 시작해요` : '곧 시작해요…'}</p>
    </div>
  );
}

export function EventForm(props: EventFormProps) {
  const { view, onView, blocked, error, matched, onShowBoard } = props;

  // ── 역할 고르기 ──
  if (view === 'role') {
    return (
      <FormCard
        title="🎉 이벤트 방 참가하기"
        headerAside={<HeadLinks onShowBoard={onShowBoard} />}
        description="도전하러 왔다면 도전자, 도전자를 기다리는 운영진이라면 개발자를 골라요."
      >
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="event-role-button" disabled={blocked} onClick={() => onView('challenger')}>
            <span className="text-3xl" aria-hidden>🙋</span>
            <span className="font-extrabold">도전자</span>
            <span className="text-[0.7rem] opacity-80">닉네임 + 도전 하나</span>
          </button>
          <button type="button" className="event-role-button" disabled={blocked} onClick={() => onView('devAuth')}>
            <span className="text-3xl" aria-hidden>👨‍💻</span>
            <span className="font-extrabold">개발자</span>
            <span className="text-[0.7rem] opacity-80">운영 암호 필요</span>
          </button>
        </div>
      </FormCard>
    );
  }

  // ── 개발자 — 암호 입력 ──
  if (view === 'devAuth') {
    const canSubmit = !blocked && props.devToken.length > 0;
    return (
      <FormCard
        title="👨‍💻 개발자 입장"
        headerAside={<HeadLinks onBack={() => onView('role')} onShowBoard={onShowBoard} />}
        description={
          error ? <span className="text-red-700 font-bold">{error.message}</span>
            : '운영 암호를 넣으면 도전자를 기다리는 대기실로 들어가요.'
        }
        side={<DevRules settings={props.devSettings} onChange={props.onDevSettings} />}
        footer={
          <PlankButton onClick={props.onDevStandby} disabled={!canSubmit} block>
            대기 시작
          </PlankButton>
        }
      >
        <Field label="표시 이름 (도전자에게 보여요)">
          <input
            ref={props.firstFieldRef}
            type="text"
            value={props.devName}
            onChange={e => props.onDevName(e.target.value)}
            placeholder="개발자"
            maxLength={NICKNAME_MAX_LEN}
            className="input-base"
          />
        </Field>
        <Field label="운영 암호">
          <input
            type="password"
            value={props.devToken}
            onChange={e => props.onDevToken(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSubmit) props.onDevStandby(); }}
            autoComplete="off"
            aria-invalid={error?.code === 'EVENT_AUTH'}
            className={`input-base ${error?.code === 'EVENT_AUTH' ? '!border-red-400 ring-1 ring-red-400' : ''}`}
          />
        </Field>
      </FormCard>
    );
  }

  // ── 개발자 — 상시 대기 ──
  if (view === 'devWait') {
    const st = props.devStatus;
    const away = st?.state === 'away';
    const stateText = !st
      ? '서버에 대기를 알리는 중…'
      : st.state === 'idle' ? '도전자를 기다리는 중이에요. 도전자가 오면 자동으로 시작해요.'
        : st.state === 'away' ? '잠시 자리 비움 — 지금은 매칭되지 않아요.'
          : st.state === 'matched' ? '매칭됐어요!'
            : '경기 중이에요.';
    return (
      <FormCard
        title="👨‍💻 개발자 대기실"
        headerAside={<HeadLinks onShowBoard={onShowBoard} />}
        description={error ? <span className="text-red-700 font-bold">{error.message}</span> : stateText}
        side={<DevRules settings={props.devSettings} onChange={props.onDevSettings} />}
        footer={
          <div className="flex gap-2">
            <PlankButton onClick={() => props.onDevAway(!away)} disabled={blocked || !st || (st.state !== 'idle' && st.state !== 'away')} block>
              {away ? '다시 대기' : '잠시 자리 비움'}
            </PlankButton>
            <PlankButton onClick={props.onDevLeave} disabled={blocked} block>
              대기 그만두기
            </PlankButton>
          </div>
        }
      >
        {matched ? (
          <MatchedBox matched={matched} />
        ) : (
          <div className={`event-status-box ${away ? 'event-status-box-dim' : ''}`} role="status">
            <p className="text-2xl" aria-hidden>{away ? '☕' : '⏳'}</p>
            <p className="font-extrabold">{st?.name ?? props.devName ?? '개발자'}</p>
            <p className="text-sm">대기 줄 <b>{st?.queueLength ?? 0}</b>명</p>
          </div>
        )}
        <p className="text-sm text-board-ink text-center">
          오늘 전적 <b>{st?.wins ?? 0}</b>승 <b>{st?.losses ?? 0}</b>패
        </p>
      </FormCard>
    );
  }

  // ── 도전자 — 대기 줄 ──
  if (props.queue || (matched && matched.role === 'challenger')) {
    const q = props.queue;
    return (
      <FormCard
        title="⏳ 개발자를 기다리는 중"
        headerAside={<HeadLinks onShowBoard={onShowBoard} />}
        description={
          matched ? '곧 시작해요 — 화면을 떠나지 마세요.'
            : q && q.developersOnline === 0 ? '지금 대기 중인 개발자가 없어요. 잠시 기다려 주세요.'
              : q && q.developersIdle === 0 ? '개발자가 다른 도전자와 경기 중이거나 잠시 자리를 비웠어요.'
                : '곧 개발자와 연결돼요.'
        }
        footer={
          <PlankButton onClick={props.onCancelQueue} disabled={blocked || !!matched} block>
            줄에서 빠지기
          </PlankButton>
        }
      >
        {matched ? (
          <MatchedBox matched={matched} />
        ) : (
          <div className="event-status-box" role="status">
            <p className="text-sm">내 순서</p>
            <p className="text-3xl font-extrabold">{q?.position ?? '-'}번째</p>
            <p className="text-sm">
              {q?.estimatedWaitSec != null ? `예상 대기 약 ${Math.max(1, Math.round(q.estimatedWaitSec / 60))}분` : '예상 대기 시간을 재는 중'}
            </p>
          </div>
        )}
      </FormCard>
    );
  }

  // ── 도전자 — 닉네임 · PIN · 도전 고르기 ──
  const pinOk = props.pin.length === EVENT_PIN_LENGTH;
  const canSubmit = !blocked && pinOk;
  const nameError = error?.code === 'NICKNAME_TAKEN';
  const pinError = error?.code === 'EVENT_PIN';
  return (
    <FormCard
      title="🙋 도전하기"
      headerAside={<HeadLinks onBack={() => onView('role')} onShowBoard={onShowBoard} />}
      description={
        error ? <span className="text-red-700 font-bold">{error.message}</span>
          : '닉네임은 겹칠 수 없어요. PIN은 같은 닉네임으로 다시 도전할 때 필요해요.'
      }
      footer={
        <PlankButton onClick={props.onChallenge} disabled={!canSubmit} block>
          {props.kind === 'beatDev' ? '대기 줄 서기' : '도전 시작'}
        </PlankButton>
      }
    >
      <div className={nameError ? 'event-field-invalid' : ''}>
        <NicknameField
          inputRef={props.firstFieldRef}
          nickname={props.nickname}
          onChange={props.onNickname}
          hint={props.nicknameHint}
          label="닉네임 (겹치면 안 돼요)"
        />
      </div>

      <Field label={`PIN 숫자 ${EVENT_PIN_LENGTH}자리 (재도전할 때 필요)`}>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={props.pin}
          onChange={e => props.onPin(e.target.value.replace(/\D/g, '').slice(0, EVENT_PIN_LENGTH))}
          onKeyDown={e => { if (e.key === 'Enter' && canSubmit) props.onChallenge(); }}
          placeholder="••••"
          maxLength={EVENT_PIN_LENGTH}
          aria-invalid={pinError}
          className={`input-base tracking-[0.4em] ${pinError ? '!border-red-400 ring-1 ring-red-400' : ''}`}
        />
      </Field>

      <Field label="도전 고르기">
        <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="도전 고르기">
          {KIND_ORDER.map(k => (
            <div key={k} className="event-kind-row" data-selected={props.kind === k || undefined}>
              <button
                type="button"
                role="radio"
                aria-checked={props.kind === k}
                className="event-kind-button"
                onClick={() => props.onKind(k)}
              >
                <span aria-hidden>{KIND_ICON[k]}</span>
                <span className="font-extrabold">{EVENT_LABELS[k]}</span>
                <span className="event-kind-hint">{KIND_HINT[k]}</span>
              </button>
            </div>
          ))}
        </div>
      </Field>
    </FormCard>
  );
}
