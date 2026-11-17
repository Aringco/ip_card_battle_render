'use client';

import { useEffect, useRef } from 'react';
import type { GameSettings, Seat } from 'shared';
import { LOBBY_ASSETS } from '@/lib/lobbyAssets';
import { ModePanel } from './ModePanel';
import { SoloForm } from './SoloForm';
import { EnhanceForm } from './EnhanceForm';
import { CreateRoomForm } from './CreateRoomForm';
import { IndividualRoomForm } from './IndividualRoomForm';
import { JoinRoomForm } from './JoinRoomForm';

/**
 * 로비 단계. 혼자 놀기도 다같이 놀기처럼 두 갈래다 — 'solo'는 **고르는 단계**(일반 모드 · 강화 모드 두 패널),
 * 'soloNormal'·'soloEnhance'가 폼이 열린 단계다(2026-10-28 — 그 전에는 'solo'가 곧 폼이었다).
 * 방 만들기도 같다 — 'create'는 **고르는 단계**(팀전 · 개인전 두 패널), 'createTeam'·'createIndividual'이 폼이다(2026-10-30 —
 * 그 전에는 'create'가 곧 폼이었고 방 종류는 폼 제목 줄의 토글로 골랐다).
 */
export type Stage =
  | 'kind' | 'home' | 'solo' | 'soloNormal' | 'soloEnhance'
  | 'multi' | 'create' | 'createTeam' | 'createIndividual' | 'join';

/**
 * 로비의 첫 갈림길(2026-11-11) — 일반전 / 강화전. 'kind' 단계에서 고르고, 그 뒤의 단계는 고른 쪽에 맞춰 건너뛴다:
 * 혼자 놀기는 곧바로 그 폼(예전의 일반 모드 · 강화 모드 고르기 단계 'solo'는 더 쓰지 않는다), 강화전의 방 만들기는 곧바로
 * 개인전 폼(강화전에는 팀전이 없다).
 */
export type LobbyKind = 'normal' | 'enhance';

/** 뒤로가기 한 단계 — 폼은 고르는 단계(multi · create)로, 고르는 단계는 home으로, home은 첫 갈림길로. */
export const BACK_OF: Record<Exclude<Stage, 'kind'>, Stage> = {
  home: 'kind',
  solo: 'home',
  soloNormal: 'home',
  soloEnhance: 'home',
  multi: 'home',
  create: 'multi',
  createTeam: 'create',
  createIndividual: 'create',
  join: 'multi',
};
/** 고른 쪽에 따라 건너뛴 단계를 되짚지 않는다 — 강화전의 개인전 폼은 방 만들기 고르기(팀전 · 개인전)를 거치지 않았다. */
export function backOf(stage: Exclude<Stage, 'kind'>, kind: LobbyKind): Stage {
  return kind === 'enhance' && stage === 'createIndividual' ? 'multi' : BACK_OF[stage];
}

// 폼이 다 나타난 뒤(확장 300ms + 페이드 200ms) 첫 입력에 포커스를 준다.
const FOCUS_DELAY_MS = 500;

export interface LobbyStageProps {
  stage: Stage;
  blocked: boolean;
  onGo: (stage: Stage) => void;

  /** 첫 갈림길에서 고른 쪽 — 일반전 / 강화전(개인전 방의 규칙도 이것을 따른다) */
  kind: LobbyKind;
  onKind: (k: LobbyKind) => void;
  nickname: string;
  onNickname: (v: string) => void;
  /** 닉네임을 비워둔 채 시작하는 사람에게 그대로 쓰이는 무작위 이름(placeholder에도 보인다) */
  nicknameHint: string;
  /** 닉네임 입력 + 무작위 이름을 합쳐 "제출 가능한 이름이 있는가" — page.tsx가 계산한다 */
  canSubmitName: boolean;
  team: Seat;
  onTeam: (t: Seat) => void;
  /** 관전석을 골랐는지 — 자리 선택 안내와 팀 이름 라벨이 함께 바뀐다 */
  spectatorSeat: boolean;
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
  /** 강화 규칙(shared/enhance.ts — 기본값이 일반 모드와 다르다) — 혼자 놀기 → 강화 모드와 개인전 강화 방이 함께 쓴다 */
  enhanceSettings: GameSettings;
  onEnhanceSettings: (next: GameSettings) => void;

  onStartSolo: () => void;
  onStartEnhance: () => void;
  onCreateTeamRoom: () => void;
  onCreateIndividualRoom: () => void;
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
  const { stage, blocked, onGo, kind } = props;
  const enhance = kind === 'enhance';

  const soloFirstRef = useRef<HTMLInputElement>(null);
  const enhanceFirstRef = useRef<HTMLInputElement>(null);
  const soloNormalPanelRef = useRef<HTMLButtonElement>(null);
  const soloEnhancePanelRef = useRef<HTMLButtonElement>(null);
  const createFirstRef = useRef<HTMLInputElement>(null);
  const individualFirstRef = useRef<HTMLInputElement>(null);
  const createTeamPanelRef = useRef<HTMLButtonElement>(null);
  const createIndividualPanelRef = useRef<HTMLButtonElement>(null);
  const joinFirstRef = useRef<HTMLInputElement>(null);
  const soloPanelRef = useRef<HTMLButtonElement>(null);
  const multiPanelRef = useRef<HTMLButtonElement>(null);
  const createPanelRef = useRef<HTMLButtonElement>(null);
  const joinPanelRef = useRef<HTMLButtonElement>(null);
  const kindNormalRef = useRef<HTMLButtonElement>(null);
  const kindEnhanceRef = useRef<HTMLButtonElement>(null);

  // 폼이 열리면 첫 입력으로, 패널 단계로 돌아오면 그 패널로 포커스를 옮긴다.
  // prev가 null인 첫 실행은 건너뛴다 — 페이지에 들어오자마자 포커스를 뺏지 않기 위해서고,
  // StrictMode가 마운트 시 effect를 두 번 돌려도(두 번째는 from === stage) 무해하다.
  const prevStage = useRef<Stage | null>(null);
  // 어디서 들어왔는지 — CSS는 도착한 단계만 알아서, 갈림길에서 올 때만 늦게 나타나야 하는 두 열(home)을 가를 수 없다
  // (그 지연이 혼자 · 다같이 놀기에서 되돌아올 때도 걸려 반쪽 화면이 잠깐 비었다 — 2026-11-17). 렌더 도중에 바꿔야 같은 커밋에 실린다.
  const stageFrom = useRef<{ from: Stage | null; at: Stage }>({ from: null, at: stage });
  if (stageFrom.current.at !== stage) stageFrom.current = { from: stageFrom.current.at, at: stage };
  useEffect(() => {
    const from = prevStage.current;
    prevStage.current = stage;
    if (from === null || from === stage) return;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const formTarget =
      stage === 'soloNormal' ? soloFirstRef :
      stage === 'soloEnhance' ? enhanceFirstRef :
      stage === 'createTeam' ? createFirstRef :
      stage === 'createIndividual' ? individualFirstRef :
      stage === 'join' ? joinFirstRef : null;

    if (formTarget) {
      const t = setTimeout(() => formTarget.current?.focus(), reduced ? 0 : FOCUS_DELAY_MS);
      return () => clearTimeout(t);
    }

    // 뒤로 나온 경우 — 방금 닫힌 폼의 패널로 돌아간다
    // 혼자 놀기 폼은 고르기 단계 없이 home에서 열리므로 혼자 놀기 패널로, 강화전의 개인전 폼은 방 만들기 패널로 돌아간다
    const panelTarget =
      from === 'home' ? (enhance ? kindEnhanceRef : kindNormalRef) :
      from === 'soloNormal' || from === 'soloEnhance' || from === 'solo' ? soloPanelRef :
      from === 'createTeam' ? createTeamPanelRef :
      from === 'createIndividual' ? (stage === 'multi' ? createPanelRef : createIndividualPanelRef) :
      from === 'create' ? createPanelRef :
      from === 'join' ? joinPanelRef :
      from === 'multi' ? multiPanelRef : null;

    if (panelTarget) {
      const t = setTimeout(() => panelTarget.current?.focus(), reduced ? 0 : FOCUS_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, [stage]);

  const inCreate = stage === 'create' || stage === 'createTeam' || stage === 'createIndividual';
  const inMulti = stage === 'multi' || inCreate || stage === 'join';
  const inSolo = stage === 'solo' || stage === 'soloNormal' || stage === 'soloEnhance';

  return (
    <div className="lobby-stage" data-stage={stage} data-kind={kind} data-from={stageFrom.current.from ?? undefined}>
      {/* ── 첫 갈림길: 일반전 / 강화전 — 스테이지 위에 겹쳐 있다가 고르면 옅어지며 아래 두 열(혼자 · 다같이)이 드러난다 ── */}
      <div className="kind-picker" inert={stage !== 'kind'}>
        <section className="stage-col">
          <ModePanel
            panelRef={kindNormalRef}
            className="stage-panel"
            tone="battle"
            artSrc={LOBBY_ASSETS.panelSoloBattle}
            title="일반전"
            subtitle="원래 규칙 그대로 — 혼자 또는 다같이"
            disabled={blocked}
            onClick={() => { props.onKind('normal'); onGo('home'); }}
          />
        </section>
        <section className="stage-col">
          <ModePanel
            panelRef={kindEnhanceRef}
            className="stage-panel"
            tone="reinforce"
            artSrc={LOBBY_ASSETS.panelSoloReinforce}
            title="강화전"
            subtitle="기술 카드를 키워 겨뤄요 — 혼자 또는 개인전"
            disabled={blocked}
            onClick={() => { props.onKind('enhance'); onGo('home'); }}
          />
        </section>
      </div>

      {/* ── 좌측 열: 싱글플레이 ─────────────────────────────────────────── */}
      <section className="stage-col stage-col-solo" inert={inMulti || stage === 'kind'}>
        <ModePanel
          panelRef={soloPanelRef}
          className="stage-panel stage-panel-solo"
          tone="solo"
          artSrc={LOBBY_ASSETS.panelSolo}
          title="혼자 놀기"
          subtitle={enhance ? '컴퓨터와 강화전 — 지금 바로 시작할 수 있어요' : '컴퓨터와 대전 — 지금 바로 시작할 수 있어요'}
          disabled={blocked}
          onClick={() => onGo(enhance ? 'soloEnhance' : 'soloNormal')}
        />

        {/* 혼자 놀기 패널 위에 겹쳐 있다가 왼쪽에서 오른쪽으로 드러나는 2열 — 다같이 놀기의 .multi-inner와 같은 구조다 */}
        <div className="solo-inner" inert={!inSolo}>
          <section className="stage-col stage-col-solo-normal" inert={stage === 'soloEnhance'}>
            <ModePanel
              panelRef={soloNormalPanelRef}
              className="stage-panel"
              tone="battle"
              artSrc={LOBBY_ASSETS.panelSoloBattle}
              title="일반 모드"
              subtitle="컴퓨터와 한 판 — 원래 규칙 그대로"
              disabled={blocked}
              onClick={() => onGo('soloNormal')}
            />
            <div className="stage-form stage-form-solo" inert={stage !== 'soloNormal'}>
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

          <section className="stage-col stage-col-solo-enhance" inert={stage === 'soloNormal'}>
            <ModePanel
              panelRef={soloEnhancePanelRef}
              className="stage-panel"
              tone="reinforce"
              artSrc={LOBBY_ASSETS.panelSoloReinforce}
              title="강화 모드"
              subtitle="점점 효과가 강해지는 기술카드로 겨뤄요"
              disabled={blocked}
              onClick={() => onGo('soloEnhance')}
            />
            <div className="stage-form stage-form-enhance" inert={stage !== 'soloEnhance'}>
              <EnhanceForm
                firstFieldRef={enhanceFirstRef}
                nickname={props.nickname}
                onNickname={props.onNickname}
                nicknameHint={props.nicknameHint}
                settings={props.enhanceSettings}
                onSettings={props.onEnhanceSettings}
                canSubmit={!blocked && props.canSubmitName}
                onSubmit={props.onStartEnhance}
              />
            </div>
          </section>
        </div>
      </section>

      {/* ── 우측 열: 멀티플레이 ─────────────────────────────────────────── */}
      <section className="stage-col stage-col-multi" inert={inSolo || stage === 'kind'}>
        <ModePanel
          panelRef={multiPanelRef}
          className="stage-panel stage-panel-multi"
          tone="multi"
          artSrc={LOBBY_ASSETS.panelMulti}
          title="다같이 놀기"
          subtitle={enhance ? '친구와 강화 개인전 — 방을 만들거나 코드로 참가해요' : '친구와 팀전 · 개인전 — 방을 만들거나 코드로 참가해요'}
          disabled={blocked}
          onClick={() => onGo('multi')}
        />

        {/* 멀티 패널 위에 겹쳐 있다가 오른쪽에서 왼쪽으로 드러나는 2열 */}
        <div className="multi-inner" inert={!inMulti}>
          <section className="stage-col stage-col-create" inert={stage === 'join'}>
            <ModePanel
              panelRef={createPanelRef}
              className="stage-panel stage-panel-create"
              tone="create"
              artSrc={LOBBY_ASSETS.panelCreate}
              title="방 만들기"
              subtitle={enhance ? '방장이 되어 강화 개인전을 열어요' : '방장이 되어 규칙을 정해요'}
              disabled={blocked}
              onClick={() => onGo(enhance ? 'createIndividual' : 'create')}
            />

            {/* 방 만들기 패널 위에 겹쳐 있다가 드러나는 2열(팀전 · 개인전) — 혼자 놀기의 .solo-inner와 같은 구조다 */}
            <div className="create-inner" inert={!inCreate}>
              <section className="stage-col stage-col-create-team" inert={stage === 'createIndividual'}>
                <ModePanel
                  panelRef={createTeamPanelRef}
                  className="stage-panel"
                  tone="team"
                  artSrc={LOBBY_ASSETS.panelCreateTeam}
                  title="팀전"
                  subtitle="두 팀으로 나뉘어 함께 겨뤄요"
                  disabled={blocked}
                  onClick={() => onGo('createTeam')}
                />
                <div className="stage-form stage-form-create" inert={stage !== 'createTeam'}>
                  <CreateRoomForm
                    firstFieldRef={createFirstRef}
                    nickname={props.nickname}
                    onNickname={props.onNickname}
                    nicknameHint={props.nicknameHint}
                    team={props.team}
                    onTeam={props.onTeam}
                    spectatorSeat={props.spectatorSeat}
                    teamName={props.teamName}
                    onTeamName={props.onTeamName}
                    otherTeamName={props.otherTeamName}
                    onOtherTeamName={props.onOtherTeamName}
                    teamNamesClash={props.teamNamesClash}
                    settings={props.settings}
                    onSettings={props.onSettings}
                    canSubmit={!blocked && props.canSubmitName && !props.teamNamesClash}
                    onSubmit={props.onCreateTeamRoom}
                  />
                </div>
              </section>

              <section className="stage-col stage-col-create-individual" inert={stage === 'createTeam'}>
                <ModePanel
                  panelRef={createIndividualPanelRef}
                  className="stage-panel"
                  tone="individual"
                  artSrc={LOBBY_ASSETS.panelCreateIndividual}
                  title="개인전"
                  subtitle="최대 8명이 각자 겨뤄 순위를 매겨요"
                  disabled={blocked}
                  onClick={() => onGo('createIndividual')}
                />
                <div className="stage-form stage-form-individual" inert={stage !== 'createIndividual'}>
                  <IndividualRoomForm
                    firstFieldRef={individualFirstRef}
                    kind={kind}
                    nickname={props.nickname}
                    onNickname={props.onNickname}
                    nicknameHint={props.nicknameHint}
                    settings={props.settings}
                    onSettings={props.onSettings}
                    enhanceSettings={props.enhanceSettings}
                    onEnhanceSettings={props.onEnhanceSettings}
                    canSubmit={!blocked && props.canSubmitName}
                    onSubmit={props.onCreateIndividualRoom}
                  />
                </div>
              </section>
            </div>
          </section>

          <section className="stage-col stage-col-join" inert={inCreate}>
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
                spectatorSeat={props.spectatorSeat}
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
