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

**dev 서버가 떠 있는 채로 같은 디렉터리에서 `next build`를 돌리지 말 것.** 둘이 `.next/`를 공유해 dev 쪽 증분 상태가 어긋난다 — 이 프로젝트에서 "CSS를 고쳤는데 화면이 그대로"인 일이 네 번 반복됐고, 한 번은 dev 서버 시작 1분 뒤부터 그 뒤 모든 편집이 반영되지 않았다(`.next/dev/`의 수정 시각이 그 시점에 멈춰 있었다). 검증용 빌드는 `NEXT_DIST_DIR=.next-verify npx next build` / `NEXT_DIST_DIR=.next-verify npx next start -p 3200`으로 산출물을 분리한다(`next.config.ts`의 `distDir`). 이때 Next가 `client/tsconfig.json`에 그 폴더의 타입 경로를 자동으로 끼워 넣으므로, **커밋 전 `git checkout -- client/tsconfig.json`으로 되돌릴 것** — 검증용 폴더 이름이 저장소에 남을 이유가 없다.

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
2. **`drawCard.ts`** — 실용신양으로 예약된 추가 뽑기(`pendingExtraDraws`, `SHEEP_SAFETY_CAP`까지) 소모 → 클릭한 장소에서 1장 뽑기 → 동물별 미획득 스택이 짝수면 한 번에 정산(`settleStacks`). 정산은 경험치만 올리고 체력은 건드리지 않는다.
3. **`skills.ts`** / **`turnManager.ts`** — `skills.ts`는 레벨(`floor(exp/threshold)`) 기반 4행동 효과 계산과 경험치 소모, `turnManager.ts`는 턴/팀 교대, 축제(`festivalTurn`) 진입, `MAX_TURN` 초과·즉시 승패(체력 knockout) 판정.

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

**이름은 항상 채워져 있다** — 닉네임과 팀 이름의 무작위 생성은 `shared/names.ts`(`randomNickname`/`randomTeamName`) 한 곳에 있고 클라이언트·서버가 같이 쓴다. **팀 이름에 "미정(null)" 상태를 되살리지 말 것** — `addPlayer`는 방을 만드는 순간 양 팀 이름을 모두 확정하고(방장이 상대 팀 이름을 비워뒀으면 무작위), `setTeamName`에 빈 이름이 오면 미정으로 되돌리는 게 아니라 무작위로 다시 뽑는다. 예전엔 "그 팀에 실제로 참가하는 사람이 직접 정할 기회"를 남기려고 비워뒀지만 참가 화면에는 팀 이름 입력칸이 아예 없어서, 대기실에 "팀 2 (미정)"만 남는 버그로만 드러났다. 서버는 닉네임도 `normalizeNickname`으로 다시 정리한다(길이 컷 + 빈 이름이면 무작위) — 클라이언트 검증만 믿지 않는다. 양 팀 이름이 같아지는 경로는 `setTeamName`·`startBlockReason`·클라이언트 방 만들기 화면 세 곳에서 함께 막는다(게임에 들어가면 두 팀을 가리는 단서가 이름뿐이다).

**대기실 채팅** — `Room.chatLog`는 `CHAT_HISTORY_MAX`(50)개짜리 링 버퍼이고, 사람이 친 말(`kind: 'chat'`)과 방에서 일어난 일(`kind: 'system'`, `pushSystem`)이 한 줄기로 섞여 있다. 게임 화면에는 채팅이 없다 — `handleChat`은 `started`면 곧바로 return하고, 클라이언트도 `gameStart`에서 `chatLog`를 비운다. 과속·빈 메시지는 **에러를 보내지 않고 조용히 버린다**(실사용자는 클라이언트 쪽 억제에 먼저 걸리므로 빨간 배너는 소음일 뿐이다).

주의할 순서 두 가지 — 어기면 곧바로 눈에 보이는 버그가 된다.
1. `addPlayer`는 `sendChatHistory` → `pushSystem('… 들어왔어요')` 순서여야 한다. 뒤바뀌면 새로 들어온 사람이 자기 입장 줄을 `chatMessage`로 한 번, `chatHistory`로 또 한 번 받아 두 줄로 보인다(클라이언트의 id 비교 방어선이 있지만 그 방어선에 기대지 말 것).
2. `removePlayer(playerId, reason)`는 퇴장 안내 → 방장 승계 안내 순으로 push하고, 둘 다 `players.size === 0 → onEmpty()` 검사 **앞**에 와야 한다. `reason`은 자진 퇴장·연결 끊김(`'left'`)과 추방(`'kicked'`)의 문구를 가른다.

**`memberId` vs `playerId`** — `playerId`(UUID)는 사실상 재접속 자격증명이라(`handleReconnect`가 이 값만으로 통과시킨다) 로비 목록에 실으면 남의 세션을 가로챌 수 있다. 그래서 방장 명령의 대상 지정과 로비 목록에는 방 안에서만 통하는 짧은 공개 식별자 `memberId`(`m1`, `m2`, …)를 쓰고, `playerId`는 오직 그 소유자에게만 `roomCreated`/`roomJoined`로 보낸다. 새 로비 기능을 추가할 때도 이 구분을 유지할 것. 턴 타이머(`resetTimer`)는 대기 상태(장소 선택 vs 행동 선택)에 따라 `settings.drawTimeSec`/`actionTimeSec`을 쓰고, 실용신양 예약 뽑기 수만큼 `SHEEP_EXTRA_TIME_PER_DRAW_SEC`를 더 준다. 싱글 모드(`addSoloPlayer`)는 B팀을 CPU로 채우고 `performComputerAction`이 일정 딜레이 후 무작위(또는 즉시 승리 가능한 수 우선) 행동을 대신 수행한다. 재접속은 `sessionStorage`에 저장된 `playerId`로 `reconnect` 메시지를 보내 `gameSnapshot`을 다시 받는 방식.

`RoomManager`(`server/roomManager.ts`)는 4글자 방 코드(`O`/`I` 제외)로 `Room` 인스턴스를 생성·조회·정리하는 순수 관리 계층이고, `createConnectionHandler`(`server/gameServer.ts`)가 `ClientMessage` 타입별 분기(WS 연결 하나당 `currentRoomId`/`currentPlayerId` 클로저 유지)를 맡는다. 이 핸들러를 분리해둔 이유는 독립 실행(`server/index.ts`, 로컬 개발용 8080 포트에 자체 `WebSocketServer` 생성)과 통합 실행(루트 `server.ts`, Next.js와 같은 포트를 쓰는 배포용) 양쪽이 동일한 연결 처리 로직을 공유하기 위해서다.

### 배포 — 루트 `server.ts` / `Dockerfile`
Render처럼 서비스당 포트를 하나만 외부로 공개하는 플랫폼에서는 WS용 포트를 따로 열 수 없으므로(브라우저가 WS 서버에 직접 접속하는 구조라, 그 포트가 공개되지 않으면 접속 자체가 안 됨), 루트 `server.ts`가 Next.js 커스텀 서버 위에 같은 HTTP 서버·같은 포트(`$PORT`, 기본 3000)로 `/ws` 경로의 WebSocket을 함께 띄운다. 로컬 개발 시에는 이 파일을 쓰지 않는다 — 위의 "개발 명령어"대로 서버(8080)와 클라이언트(3000)를 분리 실행하는 방식을 그대로 쓴다. `npm run start`(루트, `ts-node --transpile-only server.ts`) 또는 `docker build -t ip-card-battle .` && `docker run -p 3000:3000 ip-card-battle`로 실행하며, 외부 도메인에 배포할 때는 `NEXT_PUBLIC_WS_URL`을 빌드 시점(`--build-arg`, Next.js `NEXT_PUBLIC_*`는 빌드 타임에 고정)에 `wss://<호스트>/ws` 형태로 넣어야 한다.

### 방장이 정하는 게임 규칙 (`GameSettings`, `shared/constants.ts`)
`targetScore`(시작 체력이자 승리 격차 — winHp = targetScore×2), `festivalTurn`(도토리 축제 시작 턴), `festivalDrawCount`/`festivalDrawIncreaseInterval`, `drawTimeSec`/`actionTimeSec`/`noActionTimeSec`. 방 생성 시 `clampSettings`로 `SETTINGS_LIMITS` 범위로 잘라내며, 게임 중에는 불변이다. 실제 승패 판정·타이머 계산은 항상 `state.settings`를 참조하고, `shared/constants.ts`의 `INITIAL_HP`/`WIN_HP`/`FESTIVAL_TURN` 등은 "기본 규칙일 때의 참고값"일 뿐이다.

**도토리 축제** — `festivalTurn`(기본 8턴)에 도달하면 그 턴부터 **매 턴 계속(한 번 터지고 끝나는 일회성 보너스가 아니다)** 다음 팀에게 실용신양과 동일한 방식의 "도토리 뽑기"가 예약된다(`pendingFestivalDraws`, `server/engine/turnManager.ts`의 `festivalDrawCountAt`). 매 턴 같은 횟수가 아니라 `festivalDrawIncreaseInterval`(k, 기본 2턴)이 지날 때마다 그 턴부터 매 턴 예약되는 횟수 자체가 `n×1 → n×2 → n×3 ...`로 한 단계씩 올라간다 — 기본 설정 그대로도 2턴마다 계속 단계가 오른다(k를 999에 가깝게 크게 잡아야 비로소 "사실상 증가 없음"이 된다). 이 규칙을 다시 바꿀 때는 "한 번만 터지는 이벤트"로 오해해 되돌리기 쉬우니 주의. 축제 진입 순간, 클라이언트는 그 방에 실제 적용되는 k·n 값을 `FestivalStartBanner`로 화면 중앙에 안내한다(`useAnimationQueue.ts`의 `festivalStartInfo`).

### 클라이언트 — 서버 이벤트를 연출 타임라인으로 번역
서버는 매 액션마다 `GameEvent[]`(draw/collect/bonusDraws/festivalDraws/skillApplied/skillPassed/festival/gameEnd/timeout* 등)와 최신 `GameState`를 함께 보낸다. `client/hooks/useAnimationQueue.ts`가 이 이벤트 배열을 받아 **연출 순서대로 재생 시각을 계산해 `setTimeout` 체인으로 스케줄링**하는 것이 클라이언트에서 가장 복잡하고 중요한 부분이다 — 실제 게임 상태(`gameState`)는 액션이 끝나는 즉시 최종값으로 도착하지만, 화면에는 "슬롯 스핀 → 카드 노출 → (짝 맞으면) 흔들기 → 팀 쪽으로 날아가기 → 팀 패널 숫자 반영 → 레벨업 판정" 순서로 지연 재생되어야 하므로, 카드 목록(`stackCards`)·경험치 표시값(`displayedExp`)·활성 팀 표시(`displayedActiveTeam`) 모두 서버 진실과 별도의 "화면상 상태"로 관리한다. 다음 액션이 이전 애니메이션 도중 도착하면 타이머를 통째로 취소하고 서버 진실 기준으로 강제 정리하는 방어 로직이 곳곳에 있으니(주석에 과거 버그 사례가 남아있다), 이 훅을 건드릴 때는 그 방어 로직의 이유를 먼저 이해할 것. 연출 레이어 컴포넌트는 `client/components/effects/`, 보드/패널 UI는 `client/components/game/`에 있다.

**개발 원칙 — 애니메이션과 실제 로직의 순서는 항상 일치해야 한다.** "카드가 팀 동물 영역으로 도착 → 경험치 반영 → 정산해서 레벨업"처럼 사용자가 기대하는 인과 순서를, 화면도 정확히 그 순서로 보여줘야 한다. `gameState.exp`(서버 진실)가 렌더에 반영되는 시점과, 그 값을 가리는 마스킹 상태(`pendingExpCredit`)가 반영되는 시점이 어긋나면 안 된다.

이 마스킹을 **`useEffect`는 물론 `useLayoutEffect`로도 완전히 고칠 수 없었다** — 처음엔 "레이아웃 이펙트로 하면 페인트 전에 동기 반영되니 괜찮다"고 생각했지만 실제로는 부족했다: `gameState`가 바뀌면 그 즉시 (마스킹이 아직 옛 값인 채로) 첫 번째 렌더가 일단 커밋까지 끝나고, 그 직후에야 레이아웃 이펙트가 두 번째(가려진) 렌더로 덮어씌운다. 화면엔 두 번째 커밋만 페인트되어 눈으로는 문제없어 보이지만, 첫 번째(부풀려진) 커밋에도 하위 컴포넌트의 `useEffect`(예: `ScorePanel`의 레벨업 감지, `prevLevelRef` 비교)가 정상적으로 예약되고, 이 패시브 이펙트는 두 번째 커밋이 이미 화면을 바로잡았다는 사실과 무관하게 자신이 렌더될 때 캡처한 "부풀려진" 값을 그대로 들고 나중에(비동기로) 실행돼버려 — 카드가 실제로 도착하기도 전에 "Lv UP!" 연출이 클릭 즉시 터지는 버그로 이어졌다(레이아웃 이펙트로 바꿔도 재발).

**진짜 해법은 이펙트 자체를 쓰지 않는 것**: React가 공식 지원하는 "렌더 도중 상태 보정" 패턴(prop 변화를 ref로 감지해 그 조건 블록 안에서 곧바로 `setState` 호출)으로, `gameState`/`lastEvents`가 바뀐 그 렌더 안에서 마스킹 상태도 함께 동기 반영해버린다(`client/hooks/useAnimationQueue.ts`의 `lastEventsForCreditRef` 블록 참고). 이러면 "부풀려진" 중간 렌더 자체가 커밋되지 않으므로, 그 어떤 하위 `useEffect`/`useLayoutEffect`도 잘못된 값을 관측할 기회가 없다. **교훈: 서버 진실과 그 진실을 가리는 마스킹이 반드시 같은 커밋에서 함께 나타나야 하는 경우, `useLayoutEffect`도 충분하지 않을 수 있다 — 렌더 도중 동기 보정을 우선 고려할 것.**

### 로비 화면 — `client/app/page.tsx` + `client/components/lobby/`

게임 화면과는 완전히 다른 원리로 돌아가므로 따로 이해해야 한다. 설계 배경과 실측값은 `LOBBY_REDESIGN.md`에 있다.

**단계 전환은 `data-stage` 속성 하나로만 한다.** `page.tsx`가 `stage`(`home`/`solo`/`multi`/`create`/`join`)를 들고 있고, `LobbyStage`는 **패널 4개와 폼 3개를 항상 마운트한 채** `.lobby-stage[data-stage=...]`만 바꾼다. 조건부 렌더링을 하지 않는 것이 핵심이다 — 전환을 전부 CSS transition이 맡으므로 **뒤로가기는 `data-stage`를 이전 값으로 되돌리기만 하면 정확한 역방향으로 재생된다**(exit 애니메이션용 타이머·`onAnimationEnd`·상태 복제가 전혀 필요 없다). 화면에 보이지 않는 영역은 `inert`로 막아 Tab 포커스와 클릭이 새지 않게 한다.

밀려나는 방향은 `justify-content` 한 줄이 정한다. 열이 줄어들 때 패널이 어느 쪽 모서리에 붙어 있느냐의 문제다 — `flex-end`면 왼쪽으로, `flex-start`면 오른쪽으로 빠져나간다. 줄어드는 열은 `overflow: hidden`이고 안의 패널은 `min-width: calc((100cqw - gap) / 2)`로 **원래 크기를 유지**하므로, 찌그러지지 않고 잘려 나가며 슬라이드처럼 보인다.

**배경 위 좌표계 — `.lobby-table`.** `background-size: cover`는 이미지가 어디에 얼마로 그려지는지 CSS가 알 수 없어 그 위에 좌표를 얹을 수 없다. 그래서 **cover와 똑같은 계산을 요소 크기로 옮겼다**(`width: max(100vw, 100vh * --table-w / --table-h)`). 이렇게 하면 `.lobby-table`의 퍼센트 좌표가 곧 이미지 좌표가 되어, 안전영역(`.lobby-safe`)이 캐릭터·카드더미·램프를 피한 자리를 화면 비율과 무관하게 항상 정확히 잡는다. 배경을 다른 구도로 교체하면 `globals.css`의 `--table-w/h`와 `--safe-*` 6개 값만 고치면 되고 컴포넌트는 손댈 필요가 없다(`client/public/lobby/README.md` 참조).

좁은 화면(≤767px)에서는 테이블이 크게 확대돼 좌우 비대칭(26.4%/29.6%)이 그 배율만큼 벌어져 안전영역을 화면 밖으로 밀어낸다 — 미디어쿼리에서 `--safe-left/right`를 `30%`로 대칭 처리하는 이유다.

**폼은 스테이지 박스를 넘으면 안 된다.** 폼(`.stage-form`)은 `position: absolute`라 박스를 밀어낼 수 없다. 그래서 폼이 열리면 로고 슬롯이 접혀 공간을 내주고, 게임 규칙은 2열 배치 + 라벨 축약으로 눌러 담았다. 폼에 항목을 추가할 때는 **반드시 스크롤바가 생기지 않는지 실제로 재볼 것** — `LOBBY_REDESIGN.md` §12에 헤드리스 Chrome 실측 방법과 기준값이 있다.

**에셋은 `client/lib/lobbyAssets.ts` 한 곳에서만 참조한다.** 배경·로고 경로가 여기 모여 있어 교체는 상수 한 줄이다. **모드 선택 패널 넷은 모두 일러스트를 깐다.** `ModePanel`에 `artSrc`를 넘기면 그림이, 안 넘기면 `globals.css`의 `.lobby-panel-{tone}`이 `--panel-a/b`로 넘기는 그라디언트만 그려진다(지금은 후자가 이미지 도착 전 한 프레임의 바탕 역할만 한다). 경로는 CSS가 아니라 `lobbyAssets.ts`에 두고 `--panel-art` 커스텀 속성으로 흘려보내, 에셋 경로가 한 곳에 모인다는 원칙을 지킨다. 아이콘 이모지는 그림과 겹쳐 중복이 되므로 아트 패널에서는 넘기지 않는다(`emoji`는 선택 prop).

**단계를 고르면 배경이 어두워진다.** `.lobby-table::after`가 검정 0.6을 덮는데, `z-index: -1`이 요령이다 — 이 의사요소가 테이블 **배경 이미지 위**, 그 안의 콘텐츠(`.lobby-safe`) **아래**에 정확히 들어간다. 음수 z-index가 부모 밖으로 새지 않는 것은 `.lobby-table`이 `transform: translate()` 때문에 이미 쌓임 맥락을 만들고 있어서다 — **그 transform을 걷어내면 이 어둠이 배경 뒤로 숨어 사라진다.** `data-stage`는 자식인 `.lobby-safe`에 붙어 있어 `:has()`로 거슬러 읽는다.

**패널에는 옛 LCD 같은 가로 주사선이 얹힌다 — 가리키고 있는 하나에만.** `.lobby-panel::after`의 `repeating-linear-gradient`이고, hover하면 0.7초에 걸쳐 서서히 켜지며 **위로** 흐르고(`lobbyScanDrift` — 이동량이 줄 간격과 같아 한 바퀴가 정확히 맞물려 이음매가 보이지 않는다. 음수로 감아야 위로 올라간다) 밝기가 흔들린다(`lobbyScanFlicker`). 넷 다 늘 깔면 동시에 지직거려 시선 둘 곳이 없어진다. `.lobby-panel-bg`가 아니라 **버튼 자신**에 거는 이유는 배경 레이어에 `blur`/`scale` filter가 걸려 있어 그 안에 그리면 줄무늬까지 함께 뭉개지기 때문이다.

**깜빡임은 `opacity`가 아니라 `filter: opacity()`로 건다.** 애니메이션은 같은 속성의 transition을 즉시 덮어쓰므로, `opacity`를 흔들면 hover하는 순간 첫 키프레임 값으로 튀어 **fade-in이 통째로 사라진다**(실제로 그렇게 만들었다가 고쳤다). `filter`로 옮기면 `opacity`를 transition 전용으로 비워둘 수 있고, 두 값이 곱해져 "서서히 켜지면서 지직거린다"가 된다.

**패널 안의 층 순서는 `z-index`로 못박혀 있다** — 위치지정 요소끼리는 tree order가 아니라 z-index가 정한다: `0` 그림(`.lobby-panel-bg`) → `2` 주사선(`::after`) → `3` 글자(`.stage-panel-label`). 글자가 주사선 위에 있어야 읽힌다.

**폼이 열린 패널은 `.stage-panel`의 흰 테두리를 그대로 지닌다** — 확장된 영역의 윤곽을 잡아줘 어디까지가 입력 화면인지 분명해진다. 한때 이 테두리를 지우고 얕은 글래스모피즘(`::before` + `backdrop-filter`)을 얹어봤지만 둘 다 되돌렸다(패널 그림이 서리유리에 덮여 무엇인지 흐려졌다). **멀티 패널만은 예외로 계속 지운다** — 그쪽은 두 버튼을 감싼 액자가 되기 때문이고, 그 규칙은 아래 "멀티 패널은 다 커진 뒤에" 절에 따로 있다.

**아트 패널(`.lobby-panel-art`)은 톤 패널과 처리가 반대다.** 그라디언트는 반투명하게 깔아 테이블이 비치게 두면 됐지만, 그림을 반투명하게 만들면 펠트 무늬와 섞여 무엇을 그린 것인지 알아볼 수 없게 된다. 그래서 불투명하게 깔되 어둡게 눌러 글자를 읽히게 하고, hover하면 흐림이 풀리며 제 색으로 밝아진다. `blur`에는 `scale(1.05)`가 반드시 딸려야 한다 — `filter: blur()`는 요소 가장자리 **바깥의 투명까지** 번지게 해서 패널 테두리에 희끄무레한 띠를 만들기 때문이고, 그래서 `prefers-reduced-motion`에서도 `transform: none`이 아니라 양쪽 상태를 같은 배율로 고정한다.

**폼 배경은 나무 액자다 — `border-image`로 9분할해 그린다.** 폼(`FormCard`)은 예전 반투명 흰 카드에서 `/ui/back_board.webp` 액자로 바뀌었다. 폼은 뷰포트마다 세로로 길쭉한 비율(대략 0.7:1)인데 그림은 정사각형이라, `background-size: 100% 100%`로 통째로 늘리면 **모서리 잎 덩어리가 가로로 눌린다** — 9분할하면 네 모서리는 배율 그대로 두고 변만 늘어난다. 슬라이스 `215`는 실측값으로 모서리 장식이 안쪽으로 뻗는 거리이고, `fill`이 있어야 가운데 양피지가 배경으로 함께 그려진다. **두께(`--board-edge`)를 키우면 위아래로 그만큼 두꺼워져 폼이 넘친다** — 1280×900에서 40px는 스크롤바를 만들었고 32px가 상한에 가깝다. 자세한 실측표와 교체 절차는 `client/public/ui/README.md`에 있다.

**게임 규칙을 펼치면 폼이 아래가 아니라 오른쪽으로 자란다.** 이 로비에서 늘 모자란 것은 세로였다 — 액자 두께 상한(32px), 라벨 축약, 2열 배치가 전부 거기서 나온 타협이다. 반면 가로는 1280에서 380px, 1920에서 527px이 놀고 있어서, 규칙을 펼치면 카드가 넓어지며 **왼쪽 열(입력·버튼) / 오른쪽 열(규칙)** 2열로 바뀌고 백보드도 가로형으로 넘어간다(방 만들기+규칙 기준 552 → 409px). 상태는 `GameRulesFields`가 `data-rules-open` 속성으로 알리고 CSS가 `:has()`로 읽으므로, 폼 3종에 prop이 늘지 않는다. **좁은 화면(≤767px)에서는 하지 않는다** — 안전영역이 371px인데 카드가 이미 358px이라 옆으로 펼 자리가 13px뿐이다.

**문구 위치는 그림이 정한다.** 방 만들기·방 참가하기는 주인공(양·셋)이 그림 **아래쪽**에 있어 라벨을 가운데에 두면 정확히 그들을 가린다 — `.lobby-panel-create/join .stage-panel-label`에서 `justify-content: flex-start`로 위(초가지붕)로 올리고, 어둠 띠도 같이 위로 옮긴다. 혼자·다같이 놀기는 인물이 고루 퍼져 있어 가운데가 맞다. 그림을 갈아끼울 때 이 대응을 함께 확인할 것.

**바깥으로 뻗는 그림자는 패널이 아니라 열에 건다.** `.stage-col`은 슬라이드 아웃을 위해 `overflow: hidden`이고 패널은 열을 정확히 채우므로, **패널에 건 바깥 box-shadow는 한 번도 그려지지 않는다**(예전 코드에 죽은 선언이 남아 있었고, hover 강조를 안쪽 링으로 그리던 것도 이 때문이다). 반면 열 **자신의** box-shadow는 자기 overflow에 잘리지 않으므로, `.stage-col:has(> .stage-panel…:hover)`에 걸면 버튼 테두리에서 빛이 퍼지는 그림이 정확히 나온다(`:has(> …)`로 직계 자식만 보는 이유는 멀티 열 안에 방 만들기/참가하기 열이 중첩돼 있어서다). 다만 그 중첩된 두 열은 자르개가 두 겹(`.stage-col-multi`의 overflow + `.multi-inner`의 clip-path)이라 그냥 두면 글로우가 열 사이 간격 쪽으로만 새어 나온다 — 멀티 단계에 한해 두 겹을 `--glow-reach`만큼 연다(`overflow-clip-margin`, 음수 `inset()`). **바깥 멀티 열은 hover 중일 때만 열어야 한다** — 늘 열어두면 싱글을 골라 그 열이 폭 0으로 줄 때 패널 조각이 화면 오른쪽에 띠처럼 남는다. 같은 빛을 뒤로가기 버튼(`.lobby-back`)의 원형 배지에도 걸었는데, 값은 일부러 다르다(12px/0.65) — 지름 36px 배지에 패널과 같은 14px/0.45를 쓰면 번짐이 배지보다 커져 형체 없는 얼룩이 된다. 글로우 폭 변수 `--glow-reach`는 `.lobby-safe`에 있다(뒤로가기 버튼이 `.lobby-stage`의 형제라 스테이지에 두면 닿지 않는다).

**멀티 패널은 "다 커진 뒤에" 녹아 없어진다.** `.stage-panel-multi`는 조건부 렌더링을 하지 않는 구조상 create/join 단계에서도 계속 마운트돼 있는데, 그대로 두면 테두리·그림자가 바깥 윤곽을 그리고 두 열 사이 간격으로 멀티 그림이 비쳐 **두 버튼을 감싼 액자**처럼 보인다. 그래서 `box-shadow: none` + `border-color: transparent` + 배경 `opacity: 0`으로 지우는데(`border: none`이 아닌 이유는 1px이 사라지면 안쪽 배치가 그만큼 밀리고 투명도를 따라 옅어지지도 못하기 때문), **누르는 즉시가 아니라 확장이 끝난 뒤**여야 한다 — 즉시 지우면 확장이 시작되기도 전에 방금 누른 패널이 증발하고 넓어지는 빈 공간만 남는다. `transition-delay: var(--t-expand)` + `var(--t-reveal)` 길이로 바로 아래 `.multi-inner`의 clip-path·opacity와 지연·속도를 **일부러 똑같이** 맞춰, 사라지는 양과 두 버튼이 나타나는 양의 합이 매 순간 1이 되는 크로스페이드가 된다(한쪽 값만 바꾸면 교대가 어긋나 한 프레임씩 겹치거나 빈다). 되돌아올 때는 이 규칙이 통째로 떨어져 나가 지연 없이 기본 transition이 맡으므로, 패널이 먼저 제 모습으로 돌아온 뒤 열이 줄어드는 정확한 역재생이 된다 — 이때 테두리가 뚝 끊기지 않도록 `.lobby-panel`의 기본 transition에 `border-color`가 들어가 있다. `public/`에 이미지를 추가하면 `client/scripts/generateAssetManifest.mjs`의 `IMAGE_DIRS`에 그 폴더가 있어야 `LoadingScreen`이 프리로드한다 — 빠뜨리면 로딩 화면이 끝난 뒤에야 받아와 배경이 늦게 뜬다.

**경고·안내는 새 줄로 덧붙이지 말고 있는 줄을 갈아끼운다.** 폼이 `position: absolute`라 한 줄만 늘어도 좁은 화면에서 스크롤바가 생긴다 — 실제로 방 만들기의 팀 이름 충돌 경고를 별도 `<p>`로 덧붙였더니 390×844에서 카드가 517→545px가 되며 폼이 스크롤했다. 그래서 `FormCard`의 `description`을 `ReactNode`로 받아 **평소 설명 줄을 경고로 교체**하고(높이 증가 0), 어느 칸이 문제인지는 `TeamNameField`의 `invalid`가 붉은 링으로 가리킨다. 이때 링은 반드시 `ring`이어야 한다 — `border-width`를 키우면 입력창이 2px 높아져 같은 문제가 그대로 재현된다. 새 안내를 넣을 자리가 정 없다면 먼저 `client/scripts/measureLobby.mjs`로 재보고 판단할 것(이 스크립트는 충돌 경고·초대 링크 상태까지 함께 잰다).

**게임 규칙 입력은 레이아웃이 둘인데 필드 목록은 하나다.** `GameRulesFields`(로비 폼)는 안전영역에 갇혀 2열로 눌러 담고, `GameRulesInputs`(대기실에서 방장이 규칙 수정)는 폭이 넉넉해 한 항목씩 세로로 둔다. 두 배치가 같은 `RULE_FIELDS`를 쓰되 `label`(축약)과 `title`(전체)을 나눠 갖는다 — 항목을 추가할 때 한 곳만 고치면 다른 배치가 조용히 빠진다.

**대기실만 안전영역 밖으로 나간다.** 안전영역은 *배경 위에 얹히는 반투명 UI*가 캐릭터·카드더미를 가리지 않게 하려는 장치인데, 대기실은 불투명한 흰 카드 하나라 그 제약이 무의미하고 오히려 참가자 목록·채팅·방장 조작·규칙까지 들어가 로비 폼보다 훨씬 길다. 그래서 `.lobby-safe[data-stage="waiting"]`에서만 좌우/상하 제약을 풀고 화면을 세로로 꽉 쓴다(가로는 카드 자신의 `max-w-4xl`에 맞춘다). 로고 슬롯은 폼이 열릴 때와 같은 방식으로 함께 접힌다. 이 단계 값을 되돌리면 대기실 윗부분만 보이고 시작 버튼이 스크롤 밖으로 밀려난다.

### 테스트 작성 시 참고
`server/__tests__/effects.test.ts`는 결정론적 RNG(`rng0`=항상 0번째 선택, `rngLast`=항상 마지막 선택)로 `initGame`부터 각 엔진 함수를 직접 호출하는 패턴을 쓴다. `simulation.test.ts`는 봇 대전을 다회 시뮬레이션해 게임이 항상 유한 턴 내에 끝나는지 등 불변조건을 검증한다.
