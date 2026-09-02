// ─────────────────────────────────────────────────────────────
// 배포(Docker/Render)용 통합 서버 — Next.js와 WebSocket 게임 서버를
// 같은 HTTP 서버·같은 포트($PORT)에 함께 띄운다.
//
// 로컬 개발 시에는 이 파일을 쓰지 않는다 — CLAUDE.md에 문서화된 대로
// `cd server && npm run dev`(8080) + `cd client && npm run dev`(3000)를
// 각각 별도 터미널로 띄우는 방식을 그대로 쓴다. Render처럼 서비스당
// 포트를 하나만 외부로 노출하는 플랫폼에 배포할 때만 이 파일로 실행한다.
//
// 실행: npx ts-node --transpile-only server.ts   (또는 npm run start)
// ─────────────────────────────────────────────────────────────

import { createServer } from 'http';
import next from 'next';
import { WebSocketServer } from 'ws';
import { RoomManager } from './server/roomManager';
import { createConnectionHandler } from './server/gameServer';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, dir: './client' });
const handle = app.getRequestHandler();
const roomManager = new RoomManager();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  // 클라이언트는 NEXT_PUBLIC_WS_URL을 ws(s)://<host>/ws 형태로 잡아 이 경로로 붙는다.
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', createConnectionHandler(roomManager));

  httpServer.listen(port, () => {
    console.log(`카드배틀 통합 서버 시작 — http://localhost:${port} (WS: /ws)`);
  });
});
