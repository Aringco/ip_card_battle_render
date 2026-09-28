import { WebSocketServer } from 'ws';
import { RoomManager } from './roomManager';
import { createConnectionHandler } from './gameServer';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const wss = new WebSocketServer({ port: PORT });
const roomManager = new RoomManager();

// ⚠️ 이 리스너가 없으면 포트가 이미 쓰이고 있을 때 서버가 **스택 트레이스만 뱉고
// 죽는다.** 화면에서는 "연결 안 됨"으로만 보여서, 포트가 겹쳤다는 사실이 드러나지
// 않는다(실제로 그 자리에서 한참 헤맸다). 무엇을 해야 하는지까지 적어 준다.
wss.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `\n포트 ${PORT}을 이미 다른 프로그램이 쓰고 있습니다.\n` +
        `  · 남아 있는 서버를 끄거나\n` +
        `  · PORT=8088 npm run dev 처럼 다른 포트로 띄우세요.\n` +
        `    (그 경우 클라이언트에도 같은 포트를 알려야 합니다 —\n` +
        `     client/.env.local에 NEXT_PUBLIC_WS_URL=ws://localhost:8088)\n`,
    );
  } else {
    console.error('WebSocket 서버 오류 —', err);
  }
  process.exit(1);
});

// ⚠️ `listening`을 기다렸다 찍는다. 그냥 찍으면 포트가 겹쳐 실패하는 경우에도
// "서버 시작"이 먼저 나와, 곧바로 이어지는 실패 안내와 모순된 화면이 된다.
wss.on('listening', () => {
  console.log(`카드배틀 WebSocket 서버 시작 — ws://localhost:${PORT}`);
});

wss.on('connection', createConnectionHandler(roomManager));
