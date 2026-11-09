#!/bin/sh
# 운영 반영 — 이미지를 다시 빌드하지 않고 태그만 옮겨 운영 컨테이너를 다시 띄운다.
#   ./deploy/promote.sh            테스트에서 확인한 card-battle-nginx:test 를 운영으로
#   ./deploy/promote.sh pre-acorn2 보관해 둔 태그로 되돌리기(docker images card-battle-nginx)
# 지금 운영 이미지는 card-battle-nginx:prev-<날짜시각>으로 보관한다.
# ⚠️ 운영 컨테이너를 다시 만드므로 그 순간 열린 방이 모두 사라진다.
set -e
cd "$(dirname "$0")/.."
TAG="${1:-test}"
BASE=/home/ch_user/card-battle
ENV_FILE=/etc/card-battle.env

docker image inspect "card-battle-nginx:$TAG" >/dev/null
docker network inspect tupd >/dev/null 2>&1 || docker network create tupd

# 운영 nginx 설정 생성기는 호스트 사본을 붙인다 — 이 파일이 없던 옛 이미지로 되돌려도 test.tupd.site가 산다
install -m 755 deploy/gen-nginx-conf "$BASE/gen-nginx-conf"

if docker image inspect card-battle-nginx:latest >/dev/null 2>&1; then
  docker tag card-battle-nginx:latest "card-battle-nginx:prev-$(date +%Y%m%d-%H%M)"
fi
docker tag "card-battle-nginx:$TAG" card-battle-nginx:latest

docker rm -f card-battle >/dev/null 2>&1 || true
set -- -d --name card-battle --network tupd \
  -p 80:3000 -p 3000:3000 -p 443:443 \
  -e DOMAIN=tupd.site -e HTTPS_REDIRECT=1 -e TEST_DOMAIN=test.tupd.site \
  -v "$BASE/letsencrypt:/etc/letsencrypt:ro" \
  -v "$BASE/certbot-www:/var/www/certbot:ro" \
  -v "$BASE/gen-nginx-conf:/usr/local/bin/gen-nginx-conf:ro"
[ -f "$ENV_FILE" ] && set -- "$@" --env-file "$ENV_FILE"
docker run "$@" --restart unless-stopped card-battle-nginx:latest
echo "운영 반영 — card-battle-nginx:$TAG → latest (되돌리기: ./deploy/promote.sh prev-…)"
