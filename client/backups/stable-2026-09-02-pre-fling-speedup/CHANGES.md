# 변경 기록 — 페어 카드 "팀 쪽으로 날아가는" 연출 60%로 단축

- 백업 시점: 2026-09-02
- 이 폴더의 `useAnimationQueue.ts`, `globals.css`는 변경 전 원본(안정화 버전) 전체 스냅샷.
- 복원하려면 이 두 파일을 그대로 `client/hooks/useAnimationQueue.ts`, `client/app/globals.css` 위에 덮어쓰면 된다.

## 변경 범위

오직 "짝(페어)이 맞은 카드가 스택에서 팀 점수판 쪽으로 날아가는" 연출(fling) 하나만 750ms → 450ms(60%)로 단축했다.
그 직전에 재생되는 "짝 확인" 흔들림(shake, `SHAKE_CHECK_DUR`)이나 다른 모든 연출(뽑기 슬롯, 스킬 발동, 축제 등)은 손대지 않았다.

## 수정한 파일과 값

| 파일 | 위치 | 이전 | 이후 |
|---|---|---|---|
| `client/hooks/useAnimationQueue.ts` | `COLLECT_FLING_DUR` 상수 (약 189번째 줄) | `750` | `450` |
| `client/app/globals.css` | `.stack-card-fling` 클래스의 `animation` 지속시간 (약 1474번째 줄) | `750ms` | `450ms` |

두 값은 반드시 같이 맞춰야 한다 — `COLLECT_FLING_DUR`은 JS 스케줄러가 "언제 날아가기가 끝났다고 볼지" 계산하는 값이고, `.stack-card-fling`의 `750ms`는 실제로 카드가 화면에서 움직이는 CSS 애니메이션 길이다. 둘이 어긋나면 로직상으로는 다음 단계로 넘어갔는데 카드는 아직 날아가는 중(또는 반대로 카드는 이미 도착했는데 다음 단계가 늦게 시작)인 시각적 불일치가 생긴다.

## 건드리지 않은 것

- `SHAKE_CHECK_DUR`(550ms, 짝 확인 흔들림) 및 `.stack-card-shake-a/b` CSS
- 뽑기 슬롯머신(`client/lib/drawTiming.ts`의 `SLOT_SPIN_DUR` 등)
- 그 외 `useAnimationQueue.ts` 상단의 다른 모든 지속시간 상수(`SCORE_FLASH_DUR`, `HP_PULSE_DUR`, `EFFECT_DUR` 등)
- 서버 쪽 턴 타이머·컴퓨터 사고 지연(`server/room.ts`)
