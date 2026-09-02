import { WebSocketServer } from 'ws';
import { RoomManager } from './roomManager';
import { createConnectionHandler } from './gameServer';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const wss = new WebSocketServer({ port: PORT });
const roomManager = new RoomManager();

console.log(`카드배틀 WebSocket 서버 시작 — ws://localhost:${PORT}`);

wss.on('connection', createConnectionHandler(roomManager));
