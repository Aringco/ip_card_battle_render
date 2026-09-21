import type { WebSocket } from 'ws';
import { randomUUID } from 'crypto';
import type { ClientMessage } from 'shared';
import { RoomManager } from './roomManager';

// 독립 실행(server/index.ts, 로컬 개발용 8080 포트)과 통합 실행(루트 server.ts,
// Next.js와 같은 포트를 쓰는 배포용) 양쪽에서 동일한 WS 연결 처리 로직을 쓰기 위해
// WebSocketServer 생성과 분리해두었다.
export function createConnectionHandler(roomManager: RoomManager) {
  return (ws: WebSocket) => {
    let currentRoomId: string | null = null;
    let currentPlayerId: string | null = null;

    // ⚠️ 소켓의 'error'를 반드시 받아야 한다. EventEmitter는 'error' 리스너가 **하나도
    // 없으면 그 이벤트를 예외로 던지고**, 여기서 던져진 예외는 아무도 받지 않아
    // 프로세스를 끝낸다 — 상대가 연결을 거칠게 끊기만 해도 서버 전체가 내려간다.
    ws.on('error', (err) => {
      console.error('[ws] 소켓 오류 —', err);
    });

    ws.on('message', (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }

      try {
        handle(msg);
      } catch (err) {
        // ⚠️ **메시지 하나가 서버 전체를 끄지 못하게 한다.** 예전에는 JSON.parse만
        // 감싸고 그 뒤 분기는 무방비였다 — 필드가 빠진 메시지 한 통이
        // `teamPlayerIds[undefined].push(...)`로 터지면 그 예외가 ws의 이벤트
        // 콜백 밖으로 나가 프로세스를 끝냈고, **그 방뿐 아니라 서버에 붙어 있던
        // 모든 방이 함께 죽었다**(실제로 그렇게 죽여 봤다).
        // 배포 구성에서는 더 나쁘다 — 루트 server.ts가 Next.js와 한 프로세스를
        // 쓰므로 사이트 전체가 내려간다.
        // 보낸 사람에게만 알리고, 서버는 계속 돈다.
        console.error(`[ws] '${msg?.type}' 처리 중 예외 —`, err);
        try {
          ws.send(JSON.stringify({ type: 'error', code: 'INTERNAL', message: '요청을 처리하지 못했습니다.' }));
        } catch {
          // 이미 닫힌 소켓이면 보낼 곳이 없다 — 그것 때문에 또 죽으면 안 된다.
        }
      }
    });

    function handle(msg: ClientMessage) {
      switch (msg.type) {
        case 'createRoom': {
          const { roomId, room } = roomManager.createRoom();
          const playerId = randomUUID();
          const result = room.addPlayer(ws, playerId, msg.nickname, msg.team, msg.teamName, msg.settings, msg.otherTeamName);
          if (result !== 'ok') {
            ws.send(JSON.stringify({ type: 'error', code: 'ROOM_FULL', message: '방을 만들 수 없습니다.' }));
            return;
          }
          currentRoomId = roomId;
          currentPlayerId = playerId;
          ws.send(JSON.stringify({ type: 'roomCreated', roomId, playerId, memberId: room.memberIdOf(playerId) }));
          break;
        }

        case 'createSoloRoom': {
          const { roomId, room } = roomManager.createRoom();
          const playerId = randomUUID();
          room.addSoloPlayer(ws, playerId, msg.nickname, msg.teamName, msg.settings);
          currentRoomId = roomId;
          currentPlayerId = playerId;
          ws.send(JSON.stringify({ type: 'roomCreated', roomId, playerId, memberId: room.memberIdOf(playerId) }));
          break;
        }

        case 'joinRoom': {
          const room = roomManager.getRoom(msg.roomId);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', code: 'ROOM_NOT_FOUND', message: `방 ${msg.roomId}을 찾을 수 없습니다.` }));
            return;
          }
          const playerId = randomUUID();
          const result = room.addPlayer(ws, playerId, msg.nickname, msg.team, msg.teamName);
          if (result === 'game_started') {
            ws.send(JSON.stringify({ type: 'error', code: 'GAME_ALREADY_STARTED', message: '이미 게임이 시작된 방입니다.' }));
            return;
          }
          if (result === 'nickname_taken') {
            ws.send(JSON.stringify({ type: 'error', code: 'NICKNAME_TAKEN', message: '이미 사용 중인 닉네임입니다.' }));
            return;
          }
          currentRoomId = msg.roomId;
          currentPlayerId = playerId;
          ws.send(JSON.stringify({ type: 'roomJoined', roomId: msg.roomId, playerId, memberId: room.memberIdOf(playerId) }));
          break;
        }

        case 'ready': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.setReady(currentPlayerId, msg.ready ?? true);
          break;
        }

        case 'leaveRoom': {
          if (!currentRoomId || !currentPlayerId) return;
          // 실제로 방에서 빠졌을 때만 연결의 방 정보를 지운다 — 게임이 이미 시작된 방은
          // 나가기가 거부되는데, 그때도 지워버리면 이후 조작이 전부 무시된다.
          const left = roomManager.getRoom(currentRoomId)?.leaveRoom(currentPlayerId) ?? false;
          if (left) {
            currentRoomId = null;
            currentPlayerId = null;
          }
          break;
        }

        case 'movePlayer': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.movePlayer(currentPlayerId, msg.targetMemberId, msg.team);
          break;
        }

        case 'kickPlayer': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.kickPlayer(currentPlayerId, msg.targetMemberId);
          break;
        }

        case 'transferHost': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.transferHost(currentPlayerId, msg.targetMemberId);
          break;
        }

        case 'setTeamName': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.setTeamName(currentPlayerId, msg.team, msg.name);
          break;
        }

        case 'updateSettings': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.updateSettings(currentPlayerId, msg.settings);
          break;
        }

        case 'startGame': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.startGame(currentPlayerId);
          break;
        }

        case 'chat': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.handleChat(currentPlayerId, msg.text);
          break;
        }

        case 'drawCard': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.handleDrawCard(currentPlayerId, msg.place);
          break;
        }

        case 'chooseSkill': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.handleChooseSkill(currentPlayerId, msg.animal);
          break;
        }

        case 'passSkill': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.handlePassSkill(currentPlayerId);
          break;
        }

        case 'reconnect': {
          const room = roomManager.getRoom(msg.roomId);
          if (!room) {
            ws.send(JSON.stringify({ type: 'error', code: 'ROOM_NOT_FOUND', message: `방 ${msg.roomId}을 찾을 수 없습니다.` }));
            return;
          }
          const ok = room.handleReconnect(ws, msg.playerId);
          if (!ok) {
            ws.send(JSON.stringify({ type: 'error', code: 'INVALID_RECONNECT', message: '재접속 정보가 유효하지 않습니다.' }));
            return;
          }
          currentRoomId = msg.roomId;
          currentPlayerId = msg.playerId;
          break;
        }
      }
    }

    ws.on('close', () => {
      if (currentRoomId && currentPlayerId) {
        roomManager.getRoom(currentRoomId)?.handleDisconnect(currentPlayerId, ws);
      }
    });
  };
}
