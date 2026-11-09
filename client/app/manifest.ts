import type { MetadataRoute } from 'next';
import { headers } from 'next/headers';

/**
 * 웹 앱 매니페스트 — "홈 화면에 추가"로 깔면 주소창 · 북마크 바 없이 앱처럼 열린다.
 *
 * - `display: 'fullscreen'` — 안드로이드는 상단 알림바까지 숨긴다. iOS는 fullscreen을 모르고
 *   standalone으로 열리는데 그래도 사파리 바는 없다(layout.tsx의 appleWebApp이 iOS 쪽을 맡는다).
 * - 방향은 고정하지 않는다 — 플레이는 가로지만 로비 · 대기실에는 세로 배치가 따로 있다.
 * - 아이콘은 `scripts/makeAppIcons.mjs`가 만든다.
 * - 테스트 서버(test.tupd.site)에서 깔면 'TUPD-test'로 따로 깔린다 — 같은 이미지를 운영으로 올리므로 빌드가 아니라
 *   요청 주소로 가른다(headers()를 읽어 이 매니페스트는 요청마다 만든다). iOS 이름은 FullscreenManager가 맡는다.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const name = ((await headers()).get('host') ?? '').startsWith('test.') ? 'TUPD-test' : 'TUPD';
  return {
    name,
    short_name: name,
    description: '실용신양 · 상표토끼 · 디자인어 · 특허랑이 카드 대전 게임',
    start_url: '/',
    scope: '/',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    // 설치 앱이 켜질 때의 바탕 — 아이콘 바탕(로고의 짙은 녹색)과 같은 색
    background_color: '#14361f',
    theme_color: '#2e1d10',
    lang: 'ko',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
