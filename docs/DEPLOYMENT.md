# 배포 · 운영 가이드 (Docker + nginx + HTTPS)

카드배틀을 **컨테이너 하나**로 띄워 운영하는 방법이다. 이미지 정의는 루트의 `Dockerfile.nginx`.

> 루트의 `Dockerfile`은 nginx 없이 `server.ts` 한 프로세스만 띄우는 이미지다(로컬 확인용).
> 운영(tupd.site) · 테스트(test.tupd.site)는 이 문서대로 자체 서버에 올린다.

---

## 1. 구성

```
              공유기(포트포워딩)          컨테이너 card-battle
브라우저 ─▶ :80  ─▶ 호스트 :80   ─┐
         ─▶ :443 ─▶ 호스트 :443  ─┼─▶ nginx ─┬─ /ws ─▶ 127.0.0.1:8080  WS 게임 서버 (server/index.ts, ts-node)
            (:3000 ─▶ 호스트 :3000)┘  (:3000 HTTP │      
                                      :443 HTTPS)└─ /   ─▶ 127.0.0.1:3001  Next.js 클라이언트 (next start)
```

- 컨테이너 안 nginx는 **3000(HTTP)** 과 **443(HTTPS)** 을 받는다. 호스트 80 · 3000 → 컨테이너 3000, 호스트 443 → 컨테이너 443.
- 8080 · 3001은 컨테이너 안에서만 쓴다.
- 클라이언트는 WS 주소를 "지금 페이지와 같은 호스트의 `/ws`"로 스스로 잡는다(`client/hooks/useWebSocket.ts`의 `resolveWsUrl`).
  https로 열리면 `wss://`로 붙는다 — **도메인 · IP를 빌드에 넣지 않는다**(`NEXT_PUBLIC_WS_URL`은 비워 둔다).
- 컨테이너가 시작할 때 `gen-nginx-conf`가 nginx 설정을 만든다. **`DOMAIN`의 인증서가 있을 때만 443을 켜고**, 없으면 HTTP만 켠다
  (그래서 인증서를 받기 전에도 컨테이너가 뜬다).
- `start.sh`가 세 프로세스(WS 서버 · Next.js · nginx)를 띄운다. **하나라도 죽으면 컨테이너가 종료**되고
  `--restart unless-stopped`가 다시 띄운다.
- 베이스 이미지: 빌드는 `node:22-alpine`, 런타임은 `nginx:1.27-alpine` + 같은 node 바이너리. 인증서는 `certbot/certbot`.

### 호스트의 파일 (`/home/ch_user/card-battle/`)

| 경로 | 내용 |
|---|---|
| `letsencrypt/` | Let's Encrypt 인증서 · 계정(컨테이너에 `/etc/letsencrypt`로 읽기 전용 마운트). **백업 대상** |
| `certbot-www/` | 인증서 발급 · 갱신 때 확인 파일을 두는 곳(`http://<도메인>/.well-known/acme-challenge/`로 공개) |
| `cert-renew.sh` | 인증서 발급 · 갱신 + nginx reload 스크립트 (크론에서 매시간). 도메인 tupd.site · www · test 한 장 |
| `gen-nginx-conf` | 운영 컨테이너에 붙이는 nginx 설정 생성기 — `deploy/promote.sh`가 `deploy/gen-nginx-conf`에서 복사한다 |
| `cert-renew.log` | 위 스크립트의 기록 |

## 2. 처음 배포하기

```bash
# 0) 서버에 Docker가 있어야 한다 (docker --version)
git clone <저장소> && cd tupd_card

# 1) 베이스 이미지 받기
docker pull node:22-alpine
docker pull nginx:1.27-alpine
docker pull certbot/certbot

# 2) 이미지 빌드 (의존성 설치 + Next 빌드, 수 분)
docker build -f Dockerfile.nginx -t card-battle-nginx .

# 3) 호스트 폴더
mkdir -p /home/ch_user/card-battle/letsencrypt /home/ch_user/card-battle/certbot-www

# 4) 컨테이너 실행 (아직 인증서가 없으면 HTTP만 켜진다)
docker run -d --name card-battle \
  -p 80:3000 -p 3000:3000 -p 443:443 \
  -e DOMAIN=tupd.site -e HTTPS_REDIRECT=1 \
  -v /home/ch_user/card-battle/letsencrypt:/etc/letsencrypt:ro \
  -v /home/ch_user/card-battle/certbot-www:/var/www/certbot:ro \
  --restart unless-stopped \
  card-battle-nginx

# 5) 인증서 받기 → 받으면 스크립트가 nginx를 reload해 HTTPS가 켜진다(재시작 없음)
/home/ch_user/card-battle/cert-renew.sh

# 6) 확인
docker ps --filter name=card-battle          # (healthy)면 정상 — 시작 후 약 40초 안에 바뀐다
docker logs card-battle | grep 'nginx\]'     # "HTTPS 켜짐 — tupd.site" 이어야 한다
curl -I https://tupd.site/                 # HTTP/2 200
```

### 컨테이너 환경변수

| 이름 | 뜻 |
|---|---|
| `DOMAIN` | 인증서 도메인. 비우면 HTTP만 |
| `HTTPS_REDIRECT` | `1`이면 인증서가 있을 때 HTTP 요청을 `https://`로 보낸다(301). **공유기의 443 포워딩이 되기 전에는 `0`** — 안 그러면 밖에서 접속하는 사람이 열리지 않는 443으로 보내진다 |

`/.well-known/acme-challenge/`(인증서 갱신)와 `/healthz`(헬스체크)는 이동 없이 HTTP로 응답한다.

### 공유기 포트포워딩

이 서버는 공유기 안쪽(192.168.0.3)에 있다. 공유기에 아래가 있어야 밖에서 열린다(**TCP**만 — UDP는 쓰지 않는다).

| 외부 | 내부 | 용도 |
|---|---|---|
| 80 | 192.168.0.3 : 80 | `http://tupd.site`, **인증서 발급 · 갱신(필수)** |
| 443 | 192.168.0.3 : 443 | `https://tupd.site` |
| 3000 | 192.168.0.3 : 3000 | 옛 주소 `:3000` (안 쓰면 생략) |

서버 IP가 바뀌지 않도록 공유기에서 192.168.0.3을 **고정 할당(DHCP 예약)** 해 둔다. 공유기의 "원격 관리"가 80/443을 쓰고 있으면 끄거나 포트를 옮긴다.

## 3. HTTPS 인증서

- 발급처: **Let's Encrypt**(무료, 90일짜리). 방식: webroot — certbot이 `certbot-www/`에 확인 파일을 두면 Let's Encrypt가 `http://tupd.site/.well-known/acme-challenge/…`(80번)로 와서 읽는다. 그래서 **80번 포워딩은 HTTPS를 써도 지우면 안 된다.**
- `cert-renew.sh`는 인증서가 없으면 받고, 있으면 **만료 30일 전부터** 갱신한다(그 전에는 아무 일도 안 한다). 새로 받거나 갱신하면 `gen-nginx-conf && nginx -s reload`로 반영한다 — **방이 끊기지 않는다.**
- 이메일은 등록하지 않았다(`--register-unsafely-without-email`) — 만료 안내 메일이 오지 않으니 크론이 도는지는 로그로 확인한다.

### 자동 갱신 걸기 (한 번만, 직접)

```bash
crontab -e
# 아래 한 줄을 넣는다 — 매시간 17분
17 * * * * /home/ch_user/card-battle/cert-renew.sh >> /home/ch_user/card-battle/cert-renew.log 2>&1
```

확인: `crontab -l` · `tail /home/ch_user/card-battle/cert-renew.log` (실패할 때와 받았을 때만 한 줄씩 남는다).
지금 상태 보기: `docker run --rm -v /home/ch_user/card-battle/letsencrypt:/etc/letsencrypt certbot/certbot certificates`

### (지난 일) `kro.kr`의 발급 한도 — 2026-11-03에 개인 도메인 `tupd.site`(가비아)로 옮기며 해결

`kro.kr`은 여러 사람이 나눠 쓰는 무료 도메인이라, Let's Encrypt의 **"등록 도메인당 7일에 50장"** 한도를 `kro.kr` 전체가 함께 쓴다.
한도가 차 있으면 `too many certificates (50) already issued for "kro.kr"` 로 실패한다 — 크론이 매시간 다시 시도하므로 자리가 나는 대로 받아진다.
(2026-11-01 첫 시도 때 이 한도에 걸렸다.) 갱신은 같은 인증서의 갱신이라 이 한도에 거의 걸리지 않는다. 계속 막히면 자기 도메인을 사서 쓰는 것이 근본 해결이다.

## 4. 모바일 전체화면 · 홈 화면 앱

폰 브라우저의 주소창 · 북마크 바가 화면을 가리지 않게 두 가지가 들어 있다.

0. **보이는 높이에 맞추기** (`--app-h`) — 폰 브라우저의 `100vh`는 "바가 숨었을 때" 높이라, 문서 스크롤을 잠근 이 게임에서는
   화면 아래가 하단 바(네이버 앱 등) 밑으로 들어갔다. 로비 · 게임 화면의 높이는 이제 `window.innerHeight`를 잰 `--app-h`를 쓴다
   (`layout.tsx`의 인라인 스크립트 + `lib/fullscreen.ts`의 `syncAppHeight`). 데스크톱은 값이 같아 화면이 그대로다(픽셀 비교로 확인).
1. **첫 터치 때 전체화면** (`client/components/ui/FullscreenManager.tsx`) — 브라우저는 사용자 동작 없이 전체화면을 허락하지 않으므로
   접속 즉시가 아니라 첫 터치 때 바꾼다. 안드로이드(크롬 · 삼성 인터넷 · 웨일)는 되고, **아이폰 사파리는 불가**(애플이 동영상만 허용).
   사용자가 뒤로가기 · 쓸어올리기로 빠져나오면 다시 강요하지 않는다 — 설정(톱니) 맨 위의 **[⛶ 전체화면 + 가로 보기]** 버튼으로 다시 켠다.
   이 버튼은 켜는 김에 **화면을 가로로 돌려 고정**한다(안드로이드만 — `screen.orientation.lock`, 전체화면에서만 허락된다. 빠져나오면 풀린다).
   PC에서는 첫 터치 자동 전환을 하지 않는다(설정 버튼은 PC에서도 쓸 수 있다).
   - **네이버 · 카카오톡 등 앱 안 브라우저**는 위 · 아래 바가 모두 남고 전체화면도 대개 막는다. 거절되면 안내가 한 번 뜨고,
     안드로이드에서는 **[크롬으로 열기]**(intent 주소)로 넘겨 준다. 설정의 버튼을 눌러 실패해도 같은 대안이 보인다.
2. **홈 화면에 추가** (`client/app/manifest.ts` · `layout.tsx`의 `appleWebApp`) — 홈 화면 아이콘으로 열면 주소창 없이 앱처럼 뜬다.
   - 아이폰: 사파리 아래 **공유 → 홈 화면에 추가** (아이폰 사파리에서는 이 안내가 처음 한 번 위에 뜬다)
   - 안드로이드: 크롬 메뉴 **⋮ → 홈 화면에 추가 / 앱 설치**
   - **HTTPS로 접속해서 추가해야** 안드로이드가 주소창 없는 앱으로 설치한다(http로 추가하면 바로가기라 주소창이 남는다).
     https가 켜진 뒤에는 기존 바로가기를 지우고 `https://tupd.site`에서 다시 추가할 것.
   - 아이콘은 `client/scripts/makeAppIcons.mjs`가 만든다(네 동물 얼굴 2×2). 바꾸려면 스크립트를 고쳐 다시 돌리고 이미지를 다시 빌드한다.

## 5. 업데이트(재배포) — 테스트 서버를 거쳐 운영으로 (2026-11-07)

```
브라우저 ─ 80/443 ─▶ card-battle(운영 nginx, Docker 네트워크 tupd)
                       ├─ tupd.site · www.tupd.site ─▶ 운영 게임(같은 컨테이너 안)
                       └─ test.tupd.site ───────────▶ card-battle-test:3000 (호스트 3100으로도 열림)
```

```bash
cd tupd_card && git pull
./deploy/deploy-test.sh      # 지금 소스 → card-battle-nginx:test → card-battle-test 재기동 (운영은 그대로)
#   https://test.tupd.site 에서 확인
./deploy/promote.sh          # 확인한 :test 를 다시 빌드하지 않고 운영으로 (지금 운영은 :prev-<날짜시각>으로 보관)
./deploy/promote.sh pre-acorn2   # 되돌리기 — 보관한 태그 아무거나 (docker images card-battle-nginx)
docker image prune -f        # 이름 잃은 옛 이미지 정리
```

- 운영 nginx가 `TEST_DOMAIN=test.tupd.site`로 온 요청을 테스트 컨테이너로 넘긴다(`deploy/gen-nginx-conf`). 테스트가 꺼져 있으면 test만 502이고 운영은 그대로다.
- 운영 컨테이너는 그 생성기의 **호스트 사본**(`/home/ch_user/card-battle/gen-nginx-conf`)을 붙인다 — 생성기가 없던 옛 이미지로 되돌려도 test.tupd.site가 살아 있다.
- 운영 반영은 여전히 운영 컨테이너를 다시 만드는 일이라 그 순간 열린 방이 사라진다. 테스트 재배포는 운영에 영향이 없다.
- 홈 화면 앱 이름은 요청 주소로 가른다 — `test.`로 열면 `TUPD-test`(안드로이드 `app/manifest.ts` · iOS `FullscreenManager`), 그래서 같은 이미지를 올려도 운영은 `TUPD`다.

⚠️ **방 · 진행 중인 게임은 서버 메모리에만 있다.** 컨테이너를 내리면(재배포 · 재시작 · 서버 재부팅)
모든 방이 사라지고 접속 중인 사람은 "방을 찾을 수 없습니다"를 보게 된다. 사람이 적은 시간에 재배포할 것.
`HTTPS_REDIRECT` 같은 환경변수를 바꿀 때도 컨테이너를 다시 만들어야 한다.

## 6. 일상 운영

| 하고 싶은 것 | 명령 |
|---|---|
| 상태 · 헬스 | `docker ps --filter name=card-battle` · `docker inspect --format '{{.State.Health.Status}}' card-battle` |
| 로그 보기 | `docker logs -f --tail 200 card-battle` (nginx 접근 로그 · Next.js · WS 서버가 한 줄기로 나온다) |
| HTTPS 켜졌는지 | `docker logs card-battle 2>&1 \| grep 'nginx\]'` |
| 지금 nginx 설정 보기 | `docker exec card-battle cat /etc/nginx/conf.d/card-battle.conf` |
| nginx 설정 다시 만들기(방 유지) | `docker exec card-battle sh -c 'gen-nginx-conf && nginx -s reload'` |
| nginx 설정 문법 검사 | `docker exec card-battle nginx -t` |
| 인증서 갱신 지금 해 보기 | `/home/ch_user/card-battle/cert-renew.sh; tail -3 /home/ch_user/card-battle/cert-renew.log` |
| 재시작 | `docker restart card-battle` (2초 안팎. 방은 모두 사라진다) |
| 중지 / 시작 | `docker stop card-battle` / `docker start card-battle` |
| 자원 사용량 | `docker stats card-battle` |
| 컨테이너 안 들어가기 | `docker exec -it card-battle sh` |

**로그 크기 제한** — Docker 기본 로그는 끝없이 커진다. `/etc/docker/daemon.json`에 넣고 Docker를 재시작한다:

```json
{ "log-driver": "json-file", "log-opts": { "max-size": "20m", "max-file": "5" } }
```

(이미 떠 있는 컨테이너에는 다시 만들 때부터 적용된다.)

**자동 재시작** — `--restart unless-stopped`이므로 프로세스가 죽거나 서버가 재부팅돼도 다시 뜬다
(재부팅 후에는 Docker 서비스가 자동 시작되도록 `systemctl enable docker`).

**백업** — `/home/ch_user/card-battle/letsencrypt/`(인증서 · 계정). 게임 상태는 메모리라 백업할 것이 없다(DB를 쓰지 않는다).

## 7. 문제 해결

| 증상 | 원인 · 조치 |
|---|---|
| `https://`가 밖에서 안 열림 | ① 공유기의 443 포워딩 ② `docker logs card-battle \| grep 'nginx\]'`가 "인증서가 없어 HTTP만"이면 아직 인증서가 없다(3절) ③ 통신사가 가정용 회선의 80/443 수신을 막는 경우도 있다 |
| http로 들어가면 열리지 않는 https로 튕김 | 443 포워딩이 안 된 채로 `HTTPS_REDIRECT=1` — 포워딩을 넣거나 `HTTPS_REDIRECT=0`으로 컨테이너를 다시 만든다 |
| 인증서 발급 실패 `too many certificates …` | Let's Encrypt 한도(3절). 크론이 다시 시도한다 |
| 인증서 발급 실패 `Timeout during connect` · `unauthorized` | Let's Encrypt가 80번으로 못 들어옴 — 80 포워딩 · `http://tupd.site/.well-known/acme-challenge/` 경로가 밖에서 열리는지 |
| 화면은 뜨는데 방이 안 만들어짐 | WS가 막힘. ① 빌드 때 `NEXT_PUBLIC_WS_URL`을 넣지 않았는지(넣었다면 빼고 다시 빌드) ② `docker logs`에 `WebSocket 서버 시작` 줄이 있는지 |
| 컨테이너가 계속 재시작됨 | `docker logs card-battle`에서 `[start.sh] 프로세스 하나가 멈췄습니다` 바로 위의 에러를 본다 |
| `port is already allocated` | 호스트 80/443/3000을 다른 것(호스트 nginx · apache 등)이 쓰는 중 — 그것을 끄거나 바깥 포트만 바꾼다(`-p 8000:3000`, 안쪽 포트는 그대로) |
| 포트 없는 주소만 안 열림 | 공유기 80 포워딩 · `www.` 붙인 주소는 DNS에 따로 등록해야 한다 |
| 폰에서 전체화면이 안 됨 | 아이폰은 원래 불가 — 홈 화면에 추가로 연다(4절). 안드로이드는 첫 터치 뒤에 바뀐다. 빠져나왔으면 설정의 [전체화면] |
| `unhealthy` | 시작 후 40초가 지났는데 `/healthz`나 Next.js가 응답하지 않음 — 로그에서 Next.js `Ready` 줄 확인 |

## 8. 참고

- 이미지 크기 약 1.2GB(압축 345MB). ts-node로 서버 소스를 그대로 실행하느라 개발 의존성까지 들어 있다 —
  줄이려면 서버를 `tsc`로 컴파일하고 `npm ci --omit=dev`로 런타임 의존성만 담는 단계를 더하면 된다.
- nginx 설정 생성기는 `deploy/gen-nginx-conf`, 프록시 규칙 · 시작 스크립트는 `Dockerfile.nginx` 안의 `COPY <<'EOF'` 블록들(`card-battle-proxy.conf` · `start.sh`)에 있다. 생성기만 고쳤으면 `./deploy/promote.sh latest`로 운영에 반영된다(방은 사라진다).
- 전부 걷어내기: `docker rm -f card-battle card-battle-test && docker rmi card-battle-nginx && docker network rm tupd`
