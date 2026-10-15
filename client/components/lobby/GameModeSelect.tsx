'use client';

import type { GameMode } from 'shared';

const MODES: Array<{ mode: GameMode; label: string }> = [
  { mode: 'team', label: '팀전' },
  { mode: 'individual', label: '개인전' },
];

/**
 * 방 종류 선택 — 팀전 / 개인전.
 *
 * 팀전은 지금까지의 방식(두 팀, 팀마다 여러 명) 그대로이고, 개인전은 최대 8명이 각자 겨뤄
 * 1위부터 순위를 매기는 순위전이다(INDIVIDUAL_MODE_ROADMAP.md).
 *
 * ⚠️ 이 토글은 **폼 제목 줄 오른쪽**(FormCard의 headerAside)에 앉는다. 처음에는 "자리 선택" 위에
 * 한 줄로 넣었는데, 방 만들기 폼이 position:absolute라 팀전 상태가 53~58px 넘쳤다 — 접힌 폼은
 * 스크롤이 잠겨 있어서 넘치면 [게임 규칙] 펼치기 버튼이 잘려 규칙을 열 방법이 사라진다.
 * 새 줄을 만드는 위치로 옮기지 말 것. 설명 문구를 덧붙이지 말고 폼의 설명 줄(description)을 갈아끼운다.
 */
export function GameModeSelect({ mode, onChange }: { mode: GameMode; onChange: (m: GameMode) => void }) {
  return (
    <div className="mode-toggle" role="group" aria-label="방 종류">
      {MODES.map(m => (
        <button
          key={m.mode}
          type="button"
          onClick={() => onChange(m.mode)}
          aria-pressed={mode === m.mode}
          className="mode-toggle-button"
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
