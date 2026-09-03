'use client';

import { NICKNAME_MAX_LEN, TEAM_NAME_MAX_LEN, randomNickname, randomTeamName } from 'shared';
import { Field } from './Field';

/**
 * 무작위 이름 뽑기 버튼 — 누르면 입력창에 새 이름을 바로 써넣는다(이미 입력한 글자가
 * 있어도 덮어쓴다. "다시 뽑는다"는 뜻이 그쪽이 자연스러워서다).
 *
 * 로비 폼은 안전영역 안 고정 높이 박스라 세로로 늘어날 수 없다 — 그래서 버튼을 입력창
 * **옆에** 두고(`self-stretch`로 높이를 입력창에 맞춘다), 문구 없이 주사위 하나만 둔다.
 */
function DiceButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="shrink-0 self-stretch px-2 rounded-lg border border-jungle-200 bg-jungle-50
                 hover:bg-jungle-100 active:scale-95 transition text-base leading-none"
    >
      🎲
    </button>
  );
}

/**
 * 닉네임 입력창 — 비워두면 placeholder에 떠 있는 무작위 이름이 그대로 쓰인다.
 *
 * `hint`가 빈 문자열인 첫 렌더에는 고정 문구로 폴백한다. 무작위 이름을 마운트 뒤에
 * 만드는 이유(hydration 경고)는 page.tsx의 nicknameHint 주석에 있다.
 */
export function NicknameField({
  inputRef,
  nickname,
  onChange,
  hint,
  label = '닉네임 (비우면 무작위)',
}: {
  inputRef?: React.Ref<HTMLInputElement>;
  nickname: string;
  onChange: (v: string) => void;
  hint: string;
  label?: string;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-1.5 items-center">
        <input
          ref={inputRef}
          type="text"
          value={nickname}
          onChange={e => onChange(e.target.value)}
          placeholder={hint || '닉네임 입력'}
          maxLength={NICKNAME_MAX_LEN}
          className="input-base min-w-0"
        />
        <DiceButton onClick={() => onChange(randomNickname())} title="닉네임 무작위로 뽑기" />
      </div>
    </Field>
  );
}

/**
 * 팀 이름 입력창. `avoid`(상대 팀에 적힌 이름)와 겹치지 않는 이름만 뽑아주므로,
 * 주사위를 눌러서 두 팀 이름이 같아지는 일은 생기지 않는다.
 */
export function TeamNameField({
  label,
  value,
  onChange,
  avoid,
  invalid = false,
  placeholder = '비우면 무작위',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  avoid: string;
  /** 이 칸이 문제의 원인임을 붉은 테두리로 표시 — 무엇이 잘못됐는지는 카드 설명 줄이 말한다 */
  invalid?: boolean;
  placeholder?: string;
}) {
  return (
    <Field label={label}>
      <div className="flex gap-1.5 items-center">
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          maxLength={TEAM_NAME_MAX_LEN}
          aria-invalid={invalid}
          // ring으로 두껍게 보이게 한다 — border-width를 키우면 입력창이 2px 높아져
          // 폼 전체 높이가 밀린다(좁은 화면에서는 그 2px이 스크롤바가 된다)
          className={`input-base min-w-0 ${invalid ? '!border-red-400 ring-1 ring-red-400' : ''}`}
        />
        <DiceButton
          onClick={() => onChange(randomTeamName(avoid.trim() || null))}
          title="팀 이름 무작위로 뽑기"
        />
      </div>
    </Field>
  );
}
