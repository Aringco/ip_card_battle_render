# 테스트 서버(test.tupd.site) 자동 재배포

```
로컬에서 수정 → git push (main) → GitHub Actions CI(타입 검사 · 서버 테스트)
                              → 서버 cron이 1분마다 확인 → 새 커밋의 CI가 성공이면 받아서 빌드 · 재시작
```

- **CI**(`.github/workflows/ci.yml`)는 모든 브랜치의 push · PR에서 돈다. 결과는 GitHub 커밋 옆 ✅/❌와 실패 메일로 보인다.
  서버는 main 커밋의 `test` 작업이 성공일 때만 배포한다 — 진행 중이면 기다리고(로그에 "CI 대기" 한 줄), 실패면 그 커밋은 건너뛴다.
  `--force`는 CI를 보지 않는다. CI를 끄려면 deploy.env에 `DEPLOY_CI_CHECK=`.

- 서버가 GitHub에서 **받아 가는** 방식이다. 저장소가 공개라 서버에 GitHub 인증이 필요 없고,
  GitHub에도 서버 접속 정보(SSH 키 등)를 두지 않는다.
- 새 커밋이 없으면 스크립트는 `git fetch` 한 번만 하고 끝난다(1분마다 돌아도 부담이 없다).
- 서버에서는 코드를 고치지 않는다. 서버에 커밋되지 않은 수정이 있으면 스크립트가 **지우지 않고 멈춘다**.

## 처음 한 번 — 서버에서

서버 관리자가 서버에 접속해 한 번만 한다. 아래 경로는 예시다.

```bash
# 1) 저장소 받기(이미 받아 둔 폴더가 있으면 그 폴더를 쓴다)
git clone https://github.com/Aringco/ip_card_battle_render.git ~/ip_card_battle_render
cd ~/ip_card_battle_render

# 2) 설정 — 서버가 앱을 띄우는 방식에 맞춘다(docker compose가 기본, pm2 · systemd면 command 방식)
cp deploy/deploy.env.example deploy/deploy.env
vi deploy/deploy.env

# 3) 손으로 한 번 돌려 본다(커밋이 같아도 빌드 · 재시작)
bash deploy/deploy.sh --force

# 4) cron 등록 — 1분마다
( crontab -l 2>/dev/null; echo "* * * * * cd $HOME/ip_card_battle_render && bash deploy/deploy.sh >> deploy/deploy.log 2>&1" ) | crontab -
```

필요한 것: `git` · `curl` · `flock`(util-linux) · docker 방식이면 `docker compose`(v2). cron을 돌리는 사용자가
docker를 쓸 수 있어야 한다(`docker` 그룹).

nginx는 그대로 둔다 — 앱이 같은 포트(기본 3000)로 다시 뜨므로 nginx 설정은 바뀌지 않는다. **WebSocket(`/ws`)
업그레이드 헤더가 nginx에 이미 있어야 한다**(지금 test.tupd.site의 `/ws`가 101로 응답하므로 되어 있다).

## 평소

| 하고 싶은 것 | 방법 |
|---|---|
| 배포 | 로컬에서 `git push origin main` — 1~2분 뒤 + 빌드 시간 |
| 지금 서버가 어느 커밋인지 | 브라우저에서 `https://test.tupd.site/version`(`{"commit": …, "startedAt": …}` — 어디서나 확인) · 서버의 `deploy/.state/deployed` |
| 배포 기록 · 실패 원인 | 서버의 `deploy/deploy.log` |
| 실패한 커밋을 다시 시도 | 새 커밋을 push하거나, 서버에서 `bash deploy/deploy.sh --force` |
| 잠시 자동 배포를 멈춤 | 서버에서 `crontab -e`로 그 줄을 주석 처리 |
| 테스트 컨테이너에 환경변수(예: 탐색 봇 `AI_BOT=on`) | 서버의 `deploy/test.env`(커밋하지 않음 — `KEY=값` 한 줄씩) → 다음 배포부터 적용. 변수 목록은 `docs/AI_ROADMAP.md` §3-1 |
| 테스트 컨테이너 CPU 상한 | 기본 2코어(`deploy-test.sh`의 `--cpus`) — 운영과 같은 기계라서. 바꾸려면 `TEST_CPUS=4 ./deploy/deploy-test.sh` |

실패하면(빌드 오류 · 재시작 후 첫 화면이 3분 안에 200이 아님) 그 커밋은 **새 커밋이 올 때까지 다시 시도하지
않는다** — 1분마다 같은 빌드를 되풀이하지 않게. docker 방식은 이미지를 다 만든 뒤에 컨테이너를 갈아 끼우므로
빌드가 실패해도 옛 버전이 계속 돈다.
