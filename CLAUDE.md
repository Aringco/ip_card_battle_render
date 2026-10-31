# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **먼저 읽을 것 — [`NEXT_SESSION.md`](NEXT_SESSION.md)**
> 새 PC에서 환경을 구성하는 법, 지금 상태, 다음에 할 일, 그리고 **모르고 건드리면 조용히
> 깨지는 곳**들이 정리돼 있다. 작업을 시작하기 전 이 파일부터 볼 것.
>
> **그 다음 — [`HANDOVER.md`](HANDOVER.md)**
> 진행 중인 작업(로비 화면 개편)의 현재 상태, 남은 일, 로비를 고칠 때 지켜야 할 절차가 있다.
> 특히 **로비 폼에 항목을 추가하면 `client/scripts/measureLobby.mjs`로 반드시 다시 재야 한다** —
> 폼이 `position: absolute`라 스테이지 박스를 밀어낼 수 없어, 조용히 잘리거나 스크롤바가
> 생기는데 눈으로는 잘 안 보인다.

## 프로젝트 개요

**한국특허정보원 카드배틀** — 맵 네 모서리 장소에서 카드를 뽑아 중앙 동물 스택에 쌓고, 짝수 장이 모이는 순간 획득하는 할리갈리/고스톱류 실시간 N:N 팀 대전 웹 게임. 4대 지식재산권(실용신안·상표·디자인·특허)을 의인화한 아기 동물 카드 4종(🐑실용신양·🐰상표토끼·🧜‍♀️디자인어·🐯특허랑이)이 등장한다.

게임 규칙(장소별 확률, 스킬 공식, 턴 흐름)은 `README.md`가 최신 기준이다. `ROADMAP.md`는 초기 설계 문서로 이후 대개편(6×6 보드 → 장소 클릭 방식, 자동발동 효과 → 턴종료 스킬 선택제 등)을 거쳐 실제 코드와 달라진 부분이 많으니 참고만 할 것 — 정확한 수치는 항상 `shared/constants.ts`·`shared/types.ts`와 실제 코드를 확인한다.

## 기술 스택 & 모노레포 구조

npm workspaces (`client`, `server`, `shared`) — 루트 `package.json`에는 실행 스크립트가 없고, 각 워크스페이스 디렉토리에서 직접 명령을 실행한다.

- **`shared/`** — 타입(`types.ts`)·상수(`constants.ts`)·WebSocket 프로토콜(`protocol.ts`), `index.ts`에서 재export. 클라이언트·서버 양쪽에서 `shared` 패키지명으로 import(서버는 jest `moduleNameMapper`, 클라이언트는 workspace 심링크로 해석).
- **`server/`** — Node.js + `ws` WebSocket 서버. TypeScript를 `ts-node`로 직접 실행(별도 컴파일 없이 개발).
- **`client/`** — Next.js (App Router) + TypeScript + Tailwind CSS v4. `client/AGENTS.md`가 명시하듯 이 Next.js는 표준판과 다른 브레이킹 체인지가 있을 수 있으니, 확신이 없으면 `node_modules/next/dist/docs/`를 먼저 확인할 것.

## 개발 명령어

```bash
# 서버 (WebSocket, 기본 포트 8080)
cd server
npm run dev             # ts-node index.ts 직접 실행
npm test                # jest — server/__tests__/**/*.test.ts (규칙 단위 테스트 + 봇 시뮬레이션)
npm test -- effects     # 단일 파일만 (testMatch 패턴에 걸리는 이름 일부로 필터)
npm run test:sim        # 봇 500게임 시뮬레이션 (밸런스 검증, testTimeout 60s)
npx ts-node scripts/balanceAnalysis.ts [게임수]   # 그리디 봇 기준 스킬별 기여도 분석
npx ts-node scripts/skillBalanceSuite.ts [게임수] # 여러 봇 전략 조합 종합 밸런스 리포트(md 파일로도 저장)

# 클라이언트 (Next.js, 기본 포트 3000)
cd client
npm run dev
npm run build
```

**`server/tsconfig.json`의 `types` 목록을 지우지 말 것.** 이 서버는 Node 전용이라 `lib`에 DOM이 없는데, `types`를 비워두면 TypeScript가 `node_modules/@types/*`를 **전부** 자동으로 끌어온다. 워크스페이스 루트에는 클라이언트용 `@types/react-dom`이 함께 설치돼 있어서, 그 순간 `npm run build`(tsc)가 DOM 전역(`ReferrerPolicy`·`RequestDestination`)을 못 찾고 실패한다 — 서버 코드는 한 줄도 안 건드렸는데 갑자기 터지므로 원인을 찾기 어렵다. 서버가 새 전역 타입 패키지를 쓰게 되면 그 목록에 이름을 더한다(`ws`처럼 import 경로로 해석되는 모듈 타입은 목록과 무관하니 더할 필요 없다). `ts-node`(`npm run dev`)와 `ts-jest`(`npm test`)는 타입 검사를 그렇게까지 하지 않아 멀쩡히 돌아간다 — **이 증상은 `npm run build`에서만 드러난다.**

**dev 서버가 떠 있는 채로 같은 디렉터리에서 `next build`를 돌리지 말 것.** 둘이 `.next/`를 공유해 dev 쪽 증분 상태가 어긋난다 — 이 프로젝트에서 "CSS를 고쳤는데 화면이 그대로"인 일이 네 번 반복됐고, 한 번은 dev 서버 시작 1분 뒤부터 그 뒤 모든 편집이 반영되지 않았다(`.next/dev/`의 수정 시각이 그 시점에 멈춰 있었다). 검증용 빌드는 `NEXT_PUBLIC_WS_URL=ws://localhost:8080 NEXT_DIST_DIR=.next-verify npx next build` / `NEXT_DIST_DIR=.next-verify npx next start -p 3200`으로 산출물을 분리한다(`next.config.ts`의 `distDir`). **`NEXT_PUBLIC_WS_URL`을 빼먹으면 그 화면에서만 방이 만들어지지 않는다** — 프로덕션 빌드의 클라이언트는 WS 주소를 "이 페이지와 같은 호스트의 `/ws`"로 잡는데(`useWebSocket.ts`의 `resolveWsUrl`), 검증 서버(3200)에는 WS가 없고 8080에 따로 떠 있기 때문이다. 이때 Next가 `client/tsconfig.json`에 그 폴더의 타입 경로를 자동으로 끼워 넣으므로, **커밋 전 `git checkout -- client/tsconfig.json`으로 되돌릴 것** — 검증용 폴더 이름이 저장소에 남을 이유가 없다.

**그래도 화면이 그대로면 `.next/dev/` 캐시를 의심할 것.** Turbopack이 청크 파일명은 그대로 둔 채 낡은 내용을 계속 내주는 일이 이 프로젝트에서 반복해서 일어났다. **dev 서버를 껐다 켜는 것만으로는 안 고쳐진다** — 낡은 청크가 `.next/dev/`에 있고 재시작이 그 폴더를 지우지 않기 때문이다(`next build`는 `.next/static/`에 따로 쓰므로 프로덕션 빌드가 통과해도 dev는 낡은 채다). `cd client && npm run dev:clean`이 `.next`를 지우고 띄운다. 브라우저 캐시가 아니라 서버 쪽이라 시크릿 모드로 접속해도 똑같다.

두 서버(WS 8080 + Next 3000)를 각각 별도 터미널로 띄워야 브라우저에서 실제 플레이가 가능하다. 클라이언트가 바라보는 WS 주소는 `NEXT_PUBLIC_WS_URL`(기본 `ws://localhost:8080`)로 바꿀 수 있다. lint 스크립트/설정은 아직 없다.

## 핵심 아키텍처

### 서버가 유일한 진실(Source of Truth)
카드는 뽑히는 즉시 공개되므로(숨김 정보 없음) `GameState`를 거의 그대로 클라이언트에 보낸다(`server/serializer.ts`가 `activePlayerNickname`/`turnRemainingMs`/`turnTotalMs`/`teamNames`/`memberIds`만 덧붙임). 모든 랜덤(뽑히는 동물/숫자, 실용신양 추가 뽑기 장소, 시간초과 시 대신 고르는 선택)은 서버에서만 생성된다. 30초(설정 가능) 턴 타이머는 서버가 `Room.turnDeadline`으로 관리하고, 클라이언트 타이머는 표시 전용이다.

**턴 타이머를 화면에 그리는 규칙 3가지** — 이 셋 중 하나만 어겨도 "설정한 시간과 다른 숫자에서 시작하거나, 0에 멈춰 있는데 턴은 계속 흐르는" 증상이 된다.
1. **절대 시각을 보내지 않는다.** 서버 시계의 `Date.now()`를 그대로 보내면 클라이언트 PC 시계가 어긋난 만큼 표시가 통째로 틀어진다(배포 환경에서 특히). 서버는 직렬화 순간 기준 **남은 ms**(`turnRemainingMs`)를 보내고, `useWebSocket`이 **받은 그 순간에** 자기 시계로 데드라인을 환산한다(타이머 컴포넌트가 마운트될 때 환산하면 연출 대기 시간이 통째로 사라진다).
2. **게이지 폭은 클라이언트가 짐작하지 않는다.** 실제 제한시간은 방 설정값에 예약 뽑기 연장(`SHEEP_EXTRA_TIME_PER_DRAW_SEC`)이나 "고를 행동이 없을 때"의 단축이 섞여 있다. 서버가 `turnTotalMs`로 알려주고 클라이언트는 그대로 쓴다.
3. **연출 시간은 제한시간에서 깎지 않는다.** 서버는 액션 처리 즉시 타이머를 걸지만 플레이어는 연출이 끝나야 조작할 수 있으므로, `Room.settleGraceMs(events)`가 그 액션의 연출 길이를 추정해 `turnTotalMs` 위에 유예로 얹는다. 유예 구간에는 남은 시간이 `turnTotalMs`를 넘는데, `TurnTimer`가 `turnTotalMs`로 잘라 표시하므로 화면에는 "설정값 그대로 가득 찬 게이지"로 보인다.

### 게임 엔진 3계층 (server/engine/, UI와 완전 분리 — 순수 함수 + 단위 테스트 대상)
1. **`gameEngine.ts`** — 외부에서 부르는 진입점. `processPlayerAction`(장소 클릭 → 뽑기+정산) → `processSkillChoice`/`processPass`(턴 종료 시 행동 선택) 2단계 흐름. `processTimeout`이 두 대기 상태 모두를 대신 처리(장소 대기 중이면 무작위 장소, 행동 대기 중이면 무작위 유효 행동 또는 자동 패스).
2. **`drawCard.ts`** — 실용신양으로 예약된 추가 뽑기(`pendingExtraDraws`, `SHEEP_SAFETY_CAP`까지 — 카드 강화 판만 상한 없음) 소모 → 클릭한 장소에서 1장 뽑기 → 동물별 미획득 스택이 짝수면 한 번에 정산(`settleStacks`). 정산은 경험치만 올리고 체력은 건드리지 않는다.
3. **`skills.ts`** / **`turnManager.ts`** — `skills.ts`는 레벨(`floor(exp/threshold)`) 기반 4행동 효과 계산과 경험치 소모, `turnManager.ts`는 턴/팀 교대, 축제(`festivalTurn`) 진입, `MAX_TURN` 초과·즉시 승패(체력 knockout) 판정, 그리고 `initGame`.

**싹쓸이**(2026-10-30) — 자기 차례의 정산으로 필드에 미획득 카드가 한 장도 남지 않으면 `drawCard`의 `sweepIfCleared`가 네 동물에 보너스 경험치(`SWEEP_BONUS_EXP` — 양·토끼 1~5, 인어·호랑이 5~10)를 더하고 서로 다른 동물 카드 `SWEEP_REFILL_COUNT`(3)장을 새로 깐다(`dealOpeningSharedCards(rng, count)` — 강화 판은 숫자 1). 이벤트는 `sweep`(정산 뒤). ⚠️ **`settleStacks` 안에 넣지 말 것** — 시연이 `settleStacks`만 따로 부르므로 대본에 없는 보너스·카드가 끼어든다. 화면은 Pass 1.5(정산) 뒤·1.6(짝 효과) 앞에 "싹쓸이!"(`SweepBanner`)를 띄우며 그 순간 보너스 경험치의 가림을 걷고, 새 카드를 한 장씩 드러낸다 — 그 카드 id는 레이아웃 이펙트의 "못 보여준 카드 즉시 노출"(1)에서 빼야 한다(안 빼면 짝이 날아가기 전에 새 카드가 먼저 보인다). 길이는 서버 `TL_SWEEP_MS` = 화면 `SWEEP_BANNER_DUR + 장 간격×3 + 여운`(둘을 함께 고칠 것). 짝이 도착할 때 경험치 가림은 **그 페어의 몫만** 뺀다(같은 칸에 싹쓸이 보너스·무작위 경험치가 함께 가려져 있다 — 예전에는 키째 지웠다). 테스트에서 짝 하나만 확인하려면 필드에 구경꾼 카드 한 장을 남겨 싹쓸이를 피한다(`effects.test.ts`의 "싹쓸이" 절).

**시작 공유 카드** — `initGame`은 빈 보드가 아니라 `dealOpeningSharedCards`(`engine/places.ts`)로 뽑은 **서로 다른 동물 2장**(숫자 `OPENING_SHARED_CARD_NUM_MIN~MAX` = 7~13)을 중앙 스택에 깔고 시작한다. 빈 보드에서는 선 플레이어가 무엇을 뽑아도 짝이 되지 않고 그 짝을 바로 다음 차례인 상대가 가져가는 구조적 불리함이 있어서다. **두 장이 반드시 다른 동물이어야 한다**는 게 이 규칙의 핵심 — 같은 동물이면 선 플레이어가 첫 클릭도 하기 전에 그 자리에서 정산되어 취지가 뒤집힌다. 스택을 한 장 단위로 통제해야 하는 테스트는 `effects.test.ts`의 `clearStacks`로 이 두 장을 걷어내고 시작한다.

**행동(스킬) 규칙 요약** — 행동을 고르면 그 동물의 경험치는 `레벨 × threshold`만큼만 차감(초과분은 다음 레벨을 위해 유지)되고, 효과로 얻은 값은 절대 경험치로 되돌아가지 않는다(경험치·체력은 완전히 분리된 자원). `pendingMultiplier`는 디자인어(인어)를 쓸 때마다 그 발동의 레벨만큼 더해진다(`pendingMultiplier += 레벨` — 곱연산이 아니라 합연산. "다음 행동이 레벨만큼 더 발동한다"는 뜻이고, 기본값 1이 "기본 1회"에 해당해 최종 배율은 항상 `1 + 누적 레벨`이다). 인어 외의 행동을 쓰면 사용 직후 1로 초기화된다.

| 동물 | threshold | 효과 |
|---|---|---|
| sheep(실용신양) | 10 | 다음 내 턴에 `레벨×배율`회 추가 뽑기 예약(`pendingExtraDraws`) |
| rabbit(상표토끼) | 10 | 내 체력 `+레벨×배율` |
| mermaid(디자인어) | 20 | `pendingMultiplier += 레벨`(자기 자신은 배율 미소모, 합연산으로 누적) |
| tiger(특허랑이) | 20 | 상대 체력에서 `레벨×배율`만큼 강탈(보존형 — 상대가 가진 만큼만, 오버킬 없음) |

### 방(Room) 상태 머신 — `server/room.ts`
방 하나 = `Room` 인스턴스 하나. 로비(플레이어 join/ready → 방장이 `startGame`) → `initGame`으로 `GameState` 생성 → 이후 모든 WS 메시지(`drawCard`/`chooseSkill`/`passSkill`)를 검증(현재 턴/대기 상태와 일치하는 플레이어인지)한 뒤 `gameEngine` 진입점을 호출하고 결과를 브로드캐스트하는 흐름.

**방장(host)** — 방을 만든 사람이 `hostPlayerId`가 되고, 로비에서만 쓸 수 있는 명령(`movePlayer`/`kickPlayer`/`transferHost`/`setTeamName`/`updateSettings`/`startGame`)을 갖는다. 모든 명령은 `requireHost`가 "게임 시작 전인지 + 방장인지"를 함께 검사한다(`movePlayer`만 예외 — 자기 자신을 옮길 때는 누구나 가능). 방장이 로비에서 빠지면 `removePlayer`가 남아 있는 첫 번째 사람에게 자리를 넘긴다 — 안 그러면 아무도 `startGame`을 부를 수 없어 방이 통째로 멈춘다. 이전에는 전원이 ready가 되는 순간 자동으로 시작했지만, 지금은 방장이 명시적으로 시작 버튼을 눌러야 한다(방장 본인은 ready 개념이 없어 항상 `ready: true`).

**관전자(제3의 자리)** — 로비에서 고르는 "자리"는 `Seat = Team | 'spectator'`(`shared/types.ts`)이고, **게임 엔진에는 관전석이 존재하지 않는다**(`Team`은 여전히 `'A'|'B'` 둘뿐 — 정산·턴 교대·승패가 전부 두 팀을 전제로 짜여 있으니 엔진 타입에 `'spectator'`를 섞지 말 것). 관전자는 `Room`의 `teamPlayerIds.spectator`에만 담기므로 `memberIds`에도 실리지 않고, 그 결과 `expectedPlayerId` 비교에 절대 걸리지 않는다(그래도 이유가 분명한 에러를 주려고 `rejectIfSpectator`가 세 조작 핸들러 앞을 막는다). 관전자는 **인원수에도 준비 상태에도 영향을 주지 않는다** — `ready`는 항상 true로 고정(`setReady`가 관전자를 무시)이고, 시작 조건은 "양 팀에 한 명 이상 + 전원 준비"뿐이라 관전자만 늘어나도 시작이 막히지 않는다. 관전석↔팀 이동 시 `movePlayer`가 `ready`를 다시 맞춘다. 이 규칙들은 `server/__tests__/spectator.test.ts`가 지킨다.

클라이언트에서는 **`myTeam === null`이 곧 "관전 시점"**이다(대기실에서 `sessionStorage.cardBattle_team`에 `'spectator'`가 저장되면 게임 화면이 A/B 어느 쪽도 아니라고 판단해 null로 남긴다). 이 한 값으로 화면 전체가 갈린다: 팀 색이 "우리 연두/상대 붉은"에서 중립 두 색으로 바뀌고(팔레트는 **`client/lib/teamColors.ts` 한 곳** — 기본 민트·핑크이고 CSS 변수 `--spec-*`로만 소비되므로 색을 바꾸려면 이 파일만 고친다), 조작은 전부 막히며, 대신 지금 차례인 팀 색의 반투명 👇 가이드(`GuideFinger`)가 양 팀 차례 모두에 뜬다. **새로 팀 색을 쓰는 UI를 추가할 때는 `myTeam === null` 분기를 빠뜨리지 말 것** — 빠뜨리면 관전자에게 양 팀이 모두 "상대팀(붉은색)"으로 보인다(실제로 자막·결과 화면에서 그 버그가 있었다).

**게임 중 메뉴(⏸) — 일시정지·항복·나가기** — 셋 다 엔진이 아니라 방(Room)에서만 일어나는 일이다(엔진은 두 팀이 끝까지 두는 경우만 안다). 클라이언트는 "지금 멈춰 있는가"를 스스로 기억하지 않고 서버가 `ClientGameState.paused`/`pausedBy`로 보내주는 값만 그린다 — 그러지 않으면 상대가 거절했는데 내 화면만 멈추는 일이 생긴다.

- **묻는 동안에도 멈춰 있다.** 상대 팀에 접속한 사람이 있으면 그들에게 `pauseRequest`를 보내고 `PAUSE_REQUEST_TIMEOUT_SEC`(20초) 동안 기다리는데, **그 20초 동안 판은 이미 멈춘 상태다**(2026-09-21에 바뀌었다 — 그 전에는 시계가 계속 흘렀다). 고르는 사이에 시계가 흐르면 요청한 쪽은 창에 가려 아무것도 못 한 채 턴을 시간초과로 잃고, 답하는 쪽도 판을 보지 못한 채 시간을 쓴다. 거절·무응답이면 `settlePauseRequest`가 그 자리에서 `applyResume`으로 풀고, 멈춰 있던 동안 흐른 시간은 남은 시간에서 깎이지 않는다. 사람이 하나도 없으면(싱글 모드·전원 이탈) 묻지 않고 즉시 멈춘다. **자동 재개 시계(`pauseMaxMin`)는 수락된 뒤부터 센다**(`startPauseClock` — 묻는 시간은 일시정지 시간에서 뺀다, 2026-10-30). ⚠️ 클라이언트는 이때 `paused`만 보고 버튼을 "게임 계속하기"로 바꾸면 안 된다 — 아직 수락 전이라 누를 수 없으므로 `pauseWaitingUntil`(기다리는 중)이 먼저다. 요청 창이 떠 있는 동안에는 메뉴 창도 열지 않는다(그러지 않으면 답하기도 전에 요청 창 뒤에 메뉴가 깔린다).
- **멈출 때는 타이머를 "남은 시간만 챙겨" 걷어낸다.** 데드라인을 그대로 둔 채 타이머만 멈추면 재개하는 순간 이미 지난 시각이 되어 그 턴이 곧바로 시간초과로 날아간다. ⚠️ **`turnTotalMs`(게이지 폭)도 함께 보관해야 한다** — `clearTimer()`가 그 값까지 0으로 되돌리는데(끝난 방의 스냅샷에 유령 카운트다운이 실리지 않게 하려고), 안 챙기면 `TurnTimer`가 `maxSeconds = max(1, 0)`으로 잘라 **남은 시간이 1초에 고정된 채 얼어붙는다**(실제로 그렇게 만들었다가 고쳤다). 컴퓨터의 다음 수를 기다리는 타이머도 같은 방식으로 남은 시간을 보관했다 이어 붙인다.
- **횟수와 시간에 상한이 있다**(`GameSettings.pauseMaxCount` 기본 3회 · `pauseMaxMin` 기본 5분, 둘 다 방장이 정한다 — 횟수 0이면 그 방에서는 일시정지를 쓸 수 없다). ⚠️ **횟수는 요청하는 순간 깎인다** — 묻는 20초 동안에도 판이 멈추므로, 수락된 뒤에 깎으면 거절당할 때마다 다시 요청해 판을 계속 얼릴 수 있다(그래서 거절당해도 되돌리지 않는다). 시간이 다 되면 `applyPause`가 걸어둔 타이머가 `applyResume`을 대신 부른다. **혼자 놀기(`vsComputer`)에는 둘 다 걸지 않는다** — 기다리게 할 상대가 없어 제한이 보호하는 것이 없다. 그 사실은 `pauseUnlimited`로 화면에 전해져 "3회 남음"과 자동 재개 안내가 함께 사라지고, 로비의 혼자 놀기 폼도 그 두 항목을 아예 보여주지 않는다(`GameRulesFields`의 `hidePause`). 화면에는 `ClientGameState.pauseUsed`(팀별 사용 횟수)와 `pauseRemainingMs`(자동 재개까지 남은 시간)로 전한다 — 남은 시간은 **절대 시각이 아니라 남은 ms**다(턴 타이머와 같은 규칙).
- **곧바로 풀 수 있는 쪽은 멈춘 팀뿐이다.** 상대가 곧바로 풀 수 있으면 일시정지가 무의미하다. 대신 그 팀이 전부 끊기면 `handleDisconnect`가 대신 풀어준다 — 안 그러면 판이 영영 멈춘 채 남는다.
- **개인전은 전원 수락제다**(2026-10-30). 일시정지를 누르면 판에 남은 다른 사람 **모두**(순위 미확정 · 접속 중 — `askableIndividuals`)에게 `INDIVIDUAL_PAUSE_VOTE_SEC`(30초) 동안 묻고, 모두 수락해야 멈춘 채 남는다(한 명이라도 거절 · 무응답이면 풀린다). 멈춘 판에서 **멈추지 않은 사람이 [게임 계속하기 요청]**을 누르면 그 사람을 뺀 전원에게 묻고(`pauseRequest.kind 'resume'` — 화면은 `ClientGameState.resumeVote`), 모두 수락하면 다시 시작한다. 이 30초는 일시정지 시간 안이라 자동 재개 시각이 먼저 오면 답과 무관하게 풀린다. 두 투표 모두 `Room.pauseRequest.waiting`(답할 사람 집합)으로 세고, 답할 사람이 끊기거나 항복하면 그 사람만 빼고 센다(`dropFromPauseVote`). ⚠️ 클라이언트의 `pauseState` 처리는 `resumeVote`가 있으면 답하는 창을 닫지 않는다 — `pausePendingAnswer`만 보면 다시 시작 요청 창이 뜨자마자 사라진다.
- **항복과 나가기는 승패 처리가 같다**(포기한 팀이 지고 상대가 이긴다). 다른 점은 나가기가 방에서까지 빠진다는 것뿐이다. 그 사실은 `GameState.forfeitedBy`로 남는데, 기권으로 끝난 판은 체력 격차가 나지 않아 **결과 화면이 그 값 없이는 "제한 턴 종료 — 체력 비교"라는 엉뚱한 설명을 붙인다.**

**방을 옮기면 옛 방에서 손을 뗀다(`Room.detach`)** — 게임 화면에서 뒤로가기로 로비에 오면 그 화면의 새 WS 연결이 **자동 재접속으로 옛 방의 일원이 된다**. 그 상태로 방을 새로 만들면 예전에는 옛 방이 그대로 남고 클라이언트에는 새 방 코드와 옛 게임 상태가 함께 있게 되어, 시작도 안 한 방으로 게임 화면에 끌려가 "방 XXXX를 찾을 수 없습니다"만 보였다. 지금은 `createRoom`/`createSoloRoom`/`joinRoom`이 **새 방 입장에 성공한 뒤** `detach`로 옛 자리를 정리하고(진행 중이던 게임이면 나가기와 같이 처리), 클라이언트도 `roomCreated`/`roomJoined`를 받는 순간 들고 있던 `gameState`를 비운다. ⚠️ 그래서 **`roomCreated`는 `gameStart`보다 먼저 가야 한다** — 혼자 놀기가 방을 만들자마자 시작하던 것을 `addSoloPlayer`(자리만 만든다) + `startSoloGame`(시작)으로 나눈 이유다. 순서가 뒤집히면 그 "비우기"가 방금 받은 새 게임을 지워 혼자 놀기가 로비에서 한 발짝도 못 나간다.

**이름은 항상 채워져 있다** — 닉네임과 팀 이름의 무작위 생성은 `shared/names.ts`(`randomNickname`/`randomTeamName`) 한 곳에 있고 클라이언트·서버가 같이 쓴다. **팀 이름에 "미정(null)" 상태를 되살리지 말 것** — `addPlayer`는 방을 만드는 순간 양 팀 이름을 모두 확정하고(방장이 상대 팀 이름을 비워뒀으면 무작위), `setTeamName`에 빈 이름이 오면 미정으로 되돌리는 게 아니라 무작위로 다시 뽑는다. 예전엔 "그 팀에 실제로 참가하는 사람이 직접 정할 기회"를 남기려고 비워뒀지만 참가 화면에는 팀 이름 입력칸이 아예 없어서, 대기실에 "팀 2 (미정)"만 남는 버그로만 드러났다. 서버는 닉네임도 `normalizeNickname`으로 다시 정리한다(길이 컷 + 빈 이름이면 무작위) — 클라이언트 검증만 믿지 않는다. 양 팀 이름이 같아지는 경로는 `setTeamName`·`startBlockReason`·클라이언트 방 만들기 화면 세 곳에서 함께 막는다(게임에 들어가면 두 팀을 가리는 단서가 이름뿐이다).

**대기실 채팅** — `Room.chatLog`는 `CHAT_HISTORY_MAX`(50)개짜리 링 버퍼이고, 사람이 친 말(`kind: 'chat'`)과 방에서 일어난 일(`kind: 'system'`, `pushSystem`)이 한 줄기로 섞여 있다. 게임 화면에는 채팅이 없다 — `handleChat`은 `started`면 곧바로 return하고, 클라이언트도 `gameStart`에서 `chatLog`를 비운다. 과속·빈 메시지는 **에러를 보내지 않고 조용히 버린다**(실사용자는 클라이언트 쪽 억제에 먼저 걸리므로 빨간 배너는 소음일 뿐이다).

주의할 순서 두 가지 — 어기면 곧바로 눈에 보이는 버그가 된다.
1. `addPlayer`는 `sendChatHistory` → `pushSystem('… 들어왔어요')` 순서여야 한다. 뒤바뀌면 새로 들어온 사람이 자기 입장 줄을 `chatMessage`로 한 번, `chatHistory`로 또 한 번 받아 두 줄로 보인다(클라이언트의 id 비교 방어선이 있지만 그 방어선에 기대지 말 것).
2. `removePlayer(playerId, reason)`는 퇴장 안내 → 방장 승계 안내 순으로 push하고, 둘 다 `players.size === 0 → onEmpty()` 검사 **앞**에 와야 한다. `reason`은 자진 퇴장·연결 끊김(`'left'`)과 추방(`'kicked'`)의 문구를 가른다.

**`memberId` vs `playerId`** — `playerId`(UUID)는 사실상 재접속 자격증명이라(`handleReconnect`가 이 값만으로 통과시킨다) 로비 목록에 실으면 남의 세션을 가로챌 수 있다. 그래서 방장 명령의 대상 지정과 로비 목록에는 방 안에서만 통하는 짧은 공개 식별자 `memberId`(`m1`, `m2`, …)를 쓰고, `playerId`는 오직 그 소유자에게만 `roomCreated`/`roomJoined`로 보낸다. 새 로비 기능을 추가할 때도 이 구분을 유지할 것. 턴 타이머(`resetTimer`)는 대기 상태(장소 선택 vs 행동 선택)에 따라 `settings.drawTimeSec`/`actionTimeSec`을 쓰고, 실용신양 예약 뽑기 수만큼 `SHEEP_EXTRA_TIME_PER_DRAW_SEC`를 더 준다. 싱글 모드(`addSoloPlayer`)는 B팀을 CPU로 채우고 `performComputerAction`이 일정 딜레이 후 무작위(또는 즉시 승리 가능한 수 우선) 행동을 대신 수행한다. 그 딜레이는 두 대기 상태가 서로 다르다 — 장소 선택은 처리 시각부터 `CPU_THINK_*`(2.2~3.2초)를 그대로 세지만, **행동 선택은 반드시 `settleGraceMs(직전 이벤트)`를 먼저 얹은 뒤** `CPU_SKILL_THINK_*`(1~1.5초)를 센다. 서버는 뽑기를 처리하는 즉시 `pendingChoice`를 세우는 반면 화면에는 슬롯·정산 연출이 다 끝나야 [행동 선택] 단계가 뜨므로, 이 유예를 빼면 컴퓨터가 연출 도중에 골라버려 그 단계가 통째로 없는 것처럼 보인다. 재접속은 `sessionStorage`에 저장된 `playerId`로 `reconnect` 메시지를 보내 `gameSnapshot`을 다시 받는 방식.

`RoomManager`(`server/roomManager.ts`)는 4글자 방 코드(`O`/`I` 제외)로 `Room` 인스턴스를 생성·조회·정리하는 순수 관리 계층이고, `createConnectionHandler`(`server/gameServer.ts`)가 `ClientMessage` 타입별 분기(WS 연결 하나당 `currentRoomId`/`currentPlayerId` 클로저 유지)를 맡는다. 이 핸들러를 분리해둔 이유는 독립 실행(`server/index.ts`, 로컬 개발용 8080 포트에 자체 `WebSocketServer` 생성)과 통합 실행(루트 `server.ts`, Next.js와 같은 포트를 쓰는 배포용) 양쪽이 동일한 연결 처리 로직을 공유하기 위해서다.

### 시연 모드(`server/demo/`) — 방 위에 얹은 얇은 진행자 층
시연회에서 게임을 **가르쳐 주는 순서대로** 진행하는 분기다. 혼자 놀기에서 정해진 이름 짝으로 들어오면 켜진다(암호는 `server/demo/trigger.ts`에만 있다 — `shared/`에 두면 클라이언트 번들에 문자열로 박혀 누구나 찾아낸다). 시나리오 전문·설계 배경·"조용히 깨지는 곳" 15개는 **[`DEMO_MODE.md`](DEMO_MODE.md)**가 기준이고, 여기서는 나머지 코드에 영향을 주는 사실만 적는다.

- **엔진을 고치지 않는다.** `DemoDirector`는 엔진 부품(`settleStacks`·`applySkillChoice`·`makeScriptedCard`)을 순서만 바꿔 부른다. 엔진에 시연 분기를 넣으면 일반 게임 81개 테스트가 지키는 규칙이 흔들린다.
- **`Room`이 시연이면 엔진 진입점을 쓰지 않는다.** `handleDrawCard`·`handleChooseSkill`이 감독에게 넘기고, `handlePassSkill`은 조용히 무시하며(턴이 넘어가면 대본이 끊긴다), `resetTimer`는 타이머를 아예 걸지 않고(진행자가 설명하는 사이 `handleTimeout`이 대신 장소를 골라 버린다), `scheduleComputerActionIfNeeded`는 CPU를 움직이지 않는다. `snapshot()`에 `demo`를 싣는 것도 필수다 — 빠뜨리면 F5 후 장소가 전부 열린다.
- **턴을 넘기는 장(3장)도 상대에게 차례를 주지 않는다.** 도토리 축제는 `advanceTurn`이 "다음 팀에게" 예약하는 구조라 턴을 넘겨야만 열리는데, 감독의 `passTurn`이 `advanceTurn`을 **연달아 두 번** 불러 상대 차례를 한 프레임도 내보내지 않고 되돌려준다. 그 길에 상대에게 걸린 예약은 영영 소모되지 않으므로 그 자리에서 걷어낸다 — 안 걷으면 나중에 상대가 처음 두는 순간 밀린 도토리가 통째로 터진다.
- **이벤트가 하나도 없는 `actionResult`를 내보내지 말 것.** `useAnimationQueue`는 `lastEvents`가 비면 그 갱신을 "최초 입장·재접속"으로 보고 진행 중이던 연출의 경험치 가림을 즉시 걷어낸다. 그래서 시연의 턴 넘김은 따로 보내지 않고 **다음 클릭에 얹는다**(`advanceTurnFirst`). 4장의 장면 세팅과 [다른 결말 보기]만 일부러 빈 채로 내보낸다 — 판을 통째로 갈아엎는 자리라 "연출 없이 서버 진실로 맞춘다"가 정확히 원하는 동작이다. ⚠️ 다만 **그 길에는 "이벤트가 있을 때만 하던 뒷정리"가 빠져 있다** — 좌절 이모티콘(`persist`)이 그래서 새 판 위에 남았고, 빈 이벤트 경로에도 같은 정리를 넣어 고쳤다. 빈 채로 내보내는 자리를 새로 만들면 그 이펙트가 무엇을 정리하는지 먼저 볼 것.
- **끝난 판을 되살리는 경로는 시연 4장 하나뿐이다.** `DemoDirector.restart`가 `phase`를 'playing'으로 되돌리는데, `Room.handleDemoContinue`가 "시연이고 · 끝났고 · `view().replay`가 켜진" 경우에만 그 길로 들어간다. **그 조건을 넓히지 말 것** — 일반 게임에 끝난 판을 되살리는 길이 생긴다.
- **멈춤 창은 화면만 덮고 키보드는 덮지 못한다.** 시연은 [계속 ▶](스페이스·엔터·PageDown·→)과 4장의 1·2·3을 `window`에서 직접 듣는다. 일시정지 중에 누른 키가 창 뒤에서 대본을 진행시키므로 **서버와 화면 양쪽에서** 막는다(위 "화면에서 잠근 것은 서버에서도" 규칙이 키보드에도 적용되는 경우다).
- **화면에서 잠근 것은 서버에서도 잠가야 한다(그 반대도).** 시연은 "지금 무엇을 누를 수 있는가"(`ClientGameState.demo`)를 양쪽이 함께 알아야 하는 구조다. [턴 마치기]는 잠글 자리가 셋이었다 — 버튼(`SkillChoiceBar`)·서버(`handlePassSkill`)·**"고를 게 없으면 자동 패스"하는 클라이언트 타이머**(`GameLayout`). **새로 조작 UI를 더하면 `gameState.demo` 분기를 함께 넣을 것.**
- **기술 단계는 `allowedSkills`만으로 뜨지 않는다.** 행동 선택 칸은 서버의 `state.pendingChoice`가 세워져야 살아나므로 감독이 대본 줄을 옮길 때마다 함께 맞춘다(`syncPending`). 장소를 누를 줄에서는 반드시 비운다 — 남아 있으면 `handleDrawCard`가 그 클릭을 에러로 되돌려보낸다.
- **대본은 눈으로 검사할 수 없다.** 숫자를 고치면 `server/__tests__/demo.test.ts`의 검산이 먼저 걸린다(게임을 켜지 않는 순수 데이터 테스트). 장을 더할 때는 **장 사이의 이음매**도 함께 본다 — 앞 장의 마지막 클릭과 다음 장의 첫 클릭이 같은 장소면 `state.lastPlace`에 막혀 그 클릭이 먹통이 되는데, 화면에는 아무 일도 일어나지 않는다.

### 개인전(순위전) — "편이 N개"인 게임 (`INDIVIDUAL_MODE_ROADMAP.md`)

'다같이 놀기'의 방 만들기를 누르면 **팀전 / 개인전** 두 패널이 드러나 그중 하나를 고른다(2026-10-30 — 그 전에는 폼 제목 줄의 토글이었다. 방 종류는 만든 사람이 정하고 불변 — `Room.mode`). 개인전 폼의 제목 줄에는 **[일반] / [강화]** 토글이 있다(강화 = 아래 "카드 강화" 절의 규칙을 개인전에 얹은 방). 개인전은 최대 8명이 각자 겨뤄 **순위**를 매긴다. 규칙 전문은 로드맵 §2가 기준이고, 여기서는 코드에 손대기 전에 알아야 할 것만 적는다.

- **엔진은 "편(side) N개"로 일반화돼 있다.** 팀전은 편이 `'A'`·`'B'` 둘이고 개인전은 `'p1'…'p8'`(한 사람이 한 편). 타입은 `SideId`(string)이고 `Team`(`'A'|'B'`)은 **팀전 전용 코드**(대기실 팀 이름·시연·CPU)만 쓴다. 상태에는 `mode`·`turnOrder`·`skillsPerTurn`·`skillsUsedThisTurn`·`ranks`가, 편에는 `color`·`finish`가 있다(팀전에서는 고정값).
- ⚠️ **상대를 `team === 'A' ? 'B' : 'A'`로 뒤집어 구하지 말 것.** `Team`을 넓혀 둔 탓에 그 식은 컴파일되지만 개인전에서는 조용히 없는 편 `'B'`를 가리킨다. 상대는 `shared/sides.ts`의 `opponentsOf`/`nextActiveSide`/`activeSides`로 구한다. `server/__tests__/noTeamFlip.test.ts`가 그물이다 — 팀전에서만 도는 줄만 그 파일의 허용 목록에 있다.
- **순위 판정은 `server/engine/ranking.ts` 하나다.** 승리선(`targetScore×2`)에 닿으면 1위부터, 체력 0이면 꼴찌부터 순위가 정해지고, **정해진 사람은 판에서 빠진다**(차례 없음·특허랑이 대상 불가). 남은 한 명은 남은 순위를 받고 판이 끝난다(`gameEnd.reason 'ranked'`). 턴 제한(20)이면 남은 사람을 체력순(동률은 같은 순위)으로. 순위는 항상 **이미 기록된 사람 수**에서 구한다 — 항복(방)과 기술(엔진)이 따로 세면 어긋난다.
- ⚠️ **개인전 경로에서 `checkKnockout`/`finishTurn`을 부르지 말 것.** 팀전의 "한쪽이 0이면 곧바로 판 끝"이라 한 명이 탈락하는 순간 전원의 판이 끝난다. 판정은 **기술마다**(`processIndividualSkill` → `resolveRanks`) 하고, 차례 종료는 `advanceTurn`만 부른다.
- **시작 인원 5명 이상이면 한 차례에 기술 2장**(`skillsPerTurn`, 시작할 때 한 번 정해 불변). 두 번째 기술을 기다릴 때는 **`pendingChoice`를 세워 둔 채** 두고(비우면 화면의 행동 선택 칸이 안 살아난다), 방은 `resetTimer`를 새로 건다. 기술 선택 중 시간초과는 **서버가 대신 고르지 않고 차례만 끝낸다**(개인전에는 자동 선택이 없다). 특허랑이는 대상(`chooseSkill.target`)이 필수이고 순위 미확정 타인이어야 한다 — 아니면 엔진이 무시하고, 방은 빈 `actionResult` 대신 보낸 사람에게만 에러를 준다(빈 갱신은 화면이 "재접속"으로 읽는다).
- **방**: 개인전의 자리는 `'player'`·`'spectator'`뿐이다(참가 화면이 보내는 `'A'`·`'B'`도 플레이어석으로 받는다). 8명이 차면 튕기지 않고 관전석으로 받는다. 색은 입장 때 비어 있는 첫 색을 받고(`PLAYER_COLORS` 12색) `selectColor`로 바꾸며 겹치면 `COLOR_TAKEN`. 시작하면 `p1…pN`을 붙이고 **`sidePlayerIds`(편→사람)는 나가도 지우지 않는다**(순위표에 남아야 한다). 일시정지는 **남은 사람 전원의 수락**으로 멈추고(위 "게임 중 메뉴" 절) 횟수는 사람마다, 순위가 정해진 사람은 못 쓴다. 항복·나가기·`detach`는 그 사람만 패배(꼴찌 쪽부터)로 기록하고 판은 계속된다(`Room.forfeitIndividual` → `processForfeit`). 화면에서 **항복**하면 그 자리에서 관전 시점으로 바뀌고("관전 모드" 안내 — `PauseMenu`), **나가기**는 로비가 아니라 나간 순간까지의 **점수판**(`IndividualEndScreen inProgress` — 남은 사람은 "진행 중")을 보여 준다(방 화면의 `leftSide` — 나가면 `playerId`가 지워지므로 내 편을 따로 붙든다).
- **개인전 1:1은 팀전 화면이다**(2026-10-30). 시작 인원 두 명(`turnOrder.length === 2`)이면 방 화면이 `lib/duel.ts`로 상태·이벤트의 편 id를 'A'(나 — 관전자면 차례 순서의 첫 사람)·'B'로 **이름만 바꿔** `GameLayout`·`GameEndScreen`·연출 큐에 넘긴다(서버는 그대로 개인전). 'ranked' 이벤트는 빼고 판 끝의 reason 'ranked'는 'knockout'(기권이 섞였으면 'forfeit')으로 바꾼다. 특허랑이는 대상을 고르지 않으므로 방 화면이 상대 편(`duel.right`)을 실어 보낸다. ⚠️ 바뀐 이벤트 배열은 **`lastEvents`가 바뀔 때만** 새로 만든다 — 상태만 바뀐 갱신에 새 배열을 주면 연출 큐가 지난 연출을 다시 재생한다. 일시정지 메뉴는 진짜 상태(개인전 — 즉시 멈춤)를 그대로 쓴다. 감정표현은 이 화면에 없다(팀전 화면에 없는 기능).
- **화면**: 개인전(3명 이상)은 새 컴포넌트 `IndividualLayout`이 그린다(팀전 `GameLayout`은 건드리지 않았다). 프레임은 그림이 아니라 **CSS**(`.play-frame-css`, 갈색·크림 — 개인전 먼저 시범 적용)이고 **팀전 액자보다 1.1배 넓다**(높이는 같고, 화면 폭을 넘으면 판 전체가 비율대로 줄어든다 — 칸 비율 숫자 묶음은 globals.css 주석). 양옆 열 0.19, 기술 카드 띠는 팀전과 거의 같은 0.6522다. 내 편은 `gameState.memberIds`에서 내 `playerId`가 든 편을 찾는다(`lib/individual.ts`의 `mySideOf`) — 저장된 `cardBattle_team`(A/B)으로는 알 수 없다. ⚠️ **`mySide === null`은 "처음부터 관전자"다.** 순위가 정해진 플레이어는 `mySide`를 그대로 두고 조작만 잠근다(내 패널·내 색이 사라지면 안 된다). 색은 **사람마다 고정**(`PLAYER_COLORS`)이라 팀 색 체계(`teamColors.ts`)와 섞지 않는다 — 개인전 화면에서 팀 팔레트 함수를 부르면 모두 같은 색(또는 undefined)이다. 색만으로 사람을 구분하지 않는다(색 칩 옆에는 언제나 닉네임).
- 연출이 칸을 찾는 표식은 개인전도 그대로다: `data-team-score-row="side:animal"`(날아가는 카드의 목적지)·`data-player-anchor="side:0"`·`data-rabbit-target="side"`. 오른쪽 상대 칸(`OpponentList`)이 이를 모두 달고 있다. 특허랑이의 연출 대상은 화면이 계산하지 않고 서버가 실은 `skillApplied.target`을 읽는다. 상대 목록의 경험치·레벨은 `animState.displayedExp`(연출 뒤의 값)를 쓴다.
- **감정표현**: 내 정보창 오른쪽 위의 버튼(`EmotePicker` — 칸 위에 absolute로 겹쳐 배치를 밀지 않고, 고르기 창은 body로 portal)이 **켜 두는 창**을 연다 — 그림을 골라도 닫히지 않고 **버튼을 다시 눌러야** 닫힌다(바깥 클릭·Esc로도 안 닫힘 — Esc는 게임의 멈춤 메뉴 단축키다). 그래서 창은 판 쪽이 아니라 **내 정보창 칸 위에 그 폭 그대로** 연다(판 쪽에 켜 두면 장소 타일을 가려 카드를 못 뽑는다). 거기서 '기본'·'SP'·'손동작' 중 하나를 고른다. 목록은 `shared/emotes.ts` 한 곳이고 서버는 그 id만 받아 `{ type: 'emote', side, emoteId }`로 방 전체에 전한다(관전자·대기실·과속 `EMOTE_MIN_INTERVAL_MS`는 조용히 버림). **화면은 내 것도 서버가 되돌려 준 것으로만 그린다**(먼저 띄우면 서버가 버린 것까지 내 화면에 뜬다). 풍선은 연출 표정과 같은 `PlayerEmoticonLayer`의 줄에 `emote: true`로 서고, 3초(`EMOTE_SHOW_MS` = CSS `.is-emote`) 동안 **풍선(흰 상자 `.emote-box` + 꼬리)은 가만히 있고 안의 그림(`.emote-img`)만** 좌우로 흔들린다(상자째 돌리면 풍선이 흔들린다 — 그래서 둘을 나눠 그린다). **풍선은 한 사람에 하나씩만** 뜬다 — 그동안 받은 것은 `useWebSocket`의 사람별 줄(ref)에 섰다가 앞의 것이 3초를 채우면 같은 갱신 안에서 갈아 끼운다(줄은 떠 있는 것 포함 `EMOTE_QUEUE_MAX` 4개, 넘치면 가장 오래 기다린 것을 버림 · 보내기 간격 0.5초). 상대 칸(`.ind-opp-card`)이 인원이 많아 상한(max-height)보다 줄면 풍선도 그 비율만큼 줄고 칸 간격도 넘지 않는다(`bubbleSizeFor` — 상대 7명이 한꺼번에 띄워도 겹치지 않는다. 1600×900 8명에서 89px). 층은 `EMOTE_Z`(99) — 장소 안내 손(95)·멈춤 화면보다 위다. 고르기 창의 칸 영역(`.emote-grid`)에 여백이 넉넉한 것은 hover로 커진 끝 칸이 스크롤바를 만들지 않게 하려는 것이다. 칸 왼쪽 위 별로 **즐겨찾기**(최대 4, 고른 순서대로 A·S·D·F — localStorage `cardBattle_emoteFavorites`). **단축키**: 장소 1~4(화면 왼→오·위→아래) · 기술 Q·W·E·R · 턴 마치기 스페이스·T는 **모든 판 공통**(`lib/useGameHotkeys.ts` — 개인전·팀전 화면이 함께 쓴다. 시연 중에는 끈다 — 스페이스·1·2·3이 대본 진행 키다) · 감정표현 창 I · 즐겨찾기 A·S·D·F(`EmotePicker`, 창이 닫혀 있어도 보낸다). 장소·기술 키는 **마우스가 누르는 그 버튼을 click()한다**(누를 수 있는지를 따로 판정하지 않는다 — disabled면 안 먹는다). 키는 `e.code`로 가른다(한글 입력 상태에서 `e.key`는 'ㅂ'이다 — `lib/hotkeys.ts`). 멈춤·멈춤 메뉴(`.pause-dim`)·특허랑이 대상 고르기(숫자 키를 따로 쓴다) 중에는 받지 않는다. 그림은 `public/emoticon/{default,spticon,hands}/` — SP·손동작은 `client/scripts/cutEmoticons.mjs`가 `assets-src/emoticons`에서 만든다(SP 원본이 BMP라 변환한다). 대기실 채팅의 닉네임은 그 사람이 고른 색(지금 색 → 나간 사람이면 말할 때의 색 `LobbyChatMessage.color`)이다.
- **측정**: 팀전은 `client/scripts/measurePlay.mjs --diff team-before`(움직인 상자 0개여야 한다), 개인전은 `client/scripts/measureIndividual.mjs`(2·5·8명 × 1600×900·1366×768), 로비 폼은 `measureLobby.mjs`(개인전 상태 포함). 봇 시뮬레이션은 `server/scripts/individualSim.ts`.

### 혼자 놀기 '카드 강화' — 혼자 놀기 위에 얹은 강화 규칙 (`ENHANCE_MODE.md`)

로비에서 **혼자 놀기 → 강화 모드**로 들어온다(혼자 놀기도 다같이 놀기처럼 두 갈래다 — `solo`는 고르는 단계, `soloNormal`·`soloEnhance`가 폼이고, 안쪽 2열은 `.solo-inner`가 `.multi-inner`와 같은 방식으로 드러낸다. 강화 모드 폼은 `EnhanceForm` — 닉네임 + 게임 규칙). 카드 숫자는 모두 1, 모든 카드가 Lv.1부터 열려 있고, 경험치는 쓰면 깎이는 자원이 아니라 **누적 강화**(레벨 = 1 + ⌊경험치/임계값⌋, 임계값은 일반 판과 같은 10·20, Lv.1~10 · Lv.Max(11))이며, 기술마다 쿨타임이 있고, **턴 제한이 없다**(목표 체력·상대 체력 0으로만 끝난다). 규칙 상수는 `shared/enhance.ts` 한 곳이다.

- **엔진·방·화면 모두 혼자 놀기 그대로다** — 팀전 1:1(A = 나, B = 컴퓨터, `initEnhanceGame` = `initGame` + `GameState.enhance`)이고 화면도 `GameLayout`이다. 이 판인지는 언제나 `state.enhance`로 가른다. `data-enhance`가 카드·장소 라벨·짝 합계의 숫자를 감춘다.
- **개인전 '강화' 방**(2026-10-30, `ENHANCE_MODE.md` §4): 같은 강화 규칙을 개인전 엔진에 얹는다(`initIndividualGame(…, enhance)` → `attachEnhance`, 방은 `createRoom.enhance` → `Room.enhance` → `lobbyState.enhance`). 화면은 `IndividualLayout` 그대로다. 체력이 움직인 뒤의 판정은 `judgeHp`(팀전 `checkKnockout` / 개인전 `resolveRanks`)로 가르고, 기술 장수는 `enhanceSkillsOf`(개인전 5명+ 2장과 15턴마다 +1 중 큰 쪽). ⚠️ **상대를 고르는 기술은 shared의 `needsTarget` 하나로 판정한다** — 특허랑이 + 강화 방의 Lv.6+ 디자인어. 
- ⚠️ **기술 효과의 체력은 효과 연출 순간까지 가린다(모든 판, 고른 기술 포함)** — `useAnimationQueue`의 `pendingHpCredit`(특허랑이는 발톱이 닿는 순간). 예전에는 짝 효과만 가려 상대의 결정타가 연출 전에 체력 구슬에 먼저 보였다. 체력을 그리는 곳에 `withDisplayedHp`를 거치지 않은 `gameState`를 넘기면 다시 그렇게 된다.
- ⚠️ **레벨은 `skillLevelFor`(shared)로만 구한다** — 서버 `levelOf`와 화면(동물 표·기술 카드)이 같은 함수를 써야 한다. `THRESHOLDS`로 직접 나누면 강화 판에서 한 단계 낮게 보인다. 경험치 막대는 `expProgressFor`(Lv.5면 `need: null` = MAX).
- ⚠️ **쿨타임도 단일 관문** — 서버는 `eligibleAnimals`, 화면은 `lib/skills.ts`의 `canUseSkill`(기술 카드와 "고를 게 없으면 자동 패스"가 함께 쓴다). 쓴 순간 `쿨타임 + 1`로 세우고 그 편의 차례가 끝날 때(`advanceTurn`) 1씩 줄인다. ⚠️ 카드에 **보이는** 숫자는 저장값이 아니라 `enhanceCooldownShown`(`cooldownShownOf`)이다 — 한 차례 여러 장 판에서 쓴 차례 안의 +1이 그대로 보이면 두 번째 기술을 고를 때 쿨타임이 줄어드는 것처럼 보였다(2026-10-31, 엔진이 `usedThisTurn`을 남긴다). 잠금 판정에 그 값을 쓰지 말 것.
- **6차 표 — 로그형**(2026-10-31, 5차 표를 갈았다. 표 전문은 `ENHANCE_MODE.md`, 설계 · 시뮬레이션 · 남은 숙제는 **`ENHANCE_BALANCE_PROPOSAL.md`**): 실용신양 4~14장 · 상표토끼 25~73 · 디자인어 ×2~×8 · 특허랑이 44~146. Lv.1부터 쓸 만하고 레벨마다 오르는 폭이 줄어들며, 큰 계단은 승격(Lv.6 · Max)에만 있다. 같은 날 **2차 조정**으로 판 길이 중앙값을 21 → 15턴으로 당겼다(`enhanceBalance.ts` — 목표가 15~16턴이다). ⚠️ **디자인어는 레벨마다 "처음 거는 배율"과 "겹칠 때 더하는 양"이 번갈아 하나씩 오른다**(×2 +1 → ×2 +2 → ×3 +2 …) — 레벨업해도 카드가 그대로이던 것을 고친 요청이라, 표를 고칠 때 두 레벨이 같아지지 않게 둘 것(`enhance.test.ts`가 지킨다). ⚠️ **임계값(10 · 20)은 바꾸지 않는다는 조건으로 맞춘 표다** — 상표토끼는 특허랑이보다 레벨이 두 배 빨리 오르므로 "같은 레벨"이 아니라 "같은 누적 경험치"끼리 맞췄다(상표토끼 Lv.(2k−1) 회복 ≈ 특허랑이 Lv.k 공격 × 0.65 — 같은 레벨끼리 맞추면 후반에 판이 회복으로 굳는다. 이 비율이 가장 민감한 손잡이다). ⚠️ **배율(디자인어 · Lv.Max 별도 배수)과 상대 효과 ÷N은 실용신양의 장수 · 상표토끼의 즉시 회복 · 특허랑이의 공격력에만 걸린다** — 경험치 · 지속 효과 · 디자인어 자신에는 안 걸린다. **출혈 · 지속 회복이 Lv.1부터**(지속 회복 최대 8턴 `ENHANCE_REGEN_MAX_TURNS` · 출혈 12턴 `ENHANCE_BLEED_MAX_TURNS`)이고, Lv.6+는 **회복 중첩 · 출혈 누적 계수**(`EnhanceDot.stack`, 쌓여 최대 10)를 더한다 — 한 턴의 양은 회복 `enhanceRegenTick`(4, 중첩이 생기면 4 × 중첩) · 출혈 `enhanceBleedTick`(12, 계수가 생기면 15 × (1 + 0.2 × 계수)), 기술 한 번보다 작은 "보조"다. **쿨타임은 승격 때만 오른다**(양·토끼 0/1/2 · 인어·호랑이 1/2/3). Lv.6부터: 실용신양 무작위 경험치 × **중첩 배수**(그 한 번의 곱) · 다른 카드 쿨타임 −N(Max 두 장 초기화) / 상표토끼 부정 효과(÷N·출혈) 하나 −N턴 / 디자인어 상대 배율 ÷N(Max 제거) · 겹치기는 **모두 더하기**(+1 … Max +8, `ENHANCE_MERMAID_STACK_MULTIPLY_FROM` = 12 — 곱하는 레벨 없음. 화면 문구는 그 값이 아니라 "상대 배율 나누기가 붙는 레벨"로 가른다) · Max만 상대 효과 ÷2(1턴, 쌓여 최대 3턴 — 쓴다고 사라지지 않는다)와 **기술 회피 20%**(`EnhanceStatus.evade` — 내 다음 차례가 열릴 때 `advanceTurn`이 지운다, 나를 노리는 기술마다 따로 굴려 피하면 이벤트에 `evaded`) / 특허랑이 상대 **회복 효율 −N%**(다음 1턴, `EnhanceStatus.healCut` — Lv.6 −20% … Max −60%) · Max 이로운 효과 제거(`purged` — 회피 포함). 밸런스 보고는 `server/scripts/enhanceStrategySim.ts`(전략끼리 대결). 컴퓨터(`pickEnhanceComputerSkill`)는 실용신양을 (장수 + 무작위 경험치)로 매긴다 — 장수만 보면 6차 표에서 실용신양을 거의 고르지 않는다(시뮬레이션의 greedy 봇들도 같은 식). 예약 뽑기는 `ENHANCE_RESERVED_DRAW_CAP`(512)에서 자른다. **지속 효과는 그 편이 기술을 모두 쓰고 차례를 마칠 때** `advanceTurn`이 차례를 넘기기 전에 `tickEnhanceStatus`(**출혈 → 회복** 순, 출혈로 0이면 회복 없이 패배)로 들고, ⚠️ **발동한 차례에는 들지 않는다** — 자기 차례에 스스로 건 지속 회복 몫은 `EnhanceDot.fresh`로 빼고 센다(빠뜨리면 상표토끼를 쓴 그 차례 끝에 바로 한 번 든다). **Lv.Max 별도 배수**(`enhanceOverMultiplier` — 임계값을 더 채울 때마다 ×1, 걸린 배율에 곱한다 · **그 카드를 고르면 ×1로 돌아간다** — 엔진이 그 몫의 경험치를 `expSpent`로 깎고 화면은 효과 연출 순간까지 가린다). ⚠️ 지속 효과 묶음(`EnhanceStatus`)은 이벤트가 `status`로 싣고 화면이 연출 순간까지 가린다(`displayedStatus`) — 체력창 아이콘에 `gameState`를 그대로 넘기면 효과보다 먼저 뜬다. 수치는 모두 `enhanceAmount`(기본값 × 배율 ÷ 나눗셈, **반올림**) — 서버와 화면 미리보기가 같은 함수를 쓴다. 기본 규칙은 목표 500 · **축제 1턴부터 4회 · 4턴마다 +4회 · 기술 12턴마다 +1장(최대 2장)**(2026-10-31 — 6차 표와 짝이다: 임계값을 못 바꾸니 초반 레벨업은 축제 수입으로 앞당기고, 판을 끝내는 힘은 숫자 폭발 대신 기술 2장이 맡는다. 그 전 2026-10-30 축제 2턴 · 2턴마다 · 기술 15턴마다 최대 3장)이고, **이 판의 목표 점수 상한은 2500**(일반 판 500) — 방·엔진 모두 `clampEnhanceSettings`(`ENHANCE_SETTINGS_LIMITS`)로 자른다. 일반 `clampSettings`를 거치면 500에서 잘린다(`initEnhanceGame`이 `initGame`에 범위를 넘기는 이유).
- **여러 장 · 짝 효과 없음**: 장소 한 번에 1~3장(동물 2종 장소)·3~5장(3종 장소)이 나온다(앞에 `placeDraws`). 짝은 **경험치만** 올린다 — 짝이 맞은 카드의 기술이 저절로 발동하던 "짝 효과"(`applyEnhancePairEffect`, `skillApplied.pair`)는 2026-10-31에 걷었다(직관적이지 않았다). 화면의 `pair` 처리는 옛 이벤트 호환으로만 남아 있다.
- ⚠️ **승패는 그것을 만든 체력 변화가 화면에 보인 뒤에 보인다(2026-10-31, 모든 판)**: ① `useAnimationQueue`는 순위(`ranked`)와 출혈·회복(`enhanceTick`)을 **서버가 보낸 순서 그대로** 한 줄로 재생한다(따로 돌리면 "탈락"이 체력이 내려가기 전에 떴다) ② 개인전의 "n위 · 탈락"(`finish`)은 그 배너가 뜰 때까지 가린다(`hiddenFinish` → `lib/individual.ts`의 `withDisplayedFinish` — `IndividualLayout`이 받은 상태를 통째로 그것으로 바꿔 쓴다) ③ 종료 BGM도 결과 화면과 같은 조건(`phase === 'ended' && !isSettling`)에서 바뀐다.
- **한 차례 여러 장·한계**(2026-10-29): N턴마다 한 차례의 기술이 하나씩 늘어 최대 M장(`enhanceSkillsPerTurn(turn, settings)` — `advanceTurn`이 턴이 오를 때 `skillsPerTurn`을 다시 정한다). **2026-10-30부터 방 만들기 옵션이다** — `GameSettings.skillGrowth`(On/Off) · `skillGrowthTurns`(기본 12) · `skillGrowthMax`(기본 2, 범위 2~4 — 기술 카드가 넷이라 4가 끝)이고, 강화 폼(혼자 놀기 강화 · 개인전 강화 · 그 대기실의 규칙 바꾸기)에만 `showSkillGrowth`로 보인다. 일반 판은 이 셋을 읽지 않는다. 끄면 1장(개인전 5명+는 2장). 기술은 `processEnhanceSkill`이 개인전 2장 규칙과 같은 모양으로 받는다(장수가 남으면 `pendingChoice`를 세워 둔 채). 시간초과는 첫 장만 대신 고른다. 예약 뽑기(실용신양·축제)는 `SHEEP_SAFETY_CAP`(40)이 아니라 `ENHANCE_RESERVED_DRAW_CAP`(512)에서 자르고(`reservedDrawCount`), 화면은 40장을 넘으면 장 간격을 좁힌다(shared의 `rollDrawStep`). 쿨타임은 Lv.Max에서 하나 더 는다. 목표 점수 상한은 2500.
- ⚠️ **연출 유예(`room.ts`의 `settleGraceMs`)는 화면 타임라인을 따라 센다**(`settleTimelineMs` — `useAnimationQueue`의 Pass 1~1.6 순서·길이를 그대로 옮긴 것). 유예가 연출보다 짧으면 컴퓨터의 다음 수가 연출 도중에 와서 화면이 **뽑기 도중에 판을 초기화**한다(예전 15초 상한에서 실제로 그랬다). 연출 순서·길이를 바꾸면 그 함수도 함께 고칠 것. 한 줄 카드가 10장·100장을 넘으면 묶어 그린다(`AnimalStackArea`의 `bundleCards` — 강화 판만, `bundle` prop). 예약 뽑기 롤 하나는 장수와 무관하게 **5초 안에** 끝난다(`rollDrawStep`, 모든 판 — 11장까지는 0.3초 간격 그대로).
- **기술 카드의 무게**(`SkillQuake.tsx`, 강화 판만): 고르는 순간 그 카드의 배율(디자인어 배율 × Max 별도 배수) 5마다 진도 한 단계(최대 10) — 빨리 내리꽂히고, 진도 2부터 쿵 소리(`thud.wav`, `makeThudSound.mjs`가 합성)·액자 진동·흙먼지·옆 카드 튀어오름. 움직임은 WAAPI의 `translate`/`rotate`로만 건다(카드들의 `transform` 연출과 겹치지 않게).
- ⚠️ **`isSettling`은 렌더 도중 보정 블록에서도 켠다**(모든 판). 레이아웃 이펙트에서만 켜면 판을 끝내는 갱신의 첫 커밋에 방 화면이 결과 화면을 마운트해 게임 화면을 내렸다 올린다(페인트 전이라 안 보이지만 진행 중인 연출·상태가 날아간다).
- ⚠️ **기술 효과가 바꾸는 배율·추가 뽑기·나눗셈도 연출 순간까지 가린다**(`useAnimationQueue`의 `displayedTeamPatch` → `withDisplayedTeams`, 모든 판). 팀 패널·기술 카드 미리보기에 `gameState`를 그대로 넘기면 뽑기 연출이 끝나기 전에 "×N"·"+N회"가 먼저 바뀐다 — 레이아웃의 `viewState`를 넘길 것. 기술 카드는 **등급**이 넷이다(2026-10-31, `enhanceCardTier` → `data-enh-tier`): 브론즈 Lv.1~3(구리 테두리 · 빛 반사 `.enh-sheen`) · 실버 Lv.4~7(은 테두리 · 은빛 `.enh-silver`) · 골드 Lv.8~10(금 테두리 · 금빛 `.enh-gold`) · 무지개 Max(무지개 테두리 · `.enh-rainbow`). **홀로(빛 효과)는 등급마다 한 겹뿐이다**(`SkillChoiceBar`의 `TIER_HOLO` — 겹쳐 쌓지 말 것, 요청이다). 같은 날 쇠 · 금 · 무지개의 3단계와 방 만들기의 [3단계]/[4단계] 고르기가 있었다가 걷었다. ⚠️ **등급은 화면만이다** — 효과 · 쿨타임의 계단은 `ENHANCE_STEP_LEVEL`(Lv.6) · Max이고 등급 경계(`ENHANCE_SILVER_FROM` 4 · `ENHANCE_GOLD_FROM` 8)와 따로 간다(밸런스는 그 계단으로 맞췄다). 등급이 바뀌면 레벨업 대신 [승격] 연출(`PromotionBurst`). 카드 그림은 세 벌이다 — 브론즈·일반 판 `skills/v1` · 실버·골드 `v2` · 무지개 `vmax`(`playAssets.ts`의 `skillArtSrc`, webp는 `scripts/makeSkillArt.mjs`가 `assets-src/skills`의 원본에서 만든다). 승격 직후 `PROMO_HOLD_MS` 동안은 옛 등급으로 그린다(빛이 덮기 전에 새 그림이 비치지 않게 — `CardBurst.hold`, 레이아웃 이펙트). 소리는 레벨업 `level_up` · 승격 `promotion` · 출혈 `bleed` · 지속 회복 `heal`(`generateAssetManifest.mjs`의 `SFX_PREFIXES`에 이름이 있어야 실린다).
- ⚠️ **턴 상한은 `maxTurnOf`로만 읽는다** — 강화 판은 `Infinity`다. `MAX_TURN`을 직접 쓰면 이 판이 20턴에 끝난다(화면은 이때 "n턴"만 쓴다).
- 기술 카드의 레벨 연출(빛 반사 띠 `.enh-sheen` · 45도 사선 띠로 카드를 가로질러 늘 흐르는 무지개 `.enh-rainbow` · 레벨업 파티클 `LevelUpBurst`)은 `--enh`(0 = Lv.1 … 1 = Lv.Max) 하나로 세기를 정한다(은빛 · 금빛은 등급 안의 `--silver` · `--gold`). 밝은 그라데이션 `.enh-light`는 "홀로는 한 겹만" 요청으로 걷었다. ⚠️ 무지개 층에 `background-repeat`(기본 repeat)를 되살리거나 가장자리 마스크를 걷으면 짙어질수록 **층의 사각형·타일 이음매가 드러난다**(실제로 그랬다). 판 길이 확인은 `server/scripts/enhanceBalance.ts`.

### 모바일 배치 — 혼자 놀기 · 개인전 · 가로 폰 (`client/components/game/mobile/`)

가로로 눕힌 폰(가로 화면 + 높이 ≤ 500px — `lib/mobileLayout.ts`의 `useMobileLayout`)에서 **혼자 놀기(일반 · 강화)만** PC의 `GameLayout` 대신 `MobileLayout`으로 그린다(2026-10-31, 시범). 판별은 방 화면이 한다 — `pauseUnlimited`(혼자 놀기) && 팀전 && 시연 · 이벤트 아님. 데스크톱에서 보려면 주소에 `?ui=mobile`(끄기 `?ui=pc`, 탭 단위로 기억). 세로 화면은 여전히 회전 안내다.
**개인전도 이 배치를 쓴다**(2026-10-31): 1:1은 팀전 화면으로 그리므로(`lib/duel.ts`) `MobileLayout`, 3명 이상은 `MobileIndividualLayout`이다. 개인전은 왼쪽 나 · 오른쪽 **지금 차례인 상대**(내 차례에는 직전 상대, 내가 다른 상대를 노리면 그 상대를 4.5초 — `ATTACK_SHOW_MS`)이고, 열 · 이름 · 체력 막대가 그 사람이 고른 색이다. 오른쪽 → 왼쪽 스와이프는 **상대 목록**(`OpponentListSheet` — 고른 채 한 번 더 밀면 그 사람의 카드 상세), 공격 카드는 **대상 고르기 창**(`MobileTargetPicker` — 한 번 눌러 고르고 한 번 더 눌러 확정, 고른 채 밀면 상세). 판단(차례 · 순위가 정해진 사람 잠금 · 자동 턴 마치기)은 PC `IndividualLayout`과 같은 기준이다.
- 층: 판(`.m-board`)은 제 층(z 1)에 연출을 가두고, 카드 띠를 **스와이프로** 열면 가운데가 90, 카드 상세 · 상대 목록(`.m-sheets`)은 언제나 92(대상 고르기 91보다 위)다 — 스와이프로 연 창은 늘 맨 위.
- ⚠️ 스와이프 직후의 누름은 Chrome이 click을 만들지 않는다(밀던 화면을 멈추는 손짓으로 본다 — 실측 약 1초). 목록 줄 · 대상 줄은 그래서 click이 아니라 **손가락을 뗀 순간**에 반응한다(`IndividualPanels`의 `tapProps`). 손짓 뒤 click 삼키기도 깃발이 아니라 0.4초 마감이다(`useSwipeGestures`).

- **그림 액자 · 상단 들보를 쓰지 않고 CSS로만 그린다**(`globals.css` 끝의 `.m-*` — 파일 **끝**에 있어야 앞의 T1 · T2 규칙을 이긴다). 위 띠(왼쪽 단계 칩 · 가운데 타이머(`ActionPrompt` 그대로) · 오른쪽 진행 안내 `MobileNotice`) / 양옆 동물 아이콘 열(`AnimalRail`) / 가운데 판 / 아래 체력 막대(`MobileHpBar`, 가운데에서 양쪽으로).
- **판 · 카드 · 연출은 PC 컴포넌트를 그대로 쓴다.** 그래서 연출이 칸을 찾는 표식을 같은 이름으로 단다 — 아이콘마다 `data-team-score-row`, 열에 `data-player-anchor`, 체력 막대에 `data-rabbit-target`. 판 · 카드가 크기를 무대 비례(`--sp` · `--sv`)로 잡으므로 `.m-layout`이 `--stage-w`를 판 높이에서 다시 정하고 **`--sp` · `--sv`도 함께 다시 선언한다**(안 하면 `:root`에서 계산된 값을 물려받는다).
- **판단(내 차례인가 · 고를 기술이 없으면 자동 턴 마치기 · 화면상 값으로 가리기)은 `GameLayout`과 같은 기준을 옮겨 왔다** — 한쪽만 고치면 PC와 모바일이 다르게 논다.
- 단계 표시(`MobilePhase`): 내 차례의 장소 선택 · 행동 선택이 시작될 때마다 화면 50% 판으로 떴다가 왼쪽 위 칩으로 날아간다. ⚠️ 띄우는 단위(phaseKey)는 **"화면에 보이는 내 차례"의 번호 × 단계**다 — `gameState.turn`을 쓰면 서버가 후공의 차례가 끝나는 즉시 턴을 올려(화면은 아직 내 차례) "행동 선택"이 두 번 떴다. ⚠️ 카드 강화 판은 내 차례 동안 기술 카드에 넘기는 경험치를 **행동 선택 알림이 끝날 때까지 붙든다**(MobileLayout의 holdLevels) — 레벨업 · [승격] 연출이 알림보다 먼저 터지지 않게. ⚠️ 판을 걷는 것은 타이머가 아니라 `onAnimationEnd`다 — 이펙트에 건 타이머는 개발 모드 StrictMode가 지워 투명한 판이 남고 칩이 영영 숨었다.
- 동물 아이콘의 얼굴은 **투명 바탕** `public/howto/face_{animal}.webp`다 — `scripts/makeHowIPs.mjs`가 `assets-src/how_IPs.png`(투명 원본)에서 `how_IPs.png`(게임 방법 창의 2×2 그리드)와 함께 만든다. 감정표현 그림(`/emoticon/default`)은 흰 바탕이라 원 안에 흰 동그라미가 떴다. 아이콘 바탕도 흰색이 아니라 짙은 나무색이다.
- ⚠️ `.m-layout`은 `overflow: clip`이다(hidden 아님) — hidden은 초점 · `scrollIntoView`로 **프로그램 스크롤**이 되어, 장소를 누르는 순간 판 전체가 위로 밀려 위 띠가 사라졌다(내려가 있는 카드 띠만큼 아래에 자리가 있다).
- ⚠️ 작은 무대용 규칙(T1)은 스택 카드의 얼굴 그림을 지운다 — 강화 판은 숫자도 감춰 카드가 빈 종이가 되므로 `.m-layout`에서 그림을 되살린다. 위 띠의 오른쪽 끝(`.m-top::after`)은 [일시정지] 버튼 자리로 비워 둔다 — 줄이면 축제 문구가 그 버튼에 가린다.
- 위 띠는 **좌우 대칭**이다 — `1fr · 타이머 · 1fr`에 양 끝이 같은 폭(`--m-slot`): 왼쪽 단계 칩 ↔ 오른쪽 [일시정지]가 얹히는 빈 상자(`.m-pause-slot`, 버튼은 전역 fixed라 CSS가 그 상자 가운데로 옮긴다). 닉네임은 그 안쪽에 마주 본다. 진행 안내(축제 · 추가 뽑기)는 띠가 아니라 바로 아래에 띄운다(`.m-notice-float`).
- 아래 띠: 두 체력 막대가 같은 폭으로 양 끝(설정 톱니 자리만 비우고)까지 뻗고, 강화 판이면 가운데에 지속 효과 아이콘 묶음(`MobileDotHub` — 출혈 · 지속 회복이 늘 있고 꺼지면 회색, 켜지면 가운데에 남은 턴)이 선다. 막대에는 홀로그램(`.m-hp-holo`) · 가운데에서 바깥으로 퍼지는 오라(`.m-hp-aura`) · 지속 효과의 빛(`.m-hp-dotglow`)이 있다. 지속 효과는 막대 둘레가 숨 쉬듯 빛나는 그림자다 — 회복 초록 · 출혈 붉은색 · 둘 다면 반씩(안쪽 절반 회복 · 바깥 절반 출혈), 한 번 든 순간은 같은 색으로 크게 번쩍인다(`.m-hp-dotflash`). (막대 위를 흐르던 +/− 기호는 걷었다.) 내 체력이 막대의 20% 아래면 붉게 깜빡인다(`data-low`).
- 체력이 움직이면 **흰 막대(`.m-hp-ghost`)와 색 막대가 순서를 바꿔 움직인다**(`data-change` + transition-delay) — 깎임은 색 막대가 먼저 줄고 흰 막대가 뒤따르며(−N), 오름은 흰 막대가 먼저 늘고 색 막대가 뒤따른다(+N). ⚠️ 방향은 렌더 도중에 정한다(`MobileHpBar`의 prevHp) — 이펙트에서 정하면 폭이 먼저 커밋돼 옛 방향의 지연으로 움직인다.
- 감정 표현 풍선은 `.m-emotes`(z 35) 층에 가두고, 기술 카드 띠가 올라와 있는 동안은 가운데(`.m-view`)를 40으로 올려 **카드가 풍선 위**에 오게 한다.
- 게임 밖 화면(로비 · 방 설정 · 대기실 · 게임 방법)의 모바일 개선안은 **[`MOBILE_RESPONSIVE_PROPOSAL.md`](MOBILE_RESPONSIVE_PROPOSAL.md)**(미구현 — 가로 폰 팀전 방 만들기 폼에서 팀 이름 · 규칙에 닿을 수 없는 버그 B1 포함).
- **스와이프**(`useSwipePanels`): 아래 → 위 기술 카드 띠(위 → 아래로 닫기) · 왼 → 오 내 카드 상세(`StatusSheet`) · 오 → 왼 상대 카드 상세(반대로 밀어 닫기) · 셋 다 다른 곳을 누르면 닫힌다. ⚠️ 닫기는 손을 뗄 때 판단하고(누르는 순간 닫으면 반대로 미는 동작이 반대편 창을 연다), 스와이프 · 닫기 누름 뒤의 click은 삼킨다(장소 타일 위에서 손을 떼면 카드를 뽑았다). 브라우저 손짓은 `.m-layout { touch-action: none }`으로 끈다.
- 카드 강화의 **레벨업 · [승격] 연출 동안은 카드 띠를 올렸다가 연출이 끝나면 내린다**(MobileLayout의 fxOpen — 그 연출은 카드 위에서 터지는데 장소를 고르는 동안에는 띠가 내려가 있었다). 시간은 연출 길이(레벨업 1.45초 · 승격 2.7초) + 띠가 올라오는 0.4초 — 연출 길이를 바꾸면 함께 고칠 것.
- 지속 회복 · 회복 효율 감소 아이콘의 십자(`.hp-status-regen` · `-healcut`, PC 체력 구슬과 공용)는 **한 덩어리**(clip-path)로 그린다 — 막대 둘에 각자 흰 테두리를 두르면 가운데에 가로선이 비쳐 십자로 안 보였다.
- 행동 선택: 판이 어두워지고 기술 카드 띠가 올라온다(`data-cards`). 카드는 `SkillChoiceBar`의 **`tapFocus`** — 한 번 누르면 고르고(1.05배 · 손가락은 고른 카드에만), 고른 카드를 끌면 기울고, 한 번 더 누르면 쓴다. `tapFocus`가 꺼진 PC는 동작이 그대로다(`measurePlay --diff team-before` 0개).

### 이벤트 모드 — 행사용 도전 세 가지 + 동물의 왕 (`EVENT_MODE_ROADMAP.md`)

'다같이 놀기'의 세 번째 패널 **'이벤트 방 참가하기'** 에서 개발자/도전자를 고른다. 도전은 개발자를 이겨라(사람 개발자와 1:1, 상시 대기·자동 매칭) · 목표점수 달성하기(컴퓨터 상대, 10~20 무작위 목표를 10턴이 끝날 때 넘기면 성공) · 한 우물만 파기(상표토끼·특허랑이 중 처음 쓴 카드만)이고, **동물의 왕**은 판이 아니라 **모든 이벤트에서 이긴 판**에서 카드별로 **기술 한 번의 최고 효과**(실용신양 추가 뽑기 수 · 상표토끼 회복 · 디자인어 배율 · 특허랑이 강탈 — `skillPeakValue`, DB의 `peak_skill`)를 낸 사람의 순위표다(2026-10-27에 '개발자를 이겨라 승리 판의 최고 레벨'에서 바뀌었다). 설계·결정·시뮬레이션 수치는 로드맵이 기준이다.

- **엔진은 팀전 1:1 그대로다.** 도전자는 언제나 A팀, 상대(CPU 또는 개발자)는 B팀. 컴퓨터 대전 두 가지의 규칙은 `shared/events.ts`의 프리셋이 덮어쓰고(`clampSettings`를 거친다) 누구도 못 바꾼다. **'개발자를 이겨라'만은 개발자가 정한다** — 개발자 폼(입장·대기실)에 방 만들기와 같은 `GameRulesFields`가 있고(`hidePause` · `hideFirstTeam`), 값은 `eventDevStandby.settings`/`eventDevSettings`로 서버의 그 개발자(`devId`)에 붙어 **다음 판부터** 쓰인다. 서버는 `beatDevSettings`로 다시 잘라 내며 **도전자 선공·일시정지 0은 덮어쓴다**(화면 검증만 믿지 않는다). 대기 중 입력은 600ms 멈춘 뒤에 보낸다(치는 중간값이 판에 실리지 않게) — 화면 값을 서버 상태로 덮어쓰지 않는 것도 같은 이유다. 이벤트 판은 **일시정지가 없다**(`Room.handlePauseRequest`가 막고, 혼자 놀기의 "무제한"보다 먼저 걸린다).
- **한 우물만 파기의 잠금은 엔진 한 곳(`skills.ts`의 `eligibleAnimals`)이 지킨다.** 고정도 `applySkillChoice` **안에서** 세운다 — 방에서 세우면 시간초과로 서버가 대신 고른 기술이 고정을 빠져나간다. 화면은 세 곳(기술 카드 `wellOpen` · `GameLayout`의 "고를 게 없으면 자동 패스" · `finishingMove`)에 같은 잠금을 반영한다(`lib/skills.ts`의 `oneWellOpen`). 기술 없이 이기는 것은 규칙상 불가능하다(`oneWell.test.ts`가 500판으로 지킨다 — 체력을 바꾸는 규칙이 새로 생기면 다시 볼 것).
- **목표점수 달성하기는 엔진의 `GameState.scoreRace`(`{ side, target, maxTurn }`)가 규칙이다**(2026-10-26에 "목표 선택 + 전체 제한시간"에서 바꿨다 — 시계·`timeUp`·운영자 제한시간 설정은 모두 걷어냈다). 목표는 허브가 10~20에서 뽑고(`randomScoreRaceTarget`), 방의 `applyEventRules`가 첫 스냅샷 **전에** 도전자 0점 · 컴퓨터 `SCORE_RACE_CPU_HP`(10)로 체력을 바꾼다. 엔진은 ① `checkKnockout`을 끄고(0점에서 시작하니 안 끄면 첫 수에 끝난다) ② 턴 상한을 `maxTurnOf(state)`(10)로 바꾸며 ③ 그 턴이 끝난 순간 **점수 ≥ 목표면 도전자, 아니면 상대 승리**(`gameEnd.reason 'target'`). ⚠️ **턴 상한을 `MAX_TURN`으로 직접 쓰지 말 것** — 상단 턴 표시·축제 시작 보정·종료 판정 모두 `maxTurnOf`를 쓴다. 이 판의 컴퓨터는 공격형이다(`pickScoreRaceComputerSkill` — 상표토끼 없음, 특허랑이 → 인어 → 양). 화면은 즉시 승리 표시(`finishingMove`)를 끄고, 체력 구슬의 만점을 목표 점수로 바꾸며, `EventHud`는 목표·남은 턴만 보여 준다(지금 점수를 HUD에 쓰면 연출보다 먼저 오른다). 축제 3턴·1회는 `eventBalance.ts` ②로 정했다(그리디 봇 승률 목표 10점 58% → 20점 21%).
- **목표점수의 시작 룰렛(`ScoreRaceIntro`)이 도는 동안 판은 서버에서 멈춰 있다.** 방이 첫 턴 타이머에 `introGraceMs()`를 얹고 그 사이의 클릭을 `rejectIfIntro`로 거부한다. ⚠️ **룰렛은 판이 만들어질 때가 아니라 도전자의 게임 화면이 붙는 순간(`handleReconnect` → `startIntroIfWaiting`) 시작한다** — 판 생성 시각부터 세면 로비 → 게임 화면 전환(개발 서버는 첫 컴파일까지) 몇 초가 룰렛에서 깎여 숫자가 돌기도 전에 끝났다. 그 화면이 끝내 안 붙을 때를 위한 상한이 `SCORE_RACE_INTRO_WAIT_MS`다. 화면에는 남은 ms(`event.introRemainingMs`)만 보내고 `useWebSocket`이 받은 순간 `eventIntroUntil`로 환산한다(턴 타이머 규칙 1). 끝난 뒤에는 싣지 않으므로 F5로 다시 돌지 않는다. 룰렛은 연출일 뿐이다(목표는 첫 스냅샷에 이미 있다) — 그래서 그동안 `EventHud`가 목표를 "?"로 가린다.
- **개발자는 연결이 아니라 `devId`로 기억한다**(`server/events/hub.ts`). 로비 → 게임 화면으로 갈 때마다 새 WebSocket이 열리므로, 연결로 기억하면 매칭되는 순간 "나간" 것이 된다. 판이 끝나면 결과 화면이 10초 뒤 로비로 보내고, 로비는 `client/lib/eventSession.ts`의 개발자 세션으로 **저절로 다시 대기**한다(상시 대기). ⚠️ 매칭 메시지 순서는 **`roomJoined` → `gameStart`**(뒤집히면 새 게임이 지워진다 — `Room.detach` 절과 같은 이유).
- **기록은 `server/records/store.ts` — 메모리가 1차 사본, DB(Postgres, `DATABASE_URL`)는 붙드는 쪽이다.** 순위표·닉네임 검사는 메모리로 하고, 쓰기는 비동기 + 재시도 큐다(게임 흐름에서 await하지 말 것). 서버가 켜질 때 DB가 없으면 메모리로 돌면서 다시 붙을 때까지 재시도하고, **다 읽은 뒤에야** 쌓인 것을 넣는다(먼저 넣으면 같은 행이 두 번 잡힌다). DB 없이도 로컬 개발·테스트가 돈다.
- **닉네임은 행사 전체에서 유일하다**(`normalizeNameKey` — 공백·대소문자·NFC). 재도전은 같은 닉네임 + 처음 정한 4자리 PIN. 겹침 안내·암호 오류는 전역 배너가 아니라 **폼의 설명 줄을 갈아끼운다**(`useWebSocket`의 `eventError` — 로비 폼 높이 규칙).
- **비밀값은 서버 환경변수로만**(`EVENT_DEV_TOKEN` · `EVENT_ADMIN_TOKEN` · `EVENT_PIN_PEPPER` · `DATABASE_URL`, `render.yaml`에는 `sync: false`로 이름만). 프로덕션에서 비워 두면 그 기능이 꺼지고, 개발 빌드는 `dev1234`/`admin1234`를 쓴다. `shared/`에 두지 말 것(번들에 박힌다).
- **로비 세 열**: `.multi-inner`가 `1fr 1fr 1fr`이고 안쪽 패널의 원래 폭은 `(100cqw − 2·gap) / 3`이다. 가운데 열(방 참가하기)만 고른 쪽에 따라 밀려날 방향이 바뀐다(`data-stage="event"`면 왼쪽). 이벤트 폼 상태 8가지는 `measureLobby.mjs`가 함께 잰다(서버가 떠 있어야 대기 줄·중복·암호 화면이 뜬다).
- 화면: 순위표 `/events`, 부스 대형 화면 `/events/board`(30초 갱신), 운영자 `/admin`(현황 · 무효 처리 · CSV · 일괄 삭제 — 토큰 검사는 서버). 게임 화면의 머리표는 `EventHud`(fixed 오버레이 — 액자 배치에 끼우지 않는다).

### 배포 — 루트 `server.ts` / `Dockerfile`
Render처럼 서비스당 포트를 하나만 외부로 공개하는 플랫폼에서는 WS용 포트를 따로 열 수 없으므로(브라우저가 WS 서버에 직접 접속하는 구조라, 그 포트가 공개되지 않으면 접속 자체가 안 됨), 루트 `server.ts`가 Next.js 커스텀 서버 위에 같은 HTTP 서버·같은 포트(`$PORT`, 기본 3000)로 `/ws` 경로의 WebSocket을 함께 띄운다. 로컬 개발 시에는 이 파일을 쓰지 않는다 — 위의 "개발 명령어"대로 서버(8080)와 클라이언트(3000)를 분리 실행하는 방식을 그대로 쓴다. `npm run start`(루트, `ts-node --transpile-only server.ts`) 또는 `docker build -t ip-card-battle .` && `docker run -p 3000:3000 ip-card-battle`로 실행한다. Render는 `render.yaml`(Blueprint)이 서비스를 정의하며, 대시보드에서 한 번 연결하면 그 뒤로는 `main` push마다 자동 재배포된다.

**배포에 WS 주소를 넣지 않는다.** `client/hooks/useWebSocket.ts`의 `resolveWsUrl`이 ① `NEXT_PUBLIC_WS_URL`이 있으면 그것 → ② 개발 빌드면 `ws://localhost:8080` → ③ 프로덕션 빌드면 **이 페이지와 같은 호스트의 `/ws`** 순으로 정한다. 통합 서버가 Next.js와 WS를 같은 포트에 얹으므로 ③이 언제나 맞고, 그래서 배포 도메인을 빌드 전에 알 필요가 없다 (`NEXT_PUBLIC_*`는 런타임 환경변수가 아니라 빌드 시점에 번들로 박히는 값이라, 도메인을 미리 못 박는 방식은 한 글자만 어긋나도 게임이 조용히 연결되지 않는다 — 화면은 멀쩡히 뜨고 방만 안 만들어진다). **갈림길이 호스트가 아니라 빌드 모드인 것이 요령이다** — 로컬에서 Docker 이미지를 띄우면 브라우저 주소가 개발 때와 똑같은 `localhost:3000`인데 WS는 8080이 아니라 같은 포트의 `/ws`에 있어, 호스트 이름으로는 둘을 가를 수 없다.

### 방장이 정하는 게임 규칙 (`GameSettings`, `shared/constants.ts`)
`targetScore`(시작 체력이자 승리 격차 — winHp = targetScore×2), `festivalTurn`(도토리 축제 시작 턴), `festivalDrawCount`/`festivalDrawIncreaseInterval`, `drawTimeSec`/`actionTimeSec`/`noActionTimeSec`. 방 생성 시 `clampSettings`로 `SETTINGS_LIMITS` 범위로 잘라내며, 게임 중에는 불변이다. 실제 승패 판정·타이머 계산은 항상 `state.settings`를 참조하고, `shared/constants.ts`의 `INITIAL_HP`/`WIN_HP`/`FESTIVAL_TURN` 등은 "기본 규칙일 때의 참고값"일 뿐이다.

**도토리 축제** — `festivalTurn`(기본 8턴)에 도달하면 그 턴부터 **매 턴 계속(한 번 터지고 끝나는 일회성 보너스가 아니다)** 다음 팀에게 실용신양과 동일한 방식의 "도토리 뽑기"가 예약된다(`pendingFestivalDraws`, `server/engine/turnManager.ts`의 `festivalDrawCountAt`). 매 턴 같은 횟수가 아니라 `festivalDrawIncreaseInterval`(k, 기본 2턴)이 지날 때마다 그 턴부터 매 턴 예약되는 횟수 자체가 `n×1 → n×2 → n×3 ...`로 한 단계씩 올라간다 — 기본 설정 그대로도 2턴마다 계속 단계가 오른다(k를 999에 가깝게 크게 잡아야 비로소 "사실상 증가 없음"이 된다). 이 규칙을 다시 바꿀 때는 "한 번만 터지는 이벤트"로 오해해 되돌리기 쉬우니 주의. 축제 진입 순간, 클라이언트는 그 방에 실제 적용되는 k·n 값을 `FestivalStartBanner`로 화면 중앙에 안내한다(`useAnimationQueue.ts`의 `festivalStartInfo`).

### 클라이언트 — 서버 이벤트를 연출 타임라인으로 번역
서버는 매 액션마다 `GameEvent[]`(draw/collect/bonusDraws/festivalDraws/skillApplied/skillPassed/festival/gameEnd/timeout* 등)와 최신 `GameState`를 함께 보낸다. `client/hooks/useAnimationQueue.ts`가 이 이벤트 배열을 받아 **연출 순서대로 재생 시각을 계산해 `setTimeout` 체인으로 스케줄링**하는 것이 클라이언트에서 가장 복잡하고 중요한 부분이다 — 실제 게임 상태(`gameState`)는 액션이 끝나는 즉시 최종값으로 도착하지만, 화면에는 "슬롯 스핀 → 카드 노출 → (짝 맞으면) 흔들기 → 팀 쪽으로 날아가기 → 팀 패널 숫자 반영 → 레벨업 판정" 순서로 지연 재생되어야 하므로, 카드 목록(`stackCards`)·경험치 표시값(`displayedExp`)·활성 팀 표시(`displayedActiveTeam`) 모두 서버 진실과 별도의 "화면상 상태"로 관리한다. 다음 액션이 이전 애니메이션 도중 도착하면 타이머를 통째로 취소하고 서버 진실 기준으로 강제 정리하는 방어 로직이 곳곳에 있으니(주석에 과거 버그 사례가 남아있다), 이 훅을 건드릴 때는 그 방어 로직의 이유를 먼저 이해할 것. 연출 레이어 컴포넌트는 `client/components/effects/`, 보드/패널 UI는 `client/components/game/`에 있다.

**개발 원칙 — 애니메이션과 실제 로직의 순서는 항상 일치해야 한다.** "카드가 팀 동물 영역으로 도착 → 경험치 반영 → 정산해서 레벨업"처럼 사용자가 기대하는 인과 순서를, 화면도 정확히 그 순서로 보여줘야 한다. `gameState.exp`(서버 진실)가 렌더에 반영되는 시점과, 그 값을 가리는 마스킹 상태(`pendingExpCredit`)가 반영되는 시점이 어긋나면 안 된다.

이 마스킹을 **`useEffect`는 물론 `useLayoutEffect`로도 완전히 고칠 수 없었다** — 처음엔 "레이아웃 이펙트로 하면 페인트 전에 동기 반영되니 괜찮다"고 생각했지만 실제로는 부족했다: `gameState`가 바뀌면 그 즉시 (마스킹이 아직 옛 값인 채로) 첫 번째 렌더가 일단 커밋까지 끝나고, 그 직후에야 레이아웃 이펙트가 두 번째(가려진) 렌더로 덮어씌운다. 화면엔 두 번째 커밋만 페인트되어 눈으로는 문제없어 보이지만, 첫 번째(부풀려진) 커밋에도 하위 컴포넌트의 `useEffect`(예: `ScorePanel`의 레벨업 감지, `prevLevelRef` 비교)가 정상적으로 예약되고, 이 패시브 이펙트는 두 번째 커밋이 이미 화면을 바로잡았다는 사실과 무관하게 자신이 렌더될 때 캡처한 "부풀려진" 값을 그대로 들고 나중에(비동기로) 실행돼버려 — 카드가 실제로 도착하기도 전에 "Lv UP!" 연출이 클릭 즉시 터지는 버그로 이어졌다(레이아웃 이펙트로 바꿔도 재발).

**진짜 해법은 이펙트 자체를 쓰지 않는 것**: React가 공식 지원하는 "렌더 도중 상태 보정" 패턴(prop 변화를 ref로 감지해 그 조건 블록 안에서 곧바로 `setState` 호출)으로, `gameState`/`lastEvents`가 바뀐 그 렌더 안에서 마스킹 상태도 함께 동기 반영해버린다(`client/hooks/useAnimationQueue.ts`의 `lastEventsForCreditRef` 블록 참고). 이러면 "부풀려진" 중간 렌더 자체가 커밋되지 않으므로, 그 어떤 하위 `useEffect`/`useLayoutEffect`도 잘못된 값을 관측할 기회가 없다. **교훈: 서버 진실과 그 진실을 가리는 마스킹이 반드시 같은 커밋에서 함께 나타나야 하는 경우, `useLayoutEffect`도 충분하지 않을 수 있다 — 렌더 도중 동기 보정을 우선 고려할 것.**

**게임 화면 · 로비는 문서 스크롤을 잠근다**(`html:has(.play-bg), html:has(.lobby-root)` — 2026-10-31). 흔들림 연출(`.shake-combo`)이 화면을 몇 px 밀어 전체 스크롤바가 깜빡였다. 스크롤이 필요한 곳은 모두 안쪽 상자가 스크롤하고, 결과 화면(`.result-bg`) · 순위표 · 운영자 화면은 걸리지 않는다. PC 체력 구슬의 빛은 몽글몽글 빛 덩어리 대신 **무지갯빛 띠가 아래에서 위로 훑는 그라데이션**(`.hp-orb-rise::before`, 모바일 막대의 홀로그램과 같은 색)이다.

### 글꼴과 그림 버튼

**기본 글꼴은 Cafe24 Ssurround다.** `layout.tsx`의 `next/font/local`이 `--font-cafe24`에
싣고 `globals.css`의 `body`가 그것을 쓴다. 받은 폴더에는 확장자가 넷(ttf 3.8MB / otf 1.6MB /
woff 906KB / **woff2 392KB**) 있지만 **woff2를 쓴다** — 한글 글꼴은 원본이 무거워 그 차이가
첫 접속 대기시간에 그대로 얹힌다. woff는 woff2를 못 읽는 브라우저용 보험이라 평소 비용이 0이다.
**글꼴을 바꾸면 글자 높이가 달라져 로비 폼이 몇 px 움직인다 — `measureLobby.mjs`로 다시 잴 것.**

그림으로 그리는 버튼이 셋이고 쓰임이 다르다. 새 버튼을 만들 때 어느 쪽인지부터 고른다.

| | 그림 | 글씨 | 크기 지정 |
| --- | --- | --- | --- |
| `IconButton`(`.icon-button`) | 아이콘 한 장 | 그림에 없음 → `aria-label`만 | 정사각형 한 변(px) |
| `BarButton`(`.bar-button`) | 글씨까지 그려진 완성 팻말 | **그림 안에 있음** → 라벨을 쓰면 두 번 보인다 | 가로만, 세로는 비율 |
| `PlankButton`(`.plank-button`) | 빈 나무판(9분할) | **HTML로 얹는다** | 글자 길이를 따라 늘어남 |

문구가 상태에 따라 바뀌는 자리("준비" ↔ "준비 완료 ✓")는 `PlankButton`뿐이다 — 글씨가 박힌
그림으로는 만들 수 없다. `.plank-button`의 9분할 슬라이스(`40 95`)와 테두리 두께(`12px 28px`)는
**비율을 맞춘 짝이라 한쪽만 고치면 마구리가 눌린다**(`client/public/ui/README.md` 참조).

크기를 `em`이 아니라 px로 잡는 이유는 로비 폼의 세로 여유가 몇 px 단위라, 글씨 크기 설정
5단계에 버튼까지 따라 커지면 폼이 넘치기 때문이다.

### 플레이 화면의 나무 UI — `client/public/play/` + `.play-*` 클래스

로비를 끝낸 뒤 실제 게임 화면에도 같은 세계관(나무 액자·양피지·덩굴)을 입히는 중이다.
계획과 진행 상황은 `PLAY_UI_ROADMAP.md`, 조각별 분할 값은 `client/public/play/README.md`,
경로는 `client/lib/playAssets.ts` 한 곳에 있다. 에셋은 시트에서 잘라 쓰며
`cd client && node scripts/cutPlaySheet.mjs` 한 줄로 다시 만들 수 있다(원본 시트는
`client/assets-src/` — `public/` 안에 두면 수 MB가 빌드 산출물에 실린다).

**이 작업은 가죽만 갈아입히는 일이다.** 배치·컴포넌트·연출은 건드리지 않고 상자마다
`border-image` 클래스를 덧붙인다. 그래서 `client/scripts/measurePlay.mjs`가 있다 —
혼자 놀기로 실제 게임에 들어가 세 해상도 × 두 단계에서 상자 10개를 재고,
`--diff baseline`으로 **움직인 상자가 있는지**를 숫자로 확인한다. 눈으로는 액자가
예뻐 보이는데 그리드가 3px 밀린 상황을 잡아내지 못하기 때문이다.

**⚠️ 액자가 바깥, 그림이 안쪽이다.** 그림을 상자에 꽉 채우고 액자를 그 위에 덮으면
그림이 액자 밖으로 비어져 나온 것처럼 보인다(그렇게 만들었다가 고쳤다). 그림 레이어에는
`inset: 0`이 아니라 `inset: var(--frame-inset)`(`.play-frame-inset`)을 주고, 액자
클래스가 자기 테두리 두께에 맞춰 그 값을 정한다. **새 액자를 만들 때 이 짝을 함께 둘 것.**
단, `<img>`를 직접 그 클래스로 앉히면 안 된다 — 절대배치된 대체 요소의 `width: auto`는
네 변이 아니라 **내재 크기**로 풀려 `object-contain`이 먹지 않는다. `<div>`로 한 겹 감싼다.

**⚠️ 기술 카드의 홀로 효과(확대·기울기·광택)는 CSS `:hover`가 아니라 `data-hover`가 켠다.** `SkillChoiceBar`의 `HoloCell`이 포인터가 들어올 때 종류(`pointerType`)를 보고 **마우스·펜일 때만** 그 속성을 단다. `(hover: hover) and (pointer: fine)` → `(any-hover: …)`로 고쳐도 사용자 PC에서 여전히 카드만 그대로였다(같은 화면의 손가락 가이드는 조건 없는 애니메이션이라 멀쩡히 움직여 원인을 가렸다) — 미디어 쿼리는 브라우저의 기기 판정에 달려 있어 터치스크린 노트북·원격 데스크톱에서 어긋난다. 이 효과를 다시 `:hover`나 미디어 쿼리로 묶지 말 것. 터치는 `pointerType`이 `'touch'`라 켜지지 않으므로 "굳는 hover"도 없다. **내가 행동을 고르는 단계가 아니면(상대 차례 · 내 장소 선택 · 연출 중 · 관전) 입체 움직임 없이 광택만** — `SkillChoiceBar`의 `interactive`(= 레이아웃의 `isMyChoiceTurn`)가 false면 `HoloCell`이 `data-flat`을 달고 CSS가 떠오름·기울기·옆면을 끈다(2026-10-30 — 처음엔 "상대 차례만"이었다가 같은 날 "내 행동 선택 단계에만 입체"로 좁혔다). 카드 강화 판의 [턴 마치기]도 기술 카드처럼 내려놓는다(`quake.trigger(cell, 1)` — 진도 1).

**⚠️ 사진을 덮는 액자에는 `fill`을 쓰지 않는다.** 가운데 조각까지 그리면 액자 속
양피지가 사진(장소 타일·기술 컷신)을 통째로 덮는다. 없이 쓰면 여덟 조각만 그려진다.

**⚠️ 모서리 장식은 액자 그림에 합치지 않는다.** 합치면 모서리 조각(`border-width`
× `border-width`)에 통째로 눌려 얼룩이 된다 — 로비 `back_board`와 같은 함정이다.
다만 **슬라이스가 정사각이고 네 변 두께가 같으면** 모서리는 가로·세로 같은 배율로
작아질 뿐 눌리지 않는다(장소 타일의 `board_v`가 그 경우다).

### 로비 화면 — `client/app/page.tsx` + `client/components/lobby/`

**폰(가로 · 세로)은 globals.css 끝의 "게임 밖 화면 — 폰" 절이 덮는다**(2026-10-31, `MOBILE_RESPONSIVE_PROPOSAL.md` — 조건은 `lib/mobileLayout.ts`의 `PHONE_*_QUERY`와 같은 문자열). 가로 폰은 폼 · 대기실이 안전영역을 버리고 화면 전체를 쓰고(규칙이 있는 폼은 2열 — 왼쪽 이름 · 오른쪽 규칙, 규칙은 처음부터 펼친다), 세로 폰은 폼이 화면 아래에 붙는다. 규칙 숫자 칸은 폰에서 **값만 보이는 버튼**이고 누르면 어두운 화면 위 입력 창(`RuleEditDialog` — body로 portal, −/+ · [확인])이 뜬다(`.rule-value-button` — 데스크톱은 감춘다), 대기실 시작/준비 버튼은 바닥 고정(`.waiting-action`), 게임 방법은 넘기는 카드(`.howto-steps`). ⚠️ 가로 폰에서 안전영역 위치를 px로 적지 말 것 — 부모 `.lobby-table`이 화면보다 큰 cover 상자라 top: 0이 화면 위가 아니다(가운데에서 `-50dvh`만큼 올린다). ⚠️ 데스크톱이 그대로인지는 `measureLobby.mjs`의 1280 · 1366 · 1920 줄을 이전 출력과 비교해 확인한다(폰 크기도 이제 함께 재고, 잠긴 상자에 잘려 "닿을 수 없는 조작"도 센다 — `MOBILE_ONLY=1`이면 폰만).

게임 화면과는 완전히 다른 원리로 돌아가므로 따로 이해해야 한다. 설계 배경과 실측값은 `LOBBY_REDESIGN.md`에 있다.

**단계 전환은 `data-stage` 속성 하나로만 한다.** `page.tsx`가 `stage`(`home`/`solo`/`soloNormal`/`soloEnhance`/`multi`/`create`/`createTeam`/`createIndividual`/`join`/`event`)를 들고 있고(`create`는 팀전 · 개인전 두 패널을 고르는 단계 — 안쪽 2열은 `.create-inner`가 `.solo-inner`와 같은 방식으로 드러낸다. CSS에서 "방 만들기 쪽에 있다"는 세 값 모두, "폼이 열렸다"는 `createTeam`·`createIndividual`이다), `LobbyStage`는 **패널과 폼을 모두 항상 마운트한 채** `.lobby-stage[data-stage=...]`만 바꾼다. 조건부 렌더링을 하지 않는 것이 핵심이다 — 전환을 전부 CSS transition이 맡으므로 **뒤로가기는 `data-stage`를 이전 값으로 되돌리기만 하면 정확한 역방향으로 재생된다**(exit 애니메이션용 타이머·`onAnimationEnd`·상태 복제가 전혀 필요 없다). 화면에 보이지 않는 영역은 `inert`로 막아 Tab 포커스와 클릭이 새지 않게 한다.

밀려나는 방향은 `justify-content` 한 줄이 정한다. 열이 줄어들 때 패널이 어느 쪽 모서리에 붙어 있느냐의 문제다 — `flex-end`면 왼쪽으로, `flex-start`면 오른쪽으로 빠져나간다. 줄어드는 열은 `overflow: hidden`이고 안의 패널은 `min-width: calc((100cqw - gap) / 2)`로 **원래 크기를 유지**하므로, 찌그러지지 않고 잘려 나가며 슬라이드처럼 보인다.

**배경 위 좌표계 — `.lobby-table`.** `background-size: cover`는 이미지가 어디에 얼마로 그려지는지 CSS가 알 수 없어 그 위에 좌표를 얹을 수 없다. 그래서 **cover와 똑같은 계산을 요소 크기로 옮겼다**(`width: max(100vw, 100vh * --table-w / --table-h)`). 이렇게 하면 `.lobby-table`의 퍼센트 좌표가 곧 이미지 좌표가 되어, 안전영역(`.lobby-safe`)이 캐릭터·카드더미·램프를 피한 자리를 화면 비율과 무관하게 항상 정확히 잡는다. 배경을 다른 구도로 교체하면 `globals.css`의 `--table-w/h`와 `--safe-*` 6개 값만 고치면 되고 컴포넌트는 손댈 필요가 없다(`client/public/lobby/README.md` 참조).

좁은 화면(≤767px)에서는 테이블이 크게 확대돼 좌우 비대칭(26.4%/29.6%)이 그 배율만큼 벌어져 안전영역을 화면 밖으로 밀어낸다 — 미디어쿼리에서 `--safe-left/right`를 `30%`로 대칭 처리하는 이유다.

**폼은 스테이지 박스를 넘으면 안 된다.** 폼(`.stage-form`)은 `position: absolute`라 박스를 밀어낼 수 없다. 그래서 폼이 열리면 로고 슬롯이 접혀 공간을 내주고, 게임 규칙은 2열 배치 + 라벨 축약으로 눌러 담았다. 폼에 항목을 추가할 때는 **반드시 스크롤바가 생기지 않는지 실제로 재볼 것** — `LOBBY_REDESIGN.md` §12에 헤드리스 Chrome 실측 방법과 기준값이 있다.

**로딩 화면 배경은 여러 장을 번갈아 보여준다**(지금 세 장). `LoadingScreen`이 그림 수만큼 레이어를 겹쳐 깔고 보이는 한 장만 `opacity: 1`로 둔다 — 2.5초마다 다음 장으로 넘어가고, 그 사이 0.5초가 크로스페이드다(`SLIDE_HOLD_MS`/`SLIDE_FADE_MS`, CSS는 `--loading-fade`로 받는다). **순서는 배열에 적힌 그대로**이고 언제나 0번으로 시작한다. ⚠️ **첫 장을 무작위로 만들려 하지 말 것**(2026-09-29에 해봤다가 되돌렸다) — 이 페이지는 정적으로 미리 그려져 나가고 그 HTML이 JS보다 먼저 화면에 칠해지므로, "마운트 후에 고르는" 방식으로는 맨 처음 보이는 것이 언제나 0번이 된다. 그것을 피하려면 순서가 정해질 때까지 어느 장도 보이지 않게 둬야 하는데, 그러면 첫 그림이 늦게 뜬다. 순서를 바꾸고 싶다면 `LOADING_BACKGROUNDS`의 나열 순서를 고친다. **한 요소의 `background-image`를 갈아끼우면 안 된다** — 새 그림이 디코딩되기 전 한 프레임 동안 바탕색이 드러나 깜빡인다. 결과 화면(`GameEndScreen`)도 배경이 여러 장인데(지금 네 장) 그쪽은 들어올 때 하나를 뽑아 끝까지 쓴다(`--result-bg`). **양쪽 다 장수는 배열 길이로만 돌아가므로**, 그림을 더하거나 빼는 일은 `lobbyAssets.ts`/`playAssets.ts`에 경로를 넣고 그 배열에 한 줄 더하는 것이 전부다(CSS·연출 코드는 손댈 것이 없다). 다만 구도는 골라야 한다 — 로딩은 **가운데 위쪽이 비어 있어야**(진행 막대와 문구 판이 그 자리다), 결과 화면은 **주인공이 좌우 가장자리에 있어야** 한다(가운데를 불투명한 판 두 장이 덮는다).

**에셋은 `client/lib/lobbyAssets.ts` 한 곳에서만 참조한다.** 배경·로고 경로가 여기 모여 있어 교체는 상수 한 줄이다. **모드 선택 패널 넷은 모두 일러스트를 깐다.** `ModePanel`에 `artSrc`를 넘기면 그림이, 안 넘기면 `globals.css`의 `.lobby-panel-{tone}`이 `--panel-a/b`로 넘기는 그라디언트만 그려진다(지금은 후자가 이미지 도착 전 한 프레임의 바탕 역할만 한다). 경로는 CSS가 아니라 `lobbyAssets.ts`에 두고 `--panel-art` 커스텀 속성으로 흘려보내, 에셋 경로가 한 곳에 모인다는 원칙을 지킨다. 아이콘 이모지는 그림과 겹쳐 중복이 되므로 아트 패널에서는 넘기지 않는다(`emoji`는 선택 prop).

**폼이 열리는 단계에서만 배경이 어두워진다** — 혼자 놀기·방 만들기·방 참가하기·대기실. **"다같이 놀기"는 어두워지지 않는다**(2026-09-08). 거기는 아직 고르는 중이라, 그 단계에서 이미 어두워지면 곧바로 방 만들기를 눌러도 더 어두워질 것이 없어 무엇을 고른 순간인지 화면이 알려주지 못한다. `.lobby-table::after`가 검정 0.6을 덮는데, `z-index: -1`이 요령이다 — 이 의사요소가 테이블 **배경 이미지 위**, 그 안의 콘텐츠(`.lobby-safe`) **아래**에 정확히 들어간다. 음수 z-index가 부모 밖으로 새지 않는 것은 `.lobby-table`이 `transform: translate()` 때문에 이미 쌓임 맥락을 만들고 있어서다 — **그 transform을 걷어내면 이 어둠이 배경 뒤로 숨어 사라진다.** `data-stage`는 자식인 `.lobby-safe`에 붙어 있어 `:has()`로 거슬러 읽는다.

**패널에는 옛 LCD 같은 가로 주사선이 얹힌다 — 가리키고 있는 하나에만.** `.lobby-panel::after`의 `repeating-linear-gradient`이고, hover하면 0.7초에 걸쳐 서서히 켜지며 **위로** 흐르고(`lobbyScanDrift` — 이동량이 줄 간격과 같아 한 바퀴가 정확히 맞물려 이음매가 보이지 않는다. 음수로 감아야 위로 올라간다) 밝기가 흔들린다(`lobbyScanFlicker`). 넷 다 늘 깔면 동시에 지직거려 시선 둘 곳이 없어진다. `.lobby-panel-bg`가 아니라 **버튼 자신**에 거는 이유는 배경 레이어에 `blur`/`scale` filter가 걸려 있어 그 안에 그리면 줄무늬까지 함께 뭉개지기 때문이다.

**깜빡임은 `opacity`가 아니라 `filter: opacity()`로 건다.** 애니메이션은 같은 속성의 transition을 즉시 덮어쓰므로, `opacity`를 흔들면 hover하는 순간 첫 키프레임 값으로 튀어 **fade-in이 통째로 사라진다**(실제로 그렇게 만들었다가 고쳤다). `filter`로 옮기면 `opacity`를 transition 전용으로 비워둘 수 있고, 두 값이 곱해져 "서서히 켜지면서 지직거린다"가 된다.

**패널 안의 층 순서는 `z-index`로 못박혀 있다** — 위치지정 요소끼리는 tree order가 아니라 z-index가 정한다: `0` 그림(`.lobby-panel-bg`) → `2` 주사선(`::after`) → `3` 글자(`.stage-panel-label`). 글자가 주사선 위에 있어야 읽힌다.

**폼이 열린 패널은 `.stage-panel`의 흰 테두리를 그대로 지닌다** — 확장된 영역의 윤곽을 잡아줘 어디까지가 입력 화면인지 분명해진다. 한때 이 테두리를 지우고 얕은 글래스모피즘(`::before` + `backdrop-filter`)을 얹어봤지만 둘 다 되돌렸다(패널 그림이 서리유리에 덮여 무엇인지 흐려졌다). **멀티 패널만은 예외로 계속 지운다** — 그쪽은 두 버튼을 감싼 액자가 되기 때문이고, 그 규칙은 아래 "멀티 패널은 다 커진 뒤에" 절에 따로 있다.

**아트 패널(`.lobby-panel-art`)은 톤 패널과 처리가 반대다.** 그라디언트는 반투명하게 깔아 테이블이 비치게 두면 됐지만, 그림을 반투명하게 만들면 펠트 무늬와 섞여 무엇을 그린 것인지 알아볼 수 없게 된다. 그래서 불투명하게 깔되 어둡게 눌러 글자를 읽히게 하고, hover하면 흐림이 풀리며 제 색으로 밝아진다. `blur`에는 `scale(1.05)`가 반드시 딸려야 한다 — `filter: blur()`는 요소 가장자리 **바깥의 투명까지** 번지게 해서 패널 테두리에 희끄무레한 띠를 만들기 때문이고, 그래서 `prefers-reduced-motion`에서도 `transform: none`이 아니라 양쪽 상태를 같은 배율로 고정한다.

**폼 배경은 나무 액자 + 네 귀퉁이 장식이고, 둘은 반드시 분리해 둔다.** 액자(`/ui/back_board.webp`)는 `::before`에 `border-image`로 9분할해 그리고, 귀퉁이 장식 4종(`/ui/corner_*.webp`)은 `::after`에 **고정 크기 배경 네 장**으로 얹는다. 합치면 안 되는 이유는 `border-image`의 **모서리 조각이 언제나 `border-width` × `border-width`로 그려지기** 때문이다 — 장식을 액자 그림에 합쳐 넣으면 26px 남짓에 통째로 압축돼 잎·버섯·도토리가 초록 얼룩이 된다(실제로 합성해봤다가 되돌렸다). 분리하면 장식 크기가 액자 두께와 무관해져 폼이 커지든 작아지든 늘 또렷하다.

**폼 카드는 넓은 화면에서 `zoom`으로 통째로 키운다.** 스테이지가 738×590인데 접힌 카드가 358×326이라 절반이 비어 있었다 — `--form-zoom`으로 액자·귀퉁이 장식·글자·입력창을 한 번에 확대한다. `transform: scale()`이 아니라 `zoom`인 이유는 scale이 레이아웃 상자를 그대로 둬서 스테이지 밖으로 삐져나가고 `measureLobby` 실측이 눈에 보이는 것과 어긋나기 때문이다. **규칙을 펼치면 1로 되돌린다** — 그때는 카드가 이미 스테이지 폭을 다 쓰고 있어 더 키울 자리가 없고, 렌더 폭이 그대로인 채 글자만 커지면 규칙 라벨이 다시 말줄임으로 잘린다. 배율은 높이로 나눈다: `≥768px` 1.35, `≥768px && ≥1000px` 1.75 — 1280×900에서는 가장 키가 큰 폼(초대 링크로 들어온 방 참가하기)이 스테이지 590px를 넘기지 않는 선이 한계다.

**글자는 확대에서 떼어내 항상 약 14pt로 보이게 한다** — 액자·장식만 `--form-zoom`만큼 커지고, 글자는 `zoom`을 나눠 되돌린다. 이때 **`--text-*`를 다시 정의해서는 안 된다**: Tailwind v4는 `.text-sm`을 `calc(.875rem * var(--font-scale))`로 **인라인 컴파일**해 `--text-sm`을 읽지 않는다. 동적으로 남는 것은 `--font-scale`뿐이라 그쪽을 쓰되, 사용자가 고른 글씨 크기 단계를 잃지 않도록 `:root`의 거울 변수 `--font-scale-user`에 배수를 곱한다.

**슬라이스는 필요 이상으로 키우지 말 것.** `58`은 나무막대와 둥근 모서리를 겨우 감싸는 실측값이다. 양피지가 많이 들려 들어가면 그 부분이 변 조각에서는 압축되고 가운데 조각에서는 확대되어, 둘이 만나는 자리에 **양피지 톤이 어긋난 이음매**가 생긴다(`120`으로 뒀다가 겪었다). 또 `--orn-overhang`(장식이 액자 밖으로 걸치는 폭)은 `.lobby-form-wrap`의 padding보다 작아야 한다 — 넘으면 그만큼 스크롤 영역이 넓어져 폼에 스크롤바가 생긴다. 자세한 실측표와 교체 절차는 `client/public/ui/README.md`에 있다.

**게임 규칙을 펼치면 카드 크기는 그대로 두고 넘치는 만큼 스크롤한다.** 이 자리는 세 번 바뀌었다 — ① 오른쪽으로 넓어지는 2열(`51d6d24`~`8efe72e`) → ② 세로로 자라되 넘치지 않게 확대를 1로 내리고 제출 버튼을 40px로 줄임 → ③ **둘 다 걷어내고 그냥 스크롤**(2026-09-08). ②를 버린 이유는 **펼치는 순간 카드가 눈에 띄게 쪼그라드는 것이 스크롤바보다 나빴기 때문이다.** `.stage-form`이 원래부터 `overflow-y: auto`라 코드를 더할 것은 없었고, 오히려 그동안 넣어 뒀던 보정을 지우는 일이었다. 규칙 입력도 2열 압축을 풀어 한 항목씩 세로로 놓는다(라벨이 더 잘리지 않는다).

⚠️ 그래서 **`measureLobby.mjs`가 규칙 펼침에서 "yes(정상)"을 내는 것은 이제 정상이다.** 스크립트가 `+rules`/`+clash`/`+spectator` 라벨에서는 폼 스크롤을 문제로 세지 않는다. **규칙을 접은 상태에서 스크롤이 생기면 그때가 진짜 문제다.**

`GameRulesFields`의 `data-rules-open` 속성은 **다시 CSS가 읽는다**(2026-09-21). 방 만들기 폼은 접혀 있는 동안 `.lobby-form-scroll`을 `overflow: hidden`으로 잠가 막대를 아예 없애고, `:has(.lobby-rules[data-rules-open])`일 때만 연다 — 접힌 첫 화면의 막대는 "무언가 잘렸나" 싶게 만드는데 실제로는 다 들어가 있어서다. ⚠️ **잠그는 쪽이라, 접힌 상태가 실제로 안 넘치는지는 `measureLobby.mjs`가 지켜야 한다** — 넘치는 채로 잠그면 [게임 규칙] 펼치기 버튼이 잘려 규칙을 열 방법이 사라진다(제출 버튼은 `.lobby-form-scroll` 밖이라 늘 눌린다). 팀 이름 두 칸을 세로로 쌓고 라벨까지 입력창 위로 올리며 늘어난 높이는 그래서 방 만들기 전용 `--form-zoom`(0.95 / 1.15 / 1.4)으로 되받았다.

**문구 위치는 그림이 정한다.** 방 만들기·방 참가하기는 주인공(양·셋)이 그림 **아래쪽**에 있어 라벨을 가운데에 두면 정확히 그들을 가린다 — `.lobby-panel-create/join .stage-panel-label`에서 `justify-content: flex-start`로 위(초가지붕)로 올리고, 어둠 띠도 같이 위로 옮긴다. 혼자·다같이 놀기는 인물이 고루 퍼져 있어 가운데가 맞다. 그림을 갈아끼울 때 이 대응을 함께 확인할 것.

**바깥으로 뻗는 그림자는 패널이 아니라 열에 건다.** `.stage-col`은 슬라이드 아웃을 위해 `overflow: hidden`이고 패널은 열을 정확히 채우므로, **패널에 건 바깥 box-shadow는 한 번도 그려지지 않는다**(예전 코드에 죽은 선언이 남아 있었고, hover 강조를 안쪽 링으로 그리던 것도 이 때문이다). 반면 열 **자신의** box-shadow는 자기 overflow에 잘리지 않으므로, `.stage-col:has(> .stage-panel…:hover)`에 걸면 버튼 테두리에서 빛이 퍼지는 그림이 정확히 나온다(`:has(> …)`로 직계 자식만 보는 이유는 멀티 열 안에 방 만들기/참가하기 열이 중첩돼 있어서다). 다만 그 중첩된 두 열은 자르개가 두 겹(`.stage-col-multi`의 overflow + `.multi-inner`의 clip-path)이라 그냥 두면 글로우가 열 사이 간격 쪽으로만 새어 나온다 — 멀티 단계에 한해 두 겹을 `--glow-reach`만큼 연다(`overflow-clip-margin`, 음수 `inset()`). **바깥 멀티 열은 hover 중일 때만 열어야 한다** — 늘 열어두면 싱글을 골라 그 열이 폭 0으로 줄 때 패널 조각이 화면 오른쪽에 띠처럼 남는다. 같은 빛을 뒤로가기 버튼(`.lobby-back`)의 원형 배지에도 걸었는데, 값은 일부러 다르다(12px/0.65) — 지름 36px 배지에 패널과 같은 14px/0.45를 쓰면 번짐이 배지보다 커져 형체 없는 얼룩이 된다. 글로우 폭 변수 `--glow-reach`는 `.lobby-safe`에 있다(뒤로가기 버튼이 `.lobby-stage`의 형제라 스테이지에 두면 닿지 않는다).

**멀티 패널은 "다 커진 뒤에" 녹아 없어진다.** `.stage-panel-multi`는 조건부 렌더링을 하지 않는 구조상 create/join 단계에서도 계속 마운트돼 있는데, 그대로 두면 테두리·그림자가 바깥 윤곽을 그리고 두 열 사이 간격으로 멀티 그림이 비쳐 **두 버튼을 감싼 액자**처럼 보인다. 그래서 `box-shadow: none` + `border-color: transparent` + 배경 `opacity: 0`으로 지우는데(`border: none`이 아닌 이유는 1px이 사라지면 안쪽 배치가 그만큼 밀리고 투명도를 따라 옅어지지도 못하기 때문), **누르는 즉시가 아니라 확장이 끝난 뒤**여야 한다 — 즉시 지우면 확장이 시작되기도 전에 방금 누른 패널이 증발하고 넓어지는 빈 공간만 남는다. `transition-delay: var(--t-expand)` + `var(--t-reveal)` 길이로 바로 아래 `.multi-inner`의 clip-path·opacity와 지연·속도를 **일부러 똑같이** 맞춰, 사라지는 양과 두 버튼이 나타나는 양의 합이 매 순간 1이 되는 크로스페이드가 된다(한쪽 값만 바꾸면 교대가 어긋나 한 프레임씩 겹치거나 빈다). 되돌아올 때는 이 규칙이 통째로 떨어져 나가 지연 없이 기본 transition이 맡으므로, 패널이 먼저 제 모습으로 돌아온 뒤 열이 줄어드는 정확한 역재생이 된다 — 이때 테두리가 뚝 끊기지 않도록 `.lobby-panel`의 기본 transition에 `border-color`가 들어가 있다. `public/`에 이미지를 추가하면 `client/scripts/generateAssetManifest.mjs`의 `IMAGE_DIRS`에 그 폴더가 있어야 `LoadingScreen`이 프리로드한다 — 빠뜨리면 로딩 화면이 끝난 뒤에야 받아와 배경이 늦게 뜬다.

**경고·안내는 새 줄로 덧붙이지 말고 있는 줄을 갈아끼운다.** 폼이 `position: absolute`라 한 줄만 늘어도 좁은 화면에서 스크롤바가 생긴다 — 실제로 방 만들기의 팀 이름 충돌 경고를 별도 `<p>`로 덧붙였더니 390×844에서 카드가 517→545px가 되며 폼이 스크롤했다. 그래서 `FormCard`의 `description`을 `ReactNode`로 받아 **평소 설명 줄을 경고로 교체**하고(높이 증가 0), 어느 칸이 문제인지는 `TeamNameField`의 `invalid`가 붉은 링으로 가리킨다. 이때 링은 반드시 `ring`이어야 한다 — `border-width`를 키우면 입력창이 2px 높아져 같은 문제가 그대로 재현된다. 새 안내를 넣을 자리가 정 없다면 먼저 `client/scripts/measureLobby.mjs`로 재보고 판단할 것(이 스크립트는 충돌 경고·초대 링크 상태까지 함께 잰다).

**게임 규칙 입력은 레이아웃이 둘인데 필드 목록은 하나다.** `GameRulesFields`(로비 폼)는 안전영역에 갇혀 2열로 눌러 담고, `GameRulesInputs`(대기실에서 방장이 규칙 수정)는 폭이 넉넉해 한 항목씩 세로로 둔다. 두 배치가 같은 `RULE_FIELDS`를 쓰되 `label`(축약)과 `title`(전체)을 나눠 갖는다 — 항목을 추가할 때 한 곳만 고치면 다른 배치가 조용히 빠진다.

**대기실만 안전영역 밖으로 나간다.** 안전영역은 *배경 위에 얹히는 반투명 UI*가 캐릭터·카드더미를 가리지 않게 하려는 장치인데, 대기실은 불투명한 흰 카드 하나라 그 제약이 무의미하고 오히려 참가자 목록·채팅·방장 조작·규칙까지 들어가 로비 폼보다 훨씬 길다. 그래서 `.lobby-safe[data-stage="waiting"]`에서만 좌우/상하 제약을 풀고 화면을 세로로 꽉 쓴다(가로는 카드 자신의 `max-w-4xl`에 맞춘다). 로고 슬롯은 폼이 열릴 때와 같은 방식으로 함께 접힌다. 이 단계 값을 되돌리면 대기실 윗부분만 보이고 시작 버튼이 스크롤 밖으로 밀려난다.

### 테스트 작성 시 참고
`server/__tests__/spectator.test.ts`는 엔진이 아니라 방(`Room`)을 직접 세우는 유일한 테스트다 — 가짜 WebSocket(`send`가 JSON을 배열에 쌓는 객체)으로 로비 명령을 넣고 브로드캐스트를 읽는다. 게임을 시작시키면 방이 실제 턴 타이머를 걸므로 반드시 `jest.useFakeTimers()`로 감쌀 것(안 그러면 30초짜리 타이머가 남아 프로세스가 붙들린다).

`server/__tests__/effects.test.ts`는 결정론적 RNG(`rng0`=항상 0번째 선택, `rngLast`=항상 마지막 선택)로 `initGame`부터 각 엔진 함수를 직접 호출하는 패턴을 쓴다. `simulation.test.ts`는 봇 대전을 다회 시뮬레이션해 게임이 항상 유한 턴 내에 끝나는지 등 불변조건을 검증한다.
