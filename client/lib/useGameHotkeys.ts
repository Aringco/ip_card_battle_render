'use client';

import { useEffect } from 'react';
import { ignoreHotkey } from './hotkeys';

// 단축키(자판 위치 e.code) → 순번. 장소는 화면에서 왼쪽→오른쪽, 위→아래 순, 기술은 카드 띠의 왼쪽부터.
const PLACE_KEYS: Record<string, number> = {
  Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3,
};
const SKILL_KEYS: Record<string, number> = { KeyQ: 0, KeyW: 1, KeyE: 2, KeyR: 3 };
const PASS_KEYS = new Set(['Space', 'KeyT']);
const PASS_INDEX = 4; // 기술 카드 띠의 다섯 번째 칸 = [턴 마치기]

/**
 * 게임 화면 단축키 — 모든 판(팀전·혼자 놀기·개인전) 공통(2026-10-28 — 그 전에는 개인전에만 있었다).
 * 장소 1~4 · 기술 Q·W·E·R · 턴 마치기 스페이스 / T. 감정표현 키(I·A·S·D·F)는 감정표현이 있는 개인전에서 EmotePicker가 따로 듣는다.
 *
 * 마우스가 누르는 **그 버튼을 그대로 누른다** — 지금 누를 수 있는지(내 차례·레벨·쿨타임·한 우물·연출 중)를 화면과 따로 판정하면
 * 언젠가 어긋난다. 누를 수 없는 버튼은 disabled라 click()이 먹지 않는다.
 *
 * `disabled`면 아무 키도 받지 않는다 — 멈춤, 개인전의 특허랑이 대상 고르기(숫자 키를 따로 쓴다), **시연**(스페이스·1·2·3이 대본 진행 키다),
 * 목표점수 달성하기의 시작 룰렛. 멈춤 메뉴(.pause-dim)가 열려 있을 때도 받지 않는다(메뉴 뒤에서 판이 움직인다).
 */
export function useGameHotkeys(disabled: boolean): void {
  useEffect(() => {
    if (disabled) return;
    const blocked = () => !!document.querySelector('.pause-dim');
    const onKey = (e: KeyboardEvent) => {
      if (ignoreHotkey(e) || blocked()) return;
      if (e.code in PLACE_KEYS) {
        const tiles = [...document.querySelectorAll<HTMLButtonElement>('button[data-place-key]')]
          .map(b => ({ b, r: b.getBoundingClientRect() }))
          // 위→아래(같은 줄로 볼 만큼 가까우면 같은 줄), 그 안에서 왼쪽→오른쪽
          .sort((p, q) => (Math.abs(p.r.top - q.r.top) > 8 ? p.r.top - q.r.top : p.r.left - q.r.left));
        tiles[PLACE_KEYS[e.code]]?.b.click();
        e.preventDefault();
        return;
      }
      const cards = document.querySelectorAll<HTMLButtonElement>('.play-cards-grid button.skill-choice-panel');
      if (e.code in SKILL_KEYS) {
        cards[SKILL_KEYS[e.code]]?.click();
        e.preventDefault();
        return;
      }
      if (PASS_KEYS.has(e.code)) {
        // 스페이스는 늘 막는다 — 안 막으면 화면이 스크롤되거나, 방금 누른 버튼(예: 감정표현)에 포커스가 남아 그 버튼이 또 눌린다.
        e.preventDefault();
        cards[PASS_INDEX]?.click();
      }
    };
    // 버튼의 스페이스 클릭은 keyup에서 일어난다 — 그쪽도 막아야 포커스가 남은 버튼이 눌리지 않는다.
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !ignoreHotkey(e) && !blocked()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [disabled]);
}
