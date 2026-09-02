import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['shared'],

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
