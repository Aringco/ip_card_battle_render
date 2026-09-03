'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'cardBattle_settingsHintShown';
const AUTO_CLOSE_MS = 30000;

// 게임 화면이 처음 뜨는 순간(이 컴포넌트가 마운트되는 순간), 우측 하단 설정(⚙️) 버튼
// 위에 "가이드, 소리, 글씨 조절 가능!"을 30초간 보여준다. 브라우저에 한 번 본 기록을
// 남겨(localStorage) 다음 게임부터는 다시 뜨지 않는다 — 매번 뜨면 오히려 거슬린다.
// 닫기(✕) 버튼으로 30초를 다 기다리지 않고 바로 닫을 수도 있다.
export function SettingsHintPopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(STORAGE_KEY) === '1') return;
    window.localStorage.setItem(STORAGE_KEY, '1');
    setVisible(true);
    const t = setTimeout(() => setVisible(false), AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="settings-hint-popup" role="status">
      <button onClick={() => setVisible(false)} aria-label="안내 닫기" className="settings-hint-close">
        ✕
      </button>
      <p className="settings-hint-text">⚙️ 가이드, 소리, 글씨 조절 가능!</p>
      <span className="settings-hint-arrow" aria-hidden />
    </div>
  );
}
