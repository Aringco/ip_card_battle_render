# ─────────────────────────────────────────────────────────────
# 한국특허정보원 카드배틀 (ip_card_battle) — 단일 이미지 / 단일 포트
#   Next.js 클라이언트 + WebSocket 게임 서버를 같은 HTTP 서버, 같은 포트
#   ($PORT, 기본 3000)에 함께 띄운다 (루트 server.ts, Next.js 커스텀 서버).
#   WS는 같은 호스트의 /ws 경로로 붙는다 (예: ws://localhost:3000/ws).
#
#   Render처럼 서비스당 포트를 하나만 외부로 공개하는 플랫폼을 염두에 둔
#   구조다 — 브라우저가 WS 서버에 "직접" 접속하는 아키텍처라, 포트를
#   따로 두면 그 포트가 인터넷에 공개되지 않는 한 게임이 아예 접속되지
#   않는다.
#
# 빌드 : docker build -t ip-card-battle .
# 실행 : docker run -p 3000:3000 ip-card-battle
#
# 외부(다른 PC/도메인/Render)에서 접속할 경우 클라이언트가 바라볼 WS 주소를
# 빌드 시점에 넣어야 합니다 (Next.js NEXT_PUBLIC_* 변수는 빌드 시 고정):
#   docker build --build-arg NEXT_PUBLIC_WS_URL=wss://<호스트>/ws -t ip-card-battle .
# ─────────────────────────────────────────────────────────────

########## 1) 의존성 설치 ##########
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json  client/
COPY server/package.json  server/
COPY shared/package.json  shared/
RUN npm ci --no-audit --no-fund

########## 2) 클라이언트 빌드 ##########
FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_WS_URL=ws://localhost:3000/ws
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=client

########## 3) 런타임 ##########
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# 소스 + 의존성 (서버는 ts-node로 shared/*.ts 를 직접 참조하므로 소스 그대로 사용)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/tsconfig.json ./
COPY --from=build /app/server.ts ./
COPY --from=build /app/shared ./shared
COPY --from=build /app/server ./server
COPY --from=build /app/client/package.json    ./client/
COPY --from=build /app/client/next.config.ts  ./client/
COPY --from=build /app/client/public          ./client/public
COPY --from=build /app/client/.next           ./client/.next

# Next.js + WS 서버를 한 프로세스, 한 포트($PORT)로 함께 띄운다.
EXPOSE 3000
CMD ["npx", "ts-node", "--transpile-only", "server.ts"]
