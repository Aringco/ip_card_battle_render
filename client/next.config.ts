import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['shared'],

  // 검증용 프로덕션 빌드를 dev 서버와 **다른 폴더**에 쓸 수 있게 한다.
  //
  // 왜 필요한가 — dev 서버가 떠 있는 채로 같은 디렉터리에서 `next build`를 돌리면
  // 둘이 .next/ 를 공유한다. 이 프로젝트에서 "CSS를 고쳤는데 화면이 그대로"인 일이
  // 네 번 반복됐는데, 매번 dev 서버의 .next/dev/ 가 특정 시각에 멈춰 있었다
  // (한 번은 서버 시작 1분 뒤부터 그 뒤 모든 편집이 반영되지 않았다).
  //
  //   NEXT_DIST_DIR=.next-verify npx next build
  //   NEXT_DIST_DIR=.next-verify npx next start -p 3200
  //
  // 이렇게 하면 검증이 dev 서버의 증분 상태를 건드리지 않는다.
  distDir: process.env.NEXT_DIST_DIR || '.next',

  // 프리로드로 받아둔 에셋을 새로고침·재접속 때마다 다시 받지 않도록 캐시를 허용한다.
  // 파일명에 해시가 없어(이미지 교체 이력이 있다) 영구 캐시는 위험하므로 하루로 둔다.
  async headers() {
    return [
      {
        source: '/:dir(places|skills|emoticon|howto|sounds)/:file*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400' }],
      },
    ];
  },
};

export default nextConfig;
