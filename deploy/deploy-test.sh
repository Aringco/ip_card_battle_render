#!/bin/sh
# 테스트 서버(test.tupd.site) 배포 — 지금 소스로 card-battle-nginx:test를 빌드하고 card-battle-test를 다시 띄운다.
#   ./deploy/deploy-test.sh
# 운영(card-battle)은 건드리지 않는다. 운영 nginx가 test.tupd.site를 이 컨테이너(Docker 네트워크 tupd)로 넘긴다.
# 같은 공유기 안에서는 http://<서버 IP>:3100 으로도 바로 열린다.
set -e
cd "$(dirname "$0")/.."
docker network inspect tupd >/dev/null 2>&1 || docker network create tupd
# 이 소스의 커밋을 이미지에 적는다 — https://test.tupd.site/version 이 돌려준다
docker build -f Dockerfile.nginx -t card-battle-nginx:test \
  --build-arg GIT_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)" .
docker rm -f card-battle-test >/dev/null 2>&1 || true
# 테스트는 운영(card-battle)과 같은 기계다 — 테스트 쪽 탐색 봇 · 부하 시험이 운영 CPU를 잡아먹지 않게 상한을 둔다(TEST_CPUS, 기본 2).
# 앱 환경변수(AI_BOT · AI_WORKERS 등 — server/ai/pool.ts)는 서버에만 두는 deploy/test.env에 적는다(없으면 기본값 = 탐색 봇 끔).
#   ⚠️ --cpus 상한은 컨테이너 안에서 코어 수로 보이지 않으므로, 탐색 봇을 켤 때는 AI_WORKERS를 TEST_CPUS보다 작게 직접 적는다.
ENV_FILE_ARGS=""
[ -f deploy/test.env ] && ENV_FILE_ARGS="--env-file deploy/test.env"
# shellcheck disable=SC2086
docker run -d --name card-battle-test --network tupd -p 3100:3000 \
  --cpus "${TEST_CPUS:-2}" $ENV_FILE_ARGS \
  --restart unless-stopped card-battle-nginx:test
echo "테스트 서버 기동 — https://test.tupd.site (내부 http://localhost:3100)"
echo "운영에 올리기: ./deploy/promote.sh"
