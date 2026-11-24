// ─────────────────────────────────────────────────────────────
// 배포(Docker · 테스트 서버)용 통합 서버 — Next.js와 WebSocket 게임 서버를
// 같은 HTTP 서버·같은 포트($PORT)에 함께 띄운다.
//
// 로컬 개발 시에는 이 파일을 쓰지 않는다 — CLAUDE.md에 문서화된 대로
// `cd server && npm run dev`(8080) + `cd client && npm run dev`(3000)를
// 각각 별도 터미널로 띄우는 방식을 그대로 쓴다. 배포 서버는 포트 하나만
// 외부로 공개하므로(nginx 뒤) 배포할 때만 이 파일로 실행한다.
//
// 실행: npx ts-node --transpile-only server.ts   (또는 npm run start)
// ─────────────────────────────────────────────────────────────

import { execSync } from 'child_process';
import { createServer } from 'http';
import next from 'next';
import { WebSocketServer } from 'ws';
import { RoomManager } from './server/roomManager';
import { createConnectionHandler } from './server/gameServer';
import { startBotPoolIfEnabled } from './server/ai/pool';

const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev, dir: './client' });
const handle = app.getRequestHandler();
const roomManager = new RoomManager();

/**
 * 지금 떠 있는 서버가 어느 커밋인지 — `/version`이 돌려준다(배포 확인용).
 * Docker 이미지에는 .git이 없으므로(.dockerignore) 빌드할 때 GIT_COMMIT으로 받는다(deploy/deploy.sh가 넘긴다).
 * 저장소 폴더에서 바로 띄운 경우(pm2 · systemd)는 그 자리의 git에 묻는다. 둘 다 없으면 'unknown'.
 */
function resolveCommit(): string {
  if (process.env.GIT_COMMIT) return process.env.GIT_COMMIT;
  try {
    return execSync('git rev-parse HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return 'unknown';
  }
}
const VERSION = JSON.stringify({ commit: resolveCommit(), startedAt: new Date().toISOString() });

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    if (req.url === '/version' || req.url?.startsWith('/version?')) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(VERSION);
      return;
    }
    handle(req, res);
  });

  // 클라이언트는 NEXT_PUBLIC_WS_URL을 ws(s)://<host>/ws 형태로 잡아 이 경로로 붙는다.
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wss.on('connection', createConnectionHandler(roomManager));
  startBotPoolIfEnabled();

  httpServer.listen(port, () => {
    console.log(`카드배틀 통합 서버 시작 — http://localhost:${port} (WS: /ws)`);
  });
});
