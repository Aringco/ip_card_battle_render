'use client';

import { useEffect, useRef } from 'react';
import type { GameSettings, Team } from 'shared';
import { LOBBY_ASSETS } from '@/lib/lobbyAssets';
import { ModePanel } from './ModePanel';
import { SoloForm } from './SoloForm';
import { CreateRoomForm } from './CreateRoomForm';
import { JoinRoomForm } from './JoinRoomForm';

export type Stage = 'home' | 'solo' | 'multi' | 'create' | 'join';

/** 뒤로가기 한 단계 — create/join은 multi로, solo/multi는 home으로. */
export const BACK_OF: Record<Exclude<Stage, 'home'>, Stage> = {
  solo: 'home',
  multi: 'home',
  create: 'multi',
  join: 'multi',
};

// 폼이 다 나타난 뒤(확장 300ms + 페이드 200ms) 첫 입력에 포커스를 준다.
const FOCUS_DELAY_MS = 500;

export interface LobbyStageProps {
  stage: Stage;
  blocked: boolean;
  onGo: (stage: Stage) => void;

  nickname: string;
  onNickname: (v: string) => void;
  /** 닉네임을 비워둔 채 시작하는 사람에게 그대로 쓰이는 무작위 이름(placeholder에도 보인다) */
  nicknameHint: string;
  /** 닉네임 입력 + 무작위 이름을 합쳐 "제출 가능한 이름이 있는가" — page.tsx가 계산한다 */
  canSubmitName: boolean;
  team: Team;
  onTeam: (t: Team) => void;
  teamName: string;
  onTeamName: (v: string) => void;
  /** 방을 만드는 쪽만 입력 — 아직 아무도 없는 반대편 팀 이름까지 미리 정해둔다 */
  otherTeamName: string;
  onOtherTeamName: (v: string) => void;
  /** 두 팀 이름이 같음 — 서버도 같은 조건으로 시작을 막는다 */
  teamNamesClash: boolean;
  roomCode: string;
  onRoomCode: (v: string) => void;
  /** 초대 링크(`/?room=ABCD`)로 들어와 방 코드가 미리 채워진 상태인지 */
  arrivedByInvite: boolean;
  settings: GameSettings;
  onSettings: (next: GameSettings) => void;

  onStartSolo: () => void;
  onCreateRoom: () => void;
  onJoinRoom: () => void;
}

/**
 * 로비 스테이지 — 패널 4개와 폼 3개를 **항상 마운트한 채** data-stage만 바꾼다.
 *
 * 조건부 렌더링을 하지 않는 것이 핵심이다. 전환은 전부 CSS transition이 맡으므로
 * 뒤로가기는 data-stage를 이전 값으로 되돌리기만 하면 정확한 역방향으로 재생된다
 * (exit 애니메이션용 타이머·onAnimationEnd·상태 복제가 필요 없다).
 *
 * 화면에 보이지 않는 영역은 inert로 막아 Tab 포커스와 클릭이 새지 않게 한다.
 */
export function LobbyStage(props: LobbyStageProps) {
  const { stage, blocked, onGo } = props;

  const soloFirstRef = useRef<HTMLInputElement>(null);
  const createFirstRef = useRef<HTMLInputElement>(null);
  const joinFirstRef = useRef<HTMLInputElement>(null);
  const soloPanelRef = useRef<HTMLButtonElement>(null);
  const multiPanelRef = useRef<HTMLButtonElement>(null);
  const createPanelRef = useRef<HTMLButtonElement>(null);
  const joinPanelRef = useRef<HTMLButtonElement>(null);

  // 폼이 열리면 첫 입력으로, 패널 단계로 돌아오면 그 패널로 포커스를 옮긴다.
  // prev가 null인 첫 실행은 건너뛴다 — 페이지에 들어오자마자 포커스를 뺏지 않기 위해서고,
  // StrictMode가 마운트 시 effect를 두 번 돌려도(두 번째는 from === stage) 무해하다.
  const prevStage = useRef<Stage | null>(null);
  useEffect(() => {
    const from = prevStage.current;
    prevStage.current = stage;
    if (from === null || from === stage) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const formTarget =
      stage === 'solo' ? soloFirstRef :
      stage === 'create' ? createFirstRef :
      stage === 'join' ? joinFirstRef : null;

    if (formTarget) {
      const t = setTimeout(() => formTarget.current?.focus(), reduced ? 0 : FOCUS_DELAY_MS);
      return () => clearTimeout(t);
    }

    // 뒤로 나온 경우 — 방금 닫힌 폼의 패널로 돌아간다
    const panelTarget =
      from === 'solo' ? soloPanelRef :
      from === 'create' ? createPanelRef :
      from === 'join' ? joinPanelRef :
      from === 'multi' ? multiPanelRef : null;

    if (panelTarget) {
      const t = setTimeout(() => panelTarget.current?.focus(), reduced ? 0 : FOCUS_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const inMulti = stage === 'multi' || stage === 'create' || stage === 'join';

  return (
    <div className="lobby-stage" data-stage={stage}>
      {/* ── 좌측 열: 싱글플레이 ─────────────────────────────────────────── */}
      <section className="stage-col stage-col-solo" inert={inMulti}>
        <ModePanel
          panelRef={soloPanelRef}
          className="stage-panel"
          tone="solo"
          artSrc={LOBBY_ASSETS.panelSolo}
          title="혼자 놀기"
          subtitle="컴퓨터와 대전 — 지금 바로 시작할 수 있어요"
          disabled={blocked}
          onClick={() => onGo('solo')}
        />
        <div className="stage-form stage-form-solo" inert={stage !== 'solo'}>
          <SoloForm
            firstFieldRef={soloFirstRef}
            nickname={props.nickname}
            onNickname={props.onNickname}
            nicknameHint={props.nicknameHint}
            teamName={props.teamName}
            onTeamName={props.onTeamName}
            settings={props.settings}
            onSettings={props.onSettings}
            canSubmit={!blocked && props.canSubmitName}
            onSubmit={props.onStartSolo}
          />
        </div>
      </section>

      {/* ── 우측 열: 멀티플레이 ─────────────────────────────────────────── */}
      <section className="stage-col stage-col-multi" inert={stage === 'solo'}>
        <ModePanel
          panelRef={multiPanelRef}
          className="stage-panel stage-panel-multi"
          tone="multi"
          artSrc={LOBBY_ASSETS.panelMulti}
          title="다같이 놀기"
          subtitle="친구와 팀 대전 — 방을 만들거나 코드로 참가해요"
          disabled={blocked}
          onClick={() => onGo('multi')}
        />

        {/* 멀티 패널 위에 겹쳐 있다가 오른쪽에서 왼쪽으로 드러나는 2열 */}
        <div className="multi-inner" inert={!inMulti}>
          <section className="stage-col stage-col-create" inert={stage === 'join'}>
            <ModePanel
              panelRef={createPanelRef}
              className="stage-panel"
              tone="create"
              artSrc={LOBBY_ASSETS.panelCreate}
              title="방 만들기"
              subtitle="방장이 되어 규칙을 정해요"
              disabled={blocked}
              onClick={() => onGo('create')}
            />
            <div className="stage-form stage-form-create" inert={stage !== 'create'}>
              <CreateRoomForm
                firstFieldRef={createFirstRef}
                nickname={props.nickname}
                onNickname={props.onNickname}
                nicknameHint={props.nicknameHint}
                team={props.team}
                onTeam={props.onTeam}
                teamName={props.teamName}
                onTeamName={props.onTeamName}
                otherTeamName={props.otherTeamName}
                onOtherTeamName={props.onOtherTeamName}
                teamNamesClash={props.teamNamesClash}
                settings={props.settings}
                onSettings={props.onSettings}
                canSubmit={!blocked && props.canSubmitName && !props.teamNamesClash}
                onSubmit={props.onCreateRoom}
              />
            </div>
          </section>

          <section className="stage-col stage-col-join" inert={stage === 'create'}>
            <ModePanel
              panelRef={joinPanelRef}
              className="stage-panel"
              tone="join"
              artSrc={LOBBY_ASSETS.panelJoin}
              title="방 참가하기"
              subtitle="친구가 알려준 4자리 코드로 입장"
              disabled={blocked}
              onClick={() => onGo('join')}
            />
            <div className="stage-form stage-form-join" inert={stage !== 'join'}>
              <JoinRoomForm
                firstFieldRef={joinFirstRef}
                nickname={props.nickname}
                onNickname={props.onNickname}
                nicknameHint={props.nicknameHint}
                roomCode={props.roomCode}
                onRoomCode={props.onRoomCode}
                arrivedByInvite={props.arrivedByInvite}
                team={props.team}
                onTeam={props.onTeam}
                canSubmit={!blocked && props.canSubmitName && !!props.roomCode.trim()}
                onSubmit={props.onJoinRoom}
              />
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
