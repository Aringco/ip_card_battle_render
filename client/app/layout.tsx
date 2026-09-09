import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import { SoundToggle } from "@/components/ui/SoundToggle";
import "./globals.css";

/**
 * 게임 전체의 기본 글꼴 — Cafe24 Ssurround. **한글·영문·숫자를 모두 이 글꼴로 그린다.**
 *
 * 한때 영문만 Comic Relief로 갈라 쓴 적이 있다(2026-09-08 밤 ~ 09-09). 되돌린 이유는
 * 그쪽 영문이 이 글꼴의 영문보다 눈에 띄게 얇아, 같은 줄에 한글과 섞이면 굵기가
 * 어긋나 보였기 때문이다. Cafe24 Ssurround는 라틴 글리프도 같은 둥근 톤으로 갖고 있어
 * 한 벌로 쓰는 편이 화면이 고르다.
 *
 * **받은 네 확장자 중 `woff2`를 쓴다.** 넷 다 같은 글꼴이지만 용량이 열 배 가까이 차이 난다:
 *   ttf 3.8MB · otf 1.6MB · woff 906KB · **woff2 392KB**
 * woff2는 웹 전용 압축(Brotli)이 들어간 형식이고, 이 게임이 지원하는 모든 브라우저가 읽는다.
 * 한글 글꼴은 글자 수가 많아 원본이 무거우므로, 첫 접속 대기시간에 그대로 얹히는 이 차이가 크다.
 * woff를 뒤에 하나 더 둔 이유는 woff2를 못 읽는 아주 오래된 브라우저용 보험이다 —
 * 그런 브라우저에서만 내려받으므로 평소에는 비용이 0이다.
 *
 * `next/font/local`을 쓰면 Next가 `<link rel="preload">`를 직접 넣고 해시 파일명으로
 * 캐시를 잡아준다. `@font-face`를 손으로 적는 것보다 **글꼴이 늦게 도착해 글자가 한 번
 * 튀는 현상(FOUT)이 눈에 덜 띈다.** `adjustFontFallback`이 대체 글꼴의 크기를 맞춰
 * 글꼴이 바뀌는 순간의 레이아웃 밀림도 줄인다.
 */
const cafe24 = localFont({
  src: [
    { path: "../public/fonts/Cafe24Ssurround-v2.0/webfont/Cafe24Ssurround-v2.0.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/Cafe24Ssurround-v2.0/webfont/Cafe24Ssurround-v2.0.woff",  weight: "400", style: "normal" },
  ],
  variable: "--font-cafe24",
  display: "swap",
  // 이 글꼴은 굵기가 한 종류뿐이다. font-weight: bold를 만나면 브라우저가 획을 억지로
  // 불려 그리는데(합성 볼드), 둥근 글꼴에서는 그게 오히려 게임 UI에 어울린다 —
  // 그래서 막지 않고 그대로 둔다.
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: '한국특허정보원 카드배틀',
  description: '🐑🐰🧜‍♀️🐯 실용신양·상표토끼·디자인어·특허랑이 팀 대전 카드 게임',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning은 아래 인라인 스크립트 때문에 반드시 필요하다 — 그 스크립트가
    // 하이드레이션 전에 <html>에 style="--font-scale:…"을 심는데, 서버가 그린 HTML에는 그
    // 속성이 없다(저장된 값은 localStorage에만 있으므로 서버가 미리 알 수 없다). React는 이
    // 차이를 mismatch로 보고 경고하지만, 여기서는 의도된 차이다. 이 속성 하나에만 적용되고
    // 자식 트리의 하이드레이션 검사는 그대로 유지된다.
    <html
      lang="en"
      className={`${cafe24.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/* 저장된 글씨 크기를 첫 페인트 전에 적용한다 — React가 붙은 뒤에 적용하면
            기본 크기로 한 번 그려졌다가 바뀌는 깜빡임이 보인다.
            배열과 기본값(4)은 lib/uiSettings.ts의 FONT_SCALE_STEPS/DEFAULT_FONT_STEP과
            같아야 한다 — 이 파일은 순수 문자열이라 그쪽 상수를 import해서 쓸 수 없다. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=[0.85,0.92,1,1.12,1.25,1.4,1.55][(+localStorage.getItem('cardBattle_fontStep')||4)-1];if(s)document.documentElement.style.setProperty('--font-scale',s)}catch(e){}`,
          }}
        />
        {children}
        <SoundToggle />
      </body>
    </html>
  );
}
