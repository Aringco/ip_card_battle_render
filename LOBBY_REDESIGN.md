# 접속 화면(로비) 개선안 — v2

> 대상: `client/app/page.tsx`, `client/components/lobby/*`, `client/app/globals.css`
> 서버·프로토콜(`shared/protocol.ts`)·`useWebSocket` 훅은 **변경 없음** — 순수 클라이언트 UI.
> 목업 4장(초기 / 싱글 클릭 / 멀티 클릭 / 방 만들기·참가 클릭)과 애니메이션 요구 4가지를 반영한 판.

## 0. v1 → v2 무엇이 달라졌나

| | v1 (이전 안) | **v2 (이 문서)** |
|---|---|---|
| 멀티 클릭 시 | 우측 열만 상하로 분할, 싱글 패널은 남음 | **멀티 패널이 왼쪽으로 확장돼 전체 폭을 차지**, 싱글 패널은 왼쪽으로 밀려 사라짐. 그 안에서 방 만들기/방 참가하기가 좌우 2열로 드러남 |
| 싱글 클릭 시 | 좌측 열이 폼으로 전환, 멀티 패널은 남음 | **싱글 패널이 오른쪽으로 확장**돼 전체 폭을 차지, 멀티 패널은 오른쪽으로 밀려 사라짐. 확장된 박스 안에 옵션 설정 폼 |
| 방 만들기/참가 클릭 시 | 우측 열이 폼으로 전환 | 클릭한 패널이 **상대 패널 쪽으로 확장**돼 전체 폭, 그 안에 옵션 설정 폼 |
| 뒤로가기 | 폼 카드 안의 "← 뒤로" 텍스트 링크 | **스테이지 아래 왼쪽의 전용 버튼(○← 뒤로가기)** + `ESC`. 들어올 때 애니메이션의 **정확한 역재생** |
| 구현 핵심 | 단계마다 다른 컴포넌트를 마운트/언마운트 | **모든 패널·폼을 항상 마운트**해 두고 `data-stage` 속성 하나만 바꾼다. CSS transition이 정방향·역방향을 모두 담당 |

v1 구현(`components/lobby/*`, 임시 에셋 `public/tmp/*`, `lib/lobbyAssets.ts`)은 이미 존재한다. §9에 "v1에서 바꿀 것"을 파일별로 정리했다.

---

## 1. 목표 레이아웃 (목업 4장)

컨테이너는 `max-w-3xl`. 로고 박스와 아래 스테이지의 **좌우 폭은 항상 정확히 일치**한다.

### 1-1. 초기 화면

```
┌──────────────────────────────────────────────────┐
│                      로고                        │   aspect 10:3
└──────────────────────────────────────────────────┘
┌───────────────────────┐ ┌────────────────────────┐
│                       │ │                        │
│      싱글플레이       │ │       멀티플레이       │   스테이지: 고정 높이 H, 1fr 1fr
│    (컴퓨터와 대전)    │ │                        │
│                       │ │                        │
└───────────────────────┘ └────────────────────────┘
```

### 1-2. 싱글플레이 클릭 시

```
┌──────────────────────────────────────────────────┐
│                      로고                        │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│                                                  │
│          싱글플레이 방 옵션 설정 화면            │   싱글 패널이 오른쪽으로 확장 → 1fr 0fr
│               (컴퓨터와 대전)                    │   멀티 패널은 오른쪽으로 밀려 사라짐
│                                                  │
└──────────────────────────────────────────────────┘
 (←) 뒤로가기
```

### 1-3. 멀티플레이 클릭 시

```
┌──────────────────────────────────────────────────┐
│                      로고                        │
└──────────────────────────────────────────────────┘
┌───────────────────────┐ ┌────────────────────────┐
│                       │ │                        │
│      방 만들기        │ │      방 참가하기       │   멀티 패널이 왼쪽으로 확장 → 0fr 1fr
│                       │ │                        │   그 안에서 두 패널이 왼쪽으로 펼쳐짐
│                       │ │                        │
└───────────────────────┘ └────────────────────────┘
 (←) 뒤로가기
```

### 1-4. 방 만들기 / 방 참가하기 클릭 시

```
┌──────────────────────────────────────────────────┐
│                      로고                        │
└──────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────┐
│                                                  │
│          멀티플레이 방 옵션 설정 화면            │   클릭한 패널이 상대 패널 쪽으로 확장
│           (방 만들기 / 방 참가하기)              │   → 내부 그리드 1fr 0fr 또는 0fr 1fr
│                                                  │
└──────────────────────────────────────────────────┘
 (←) 뒤로가기
```

---

## 2. 상태 머신

```
                ┌──────────────────────────────────────────────┐
                │                                              ▼
 home ──멀티──▶ multi ──방 만들기──▶ create ──(방 생성)──▶ waiting ──▶ /room/[id]
  │    ◀─뒤로──   │    ◀──뒤로───                             ▲
  │               └──방 참가하기──▶ join ──(입장)──────────────┘
  │                        ◀──뒤로───
  └───싱글────▶ solo ──(시작)──────────────────────────────────▶ /room/[id]
       ◀─뒤로──
```

```ts
type Stage = 'home' | 'solo' | 'multi' | 'create' | 'join';
const BACK: Record<Exclude<Stage, 'home'>, Stage> = {
  solo: 'home', multi: 'home', create: 'multi', join: 'multi',
};
```

- `waiting`은 스테이지 밖의 별도 화면 — `ws.roomId`가 생기면 스테이지 전체가 `WaitingRoom`으로 교체된다(현재 동작 유지).
- 재접속 시 `useWebSocket`이 `reconnect`를 보내고 `ws.roomId`가 설정되므로 `home`을 거치지 않고 `waiting`으로 직행(현재 동작 유지).
- 뒤로가기는 **한 단계씩**(`create → multi → home`). `ESC`도 동일. `showHowTo`(게임 방법 모달)가 열려 있으면 `ESC`는 모달이 먹는다.

---

## 3. 애니메이션 원칙 (요구 1~4를 만족시키는 단 하나의 규칙)

> **모든 패널·폼을 항상 DOM에 마운트해 두고, 스테이지 컨테이너의 `data-stage` 속성만 바꾼다.
> 크기 변화는 CSS Grid의 `grid-template-columns`(`1fr 1fr` ↔ `1fr 0fr` ↔ `0fr 1fr`) transition으로,
> 드러남/숨김은 `clip-path`·`opacity` transition으로 처리한다.**

이렇게 하면:

- 요구 1·2·3 — 클릭한 패널이 상대 쪽으로 늘어나는 동안 상대 패널은 그만큼 줄어든다. 줄어드는 열은 `overflow: hidden`이고 안의 패널은 **원래 폭을 유지**(`min-width`)하므로 "눌려서 밀려나가는" 것처럼 보인다.
- 요구 4 — 뒤로가기는 `data-stage`를 이전 값으로 되돌릴 뿐이다. CSS transition은 현재 값에서 목표 값으로 보간하므로 **역방향이 자동으로 정확히 재생**된다. 별도의 "역재생 애니메이션"을 짤 필요가 없다.
- 언마운트가 없으므로 React에서 exit 애니메이션을 위한 타이머·`onAnimationEnd`·상태 복제가 필요 없다.

브라우저 요건: `grid-template-columns`의 `fr` 보간(Chrome 107+, Safari 16+, Firefox 66+), 컨테이너 쿼리 단위 `cqw`(Chrome 105+, Safari 16+, Firefox 110+). 모두 2023년 이후 브라우저.

### 타이밍 (CSS 변수로 한 곳에서 관리)

| 변수 | 값 | 용도 |
|---|---|---|
| `--t-expand` | 300ms | 열 확장/수축 (`grid-template-columns`, `gap`) |
| `--t-reveal` | 250ms | 멀티 내부 2열이 드러나는 `clip-path` |
| `--t-form` | 200ms | 폼 페이드 인/아웃 |

정방향: **확장(300) → 드러남/폼(250 또는 200, 확장 종료 후 시작)**
역방향: **드러남/폼 숨김(먼저) → 수축(300, 숨김 종료 후 시작)**
위 순서는 `transition-delay`를 "들어가는 상태"와 "나오는 상태"에 따로 지정해 만든다 (§5 CSS 참조).

---

## 4. DOM 구조

```tsx
{/* page.tsx — waiting이 아닐 때 */}
<div className="lobby-stage" data-stage={stage}>

  {/* 좌측 열: 싱글 */}
  <section className="stage-col stage-col-solo" inert={stage !== 'home' && stage !== 'solo'}>
    <ModePanel className="stage-panel" ... onClick={() => go('solo')} />   {/* 배경 겸 버튼 */}
    <div className="stage-form stage-form-solo" inert={stage !== 'solo'}>
      <SoloForm ... />
    </div>
  </section>

  {/* 우측 열: 멀티 */}
  <section className="stage-col stage-col-multi" inert={stage === 'solo'}>
    <ModePanel className="stage-panel stage-panel-multi" ... onClick={() => go('multi')} />

    {/* 멀티 내부 2열 — 멀티 패널 위에 겹쳐 있다가 드러난다 */}
    <div className="multi-inner" inert={stage === 'home' || stage === 'solo'}>
      <section className="stage-col stage-col-create" inert={stage === 'join'}>
        <ModePanel className="stage-panel" ... onClick={() => go('create')} />
        <div className="stage-form stage-form-create" inert={stage !== 'create'}>
          <CreateRoomForm ... />
        </div>
      </section>
      <section className="stage-col stage-col-join" inert={stage === 'create'}>
        <ModePanel className="stage-panel" ... onClick={() => go('join')} />
        <div className="stage-form stage-form-join" inert={stage !== 'join'}>
          <JoinRoomForm ... />
        </div>
      </section>
    </div>
  </section>
</div>

<BackButton hidden={stage === 'home'} onClick={goBack} />
```

- `inert`는 보이지 않는 영역으로 Tab 포커스·클릭이 새지 않게 하는 표준 속성. React 19는 boolean prop으로 지원한다.
- `ModePanel`은 폼이 열렸을 때 **배경 역할**을 계속한다(사라지지 않는다). 라벨(이모지/제목)만 페이드아웃하고 버튼은 `pointer-events: none`이 된다.
- 멀티 열은 두 겹이다: 아래에 "멀티플레이" 패널, 위에 `absolute`로 겹친 `multi-inner`(방 만들기/참가하기 2열). 초기엔 `clip-path`로 완전히 가려져 있다.

---

## 5. CSS 스펙 (`globals.css`에 추가 — v1의 `.lobby-split-in` 블록은 삭제)

```css
/* ── 로비 스테이지 ─────────────────────────────────────────────────────── */
.lobby-stage {
  --stage-gap: 1rem;
  --stage-h: clamp(320px, 52vh, 420px);
  --t-expand: 300ms;
  --t-reveal: 250ms;
  --t-form: 200ms;

  container-type: inline-size;          /* 자식이 100cqw로 스테이지 폭을 참조할 수 있게 */
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--stage-gap);
  height: var(--stage-h);
  transition: grid-template-columns var(--t-expand) ease, gap var(--t-expand) ease;
  /* home으로 "돌아올 때"는 폼/내부열이 먼저 숨은 뒤 수축한다 */
  transition-delay: var(--t-reveal);
}
.lobby-stage[data-stage="solo"]   { grid-template-columns: 1fr 0fr; gap: 0; transition-delay: 0s; }
.lobby-stage[data-stage="multi"],
.lobby-stage[data-stage="create"],
.lobby-stage[data-stage="join"]   { grid-template-columns: 0fr 1fr; gap: 0; transition-delay: 0s; }

/* 열 — 줄어들 때 내용물을 잘라내고, 안의 패널을 한쪽으로 정렬해 "밀려나가는" 방향을 만든다 */
.stage-col {
  position: relative;
  min-width: 0;                         /* 0fr까지 줄어들 수 있게 */
  overflow: hidden;
  display: flex;
  transition: opacity var(--t-expand) ease;
}
.stage-col-solo   { justify-content: flex-end; }   /* 오른쪽 정렬 → 열이 줄면 왼쪽으로 밀려나감 */
.stage-col-multi  { justify-content: flex-start; } /* 왼쪽 정렬  → 열이 줄면 오른쪽으로 밀려나감 */
.stage-col-create { justify-content: flex-end; }
.stage-col-join   { justify-content: flex-start; }

/* 밀려나가는 열은 동시에 옅어진다 */
.lobby-stage[data-stage="solo"]   .stage-col-multi,
.lobby-stage[data-stage="multi"]  .stage-col-solo,
.lobby-stage[data-stage="create"] .stage-col-solo,
.lobby-stage[data-stage="join"]   .stage-col-solo,
.lobby-stage[data-stage="create"] .stage-col-join,
.lobby-stage[data-stage="join"]   .stage-col-create { opacity: 0; pointer-events: none; }

/* 패널 — 줄어드는 열 안에서도 원래 폭(스테이지의 절반)을 유지한다 */
.stage-panel {
  flex: none;
  width: 100%;                          /* 늘어나는 열에서는 열을 가득 채우며 함께 커진다 */
  height: 100%;
  min-width: calc((100cqw - var(--stage-gap)) / 2);   /* 줄어드는 열에서는 이 폭을 지킨다 */
}
/* 폼을 품은 패널: 라벨은 사라지고 배경은 살짝 밝아지며 클릭은 막힌다 */
.stage-panel-label { transition: opacity var(--t-form) ease; }
.lobby-stage[data-stage="solo"]   .stage-col-solo   > .stage-panel,
.lobby-stage[data-stage="create"] .stage-col-create > .stage-panel,
.lobby-stage[data-stage="join"]   .stage-col-join   > .stage-panel { pointer-events: none; }
.lobby-stage[data-stage="solo"]   .stage-col-solo   > .stage-panel .stage-panel-label,
.lobby-stage[data-stage="create"] .stage-col-create > .stage-panel .stage-panel-label,
.lobby-stage[data-stage="join"]   .stage-col-join   > .stage-panel .stage-panel-label { opacity: 0; }
.lobby-stage[data-stage="solo"]   .stage-col-solo   > .stage-panel .lobby-panel-bg,
.lobby-stage[data-stage="create"] .stage-col-create > .stage-panel .lobby-panel-bg,
.lobby-stage[data-stage="join"]   .stage-col-join   > .stage-panel .lobby-panel-bg { filter: brightness(0.8); }

/* 멀티플레이 패널 라벨 — 내부 2열이 드러나면 사라진다 */
.lobby-stage[data-stage="multi"]  .stage-panel-multi,
.lobby-stage[data-stage="create"] .stage-panel-multi,
.lobby-stage[data-stage="join"]   .stage-panel-multi { pointer-events: none; }
.lobby-stage[data-stage="multi"]  .stage-panel-multi .stage-panel-label,
.lobby-stage[data-stage="create"] .stage-panel-multi .stage-panel-label,
.lobby-stage[data-stage="join"]   .stage-panel-multi .stage-panel-label { opacity: 0; }

/* 멀티 내부 2열 — 멀티 패널 위에 겹쳐 있다가 오른쪽에서 왼쪽으로 드러난다 */
.multi-inner {
  position: absolute;
  inset: 0;
  container-type: inline-size;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--stage-gap);
  clip-path: inset(0 0 0 100%);         /* 왼쪽 100%를 잘라내 완전히 숨김 */
  opacity: 0;
  transition:
    clip-path var(--t-reveal) ease,
    opacity   var(--t-reveal) ease,
    grid-template-columns var(--t-expand) ease,
    gap var(--t-expand) ease;
}
.lobby-stage[data-stage="multi"] .multi-inner {
  clip-path: inset(0 0 0 0);            /* 왼쪽으로 펼쳐지며 드러남 */
  opacity: 1;
  /* 들어올 때: 열 확장(300)이 끝난 뒤 드러난다 / create·join에서 돌아올 때: 폼이 숨은 뒤 열이 되돌아간다 */
  transition-delay: var(--t-expand), var(--t-expand), var(--t-form), var(--t-form);
}
.lobby-stage[data-stage="create"] .multi-inner,
.lobby-stage[data-stage="join"]   .multi-inner {
  clip-path: inset(0 0 0 0);
  opacity: 1;
  gap: 0;
  transition-delay: 0s;
}
.lobby-stage[data-stage="create"] .multi-inner { grid-template-columns: 1fr 0fr; }  /* 방 만들기 → 오른쪽으로 확장 */
.lobby-stage[data-stage="join"]   .multi-inner { grid-template-columns: 0fr 1fr; }  /* 방 참가하기 → 왼쪽으로 확장 */

/* 폼 — 확장된 패널 위에 겹쳐서 페이드 인/아웃 */
.stage-form {
  position: absolute;
  inset: 0;
  z-index: 2;
  overflow-y: auto;
  opacity: 0;
  visibility: hidden;
  transition: opacity var(--t-form) ease, visibility 0s linear var(--t-form);  /* 숨을 때: 즉시 페이드아웃 */
}
.lobby-stage[data-stage="solo"]   .stage-form-solo,
.lobby-stage[data-stage="create"] .stage-form-create,
.lobby-stage[data-stage="join"]   .stage-form-join {
  opacity: 1;
  visibility: visible;
  transition-delay: var(--t-expand), 0s;                                        /* 나타날 때: 확장이 끝난 뒤 */
}

/* 뒤로가기 버튼 */
.lobby-back {
  transition: opacity var(--t-form) ease, transform var(--t-form) ease;
}
.lobby-back[hidden] {
  display: flex;                        /* hidden 속성의 display:none을 덮어 페이드가 되게 */
  opacity: 0;
  transform: translateX(-6px);
  pointer-events: none;
}

/* 움직임 축소 환경 — 모든 전환을 즉시 적용 */
@media (prefers-reduced-motion: reduce) {
  .lobby-stage, .stage-col, .stage-panel, .stage-panel-label,
  .multi-inner, .stage-form, .lobby-back {
    transition: none !important;
  }
}
```

> **왜 `min-width: calc((100cqw - gap) / 2)`인가** — 줄어드는 열에서 패널이 열과 함께 좁아지면 "찌그러지는" 것처럼 보인다. 스테이지 폭의 절반을 하한으로 두면 패널은 크기를 유지한 채 열 경계에 잘려 나가고, `justify-content`가 어느 쪽으로 밀려나갈지를 정한다. `%`는 부모(줄어드는 열) 기준이라 쓸 수 없고, 스테이지에 `container-type`을 걸어 `cqw`로 참조한다.

---

## 6. React 구현 지침

### 6-1. 상태

```ts
// page.tsx — 기존 mode 상태를 그대로 쓴다. 'waiting'은 스테이지 밖.
type Mode = Stage | 'waiting';
const [mode, setMode] = useState<Mode>('home');

const goBack = useCallback(() => {
  setMode(m => (m in BACK ? BACK[m as keyof typeof BACK] : m));
}, []);
```

### 6-2. `LobbyStage.tsx` (신규)

- props: `stage: Stage`, `blocked: boolean`(서버 미연결), 폼 상태·핸들러 일체, `onGo(stage)`.
- §4의 DOM을 그대로 렌더한다. **조건부 렌더링을 하지 않는다** — 모든 패널·폼을 항상 렌더하고 `data-stage`·`inert`만 바꾼다.
- 패널 클릭 핸들러는 `blocked`일 때 무시.

### 6-3. 포커스 이동

- 폼이 열리면(`stage`가 `solo/create/join`이 된 뒤) `--t-expand + --t-form`(500ms) 후 닉네임 입력에 `focus()`. `prefers-reduced-motion`이면 즉시.
- 뒤로가면 방금 닫힌 폼의 패널(예: `create → multi`면 "방 만들기" 패널)에 `focus()`.
- `inert` 덕분에 숨은 영역으로 Tab이 새지 않으므로 그 외 포커스 트랩은 필요 없다.

### 6-4. ESC

```ts
useEffect(() => {
  if (mode === 'home' || mode === 'waiting') return;
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !showHowTo) goBack(); };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, [mode, showHowTo, goBack]);
```

### 6-5. 빠른 연타 방어

전환 중(300ms 안)에 다른 패널을 눌러도 `data-stage`만 바뀌고 transition이 현재 위치에서 새 목표로 이어지므로 깨지지 않는다. 별도 잠금은 두지 않는다. 단, **한 번 열린 폼의 제출 버튼은 `visibility: hidden`·`inert` 상태에서 눌리지 않음**을 QA에서 확인한다.

---

## 7. 폼 · 뒤로가기 버튼 스타일

### 7-1. 폼 (확장된 패널 "안"에 놓인다)

```tsx
<div className="stage-form stage-form-solo">
  <div className="min-h-full flex items-center justify-center p-4">
    <div className="w-full max-w-md bg-white/95 rounded-2xl shadow-lg p-6 flex flex-col gap-4">
      <h3 className="font-bold text-gray-700">🤖 싱글플레이</h3>
      {/* 필드… (v1 SoloForm 내용 그대로) */}
    </div>
  </div>
</div>
```

- 확장된 패널의 배경(임시 에셋)이 폼 카드 뒤로 비친다. 카드는 `bg-white/95`.
- 스테이지 높이가 고정(`--stage-h`)이므로 ⚙️ 게임 규칙을 펼쳐 카드가 길어지면 `.stage-form`이 **내부 스크롤**한다. 스테이지 자체는 늘어나지 않는다(늘어나면 전환 중 높이가 튄다).
- v1의 `FormCard`에 있던 "← 뒤로" 텍스트 링크는 **제거** — 뒤로가기는 아래 전용 버튼으로 통일.
- 폼 필드 구성은 v1 그대로: solo(닉네임·팀 이름·규칙) / create(닉네임·팀 선택·팀 이름·규칙) / join(닉네임·방 코드·팀 선택).

### 7-2. 뒤로가기 버튼 (`BackButton.tsx`, 신규)

```tsx
<button type="button" className="lobby-back flex items-center gap-2 mt-1 self-start text-sm text-jungle-800"
        hidden={stage === 'home'} onClick={onClick} aria-label="뒤로가기">
  <span className="w-9 h-9 rounded-full bg-jungle-600 text-white flex items-center justify-center text-lg shadow">←</span>
  뒤로가기
</button>
```

- 스테이지 **바로 아래, 왼쪽 정렬** (목업 위치). `home`에서는 `hidden`으로 숨기되 CSS로 페이드.
- 한 단계씩 되돌린다. 텍스트는 항상 "뒤로가기"(어디로 가는지 적지 않는다 — 목업 준수).

---

## 8. 반응형 (< 768px)

같은 메커니즘을 **세로축**으로 돌린다. 좌/우 → 위/아래.

```css
@media (max-width: 767px) {
  .lobby-stage {
    --stage-h: 560px;
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 1fr;
    transition-property: grid-template-rows, gap;
  }
  .lobby-stage[data-stage="solo"]   { grid-template-columns: 1fr; grid-template-rows: 1fr 0fr; }
  .lobby-stage[data-stage="multi"],
  .lobby-stage[data-stage="create"],
  .lobby-stage[data-stage="join"]   { grid-template-columns: 1fr; grid-template-rows: 0fr 1fr; }

  .stage-col { min-height: 0; flex-direction: column; }
  .stage-col-solo, .stage-col-create { justify-content: flex-end; }     /* 위로 밀려나감 */
  .stage-col-multi, .stage-col-join  { justify-content: flex-start; }   /* 아래로 밀려나감 */

  .stage-panel { min-width: 0; min-height: calc((var(--stage-h) - var(--stage-gap)) / 2); }

  .multi-inner { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; clip-path: inset(100% 0 0 0); }
  .lobby-stage[data-stage="create"] .multi-inner { grid-template-columns: 1fr; grid-template-rows: 1fr 0fr; }
  .lobby-stage[data-stage="join"]   .multi-inner { grid-template-columns: 1fr; grid-template-rows: 0fr 1fr; }
}
```

로고 박스는 모바일에서 `aspect-[10/4]`(v1 유지).

---

## 9. v1 구현에서 바꿀 것 (파일별)

| 파일 | 조치 |
| --- | --- |
| `components/lobby/LobbyStage.tsx` | **신규** — §4 DOM + `data-stage`. 패널 4개·폼 3개를 모두 품는다 |
| `components/lobby/BackButton.tsx` | **신규** — §7-2 |
| `components/lobby/MultiSplit.tsx` | **삭제** — `LobbyStage`의 `.multi-inner`로 흡수 |
| `components/lobby/ModePanel.tsx` | `aspect-[5/6]`/`aspect-[5/3]` 제거 → `h-full`. `layout` prop 제거. 라벨 wrapper `<span>`에 `stage-panel-label` 클래스 추가. `className` prop은 유지(`stage-panel` 전달용) |
| `components/lobby/Field.tsx` | `FormCard`에서 `backLabel`/`onBack` prop과 "← 뒤로" 링크 제거. 카드 배경 `bg-white` → `bg-white/95` |
| `components/lobby/SoloForm.tsx` 등 폼 3종 | `onBack` prop 제거. 나머지 그대로 |
| `app/page.tsx` | `MultiSplit`·좌우 열 직접 렌더 제거 → `<LobbyStage …/>` + `<BackButton …/>`. `mode`·핸들러·ESC·`waiting` 분기는 유지 |
| `app/globals.css` | `.lobby-split-in*` 블록 삭제 → §5 CSS 추가. `.lobby-panel*`·`.input-base`는 유지 |
| `lib/lobbyAssets.ts`, `public/tmp/*` | **변경 없음**. 패널 배경 비율만 달라짐(세로 5:6 → 스테이지 높이에 맞는 가변) — 임시 SVG는 `preserveAspectRatio="slice"`라 그대로 동작. `tmp/README.md`의 비율 표기만 "가변(≈ 5:6 ~ 10:6)"으로 수정 |

---

## 10. 확정된 결정 사항

구현 착수 전 확인받은 내용이다. 아래대로 구현이 완료되었다.

| # | 항목 | 확정 |
| --- | --- | --- |
| 1 | **슬라이드 방식** | **선택한 쪽 열은 넓어지고, 반대쪽 패널만 밀려 나간다.** 밀려나는 패널은 `min-width`로 원래 크기를 유지한 채 열 밖으로 잘려 나가므로 "찌그러짐"이 아니라 **슬라이드 아웃**으로 보인다 |
| 2 | **방 만들기 / 방 참가하기 방향** | **각자 반대쪽으로** — 방 만들기(왼쪽 패널)는 오른쪽으로, 방 참가하기(오른쪽 패널)는 왼쪽으로 진행. 요구 1·2와 같은 규칙("상대 패널을 밀어내는 방향") |
| 3 | **폼 배경** | **패널 배경 위에 반투명 흰 카드**(`bg-white/95`). 패널 배경은 `brightness(0.8)`로 살짝 밝아진 채 뒤에 남는다 |
| 4 | **스테이지 높이** | **단계별 고정 높이 2종.** 패널 단계 `--stage-h: clamp(320px, 52vh, 420px)`, 폼 단계 `--stage-form-h: clamp(440px, 62vh, 560px)`. 확장과 같은 300ms로 `height`도 함께 전환된다. 실측으로 **스크롤바가 어디에도 생기지 않도록** 맞췄다(§12) |
| 5 | **로고 에셋** | 미정 — 임시 배경 + 이모지/텍스트 유지 (§7-1 v1과 동일) |

### 밀려나는 방향을 만드는 법

`justify-content` 한 줄이 방향을 결정한다. 열이 줄어들 때 패널이 어느 쪽 모서리에 붙어 있느냐의 문제다.

| 열 | `justify-content` | 줄어들 때 |
| --- | --- | --- |
| `.stage-col-solo` | `flex-end` | 왼쪽으로 빠져나감 (멀티 선택 시) |
| `.stage-col-multi` | `flex-start` | 오른쪽으로 빠져나감 (싱글 선택 시) |
| `.stage-col-create` | `flex-end` | 왼쪽으로 빠져나감 (방 참가 선택 시) |
| `.stage-col-join` | `flex-start` | 오른쪽으로 빠져나감 (방 만들기 선택 시) |

---

## 11. 완료 기준 (QA 체크리스트)

### 11-1. 레이아웃

- [ ] 로고 박스와 스테이지의 좌우 폭이 모든 단계에서 일치한다.
- [ ] 초기 화면에서 싱글/멀티 패널이 같은 크기다.
- [ ] 폼 단계에서 확장된 박스가 로고와 같은 폭이고, 뒤로가기 버튼이 그 아래 왼쪽에 있다.

### 11-2. 애니메이션 (요구 1~4)

- [ ] 싱글 클릭: 싱글 패널이 **오른쪽으로** 늘어나고 멀티 패널이 **오른쪽으로 밀려** 사라진다. 확장이 끝난 뒤 폼이 페이드인.
- [ ] 멀티 클릭: 멀티 패널이 **왼쪽으로** 늘어나고 싱글 패널이 **왼쪽으로 밀려** 사라진다. 확장이 끝난 뒤 방 만들기/참가하기가 **오른쪽에서 왼쪽으로** 펼쳐진다.
- [ ] 방 참가하기 클릭: **왼쪽으로** 늘어나고 방 만들기가 왼쪽으로 밀려 사라진다. 방 만들기 클릭: 오른쪽으로 늘어난다(§10-1).
- [ ] 뒤로가기(버튼·ESC): 각 단계에서 **들어올 때의 정확한 역순**(폼 숨김 → 수축 → 상대 패널 복귀)으로 재생된다.
- [ ] 전환 도중 다른 패널을 눌러도 화면이 깨지지 않고 새 목표로 이어진다.
- [ ] `prefers-reduced-motion`에서 모든 전환이 즉시 적용된다.

### 11-3. 스크롤 (실측 완료 — §12)

- [x] 어떤 단계에서도 폼 안에 세로 스크롤바가 생기지 않는다.
- [x] 어떤 단계에서도 페이지 자체에 스크롤바가 생기지 않는다.
- [x] 게임 규칙을 펼쳐도 항목이 중간에서 잘리지 않는다.

### 11-4. 기능 회귀

- [ ] 숨은 폼·패널에 Tab 포커스가 가지 않는다(`inert`).
- [ ] 폼이 열리면 닉네임 입력에 포커스가 간다. 뒤로가면 해당 패널로 돌아온다.
- [ ] 폼 간 이동 시 닉네임이 유지된다.
- [ ] 서버 미연결 시 패널이 비활성화되고 배너가 로고 아래에 뜬다.
- [ ] 세션이 남아 있으면 홈을 거치지 않고 대기실로 복귀한다.
- [ ] 게임 규칙 설정·팀 이름·재접속·게임 시작 이동이 v1과 동일하게 동작한다.
- [ ] 375px 폭에서 세로축으로 같은 전환이 동작한다.

---

## 12. 헤드리스 실측 결과 (2026-09-02)

브라우저 MCP를 쓸 수 없어 **puppeteer-core로 실제 Chrome을 띄워** 각 단계의 박스를 실측했다.
측정 스크립트는 스크래치패드에 있고(`inspect.js`), 뷰포트 1280×900 / 390×844 두 가지로 돌렸다.

### 12-1. 발견된 문제와 조치

| # | 문제 | 실측값 | 조치 |
| --- | --- | --- | --- |
| 1 | 폼이 박스보다 커서 스크롤바 발생 | 방 만들기+규칙 **723px** vs 박스 420px | 폼 단계 전용 높이 `--stage-form-h` 도입 + 폼 압축 |
| 2 | 규칙을 안 펼쳐도 방 만들기 폼이 넘침 | 480px vs 420px | 닉네임·팀 이름을 한 줄에 2열 배치 |
| 3 | 박스를 620px로 키우자 **페이지 스크롤** 발생 | 문서 942 / 뷰포트 900 | 스테이지 외 요소가 **330px**임을 실측 → 상한을 560px로 |
| 4 | 규칙 섹션 `max-height` 상한이 **항목을 반쯤 잘라** 렌더링 오류처럼 보임 | — | 5개 항목을 **2열 3행**으로 재배치 + 라벨 축약 → 상한 자체가 불필요해짐 |
| 5 | "TMP 임시 에셋" 배지가 **사운드 토글과 겹침** (둘 다 `fixed` 우하단) | — | 배지를 로고 박스 좌하단으로 이동 (표식이 가리키는 대상 위) |
| 6 | 로고 모서리 잎사귀가 **잘린 초록 조각**으로 보임 | — | 임시 배경에서는 제거. 확정 로고 확보 후 재검토 |
| 7 | 팀 선택의 비선택 버튼이 흰 카드 위에서 **보이지 않음** | — | `ring-1 ring-gray-300` 추가 |
| 8 | 패널 배경 SVG의 `TMP` 글자가 잘려 **"T" 조각**만 노출 | — | 패널 SVG에서 글자 제거 (로고 배지가 대신함) |

### 12-2. 최종 측정값 (스크롤 0건)

| 단계 | 박스 h | 카드 | 여유 | 폼 스크롤 | 페이지 스크롤 |
| --- | --- | --- | --- | --- | --- |
| home | 420 | — | — | — | 없음 |
| solo | 558 | 448×348 | 210 | 없음 | 없음 |
| solo + 규칙 | 558 | 448×481 | 77 | 없음 | 없음 |
| multi | 420 | — | — | — | 없음 |
| create | 558 | 448×342 | 216 | 없음 | 없음 |
| create + 규칙 | 558 | 448×475 | 83 | 없음 | 없음 |
| join | 558 | 448×370 | 188 | 없음 | 없음 |
| join @390 | 523 | 326×370 | 153 | 없음 | 없음 |

열 폭도 의도대로 동작함을 확인했다 (단위 px, 스테이지 폭 768):

| 단계 | solo열 | multi열 | create열 | join열 |
| --- | --- | --- | --- | --- |
| home | 376 | 376 | 180 | 180 |
| solo | **768** | 0 | 0 | 0 |
| multi | 0 | **768** | 376 | 376 |
| create | 0 | 768 | **768** | 0 |
| join | 0 | 768 | 0 | **768** |

### 12-3. 재현 방법

```bash
# 스크래치패드에 puppeteer-core 설치 후 (프로젝트 의존성 아님)
node inspect.js    # 측정값 JSON + shot-*.png 스크린샷 생성
```

> ⚠️ **주의**: dev 서버가 떠 있는 상태에서 `npm install`이 `node_modules/next`를 교체하면
> 실행 중인 서버가 깨진다(모든 요청 500). 또 CSS를 고쳐도 Turbopack이 **낡은 청크를 계속
> 내주는** 경우가 있었다(같은 파일 안에 신·구 값이 공존). 측정값이 코드와 안 맞으면
> `.next` 삭제 후 dev 서버를 재시작하고 다시 잴 것.

---

## 13. 배경 교체 — 카드테이블 일러스트 위로 (2026-09-02)

로비 배경을 네 동물이 둘러앉은 **카드테이블 일러스트**로 바꾸고, 버튼·폼이 항상
테이블 위(캐릭터·카드더미를 피한 자리)에만 놓이도록 좌표계를 다시 잡았다.

### 13-1. 어떻게 "항상 테이블 위"를 보장하나

`background-size: cover`를 쓰면 이미지가 어디에 얼마로 그려지는지 CSS에서 알 수 없어,
그 위에 좌표로 무언가를 얹을 수 없다. 그래서 **cover와 똑같은 계산을 요소 크기로 옮겼다.**

```css
.lobby-table {
  width:  max(100vw, calc(100vh * var(--table-w) / var(--table-h)));
  height: max(100vh, calc(100vw * var(--table-h) / var(--table-w)));
  background-size: 100% 100%;
}
```

이러면 `.lobby-table`의 **퍼센트 좌표가 곧 이미지 좌표**가 되고, 그 안에 퍼센트로
`.lobby-safe`를 놓으면 화면 비율이 어떻게 바뀌어도 테이블 위 같은 자리에 붙는다.

| 변수 | 값 | 피하는 대상 |
| --- | --- | --- |
| `--table-w` / `--table-h` | `1400` / `753` | 이미지 비율 |
| `--safe-left` | `26.4%` | 실용신양·디자인어, 왼쪽 카드더미 |
| `--safe-right` | `29.6%` | 상표토끼·특허랑이, 주머니, 오른쪽 카드더미 |
| `--safe-top` | `15.9%` | 위쪽 램프, 나무 테두리 |
| `--safe-bottom` | `14.3%` | 아래쪽 카드더미 2개 |

실제 이미지가 다르면 **이 6개 값만** 고치면 된다. 컴포넌트는 손댈 필요가 없다.

### 13-2. 높이 체계 단순화

이전(§12)에는 패널 단계·폼 단계에 각각 고정 높이(`--stage-h`, `--stage-form-h`)를 두고
`height`를 전환했다. 이제 **스테이지가 안전영역의 남는 공간을 그대로 채우므로**
(`flex: 1`) 두 변수와 높이 전환이 모두 사라졌다. 대신 폼이 열리면 **로고가 접혀**
(`.lobby-hero-slot` height 26% → 0) 스테이지에 공간을 내준다.

### 13-3. 이 단계에서 잡은 문제

| # | 문제 | 조치 |
| --- | --- | --- |
| 1 | 390×844에서 테이블이 1569px까지 확대돼 **안전영역이 화면 밖**(x = −176)으로 나감 | `.lobby-safe`에 `max-width/height: 100vw/vh − 1.5rem` + `margin: auto` |
| 2 | 위 조치 후에도 모바일에서 16px 왼쪽으로 밀림 — 좌우 여백(26.4%/29.6%)이 **비대칭**이라 확대 배율만큼 차이가 벌어짐 | 좁은 화면(≤767px)에서는 좌우를 `30%`로 **대칭** 처리 |
| 3 | 패널이 테이블 그림을 통째로 가림 | `.lobby-panel-bg`를 `opacity: .55`(hover `.8`)로, 패널에 테두리·그림자를 줘 "펠트 위 명패"처럼 |
| 4 | 뒤로가기 글자가 어두운 펠트 위에서 안 읽힘 | 흰색 + `drop-shadow` |

### 13-4. 최종 측정 (프로덕션 빌드 기준, 문제 0건)

| 뷰포트 | 안전영역 | 화면 밖 | 폼 카드 | 폼 스크롤 | 페이지 스크롤 |
| --- | --- | --- | --- | --- | --- |
| 1280×900 | 736×628 @245,143 | 없음 | 358×402 | 없음 | 없음 |
| 1920×1080 | 884×754 @486,172 | 없음 | 358×397 | 없음 | 없음 |
| 390×844 | 371×589 @10,134 | 없음 | 345×397 | 없음 | 없음 |

### 13-5. 남은 작업

실제 일러스트를 `client/public/lobby/table_bg.png`로 저장한 뒤
`client/lib/lobbyAssets.ts`의 `table` 경로와 `TABLE_IS_STANDIN`만 바꾸면 된다.
자세한 절차는 `client/public/lobby/README.md` 참조.

> ⚠️ dev 서버가 CSS 변경 후 **낡은 청크를 계속 내주는** 현상이 이 작업 중 두 번 재현됐다
> (청크 파일명이 그대로인 채 신·구 값이 섞여 있음). 화면이 코드와 안 맞으면
> dev 서버를 재시작할 것. 검증은 `next build` + `next start`로 하면 확실하다.

---

## 14. 확정 에셋 반영 (2026-09-02)

실제 배경(`lobby/table_bg.png`, 1400×752)과 확정 로고(`tmp/logo_bg.png`, 1386×748)가
들어와 임시 요소를 걷어냈다.

| 항목 | 변경 |
| --- | --- |
| 로고 | 투명 배경의 **"떱카드 T.U.P.D." 엠블럼**. `bg-cover`가 세로를 크게 잘라내던 것을 `<img object-contain>`으로 바꿔 **전체가 잘리지 않고** 슬롯 안에 들어오게 함 |
| 이모지·제목 | 임시 표기였던 `🐑🐰🧜‍♀️🐯` + "한국특허정보원 카드배틀" **제거**. 제목은 `sr-only` h1으로만 남겨 스크린리더 접근성 유지 |
| 로고 박스 | 투명 PNG라 둥근 박스·테두리가 불필요해 제거 — 엠블럼이 펠트 위에 그대로 얹힌 형태 |
| 슬롯 높이 | 26% → **38%** (엠블럼이 충분히 보이도록). 폼이 열리면 종전대로 0까지 접힌다 |
| 이미지 비율 | `--table-h` 753 → **752** (실제 파일 값) |
| 플래그 | `TABLE_IS_STANDIN` → `false`, `LOGO_IS_TEXT_FALLBACK` 삭제 |

측정 결과 모든 뷰포트에서 폼 스크롤·페이지 스크롤·화면 이탈 **0건**
(1280×900 / 1920×1080 / 390×844, 프로덕션 빌드 기준).

### 남은 임시 에셋

패널 배경 4종(`tmp/panel_*_bg.svg`)은 아직 스탠드인이다. 점선 테두리·해치 무늬가
placeholder 표식이라, 확정된 배경 위에서는 **점선 사각형이 눈에 띈다**.
확정 패널 아트를 넣거나, 배경 이미지를 빼고 단색 반투명으로 두면 정리된다.

### 14-1. 로고 확대 (1.5~1.7배 요청 반영)

로고를 슬롯 높이만 키워 확대하면 그만큼 아래 버튼이 눌린다. 대신 **레이아웃이 차지하는
높이(슬롯)는 조금만 늘리고, 이미지는 그보다 크게 그려 위쪽 빈 펠트로만 넘치게** 했다.
아래로는 버튼이 있어 넘칠 수 없으므로 `align-items: flex-end`로 아래를 고정한다.

```css
.lobby-hero-slot { height: 46%; overflow: visible; display: flex; align-items: flex-end; }
.lobby-hero-logo { height: 130%; max-width: 100%; width: auto; }
```

폼이 열려 슬롯 높이가 0이 되면 로고 높이(%)도 함께 0이 되므로 스필이 생기지 않는다.

| 뷰포트 | 엠블럼 (변경 전 → 후) | 배율 | 패널 높이 |
| --- | --- | --- | --- |
| 1280×900 | 206×189 → **323×297** | **1.57×** | 291 |
| 1920×1080 | — → 388×356 | 1.57× | 359 |
| 390×844 | 174×169 (가로 폭에 걸려 확대 불가) | 1.0× | 182 |

> 좁은 화면에서는 로고가 이미 안전영역 가로 폭을 꽉 채워 더 커질 수 없다.
> 슬롯만 넓히면 빈 공간이 생기고 버튼만 눌리므로, 모바일은 슬롯을 `28%`로 따로 잡았다
> (이 처리를 하기 전 패널이 129px까지 눌렸다 → 182px로 회복).
