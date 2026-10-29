'use client';

/**
 * 제목 줄 오른쪽의 두 갈래 토글 — 개인전 방 만들기의 **일반 / 강화**(2026-10-30).
 *
 * 처음에는 방 만들기 폼의 **팀전 / 개인전** 토글(GameModeSelect)이었다. 방 종류는 이제 방 만들기를 누르면 드러나는 두 패널에서
 * 고르고, 이 모양은 개인전 폼의 규칙 고르기로 옮겨 왔다("현재 팀전 개인전 나뉜 버튼의 형태와 같이" — 요청 원문).
 *
 * ⚠️ 이 토글은 **폼 제목 줄 오른쪽**(FormCard의 headerAside)에 앉는다. 처음에는 "자리 선택" 위에
 * 한 줄로 넣었는데, 방 만들기 폼이 position:absolute라 팀전 상태가 53~58px 넘쳤다 — 접힌 폼은
 * 스크롤이 잠겨 있어서 넘치면 [게임 규칙] 펼치기 버튼이 잘려 규칙을 열 방법이 사라진다.
 * 새 줄을 만드는 위치로 옮기지 말 것. 설명 문구를 덧붙이지 말고 폼의 설명 줄(description)을 갈아끼운다.
 */
export function ModeToggle<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  /** 묶음의 이름(화면 읽기 프로그램용) */
  label: string;
}) {
  return (
    <div className="mode-toggle" role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className="mode-toggle-button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
