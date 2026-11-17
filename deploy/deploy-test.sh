#!/bin/sh
# 테스트 서버(test.tupd.site) 배포 — 지금 소스로 card-battle-nginx:test를 빌드하고 card-battle-test를 다시 띄운다.
#   ./deploy/deploy-test.sh
# 운영(card-battle)은 건드리지 않는다. 운영 nginx가 test.tupd.site를 이 컨테이너(Docker 네트워크 tupd)로 넘긴다.
# 같은 공유기 안에서는 http://<서버 IP>:3100 으로도 바로 열린다.
set -e
cd "$(dirname "$0")/.."
docker network inspect tupd >/dev/null 2>&1 || docker network create tupd
docker build -f Dockerfile.nginx -t card-battle-nginx:test .
docker rm -f card-battle-test >/dev/null 2>&1 || true
docker run -d --name card-battle-test --network tupd -p 3100:3000 \
  --restart unless-stopped card-battle-nginx:test
echo "테스트 서버 기동 — https://test.tupd.site (내부 http://localhost:3100)"
echo "운영에 올리기: ./deploy/promote.sh"
