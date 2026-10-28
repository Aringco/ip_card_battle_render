import type { PlayerColorId } from './constants';
import type { EnhanceState } from './enhance';

export type Animal = 'sheep' | 'rabbit' | 'mermaid' | 'tiger';
export type Team = 'A' | 'B';

// 게임에서 "한 편"을 가리키는 id. 팀전은 'A'|'B' 둘뿐이고, 개인전은 'p1' … 'p8' —
// 한 사람이 한 편이다(INDIVIDUAL_MODE_ROADMAP.md §3). 엔진 상태(GameState)는 모두 이 타입으로
// 편을 가리킨다. `Team`은 **팀전 전용 코드**(대기실 팀 이름·시연·CPU)가 계속 쓴다.
//
// ⚠️ 그래서 `team === 'A' ? 'B' : 'A'` 같은 "반대편 뒤집기"는 string에서도 아무 문제 없이
//    컴파일되고, 개인전에서는 조용히 없는 편 'B'를 가리킨다. 상대는 반드시 shared/sides.ts의
//    opponentsOf로 구한다(server/__tests__/noTeamFlip.test.ts가 그물이다).
export type SideId = string;

/** 방의 종류 — 팀전(두 팀, 팀마다 여러 명) 또는 개인전(한 사람이 한 편, 순위전). */
export type GameMode = 'team' | 'individual';

/** 개인전에서 순위가 정해진 이유. 'forfeit'은 항복·나가기, 'last'는 끝까지 남은 한 명. */
export type FinishReason = 'win' | 'out' | 'forfeit' | 'turnLimit' | 'last';

// ─── 자리(Seat) — 두 팀 + 관전석 ──────────────────────────────────────────────
// 로비에서 고를 수 있는 자리는 "팀 1 / 팀 2 / 관전자" 셋이다. 관전자는 게임 진행에
// 아무 영향도 주지 않고 구경만 하는 자리라, 게임 엔진(GameState/TeamState)에는 아예
// 존재하지 않는다 — Team은 여전히 'A'|'B' 둘뿐이고, 관전석은 방(Room)과 화면에만
// 있는 개념이다. 엔진 쪽 타입에 'spectator'를 섞지 말 것(정산·턴 교대·승패 판정이
// 전부 두 팀을 전제로 짜여 있다).
export const SPECTATOR = 'spectator';
// 개인전 방에는 팀이 없고 "플레이어석" 하나와 관전석뿐이다(INDIVIDUAL_MODE_ROADMAP.md T3-1).
// 팀전의 'A'/'B'에 해당하는 자리다 — 한 방 안에서 두 종류가 섞이는 일은 없다.
export const PLAYER_SEAT = 'player';
export type Seat = Team | typeof PLAYER_SEAT | typeof SPECTATOR;
// 팀전 대기실의 자리 목록. 개인전은 아래 INDIVIDUAL_SEATS를 쓴다.
export const SEATS: Seat[] = ['A', 'B', SPECTATOR];
export const INDIVIDUAL_SEATS: Seat[] = [PLAYER_SEAT, SPECTATOR];

/** 이 자리가 실제로 게임을 뛰는 자리인지(=관전석이 아닌지). 팀전의 팀이거나 개인전의 플레이어석이다. */
export function isPlayingSeat(seat: Seat): seat is Team | typeof PLAYER_SEAT {
  return seat !== SPECTATOR;
}

/** 이 자리가 팀전의 팀(A/B)인지 — 팀 이름·팀 색처럼 팀전에만 있는 것을 만질 때 쓴다. */
export function isTeamSeat(seat: Seat): seat is Team {
  return seat === 'A' || seat === 'B';
}
// 1은 카드 강화 모드에서만 나온다(모든 카드가 1 — shared/enhance.ts).
export type CardNum = 1 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
export type GamePhase = 'lobby' | 'playing' | 'ended';

// 맵 네 모서리의 장소 — 각 장소를 클릭하면 괄호 안 동물 중 하나가 무작위로 나온다.
export type Place = 'house' | 'forest_road' | 'dock' | 'river_road';

export const PLACES: Place[] = ['house', 'forest_road', 'dock', 'river_road'];

export const PLACE_ANIMALS: Record<Place, Animal[]> = {
  house: ['rabbit', 'sheep'],               // 오두막 — 토끼, 양
  forest_road: ['rabbit', 'sheep', 'tiger'], // 숲길 — 토끼, 양, 호랑이
  dock: ['mermaid', 'tiger'],                // 부둣가 — 인어, 호랑이
  river_road: ['mermaid', 'rabbit', 'sheep'], // 강가 — 인어, 토끼, 양 (호랑이는 나오지 않는다)
};

// 중앙 동물 스택에 쌓이는 카드 한 장. 뽑히는 즉시 공개되므로 숨김 상태가 없다.
export interface StackedCard {
  id: number;
  animal: Animal;
  num: CardNum;
  collectedBy: SideId | null;
}

// 동물별로 그 스킬을 몇 번, 총 몇 레벨어치 사용했는지 기록(결과 화면 통계용).
export interface SkillUsageStat {
  count: number;
  totalLevel: number;
  totalHpGained: number;   // 이 동물로 얻은 체력 총합 (토끼=회복분, 호랑이=강탈분, 양/인어=0)
  totalExtraDraws: number; // 양으로 예약한 추가 뽑기 총합 (양 외 0)
}

export interface TeamState {
  members: string[];
  exp: Record<Animal, number>;    // 동물별 누적 경험치 = 카드 숫자 합. 레벨 = floor(exp/threshold)
  hp: number;                      // 체력(=점수) — settings.targetScore에서 시작, 그 두 배 이상이면 승리, 0 이하면 패배
  pendingMultiplier: number;       // 디자인어가 키우는 대기 배율. 초기값 1, 인어를 쓸 때마다 그 레벨만큼
                                    // 더해진다(1 + 누적 레벨 = 다음 행동이 발동하는 총 횟수). 인어 외 스킬을 쓰면 1로 초기화
  pendingExtraDraws: number;       // 실용신양 스킬로 예약된, 다음 내 턴에 추가로 뽑을 카드 수
  pendingFestivalDraws: number;    // 도토리 축제로 예약된, 다음 내 턴에 추가로 뽑을 카드 수(실용신양과 동일한 방식)
  playerIndex: number;             // 팀 내 현재 차례 플레이어 인덱스 (N:N 로테이션)
  skillStats: Record<Animal, SkillUsageStat>; // 결과 화면에 표시할 스킬 사용 통계
  color?: PlayerColorId;           // 개인전만 — 이 사람이 고른 색
  // 개인전만 — 순위가 정해지면 채운다. 채워진 편은 판에서 빠진다(차례가 오지 않고, 특허랑이의
  // 대상이 될 수 없고, 체력이 더 이상 변하지 않는다).
  finish?: { rank: number; reason: FinishReason };
}

// 방장이 방 생성 시 정하는 게임 규칙 — 기본값은 shared/constants.ts의 DEFAULT_* 참조.
export interface GameSettings {
  firstTeam: 'A' | 'B' | 'random'; // 선 플레이어(먼저 시작하는 팀) — 'random'이면 게임 시작 시 서버가 무작위로 정한다
  targetScore: number;    // 목표 점수 — 시작 체력이자 승리에 필요한 격차(시작 hp = targetScore, winHp = targetScore × 2)
  festivalTurn: number;   // 도토리 축제 시작 턴
  festivalDrawCount: number;           // 도토리 축제 랜덤 뽑기 발동 횟수(n) — festivalTurn에 n×1회 발동
  festivalDrawIncreaseInterval: number; // 이후 이 턴(k)마다 발동 횟수가 n×2, n×3...으로 늘어난다(기본 999=사실상 재발동 없음)
  drawTimeSec: number;    // 동물 뽑기(장소 클릭) 제한시간
  actionTimeSec: number;  // 행동 선택 제한시간 — 고를 수 있는 행동이 있을 때
  noActionTimeSec: number; // 행동 선택 제한시간 — 고를 수 있는 행동이 하나도 없을 때
  // 게임 중 메뉴(⏸)의 일시정지 제한 — **팀마다** 이 횟수까지 쓸 수 있고(0이면 아예 못 쓴다),
  // 한 번 멈춘 뒤 이 시간이 지나면 서버가 알아서 풀어준다(상대가 영영 기다리지 않도록).
  pauseMaxCount: number;  // 팀당 일시정지 가능 횟수
  pauseMaxMin: number;    // 한 번의 일시정지 최대 시간(분)
}

export interface GameState {
  phase: GamePhase;
  turn: number;
  activeTeam: SideId;
  activePlayerIndex: number;
  stacks: Record<Animal, StackedCard[]>;      // 동물별 중앙 카드 스택 (수집된 카드도 기록으로 남음)
  // 직전에(어느 팀이든) 실제로 클릭해서 뽑은 장소 — 같은 장소만 계속 노리는 게 너무
  // 유리해서, 바로 다음 차례에는 이 장소를 고를 수 없다(server/engine/gameEngine.ts의
  // processPlayerAction 참고). 실용신양/도토리 축제로 예약된 추가 뽑기는 무작위 장소에서
  // 알아서 일어나는 것이라 여기에 영향을 주지 않는다 — 오직 "직접 클릭한" 장소만 기억한다.
  lastPlace: Place | null;
  festival: boolean;                          // settings.festivalTurn 이후 여부 — 이때부터 도토리 축제 랜덤 뽑기가 발동한다
  pendingChoice: SideId | null;               // 턴을 마친 팀이 5가지 선택지(행동 4종 + 패스) 중 하나를 고르길 기다리는 중
  teams: Record<SideId, TeamState>;
  winner: SideId | 'draw' | null;
  settings: GameSettings;                     // 방장이 정한(또는 기본값) 게임 규칙 — 방 생성 시 확정되어 게임 중 불변
  startingTeam: SideId;                       // 이 게임에서 실제로 먼저 시작한 팀 — settings.firstTeam이 'random'이어도 이미 추첨이 끝난 확정값
  startingTeamReason: 'setting' | 'random';   // startingTeam이 방장 설정으로 정해졌는지 무작위 추첨으로 정해졌는지
  // 항복하기/나가기로 게임을 포기한 팀 — 그렇게 끝난 게임에서만 채워진다(엔진은 이 값을
  // 절대 건드리지 않는다). 결과 화면이 "제한 턴 종료 — 체력 비교" 대신 "기권"이라고 말할 수
  // 있게 하는 단 하나의 단서라, winner만으로는 대신할 수 없다.
  forfeitedBy?: SideId | null;

  // ─ 개인전 일반화 필드 — 팀전에서는 모두 고정값이다(mode 'team', turnOrder [선, 후], 1, 0, {}) ─
  mode: GameMode;
  // 차례 순서. 팀전은 [startingTeam, 반대편], 개인전은 시작할 때 한 번 섞은 편 목록 —
  // 판 도중에는 바뀌지 않는다. 순위가 정해진 편도 목록에 남고 차례만 건너뛴다.
  turnOrder: SideId[];
  // 한 차례에 쓸 수 있는 기술 수. 개인전은 시작 인원이 5명 이상이면 2, 아니면 1이고 판 도중
  // 탈락으로 인원이 줄어도 바뀌지 않는다. 팀전은 언제나 1.
  skillsPerTurn: 1 | 2;
  skillsUsedThisTurn: number; // 이번 차례에 지금까지 쓴 기술 수 — 차례가 넘어갈 때 0으로
  ranks: Record<SideId, number>; // 개인전 — 정해진 순위만. 팀전은 {}

  // 이벤트 '한 우물만 파기'에서만 — 그 편은 allowed 안의 카드만 쓸 수 있고, 그중 하나를 처음 쓰는 순간
  // locked가 세워져 이후로는 그 카드만 쓸 수 있다. 잠금은 엔진(skills.ts의 eligibleAnimals·applySkillChoice)이
  // 한 곳에서 지킨다 — 방이 따로 세우면 시간초과 대체 선택 경로에서 고정이 빠진다(EVENT_MODE_ROADMAP.md §3-3).
  // multipliers는 그 편 카드의 **기본 배율**(쌓인 인어 배율에 곱해진다 — shared/events.ts의 skillMultiplier). 판이 시작될 때
  // 개발자가 정해 둔 값(EventConfig)이 실리고 판 끝까지 그대로다. 없으면 기본값(ONE_WELL_MULTIPLIERS — 상표토끼 2·특허랑이 3).
  oneWell?: { side: SideId; allowed: Animal[]; locked: Animal | null; multipliers?: Partial<Record<Animal, number>> };

  // 이벤트 '목표점수 달성하기'에서만 — 그 편은 maxTurn턴이 끝났을 때 점수(체력)가 target 이상이면 승리, 아니면 패배다.
  // 이 판에는 체력 즉시 승패(넉아웃)가 없고(0점이어도 계속한다), 턴 상한도 MAX_TURN 대신 maxTurn이다
  // (turnManager의 checkKnockout·advanceTurn, shared/sides.ts의 maxTurnOf). EVENT_MODE_ROADMAP.md §1-2.
  scoreRace?: { side: SideId; target: number; maxTurn: number };

  // 혼자 놀기 '카드 강화'에서만 — 있으면 레벨·기술 효과·쿨타임이 강화 규칙(shared/enhance.ts)을 따르고, 카드 숫자는 모두 1이다.
  // 레벨은 skillLevelFor로 구한다(엔진과 화면이 같은 함수). ENHANCE_MODE.md.
  enhance?: EnhanceState;
}

// 게임 이벤트 (클라이언트 연출 및 시뮬레이션 로그용)
export type GameEvent =
  | { type: 'draw'; place: Place; card: StackedCard }
  | {
      type: 'collect';
      animal: Animal;
      team: SideId;
      exp: number;      // 카드 숫자 합 — 이 페어를 정산해 실제로 더해진 경험치
      cardIds: number[];
    }
  | { type: 'bonusDraws'; team: SideId; count: number } // 실용신양 스킬로 예약해둔 추가 뽑기를 이번 턴에 소모
  | { type: 'festivalDraws'; team: SideId; count: number } // 도토리 축제로 예약해둔 추가 뽑기를 이번 턴에 소모(실용신양과 동일한 방식)
  | {
      type: 'skillApplied';
      team: SideId;
      animal: Animal;
      level: number;            // 발동에 사용된(초기화 직전) 레벨. 0이면 아무 일도 없었다는 뜻
      expSpent: number;         // level × threshold — 소모된 경험치
      multiplierUsed: number;   // 이번 발동에 실제로 곱해진 배율(=총 발동 횟수, 인어일 때는 항상 1)
      multiplierAfter: number;  // 발동 후 그 팀의 pendingMultiplier(인어면 레벨만큼 늘어난 값, 나머지는 1)
      myHpDelta: number;        // 내 체력 증감 — 항상 0 이상
      oppHpDelta: number;       // 상대 체력 증감 — 항상 0 이하(음수 그대로, 양수로 뒤집지 않는다)
      extraDrawsQueued: number; // 양을 골랐을 때, 다음 내 턴에 예약된 추가 뽑기 수(배율 반영 후 최종값)
      hpAfter: Record<SideId, number>; // 적용 직후 모든 편의 체력
      // 특허랑이의 대상(개인전). 팀전은 비워 둔다 — 화면은 "상대"를 스스로 계산하지 않고 이 값을 읽는다.
      target?: SideId;
      // 한 우물만 파기 — 이 발동으로 카드가 고정됐다(처음 쓴 순간에만 실린다). 화면이 "이제부터 ○○만!"을 띄운다.
      oneWellLocked?: Animal;
      // 카드 강화 — 고른 기술이 아니라 **짝이 맞아 저절로 발동한** 효과다(정산 직후, collect 바로 뒤에 실린다).
      pair?: true;
      // 카드 강화 — 실용신양 Lv.6+: 무작위로 고른 내 카드에 더해진 경험치(배율 반영 후)
      randomExp?: { animal: Animal; amount: number };
      // 카드 강화 — 디자인어 Lv.6+: 상대 배율이 실제로 깎인 양(×1 아래로는 안 내려가므로 표의 값보다 작을 수 있다)
      oppMultiplierCut?: number;
      // 카드 강화 — 디자인어 Lv.9+: 상대의 다음 고른 기술에 건 나눗셈(÷2 · ÷3 · ÷5)
      oppDivisor?: number;
      // 카드 강화 — 이번 기술의 효과가 상대 디자인어 때문에 이 수로 나뉘었다(반올림)
      divisorUsed?: number;
    }
  // 카드 강화 — 이 장소를 눌러 이번에 count장이 한꺼번에 나온다(뒤따르는 draw count개가 그 카드들이다). 화면은 겹쳐서 빠르게 띄운다.
  | { type: 'placeDraws'; place: Place; count: number }
  | { type: 'skillPassed'; team: SideId; auto: boolean } // "아무것도 하지 않음"을 선택(auto=true면 고를 수 있는 행동이 없어 화면에 알리지 않고 자동 처리)
  | { type: 'festival' } // FESTIVAL_TURN 도달 — 이때부터 도토리 축제 랜덤 뽑기가 발동한다
  // reason: 'forfeit'은 엔진이 만들지 않는다 — 항복·나가기는 방(Room)에서 일어나는 일이라
  // Room.forfeit이 이 이벤트를 직접 만들어 보낸다(엔진은 두 팀이 끝까지 두는 경우만 안다).
  // 개인전의 reason 'ranked'는 "순위가 정해지지 않은 사람이 1명 이하가 됐다"는 뜻이다.
  // 'target'은 이벤트 '목표점수 달성하기'(scoreRace)의 마지막 턴 판정 — 점수가 목표 이상이면 그 편, 아니면 상대가 이긴다.
  | { type: 'gameEnd'; winner: SideId | 'draw'; reason: 'knockout' | 'turnLimit' | 'forfeit' | 'ranked' | 'target' }
  // 개인전 — 한 사람의 순위가 정해졌다(승리선 도달·체력 0·항복·마지막 한 명).
  | { type: 'ranked'; team: SideId; rank: number; reason: FinishReason }
  | { type: 'timeout'; place: Place }
  | { type: 'timeoutChoice'; animal: Animal | null }; // 행동 선택 제한시간 초과 — null이면 고를 행동이 없어 자동 패스
