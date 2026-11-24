/**
 * 탐색 봇 worker 풀 — 서버가 느리거나 바쁠 때도 게임이 느려지지 않게 하는 대비책이 모두 여기 있다(docs/AI_ROADMAP.md 3단계).
 *
 *   1. 계산은 worker에서만 — 메인 스레드(모든 방의 메시지 · 타이머)는 막지 않는다.
 *   2. worker 수 상한 — 기본 min(2, 코어 − 2). 같은 기계의 운영 컨테이너 · Next · nginx 몫을 남긴다.
 *   3. 바쁘면 예산을 줄인다 — 밀린 일이 worker 수보다 많으면 그 비율만큼 생각 시간을 줄이고(최소 AI_MIN_BUDGET_MS),
 *      더 밀리면(worker당 AI_QUEUE_PER_WORKER개 초과) 아예 받지 않는다 → 부르는 쪽이 지금의 컴퓨터 방식으로 둔다.
 *   4. 마감 — 부르는 쪽이 정한 시각(컴퓨터가 "생각하는 척" 기다리는 시간)이 지나면 답을 버린다. worker가 멎으면 갈아 끼운다.
 *
 * 켜고 끄기는 환경변수다(기본 off — main에 합쳐도 지금 컴퓨터 그대로다).
 *   AI_BOT=off | shadow | on   shadow는 계산만 하고 쓰지 않는다(기존 컴퓨터와 몇 번 같은 수를 골랐는지만 센다)
 *   AI_WORKERS        worker 수(기본 min(2, 코어 − 2)) — ⚠️ 컨테이너 --cpus 상한은 코어 수에 안 보이니 그때는 직접 정한다
 *   AI_BUDGET_MS      한 수 생각 시간(기본 300)
 *   AI_MIN_BUDGET_MS  바쁠 때 줄여도 이 아래로는 안 내린다(기본 60)
 *   AI_QUEUE_PER_WORKER  worker 하나에 밀려 있을 수 있는 일(기본 4)
 *   AI_DEPTH_TURNS    롤아웃이 내다보는 턴 수(기본 12)
 *   AI_STATS_SEC      n초마다 통계 한 줄을 로그로(기본 0 = 안 찍음)
 */
import { Worker } from 'worker_threads';
import { monitorEventLoopDelay } from 'perf_hooks';
import os from 'os';
import path from 'path';
import type { GameState, SideId } from 'shared';
import type { BotDecision } from './searchBot';
import type { WorkerJob, WorkerReply } from './worker';

export type AiMode = 'off' | 'shadow' | 'on';

function envInt(name: string, fallback: number, min = 0): number {
  const v = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(v) && v >= min ? v : fallback;
}

export function aiMode(): AiMode {
  const v = (process.env.AI_BOT ?? '').trim().toLowerCase();
  return v === 'on' || v === 'shadow' ? v : 'off';
}

export interface PoolConfig {
  workers: number;
  budgetMs: number;
  minBudgetMs: number;
  queuePerWorker: number;
  depthTurns: number;
}

export function configFromEnv(): PoolConfig {
  const cores = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  return {
    workers: envInt('AI_WORKERS', Math.max(1, Math.min(2, cores - 2)), 1),
    budgetMs: envInt('AI_BUDGET_MS', 300, 1),
    minBudgetMs: envInt('AI_MIN_BUDGET_MS', 60, 1),
    queuePerWorker: envInt('AI_QUEUE_PER_WORKER', 4, 1),
    depthTurns: envInt('AI_DEPTH_TURNS', 12, 1),
  };
}

/** 부르는 쪽(방)이 결과를 어떻게 썼는지 — 통계에만 쓴다 */
export type UseNote = 'used' | 'notReady' | 'illegal' | 'shadowSame' | 'shadowDiff';

interface Job {
  id: number;
  state: GameState;
  side: SideId;
  deadline: number;
  enqueuedAt: number;
  resolve: (d: BotDecision | null) => void;
  timer?: ReturnType<typeof setTimeout>;
  settled?: boolean;
}

interface Slot { worker: Worker; job: Job | null; startedAt: number }

const MARGIN_MS = 80;          // 답이 돌아와 방이 쓰기까지의 여유
const HANG_EXTRA_MS = 2000;    // 예산보다 이만큼 더 걸리면 worker가 멎었다고 보고 갈아 끼운다
const LATENCY_KEEP = 2000;

export class BotPool {
  readonly config: PoolConfig;
  private slots: Slot[] = [];
  private queue: Job[] = [];
  private nextId = 1;
  private started = false;
  private closed = false;
  private loopDelay = monitorEventLoopDelay({ resolution: 10 });
  private statsTimer: ReturnType<typeof setInterval> | null = null;
  private counters = {
    requested: 0, done: 0, shedBusy: 0, late: 0, timeouts: 0, errors: 0, respawns: 0,
    rollouts: 0, budgetSum: 0, reducedBudget: 0,
    used: 0, notReady: 0, illegal: 0, shadowSame: 0, shadowDiff: 0,
  };
  private latencies: number[] = [];   // 요청부터 답까지(ms) — 줄에서 기다린 시간 포함

  constructor(config: PoolConfig = configFromEnv()) {
    this.config = config;
  }

  /** worker를 미리 띄운다 — ts-node로 TS를 읽느라 하나에 1초쯤 걸려, 처음 묻는 수가 그 시간에 걸리면 기존 방식으로 둔다 */
  warmUp(): void {
    this.start();
  }

  private start(): void {
    if (this.started || this.closed) return;
    this.started = true;
    for (let i = 0; i < this.config.workers; i++) this.slots.push(this.spawn());
    this.loopDelay.enable();
    const sec = envInt('AI_STATS_SEC', 0);
    if (sec > 0) {
      this.statsTimer = setInterval(() => console.log(`[ai] ${formatStats(this.stats())}`), sec * 1000);
      this.statsTimer.unref();
    }
  }

  private spawn(): Slot {
    const isTs = __filename.endsWith('.ts');
    const file = path.join(__dirname, isTs ? 'worker.ts' : 'worker.js');
    let worker: Worker;
    if (isTs) {
      // 배포 이미지도 서버를 ts-node로 띄운다(Dockerfile.nginx의 start.sh) — worker도 같은 방식으로 TS를 읽게 한다
      const tsNode = require.resolve('ts-node', { paths: [__dirname] });
      const project = path.join(__dirname, '..', 'tsconfig.json');
      const code = `require(${JSON.stringify(tsNode)}).register({ transpileOnly: true, project: ${JSON.stringify(project)} });` +
        `require(${JSON.stringify(file)});`;
      worker = new Worker(code, { eval: true });
    } else {
      worker = new Worker(file);
    }
    worker.unref();
    const slot: Slot = { worker, job: null, startedAt: 0 };
    worker.on('message', (reply: WorkerReply) => this.onReply(slot, reply));
    worker.on('error', err => {
      console.error('[ai] worker 오류 —', err);
      this.replace(slot, 'error');
    });
    worker.on('exit', code => {
      if (!this.closed && this.slots.includes(slot)) this.replace(slot, code === 0 ? 'exit' : 'error');
    });
    return slot;
  }

  /** 멎거나 죽은 worker를 새로 띄우고, 맡고 있던 일은 "답 없음"으로 끝낸다 */
  private replace(slot: Slot, why: 'error' | 'exit' | 'hang'): void {
    const idx = this.slots.indexOf(slot);
    if (idx < 0 || this.closed) return;
    if (slot.job) { this.finish(slot.job, null); slot.job = null; }
    if (why === 'error') this.counters.errors++;
    this.counters.respawns++;
    this.slots[idx] = this.spawn();
    void slot.worker.terminate().catch(() => {});
    this.pump();
  }

  /**
   * 이 상태에서 side가 둘 수를 묻는다. maxWaitMs 안에 답을 못 주면 null(부르는 쪽이 기존 방식으로 둔다).
   * state는 worker로 보낼 때 복사되므로(postMessage) 부르는 쪽이 곧바로 고쳐도 된다.
   */
  decide(state: GameState, side: SideId, maxWaitMs: number): Promise<BotDecision | null> {
    this.start();
    this.counters.requested++;
    const inFlight = this.queue.length + this.slots.filter(s => s.job).length;
    if (this.closed || inFlight >= this.config.workers * this.config.queuePerWorker) {
      this.counters.shedBusy++;
      return Promise.resolve(null);
    }
    const now = Date.now();
    return new Promise(resolve => {
      const job: Job = { id: this.nextId++, state, side, deadline: now + maxWaitMs, enqueuedAt: now, resolve };
      // 마감이 지나도 답이 없으면 버린다(worker가 늦게 답하면 onReply가 무시한다)
      job.timer = setTimeout(() => { this.counters.timeouts++; this.finish(job, null); }, maxWaitMs + 50);
      this.queue.push(job);
      this.pump();
    });
  }

  private pump(): void {
    for (const slot of this.slots) {
      if (slot.job) continue;
      let job: Job | undefined;
      while ((job = this.queue.shift())) {
        if (job.settled) continue;   // 줄에서 기다리다 마감이 지났다
        const left = job.deadline - Date.now() - MARGIN_MS;
        // 바쁘면 예산을 줄인다 — 밀린 일이 worker 수를 넘으면 그 비율만큼
        const backlog = this.queue.length + this.slots.filter(s => s.job).length + 1;
        let budget = this.config.budgetMs;
        if (backlog > this.config.workers) {
          budget = Math.max(this.config.minBudgetMs, Math.floor(budget * this.config.workers / backlog));
          this.counters.reducedBudget++;
        }
        budget = Math.min(budget, left);
        if (budget < this.config.minBudgetMs) { this.counters.late++; this.finish(job, null); continue; }
        slot.job = job;
        slot.startedAt = Date.now();
        this.counters.budgetSum += budget;
        const msg: WorkerJob = { id: job.id, state: job.state, side: job.side, budgetMs: budget, depthTurns: this.config.depthTurns };
        slot.worker.postMessage(msg);
        // 멎은 worker 감시
        const watched = job;
        setTimeout(() => { if (slot.job === watched && this.slots.includes(slot)) this.replace(slot, 'hang'); }, budget + HANG_EXTRA_MS).unref();
        break;
      }
      if (!job) break;
    }
  }

  private onReply(slot: Slot, reply: WorkerReply): void {
    const job = slot.job;
    slot.job = null;
    if (job && job.id === reply.id && !job.settled) {
      if (reply.ok) {
        this.counters.done++;
        this.counters.rollouts += reply.rollouts;
        this.finish(job, reply.decision);
      } else {
        this.counters.errors++;
        console.error('[ai] 탐색 실패 —', reply.error);
        this.finish(job, null);
      }
    }
    this.pump();
  }

  private finish(job: Job, decision: BotDecision | null): void {
    if (job.settled) return;
    job.settled = true;
    if (job.timer) { clearTimeout(job.timer); job.timer = undefined; }
    const resolve = job.resolve;
    if (decision !== null) {
      this.latencies.push(Date.now() - job.enqueuedAt);
      if (this.latencies.length > LATENCY_KEEP) this.latencies.splice(0, this.latencies.length - LATENCY_KEEP);
    }
    resolve(decision);
  }

  note(kind: UseNote): void {
    this.counters[kind]++;
  }

  stats() {
    const lat = [...this.latencies].sort((a, b) => a - b);
    const q = (p: number) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] : 0);
    const c = this.counters;
    return {
      ...c,
      workers: this.config.workers,
      queued: this.queue.length,
      busy: this.slots.filter(s => s.job).length,
      avgRollouts: c.done ? Math.round(c.rollouts / c.done) : 0,
      avgBudgetMs: c.done ? Math.round(c.budgetSum / Math.max(1, c.done + c.errors)) : 0,
      latencyP50: q(0.5), latencyP95: q(0.95), latencyMax: lat.length ? lat[lat.length - 1] : 0,
      loopDelayP99Ms: Math.round(this.loopDelay.percentile(99) / 1e6),
      loopDelayMaxMs: Math.round(this.loopDelay.max / 1e6),
    };
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.statsTimer) clearInterval(this.statsTimer);
    this.loopDelay.disable();
    for (const job of this.queue.splice(0)) this.finish(job, null);
    await Promise.all(this.slots.map(s => s.worker.terminate().catch(() => 0)));
    this.slots = [];
  }
}

export function formatStats(s: ReturnType<BotPool['stats']>): string {
  return `요청 ${s.requested} · 답 ${s.done} · 거절(바쁨) ${s.shedBusy} · 늦음 ${s.late} · 시간초과 ${s.timeouts} · 오류 ${s.errors}` +
    ` | 씀 ${s.used} · 준비 안 됨 ${s.notReady} · 무효 ${s.illegal} · 그림자 같음/다름 ${s.shadowSame}/${s.shadowDiff}` +
    ` | worker ${s.workers}(일 ${s.busy} · 줄 ${s.queued}) · 평균 롤아웃 ${s.avgRollouts} · 평균 예산 ${s.avgBudgetMs}ms · 예산 줄임 ${s.reducedBudget}` +
    ` | 응답 p50 ${s.latencyP50} · p95 ${s.latencyP95} · 최대 ${s.latencyMax}ms | 이벤트 루프 지연 p99 ${s.loopDelayP99Ms} · 최대 ${s.loopDelayMaxMs}ms`;
}

let shared: BotPool | null = null;
/** 서버 전체가 함께 쓰는 풀(처음 부를 때 worker를 띄운다) */
export function getBotPool(): BotPool {
  if (!shared) shared = new BotPool();
  return shared;
}

/** 서버 시작 때 부른다 — AI_BOT이 켜져 있으면 worker를 미리 띄우고 설정을 한 줄 남긴다 */
export function startBotPoolIfEnabled(): void {
  const mode = aiMode();
  if (mode === 'off') return;
  const pool = getBotPool();
  pool.warmUp();
  const c = pool.config;
  console.log(`[ai] 탐색 봇 ${mode} — worker ${c.workers} · 예산 ${c.budgetMs}ms(최소 ${c.minBudgetMs}) · worker당 대기 ${c.queuePerWorker} · ${c.depthTurns}턴 앞까지`);
}
