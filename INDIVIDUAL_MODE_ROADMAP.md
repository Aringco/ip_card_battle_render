# 개인전(순위전) — 구현 로드맵

'다같이 놀기'의 방 만들기에서 **팀전 / 개인전**을 고를 수 있게 한다. 팀전은 지금 방식
그대로이고, 개인전은 **최대 8명이 각자 겨뤄 순위를 매기는 순위전**이다.

- **대상 독자**: 이 기능을 구현할 모델(Sonnet 포함)과 사람. 이 문서만 보고 순서대로
  구현할 수 있도록 파일·함수·완료 조건까지 적었다.
- **기준 커밋**: `ae02b3e`. 문서의 줄 번호는 이 커밋 기준이다 — 작업 전에 반드시 다시
  grep해서 확인할 것(§부록 A의 명령).
- **구현 상태 (2026-10-16)**: P0~P8을 구현했다(아래 표). 이 문서는 구현의 설계 기록으로 남기고, 실제 동작의
  기준은 코드와 `CLAUDE.md`의 "개인전" 절이다. 남은 일은 §2-7의 **밸런스 수치 결정**(사용자)뿐이다.

  | 단계 | 커밋 | 비고 |
  | --- | --- | --- |
  | P0·P1 엔진 일반화(팀전 불변) | `ce86c89` | 서버 테스트 141개 통과, `measurePlay --diff` 움직인 상자 0 |
  | P2 순위전 엔진 | `dd47f52` | `individual.test.ts`(E1~E19+항복), `scripts/individualSim.ts` |
  | P3 방·프로토콜 | `b90f0df` | `individualRoom.test.ts`(R1~R9), 서버 테스트 210개 |
  | P4 대기 화면 | `568e1b9` | 토글은 제목 줄 오른쪽(새 줄이면 팀전 폼이 53~58px 넘친다) |
  | P5~P8 게임 화면·상대 선택·홀로 카드·결과 | `683a88e` | `measureIndividual.mjs` 2·5·8명 넘침 없음 |

  로드맵과 **달라진 점**: ① 타입을 `SideId`로 넓히자 ts-jest가 기존 테스트 세 파일의 타입 표기에서 실패해
  그 줄만 맞췄다(동작은 그대로) ② `client/tsconfig.json`이 `backups/`를 제외한다(옛 스냅샷이 새 타입과 안
  맞는다) ③ 이모티콘 좌우 판정을 팀 이름이 아니라 화면 위치로 바꿨다(팀전은 같은 결과) ④ 개인전 결과는
  `IndividualEndScreen`으로 따로 뒀다(팀전 `GameEndScreen`을 건드리지 않기 위해).

---

## 구현하는 모델이 먼저 읽을 것

1. **이 문서의 규칙(§2)과 다르게 구현하지 않는다.** 규칙이 모호해 보이면 추측하지 말고
   멈춰서 사용자에게 묻는다. 기본값이 적혀 있는 항목(§2-6)은 그 기본값으로 구현한다.
2. **팀전·혼자 놀기·시연 모드의 동작을 바꾸지 않는다.** 이것이 이 작업의 가장 큰 위험이고,
   그것을 증명하는 수단은 기존 테스트다. **기존 테스트를 고치거나 지워서 통과시키지 말 것.**
   기존 테스트가 깨지면 그건 내 코드가 팀전을 바꿨다는 뜻이다.
3. **작업 하나(§4의 T 번호) = 커밋 하나.** 작업마다 §4의 "완료 조건"을 전부 확인한 뒤 커밋한다.
4. 코드를 건드리기 전에 `CLAUDE.md`의 다음 절을 읽는다: "게임 엔진 3계층", "방(Room) 상태
   머신", "관전자", "클라이언트 — 서버 이벤트를 연출 타임라인으로 번역", "플레이 화면의 나무
   UI", "로비 화면", "시연 모드". 주석에 과거 버그 사례가 남아 있는 곳은 그 이유를 이해한 뒤 고친다.
5. 기존 코드의 말투를 따른다 — 한국어 주석, "왜"를 적는 주석, `⚠️`로 함정 표시.
6. 매 작업 끝에 돌릴 것:
   ```bash
   cd server && npm test            # 전부 통과
   cd server && npm run build       # tsc (types 목록을 지우지 말 것 — CLAUDE.md)
   cd client && npx tsc --noEmit
   ```
7. **dev 서버가 떠 있는 채로 `next build`를 돌리지 않는다**(CLAUDE.md "개발 명령어").

---

## 0. 결정 기록

| 날짜 | 결정 |
| --- | --- |
| 2026-10-15 | 정원 **8명** · 체력 0이면 **탈락**(관전 전환), 판은 계속 · 턴 제한 20라운드 유지 · **CSS 프레임은 개인전에 먼저 시범 적용** |
| 2026-10-15 | 개인전은 **순위전**. 승리선을 채우면 승리, 체력을 모두 잃으면 패배 · **승리한 순서대로 1위부터**, **패배한 순서대로 꼴찌부터** 순위 |
| 2026-10-15 | **모든 판에서 1위부터 꼴찌까지 순위를 정하되, 승리 화면은 1위만**(처음에는 1·2·3위였다 — 3명 이하 판에서 꼴찌까지 승리 화면이 되는 문제로 바꿨다) |
| 2026-10-15 | **시작 인원이 5명 이상이면 한 차례에 기술 2장**(4명 이하 1장) |
| 2026-10-15 | 개인전에서는 **서버가 기술을 대신 고르는 기능을 없앤다** — 기술 선택 중 시간이 다 되면 그대로 차례 종료 |

---

## 1. 요구사항

### 대기 화면

| # | 요구 |
| --- | --- |
| L1 | 방 만들기에 **팀전 / 개인전** 선택 버튼. 팀전은 현재 방식 유지 |
| L2 | 개인전 플레이어 목록은 **한 블록 안에** 표기 |
| L3 | **자기 색깔 선택** — 사각형 색 버튼 12개, **중복 불가** |

### 게임 화면

| # | 요구 |
| --- | --- |
| G1 | 프레임을 **CSS로 다시 구현** — `play_frame.webp`를 대체, 갈색·크림 베이지 기반(**개인전에만** 시범 적용) |
| G2 | 특허랑이를 쓸 때 **상대 선택 화면** — 화면을 어둡게(검정, 불투명도 0.5), 상대 닉네임 버튼으로 고른다(시연 4장의 결말 고르기 화면 참고) |
| G3 | **상대의 턴**일 때 카드 필드에 그 사람이 고른 색으로 은은한 빛 |
| G4 | **왼쪽**은 자신의 레벨·경험치 표시 유지 |
| G5 | **오른쪽**에 상대 전원의 정보 — 한 칸을 좌우로 나눠 왼쪽 체력바, 오른쪽은 위 닉네임 · 아래 동물별 레벨과 경험치 |
| G6 | 기술 카드 CSS — <https://poke-holo.simey.me/> 를 참고해 hover 시 확대 + 홀로그램 + 포인터 좌표에 따른 3D 기울기(**팀전·개인전 공통**) |

> G2 — **규칙상 상대를 고르는 기술은 특허랑이 하나뿐이다.** 상표토끼(내 체력)·디자인어(내
> 배율)·실용신양(내 추가 뽑기)은 상대가 필요 없으므로 상대 선택 화면을 띄우지 않는다.

---

## 2. 규칙 명세 (개인전)

여기 적힌 것이 개인전 규칙의 전부다. **팀전 규칙은 하나도 바뀌지 않는다.**

### 2-1. 판의 구성

- 플레이어 **2~8명**. 관전자는 인원에 들어가지 않고 상한도 없다.
- 각 플레이어가 **한 편(side)**이다. 편 id는 `'p1'`…`'p8'`(대기실에 들어온 순서로 붙인다).
- **차례 순서**: 게임을 시작할 때 편 목록을 **한 번 무작위로 섞어** `turnOrder`로 정한다.
  첫 차례는 `turnOrder[0]`이다. 판 도중에는 바뀌지 않는다.
- 시작 체력·승리선·축제·제한시간·일시정지 등 방 설정(`GameSettings`)은 팀전과 같은 값을 쓴다.
- **시작 공유 카드 2장**(`dealOpeningSharedCards`)도 팀전과 똑같이 깐다.

### 2-2. 차례 한 번의 흐름

1. 장소를 하나 클릭한다(팀전과 같다 — 직전 장소 금지, 예약 뽑기·축제 뽑기 먼저 소모, 정산).
2. 기술을 고른다. **한 차례에 쓸 수 있는 기술 수(`skillsPerTurn`)**:
   - 게임 **시작 인원이 4명 이하**면 **1장**, **5명 이상**이면 **2장**.
   - 시작할 때 한 번 정하고 **판 도중에는 바뀌지 않는다**(탈락으로 인원이 줄어도 그대로).
3. 기술을 하나 쓴 뒤 아래 중 하나라도 해당하면 **차례가 끝난다**. 아니면 다시 기술 선택 대기.
   - 이번 차례에 쓴 기술 수가 `skillsPerTurn`에 닿았다.
   - 더 쓸 수 있는 기술(레벨 1 이상인 동물)이 없다.
   - 방금 기술로 **내 순위가 정해졌다**(승리선 도달).
   - 판이 끝났다.
4. [턴 마치기]를 누르면 언제든(첫 번째든 두 번째든) 곧바로 차례가 끝난다.

> 한 차례에 같은 동물을 두 번 쓸 수는 없다 — 기술을 쓰면 그 동물의 경험치가 `레벨 × 문턱`만큼
> 빠져 남는 값이 언제나 문턱보다 작아지므로 레벨이 0이 된다. 따로 막는 코드는 필요 없다.

### 2-3. 기술

- 네 기술의 효과는 팀전과 같다(`skills.ts`의 `applySkillChoice`).
- **특허랑이는 대상(`target`)을 반드시 받는다.** 대상은 **순위가 정해지지 않은 다른 플레이어**여야
  한다. 그렇지 않으면 서버는 그 요청을 무시한다(이벤트 없음 — 기존 "레벨 0인 기술 요청"과 같은 처리).
- 강탈은 지금처럼 보존형이다 — 대상이 가진 만큼만 가져온다.
- 배율(디자인어)은 지금처럼 편마다 따로 쌓인다.

### 2-4. 순위 — 승리·패배·판의 끝

**승리선** = `settings.targetScore × 2`(팀전과 같은 승리선. 화면의 "목표 n점"은 시작 체력이고,
그 두 배에 닿는 것이 "목표 점수를 채운다"이다).

- **승리**: 기술을 쓴 직후 체력이 승리선 **이상**이면 그 사람은 승리. **승리한 순서대로 1위, 2위, …**
- **패배**: 기술을 쓴 직후 체력이 **0 이하**면 그 사람은 패배(탈락). **패배한 순서대로 꼴찌(N위),
  N−1위, …**
- **순위가 정해진 사람은 판에서 빠진다** — 차례가 오지 않고, 특허랑이의 대상이 될 수 없고, 체력이
  더 이상 변하지 않는다. 화면은 관전 시점으로 바뀐다(조작 불가). 승리자도 마찬가지다.
  > 승리자를 대상으로 남겨 두면 다른 사람이 승리자의 높은 체력을 빼앗아 승리선까지 쉽게 가고,
  > 이미 정해진 순위와 체력이 어긋난다. 그래서 순위가 정해지는 순간 판에서 뺀다.
- **판의 끝**: 순위가 정해지지 않은 사람이 **1명 이하**가 되는 순간. 남은 1명은 **남은 순위**를 받는다
  (예: 6명 중 2명 승리·3명 패배 → 남은 1명은 3위).
- **턴 제한**: 라운드가 20을 넘으면(`MAX_TURN`, 팀전과 같다) 판이 끝나고, 순위가 정해지지 않은
  사람들은 **체력이 높은 순서대로 남은 순위를 위에서부터** 받는다. **체력이 같으면 같은 순위**이고,
  그다음 순위는 그 인원만큼 건너뛴다(예: 남은 순위가 2위부터이고 체력이 10·10·5면 2위·2위·4위).
- **판정 시점**: 체력은 기술로만 움직이므로 **기술 하나를 적용할 때마다** 판정한다(팀전처럼 차례가
  끝날 때만 판정하면, 2장 규칙에서 첫 기술로 0이 된 사람이 두 번째 기술의 대상 목록에 남는다).
  한 기술에서 승리와 패배가 함께 날 수 있다(특허랑이로 상대를 0으로 만들며 내가 승리선에 닿음) —
  둘 다 기록한다. 승리 쪽을 먼저 기록한다.
- **승리 화면**: 최종 순위가 **1위**인 사람만 승리 화면, 나머지는 모두 패배 화면. 순위표에는
  인원수와 상관없이 **1위부터 꼴찌까지 전원**의 순위가 나온다.
  턴 제한으로 체력이 같아 **공동 1위**가 되면 그 사람들 모두 승리 화면이다.
- **`gameEnd.winner`**: 1위의 편 id(1위가 둘 이상이면 `'draw'`) — 기존 화면 코드와의 호환용이다.
  개인전 화면은 `winner`가 아니라 순위표를 읽는다.

**예시 — 6명(p1~p6)**

| 사건 | 순위 |
| --- | --- |
| p3 체력 0 | p3 = **6위** |
| p1 승리선 도달 | p1 = **1위** |
| p5 체력 0 | p5 = **5위** |
| p6 체력 0 | p6 = **4위** |
| p2 승리선 도달 | p2 = **2위** |
| 남은 사람 p4 1명 → 판 끝 | p4 = **3위** |

승리 화면: p1 / 패배 화면: 나머지 다섯 명. 순위표에는 1위 p1부터 6위 p3까지 전원이 나온다.

### 2-5. 시간초과·이탈·일시정지

| 상황 | 개인전 처리 |
| --- | --- |
| 장소 선택 중 시간초과 | **팀전과 같다** — 서버가 무작위 장소를 대신 고른다 |
| 기술 선택 중 시간초과(첫 번째든 두 번째든) | **기술을 고르지 않은 것으로 보고 차례 종료**. 서버가 기술을 대신 고르지 않는다 |
| 특허랑이 대상을 고르다 시간초과 | 위와 같다 — 기술 없이 차례 종료 |
| 항복하기 · 나가기 | 그 사람이 **패배**(꼴찌 쪽부터 순위). 판은 계속된다 |
| 연결 끊김 | 탈락시키지 않는다. 그 사람 차례는 시간초과 규칙대로 흘러간다(장소 무작위 → 기술 없이 종료). 재접속하면 이어서 둔다 |
| 다른 방으로 옮겨감(`detach`) | 나가기와 같다(패배) |
| 일시정지 | **아무에게도 묻지 않고 즉시 멈춘다.** 횟수·시간 제한(`pauseMaxCount`·`pauseMaxMin`)은 팀전처럼 **사람마다** 적용. 다시 시작은 멈춘 사람만 |

### 2-6. 기본값으로 구현하는 것 — 바꾸려면 사용자가 말한다

| 항목 | 기본값 | 비고 |
| --- | --- | --- |
| 최소 인원 | 2명 | |
| 홀로 카드(G6) | 팀전·개인전 모두 | 같은 컴포넌트(`SkillChoiceBar`)라 자연히 함께 바뀐다 |

### 2-7. 밸런스 메모 — 수치를 정하기 전에 재 볼 것

- **기술 2장이면 "디자인어 → 특허랑이"가 한 차례에 끝난다.** 지금은 배율을 쌓은 뒤 상대가 한 수
  둘 동안 그 배율이 드러나 있는데, 2장 규칙에서는 예고 없는 한 방이 된다. 이 규칙은 5명부터 켜지므로
  **4명 판과 5명 판의 성격이 크게 다를 수 있다.**
- 특허랑이에 대상이 생기면 1위 협공이나 약자 사냥이 생긴다.
- 판의 최대 길이: 8명 × 20라운드 = **160차례**.
- §4의 T2-7 시뮬레이션으로 2·4·5·8명의 평균 종료 라운드, 승리 경로(승리선/패배/턴 제한), 한 차례
  콤보 빈도를 재고 사용자에게 보고한다. **수치(목표 점수 기본값 등)는 그 보고를 보고 사용자가 정한다** —
  구현하는 쪽이 임의로 바꾸지 않는다.

---

## 3. 설계 요약

### 3-1. 핵심 아이디어 — 개인전은 "1인 편이 N개"다

엔진은 이미 **한 편에 여러 명**을 지원한다(차례가 오면 편 안에서 다음 사람으로 — `advanceTurn`의
`playerIndex`). 그러니 개인전 엔진을 따로 만들지 않는다.

```text
팀전    편 2개 ('A', 'B')        · 편마다 여러 명 · 지금과 똑같다
개인전  편 N개 ('p1' … 'p8')     · 편마다 1명
```

할 일은 **"편이 둘"을 "편이 N개"로 일반화**하는 것이다. 지금 이 전제가 박힌 곳:

| 어디에 | 무엇이 | 얼마나 |
| --- | --- | --- |
| `shared/types.ts` | `type Team = 'A' \| 'B'`, `teams: Record<Team, TeamState>` | 타입의 뿌리 |
| 엔진·방·화면 | "상대 = 반대편"을 `team === 'A' ? 'B' : 'A'`로 **뒤집어** 구한다 | **17군데**(§부록 A) |
| 프로토콜·직렬화·화면 | `Record<Team, …>`(팀 이름·멤버·일시정지 횟수 등) | 약 25군데 |
| `server/serializer.ts` | `teams: { A: {...}, B: {...} }`처럼 **A·B 키를 손으로 하나씩** 복사 | 편이 늘면 조용히 빠진다 |
| `GameLayout.tsx` | 팀 패널·체력판을 `team="A"` / `team="B"` **고정 칸**으로 그린다 | 칸 4개 |

### 3-2. 위험을 나누는 방식

- **1단계는 "팀전만, 동작 불변"으로 끝낸다.** 엔진을 일반화하되 개인전은 아직 넣지 않고, 기존
  테스트가 **하나도 고치지 않은 채로** 전부 통과하는지 본다. 그다음에 개인전을 얹는다.
- **기존 함수의 시그니처는 그대로 두고 새 것을 더한다.** 예: `initGame(teamA, teamB, rng, settings)`는
  그대로 두고 `initIndividualGame(...)`을 추가한다. `processSkillChoice(state, animal)`에는 선택 인자
  `target?`만 더한다. 그래야 기존 테스트·봇 스크립트·시연 코드가 손대지 않고 그대로 돈다.
- **개인전 화면은 새 컴포넌트로 만든다**(`IndividualLayout`). 팀전 `GameLayout`은 건드리지 않는다
  — CSS 프레임 시범(G1)이 팀전 화면을 한 픽셀도 움직이지 않게 하기 위해서다.

---

## 4. 작업 목록

각 작업: **파일 · 할 일 · 완료 조건**. 앞 작업의 완료 조건이 초록불일 때만 다음으로 간다.
P7(홀로 카드)은 다른 작업과 얽혀 있지 않아 언제 해도 된다.

### P0. 준비

**T0-1 팀전 화면 기준값 저장** — 이후 팀전 화면이 움직이지 않았는지 재기 위한 기준.
- WS 서버(8080)와 화면(3000)을 띄운 뒤 `cd client && node scripts/measurePlay.mjs --save team-before`.
- ⚠️ 저장소의 `baseline`은 오래돼(플레이 UI 초기 `e747bac`) 이미 48개 상자가 어긋나 있다. 그것과 비교하지 말 것.
- 완료 조건: `client/play-baselines/team-before.json`이 생겼다. **커밋하지 않는다**(로컬 비교용).

### P1. 엔진 일반화 — 팀전만, 동작 불변

**T1-1 타입 확장** — `shared/types.ts`
- `export type SideId = string;` 추가. `Team = 'A' | 'B'`는 **그대로 둔다**(팀전 전용 코드가 계속 쓴다).
- `GameState`: `activeTeam`·`pendingChoice`·`teams` 키·`winner`·`startingTeam`·`forfeitedBy`를 `SideId`로.
  새 필드 `mode`·`turnOrder`·`skillsPerTurn`·`skillsUsedThisTurn`·`ranks` 추가(정의는 §부록 B).
- `TeamState`: 선택 필드 `color?`, 그리고 `finish?` 추가(§부록 B).
- `StackedCard.collectedBy`·`GameEvent`의 `team`·`hpAfter`·`winner`도 `SideId`로. `GameEvent`에
  `ranked` 이벤트 추가, `skillApplied`에 `target?` 추가.
- 완료 조건: `server`·`client` 모두 tsc 통과(새 필드 때문에 깨지는 곳은 T1-3·T1-4에서 함께 고친다 —
  이 작업과 T1-2~T1-4는 한 커밋으로 묶어도 된다).

**T1-2 편 헬퍼** — 새 파일 `shared/sides.ts`(그리고 `shared/index.ts`에서 재export)
```ts
/** 순위가 정해지지 않은(아직 판에 있는) 편들 — turnOrder 순서 그대로. */
export function activeSides(state: GameState): SideId[];
/** side를 뺀 나머지 활성 편들. 팀전이면 언제나 [반대편] 하나다. */
export function opponentsOf(state: GameState, side: SideId): SideId[];
/** turnOrder에서 from 다음의 활성 편. from 자신이 이미 순위가 정해졌어도 그 자리에서부터 센다. */
export function nextActiveSide(state: GameState, from: SideId): SideId | null;
```
- 팀전에서 `opponentsOf(state, 'A')`는 `['B']`, `nextActiveSide(state, 'A')`는 `'B'`여야 한다.
- 완료 조건: 이 세 함수의 단위 테스트(`server/__tests__/sides.test.ts`) — 팀전 2편, 개인전 5편, 일부 순위 확정.

**T1-3 엔진의 뒤집기 제거** — `server/engine/skills.ts`, `server/engine/turnManager.ts`
- `initGame`: `mode: 'team'`, `turnOrder: [startingTeam, 반대편]`, `skillsPerTurn: 1`,
  `skillsUsedThisTurn: 0`, `ranks: {}`를 채운다. 나머지는 그대로.
- `applySkillChoice`: `opponent`를 `opponentsOf(state, team)[0]`로(팀전은 하나뿐). 시그니처에
  `target?: SideId` 추가 — 주어지면 그것을 대상으로 쓴다(개인전은 T2-3에서 사용).
- `advanceTurn`: `nextTeam`을 `nextActiveSide`로, "후공 팀이 끝나면 turn++"을 **"`turnOrder`에서
  다음 편의 위치가 지금 편의 위치보다 앞이면(한 바퀴를 돌았으면) turn++"**로. 팀전에서 두 식은 같은
  결과를 낸다. 차례가 넘어갈 때 `skillsUsedThisTurn = 0`.
- `checkKnockout`·`determineWinnerByHp`는 **팀전 경로 그대로 둔다**(개인전은 T2-2의 새 함수).
- 완료 조건: **기존 서버 테스트 전부 통과(테스트 파일은 한 줄도 바꾸지 않았다)**.

**T1-4 직렬화 일반화** — `server/serializer.ts`
- `teams`, `memberIds`, `pauseUsed`를 `A`·`B` 손 복사 대신 `Object.keys(state.teams)`를 도는 코드로.
- 새 필드(`mode`, `turnOrder`, `skillsPerTurn`, `skillsUsedThisTurn`, `ranks`, `TeamState.color`·`finish`)도 싣는다.
- 완료 조건: 기존 테스트 통과 · 혼자 놀기 한 판을 실제로 띄워 화면에 이상이 없다.

**T1-5 나머지 뒤집기 정리 + 재발 방지 테스트**
- §부록 A 표에서 **"바꾼다"**로 표시된 곳을 헬퍼로 바꾼다. **"팀전 전용"**으로 표시된 곳은 그대로 둔다.
- 새 테스트 `server/__tests__/noTeamFlip.test.ts`: `server/`·`shared/`·`client/{hooks,components,lib}`의
  `.ts/.tsx`를 읽어 정규식 `/=== '[AB]' \? '[AB]' : '[AB]'/`가 **허용 목록(팀전 전용 파일·줄) 밖에서**
  나오면 실패. (`Team`을 `string`으로 넓혀도 이 뒤집기는 아무 문제 없이 컴파일되므로 컴파일러가 못
  잡는다 — 이 테스트가 그물이다.)
- 완료 조건: 모든 테스트 통과 · 팀전 다같이 놀기(창 2개) 한 판, 혼자 놀기 한 판, 시연 1~4장을 직접 확인.

### P2. 엔진 — 개인전

새 테스트 파일 `server/__tests__/individual.test.ts`에 §부록 C의 케이스를 작업마다 더한다.
테스트 패턴은 `effects.test.ts`를 따른다(결정론적 RNG `rng0`/`rngLast`, `clearStacks`로 시작 카드 걷기).

**T2-1 개인전 시작** — `server/engine/turnManager.ts`
```ts
export function initIndividualGame(
  players: { side: SideId; nickname: string; color: PlayerColorId }[],
  rng: RNG,
  settings?: Partial<GameSettings>,
): GameState
```
- 편마다 `TeamState`(members는 그 1명), `mode: 'individual'`, `turnOrder` = 편 id를 `rng`로 섞은 것,
  `startingTeam = turnOrder[0]`, `skillsPerTurn = players.length >= 5 ? 2 : 1`, 시작 공유 카드.
- `settings.firstTeam`은 개인전에서 쓰지 않는다(순서는 섞어서 정한다). `startingTeamReason: 'random'`.

**T2-2 순위 판정** — `server/engine/ranking.ts`(새 파일)
```ts
/** 기술 하나를 적용한 직후 부른다. 순위를 기록하고 ranked/gameEnd 이벤트를 돌려준다. */
export function resolveRanks(state: GameState): GameEvent[];
/** 턴 제한으로 끝날 때 — 남은 사람을 체력순으로 순위 매기고 판을 끝낸다. */
export function rankByHpAndEnd(state: GameState): GameEvent[];
```
- 의사코드는 §부록 D. 순위는 `state.teams[side].finish = { rank, reason }`와 `state.ranks[side]`에 기록.
- 판이 끝나면 `phase = 'ended'`, `pendingChoice = null`, `winner` = 1위(동률이면 `'draw'`),
  `gameEnd { reason: 'ranked' | 'turnLimit' }` — `reason`에 `'ranked'`를 새로 추가한다.

**T2-3 기술 선택 흐름** — `server/engine/gameEngine.ts`의 `processSkillChoice(state, animal, target?)`
- 팀전(`mode === 'team'`)이면 **지금 코드 그대로**.
- 개인전:
  1. 레벨 0이면 무시(지금과 같다).
  2. `animal === 'tiger'`이면 `target`이 `opponentsOf(state, team)`에 들어 있어야 한다. 아니면 무시(빈 이벤트).
  3. `applySkillChoice(state, team, animal, target)` → `resolveRanks(state)`.
  4. 판이 끝났으면 그대로 반환.
  5. `skillsUsedThisTurn += 1`. §2-2의 3번 조건 중 하나라도 맞으면 `pendingChoice = null` 후
     `advanceTurn`, 아니면 `pendingChoice`를 **그대로 둔다**(화면의 행동 선택 칸이 다시 살아난다).
- `processPass`는 개인전에서도 곧바로 차례 종료(팀전과 같다 — 단 승패 판정은 하지 않는다. 체력이
  변하지 않았으므로).
- ⚠️ 차례 종료 때 개인전은 `finishTurn`(= `checkKnockout` + `advanceTurn`)이 아니라 **`advanceTurn`만**
  부른다. 판정은 이미 기술마다 했다.

**T2-4 시간초과** — `processTimeout`
- 장소 대기 중: 팀전과 같다(무작위 장소).
- 기술 대기 중이고 개인전: 기술을 고르지 않고 **차례 종료**. 이벤트는 `timeoutChoice { animal: null }` +
  `skillPassed { auto: true }`. ⚠️ 화면이 `timeoutChoice.animal === null`을 "고를 행동이 없어 자동 패스"로
  설명하고 있다면(`useAnimationQueue.ts`·해설 문구 확인) 개인전에서는 "시간 초과로 차례를 넘겼어요"가
  되도록 고친다.

**T2-5 축제·턴 제한** — `advanceTurn`
- 축제 예약은 `nextActiveSide`(다음 **활성** 편)에게.
- 개인전에서 `turn > MAX_TURN`이면 `rankByHpAndEnd`.

**T2-6 단위 테스트** — §부록 C의 엔진 케이스 전부.

**T2-7 봇 시뮬레이션(보고용)** — `server/scripts/individualSim.ts`(새 파일)
- `simulation.test.ts`·`skillBalanceSuite.ts`를 참고해 2·4·5·8명 각 500판. 봇은 무작위 장소 +
  쓸 수 있는 기술 중 무작위(특허랑이 대상도 무작위).
- 출력: 평균 종료 라운드, 종료 이유(순위 확정/턴 제한) 비율, 순위가 승리로 정해진 비율 vs 패배로 정해진
  비율, 한 차례에 디자인어 다음 특허랑이를 쓴 비율. **모든 판이 유한 라운드 안에 끝나는지** 확인.
- 완료 조건: 결과를 표로 사용자에게 보고. **수치는 바꾸지 않는다**(§2-7).

### P3. 방·프로토콜

**T3-1 프로토콜** — `shared/protocol.ts`, `shared/constants.ts`
- `GameMode = 'team' | 'individual'`.
- `createRoom`에 `mode?: GameMode`(없으면 `'team'` — 옛 클라이언트 호환).
- `chooseSkill`에 `target?: SideId`.
- 새 메시지 `{ type: 'selectColor'; color: PlayerColorId }`.
- `LobbyPlayer`에 `color?: PlayerColorId`. `lobbyState`에 `mode: GameMode`.
- 자리: `Seat`에 `'player'` 추가 — 개인전 대기실에서 "플레이어석"(팀전의 A/B에 해당).
  `isPlayingSeat`는 `'A' | 'B' | 'player'`를 참으로. 기존 `SEATS`(`['A', 'B', 'spectator']`)는 팀전 목록으로
  그대로 두고, 개인전용 `INDIVIDUAL_SEATS = ['player', 'spectator']`를 따로 둔다(대기실의 자리 이동 버튼이 읽는다).
- `ErrorCode`에 `'COLOR_TAKEN'`.
- `shared/constants.ts`에 `INDIVIDUAL_MAX_PLAYERS = 8`, `INDIVIDUAL_MIN_PLAYERS = 2`,
  `INDIVIDUAL_TWO_SKILLS_FROM = 5`, `PLAYER_COLORS`(§부록 B의 12색).
- `ClientGameState`: `teamNames`·`memberIds`·`pauseUsed`를 `Record<SideId, …>`로. 개인전에서
  `teamNames[side]`는 닉네임이다.

**T3-2 방** — `server/room.ts`
- `mode` 필드. `createRoom` 처리(`gameServer.ts`)에서 `addPlayer`에 넘긴다. 방이 살아 있는 동안 불변.
- 개인전 입장(`addPlayer`):
  - ⚠️ **참가 화면(`JoinRoomForm`)은 방 종류를 모른 채** 자리를 `'A'`/`'B'`/`'spectator'`로 보낸다. 개인전 방에서는
    `'A'`·`'B'`·`'player'`를 모두 **`'player'`로 받는다**(`'spectator'`는 그대로 관전석).
  - 플레이어석이 이미 8명이면 **관전석으로 받고** 채팅 안내줄(`pushSystem`)로 알린다 — 방에 들어온 사람을
    튕기지 않는다. `ROOM_FULL` 에러는 쓰지 않는다.
  - 플레이어석에 앉으면 **비어 있는 첫 색**(`PLAYER_COLORS` 순서)을 배정한다.
- `selectColor`: 다른 사람이 쓰는 색이면 `COLOR_TAKEN` 에러. 게임 시작 후에는 무시.
- `movePlayer`: 개인전에서 관전석 → 플레이어석은 8명 상한·색 배정을 함께 검사.
- `startBlockReason`: 개인전은 플레이어 2~8명 · 전원 준비 · 색 중복 없음.
- `tryStartGame`: 개인전이면 플레이어석 순서대로 `p1…pN`을 붙여 `initIndividualGame`. 편 → playerId
  대응을 `sidePlayerIds: Record<SideId, string[]>`(편마다 1명)로 보관하고, `expectedPlayerId(side)`가 그것을 읽게 한다.
- `handleChooseSkill(playerId, animal, target?)`: 엔진에 `target`을 넘긴다.
- 일시정지(`handlePauseRequest`): 개인전이면 묻지 않고 `applyPause`. 횟수는 편마다(`pauseUsed[side]`).
- 항복·나가기·`detach`(`forfeit`): 개인전이면 판을 끝내지 않는다 — 그 편을 `finish = { rank: 다음 꼴찌 순위,
  reason: 'forfeit' }`으로 기록하고 `resolveRanks`처럼 판의 끝을 검사한다. 지금 차례가 그 사람이었으면 다음
  사람으로 넘긴다. 이벤트는 `ranked`(+ 판이 끝나면 `gameEnd`).
- ⚠️ `removeFromGame`은 지금 `teamPlayerIds`에서 그 사람을 **잘라낸다**(`splice`). 개인전에서 그러면
  편 → 사람 대응이 어긋난다. 개인전에서는 연결만 정리하고 `sidePlayerIds`는 그대로 둔다(순위표에 남아야 한다).
- 혼자 놀기(`addSoloPlayer`)·시연(`demo`)은 언제나 팀전이다 — 건드리지 않는다.

**T3-3 방 테스트** — `server/__tests__/individualRoom.test.ts`
- `spectator.test.ts`의 가짜 WebSocket 방식, **`jest.useFakeTimers()` 필수**(게임을 시작하면 실제 턴 타이머가 걸린다).
- §부록 C의 방 케이스 전부.

### P4. 대기 화면

**T4-1 방 만들기 토글** — `client/components/lobby/CreateRoomForm.tsx`, `client/app/page.tsx`, `client/hooks/useWebSocket.ts`
- [팀전 | 개인전] 토글. 개인전이면 자리 선택(`TeamSelect`)과 팀 이름 두 칸을 숨긴다.
- `useWebSocket.createRoom`에 `mode` 인자 추가.
- ⚠️ **로비 폼에 항목을 더하면 반드시 `client/scripts/measureLobby.mjs`로 다시 잰다**(CLAUDE.md).
  방 만들기 폼은 접힌 동안 스크롤을 잠가 두어서(`overflow: hidden`), 넘쳐도 눈에 안 보이고 대신
  [게임 규칙] 펼치기 버튼이 잘려 사라진다. 측정은 팀전·개인전 두 상태 모두.
- 완료 조건: `measureLobby.mjs` "문제 없음"(**규칙을 접은 상태에서 스크롤이 없어야 한다**).

**T4-2 개인전 대기실** — `client/components/lobby/WaitingRoom.tsx`
- `lobbyState.mode === 'individual'`이면 두 팀 열(`TeamColumn`) 대신 **한 블록**에 플레이어 전원
  (줄마다 색 칩 · 닉네임 · 준비 상태 · 방장 표시). 관전자 줄(`SpectatorRow`)은 그대로.
- 색 고르기 `ColorPicker`(새 컴포넌트): 사각형 12칸. 내 색은 굵은 테두리, 남이 쓴 색은 비활성 +
  `title`로 그 사람 닉네임. 클릭하면 `selectColor`.
- 팀 이름 칸(`TeamNameRow`)·팀 이동 버튼은 개인전에서 숨긴다.
- ⚠️ **색만으로 사람을 구분하게 두지 않는다** — 화면 어디서든 색 옆에 닉네임을 함께 쓴다.
- 완료 조건: 창 3개로 개인전 방을 만들어 색 중복이 막히는지, 9번째 입장이 관전석으로 가는지 확인.

### P5. 게임 화면 골격

**T5-1 내 편 알아내기** — `client/app/room/[roomId]/page.tsx`
- 지금은 대기실에서 저장한 `sessionStorage.cardBattle_team`으로 `myTeam`을 정한다. 개인전에서는
  `gameState.memberIds`에서 **내 `playerId`가 들어 있는 편**을 찾아 쓴다.
- 개인전이면 `GameLayout` 대신 `IndividualLayout`을 그린다. **팀전 `GameLayout`은 건드리지 않는다.**

**T5-2 CSS 프레임 + 배치** — 새 컴포넌트 `client/components/game/IndividualLayout.tsx`, `globals.css`
```text
┌──────────┬────────────────────────────┬──────────────────┐
│ 나       │                            │ 상대 1 ▮▮▮ 닉네임 │
│ 동물 4줄 │        카드 필드            │        🐑2 🐰1 … │
│ 레벨·경험│      (장소 4 + 중앙 스택)    │ 상대 2 …          │
│          │                            │ …                │
├──────────┼────────────────────────────┤ 상대 7            │
│ 내 체력  │  기술 카드 4 + 턴 마치기    │                  │
└──────────┴────────────────────────────┴──────────────────┘
```
- CSS grid로 짜고 테두리는 갈색·크림 베이지. 클래스는 **`.play-frame-css` 아래에만** 건다 — 기존
  `.play-frame`·`.play-cell-*`(그림 좌표)는 손대지 않는다.
- 안쪽 칸들은 기존 컴포넌트를 재사용한다: 카드 필드 `GameBoard`, 기술 띠 `SkillChoiceBar`, 내 패널
  `TeamPanel`, 내 체력 `TeamTotalPanel`.
- ⚠️ **액자가 바깥, 그림이 안쪽**(CLAUDE.md "플레이 화면의 나무 UI") — 장소 타일·기술 컷신은
  `--frame-inset` 안쪽에 앉는다.
- ⚠️ 새 줄을 끼우면 아래 칸이 밀린다 — 안내 문구는 기존 안내 자리(`.play-prompt-strip`)에 얹는다.

**T5-3 상대 목록** — 새 컴포넌트 `OpponentList.tsx`
- 칸마다 `[체력바 | 닉네임(색 칩) / 🐑 🐰 🧜‍♀️ 🐯 레벨·경험치]`. 최대 7칸, 한 열.
- **순위가 정해진 사람도 남긴다** — 흐리게, 체력바 자리에 "n위 · 승리" 또는 "n위 · 탈락". 칸이 빠지면
  나머지가 밀려 올라가 누가 떨어졌는지 따라가기 어렵다.
- 체력바·경험치는 **연출이 끝난 뒤의 값**(`animState.displayedExp`)을 쓴다 — `gameState`를 바로 읽으면
  카드가 도착하기도 전에 숫자가 오른다(CLAUDE.md "애니메이션과 실제 로직의 순서").

**T5-4 측정**
- 팀전: `node scripts/measurePlay.mjs --diff team-before` → **움직인 상자 0개**여야 한다.
- 개인전: `measurePlay.mjs`는 혼자 놀기(팀전)로만 들어가므로, 다같이 놀기로 개인전 방을 만들어 2·5·8명으로
  들어가는 측정 스크립트를 새로 만든다(`client/scripts/measureIndividual.mjs`, 브라우저 창 여러 개를
  puppeteer로). 1600×900·1366×768에서 상대 7칸이 넘치지 않는지 스크린샷과 수치로 확인.

### P6. 상호작용

**T6-1 상대 선택 화면** — 새 컴포넌트 `TargetPicker.tsx`(시연 4장의 `DemoSceneMenu.tsx`를 본뜬다)
- `position: fixed` 오버레이, 배경 `rgba(0, 0, 0, 0.5)`.
- 버튼마다 색 칩 · 닉네임 · 현재 체력. 대상 = `opponentsOf`(나 자신과 순위 확정자 제외).
- 숫자 키 1~7로도 고른다. **ESC·바깥 클릭으로 취소**(다른 기술로 바꿀 수 있게).
- 흐름: `SkillChoiceBar`에서 특허랑이 클릭 → (개인전이면) 오버레이 → 대상 클릭 → `chooseSkill(animal, target)`.
  팀전은 지금처럼 곧바로 `chooseSkill(animal)`.
- ⚠️ 턴 타이머는 멈추지 않는다 — 오버레이 안에 남은 시간을 보여준다. 시간이 다 되면 서버가 차례를
  끝내므로(§2-5) 오버레이도 닫힌다(`pendingChoice`가 내 것이 아니게 되면 닫는다).
- ⚠️ 일시정지 창이 떠 있으면 숫자 키를 받지 않는다(시연에서 "멈춤 창을 뚫고 들어오는 키보드" 버그가
  있었다 — CLAUDE.md "시연 모드").

**T6-2 상대 턴의 빛** — `IndividualLayout`
- 지금 차례인 사람이 내가 아니면 카드 필드에 그 사람 색으로 은은한 `box-shadow`(천천히 숨 쉬듯 —
  `@keyframes`). 색은 CSS 변수로 흘린다. `prefers-reduced-motion`이면 숨쉬기 없이 고정 빛.
- 기준은 **화면상 차례**(`animState.displayedActiveTeam`) — 서버의 `activeTeam`은 연출보다 먼저 넘어간다.

**T6-3 기술 2장 안내** — `skillsPerTurn === 2`일 때 기술 띠 근처에 "기술 1/2장째" / "2/2장째".
기존 안내 자리에 얹는다(새 줄 금지).

**T6-4 연출의 대상** — `client/hooks/useAnimationQueue.ts`
- 895줄 부근 `const opp: Team = team === 'A' ? 'B' : 'A'` → `skillEv.target ?? (팀전의 반대편)`.
  특허랑이 슬래시·체력 구슬이 **서버가 알려준 대상**에게 터져야 한다.
- 996줄 부근(결정타의 `loser`)은 팀전 전용 — 개인전 `gameEnd`에서는 결정타 연출을 건너뛴다.
- `ranked` 이벤트: 그 사람 칸에 "n위 확정" 배너(승리면 밝게, 패배면 어둡게).

**T6-5 미리보기** — `client/lib/skills.ts`의 `previewSkill`
- 특허랑이 미리보기는 지금 "상대 체력만큼으로 잘라" 보여준다(42줄). 개인전에서는 대상이 정해지기 전이라
  자를 상대가 없으므로 **자르지 않은 값**을 "최대 n"으로 보여준다.

### P7. 홀로 카드 (팀전·개인전 공통, 언제 해도 됨)

**T7-1** — `client/components/game/SkillChoiceBar.tsx`, `globals.css`
- 기법: 포인터 좌표를 카드 기준 0~1로 → CSS 변수 `--mx`·`--my`(광택 위치), `--rx`·`--ry`(기울기 각도)
  → `transform: perspective(…) rotateX(var(--rx)) rotateY(var(--ry)) scale(…)`. 그 위에 무지개
  그라디언트 층(`mix-blend-mode: color-dodge` 계열)과 포인터를 따라가는 광택(`radial-gradient` at
  `var(--mx) var(--my)`). `pointermove`는 `requestAnimationFrame`으로 묶어 프레임당 한 번만 쓴다.
  `pointerleave`에서 변수를 0으로 되돌리고 transition으로 원위치.
- ⚠️ **참고 사이트의 코드를 가져오지 않는다.** 원본 저장소(`simeydotme/pokemon-cards-css`)는
  **GPL-3.0**이라 복사하면 이 저장소 전체에 그 조건이 걸릴 수 있다. 원본은 Svelte라 그대로 쓸 수도 없다.
  기법만 참고해 새로 작성한다.
- ⚠️ **기울기·확대는 `<button>`이 아니라 감싸는 칸(`div.relative.h-full`)에 건다.** 버튼은 모서리를
  다듬느라 `overflow-hidden`이라 버튼을 확대하면 튀어나온 부분이 잘린다(가이드 손가락을 버튼 밖에
  그리는 것과 같은 이유 — 그 파일의 주석).
- 기존 장식과 겹치지 않게: 금색 액자·모서리 장식(`play-card-frame`의 `::before`/`::after`), 누를 수
  있는 칸의 빛(`skill-choice-glow`), 잠긴 칸(`skill-choice-bg-disabled`). **잠긴 카드(`disabled`)에는
  효과를 걸지 않는다.**
- `prefers-reduced-motion`이면 기울기·광택 끔. 터치 기기(hover 없음)는 효과 없음.
- 완료 조건: 1600×900·1366×768에서 확대된 카드가 잘리지 않는다 · 잠긴 카드 무반응 · 팀전
  `measurePlay.mjs --diff team-before` 움직인 상자 0개(효과는 transform이라 배치를 바꾸지 않아야 한다).

### P8. 마무리

**T8-1 순위 확정·관전 전환** — 내 순위가 정해지면(`ranked`의 대상이 나) 조작을 모두 잠그고 관전처럼
보이게 한다. ⚠️ **`myTeam`을 `null`로 바꾸지 않는다** — 그러면 내 패널·내 색까지 사라진다(지금 코드에서
`myTeam === null`은 "처음부터 관전자"라는 뜻). `finished` 같은 별도 상태로 다룬다. 결과 화면은 판이 끝날 때까지 기다린다.

**T8-2 결과 화면(순위표)** — `client/components/game/GameEndScreen.tsx`
- 개인전이면 순위표(순위 · 색 칩 · 닉네임 · 최종 체력 · 승리/패배/턴 제한 사유).
- 내 순위가 **1위면 승리 화면, 아니면 패배 화면**(§2-4 — 공동 1위도 승리 화면). 순위표는 1위부터 꼴찌까지 전원.
- 관전자(처음부터)는 순위표만.

**T8-3 실제 확인** — 2·4·5·8명(**4와 5는 기술 장수가 갈리는 경계라 반드시 둘 다**)으로 한 판씩 끝까지.
탈락한 뒤 관전으로 판 끝까지 · 처음부터 관전자로 한 판 · 도중 나가기 · 연결 끊고 재접속.

---

## 5. 모르고 건드리면 조용히 깨지는 곳

**주의 1 — `Team`을 넓히면 컴파일러가 뒤집기를 못 잡는다.** `team === 'A' ? 'B' : 'A'`는 `string`에서도
컴파일되고, 개인전에서 조용히 없는 편 `'B'`를 가리킨다. T1-5의 `noTeamFlip.test.ts`가 그물이다.

**주의 2 — 직렬화는 A·B 키를 손으로 복사한다.** `server/serializer.ts`가 `teams.A`·`teams.B`를 하나씩
적어 보내므로, 편이 늘어도 에러 없이 **나머지 편이 통째로 빠진 채** 화면에 간다(T1-4).

**주의 3 — "누가 0이 됐다"가 "게임 끝"이 아니다.** 팀전의 `checkKnockout`은 한쪽이 0이면 곧바로 판을 끝낸다.
개인전 경로에서 그것을 부르면 한 사람이 탈락하는 순간 전원의 판이 끝난다. 개인전은 `resolveRanks`만 부른다.

**주의 4 — 판정은 기술마다.** 차례가 끝날 때만 판정하면 2장 규칙에서 첫 특허랑이로 0이 된 사람이 두 번째
기술의 대상 목록에 남는다. 시연 4장이 같은 이유로 기술마다 판정한다(`server/demo/director.ts`의
`afterSkill`). 반대로 시연 2장은 **일부러** 판정하지 않는다 — 그 코드를 참고할 때 둘을 섞지 말 것.

**주의 5 — 두 번째 기술을 기다릴 때.** ① 서버의 `pendingChoice`는 **그대로 세워 둔다**(비우면 화면의 행동
선택 칸이 살아나지 않는다 — 시연 2장의 `syncPending`이 겪은 일). ② 턴 타이머는 **새로 건다**(`resetTimer`가
대기 상태를 보고 시간을 정한다 — 안 걸면 두 번째 선택이 0초로 시작하거나 시간이 영영 안 간다).
③ `skillsUsedThisTurn`은 차례가 넘어갈 때만 0으로.

**주의 6 — 라운드 카운터.** 개인전은 "turnOrder를 한 바퀴 돌았을 때" turn++다. 순위가 정해진 사람을 건너뛰어도
**위치 비교**로 판단하면 틀리지 않는다(T1-3). 축제 시작·단계 상승이 이 카운터에 묶여 있어(`festivalDrawInfoAt`),
여기가 틀리면 축제가 엉뚱한 턴에 열린다.

**주의 7 — 연출이 "상대"를 스스로 계산한다.** `useAnimationQueue.ts`가 특허랑이 대상을 뒤집기로 구한다.
서버가 `skillApplied.target`을 실어 보내고 화면은 그것만 읽는다(T6-4) — "서버가 유일한 진실".

**주의 8 — 팀 색 체계가 둘이다.** 팀전 색은 "나를 기준으로"(우리 연두 / 상대 붉은, 관전은 민트·핑크 —
`client/lib/teamColors.ts`), 개인전 색은 "사람마다 고정"이다. 개인전 화면에서 팀 색 함수를 부르면 모두
붉은색으로 보인다. 개인전은 `PLAYER_COLORS`만 읽는다.

**주의 9 — 탈락자는 "처음부터 관전자"와 다르다.** 순위표·통계에 남아야 한다. 방에서는 `sidePlayerIds`에서
빼지 않고(T3-2), 화면에서는 `myTeam = null`로 표현하지 않는다(T8-1).

**주의 10 — 로비 폼 높이.** 토글 하나로 방 만들기 폼이 넘칠 수 있고, 접힌 상태는 스크롤이 잠겨 있어 눈에
안 띈다(T4-1).

**주의 11 — 연출 중의 값.** 상대 목록·체력바가 `gameState`를 바로 읽으면 카드가 도착하기 전에 숫자가 오른다.
`animState`의 표시값을 쓴다(T5-3).

---

## 6. 이 로드맵이 하지 않는 것

| 하지 않는 것 | 이유 |
| --- | --- |
| 혼자 놀기의 개인전(CPU 여럿) | 요청 범위가 '다같이 놀기'다. CPU 로직은 B팀 하나를 전제로 짜여 있다 |
| 팀전과 개인전을 섞은 모드(2:2:2 등) | 일반화로 가능해지지만 대기실·규칙이 또 늘어난다 |
| 시연 모드의 개인전 | 시연은 팀전 대본 그대로 |
| 특허랑이 외 기술에 대상 붙이기 | 규칙 변경이다 |
| 팀전에 기술 2장 규칙 | 팀전은 현재 방식 유지(L1). 팀전의 `skillsPerTurn`은 언제나 1 |
| 팀전의 CSS 프레임 | 개인전 시범 결과를 보고 사용자가 따로 정한다 |
| 개인전 밸런스 수치 변경 | T2-7 보고를 보고 사용자가 정한다 |

---

## 부록 A. 뒤집기 17군데 (`ae02b3e` 기준)

다시 찾는 명령:

```bash
grep -rnE "=== 'A' \? 'B' : 'A'|=== 'B' \? 'A' : 'B'" server shared client/hooks client/components client/lib \
  --include=*.ts --include=*.tsx | grep -v __tests__ | grep -v backups
```

| 파일:줄 | 무엇 | 처리 |
| --- | --- | --- |
| `server/engine/skills.ts:31` | 특허랑이 대상 | **바꾼다** — `target ?? opponentsOf(...)[0]` (T1-3) |
| `server/engine/turnManager.ts:86` | 다음 차례 편 | **바꾼다** — `nextActiveSide` (T1-3) |
| `server/engine/turnManager.ts:90` | 라운드 끝 판정용 후공 팀 | **바꾼다** — 위치 비교 (T1-3) |
| `server/room.ts:114` | CPU 기술 고르기(`pickComputerSkill`) | 팀전 전용(혼자 놀기) — 그대로 |
| `server/room.ts:309` | 팀 이름 중복 검사 | 팀전 전용(대기실 팀 이름) — 그대로 |
| `server/room.ts:365` | 방장이 정한 상대 팀 이름 | 팀전 전용 — 그대로 |
| `server/room.ts:506` | 팀 이름 바꾸기 중복 검사 | 팀전 전용 — 그대로 |
| `server/room.ts:1039` | 일시정지를 물을 상대 팀 | **바꾼다** — 개인전은 묻지 않는다 (T3-2) |
| `server/room.ts:1209` | 항복한 팀의 상대 = 승자 | **바꾼다** — 개인전은 패배 순위 기록 (T3-2) |
| `server/demo/director.ts:326` | 시연 3장 쉬는 편 | 팀전 전용(시연) — 그대로 |
| `server/scripts/balanceAnalysis.ts:37`, `:144` | 팀전 봇 분석 | 팀전 전용 — 그대로 |
| `server/scripts/skillBalanceSuite.ts:32` | 팀전 봇 분석 | 팀전 전용 — 그대로 |
| `client/hooks/useAnimationQueue.ts:895` | 특허랑이 연출 대상 | **바꾼다** — `skillEv.target` (T6-4) |
| `client/hooks/useAnimationQueue.ts:996` | 결정타의 패자 | 팀전 경로로 한정 (T6-4) |
| `client/components/lobby/WaitingRoom.tsx:123` | 상대 팀 이름 | 팀전 전용 — 그대로 |
| `client/lib/skills.ts:42` | 특허랑이 미리보기 상한 | **바꾼다** — 개인전은 자르지 않음 (T6-5) |

"팀전 전용 — 그대로"인 줄은 T1-5 테스트의 허용 목록에 넣는다.

## 부록 B. 타입 정의

```ts
// shared/types.ts
export type SideId = string;                 // 팀전 'A' | 'B' · 개인전 'p1' … 'p8'
export type GameMode = 'team' | 'individual';
export type FinishReason = 'win' | 'out' | 'forfeit' | 'turnLimit' | 'last';

export interface TeamState {
  // … 기존 필드 그대로 …
  color?: PlayerColorId;                     // 개인전만
  finish?: { rank: number; reason: FinishReason }; // 개인전 — 순위가 정해지면 채운다
}

export interface GameState {
  // … 기존 필드 — Team 이던 것들을 SideId 로 …
  mode: GameMode;
  turnOrder: SideId[];                       // 팀전: [startingTeam, 반대편]
  skillsPerTurn: 1 | 2;                      // 팀전: 언제나 1
  skillsUsedThisTurn: number;
  ranks: Record<SideId, number>;             // 개인전 — 정해진 순위만. 팀전은 {}
}

// GameEvent에 추가
| { type: 'ranked'; team: SideId; rank: number; reason: FinishReason }
// skillApplied에 추가
//   target?: SideId    — 특허랑이의 대상(개인전). 팀전은 비워 둔다
// gameEnd.reason에 'ranked' 추가

// shared/constants.ts
export const INDIVIDUAL_MAX_PLAYERS = 8;
export const INDIVIDUAL_MIN_PLAYERS = 2;
export const INDIVIDUAL_TWO_SKILLS_FROM = 5;
// 12색 — 초안. 실제 크림 베이지 바탕 위에서 눈으로 보고 확정한다.
export const PLAYER_COLORS = [
  { id: 'red',    hex: '#E5484D' }, { id: 'orange', hex: '#F76B15' },
  { id: 'yellow', hex: '#F5C400' }, { id: 'lime',   hex: '#7CC242' },
  { id: 'green',  hex: '#2E9E5B' }, { id: 'teal',   hex: '#12A594' },
  { id: 'cyan',   hex: '#1EA7E1' }, { id: 'blue',   hex: '#3E63DD' },
  { id: 'indigo', hex: '#6E56CF' }, { id: 'purple', hex: '#AB4ABA' },
  { id: 'pink',   hex: '#E93D82' }, { id: 'slate',  hex: '#5B6B7A' },
] as const;
export type PlayerColorId = (typeof PLAYER_COLORS)[number]['id'];
```

## 부록 C. 테스트 케이스

**엔진** — `server/__tests__/individual.test.ts`

| # | 준비 | 기대 |
| --- | --- | --- |
| E1 | 4명으로 `initIndividualGame` | `skillsPerTurn === 1`, `turnOrder`는 4편의 순열, `startingTeam === turnOrder[0]` |
| E2 | 5명·8명 | `skillsPerTurn === 2` |
| E3 | 3명, 차례를 6번 넘김 | `turnOrder` 순서대로 돌고 한 바퀴마다 `turn`이 1씩 오른다 |
| E4 | 한 명의 순위를 정해 둠 | 그 사람은 차례가 건너뛰어지고, 라운드 카운터도 맞게 오른다 |
| E5 | 특허랑이 + 정상 대상 | 대상 체력이 빠지고 내 체력이 오른다. `skillApplied.target`이 대상 |
| E6 | 특허랑이 + 대상이 나 자신 / 없음 / 순위 확정자 | 아무 일도 없다(이벤트 없음, 상태 그대로) |
| E7 | 체력을 승리선 바로 아래로 세팅 후 상표토끼 | `ranked { rank: 1, reason: 'win' }`, 그 사람 차례 종료 |
| E8 | 두 번째 승리자 | `rank: 2` |
| E9 | 특허랑이로 상대를 0으로 | `ranked { rank: N, reason: 'out' }`, 다음 탈락자는 `N-1` |
| E10 | 한 기술로 상대 0 + 내 승리선 도달 | `ranked` 두 개, 승리 쪽이 먼저 |
| E11 | 남은 사람 1명이 되도록 | 그 사람이 남은 순위를 받고 `gameEnd { reason: 'ranked' }`, `winner`는 1위 |
| E12 | 5명, 첫 기술 사용 | 차례가 끝나지 않고 `pendingChoice`가 그대로 |
| E13 | 5명, 두 번째 기술 사용 | 차례 종료, `skillsUsedThisTurn`은 다음 차례에 0 |
| E14 | 5명, 첫 기술 뒤 쓸 기술이 없음 | 곧바로 차례 종료 |
| E15 | 5명, 첫 기술 뒤 패스 | 차례 종료 |
| E16 | 개인전 기술 선택 중 시간초과(첫·두 번째 모두) | 기술 없이 차례 종료, `timeoutChoice.animal === null` |
| E17 | 개인전 장소 선택 중 시간초과 | 무작위 장소로 뽑힌다(팀전과 같다) |
| E18 | 턴 제한 도달, 남은 체력 10·10·5, 남은 순위 2위부터 | 2·2·4위, `gameEnd { reason: 'turnLimit' }` |
| E19 | 축제 중 차례 넘김 | 다음 **활성** 편에게 예약된다 |
| E20 | (회귀) 기존 테스트 전체 | 테스트 파일을 고치지 않고 통과 |

**방** — `server/__tests__/individualRoom.test.ts` (가짜 WebSocket, `jest.useFakeTimers()`)

| # | 준비 | 기대 |
| --- | --- | --- |
| R1 | 개인전 방에 8명 입장 후 9번째(`team: 'A'`로 보냄) | 9번째는 **관전석**으로 들어가고 안내줄이 남는다 |
| R1b | 개인전 방에 `team: 'B'`로 입장 | 플레이어석(`'player'`)으로 받는다 |
| R2 | 입장 | 서로 다른 색이 자동 배정된다 |
| R3 | 남이 쓰는 색으로 `selectColor` | `COLOR_TAKEN` 에러, 색 그대로 |
| R4 | 색을 쓰던 사람이 나감 | 그 색을 다른 사람이 고를 수 있다 |
| R5 | 플레이어 1명으로 시작 | `CANNOT_START` |
| R6 | 3명 시작 후 한 명 항복 | 그 사람이 `rank: 3`, 판은 계속 |
| R7 | 3명 시작 후 두 명 항복 | 남은 1명이 1위, 판 끝 |
| R8 | 개인전 일시정지 요청 | 아무에게도 `pauseRequest`가 가지 않고 곧바로 `paused` |
| R9 | `chooseSkill { animal: 'tiger', target }` | 엔진에 대상이 전달된다 |
| R10 | 팀전 방(기존 흐름) | `spectator.test.ts` 등 기존 방 테스트가 그대로 통과 |

## 부록 D. 순위 판정 의사코드

```text
resolveRanks(state):
  events = []
  N = state.turnOrder.length
  winHp = state.settings.targetScore * 2

  // ① 승리 — 위에서부터
  for side in state.turnOrder:
    t = state.teams[side]
    if t.finish 있음: continue
    if t.hp >= winHp:
      rank = 1 + (finish.reason == 'win' 인 편의 수)
      t.finish = { rank, reason: 'win' };  state.ranks[side] = rank
      events.push({ type: 'ranked', team: side, rank, reason: 'win' })

  // ② 패배 — 아래에서부터 (항복도 같은 칸을 쓴다: reason 'forfeit')
  for side in state.turnOrder:
    t = state.teams[side]
    if t.finish 있음: continue
    if t.hp <= 0:
      rank = N - (finish.reason 이 'out' 또는 'forfeit' 인 편의 수)
      t.finish = { rank, reason: 'out' };  state.ranks[side] = rank
      events.push({ type: 'ranked', team: side, rank, reason: 'out' })

  // ③ 판의 끝
  left = activeSides(state)
  if left.length == 1:
    rank = 1 + (reason 'win' 인 편의 수)          // 위에서 다음 빈 순위
    기록(left[0], rank, 'last');  events.push(ranked …)
  if left.length <= 1:
    endGame(state)  →  events.push({ type: 'gameEnd', winner: 1위 편(동률이면 'draw'), reason: 'ranked' })
  return events

rankByHpAndEnd(state):                            // 턴 제한
  left = activeSides(state)를 체력 내림차순으로
  next = 1 + (reason 'win' 인 편의 수)
  for i, side in left:
    rank = (i > 0 이고 체력이 앞사람과 같으면) 앞사람의 rank, 아니면 next + i
    기록(side, rank, 'turnLimit')
  endGame(state, reason: 'turnLimit')
```

> 순위가 위·아래 양쪽에서 채워지므로, "위에서 다음 빈 순위"와 "아래에서 다음 빈 순위"가 만나는 지점이
> 남은 사람의 순위다. `rank` 계산은 반드시 **이미 기록된 사람 수**에서 구한다 — 별도 카운터를 두면
> 항복(방에서 일어난다)과 기술(엔진에서 일어난다)이 각자 세다가 어긋난다.
