# 다른 PC에서 이어서 작업하기 — 2026-09-04 기준

**개발 환경을 옮긴 뒤 이 저장소에서 처음 여는 파일입니다.** 환경 구성 → 지금 상태 →
다음에 할 일 순서로 되어 있습니다. 작업은 Opus 모델이 이어받는 것을 전제로, "왜 그렇게
되어 있는지"까지 적었습니다 — 이 프로젝트에는 **모르고 건드리면 조용히 깨지는 곳**이
여럿 있어서, 배경을 모르면 고친 것이 되돌려지기 쉽습니다.

## 읽는 순서

| 순서 | 파일 | 무엇이 있나 |
| --- | --- | --- |
| 1 | **이 파일** | 환경 구성, 현재 상태, 다음 할 일 |
| 2 | [`CLAUDE.md`](CLAUDE.md) | 아키텍처와 **반드시 지켜야 할 규칙**. 코드 건드리기 전 필독 |
| 3 | [`HANDOVER.md`](HANDOVER.md) | 로비 개편 작업 이력과 그 과정에서 밟은 지뢰들 |
| 4 | [`README.md`](README.md) | 게임 규칙의 최신 기준 |
| 5 | [`LOBBY_REDESIGN.md`](LOBBY_REDESIGN.md) | 로비 설계안 v1/v2·실측값·시행착오 |
| — | `오늘의_명령어_*.txt` | 날짜별로 무엇을 왜 요청했고 무엇이 바뀌었는지 |

> `ROADMAP.md`는 초기 설계 문서로 실제 코드와 많이 다릅니다. 참고만 하세요.

> ✅ **upstream 재조정은 끝났습니다(2026-09-04).** upstream 7개 커밋을 병합해
> **`main`에 올리고 `origin`에 push까지 마쳤습니다** — 지금 `origin/main`을 clone하면
> 병합된 상태가 그대로 옵니다. upstream 미반영 커밋은 0건입니다. 남은 것은
> "upstream에 PR로 보낼지"와 대기실 테마뿐입니다 — §5-0 참조.

---

## 1. 새 PC 환경 구성

### 1-1. 필요한 것

| 항목 | 이 PC에서 쓰던 버전 | 비고 |
| --- | --- | --- |
| Node.js | **v24.19.0** | Next 16 + Turbopack. v20 미만은 피할 것 |
| npm | 11.17.0 | 워크스페이스를 쓰므로 npm 7+ 필수 |
| Git | — | 저장소: `https://github.com/Aringco/ip_card_battle_render.git` |
| Chrome | 최신 | 로비 실측 스크립트(`measureLobby.mjs`)가 실제 Chrome을 띄웁니다 |

### 1-2. 내려받고 설치

```bash
git clone https://github.com/Aringco/ip_card_battle_render.git
cd ip_card_battle_render
npm install          # 반드시 루트에서 — npm workspaces 구조라 하위에서 하면 어긋납니다
```

`npm install` 한 번이면 `client`/`server`/`shared` 세 워크스페이스가 모두 준비됩니다.
`shared`는 심링크로 연결되므로 따로 빌드하지 않습니다.

### 1-3. 실행 — 터미널 2개

```bash
# 터미널 1 — WebSocket 서버 (8080)
cd server && npm run dev

# 터미널 2 — Next.js (3000)
cd client && npm run dev
```

브라우저에서 `http://localhost:3000`. **두 개를 다 띄워야 플레이가 됩니다.**
클라이언트가 바라보는 WS 주소는 `NEXT_PUBLIC_WS_URL`(기본 `ws://localhost:8080`)로 바꿉니다.

### 1-4. 설치 직후 확인 (5분)

이 네 가지가 통과하면 환경이 제대로 잡힌 것입니다.

```bash
cd server && npm test          # 52건 통과해야 함
cd server && npm run build     # 통과해야 함 (2026-09-03에 고친 항목 — 아래 §3-3)
cd client && npx next build    # 통과해야 함
npx tsc --noEmit -p tsconfig.json   # 루트에서. 배포용 server.ts 타입 검사
```

### 1-5. 로비 실측 도구 (로비 CSS를 건드릴 거라면)

`client/scripts/measureLobby.mjs`는 헤드리스 Chrome으로 3뷰포트 × 6단계의 박스를 재고
스크린샷을 남깁니다(6단계 = home·싱글+규칙·멀티·방만들기+규칙·**방만들기+팀이름충돌**·**초대링크 참가**). Chrome 경로가 다르면 `CHROME_PATH` 환경변수로 지정하세요
(기본값이 Windows 경로로 하드코딩돼 있습니다 — **macOS/Linux로 옮긴다면 여기를 고쳐야 합니다**).

```bash
# 터미널 1 — WS 서버 (없으면 측정이 무의미합니다. §4-2 참조)
cd server && npm run dev
# 터미널 2 — 프로덕션 빌드로 (dev 서버로 재면 낡은 CSS가 나옵니다)
cd client && npx next build && npx next start -p 3200
# 터미널 3
cd client && node scripts/measureLobby.mjs
```

`puppeteer-core`는 루트 devDependency라 `npm install`로 함께 들어옵니다(2026-09-04부터).

---

## 2. 지금 어디까지 되어 있나

### 2-1. 게임 자체

**플레이 가능한 완성 상태**입니다. 규칙 엔진·서버·클라이언트 연출이 모두 동작하고,
봇 시뮬레이션으로 밸런스까지 검증되어 있습니다(`server/__tests__/simulation.test.ts`,
`SKILL_BALANCE_REPORT.md`). 최근 작업은 전부 **로비 화면(첫 진입 화면)** 에 집중돼 있었고,
게임 플레이 로직은 이번 세션에서 건드리지 않았습니다.

### 2-2. 로비 — 이번 세션(2026-09-03)에 끝낸 것

로비 버튼 4종을 "임시 placeholder"에서 "확정 일러스트 + 흰 테두리 + hover 글로우"까지
끌어올렸습니다.

```
home ──다같이──▶ multi ──방 만들기──▶ create ──▶ waiting ──▶ /room/[id]
 │                 │                            ▲
 │                 └──방 참가하기──▶ join ───────┘
 └───혼자────▶ solo ────────────────────────────▶ /room/[id]
```

| 항목 | 상태 |
| --- | --- |
| 임시 에셋(`public/tmp/`) | **전부 제거 완료.** 폴더 자체가 없어졌습니다 |
| 패널 아트 4종 | 확정 일러스트 투입 완료 (`public/lobby/panel_*.webp`, 각 75~96KB) |
| 버튼 문구 | 혼자 놀기 / 다같이 놀기 / 방 만들기 / 방 참가하기 |
| 아이콘 이모지 | 그림과 중복이라 4개 모두 제거 (`ModePanel`의 `emoji`는 선택 prop으로 남아 있음) |
| 흰 테두리 | `2px rgba(255,255,255,0.7)` — 네 버튼 공통 |
| hover 글로우 | 네 버튼 + 뒤로가기 버튼. 사방으로 번집니다 |
| 멀티 확장 연출 | 확장이 끝난 뒤 멀티 패널이 녹아 사라지는 크로스페이드 |
| server `npm run build` | 실패하던 것을 고쳤습니다 (§3-3) |

### 2-3. 로비 — 2026-09-04에 얹은 것 (upstream 병합분)

upstream의 로비 기능을 이 구조 위에 이식했습니다. 자세한 경위는 [`HANDOVER.md`](HANDOVER.md) §7.

| 항목 | 내용 |
| --- | --- |
| 무작위 닉네임·팀 이름 | 세 폼 모두 주사위 버튼. 닉네임을 비우면 placeholder의 이름이 그대로 쓰입니다 |
| 초대 링크 | `/?room=ABCD`로 들어오면 참가 폼이 열리고 코드가 채워집니다 |
| 팀 이름 충돌 경고 | **설명 줄을 갈아끼우는 방식** — 새 줄로 덧붙이면 390×844에서 스크롤이 생깁니다 |
| 방 알림(`roomNotice`) | 추방·방장 위임 등을 로고 아래 배너로. 직접 닫을 수 있습니다 |
| 방 이탈 복귀 | 방에서 나오면 stage가 home으로 되돌아갑니다 |
| 대기실 | upstream 판(채팅·팀 이동·추방·위임·규칙 수정·초대 링크)을 채택 |
| 대기실 화면 폭 | `data-stage="waiting"`에서만 안전영역 제약을 풀어 세로로 꽉 씁니다 |

### 2-4. 검증한 것 (마지막 커밋 시점)

| 항목 | 결과 |
| --- | --- |
| `server` npm test | 52/52 통과 |
| `server` npm run build | 통과 |
| `client` next build | 통과 (타입 검사 포함) |
| 루트 `tsc --noEmit` | 통과 |
| 로비 실측 3뷰포트 × 6단계 | 폼 스크롤·페이지 스크롤·화면 이탈 **모두 없음**, 콘솔 에러 없음 |
| 대기실 스모크(방 만들기→초대 링크 참가→채팅) | 방장/참가자 양쪽 정상, 콘솔 에러 없음 |

로비 실측 기준값 — **폼에 항목을 추가했다면 이 값과 대조하세요.**
`방 만들기+충돌`이 `방 만들기+규칙`과 **같아야** 합니다(경고가 높이를 늘리지 않는다는 뜻).

| 뷰포트 | 안전영역 | 싱글+규칙 | 방 만들기+규칙 | 방 만들기+충돌 | 참가+초대 |
| --- | --- | --- | --- | --- | --- |
| 1280×900 | 738×628 | 712×295 | 712×409 | 712×409 | 358×383 |
| 1920×1080 | 885×754 | 717×295 | 717×409 | 717×409 | 358×383 |
| 390×844 | 371×589 | 358×477 | 358×525 | 358×525 | 358×359 |

> 규칙을 펼친 폼이 가로로 넓어지면서(아래 §3-5) 데스크톱 카드 폭이 358 → 712px가 됐다.
> 좁은 화면은 예전처럼 세로로 쌓인다. 백보드 도입 전 기준값은 git 이력에 있다.

---

## 3. 이번 세션에서 만든 구조 — 건드리기 전에 알아야 할 것

로비 CSS는 얼핏 평범해 보이지만, **각 줄이 특정 실패를 막으려고 그 자리에 있습니다.**
아래 여섯 가지는 모르고 "정리"하면 반드시 재발합니다.

### 3-1. 바깥으로 뻗는 그림자는 패널이 아니라 **열**에 건다

`.stage-col`은 슬라이드 아웃을 위해 `overflow: hidden`이고, 패널은 그 열을 정확히 채웁니다.
그래서 **패널에 건 바깥 `box-shadow`는 한 번도 그려지지 않습니다.** 실제로
`.stage-panel`에 `box-shadow: 0 6px 18px …`가 오래 남아 있었지만 죽은 선언이었고
(이번에 삭제), hover 강조를 안쪽 `inset` 링으로 그리던 것도 같은 이유였습니다.

해법은 **열 자신**에 거는 것입니다. 열의 box-shadow는 자기 overflow에 잘리지 않고,
열과 패널은 크기가 같으므로 결과는 "버튼에서 빛이 퍼진다"와 똑같습니다.

```css
.stage-col:has(> .stage-panel.lobby-panel-active:hover) {
  box-shadow: 0 0 var(--glow-reach) 4px rgba(255, 255, 255, 0.45);
}
```

`:has(> …)`로 **직계 자식만** 보는 이유 — 멀티 열 안에 방 만들기/참가하기 열이 중첩돼
있어서, 안쪽 버튼에 hover할 때 바깥 멀티 열까지 같이 빛나면 안 됩니다.

그 중첩된 두 열은 자르개가 두 겹(`.stage-col-multi`의 overflow + `.multi-inner`의
clip-path)이라, 멀티 단계에 한해 `--glow-reach`(14px)만큼 열어둡니다
(`overflow-clip-margin`, 음수 `inset()`).

> ⚠️ **바깥 멀티 열은 hover 중일 때만 열어야 합니다.** 늘 열어두면 싱글을 골라 그 열이
> 폭 0으로 줄 때, 잘려야 할 패널 조각이 화면 오른쪽에 14px 띠로 남습니다.

`--glow-reach`는 `.lobby-safe`에 있습니다 — 뒤로가기 버튼이 `.lobby-stage`의 **형제**라
스테이지에 두면 변수가 닿지 않습니다.

### 3-2. 멀티 패널은 "다 커진 뒤에" 사라진다

`.stage-panel-multi`는 조건부 렌더링을 하지 않는 구조상 create/join 단계에서도 계속
마운트돼 있습니다. 그대로 두면 두 버튼을 감싼 **액자**처럼 보입니다.

지우는 값은 `box-shadow: none` + `border-color: transparent` + 배경 `opacity: 0`인데,
**누르는 즉시가 아니라 확장이 끝난 뒤**여야 합니다. 즉시 지우면 확장이 시작되기도 전에
방금 누른 패널이 증발해 넓어지는 빈 공간만 남습니다.

```css
transition:
  box-shadow   var(--t-reveal) ease var(--t-expand),
  border-color var(--t-reveal) ease var(--t-expand);
```

지연 `--t-expand`(300ms)와 길이 `--t-reveal`(250ms)은 바로 아래 `.multi-inner`의
clip-path·opacity와 **일부러 같은 값**입니다. 한쪽만 바꾸면 교대가 어긋나 한 프레임씩
겹치거나 빕니다. 실측하면 사라지는 양과 나타나는 양의 합이 매 시점 1.00입니다.

`border: none`이 아니라 `border-color: transparent`인 이유 — 1px이 사라지면 안쪽 배치가
그만큼 밀리고, 투명도를 따라 서서히 옅어지지도 못합니다.

### 3-3. `server/tsconfig.json`의 `types` 목록을 지우지 말 것

이 서버는 Node 전용이라 `lib`에 DOM이 없는데, `types`를 비워두면 TypeScript가
`node_modules/@types/*`를 **전부** 자동으로 끌어옵니다. 워크스페이스 루트에 클라이언트용
`@types/react-dom`이 함께 설치돼 있어서, 그 순간 `npm run build`가 DOM 전역
(`ReferrerPolicy`·`RequestDestination`)을 못 찾고 실패합니다.

> ⚠️ **이 증상은 `npm run build`에서만 드러납니다.** `npm run dev`(ts-node)와
> `npm test`(ts-jest)는 그 수준의 타입 검사를 하지 않아 멀쩡히 돌아갑니다.
> 서버 코드를 한 줄도 안 건드렸는데 갑자기 터지므로 원인을 찾기 어렵습니다.

서버가 새 **전역** 타입 패키지를 쓰게 되면 그 목록에 이름을 더하세요.
`ws`처럼 import 경로로 해석되는 모듈 타입은 목록과 무관합니다.

### 3-4. 아트 패널은 톤 패널과 처리가 반대다

그라디언트는 반투명하게 깔아 테이블이 비치게 두면 됐지만, **그림을 반투명하게 만들면**
펠트 무늬와 섞여 무엇을 그린 것인지 알아볼 수 없습니다. 그래서 불투명하게 깔되 어둡게
눌러 두고(`brightness(0.5) blur(2px)`), hover하면 흐림이 풀리며 제 색으로 밝아집니다.

> ⚠️ `blur`에는 `scale(1.05)`가 **반드시** 딸려야 합니다. `filter: blur()`는 요소 가장자리
> **바깥의 투명까지** 번지게 해서 패널 테두리에 희끄무레한 띠를 만듭니다.
> `prefers-reduced-motion`에서도 `transform: none`이 아니라 **양쪽 상태를 같은 배율로
> 고정**해야 합니다(none으로 되돌리면 띠가 다시 생깁니다).

### 3-5. 폼 백보드는 `border-image`로 9분할한다

폼 배경이 반투명 흰 카드에서 나무 액자(`/ui/back_board.webp`)로 바뀌었다.
폼은 세로로 길쭉한 비율(약 0.7:1)인데 그림은 정사각형이라, 통째로 늘리면 모서리 잎
덩어리가 가로로 눌린다. `border-image ... 215 fill stretch`로 9분할해 모서리는 배율을
지키고 변만 늘린다.

> ⚠️ **두께(`--board-edge`)를 키우면 폼이 넘친다.** 1280×900에서 40px는 카드가
> 552 → 568px가 되며 스크롤바를 만들었다. 32px(모바일 20px)가 실측 상한에 가깝다.
> 바꿨다면 `measureLobby.mjs`로 반드시 다시 잴 것.

**게임 규칙을 펼치면 폼이 아래가 아니라 오른쪽으로 자란다.** 이 로비에서 늘 모자란 것은
세로였고(위 두께 상한도 거기서 나왔다), 가로는 1280에서 380px·1920에서 527px이 놀고
있었다. 규칙을 펼치면 카드가 넓어지며 **왼쪽 열(입력·버튼) / 오른쪽 열(규칙)** 2열이 되고
백보드가 가로형(`back_board_wide.webp`)으로 넘어간다 — 방 만들기+규칙 기준 552 → 409px.

- 상태는 `GameRulesFields`가 `data-rules-open` 속성으로 알리고 CSS가 `:has()`로 읽는다.
  폼 3종에 prop을 늘리지 않기 위해서다
- `FormCard`는 `children`(입력) / `side`(규칙) / `footer`(제출 버튼) 세 슬롯을 받는다.
  접혀 있을 때 순서가 입력 → 규칙 → 버튼이어야 해서 버튼을 분리했다
- 액자는 카드가 아니라 `::before`(세로형)·`::after`(가로형) 두 겹에 그린다 —
  `border-image-source`는 보간되지 않아 카드에 직접 걸면 그림만 툭 바뀐다
- **좁은 화면(≤767px)에서는 하지 않는다.** 안전영역이 371px인데 카드가 이미 358px이라
  옆으로 펼 자리가 13px뿐이다

에셋 교체·슬라이스 재측정 절차는 `client/public/ui/README.md`에 있다.

### 3-6. 문구 위치는 그림이 정한다

방 만들기·방 참가하기는 주인공(양 / 셋)이 그림 **아래쪽**에 있어, 라벨을 가운데에 두면
정확히 그들을 가립니다. 그래서 이 둘만 `justify-content: flex-start`로 위(초가지붕)로
올리고, 어둠 띠도 함께 위로 옮겼습니다. 혼자·다같이 놀기는 인물이 고루 퍼져 있어
가운데가 맞습니다.

**그림을 갈아끼울 때 이 대응이 여전히 맞는지 함께 확인하세요.**

글자 뒤 어둠이 타원이 아니라 **가로 띠**인 것도 이유가 있습니다 — 가운데를 원형으로
파내면 띠 밖으로 삐져나온 부제 끝이 시끄러운 그림 위에 그대로 얹힙니다.

---

## 4. 이 프로젝트에서 반복해서 밟은 지뢰

### 4-1. Turbopack이 낡은 CSS 청크를 내준다 (가장 자주 발생)

**CSS를 고쳤는데 화면이 그대로라면 가장 먼저 이것을 의심하세요.** 이번 세션에서만 두 번
발생했고, 이전 세션에서도 두 번 있었습니다. TSX 변경은 HMR로 반영되는데 CSS만 옛 청크가
남는 형태라 "일부는 반영, 일부는 안 됨"으로 보여 더 헷갈립니다.

브라우저 캐시가 **아니라** dev 서버 쪽이므로 새 브라우저·시크릿 모드로 접속해도 똑같습니다.

> ⚠️ **그냥 재시작해서는 안 고쳐집니다.** 낡은 청크는 `.next/dev/`에 있는데 dev 서버를
> 껐다 켜는 것만으로는 이 폴더가 지워지지 않습니다. 실제로 이 프로젝트에서 "재시작했는데
> 그대로"인 상황이 세 번 반복됐고, 매번 원인이 이것이었습니다.
> `next build`는 `.next/static/`에 따로 쓰므로 프로덕션 빌드가 통과해도 dev는 낡은 채입니다.

```bash
# client 터미널에서 Ctrl+C 후
npm run dev:clean      # .next를 지우고 dev 서버를 띄운다
```

확인하는 법 — 어느 커밋 시점 CSS인지 표지 마커로 특정할 수 있습니다.

```bash
CSS=$(curl -s http://localhost:3000/ | grep -o '/_next/static/[^"]*\.css' | head -1)
curl -s "http://localhost:3000$CSS" | grep -c '찾는-셀렉터'
# 0이면 낡은 청크. .next/static/(프로덕션)과 .next/dev/(개발)을 대조해도 바로 드러난다
```



### 4-2. `measureLobby.mjs`는 WS 서버가 떠 있어야 의미가 있다

없으면 `page.tsx`가 연결 실패를 `blocked`로 보고 패널을 `disabled`로 만들어, 스크립트가
패널을 눌러도 폼이 열리지 않습니다. 표의 "카드"·"폼스크롤"이 전부 `-`인데 "문제 없음"으로
나오면 **아무것도 재지 못한 것**입니다.

### 4-3. 실측은 반드시 프로덕션 빌드로

dev 서버로 재면 4-1 때문에 값이 코드와 안 맞습니다.
`npx next build && npx next start -p 3200`으로 따로 띄우세요.
(Next 16은 같은 디렉터리에서 두 번째 `dev` 서버를 포트와 무관하게 거부합니다.)

### 4-4. `next start`가 백그라운드에서 안 죽는 경우

포트가 `EADDRINUSE`로 남습니다. 리스닝 PID를 찾아 직접 종료하세요.

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3200 |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### 4-5. 첨부 이미지는 디스크에 저장되지 않는다

대화에 붙인 이미지는 세션 트랜스크립트
(`~/.claude/projects/<프로젝트>/<세션>.jsonl`)에 base64로 들어 있습니다. JSON을 훑어
`type:"image"`의 `source.data`를 꺼내 디코드하면 파일로 복원할 수 있습니다.
변환은 루트 `node_modules`에 있는 `sharp`를 그대로 쓰면 됩니다.

```js
sharp(src).resize(768, 768, { fit: 'cover' }).webp({ quality: 82 }).toFile(dst)
```

### 4-6. dev 서버가 떠 있는 상태의 `npm install`

`node_modules/next`가 교체되면 실행 중인 서버가 깨집니다(모든 요청 500). 재시작하세요.

---

## 5. 앞으로 할 일

### 5-0. upstream 재조정 — 병합 완료, 올릴 곳만 정하면 된다

**2026-09-04에 upstream/main 7개 커밋을 병합했다.** `merge/upstream-2026-09-04` 브랜치에서
작업한 뒤 `main`으로 fast-forward하고 `origin`에 push했다(`ede6b49..8b7d1b6`).
**`origin/main`이 곧 병합된 상태**이고, upstream 미반영 커밋은 0건이다.

> 병합 작업 브랜치 `merge/upstream-2026-09-04`는 main과 같은 커밋을 가리키는 로컬
> 브랜치일 뿐이다. push하지 않았으므로 다른 PC에서 clone하면 존재하지 않는다 —
> 없다고 당황하지 말 것.

```
origin    https://github.com/Aringco/ip_card_battle_render.git   (내 fork, push 가능)
upstream  https://github.com/HanJaeseok/ip_card_battle_render.git (권한 READ, push URL DISABLED)
```

`origin`은 `upstream`의 정식 GitHub fork이고 공통 조상은 `d92c238`이다.
**upstream에는 직접 push할 수 없다** — 권한이 READ뿐이다. 반영하려면 **Pull Request**가
유일한 경로다(새 PC에서 clone하면 `upstream` remote는 따라오지 않는다. §7 참조).

#### 무엇을 어떻게 합쳤나

두 갈래는 손댄 영역이 거의 겹치지 않았다 — 내 쪽은 로비 화면, upstream은 게임 로직과
대기실이었다. 그래서 서버 엔진·`shared`·게임 화면·`globals.css`의 게임 연출 부분은 전부
자동 병합됐고, **충돌은 로비 파일 3건뿐**이었다.

| 파일 | 해결 방법 |
| --- | --- |
| `WaitingRoom.tsx` | **upstream 510줄을 통째로 채택.** 내 109줄은 옛 대기실을 파일로 쪼갠 것뿐이라 기능 상위집합인 쪽을 택했다 |
| `GameRulesFields.tsx` | **공존.** 내 2열 압축 배치(`GameRulesFields`)는 로비 폼용으로 남기고, upstream의 `GameRulesInputs`·`RuleSummary`를 대기실용으로 함께 둔다. 필드 목록은 하나로 합쳐 `label`(축약)/`title`(전체)만 나눠 갖는다 |
| `page.tsx` | **셸은 내 것, 기능은 upstream 이식.** `data-stage` 구조를 유지한 채 무작위 닉네임·초대 링크·`roomNotice`·팀 동기화·`sendReady(ready)`·대기실 14개 prop 배선을 옮겼다 |

이식하면서 로비 폼 쪽에 새로 생긴 규칙이 둘 있다. **되돌리면 조용히 깨진다:**

- **경고는 새 줄이 아니라 설명 줄을 갈아끼운다.** 팀 이름 충돌 경고를 별도 `<p>`로 붙였더니
  390×844에서 카드가 517→545px가 되며 폼이 스크롤했다. `FormCard`의 `description`을
  `ReactNode`로 받아 교체하는 방식으로 바꿔 높이 증가를 0으로 만들었다. 붉은 표시는
  `TeamNameField`의 `invalid`가 **`ring`으로** 그린다 — `border-width`를 키우면 입력창이
  2px 높아져 같은 문제가 재현된다.
- **대기실만 안전영역 밖으로 나간다.** upstream 대기실은 채팅·방장 조작이 붙어 훨씬 길어서
  좁은 안전영역에 가두면 시작 버튼이 스크롤 밖으로 밀린다. `.lobby-safe[data-stage="waiting"]`
  에서만 제약을 풀었다(대기실은 불투명 카드라 배경 캐릭터를 가릴 걱정이 없다).

`measureLobby.mjs`에 이 두 상태(충돌 경고·초대 링크)를 재는 단계를 추가했다. 기준값은 §2-4.

#### 남은 판단

1. ~~병합분을 main에 올릴지~~ → **완료.** `origin/main`에 반영했다(검증은 §2-4).
2. **내 로비 개편을 upstream에 PR로 보낼지** — 보낸다면 지금의 `origin/main`이 그대로
   PR 기반이 된다(upstream 커밋을 이미 다 품고 있어 PR에 충돌이 없다).
3. **대기실 카드테이블 테마 입히기** — upstream 대기실은 초록 계열 옛 스타일 그대로다.
   지금은 안전영역만 풀어 "쓸 수 있게" 해둔 상태이고, 로비와 같은 문법으로 다시 그리는
   작업은 §5-1에 남아 있다.

갈라짐을 다시 확인하는 법:

```bash
git fetch upstream
git log --oneline upstream/main..HEAD    # 내게만 있는 커밋
git log --oneline HEAD..upstream/main    # upstream에만 있는 커밋
git merge-tree --write-tree upstream/main HEAD | grep '^CONFLICT'
```

> 참고 — `HANDOVER.md`에 "옛 저장소와 공통 git 이력이 전혀 없다"고 적힌 것은
> **다른 저장소**(`Aringco/ip_card_battle`) 이야기다. 지금 이 `_render` 저장소는
> upstream과 공통 조상이 있는 정상적인 fork이므로 혼동하지 말 것.

### 5-1. 바로 손댈 수 있는 것

| 우선도 | 항목 | 내용 |
| --- | --- | --- |
| 중 | **방 참가하기 부제 대비** | hover 시 부제가 밝은 초가지붕 위에 얹혀 다른 셋보다 대비가 약합니다. 스크림 띠 농도(`0.78`)를 올리거나 그 패널만 `background-position`을 조정하면 됩니다 |
| 중 | **로고 용량** | `public/lobby/logo.png`가 **433KB**입니다. 네 패널 아트를 합친 것(약 330KB)보다 큽니다. WebP로 줄이면 첫 진입이 눈에 띄게 빨라집니다 (`table_bg`를 12.9MB → 374KB로 줄인 것과 같은 방법) |
| 상 | **대기실(WaitingRoom) 테마** | 병합으로 기능은 다 갖췄지만(채팅·방장 조작·초대 링크) **스타일은 초록 계열 옛 화면 그대로**입니다. 지금은 `data-stage="waiting"`에서 안전영역 제약만 풀어 "화면을 다 쓰게" 해둔 상태입니다. 카드테이블 배경 위 문법(반투명 카드·jungle 팔레트·흰 테두리)에 맞춰 다시 그리는 작업이 남았습니다 |
| 하 | **`measureLobby.mjs`의 Chrome 경로** | Windows 경로가 하드코딩돼 있습니다. 다른 OS로 옮긴다면 플랫폼별 기본값 처리 필요 |
| 하 | **`lobby-shots/` 정리** | `.gitignore`에 있어 커밋되진 않지만, 실측할 때마다 쌓입니다 |

### 5-2. 판단이 필요한 것

- **옛 저장소 정리** — `Aringco/ip_card_battle`(GitHub fork)은 이제 쓰지 않습니다.
  삭제할지 판단이 필요합니다. 로컬 `ai_esports_contest/lobby-patch-2026-09-03/`(35MB)도
  이식이 끝나 삭제 가능합니다.
  > 옛 저장소와 이 저장소는 **공통 git 이력이 전혀 없습니다.** 이식도 merge/rebase가
  > 아니라 파일 단위 복사로 했습니다. **앞으로 두 저장소를 git으로 연결하려 하지 마세요.**

- **배포** — 루트 `server.ts` + `Dockerfile`로 Render 배포 구성이 되어 있지만 실제 배포는
  아직입니다. 배포할 때는 `NEXT_PUBLIC_WS_URL`을 **빌드 시점**(`--build-arg`)에
  `wss://<호스트>/ws` 형태로 넣어야 합니다. Next.js `NEXT_PUBLIC_*`는 빌드 타임에
  고정되므로 런타임 환경변수로는 안 됩니다.

- **lint 설정** — 아직 없습니다. 필요하면 추가하세요.

### 5-3. 게임 로직 쪽에서 남은 것

이번 세션에서 건드리지 않았지만 기억해 둘 것:

- 밸런스는 `SKILL_BALANCE_REPORT.md`가 최신입니다. 수치를 바꿀 때는
  `npx ts-node scripts/skillBalanceSuite.ts <게임수>`로 재검증하세요.
- 시뮬레이션 결과 현재 평균 종료 턴 12.0, 녹아웃 비율 100%, 무승부 0%.
  인어 콤보 봇의 무작위 상대 대비 승률 56.7%.

---

## 6. 작업 재개 시 권장 순서

1. §1대로 환경 구성 후 §1-4의 네 가지 검증을 돌려 초록불을 확인합니다.
2. [`CLAUDE.md`](CLAUDE.md)를 처음부터 끝까지 읽습니다. 특히 **턴 타이머 3규칙**과
   **애니메이션/실제 로직 순서 일치** 절은 과거 버그의 재발 방지 기록이라
   모르고 건드리면 되돌아갑니다.
3. 로비를 고칠 거라면 §3 전체와 `CLAUDE.md`의 "로비 화면" 절을 먼저 읽습니다.
4. 로비 폼에 항목을 추가했다면 **반드시** §1-5의 실측을 돌리고 §2-3 기준값과 대조합니다.
5. 커밋 전 §1-4의 네 가지를 다시 돌립니다.

---

## 7. 저장소 정보

```
origin    https://github.com/Aringco/ip_card_battle_render.git   (내 fork — push 가능)
upstream  https://github.com/HanJaeseok/ip_card_battle_render.git (권한 READ only — 아래처럼
          push URL을 DISABLED로 막아두길 권장. remote 설정은 PC를 옮기면 따라오지 않는다)
브랜치    main (기본) — 2026-09-04 기준 upstream 병합분까지 origin에 반영돼 있다
구조      npm workspaces — client / server / shared
          루트 package.json에는 실행 스크립트가 없고(배포용 start만),
          각 워크스페이스 디렉토리에서 직접 명령을 실행합니다
```

새 PC에서 clone하면 `upstream` remote는 따라오지 않습니다. 필요하면 다시 추가하세요
(push URL을 DISABLED로 막아두는 것까지 같이 하는 것을 권합니다 — 실수로 push를
시도해도 권한이 없어 실패하지만, 명시적으로 막아두면 의도가 드러납니다):

```bash
git remote add upstream https://github.com/HanJaeseok/ip_card_battle_render.git
git remote set-url --push upstream DISABLED
```

`.gitignore` 대상: `node_modules/`, `dist/`, `.next/`, `*.tsbuildinfo`, `.env*`,
`lobby-shots/`
