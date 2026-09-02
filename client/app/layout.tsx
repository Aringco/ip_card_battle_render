import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SoundToggle } from "@/components/ui/SoundToggle";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* 저장된 글씨 크기를 첫 페인트 전에 적용한다 — React가 붙은 뒤에 적용하면
            기본 크기로 한 번 그려졌다가 바뀌는 깜빡임이 보인다.
            단계 값은 lib/uiSettings.ts의 FONT_SCALE_STEPS와 같아야 한다. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=[0.85,0.92,1,1.12,1.25,1.4,1.55][(+localStorage.getItem('cardBattle_fontStep')||5)-1];if(s)document.documentElement.style.setProperty('--font-scale',s)}catch(e){}`,
          }}
        />
        {children}
        <SoundToggle />
      </body>
    </html>
  );
}
