/**
 * 혼자 놀기의 봇(2026-11-24, docs/AI_ROADMAP.md §3-2) — 혼자 놀기는 대기실을 열어 봇을 넣고 빼며, 판은 개인전이다.
 * 난이도마다 판단이 다르다(server/computerSkills.ts · server/ai/searchBot.ts).
 *   쉬움: 장소 · 기술 · 대상 모두 무작위(가끔 쓸 수 있는 기술도 넘긴다)
 *   보통: 지금 이득이 큰 기술 · 끝낼 수 있으면 끝내기 · 대상은 끝낼 수 있는 사람 아니면 1위(규칙형)
 *   어려움: 탐색 봇 — 후보마다 앞날을 굴려 본다(worker에서, 바쁘면 보통으로 대신 둔다)
 */
export type BotLevel = 'easy' | 'normal' | 'hard';

export const BOT_LEVELS: readonly BotLevel[] = ['easy', 'normal', 'hard'];

export const BOT_LEVEL_LABEL: Record<BotLevel, string> = {
  easy: '쉬움',
  normal: '보통',
  hard: '어려움',
};

/** 봇을 넣을 때의 기본 난이도 */
export const DEFAULT_BOT_LEVEL: BotLevel = 'normal';

export function isBotLevel(v: unknown): v is BotLevel {
  return v === 'easy' || v === 'normal' || v === 'hard';
}
