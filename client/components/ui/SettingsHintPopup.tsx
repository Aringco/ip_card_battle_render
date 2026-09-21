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
//
// ⚠️ **어느 경우든 한 바퀴가 돌면 사라진다**(요청). 선공·후공이 한 번씩 두고 나면
// 게임에 몰입할 때라, 그 뒤로도 떠 있으면 설정 버튼만 가린다. `turn`이 그 단위다 —
// 서버의 advanceTurn이 **후공 팀의 차례가 끝날 때만** 이 값을 올리므로, 2가 되는
// 순간이 곧 "양 팀이 한 번씩 뒀다"이다.
export function SettingsHintPopup({ turn }: { turn: number }) {
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

  // ⚠️ 여기서 localStorage에 표시를 남기지 **않는다.** 그 기록의 뜻은 "이 사람이
  // 안내를 닫아 본 적이 있다"이고, 그래야 다음 게임부터 10초 자동 닫기로 짧게만
  // 알린다. 스스로 사라진 것을 "읽었다"로 치면, 처음 온 사람이 미처 못 읽고
  // 넘어간 채로 그 짧은 안내만 받게 된다.
  if (!visible || turn >= 2) return null;

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
