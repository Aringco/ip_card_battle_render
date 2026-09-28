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

    /**
     * 이 연결이 새 방에 자리를 잡은 **뒤에** 부른다 — 옛 방에 남아 있던 자리를 정리한다.
     *
     * 게임 화면에서 뒤로가기로 로비에 온 뒤 방을 새로 만드는 흐름 때문에 필요하다.
     * 그때 이 연결은 (로비 화면의 자동 재접속으로) 여전히 옛 방의 일원인데, 정리하지
     * 않으면 끝나지 않은 혼자 놀기가 서버에 남고 클라이언트에는 새 방과 옛 게임 상태가
     * 한꺼번에 있게 된다 — 그 상태가 곧바로 게임 화면으로 튕겨 "방 XXXX를 찾을 수
     * 없습니다"가 되던 버그다.
     *
     * ⚠️ 반드시 **새 방 입장이 성공한 뒤에** 부를 것. 먼저 비웠다가 입장이 거절되면
     * (방 없음·정원 초과·닉네임 중복) 있던 방에서도 쫓겨난 꼴이 된다.
     */
    function detachFromPreviousRoom(nextRoomId: string) {
      if (!currentRoomId || !currentPlayerId) return;
      if (currentRoomId === nextRoomId) return;
      roomManager.getRoom(currentRoomId)?.detach(currentPlayerId);
    }

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
          detachFromPreviousRoom(roomId);
          currentRoomId = roomId;
          currentPlayerId = playerId;
          ws.send(JSON.stringify({ type: 'roomCreated', roomId, playerId, memberId: room.memberIdOf(playerId) }));
          break;
        }

        case 'createSoloRoom': {
          const { roomId, room } = roomManager.createRoom();
          const playerId = randomUUID();
          room.addSoloPlayer(ws, playerId, msg.nickname, msg.teamName, msg.settings);
          detachFromPreviousRoom(roomId);
          currentRoomId = roomId;
          currentPlayerId = playerId;
          ws.send(JSON.stringify({ type: 'roomCreated', roomId, playerId, memberId: room.memberIdOf(playerId) }));
          // ⚠️ 시작은 roomCreated를 보낸 **뒤**여야 한다 — 클라이언트는 방에 새로 들어온
          // 순간 옛 게임 상태를 비우므로, gameStart가 먼저 오면 그 비우기에 함께 지워진다.
          room.startSoloGame();
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
          detachFromPreviousRoom(msg.roomId);
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

        // 시연 모드의 [계속 ▶]. 시연 방이 아니면 Room이 조용히 무시한다.
        // (4장 결과 화면의 [4장으로 복귀]도 같은 메시지를 쓴다 — Room 주석 참고.)
        case 'demoContinue': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.handleDemoContinue(currentPlayerId);
          break;
        }

        // 시연 4장 — 볼 장면(강탈승·회복승·패배)을 골랐다.
        case 'demoScene': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.handleDemoScene(currentPlayerId, msg.key);
          break;
        }

        case 'pauseRequest': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.handlePauseRequest(currentPlayerId);
          break;
        }

        case 'pauseRespond': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.handlePauseRespond(currentPlayerId, msg.accept);
          break;
        }

        case 'resumeGame': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.handleResume(currentPlayerId);
          break;
        }

        // 항복하기/나가기 — 나가기(leave)는 방에서까지 빠지므로 이 연결의 방 정보도 비운다.
        // 그러지 않으면 연결이 끊길 때 이미 없는 자리를 한 번 더 정리하려 든다.
        case 'forfeit': {
          if (!currentRoomId || !currentPlayerId) return;
          roomManager.getRoom(currentRoomId)?.forfeit(currentPlayerId, msg.leave === true);
          if (msg.leave === true) {
            currentRoomId = null;
            currentPlayerId = null;
          }
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
