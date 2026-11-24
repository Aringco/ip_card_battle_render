/**
 * 부하 시험 — 실제로 떠 있는 WS 서버에 혼자 놀기 방을 N개 동시에 열고, 사람 쪽을 자동으로 둔다(컴퓨터 쪽은 서버가 둔다).
 * 서버가 바쁘면 가장 먼저 "내가 둔 수의 결과가 늦게 온다"로 드러나므로, 사람 쪽 수마다 보낸 순간부터 결과(actionResult)가
 * 올 때까지를 잰다 — 메인 스레드가 막히면(탐색을 worker 밖에서 돌리는 등) 이 값이 곧바로 튄다.
 * 서버 쪽 숫자(봇 풀 · 이벤트 루프 지연)는 서버를 AI_STATS_SEC=10으로 띄워 그 로그에서 본다.
 *
 * 실행(서버를 먼저 띄운다 — 개발 중인 8080 서버를 건드리지 않게 다른 포트로):
 *   cd server && AI_BOT=on AI_STATS_SEC=10 PORT=8091 npx ts-node --transpile-only index.ts
 *   cd server && npx ts-node --transpile-only scripts/aiLoadTest.ts --url ws://localhost:8091 --rooms 30 --duration 120
 *
 * 옵션
 *   --url ws://…        대상 서버(기본 ws://localhost:8091) — 배포 서버면 wss://test.tupd.site/ws
 *   --rooms N           동시 방 수(기본 20)
 *   --ramp 초           방을 이 시간에 걸쳐 나눠 연다(기본 10)
 *   --duration 초       시험 시간(기본 90)
 *   --normal            일반 판(기본은 카드 강화)
 *   --think 최소-최대ms  사람 쪽이 두기 전 기다리는 시간(기본 1500-3000 — 연출을 보는 사람 흉내)
 *   --bots N            혼자 놀기 대기실(봇 방, 개인전)로 연다 — 봇 N개(기본 0 = 옛 혼자 놀기: 팀전 컴퓨터 하나)
 *   --level easy|normal|hard  봇 방의 봇 난이도(기본 hard — 탐색 봇 worker를 쓴다)
 */
import WebSocket from 'ws';
import { PLACES, ANIMALS } from 'shared';
import type { BotLevel, ClientGameState, ServerMessage } from 'shared';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}
const URL_ = arg('url', 'ws://localhost:8091');
const ROOMS = Number(arg('rooms', '20'));
const RAMP_SEC = Number(arg('ramp', '10'));
const DURATION_SEC = Number(arg('duration', '90'));
const ENHANCE = !process.argv.includes('--normal');
const [THINK_MIN, THINK_MAX] = arg('think', '1500-3000').split('-').map(Number);
const BOTS = Number(arg('bots', '0'));
const LEVEL = arg('level', 'hard') as BotLevel;

const stats = {
  connected: 0, gamesStarted: 0, gamesEnded: 0, sent: 0, results: 0, cpuMoves: 0, errors: 0, disconnects: 0,
  latencies: [] as number[],
  windowLat: [] as number[],
};

function pct(arr: number[], p: number): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
}

class Bot {
  private ws: WebSocket;
  private state: ClientGameState | null = null;
  private sentAt = 0;           // 0이면 결과를 기다리는 수가 없다
  private actTimer: ReturnType<typeof setTimeout> | null = null;
  private triedSkill = false;
  private playerId = '';
  private lobbyReady = false;
  closed = false;

  constructor(private idx: number) {
    this.ws = new WebSocket(URL_);
    this.ws.on('open', () => { stats.connected++; this.newGame(); });
    this.ws.on('message', raw => this.onMessage(JSON.parse(String(raw)) as ServerMessage));
    this.ws.on('close', () => { if (!this.closed) stats.disconnects++; this.closed = true; });
    this.ws.on('error', () => { stats.errors++; });
  }

  private send(msg: object) {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private newGame() {
    this.state = null;
    this.lobbyReady = false;
    this.send({ type: 'createSoloRoom', nickname: `부하${this.idx}`, enhance: ENHANCE, ...(BOTS > 0 ? { lobby: true } : {}) });
  }

  private onMessage(msg: ServerMessage) {
    if (msg.type === 'roomCreated') { this.playerId = msg.playerId; return; }
    // 봇 방 — 대기실에 봇 하나(보통)가 이미 있다. 난이도를 맞추고 모자란 만큼 넣은 뒤 시작한다
    if (msg.type === 'lobbyState' && msg.solo && !this.lobbyReady) {
      const bots = msg.players.filter(p => p.bot);
      for (const b of bots) if (b.bot !== LEVEL) this.send({ type: 'setBotLevel', targetMemberId: b.memberId, level: LEVEL });
      if (bots.length < BOTS) { this.send({ type: 'addBot', level: LEVEL }); return; }
      this.lobbyReady = true;
      this.send({ type: 'startGame' });
      return;
    }
    if (msg.type === 'gameStart' || msg.type === 'gameSnapshot' || msg.type === 'actionResult' || msg.type === 'pauseState') {
      if (msg.type === 'gameStart') stats.gamesStarted++;
      if (msg.type === 'actionResult') {
        if (this.sentAt) {
          const ms = Date.now() - this.sentAt;
          stats.latencies.push(ms);
          stats.windowLat.push(ms);
          stats.results++;
          this.sentAt = 0;
        } else stats.cpuMoves++;
      }
      const wasPlaying = this.state?.phase === 'playing';
      this.state = msg.state;
      if (this.state.phase === 'ended') {
        if (wasPlaying || msg.type === 'actionResult') stats.gamesEnded++;
        if (!this.closed) setTimeout(() => this.newGame(), 1000);
        return;
      }
      this.maybeAct();
    } else if (msg.type === 'error') {
      // 쓸 수 없는 기술을 골랐다 등 — 결과 대기를 풀고 턴을 넘긴다
      this.sentAt = 0;
      if (this.state && this.state.pendingChoice === this.mySide(this.state)) this.act(() => this.send({ type: 'passSkill' }));
    }
  }

  /** 내 편 — 팀전(옛 혼자 놀기)은 A, 봇 방(개인전)은 memberIds에서 내 playerId가 든 편 */
  private mySide(s: ClientGameState): string {
    return Object.entries(s.memberIds).find(([, ids]) => ids.includes(this.playerId))?.[0] ?? 'A';
  }

  private maybeAct() {
    const s = this.state;
    if (!s || s.phase !== 'playing' || s.paused || this.sentAt || this.actTimer) return;
    const me = this.mySide(s);
    if (s.teams[me]?.finish) return; // 순위가 정해졌다 — 봇들끼리 끝날 때까지 지켜본다
    const offer = s.enhance?.acorn?.offer;
    if (offer && offer.picked && me in offer.picked && offer.picked[me] === null) {
      const id = offer.options[me]?.[0];
      if (id) this.schedule(() => this.act(() => this.send({ type: 'pickAcorn', id })));
      return;
    }
    if (offer) return;   // 내가 골랐고 컴퓨터를 기다린다
    if (s.pendingChoice === me) {
      this.schedule(() => {
        // 반은 기술을 써 본다(못 쓰면 서버가 error → 턴 마치기), 반은 그냥 턴 마치기
        if (!this.triedSkill && Math.random() < 0.5) {
          this.triedSkill = true;
          const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
          // 개인전 특허랑이 등은 대상이 필요하다 — 남은 아무나(틀리면 서버가 error → 턴 마치기)
          const foes = Object.keys(s.teams).filter(k => k !== me && !s.teams[k].finish);
          const target = foes[Math.floor(Math.random() * foes.length)];
          this.act(() => this.send({ type: 'chooseSkill', animal, ...(target ? { target } : {}) }));
        } else {
          this.act(() => this.send({ type: 'passSkill' }));
        }
      });
      return;
    }
    if (s.pendingChoice === null && s.activeTeam === me) {
      this.triedSkill = false;
      const options = PLACES.filter(p => p !== s.lastPlace);
      const place = options[Math.floor(Math.random() * options.length)];
      this.schedule(() => this.act(() => this.send({ type: 'drawCard', place })));
    }
  }

  private schedule(fn: () => void) {
    const wait = THINK_MIN + Math.random() * Math.max(0, THINK_MAX - THINK_MIN);
    this.actTimer = setTimeout(() => { this.actTimer = null; fn(); }, wait);
  }

  private act(fn: () => void) {
    this.sentAt = Date.now();
    stats.sent++;
    fn();
  }

  close() {
    this.closed = true;
    if (this.actTimer) clearTimeout(this.actTimer);
    this.ws.close();
  }
}

const bots: Bot[] = [];
const t0 = Date.now();
console.log(`부하 시험 — ${URL_} · 방 ${ROOMS} · ${BOTS > 0 ? `봇 방(${LEVEL} 봇 ${BOTS}) · ` : ''}${ENHANCE ? '카드 강화' : '일반'} · ${DURATION_SEC}초 (사람 쪽 생각 ${THINK_MIN}-${THINK_MAX}ms)`);
for (let i = 0; i < ROOMS; i++) {
  setTimeout(() => bots.push(new Bot(i + 1)), (RAMP_SEC * 1000 * i) / Math.max(1, ROOMS));
}

const report = setInterval(() => {
  const w = stats.windowLat;
  console.log(
    `[${Math.round((Date.now() - t0) / 1000)}s] 연결 ${stats.connected} · 판 시작 ${stats.gamesStarted} · 끝 ${stats.gamesEnded}` +
    ` · 내 수 ${stats.results} · 컴퓨터 수 ${stats.cpuMoves} | 이번 10초 응답 p50 ${pct(w, 0.5)} · p95 ${pct(w, 0.95)} · 최대 ${w.length ? Math.max(...w) : 0}ms` +
    ` | 오류 ${stats.errors} · 끊김 ${stats.disconnects}`,
  );
  stats.windowLat = [];
}, 10_000);

setTimeout(() => {
  clearInterval(report);
  for (const b of bots) b.close();
  const l = stats.latencies;
  const sec = (Date.now() - t0) / 1000;
  console.log('─'.repeat(60));
  console.log(`결과 — ${sec.toFixed(0)}초 · 방 ${ROOMS}`);
  console.log(`  판: 시작 ${stats.gamesStarted} · 끝 ${stats.gamesEnded}`);
  console.log(`  수: 사람 쪽 ${stats.results} · 컴퓨터 ${stats.cpuMoves} (컴퓨터 ${(stats.cpuMoves / sec).toFixed(1)}수/초)`);
  console.log(`  사람 쪽 수의 응답: p50 ${pct(l, 0.5)} · p95 ${pct(l, 0.95)} · p99 ${pct(l, 0.99)} · 최대 ${l.length ? Math.max(...l) : 0}ms`);
  console.log(`  오류 ${stats.errors} · 끊김 ${stats.disconnects}`);
  console.log('  판정: 응답 p99가 100ms 아래면 메인 스레드가 막히지 않은 것이다. 봇 쪽 숫자는 서버 로그의 [ai] 줄을 본다.');
  setTimeout(() => process.exit(0), 500);
}, DURATION_SEC * 1000);
