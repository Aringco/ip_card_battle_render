'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { EventConfig, EventKind, GameMode, GameSettings, Seat } from 'shared';
import { DEFAULT_SETTINGS, ENHANCE_SETTINGS, beatDevSettings, isPlayingSeat, randomNickname } from 'shared';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { EventView } from '@/components/lobby/EventForm';
import {
  clearDevSession,
  loadDevSession,
  loadEventName,
  saveDevSession,
  saveEventName,
  takeEventReturn,
} from '@/lib/eventSession';
import { playBgm } from '@/lib/bgm';
import { HowToPlayModal } from '@/components/ui/HowToPlayModal';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { LOBBY_ASSETS, TABLE_IS_STANDIN } from '@/lib/lobbyAssets';
import { LobbyHero } from '@/components/lobby/LobbyHero';
import { LobbyStage, BACK_OF, type Stage } from '@/components/lobby/LobbyStage';
import { BackButton } from '@/components/lobby/BackButton';
import { WaitingRoom } from '@/components/lobby/WaitingRoom';

/**
 * 로비 화면.
 *
 *   home ──멀티──▶ multi ──방 만들기──▶ create ──▶ waiting ──▶ /room/[id]
 *    │               │                             ▲
 *    │               └──방 참가하기──▶ join ────────┘
 *    └───싱글────▶ solo ──────────────────────────────▶ /room/[id]
 *
 * 스테이지 전환 연출은 전부 LobbyStage의 CSS가 맡는다. 여기서는 어느 단계인지와
 * 서버로 보낼 값만 관리한다. waiting은 스테이지 밖의 별도 화면이다.
 */
export default function LobbyPage() {
  const router = useRouter();
  const ws = useWebSocket();

  // 효과음·이미지 프리로드가 끝나기 전에는 로딩 화면을 덮어둔다.
  // (게임 도중 그때그때 받으면 첫 효과음이 안 들리거나 카드 이미지가 늦게 뜬다)
  const [assetsReady, setAssetsReady] = useState(false);
  const handleAssetsReady = useCallback(() => setAssetsReady(true), []);

  // 로비/대기실 BGM — 입장 즉시부터 게임 시작 전까지 계속 재생
  useEffect(() => {
    playBgm('/sounds/bgm_main.mp3', 0.6);
  }, []);

  const [nickname, setNickname] = useState('');
  // 닉네임을 비워두고 시작하는 사람에게 그대로 쓰이는 무작위 이름(placeholder에도 보인다).
  // 마운트 뒤에 만드는 이유는 이 값이 서버 프리렌더와 클라이언트에서 서로 달라 hydration
  // 경고를 내기 때문 — 첫 렌더에는 빈 문자열이라 placeholder가 고정 문구로 폴백된다.
  const [nicknameHint, setNicknameHint] = useState('');
  useEffect(() => setNicknameHint(randomNickname()), []);

  // 내가 앉을 자리 — 두 팀 중 하나이거나 관전석. 관전석을 고르면 게임 화면에서
  // 아무것도 조작할 수 없고 양 팀의 진행만 지켜본다.
  const [team, setTeam] = useState<Seat>('A');
  const spectatorSeat = !isPlayingSeat(team);
  // 방 만들기의 방 종류 — 개인전이면 팀이 없으므로 자리·팀 이름을 쓰지 않는다.
  const [roomMode, setRoomMode] = useState<GameMode>('team');
  const [teamName, setTeamName] = useState('');
  // 방을 만드는 쪽만 입력할 수 있다 — 아직 아무도 들어오지 않은 반대편 팀의 이름까지
  // 미리 정해둔다(비워두면 기존처럼 실제 참가자가 자기 팀 이름을 직접 고른다).
  const [otherTeamName, setOtherTeamName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  // 초대 링크로 들어왔는지 — 참가 화면에 "방 코드는 이미 채워뒀다"는 안내를 띄우는 용도
  const [arrivedByInvite, setArrivedByInvite] = useState(false);
  const [stage, setStage] = useState<Stage>('home');
  const [showHowTo, setShowHowTo] = useState(false);
  // 방장(방을 만드는 쪽)만 정하는 게임 규칙 — 방 생성/싱글 모드 시작 화면에서 함께 입력받는다.
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  // 혼자 놀기 → 강화 모드의 규칙 — 기본값이 일반 모드와 달라(shared/enhance.ts의 ENHANCE_SETTINGS) 따로 기억한다
  const [enhanceSettings, setEnhanceSettings] = useState<GameSettings>(ENHANCE_SETTINGS);

  // ─ 이벤트 방 참가하기(EVENT_MODE_ROADMAP.md) ─
  const [eventView, setEventView] = useState<EventView>('role');
  const [eventKind, setEventKind] = useState<EventKind>('beatDev');
  const [eventPin, setEventPin] = useState('');
  const [devName, setDevName] = useState('');
  const [devToken, setDevToken] = useState('');
  // 개발자가 정하는 '개발자를 이겨라' 규칙 — 서버가 devId별로 기억하고, 서버가 다시 켜졌을 때를 위해 세션에도 둔다.
  const [devSettings, setDevSettings] = useState<GameSettings>(() => beatDevSettings());
  // 목표점수 달성하기·한 우물만 파기의 규칙(행사 전체) — 서버가 대기실에 들어온 개발자에게 내려 준 값에서 시작한다.
  const [devConfig, setDevConfig] = useState<EventConfig | null>(null);
  // 개발자 대기를 서버에 알렸는가 — 연결이 다시 붙으면 다시 알린다(상시 대기)
  const devStandbyWanted = useRef(false);

  // 이벤트에서 돌아온 경우 이벤트 폼을 연 채로 시작한다 — 개발자는 저절로 다시 대기하고(상시 대기),
  // 도전자는 마지막 닉네임이 채워진 도전 폼으로 돌아온다.
  useEffect(() => {
    const dev = loadDevSession();
    if (dev) {
      setDevName(dev.name);
      setDevToken(dev.token);
      if (dev.settings) setDevSettings(beatDevSettings(dev.settings));
      setEventView('devWait');
      devStandbyWanted.current = true;
      setStage('event');
      return;
    }
    if (takeEventReturn()) {
      setNickname(loadEventName());
      setEventView('challenger');
      setStage('event');
    }
  }, []);

  // 개발자 대기 — 연결될 때마다(처음·재연결) 서버에 알린다. devId로 같은 개발자(전적)에 이어 붙는다.
  useEffect(() => {
    if (!ws.connected || !devStandbyWanted.current) return;
    const dev = loadDevSession();
    if (dev) ws.eventDevStandby(dev.token, dev.name, dev.devId, dev.settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws.connected]);

  // 서버가 내려준 devId를 기억해 둔다(판이 끝나 돌아와도 같은 개발자로 이어 붙게).
  useEffect(() => {
    const st = ws.eventDevStatus;
    if (!st) return;
    const dev = loadDevSession();
    if (dev && dev.devId !== st.devId) saveDevSession({ ...dev, devId: st.devId });
  }, [ws.eventDevStatus]);

  // 대기 중 규칙을 고치면 잠시 뒤 서버에 알린다 — 숫자를 치는 중간값(예: 15를 치려다 1)이 그대로 판에 실리지 않게
  // 입력이 멈춘 뒤에 보낸다. 서버가 범위를 다시 잘라 내므로 화면 값은 서버 상태로 덮어쓰지 않는다(치는 중에 튀지 않게).
  const { eventDevSettings } = ws;
  const devSettingsSent = useRef<string | null>(null);
  useEffect(() => {
    if (eventView !== 'devWait' || !ws.eventDevStatus) return;
    const key = JSON.stringify(devSettings);
    if (devSettingsSent.current === null) { devSettingsSent.current = key; return; } // 대기 시작 때 이미 보냈다
    if (devSettingsSent.current === key) return;
    const t = setTimeout(() => {
      devSettingsSent.current = key;
      eventDevSettings(devSettings);
      const dev = loadDevSession();
      if (dev) saveDevSession({ ...dev, settings: devSettings });
    }, 600);
    return () => clearTimeout(t);
  }, [devSettings, eventView, ws.eventDevStatus, eventDevSettings]);

  // 행사 전체 규칙 — 서버 값이 바뀌면(처음 받을 때 · 다른 개발자가 고쳤을 때 · 서버가 범위를 잘라 돌려줬을 때) 그 값을 쓴다.
  // 내가 고친 값은 입력이 멈춘 뒤 보낸다(위 devSettings와 같은 이유). 보낸 값과 서버 값을 같은 열쇠로 기억해, 서버가 그대로
  // 돌려준 값을 다시 보내거나 서버 값으로 치는 중인 칸을 덮지 않는다.
  const { eventDevConfig } = ws;
  const serverConfig = ws.eventDevStatus?.config ?? null;
  const serverConfigKey = serverConfig ? JSON.stringify(serverConfig) : null;
  const devConfigSent = useRef<string | null>(null);
  useEffect(() => {
    if (!serverConfig || serverConfigKey === null) return;
    devConfigSent.current = serverConfigKey;
    setDevConfig(serverConfig);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverConfigKey]);
  useEffect(() => {
    if (eventView !== 'devWait' || !devConfig) return;
    const key = JSON.stringify(devConfig);
    if (devConfigSent.current === key) return;
    const t = setTimeout(() => {
      devConfigSent.current = key;
      eventDevConfig(devConfig);
    }, 600);
    return () => clearTimeout(t);
  }, [devConfig, eventView, eventDevConfig]);

  // 암호가 틀렸으면 대기실이 아니라 입력 화면에 머문다.
  useEffect(() => {
    if (ws.eventError?.code === 'EVENT_AUTH' && eventView === 'devWait') {
      devStandbyWanted.current = false;
      clearDevSession();
      setEventView('devAuth');
    }
  }, [ws.eventError, eventView]);

  // 매칭되면 게임 화면이 "내 팀"을 알 수 있게 미리 적어 둔다 — 도전자는 A, 개발자는 B.
  useEffect(() => {
    if (ws.eventMatched) sessionStorage.setItem('cardBattle_team', ws.eventMatched.role === 'developer' ? 'B' : 'A');
  }, [ws.eventMatched]);

  // 서버가 확정한 닉네임(비워 두면 서버가 지어 준 이름)을 폼에도 반영하고 다음 재도전을 위해 기억한다.
  useEffect(() => {
    if (!ws.eventRegistered) return;
    setNickname(ws.eventRegistered.name);
    saveEventName(ws.eventRegistered.name);
  }, [ws.eventRegistered]);

  // 초대 링크(`/?room=ABCD`)로 들어온 경우 — 참가 폼을 열고 방 코드를 미리 채운다.
  // useSearchParams 대신 window.location을 읽는 이유: 이 페이지는 전부 클라이언트
  // 컴포넌트라 Suspense 경계를 추가로 두지 않아도 되고, 값이 필요한 시점도 마운트
  // 직후 한 번뿐이다.
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('room');
    if (!code) return;
    setJoinRoomId(code.trim().toUpperCase().slice(0, 4));
    setArrivedByInvite(true);
    setStage(s => (s === 'home' ? 'join' : s));
    // 주소창에서 쿼리를 지워, 나중에 새로고침하거나 방을 나갔을 때 다시 끌려가지 않게 한다.
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  // 방을 나오면(스스로 나가기·추방·방 사라짐) 로비 첫 화면으로 되돌린다.
  // 방에 들어가 있는 동안 stage는 그대로 두지만, 나왔을 때 직전에 쓰던 폼이 다시 열려
  // 있으면 방금 무슨 일이 일어난 건지 헷갈리므로 home에서 다시 시작하게 한다.
  const wasInRoom = useRef(false);
  useEffect(() => {
    if (ws.roomId) {
      wasInRoom.current = true;
    } else if (wasInRoom.current) {
      wasInRoom.current = false;
      setStage('home');
    }
  }, [ws.roomId]);

  // 게임 시작 감지 → 게임 화면으로 이동
  useEffect(() => {
    if (ws.gameState && ws.roomId) {
      router.push(`/room/${ws.roomId}`);
    }
  }, [ws.gameState, ws.roomId, router]);

  // 게임 화면은 내 팀을 sessionStorage에서 읽어온다(`cardBattle_team`). 방장이 나를 다른
  // 팀으로 옮겼거나 내가 대기실에서 팀을 바꿨다면 그 값도 함께 따라가야, 게임에 들어갔을 때
  // 엉뚱한 팀 시점으로 보이지 않는다.
  useEffect(() => {
    const meInLobby = ws.lobbyPlayers.find(p => p.memberId === ws.memberId);
    if (meInLobby) sessionStorage.setItem('cardBattle_team', meInLobby.team);
  }, [ws.lobbyPlayers, ws.memberId]);

  /** 뒤로가기 — 한 단계씩(create/join/event → multi → home). */
  const { eventDevStatus, eventQueue, eventDevLeave, eventCancel } = ws;
  const goBack = useCallback(() => {
    // 이벤트 폼을 떠나면 개발자 대기와 대기 줄도 함께 정리한다 — 화면에서 사라졌는데 서버에는 남아 있으면
    // 아무도 보지 않는 화면으로 도전자가 매칭된다.
    if (stage === 'event') {
      if (eventDevStatus || devStandbyWanted.current) {
        devStandbyWanted.current = false;
        clearDevSession();
        eventDevLeave();
      }
      if (eventQueue) eventCancel();
      setEventView('role');
    }
    setStage(s => (s === 'home' ? s : BACK_OF[s]));
  }, [stage, eventDevStatus, eventQueue, eventDevLeave, eventCancel]);

  // 이벤트 판은 대기실을 거치지 않는다 — 방에 들어간 순간(roomJoined/roomCreated) 곧바로 gameStart가 따라오므로
  // 그 사이 한 프레임이라도 빈 대기실이 그려지지 않게, 이벤트 단계에서는 대기실로 넘어가지 않는다.
  const inWaitingRoom = ws.roomId !== null && stage !== 'event';

  useEffect(() => {
    if (stage === 'home' || inWaitingRoom) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !showHowTo) goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage, inWaitingRoom, showHowTo, goBack]);

  // 닉네임을 비워두면 placeholder로 보여주던 무작위 이름을 그대로 쓴다 — 아무것도
  // 입력하지 않고 바로 시작하려는 사람이 가장 많은 흐름이라, 보이는 것과 실제로 들어가는
  // 이름이 어긋나지 않게 한다.
  const effectiveNickname = nickname.trim() || nicknameHint;
  const canSubmitName = effectiveNickname.length > 0;

  // 두 팀 이름이 같으면 게임 화면에서 어느 쪽이 우리 팀인지 구분할 방법이 사라진다
  // (서버도 startBlockReason에서 같은 조건을 막는다).
  const teamNamesClash =
    roomMode === 'team' && teamName.trim().length > 0 && teamName.trim() === otherTeamName.trim();

  const handleCreateRoom = () => {
    if (!canSubmitName || teamNamesClash) return;
    if (roomMode === 'individual') {
      // 개인전의 방장은 플레이어석에 앉는다(관전은 대기실에서 옮기면 된다). 팀 이름은 보내지 않는다.
      sessionStorage.setItem('cardBattle_team', 'player');
      ws.createRoom(effectiveNickname, 'player', undefined, settings, undefined, 'individual');
      return;
    }
    sessionStorage.setItem('cardBattle_team', team);
    ws.createRoom(
      effectiveNickname,
      team,
      teamName.trim() || undefined,
      settings,
      otherTeamName.trim() || undefined,
    );
  };

  const handleJoinRoom = () => {
    if (!canSubmitName || !joinRoomId.trim()) return;
    sessionStorage.setItem('cardBattle_team', team);
    ws.joinRoom(joinRoomId.trim().toUpperCase(), effectiveNickname, team);
  };

  const handleStartSolo = () => {
    if (!canSubmitName) return;
    sessionStorage.setItem('cardBattle_team', 'A');
    ws.createSoloRoom(effectiveNickname, teamName.trim() || undefined, settings);
  };

  // 혼자 놀기 → 강화 모드 — 자리·화면은 일반 모드 그대로(나 = A팀)이고 규칙만 강화 판이다. 팀 이름 칸은 없다(서버가 무작위로 붙인다).
  const handleStartEnhance = () => {
    if (!canSubmitName) return;
    sessionStorage.setItem('cardBattle_team', 'A');
    ws.createSoloRoom(effectiveNickname, undefined, enhanceSettings, true);
  };

  // ─ 이벤트 ─
  const handleEventView = (v: EventView) => {
    ws.clearEventError();
    setEventView(v);
  };

  const handleChallenge = () => {
    if (eventPin.length !== 4) return;
    // 도전자는 언제나 A팀이다(개발자를 이겨라의 개발자가 B팀). 보이는 이름(빈칸이면 placeholder)을 그대로 보낸다.
    sessionStorage.setItem('cardBattle_team', 'A');
    ws.eventChallenge(eventKind, effectiveNickname, eventPin);
  };

  const handleDevStandby = () => {
    if (!devToken) return;
    const name = devName.trim() || '개발자';
    saveDevSession({ name, token: devToken, settings: devSettings });
    sessionStorage.setItem('cardBattle_team', 'B');
    devStandbyWanted.current = true;
    devSettingsSent.current = JSON.stringify(devSettings);
    setEventView('devWait');
    ws.eventDevStandby(devToken, name, undefined, devSettings);
  };

  const handleDevLeave = () => {
    devStandbyWanted.current = false;
    clearDevSession();
    ws.eventDevLeave();
    setEventView('role');
  };

  const handleShowBoard = () => router.push('/events');

  // 준비 상태는 서버가 로비 목록(LobbyPlayer.ready)으로 알려주므로 화면이 따로
  // 기억하지 않는다 — 방장이 나를 다른 팀으로 옮기거나 방장 자리를 넘겨줘도 표시가
  // 어긋나지 않는다.
  const handleReady = (ready: boolean) => ws.sendReady(ready);

  if (!assetsReady) return <LoadingScreen onDone={handleAssetsReady} />;

  const blocked = !ws.connected;

  return (
    <div className="lobby-root">
      {/* 카드테이블 일러스트 — cover와 같은 기하로 배치되어, 안쪽 퍼센트 좌표가 곧 이미지 좌표가 된다 */}
      <div
        className="lobby-table"
        style={{ ['--lobby-table-bg' as string]: `url(${LOBBY_ASSETS.table})` }}
      >
        {/* 캐릭터·카드더미를 피한 테이블 중앙 — 콘텐츠는 전부 이 안에만 놓인다 */}
        <div className="lobby-safe" data-stage={inWaitingRoom ? 'waiting' : stage}>
          <div className="lobby-hero-slot">
            <LobbyHero onHowTo={() => setShowHowTo(true)} />
          </div>

          {/* 연결/에러/알림 배너 — 어느 단계에서든 로고 바로 아래 같은 자리에 뜬다 */}
          {blocked && (
            <p className="shrink-0 bg-yellow-100/95 border border-yellow-300 text-yellow-800 px-4 py-1.5 rounded-lg text-xs text-center">
              서버에 연결 중...
            </p>
          )}
          {ws.error && (
            <p className="shrink-0 bg-red-100/95 border border-red-300 text-red-700 px-4 py-1.5 rounded-lg text-xs text-center">
              {ws.error}
            </p>
          )}
          {/* 방에서 일어난 일(추방·방장 위임·방 사라짐 등) 안내 — 직접 닫을 수 있다 */}
          {ws.roomNotice && (
            <div className="shrink-0 bg-orange-50/95 border border-orange-200 text-orange-700 px-4 py-1.5 rounded-lg text-xs flex items-center justify-center gap-3">
              <span>{ws.roomNotice}</span>
              <button
                onClick={ws.clearRoomNotice}
                aria-label="알림 닫기"
                className="text-orange-400 hover:text-orange-600 font-bold shrink-0"
              >
                ✕
              </button>
            </div>
          )}

          {inWaitingRoom && ws.roomId ? (
            // 스크롤은 여기가 아니라 **액자 안쪽**에서 난다(WaitingRoom 참고) — 여기서
            // 스크롤하면 나무 액자까지 통째로 밀려 올라가 판이 화면 밖으로 나간다.
            <div className="flex-1 min-h-0 flex justify-center">
              <WaitingRoom
                roomId={ws.roomId}
                mode={ws.lobbyMode}
                players={ws.lobbyPlayers}
                teamNames={ws.lobbyTeamNames}
                settings={ws.lobbySettings}
                myMemberId={ws.memberId}
                hostMemberId={ws.hostMemberId}
                isHost={ws.isHost}
                chatLog={ws.chatLog}
                connected={ws.connected}
                onSendChat={ws.sendChat}
                onReady={handleReady}
                onStart={ws.startGame}
                onLeave={ws.leaveRoom}
                onMove={ws.movePlayer}
                onKick={ws.kickPlayer}
                onTransferHost={ws.transferHost}
                onRenameTeam={ws.setTeamName}
                onSelectColor={ws.selectColor}
                onUpdateSettings={ws.updateSettings}
              />
            </div>
          ) : (
            <>
              <LobbyStage
                stage={stage}
                blocked={blocked}
                onGo={setStage}
                roomMode={roomMode}
                onRoomMode={setRoomMode}
                nickname={nickname}
                onNickname={setNickname}
                nicknameHint={nicknameHint}
                canSubmitName={canSubmitName}
                team={team}
                onTeam={setTeam}
                spectatorSeat={spectatorSeat}
                teamName={teamName}
                onTeamName={setTeamName}
                otherTeamName={otherTeamName}
                onOtherTeamName={setOtherTeamName}
                teamNamesClash={teamNamesClash}
                roomCode={joinRoomId}
                onRoomCode={setJoinRoomId}
                arrivedByInvite={arrivedByInvite}
                settings={settings}
                onSettings={setSettings}
                enhanceSettings={enhanceSettings}
                onEnhanceSettings={setEnhanceSettings}
                onStartSolo={handleStartSolo}
                onStartEnhance={handleStartEnhance}
                onCreateRoom={handleCreateRoom}
                onJoinRoom={handleJoinRoom}
                event={{
                  view: eventView,
                  onView: handleEventView,
                  error: ws.eventError,
                  matched: ws.eventMatched,
                  onShowBoard: handleShowBoard,
                  nickname,
                  onNickname: v => { setNickname(v); if (ws.eventError?.code === 'NICKNAME_TAKEN') ws.clearEventError(); },
                  nicknameHint,
                  pin: eventPin,
                  onPin: v => { setEventPin(v); if (ws.eventError?.code === 'EVENT_PIN') ws.clearEventError(); },
                  kind: eventKind,
                  onKind: setEventKind,
                  onChallenge: handleChallenge,
                  queue: ws.eventQueue,
                  onCancelQueue: ws.eventCancel,
                  devName,
                  onDevName: setDevName,
                  devToken,
                  onDevToken: v => { setDevToken(v); if (ws.eventError?.code === 'EVENT_AUTH') ws.clearEventError(); },
                  onDevStandby: handleDevStandby,
                  devSettings,
                  onDevSettings: setDevSettings,
                  devStatus: ws.eventDevStatus,
                  devConfig: eventView === 'devWait' ? devConfig : null,
                  onDevConfig: setDevConfig,
                  onDevAway: ws.eventDevAway,
                  onDevLeave: handleDevLeave,
                }}
              />
              <BackButton hidden={stage === 'home'} onClick={goBack} />
            </>
          )}
        </div>
      </div>

      {showHowTo && <HowToPlayModal onClose={() => setShowHowTo(false)} />}

      {/* 설정 안내 — 배경이 어두운 펠트라 흰 글씨로 띄운다 */}
      <p className="fixed bottom-2 left-1/2 -translate-x-1/2 text-xs text-white/70 text-center
                    drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] pointer-events-none select-none">
        게임 중 글씨 크기/소리를 조절하려면 오른쪽 하단(⚙️)을 확인해 주세요.
      </p>

      {TABLE_IS_STANDIN && (
        <p
          className="fixed bottom-2 left-2 text-[0.6rem] text-white/45 select-none pointer-events-none"
          title="배경은 임시 스탠드인입니다 — client/public/lobby/README.md 참조"
        >
          BG STANDIN
        </p>
      )}
    </div>
  );
}
