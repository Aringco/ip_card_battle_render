import type { Animal, GameSettings } from './types';
import { clampSettings } from './constants';

// ─── 이벤트 모드 — 행사용 도전 과제 ─────────────────────────────────────────────
// 설계 전문은 저장소 루트의 EVENT_MODE_ROADMAP.md.
//
// ⚠️ **비밀값(개발자 암호·운영 토큰)은 여기 두지 않는다.** shared는 클라이언트 번들에 그대로
//    실리므로, 여기 적힌 문자열은 누구나 찾아낼 수 있다(시연 암호를 server/demo/trigger.ts에만 둔
//    것과 같은 이유). 암호는 서버 환경변수(EVENT_DEV_TOKEN · EVENT_ADMIN_TOKEN)로만 받는다.

/**
 * 도전 세 가지. 동물의 왕은 판이 아니라 '개발자를 이겨라' 결과를 모은 순위표라 여기 없다.
 * - beatDev    개발자를 이겨라 — 상시 대기 중인 개발자(사람)와 1:1. 규칙은 개발자가 정한다.
 * - timeAttack 목표점수 달성하기 — 컴퓨터 상대, 무작위 목표 점수를 10턴 안에(마지막 턴 기준) 달성
 *              (id는 처음 설계 — 제한시간 도전 — 의 이름을 그대로 둔다. 화면에는 쓰이지 않는다)
 * - oneWell    한 우물만 파기 — 컴퓨터 상대, 상표토끼·특허랑이 중 처음 쓴 카드만
 */
export type EventKind = 'beatDev' | 'timeAttack' | 'oneWell';
export const EVENT_KINDS: readonly EventKind[] = ['beatDev', 'timeAttack', 'oneWell'];

export const EVENT_LABELS: Record<EventKind, string> = {
  beatDev: '개발자를 이겨라',
  timeAttack: '목표점수 달성하기',
  oneWell: '한 우물만 파기',
};

// ─── 개발자를 이겨라 ───────────────────────────────────────────────────────────
/**
 * 개발자를 이겨라의 **기본** 규칙 — 목표 3(시작 체력 3 · 승리 6), 축제 3턴부터, **도전자 선공**(§7-4).
 * 개발자가 대기실에서 바꿀 수 있다(방 만들기의 게임 규칙과 같은 항목 — beatDevSettings). 일시정지는 바꿀 수 없다.
 * 축제 뽑기 횟수·증가 주기는 "늘어짐 방지" 시뮬레이션(server/scripts/eventBalance.ts)으로 정했다 — 목표 3이면 어느 조합이든
 * 판이 4턴 안팎(약 1.3분)에 끝나 지표를 넉넉히 맞추고, 그중 n=2 · k=2가 "바로 쓰는 사람"·"아끼는 사람" 양쪽에서
 * 승률이 가장 고르게 나왔다(도전자 57.6% / 51.7%). 아껴 두며 버티는 판이 생겨도 2턴마다 뽑기가 늘어 판을 밀어붙인다.
 */
export const BEAT_DEV_SETTINGS: Partial<GameSettings> = {
  firstTeam: 'A',
  targetScore: 3,
  festivalTurn: 3,
  festivalDrawCount: 2,
  festivalDrawIncreaseInterval: 2,
  pauseMaxCount: 0,
};

/**
 * 개발자가 정한 규칙을 기본값 위에 얹어 **완성된 규칙**으로 만든다. 서버(방)와 화면(개발자 대기실의 규칙 입력)이 같은 함수를 쓴다.
 * 일시정지는 개발자가 무엇을 보내도 0이다 — 이벤트 판에는 일시정지가 없다(§7-5).
 * "선 플레이어"의 팀 1(A)은 도전자, 팀 2(B)는 개발자다.
 */
export function beatDevSettings(custom?: Partial<GameSettings>): GameSettings {
  // 도전자 선공(§7-4)·일시정지 없음은 개발자가 바꿀 수 없다 — 나머지(목표 점수·축제·제한시간)는 개발자가 정한다.
  return clampSettings({ ...BEAT_DEV_SETTINGS, ...custom, firstTeam: 'A', pauseMaxCount: 0 });
}

// ─── 목표점수 달성하기 ─────────────────────────────────────────────────────────
// 판이 시작될 때 목표 점수가 10~20 사이에서 무작위로 정해지고, **10턴이 끝났을 때의 점수(체력)** 가 목표 이상이면 승리,
// 모자라면 패배다(2026-10-26 요청으로 "목표 점수 설정 + 제한시간"에서 바꿨다). 중간에 목표에 닿아도 판은 끝나지 않는다 —
// 컴퓨터가 특허랑이로 점수를 깎으므로 마지막까지 지켜야 한다. 그래서 이 판에는 체력 즉시 승패(넉아웃)가 없다(엔진의 scoreRace).
export const SCORE_RACE_TARGET_MIN = 10;
export const SCORE_RACE_TARGET_MAX = 20;
/** 주어진 턴 수 — 이 턴이 끝난 순간(양쪽이 모두 둔 뒤)의 점수로 판정한다 */
export const SCORE_RACE_TURNS = 10;
/** 도전자의 시작 점수 — 0점에서 목표까지 모은다 */
export const SCORE_RACE_START_SCORE = 0;
/**
 * 컴퓨터의 시작 체력 — 도전자의 특허랑이가 빼앗아 올 수 있는 몫이다(강탈은 상대가 가진 만큼만).
 * 컴퓨터는 상표토끼를 쓰지 않으므로 이 값은 도전자의 특허랑이와 자기 특허랑이로만 오르내린다.
 * 값의 근거는 server/scripts/eventBalance.ts의 시뮬레이션(EVENT_MODE_ROADMAP.md §3-2).
 */
export const SCORE_RACE_CPU_HP = 10;

/**
 * 목표점수 달성하기 — 목표·턴 수는 엔진의 scoreRace가 따로 쥐고, 설정은 축제를 당기고 일시정지를 막는다.
 * 축제를 3턴(뽑기 1회부터)으로 당기는 이유: 기본 규칙(8턴)이면 10턴 안에 모이는 점수가 중앙값 5~6점이라
 * 그리디 봇 기준 승률이 목표 10점 23% → 20점 2%로 거의 못 이긴다. 3턴·1회면 10점 58% · 15점 38% · 20점 21%
 * (eventBalance.ts ②, 2026-10-26) — 목표가 클수록 어려워지는 곡선이 그대로 남는다.
 */
export const TIME_ATTACK_SETTINGS: Partial<GameSettings> = {
  firstTeam: 'A',
  festivalTurn: 3,
  festivalDrawCount: 1,
  pauseMaxCount: 0,
};

/**
 * 판이 시작될 때 목표 점수를 룰렛으로 보여 주는 시간(ms). 이 동안 판은 멈춰 있다 — 방이 첫 턴 타이머를 이만큼 늦게
 * 걸고(Room.resetTimer) 그 사이의 클릭은 거부하며, 화면은 어두운 막 위에서 숫자를 돌리다 목표에 멈춘다(ScoreRaceIntro).
 * 룰렛은 연출일 뿐이다 — 목표는 서버가 이미 정해 첫 스냅샷에 실어 보낸다.
 */
export const SCORE_RACE_INTRO_MS = 5000;
/**
 * 룰렛은 **도전자의 게임 화면이 실제로 붙는 순간**(Room.handleReconnect) 시작한다 — 판이 만들어진 순간부터 세면
 * 로비 → 게임 화면으로 넘어가는 몇 초(개발 서버에서는 첫 컴파일까지)가 룰렛에서 통째로 깎여, 숫자가 돌기도 전에 끝났다.
 * 그 화면이 끝내 붙지 않을 때를 대비한 상한이 이 값이다 — 이만큼 기다린 뒤에는 룰렛 없이 판이 흐른다.
 */
export const SCORE_RACE_INTRO_WAIT_MS = 15_000;

/** 10~20 사이의 정수 하나 — 판마다 서버가 뽑는다(모든 무작위는 서버에서만). */
export function randomScoreRaceTarget(rng: () => number = Math.random): number {
  return SCORE_RACE_TARGET_MIN + Math.floor(rng() * (SCORE_RACE_TARGET_MAX - SCORE_RACE_TARGET_MIN + 1));
}

// ─── 한 우물만 파기 ─────────────────────────────────────────────────────────
/** 쓸 수 있는 카드 — 둘 중 하나를 처음 쓰는 순간 그 카드로 고정된다(엔진이 GameState.oneWell로 관리). */
export const ONE_WELL_ALLOWED: readonly Animal[] = ['rabbit', 'tiger'];

/** 한 우물만 파기 — 일반 혼자 놀기 기본값(목표 7) 그대로, 일시정지만 막는다. */
export const ONE_WELL_SETTINGS: Partial<GameSettings> = {
  firstTeam: 'A',
  pauseMaxCount: 0,
};

// ─── 매칭·흐름 ────────────────────────────────────────────────────────────────
/** 개발자와 도전자가 맞물린 뒤 경기가 시작되기까지(양쪽에 "매칭되었습니다!"를 띄우는 시간) */
export const EVENT_MATCH_COUNTDOWN_MS = 3000;
/** 경기가 끝난 뒤 개발자 화면이 저절로 대기실로 돌아가기까지(초) */
export const EVENT_DEV_RETURN_SEC = 10;

// ─── 닉네임 · PIN ─────────────────────────────────────────────────────────────
/** 재도전 확인용 숫자 PIN 자릿수 — 처음 등록할 때 정하고, 같은 닉네임으로 다시 도전할 때 입력한다(§7-1). */
export const EVENT_PIN_LENGTH = 4;

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && new RegExp(`^\\d{${EVENT_PIN_LENGTH}}$`).test(pin);
}

/**
 * 닉네임 비교용 키 — 행사 전체에서 닉네임이 겹치면 안 되므로(§2.2) **보이는 글자가 같으면 같은 이름**으로 본다.
 * 앞뒤 공백 제거 · 연속 공백 하나로 · 유니코드 정규화(NFC) · 대소문자 무시.
 * "곰돌이"와 "곰돌이 "가 다른 사람으로 갈리면 순위표에서 둘을 구분할 수 없다.
 */
export function normalizeNameKey(name: string): string {
  return name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

// ─── 화면으로 내려가는 값 ─────────────────────────────────────────────────────

/** 이벤트 판이 끝난 이유 — 결과 행의 end_reason과 같다. */
export type EventEndReason = 'win' | 'lose' | 'draw' | 'forfeit' | 'left';

/**
 * 게임 상태에 실려 가는 이벤트 정보(ClientGameState.event). 재접속 스냅샷도 같은 경로라 F5 뒤에도 남는다.
 * 목표점수 달성하기의 목표·남은 턴은 엔진 상태(GameState.scoreRace)에 있다 — 여기 따로 싣지 않는다.
 */
export interface EventInfo {
  kind: EventKind;
  challengerName: string;
  /** 개발자를 이겨라 — 상대 개발자의 표시 이름 */
  developerName?: string;
  /** 판이 끝났을 때만 — 도전 성공 여부 */
  success: boolean | null;
  endReason: EventEndReason | null;
  /** 기록 번호(event_results.id). 저장이 끝나기 전·DB가 끊긴 동안은 null */
  recordId: number | null;
  /**
   * 목표점수 달성하기 — 시작 룰렛이 끝날 때까지 남은 ms(끝났으면 없다). 절대 시각이 아니라 남은 시간이다(턴 타이머 규칙 1) —
   * 화면은 받은 순간 자기 시계로 환산한다(useWebSocket의 eventIntroUntil).
   */
  introRemainingMs?: number;
}

/** 개발자 대기실 화면에 그리는 내 상태 */
export interface EventDevStatus {
  devId: string;
  name: string;
  /** idle 대기 중 · away 자리 비움 · matched 매칭되어 시작 직전 · playing 경기 중 */
  state: 'idle' | 'away' | 'matched' | 'playing';
  queueLength: number;
  wins: number;   // 개발자 기준 — 도전자를 이긴 판
  losses: number; // 개발자 기준 — 도전자에게 진 판
  /** 다음 판부터 쓰는 규칙(개발자가 정한 값 — beatDevSettings로 완성된 것) */
  settings: GameSettings;
}

/** 대기 줄에 선 도전자 화면 */
export interface EventQueueStatus {
  position: number;          // 1부터 — 1이면 다음 차례
  developersOnline: number;  // 접속해 있는 개발자(자리 비움 포함)
  developersIdle: number;    // 지금 바로 받을 수 있는 개발자
  estimatedWaitSec: number | null; // 최근 판 길이 평균 × 앞 사람 수(기록이 없으면 null)
}

/** 순위표 한 줄 */
export interface LeaderboardEntry {
  name: string;
  recordId: number | null;
  level?: number;   // 동물의 왕
  target?: number;  // 목표점수 달성하기 — 달성한 목표
  score?: number;   // 목표점수 달성하기 — 마지막 턴의 점수
  animal?: Animal;  // 한 우물만 파기 — 고정된 카드
}

export interface Leaderboard {
  /** 동물의 왕 — '개발자를 이겨라' 승리 기록에서 동물별 최고 레벨 1~3위(닉네임당 1건, 동점은 먼저 달성한 사람) */
  animalKing: Record<Animal, LeaderboardEntry[]>;
  beatDev: { played: number; wins: number; winners: LeaderboardEntry[] };
  /** 성공자 — 높은 목표를 달성한 사람부터(닉네임당 최고 목표 1건) */
  timeAttack: { played: number; wins: number; winners: LeaderboardEntry[] };
  oneWell: { played: number; wins: number; winners: LeaderboardEntry[] };
}

/** 저장된 결과 한 건(운영자 화면·CSV) */
export interface EventResultRow {
  id: number | null;       // DB에 들어가기 전이면 null(저장 대기)
  createdAt: number;       // 기록 시각(ms) — 운영자 화면 표시용
  event: EventKind;
  playerName: string;
  developer: string | null;
  won: boolean;
  endReason: EventEndReason;
  peakLevels: Record<Animal, number>;
  detail: { target?: number; finalScore?: number; lockedAnimal?: Animal | null; devForfeit?: boolean };
  turns: number;
  durationMs: number;
  invalid: boolean;
}

export interface EventAdminState {
  storage: 'memory' | 'connected' | 'error';
  pending: number;        // DB에 아직 못 넣은 결과 건수(재시도 큐)
  nameConflicts: number;  // DB가 끊긴 동안 받은 닉네임이 다시 붙었을 때 유일 제약에 걸린 건수
  developers: Array<{ name: string; state: EventDevStatus['state'] | 'offline' }>;
  queue: string[];
  results: EventResultRow[];
}
