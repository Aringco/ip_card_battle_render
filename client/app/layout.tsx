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
        {children}
        <SoundToggle />
      </body>
    </html>
  );
}
