/**
 * 탐색 봇 worker — 게임 서버의 메인 스레드는 모든 방의 메시지 · 타이머를 한 줄로 처리하므로, 탐색(수백 ms)을 거기서 돌리면
 * 그동안 다른 모든 방이 멈춘다. 그래서 계산은 이 스레드에서만 한다. 띄우는 법은 ./pool.ts(ts-node 아래에서도 돈다).
 */
import { parentPort } from 'worker_threads';
import { searchDecision } from './searchBot';
import type { GameState, SideId } from 'shared';

export interface WorkerJob { id: number; state: GameState; side: SideId; budgetMs: number; depthTurns?: number }
export type WorkerReply =
  | { id: number; ok: true; decision: ReturnType<typeof searchDecision>['decision']; rollouts: number; elapsedMs: number }
  | { id: number; ok: false; error: string };

parentPort?.on('message', (job: WorkerJob) => {
  let reply: WorkerReply;
  try {
    const r = searchDecision(job.state, job.side, { budgetMs: job.budgetMs, depthTurns: job.depthTurns });
    reply = { id: job.id, ok: true, decision: r.decision, rollouts: r.rollouts, elapsedMs: r.elapsedMs };
  } catch (e) {
    reply = { id: job.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  parentPort!.postMessage(reply);
});
