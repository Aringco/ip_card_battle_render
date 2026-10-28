/**
 * 게임 화면 단축키 공통 규칙(모든 판 — useGameHotkeys의 장소·기술·턴 마치기 키, 개인전 EmotePicker의 감정표현 키).
 *
 * 키는 `e.key`가 아니라 **`e.code`(자판 위치)**로 가른다 — 한글 입력 상태에서는 Q를 눌러도 `e.key`가 'ㅂ'이라
 * 글자로 비교하면 한/영 상태에 따라 단축키가 먹다 말다 한다.
 */

/** 단축키로 처리하지 않을 누름 — 글자를 치는 중이거나, 꾹 눌러 반복되거나, Ctrl·Alt·⌘ 조합(브라우저 단축키)이면 건드리지 않는다. */
export function ignoreHotkey(e: KeyboardEvent): boolean {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return true;
  const t = e.target;
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT';
}
