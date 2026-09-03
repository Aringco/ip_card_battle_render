'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'cardBattle_settingsHintShown';
const REPEAT_AUTO_CLOSE_MS = 10000;

// 게임 화면이 뜰 때마다(=이 컴포넌트가 새로 마운트될 때마다), 우측 하단 설정(⚙️) 버튼
// 위에 "가이드, 소리, 글씨 조절 가능!"을 보여준다.
//
// - 이 브라우저에서 처음 보는 거라면(localStorage에 기록이 없으면): 자동으로는 안
//   사라지고 닫기(✕)를 눌러야만 닫힌다 — 처음 온 사람이 확실히 읽고 넘어가게 하기 위함.
// - 그 뒤로는(이미 한 번이라도 닫아본 적 있으면): 게임을 새로 시작할 때마다 다시
//   뜨되, 10초 후 자동으로 사라진다(물론 ✕로 더 일찍 닫을 수도 있다).
//
// 한 PC를 여러 사람이 돌아가며 쓰는 경우("한 PC로 여러명이 할 수도 있거든")를 감안한
// 설계다 — 완전히 한 번만 보여주면 두 번째 사람부터는 이 버튼의 존재를 영영 모르고
// 지나칠 수 있어서, 매 게임 짧게라도 다시 알려준다.
export function SettingsHintPopup() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setVisible(true);
    const seenBefore = window.localStorage.getItem(STORAGE_KEY) === '1';
    if (!seenBefore) return; // 처음엔 타이머 없이 닫기 전까지 계속 떠 있는다.
    const t = setTimeout(() => setVisible(false), REPEAT_AUTO_CLOSE_MS);
    return () => clearTimeout(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, '1');
    }
  };

  if (!visible) return null;

  return (
    <div className="settings-hint-popup" role="status">
      <button onClick={handleClose} aria-label="안내 닫기" className="settings-hint-close">
        ✕
      </button>
      <p className="settings-hint-text">⚙️ 가이드, 소리, 글씨 조절 가능!</p>
      <span className="settings-hint-arrow" aria-hidden />
    </div>
  );
}
