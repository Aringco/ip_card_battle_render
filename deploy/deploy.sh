#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# 테스트 서버(test.tupd.site) 자동 재배포 — 서버에서 돈다.
#
#   로컬에서 고친다 → GitHub main에 push → 서버의 cron이 1분마다 이 스크립트를 부른다
#   → origin/main에 새 커밋이 있으면 받아서 다시 빌드 · 재시작한다(없으면 곧바로 끝난다).
#
# 서버에서 코드를 고치지 않는다는 전제다. 그래서 받을 때는 origin/main으로 **맞춘다**(reset --hard).
# 다만 서버에 커밋되지 않은 수정이 있으면 지우지 않고 멈춘다 — 누군가 급히 고쳐 둔 것을 날리지 않게.
#
# 사용:
#   bash deploy/deploy.sh            # 새 커밋이 있을 때만 배포(cron이 부르는 형태)
#   bash deploy/deploy.sh --force    # 커밋이 같아도 다시 빌드 · 재시작
#
# 설정은 deploy/deploy.env(서버에만 두는 파일, 커밋하지 않는다 — deploy.env.example 참고).
# 처음 설치하는 법은 deploy/README.md.
# ─────────────────────────────────────────────────────────────
set -euo pipefail

# ⚠️ 본문 전체를 { … } 한 덩어리로 둔다 — bash는 스크립트를 읽어 가며 실행하는데, 아래의 git reset이
# 이 파일 자신을 새 버전으로 바꾸면 옛 위치에서 새 파일을 이어 읽어 엉뚱한 줄을 실행한다. 덩어리는 다 읽은 뒤에 돈다.
{
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"

# 기본값 — deploy.env가 덮어쓴다
DEPLOY_BRANCH=main
DEPLOY_MODE=docker                 # docker | command
DEPLOY_COMPOSE_FILE=docker-compose.yml
DEPLOY_BUILD_CMD=""                # command 모드: 빌드 명령
DEPLOY_RESTART_CMD=""              # command 모드: 재시작 명령
DEPLOY_HEALTH_URL=http://localhost:3000/
DEPLOY_HEALTH_TIMEOUT_SEC=180
DEPLOY_CI_CHECK=test               # 기다릴 CI 작업 이름(ci.yml의 jobs 키) — 비우면 CI를 보지 않는다
DEPLOY_CI_REPO="$(git remote get-url origin | sed -E 's#^.*github\.com[:/]##; s#\.git$##')"
[ -f deploy/deploy.env ] && . deploy/deploy.env

STATE_DIR="$REPO_DIR/deploy/.state"
mkdir -p "$STATE_DIR"

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }

# 한 번에 하나만 — 빌드가 1분을 넘기면 다음 cron이 겹쳐 들어온다
exec 9>"$STATE_DIR/lock"
if ! flock -n 9; then
  exit 0
fi

FORCE=0
[ "${1:-}" = "--force" ] && FORCE=1

git fetch --quiet origin "$DEPLOY_BRANCH"
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/$DEPLOY_BRANCH")"

if [ "$LOCAL" = "$REMOTE" ] && [ "$FORCE" = 0 ]; then
  exit 0
fi

# 같은 커밋에서 실패한 배포를 1분마다 되풀이하지 않는다 — 새 커밋이 오거나 --force일 때만 다시 시도
if [ "$FORCE" = 0 ] && [ -f "$STATE_DIR/failed" ] && [ "$(cat "$STATE_DIR/failed")" = "$REMOTE" ]; then
  exit 0
fi

# CI(.github/workflows/ci.yml)가 이 커밋에서 성공해야 배포한다 — 진행 중이면 다음 cron에 다시 본다, --force는 건너뛴다.
# 저장소가 공개라 인증 없이 읽는다(시간당 60회 — 새 커밋이 있을 때만 묻는다). 응답을 못 받으면 "진행 중"으로 친다.
ci_state() {
  curl -fsS -H 'Accept: application/vnd.github+json' \
    "https://api.github.com/repos/$DEPLOY_CI_REPO/commits/$1/check-runs?check_name=$DEPLOY_CI_CHECK" 2>/dev/null |
    python3 -c '
import json, sys
runs = json.load(sys.stdin).get("check_runs", [])
if not runs or any(r["status"] != "completed" for r in runs): print("pending")
elif all(r["conclusion"] in ("success", "neutral", "skipped") for r in runs): print("success")
else: print("failure")' 2>/dev/null || echo pending
}
if [ "$FORCE" = 0 ] && [ -n "$DEPLOY_CI_CHECK" ]; then
  case "$(ci_state "$REMOTE")" in
    success) ;;
    pending)
      # 기다리는 동안 1분마다 같은 줄을 남기지 않는다
      if [ "$(cat "$STATE_DIR/waiting" 2>/dev/null)" != "$REMOTE" ]; then
        log "CI 대기: ${REMOTE:0:7} — 검사가 끝나면 배포한다"
        echo "$REMOTE" > "$STATE_DIR/waiting"
      fi
      exit 0
      ;;
    *)
      log "배포 안 함: ${REMOTE:0:7}의 CI가 실패했다 — 고쳐서 새 커밋을 push하거나 --force"
      echo "$REMOTE" > "$STATE_DIR/failed"
      exit 1
      ;;
  esac
fi

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  log "중단: 서버에 커밋되지 않은 수정이 있다(지우지 않음). 'git status'로 확인 후 정리하고 --force로 다시 실행."
  echo "$REMOTE" > "$STATE_DIR/failed"
  exit 1
fi

log "배포 시작: ${LOCAL:0:7} → ${REMOTE:0:7} ($(git log -1 --format=%s "$REMOTE"))"
git checkout --quiet "$DEPLOY_BRANCH" 2>/dev/null || git checkout --quiet -B "$DEPLOY_BRANCH" "origin/$DEPLOY_BRANCH"
git reset --quiet --hard "$REMOTE"

fail() {
  log "실패: $1 — 이 커밋(${REMOTE:0:7})은 새 커밋이 올 때까지 다시 시도하지 않는다."
  echo "$REMOTE" > "$STATE_DIR/failed"
  exit 1
}

case "$DEPLOY_MODE" in
  docker)
    # 이미지를 먼저 다 만든 뒤에 컨테이너를 갈아 끼운다 — 빌드가 실패하면 옛 컨테이너가 그대로 돈다
    docker compose -f "$DEPLOY_COMPOSE_FILE" build || fail "docker 빌드"
    docker compose -f "$DEPLOY_COMPOSE_FILE" up -d || fail "docker 재시작"
    docker image prune -f >/dev/null 2>&1 || true
    ;;
  command)
    [ -n "$DEPLOY_BUILD_CMD" ] && { bash -c "$DEPLOY_BUILD_CMD" || fail "빌드"; }
    [ -n "$DEPLOY_RESTART_CMD" ] || fail "DEPLOY_RESTART_CMD가 비어 있다"
    bash -c "$DEPLOY_RESTART_CMD" || fail "재시작"
    ;;
  *)
    fail "알 수 없는 DEPLOY_MODE: $DEPLOY_MODE"
    ;;
esac

# 살아났는지 — 첫 화면이 200이면 정상
if [ -n "$DEPLOY_HEALTH_URL" ]; then
  deadline=$(( $(date +%s) + DEPLOY_HEALTH_TIMEOUT_SEC ))
  until [ "$(curl -s -o /dev/null -w '%{http_code}' "$DEPLOY_HEALTH_URL" || true)" = 200 ]; do
    [ "$(date +%s)" -ge "$deadline" ] && fail "${DEPLOY_HEALTH_TIMEOUT_SEC}초 안에 $DEPLOY_HEALTH_URL 이 200을 주지 않음"
    sleep 3
  done
fi

rm -f "$STATE_DIR/failed"
echo "$REMOTE" > "$STATE_DIR/deployed"
log "배포 완료: ${REMOTE:0:7}"
exit 0
}
