# 테스트 서버(test.tupd.site) 구성안

2026-11-06 검토 · **2026-11-07 구현**(`deploy/` — 절차는 `DEPLOYMENT.md` 5절). 아래는 설계 기록이다.

구현하며 바뀐 것: 운영 nginx는 테스트 주소를 변수 + `resolver 127.0.0.11`로 넘긴다(이름을 그대로 쓰면 테스트가 꺼져 있을 때 운영 nginx가 안 뜬다). 운영 컨테이너는 생성기의 호스트 사본을 붙여 옛 이미지로 되돌려도 테스트 도메인이 산다.

## 목표

- `https://test.tupd.site` → 테스트 서버(새 기능을 먼저 올려 확인)
- `https://tupd.site` · `https://www.tupd.site` → 지금 운영 서버 그대로
- 테스트에서 확인한 **그 이미지**를 다시 빌드하지 않고 운영에 올린다

## 지금 상태(2026-11-06 확인)

- DNS: `test.tupd.site` → 125.138.83.170(운영과 같은 IP) — 이미 등록돼 있다.
- 이 서버의 80 · 443은 운영 컨테이너 `card-battle`이 쓴다(공유기도 80 · 443 · 3000만 넘긴다). 그래서 지금 test.tupd.site로 오면 운영에 닿는다:
  - http → `https://tupd.site`로 이동(운영 화면)
  - https → 인증서 오류(인증서가 `tupd.site` · `www.tupd.site`만 담고 있다)

## 구조(권장 — 도메인 이름으로 나누기)

```
브라우저 ─ 80/443 ─▶ card-battle(운영 컨테이너의 nginx)
                       ├─ tupd.site · www.tupd.site ─▶ 운영 게임(같은 컨테이너 안)
                       └─ test.tupd.site ───────────▶ card-battle-test:3000 (Docker 네트워크 tupd)
                                                       (호스트 3100으로도 열어 둔다 — 같은 공유기 안에서 직접 확인용)
```

- 테스트 컨테이너는 같은 이미지(`card-battle-nginx:test`)를 HTTP만으로(DOMAIN 비움) 띄운다.
- 두 컨테이너를 사용자 정의 네트워크 `tupd`에 붙이면 운영 nginx가 이름(`card-battle-test`)으로 찾는다. 테스트 컨테이너가 꺼져 있으면 test.tupd.site만 502이고 운영에는 영향이 없다.
- WebSocket(`/ws`)도 같은 프록시 설정(`card-battle-proxy.conf`)으로 넘긴다.

## 해야 할 일(한 번)

1. `Dockerfile.nginx`의 `gen-nginx-conf`에 `TEST_DOMAIN` · `TEST_UPSTREAM` 환경변수를 받아 server 블록을 하나 더 만든다
   (443 `server_name test.tupd.site` → `proxy_pass http://card-battle-test:3000`, 80의 https 이동도 들어온 이름이 test면 test로).
   ⚠️ 지금 80의 이동은 언제나 `https://$DOMAIN`으로 보낸다 — test는 따로 가르지 않으면 운영으로 간다.
2. 인증서에 test.tupd.site 추가 — `cert-renew.sh`의 certbot에 `-d test.tupd.site`(webroot 확인은 운영 nginx의 80이 그대로 답한다). 받은 뒤 `gen-nginx-conf && nginx -s reload`.
3. `docker network create tupd` → 운영 컨테이너를 재빌드 · 재기동하며 `--network tupd`(**이때 열린 방이 사라진다 — 한 번**).
4. 스크립트 두 개:
   - `deploy-test.sh` — `docker build -t card-battle-nginx:test` → `card-battle-test` 재기동(`--network tupd -p 3100:3000`, 인증서 볼륨 없음)
   - `promote.sh` — 지금 운영 이미지를 `card-battle-nginx:prev-<날짜>`로 보관 → `docker tag card-battle-nginx:test card-battle-nginx:latest` → 운영 재기동(되돌리기는 prev 태그로)
5. `DEPLOYMENT.md`에 절차를 옮겨 적는다.

## 주의

- **테스트 서버에는 운영 DB(`DATABASE_URL` · `--env-file`)를 넘기지 않는다** — 테스트 판이 이벤트 순위표에 섞인다. 넘기지 않으면 기록은 메모리에만 남는다(재기동하면 사라짐). 이벤트 토큰(`EVENT_*`)도 테스트용 값을 따로 둔다.
- 운영 반영은 여전히 운영 컨테이너 재기동이라 그 순간 방이 사라진다(지금과 같다).
- 다른 방법: 포트로 나누기(`tupd.site:8443` — 공유기 포트포워딩 추가 · 주소에 포트), 앞단에 Caddy/Traefik 같은 프록시 컨테이너 따로 두기(바꿀 것이 더 많다). 둘 다 권하지 않는다.
