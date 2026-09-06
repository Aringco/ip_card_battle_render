'use client';

import type { Seat } from 'shared';
import { SEATS } from 'shared';
import { seatLabel } from '@/lib/seatInfo';
import { Field } from './Field';

/**
 * 자리 선택 — 팀 1 / 팀 2 / 관전자.
 *
 * 이름과 배지는 `@/lib/seatInfo`가 한 곳에서 정한다. 대기실도 같은 값을 쓰므로,
 * "방 만들 때 고른 자리"와 "대기실에 앉아 있는 자리"가 같은 말로 보인다.
 *
 * 관전자를 고르면 무슨 뜻인지 알려야 하지만, 그 안내를 **여기 아래에 붙이지 않는다.**
 * 폼은 절대배치라 한 줄만 늘어도 좁은 화면에서 스크롤바가 생긴다(실측: 붙였더니
 * 1280×900에서 534→560px). 안내는 폼 카드의 설명 줄을 갈아끼워 보여준다 —
 * CreateRoomForm·JoinRoomForm의 `description` 참고.
 *
 * 버튼이 셋이 되면서 `whitespace-nowrap`이 필수가 됐다. 규칙을 펼치면 이 줄이 2열의
 * 왼쪽(약 240px)에 들어가는데, 그대로 두면 "관전자"가 "관전 / 자"로 접혀 줄 높이가
 * 27px 늘어난다(실측: create+rules 486→513px).
 */
export function TeamSelect({ team, onChange }: { team: Seat; onChange: (t: Seat) => void }) {
  return (
    <Field label="자리 선택">
      <div className="flex gap-1.5">
        {SEATS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onChange(t)}
            className={`flex-1 px-1 py-2 rounded-lg font-semibold transition text-sm whitespace-nowrap ${
              team === t
                ? 'bg-jungle-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 ring-1 ring-gray-300'
            }`}
          >
            {seatLabel(t)}
          </button>
        ))}
      </div>
    </Field>
  );
}
