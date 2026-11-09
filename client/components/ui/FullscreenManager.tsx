'use client';

import { useEffect, useState } from 'react';
import {
  chromeIntentUrl,
  enterFullscreen,
  fullscreenSupported,
  inAppBrowserName,
  isAndroid,
  isFullscreen,
  isIosPhone,
  isStandaloneApp,
  isTouchDevice,
  lockLandscape,
  syncAppHeight,
} from '@/lib/fullscreen';

const HINT_KEY = 'cardBattle_fullscreenHintDismissed';

type Hint = { kind: 'ios' } | { kind: 'inapp'; name: string; canOpenChrome: boolean };

/**
 * 폰에서 브라우저 바가 화면을 가리지 않게 하는 장치 — layout.tsx에 한 번 둔다.
 *
 * 1. `--app-h`(지금 보이는 높이)를 화면 크기가 바뀔 때마다 다시 잰다(lib/fullscreen.ts의 syncAppHeight).
 *    로비 · 게임 화면의 높이가 이 값을 써서, 바가 남아 있어도 화면 아래가 바 밑으로 들어가지 않는다.
 * 2. **첫 터치 때 전체화면 + 가로 고정**으로 바꾼다. 브라우저는 사용자 동작 없이 허락하지 않아 접속 즉시가 아니다.
 *    `pointerdown`은 터치에서 "사용자 동작"으로 치지 않아 거절되므로 `touchend` · `click`을 듣는다.
 *    한 번 성공한 뒤 사용자가 빠져나오면 다시 강요하지 않는다 — 설정(톱니)의 [전체화면] 버튼으로 다시 켠다.
 * 3. 전체화면이 안 되는 곳에는 안내를 한 번 띄운다 — 아이폰: 홈 화면에 추가 / 네이버 · 카카오톡 등 앱 안
 *    브라우저(위 · 아래 바가 모두 남는다): 안드로이드면 [크롬으로 열기].
 * PC(마우스) · 홈 화면 아이콘으로 연 경우는 2 · 3을 하지 않는다.
 */
export function FullscreenManager() {
  const [hint, setHint] = useState<Hint | null>(null);

  // 테스트 서버 — 홈 화면에 추가할 때 운영 앱과 이름을 가른다(iOS는 이 메타 · 제목을 읽는다. 안드로이드는 app/manifest.ts)
  useEffect(() => {
    if (!location.hostname.startsWith('test.')) return;
    document.title = 'TUPD-test';
    document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', 'TUPD-test');
  }, []);

  // 1 — 보이는 높이
  useEffect(() => {
    syncAppHeight();
    window.addEventListener('resize', syncAppHeight);
    window.addEventListener('orientationchange', syncAppHeight);
    document.addEventListener('fullscreenchange', syncAppHeight);
    return () => {
      window.removeEventListener('resize', syncAppHeight);
      window.removeEventListener('orientationchange', syncAppHeight);
      document.removeEventListener('fullscreenchange', syncAppHeight);
    };
  }, []);

  // 2 · 3 — 첫 터치 전체화면 / 안 되면 안내
  useEffect(() => {
    if (!isTouchDevice() || isStandaloneApp()) return;

    let dismissed = false;
    try {
      dismissed = localStorage.getItem(HINT_KEY) === '1';
    } catch {
      /* 사생활 보호 모드 */
    }
    const inApp = inAppBrowserName();
    const fallbackHint = (): Hint | null => {
      if (dismissed) return null;
      if (inApp) return { kind: 'inapp', name: inApp, canOpenChrome: isAndroid() };
      if (isIosPhone()) return { kind: 'ios' };
      return null;
    };

    if (!fullscreenSupported()) {
      // setState를 이펙트 본문에서 곧바로 부르지 않는다(첫 커밋 뒤 한 박자 늦게) — 서버 렌더와 어긋나지 않게
      const t = window.setTimeout(() => setHint(fallbackHint()), 0);
      return () => window.clearTimeout(t);
    }

    let busy = false;
    let wasFull = false;
    const remove = () => {
      window.removeEventListener('touchend', onGesture, true);
      window.removeEventListener('click', onGesture, true);
    };
    const arm = () => {
      busy = false;
      window.addEventListener('touchend', onGesture, true);
      window.addEventListener('click', onGesture, true);
    };
    function onGesture() {
      if (busy || isFullscreen()) return;
      busy = true;
      void enterFullscreen().then(ok => {
        remove(); // 성공이든 거절이든 자동 시도는 한 번만 — 거절되는 곳에서 매 터치마다 다시 묻지 않는다
        // 전체화면이 되면 가로로 돌려 고정한다(2026-11-06 — 예전에는 세로로 들고 있으면 세로 전체화면으로 잡혔다).
        // 안드로이드 크롬 · 삼성 인터넷만 되고(전체화면일 때만 허락), 아이폰은 이 기능이 없다.
        if (ok) {
          wasFull = true;
          void lockLandscape();
        } else setHint(fallbackHint());
      });
    }
    // 다른 앱(카카오톡 등)에 다녀오면 브라우저가 전체화면을 스스로 푼다 — 전체화면이었던 사람에게만, 돌아온 뒤 첫 터치에 한 번 더 건다.
    // (스스로 뒤로가기로 빠져나온 경우는 화면이 가려지지 않으니 다시 걸지 않는다.)
    const onVisible = () => {
      if (document.visibilityState === 'visible' && wasFull && !isFullscreen()) arm();
    };
    document.addEventListener('visibilitychange', onVisible);
    arm();
    return () => {
      remove();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!hint) return null;

  const close = () => {
    setHint(null);
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* 저장 못 해도 이번에는 닫힌다 */
    }
  };

  return (
    <div
      role="status"
      className="fixed left-1/2 top-2 z-[100] -translate-x-1/2 flex items-center gap-2 max-w-[94vw] rounded-xl bg-black/80 px-3 py-2 text-xs text-white shadow-lg"
    >
      {hint.kind === 'ios' ? (
        <span>
          아래 <b>공유</b> 버튼 → <b>홈 화면에 추가</b>로 열면 주소창 없이 전체화면으로 즐길 수 있어요
        </span>
      ) : (
        <span>
          {hint.name} 안에서는 위 · 아래 바가 화면을 가려요.{' '}
          {hint.canOpenChrome ? '크롬에서 열면 전체화면으로 즐길 수 있어요' : '사파리 등 브라우저에서 열어 주세요'}
        </span>
      )}
      {hint.kind === 'inapp' && hint.canOpenChrome && (
        <a href={chromeIntentUrl()} className="shrink-0 rounded-md bg-jungle-600 px-2 py-1 font-semibold">
          크롬으로 열기
        </a>
      )}
      <button type="button" onClick={close} aria-label="안내 닫기" className="shrink-0 px-1.5 text-base leading-none">
        ✕
      </button>
    </div>
  );
}
