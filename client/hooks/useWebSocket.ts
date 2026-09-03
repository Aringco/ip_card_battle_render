'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Animal,
  ClientGameEvent,
  ClientGameState,
  ClientMessage,
  GameSettings,
  LobbyPlayer,
  Place,
  ServerMessage,
  Team,
} from 'shared';
import { DEFAULT_SETTINGS } from 'shared';

type LobbyTeamNames = Record<Team, string | null>;

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080';
const STORAGE_ROOM_ID = 'cardBattle_roomId';
const STORAGE_PLAYER_ID = 'cardBattle_playerId';

// localStorage는 같은 브라우저의 모든 탭이 공유해, 한 브라우저로 두 탭을 열어
// 1:1 테스트를 하면 두 탭이 서로의 방/플레이어 세션을 덮어써 버린다.
// sessionStorage는 탭 단위로 격리되어 있어 각 탭이 독립된 세션을 유지하면서도,
// 같은 탭 안에서의 페이지 이동(로비 → 게임 화면)에는 그대로 값이 남아 재접속에 쓸 수 있다.
const sessionStore = {
  get: (key: string) => (typeof window === 'undefined' ? null : window.sessionStorage.getItem(key)),
  set: (key: string, value: string) => window.sessionStorage.setItem(key, value),
  remove: (key: string) => window.sessionStorage.removeItem(key),
};

export interface UseWebSocketReturn {
  connected: boolean;
  roomId: string | null;
  playerId: string | null;
  lobbyPlayers: LobbyPlayer[];
  lobbyTeamNames: LobbyTeamNames;
  lobbySettings: GameSettings;
  gameState: ClientGameState | null;
  // 턴 제한시간이 끝나는 시각 — 내 브라우저 시계(Date.now()) 기준이다. 서버는 절대
  // 시각이 아니라 "직렬화 순간부터 남은 ms"(state.turnRemainingMs)를 보내오고, 그 값을
  // 받은 순간에 여기서 내 시계로 환산한다. 서버 시계 값을 그대로 쓰면 두 시계가 어긋난
  // 만큼 화면 카운트다운이 통째로 틀어지기 때문이다(엉뚱한 숫자에서 시작하거나, 0에
  // 멈춰 있는데도 턴은 계속 흐르는 증상).
  turnDeadline: number;
  lastEvents: ClientGameEvent[];
  error: string | null;
  createRoom: (nickname: string, team: Team, teamName?: string, settings?: Partial<GameSettings>) => void;
  joinRoom: (roomId: string, nickname: string, team: Team, teamName?: string) => void;
  createSoloRoom: (nickname: string, teamName?: string, settings?: Partial<GameSettings>) => void;
  sendReady: () => void;
  drawCard: (place: Place) => void;
  chooseSkill: (animal: Animal) => void;
  passSkill: () => void;
}

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [roomId, setRoomId] = useState<string | null>(null);
  // 재접속(로비 → 게임 화면 이동 등)은 서버가 playerId를 다시 보내주지 않고
  // 클라이언트가 sessionStorage에 저장해둔 값을 그대로 재사용한다. 훅이 새로
  // 마운트될 때(페이지 이동으로 새 useWebSocket 인스턴스가 생길 때)도 이 값을
  // 그대로 물려받아야 "지금 활성 플레이어가 나인지" 같은 판별이 끊기지 않는다.
  const [playerId, setPlayerId] = useState<string | null>(() => sessionStore.get(STORAGE_PLAYER_ID));
  const [lobbyPlayers, setLobbyPlayers] = useState<LobbyPlayer[]>([]);
  const [lobbyTeamNames, setLobbyTeamNames] = useState<LobbyTeamNames>({ A: null, B: null });
  const [lobbySettings, setLobbySettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [gameState, setGameState] = useState<ClientGameState | null>(null);
  const [turnDeadline, setTurnDeadline] = useState(0);
  const [lastEvents, setLastEvents] = useState<ClientGameEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 상태를 받은 "그 순간"을 기준으로 데드라인을 내 시계로 환산해둔다. 화면에 타이머가
  // 실제로 보이기 시작하는 건 연출이 끝난 뒤(수 초 뒤)라, 이 환산을 타이머 컴포넌트가
  // 마운트될 때 하면 그 사이 흘러간 시간이 통째로 사라져버린다 — 반드시 수신 시점에 한다.
  const applyState = useCallback((state: ClientGameState) => {
    setGameState(state);
    setTurnDeadline(state.turnRemainingMs > 0 ? Date.now() + state.turnRemainingMs : 0);
  }, []);

  const send = useCallback((msg: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);

      // 저장된 세션 정보로 자동 재접속 시도
      const savedRoomId = sessionStore.get(STORAGE_ROOM_ID);
      const savedPlayerId = sessionStore.get(STORAGE_PLAYER_ID);
      if (savedRoomId && savedPlayerId) {
        ws.send(JSON.stringify({ type: 'reconnect', roomId: savedRoomId, playerId: savedPlayerId }));
      }
    };

    ws.onclose = () => {
      setConnected(false);
    };

    ws.onerror = () => {
      setError('서버에 연결할 수 없습니다.');
    };

    ws.onmessage = (e: MessageEvent) => {
      const msg: ServerMessage = JSON.parse(e.data as string);

      switch (msg.type) {
        case 'roomCreated':
        case 'roomJoined':
          setRoomId(msg.roomId);
          setPlayerId(msg.playerId);
          sessionStore.set(STORAGE_ROOM_ID, msg.roomId);
          sessionStore.set(STORAGE_PLAYER_ID, msg.playerId);
          break;

        case 'lobbyState':
          setLobbyPlayers(msg.players);
          setLobbyTeamNames(msg.teamNames);
          setLobbySettings(msg.settings);
          break;

        case 'gameStart':
        case 'gameSnapshot':
          applyState(msg.state);
          setLobbyPlayers([]);
          break;

        case 'actionResult':
          setLastEvents(msg.events);
          applyState(msg.state);
          break;

        case 'error':
          if (msg.code === 'INVALID_RECONNECT' || msg.code === 'ROOM_NOT_FOUND') {
            // 재접속 실패(세션 무효 또는 방 소멸): 저장된 세션 정보를 지워서
            // 다음 접속부터는 죽은 방으로 재접속을 반복 시도하지 않게 한다.
            sessionStore.remove(STORAGE_ROOM_ID);
            sessionStore.remove(STORAGE_PLAYER_ID);
          }
          // "지금은 행동을 선택할 차례입니다" 류는 화면 전환 타이밍에 늦게 도착한
          // 클릭이 원인인 무해한 안내라, 화면 위에 빨간 배너로 띄울 필요가 없다
          // (버튼 자체가 이미 막혀 있어 사용자가 조치할 일도 없다).
          if (msg.code === 'NO_PENDING_CHOICE') break;
          setError(msg.message);
          break;
      }
    };

    return () => ws.close();
  }, [applyState]);

  const createRoom = useCallback((nickname: string, team: Team, teamName?: string, settings?: Partial<GameSettings>) => {
    setError(null);
    send({ type: 'createRoom', nickname, team, teamName, settings });
  }, [send]);

  const joinRoom = useCallback((rid: string, nickname: string, team: Team, teamName?: string) => {
    setError(null);
    send({ type: 'joinRoom', roomId: rid, nickname, team, teamName });
  }, [send]);

  const createSoloRoom = useCallback((nickname: string, teamName?: string, settings?: Partial<GameSettings>) => {
    setError(null);
    send({ type: 'createSoloRoom', nickname, teamName, settings });
  }, [send]);

  const sendReady = useCallback(() => send({ type: 'ready' }), [send]);

  const drawCard = useCallback((place: Place) => {
    send({ type: 'drawCard', place });
  }, [send]);

  const chooseSkill = useCallback((animal: Animal) => {
    send({ type: 'chooseSkill', animal });
  }, [send]);

  const passSkill = useCallback(() => send({ type: 'passSkill' }), [send]);

  return {
    connected, roomId, playerId,
    lobbyPlayers, lobbyTeamNames, lobbySettings, gameState, turnDeadline, lastEvents, error,
    createRoom, joinRoom, createSoloRoom, sendReady, drawCard, chooseSkill, passSkill,
  };
}
