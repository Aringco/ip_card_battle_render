# 인수인계 — 로비 개편 (2026-09-03 기준)

이 저장소(`Aringco/ip_card_battle_render`)에서 이어서 작업하면 된다.
이전에 쓰던 `ip_card_battle` 저장소·폴더는 더 이상 쓰지 않는다(§5 참조).

## 1. 지금 어디까지 되어 있나

`f378b86 feat: 로비 화면 개편 - 카드테이블 배경 + 슬라이드 전환 UI` 로 커밋·push 완료.

로비 화면이 **세로 버튼 3개 나열 → 카드테이블 배경 위 2단 선택 구조**로 바뀌었다.

```
home ──멀티──▶ multi ──방 만들기──▶ create ──▶ waiting ──▶ /room/[id]
 │               │                             ▲
 │               └──방 참가하기──▶ join ────────┘
 └───싱글────▶ solo ──────────────────────────────▶ /room/[id]
```

- `page.tsx` 477줄 → 193줄. 폼·대기실은 `client/components/lobby/` 11개 파일로 분리
- 전환은 전부 CSS — `data-stage` 속성 하나만 바꾸면 뒤로가기가 정확한 역재생이 된다
- 배경 일러스트 위 "안전영역"에 버튼이 놓여, 화면 비율이 어떻게 바뀌어도 캐릭터를 가리지 않는다

설계 배경·실측값·시행착오는 [`LOBBY_REDESIGN.md`](LOBBY_REDESIGN.md)에, 동작 원리 요약은
[`CLAUDE.md`](CLAUDE.md)의 "로비 화면" 절에 있다. **로비를 건드리기 전에 그 절을 먼저 읽을 것.**

## 2. 이 저장소 고유 기능은 그대로 살아 있다

`ip_card_battle`에서 옮겨 오면서 이 저장소에만 있던 것들을 모두 보존했다.

| 기능 | 어디에 |
| --- | --- |
| `LoadingScreen` 에셋 프리로드 게이트 | `page.tsx`의 `assetsReady` |
| 상대 팀 이름(`otherTeamName`) | `CreateRoomForm` → `createRoom` 5번째 인자 |
| 선 플레이어(`firstTeam`) 3지선다 | `GameRulesFields` |
| 글씨 크기 설정(`--font-scale`) | Tailwind `--text-*` 전역 재정의라 자동 적용. `.input-base`에도 연결해 둠 |
| 하단 설정 안내 문구 | `page.tsx` 하단 (어두운 펠트에 맞춰 흰 글씨) |

## 3. 실행 방법

```bash
npm install          # 반드시 루트에서 (워크스페이스 구조)

# 터미널 2개
cd server && npm run dev     # WebSocket, 8080
cd client && npm run dev     # Next.js, 3000
```

## 4. 로비를 수정할 때 지켜야 할 것

### 폼에 항목을 추가하면 반드시 다시 잴 것

폼(`.stage-form`)은 `position: absolute`라 스테이지 박스를 밀어낼 수 없다. 항목을 하나만
더해도 조용히 잘리거나 스크롤바가 생기는데 눈으로는 잘 안 보인다.

```bash
cd client
npx next build && npx next start -p 3200   # 터미널 1
node scripts/measureLobby.mjs              # 터미널 2
```

3개 뷰포트 × 4단계를 재고 `client/lobby-shots/`에 스크린샷을 남긴다.
**폼 스크롤·페이지 스크롤·화면 이탈이 모두 `no`여야 한다.** 현재 기준값:

| 뷰포트 | 안전영역 | 가장 큰 카드(방 만들기+규칙) |
| --- | --- | --- |
| 1280×900 | 738×628 | 358×517 |
| 1920×1080 | 885×754 | 358×517 |
| 390×844 | 371×589 | 345×517 |

> dev 서버로 재면 Turbopack이 낡은 CSS 청크를 내주는 경우가 있어 값이 코드와 안 맞을 수
> 있다(이번 작업에서 두 번 겪었다). 반드시 프로덕션 빌드로 잴 것.

### 배경 이미지를 바꾸면

`client/lib/lobbyAssets.ts`의 경로 한 줄만 바꾸면 된다. 구도가 다른 이미지라면
`globals.css`의 `--table-w/h`와 `--safe-*` 4개 값도 맞춘다
([`client/public/lobby/README.md`](client/public/lobby/README.md)에 좌표 의미가 적혀 있다).

### `public/`에 이미지를 추가하면

`client/scripts/generateAssetManifest.mjs`의 `IMAGE_DIRS`에 그 폴더가 있어야
`LoadingScreen`이 프리로드한다. 빠뜨리면 로딩 화면이 끝난 뒤에야 받아와 배경이 늦게 뜬다.
(이번에 `lobby`, `tmp`를 추가했다.)

## 5. 남은 일

### 패널 배경이 아직 임시 에셋이다

`client/public/tmp/panel_{solo,multi,create,join}_bg.svg` 4종은 내가 만든 자리표시다.
placeholder 표식으로 넣은 **점선 테두리와 해치 무늬가 확정된 배경 위에서는 어색한
점선 사각형으로 보인다.** 둘 중 하나로 정리하면 된다.

- 확정 패널 아트를 `lobbyAssets.ts`의 `solo`/`multi`/`create`/`join` 경로에 넣기
- 배경 이미지를 빼고 단색 반투명 패널로 두기

정리가 끝나면 `lobbyAssets.ts`의 `TMP_ASSETS_IN_USE`를 `false`로 내리고
`client/public/tmp/` 폴더를 지운다.

### 옛 저장소 정리

| 대상 | 상태 |
| --- | --- |
| 로컬 `ai_esports_contest/ip_card_battle/` | 백업 브랜치·태그가 남아 있어 참고용으로만 유용 |
| `Aringco/ip_card_battle` (GitHub fork) | 이제 안 씀 — 삭제할지 판단 필요 |
| `ai_esports_contest/lobby-patch-2026-09-03/` | 이식에 썼던 패치 35MB. 이식이 끝났으니 삭제 가능 |

> 옛 저장소(`ip_card_battle`)와 이 저장소는 **공통 git 이력이 전혀 없다.** 그래서 이번 이식도
> merge/rebase가 아니라 파일 단위 복사로 했다. 앞으로 두 저장소를 git으로 연결하려 하지 말 것.

## 6. 작업 기록

- `LOBBY_REDESIGN.md` — 설계안 v1/v2, 애니메이션 원칙, 실측 결과, 시행착오
- `오늘의_명령어_2026-09-02.txt` — 그날 요청한 명령어와 각각이 무엇을 바꿨는지
- `오늘의_명령어_2026-08-30.txt`, `request_history.txt` — 그 이전 기록
