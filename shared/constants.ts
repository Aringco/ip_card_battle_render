import type { GameSettings } from './types';

// 동물별 레벨 임계값 — level = floor(exp / threshold)
export const THRESHOLDS = { sheep: 10, rabbit: 10, mermaid: 20, tiger: 20 } as const;

// 체력(=점수) 규칙 — 시작 체력은 목표 점수(GameSettings.targetScore) 그 자체이고,
// 그 두 배(=시작 체력 + 목표 점수)에 닿으면 즉시 승리, 0 이하면 즉시 패배다.
// 아래 INITIAL_HP/WIN_HP는 "기본 규칙(targetScore=DEFAULT_TARGET_SCORE)일 때의 값"을
// 나타내는 참고용 상수일 뿐, 실제 게임 로직은 항상 state.settings.targetScore로 계산한다
// (server/engine/turnManager.ts의 winHpOf, initGame 참조).
export const INITIAL_HP = 10;
export const WIN_HP = 20;
export const LOSE_HP = 0;

// 축제 시작 턴(기본값) — 방장이 방 생성 시 바꿀 수 있다(GameSettings.festivalTurn) —
// "축제가 시작되는 첫 턴"이라 turn >= festivalTurn으로 판정한다.
export const FESTIVAL_TURN = 10;

// 축제가 열리면 실용신양과 동일한 방식(무작위 장소에서 카드 뽑기)의 "도토리 뽑기"가
// festivalDrawCount(n)회 발동한다. 이후 festivalDrawIncreaseInterval(k)턴마다
// 발동 횟수가 n×1 → n×2 → n×3 ... 처럼 등차수열로 늘어난다(server/engine/turnManager.ts 참조).
export const DEFAULT_FESTIVAL_DRAW_COUNT = 1;
export const DEFAULT_FESTIVAL_DRAW_INCREASE_INTERVAL = 999;

// 방장이 방 생성 시 정할 수 있는 게임 규칙의 기본값 — GameSettings 참조.
// firstTeam 기본값은 'A' — 이 설정이 생기기 전부터 항상 A팀이 먼저 시작했던 기존 동작을
// 그대로 유지한다(방장이 명시적으로 바꿔야만 B/무작위로 바뀐다).
export const DEFAULT_FIRST_TEAM: 'A' | 'B' | 'random' = 'A';
// targetScore(목표 점수) — 시작 체력이자 승리에 필요한 격차(시작 체력 = targetScore,
// winHp = targetScore × 2). 기본값 10이면 체력 10에서 시작해 20 이상이면 즉시 승리.
export const DEFAULT_TARGET_SCORE = 10;
export const DEFAULT_FESTIVAL_TURN = FESTIVAL_TURN;
export const DEFAULT_DRAW_TIME_SEC = 30;
export const DEFAULT_ACTION_TIME_SEC = 15;
export const DEFAULT_NO_ACTION_TIME_SEC = 5;

// 방 생성 화면에서 입력값을 이 범위로 잘라낸다(서버도 방어적으로 다시 clamp한다).
export const SETTINGS_LIMITS = {
  targetScore: { min: 1, max: 100 },
  // MAX_TURN(20)보다 크게 입력해도 막지 않는다 — 그런 값은 engine/turnManager.ts가
  // 내부적으로 MAX_TURN으로 취급해(암묵적으로 clamp) 마지막 턴에 축제가 열리게 한다.
  festivalTurn: { min: 1, max: 999 },
  festivalDrawCount: { min: 1, max: 20 },
  festivalDrawIncreaseInterval: { min: 1, max: 999 },
  drawTimeSec: { min: 5, max: 120 },
  actionTimeSec: { min: 5, max: 60 },
  noActionTimeSec: { min: 2, max: 30 },
} as const;

export const DEFAULT_SETTINGS: GameSettings = {
  firstTeam: DEFAULT_FIRST_TEAM,
  targetScore: DEFAULT_TARGET_SCORE,
  festivalTurn: DEFAULT_FESTIVAL_TURN,
  festivalDrawCount: DEFAULT_FESTIVAL_DRAW_COUNT,
  festivalDrawIncreaseInterval: DEFAULT_FESTIVAL_DRAW_INCREASE_INTERVAL,
  drawTimeSec: DEFAULT_DRAW_TIME_SEC,
  actionTimeSec: DEFAULT_ACTION_TIME_SEC,
  noActionTimeSec: DEFAULT_NO_ACTION_TIME_SEC,
};

/** 방장 입력값을 SETTINGS_LIMITS 범위로 잘라내고, 정수가 아니면 반올림한다. */
export function clampSettings(input: Partial<typeof DEFAULT_SETTINGS> | undefined): typeof DEFAULT_SETTINGS {
  const merged = { ...DEFAULT_SETTINGS, ...input };
  const clamp = (key: keyof typeof SETTINGS_LIMITS) => {
    const { min, max } = SETTINGS_LIMITS[key];
    const v = Math.round(Number(merged[key]));
    return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : DEFAULT_SETTINGS[key];
  };
  const firstTeam =
    merged.firstTeam === 'A' || merged.firstTeam === 'B' || merged.firstTeam === 'random'
      ? merged.firstTeam
      : DEFAULT_SETTINGS.firstTeam;
  return {
    firstTeam,
    targetScore: clamp('targetScore'),
    festivalTurn: clamp('festivalTurn'),
    festivalDrawCount: clamp('festivalDrawCount'),
    festivalDrawIncreaseInterval: clamp('festivalDrawIncreaseInterval'),
    drawTimeSec: clamp('drawTimeSec'),
    actionTimeSec: clamp('actionTimeSec'),
    noActionTimeSec: clamp('noActionTimeSec'),
  };
}

export const MAX_TURN = 20;
export const TURN_TIME_SEC = 30;

// 실용신양 스킬로 예약된 추가 뽑기 1회 소모당 상한 (무한루프/과도한 뽑기 방지)
export const SHEEP_SAFETY_CAP = 40;

export const ANIMALS = ['sheep', 'rabbit', 'mermaid', 'tiger'] as const;

// 방을 만들 때 팀 이름을 정하지 않으면 이 중 서로 겹치지 않게 무작위로 배정된다.
export const TEAM_NAME_POOL = [
  '상표', '디자인', '실용신안', '특허', '영업비밀', '저작권', '무단도용', '불법복제',
] as const;

// 실용신양 스킬로 예약된 추가 뽑기 1회당 턴 제한시간 연장(초) — 30초 + 10×n
export const SHEEP_EXTRA_TIME_PER_DRAW_SEC = 10;
// 배율이 실린 예약 뽑기가 턴 제한시간을 무한정 늘리지 않도록, 시간 연장 계산에는
// 이 값까지만 반영한다(실제 뽑기 횟수 자체는 SHEEP_SAFETY_CAP까지 그대로 진행된다).
export const SHEEP_TIMER_EXTRA_DRAW_CAP = 6;
