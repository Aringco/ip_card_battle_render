'use client';

import { useEffect, useState } from 'react';

/**
 * 전체화면(주소창 · 북마크 바 · 하단 도구 바 숨기기) 도우미.
 *
 * 브라우저는 사용자가 누르는 동작 없이 전체화면을 허락하지 않는다 — 그래서 접속하자마자가 아니라
 * **첫 터치** 때 요청하고(components/ui/FullscreenManager.tsx), 설정(톱니)에 다시 켜는 버튼을 둔다.
 *
 * 브라우저마다 다르다:
 *   - 안드로이드 크롬 · 삼성 인터넷 · 웨일: 된다.
 *   - 아이폰 사파리: 웹페이지 전체화면 자체가 없다(동영상만) → "홈 화면에 추가"(app/manifest.ts).
 *   - 네이버 · 카카오톡 등 **앱 안의 브라우저**: 앱이 허락하지 않으면 요청이 거절되고, 위아래 바가
 *     그대로 남는다 → 안드로이드는 "크롬으로 열기"(intent 주소)로 넘겨 준다.
 */

type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type FsDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

/** 이 브라우저가 페이지 전체화면 API를 갖고 있는가(아이폰 사파리는 false). 갖고 있어도 거절될 수 있다. */
export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as FsElement;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const d = document as FsDocument;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

/** 홈 화면 아이콘으로 열려 이미 브라우저 바가 없는가 */
export function isStandaloneApp(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** 손가락으로 쓰는 기기인가(PC에서는 클릭 한 번에 전체화면이 되면 오히려 방해다) */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}

function ua(): string {
  return typeof navigator === 'undefined' ? '' : navigator.userAgent;
}

/** 아이폰 · 아이팟(사파리 포함 모든 iOS 브라우저 — 전체화면 불가, 홈 화면 추가 안내 대상) */
export function isIosPhone(): boolean {
  return /iPhone|iPod/.test(ua());
}

export function isAndroid(): boolean {
  return /Android/i.test(ua());
}

/**
 * 앱 안의 브라우저 이름(네이버 앱 · 카카오톡 · 라인 · 인스타그램 · 페이스북 · 밴드) — 아니면 null.
 * 이 브라우저들은 위 주소 바 말고 **아래 도구 바**까지 있어 화면을 가장 많이 가리고, 전체화면도 대개 막는다.
 * (네이버 웨일 브라우저는 앱 안 브라우저가 아니다 — 전체화면이 된다.)
 */
export function inAppBrowserName(): string | null {
  const s = ua();
  if (/NAVER\(inapp/.test(s)) return '네이버 앱';
  if (/KAKAOTALK/i.test(s)) return '카카오톡';
  if (/\bLine\//.test(s)) return '라인';
  if (/Instagram/.test(s)) return '인스타그램';
  if (/FBAN|FBAV/.test(s)) return '페이스북';
  if (/BAND\//.test(s)) return '밴드';
  return null;
}

/** 안드로이드에서 지금 페이지를 크롬으로 여는 주소(intent). 크롬이 없으면 기본 브라우저 선택 창이 뜬다. */
export function chromeIntentUrl(): string {
  const { host, pathname, search, hash, protocol } = window.location;
  const scheme = protocol.replace(':', '');
  return `intent://${host}${pathname}${search}${hash}#Intent;scheme=${scheme};package=com.android.chrome;end`;
}

/** 반드시 사용자 동작(click · touchend) 안에서 부를 것 — 아니면 브라우저가 거절한다 */
export async function enterFullscreen(): Promise<boolean> {
  if (isFullscreen()) return true;
  const el = document.documentElement as FsElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
    else return false;
  } catch {
    return false;
  }
  // 거절을 예외 없이 "조용히 무시"하는 앱 브라우저가 있어, 실제로 바뀌었는지 한 번 더 본다
  await new Promise(r => setTimeout(r, 150));
  return isFullscreen();
}

type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void>; unlock?: () => void };

/**
 * 화면을 가로로 돌려 고정한다 — 설정의 [전체화면] 버튼이 전체화면에 들어간 직후 부른다(플레이 화면이 가로다).
 * 안드로이드 크롬 · 삼성 인터넷은 **전체화면일 때만** 허락하고, 아이폰은 이 기능이 없다(false).
 * 기기의 "자동 회전"이 꺼져 있어도 돌아간다. 전체화면을 빠져나오면 브라우저가 고정을 스스로 푼다.
 */
export async function lockLandscape(): Promise<boolean> {
  const o = (typeof screen !== 'undefined' ? screen.orientation : undefined) as LockableOrientation | undefined;
  if (!o?.lock) return false;
  try {
    await o.lock('landscape');
    return true;
  } catch {
    return false;
  }
}

export function unlockOrientation(): void {
  const o = (typeof screen !== 'undefined' ? screen.orientation : undefined) as LockableOrientation | undefined;
  try {
    o?.unlock?.();
  } catch {
    /* 고정한 적 없음 */
  }
}

export async function exitFullscreen(): Promise<void> {
  unlockOrientation();
  const d = document as FsDocument;
  try {
    if (d.exitFullscreen && d.fullscreenElement) await d.exitFullscreen();
    else if (d.webkitExitFullscreen && d.webkitFullscreenElement) await d.webkitExitFullscreen();
  } catch {
    /* 이미 빠져나온 경우 */
  }
}

/** 지금 전체화면인지 — 사용자가 뒤로가기 · 쓸어올리기로 빠져나와도 따라온다 */
export function useIsFullscreen(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(isFullscreen());
    sync();
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('webkitfullscreenchange', sync);
    return () => {
      document.removeEventListener('fullscreenchange', sync);
      document.removeEventListener('webkitfullscreenchange', sync);
    };
  }, []);
  return on;
}

/**
 * 실제로 보이는 화면 높이를 `--app-h`(px)로 :root에 적는다 — layout.tsx의 인라인 스크립트(같은 일을 하는 문자열)가
 * 첫 페인트 전에 한 번 적고, 이 함수가 크기가 바뀔 때마다 다시 적는다.
 *
 * 왜 `100vh`/`svh`/`dvh`를 그대로 쓰지 않나 — 폰 브라우저의 `100vh`는 "바가 모두 숨었을 때" 높이라,
 * 이 게임처럼 문서 스크롤을 잠근(그래서 바가 영영 안 숨는) 화면에서는 아래가 하단 바 밑으로 들어간다.
 * 앱 안 브라우저(네이버 앱 등)는 svh · dvh를 모르는 옛 웹뷰이기도 하다. `innerHeight`는 어디서나 "지금 보이는
 * 높이"다. 데스크톱에서는 innerHeight = 100vh라 값이 그대로다.
 * (visualViewport가 아니라 innerHeight인 이유: 두 손가락 확대에 따라 출렁이지 않게.)
 */
export function syncAppHeight(): void {
  document.documentElement.style.setProperty('--app-h', `${window.innerHeight}px`);
}
